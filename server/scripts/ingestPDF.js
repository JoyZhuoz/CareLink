/**
 * PDF Chunking & Ingest Script
 *
 * Reads a PDF file, extracts text, splits into chunks, and indexes each chunk
 * into the `patient_documents` Elasticsearch index with semantic_text embedding.
 *
 * Usage:
 *   node server/scripts/ingestPDF.js <pdf-path> <patient-id> [options]
 *
 * Options:
 *   --doc-type <type>       Document type label (default: "pdf_document")
 *   --chunk-size <n>        Target chunk size in characters (default: 1500)
 *   --chunk-overlap <n>     Overlap between chunks in characters (default: 200)
 *   --dry-run               Print chunks without indexing
 *
 * Examples:
 *   node server/scripts/ingestPDF.js ./data/discharge.pdf P001
 *   node server/scripts/ingestPDF.js ./data/report.pdf P002 --doc-type medical_report --chunk-size 1000
 *   node server/scripts/ingestPDF.js ./data/notes.pdf P003 --dry-run
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const pdfParse = require("pdf-parse");
const esClient = require("../config/elasticsearch");

// ─── Recursive text splitter ────────────────────────────────────────

const SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

function splitText(text, chunkSize, chunkOverlap, separators = SEPARATORS) {
  const chunks = [];
  const sep = separators.find((s) => (s === "" ? true : text.includes(s)));

  const parts = sep === "" ? [...text] : text.split(sep);
  let current = [];
  let currentLen = 0;

  for (const part of parts) {
    const partWithSep = sep === "" ? part : part + sep;
    if (currentLen + partWithSep.length > chunkSize && current.length > 0) {
      const chunk = current.join(sep === "" ? "" : sep).trim();
      if (chunk.length > 0) {
        // If chunk is still too large, recursively split with next separator
        if (chunk.length > chunkSize * 1.5 && separators.indexOf(sep) < separators.length - 1) {
          chunks.push(...splitText(chunk, chunkSize, chunkOverlap, separators.slice(separators.indexOf(sep) + 1)));
        } else {
          chunks.push(chunk);
        }
      }

      // Keep overlap by retaining trailing parts
      const overlapParts = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const pLen = current[i].length + (sep === "" ? 0 : sep.length);
        if (overlapLen + pLen > chunkOverlap) break;
        overlapParts.unshift(current[i]);
        overlapLen += pLen;
      }
      current = [...overlapParts, part];
      currentLen = overlapLen + partWithSep.length;
    } else {
      current.push(part);
      currentLen += partWithSep.length;
    }
  }

  // Flush remaining
  const lastChunk = current.join(sep === "" ? "" : sep).trim();
  if (lastChunk.length > 0) {
    chunks.push(lastChunk);
  }

  return chunks;
}

// ─── CLI argument parsing ───────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    console.log(`Usage: node server/scripts/ingestPDF.js <pdf-path> <patient-id> [options]

Options:
  --doc-type <type>       Document type label (default: "pdf_document")
  --chunk-size <n>        Target chunk size in characters (default: 1500)
  --chunk-overlap <n>     Overlap between chunks in characters (default: 200)
  --dry-run               Print chunks without indexing`);
    process.exit(0);
  }

  const config = {
    pdfPath: path.resolve(args[0]),
    patientId: args[1],
    docType: "pdf_document",
    chunkSize: 1500,
    chunkOverlap: 200,
    dryRun: false,
  };

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--doc-type":
        config.docType = args[++i];
        break;
      case "--chunk-size":
        config.chunkSize = parseInt(args[++i], 10);
        break;
      case "--chunk-overlap":
        config.chunkOverlap = parseInt(args[++i], 10);
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
    }
  }

  return config;
}

// ─── Main ───────────────────────────────────────────────────────────

async function ingestPDF(config) {
  const { pdfPath, patientId, docType, chunkSize, chunkOverlap, dryRun } = config;

  // 1. Read and parse PDF
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`File not found: ${pdfPath}`);
  }

  console.log(`Reading PDF: ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(pdfBuffer);

  const text = pdfData.text;
  console.log(`Extracted ${text.length} characters from ${pdfData.numpages} pages`);

  if (!text.trim()) {
    throw new Error("No text content extracted from PDF");
  }

  // 2. Chunk the text
  const chunks = splitText(text, chunkSize, chunkOverlap);
  console.log(`Split into ${chunks.length} chunks (size=${chunkSize}, overlap=${chunkOverlap})`);

  if (dryRun) {
    chunks.forEach((chunk, i) => {
      console.log(`\n--- Chunk ${i + 1} (${chunk.length} chars) ---`);
      console.log(chunk.substring(0, 200) + (chunk.length > 200 ? "..." : ""));
    });
    console.log(`\nDry run complete. ${chunks.length} chunks would be indexed.`);
    return { chunks: chunks.length, indexed: 0 };
  }

  // 3. Bulk index into patient_documents
  const fileName = path.basename(pdfPath);
  const ops = chunks.flatMap((chunk, i) => [
    { index: { _index: "patient_documents" } },
    {
      patient_id: patientId,
      doc_type: docType,
      content: chunk,
      raw_text: chunk,
      source_file: fileName,
      chunk_index: i,
      total_chunks: chunks.length,
      uploaded_at: new Date().toISOString(),
    },
  ]);

  console.log(`Indexing ${chunks.length} chunks into patient_documents...`);
  const result = await esClient.bulk({
    operations: ops,
    refresh: "wait_for",
    timeout: "5m",
  });

  if (result.errors) {
    const errs = result.items.filter((item) => item.index?.error);
    console.error(`${errs.length} chunks failed to index:`);
    errs.slice(0, 3).forEach((e) => console.error(`  - ${e.index.error.reason}`));
    throw new Error(`${errs.length}/${chunks.length} chunks failed to index`);
  }

  console.log(`Successfully indexed ${chunks.length} chunks for patient ${patientId}`);
  return { chunks: chunks.length, indexed: chunks.length };
}

// ─── Run ────────────────────────────────────────────────────────────

if (require.main === module) {
  const config = parseArgs();
  ingestPDF(config)
    .then((result) => {
      console.log("\nDone.", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}

module.exports = { ingestPDF, splitText };
