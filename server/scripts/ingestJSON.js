/**
 * JSON Chunking & Ingest Script
 *
 * Reads a JSON file, extracts content from each record, splits into chunks,
 * and indexes each chunk into the `patient_documents` Elasticsearch index
 * with semantic_text embedding.
 *
 * Supports two JSON formats:
 *   1. Array of objects: [{ "content": "...", "name": "..." }, ...]
 *   2. NDJSON (newline-delimited): one JSON object per line
 *
 * Usage:
 *   node server/scripts/ingestJSON.js <json-path> <patient-id> [options]
 *
 * Options:
 *   --content-key <key>    Field name containing text content (default: "content")
 *   --doc-type <type>      Document type label (default: "json_document")
 *   --chunk-size <n>       Target chunk size in characters (default: 1500)
 *   --chunk-overlap <n>    Overlap between chunks in characters (default: 200)
 *   --metadata <keys>      Comma-separated field names to extract as metadata
 *   --dry-run              Print chunks without indexing
 *
 * Examples:
 *   node server/scripts/ingestJSON.js ./data/docs.json P001
 *   node server/scripts/ingestJSON.js ./data/notes.json P002 --content-key text --doc-type clinical_notes
 *   node server/scripts/ingestJSON.js ./data/records.ndjson P003 --metadata name,category,date
 *   node server/scripts/ingestJSON.js ./data/docs.json P001 --dry-run
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
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
        if (chunk.length > chunkSize * 1.5 && separators.indexOf(sep) < separators.length - 1) {
          chunks.push(...splitText(chunk, chunkSize, chunkOverlap, separators.slice(separators.indexOf(sep) + 1)));
        } else {
          chunks.push(chunk);
        }
      }

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

  const lastChunk = current.join(sep === "" ? "" : sep).trim();
  if (lastChunk.length > 0) {
    chunks.push(lastChunk);
  }

  return chunks;
}

// ─── JSON loading ───────────────────────────────────────────────────

function loadJSON(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").trim();

  // Try parsing as a JSON array first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    // Single object — wrap in array
    return [parsed];
  } catch {
    // Fall through to NDJSON parsing
  }

  // Parse as NDJSON (newline-delimited JSON)
  const records = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch (err) {
      console.warn(`Skipping invalid JSON line: ${trimmed.substring(0, 80)}...`);
    }
  }

  if (records.length === 0) {
    throw new Error("No valid JSON records found in file");
  }

  return records;
}

// ─── CLI argument parsing ───────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    console.log(`Usage: node server/scripts/ingestJSON.js <json-path> <patient-id> [options]

Options:
  --content-key <key>    Field containing text content (default: "content")
  --doc-type <type>      Document type label (default: "json_document")
  --chunk-size <n>       Target chunk size in characters (default: 1500)
  --chunk-overlap <n>    Overlap between chunks in characters (default: 200)
  --metadata <keys>      Comma-separated field names to extract as metadata
  --dry-run              Print chunks without indexing`);
    process.exit(0);
  }

  const config = {
    jsonPath: path.resolve(args[0]),
    patientId: args[1],
    contentKey: "content",
    docType: "json_document",
    chunkSize: 1500,
    chunkOverlap: 200,
    metadataKeys: [],
    dryRun: false,
  };

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case "--content-key":
        config.contentKey = args[++i];
        break;
      case "--doc-type":
        config.docType = args[++i];
        break;
      case "--chunk-size":
        config.chunkSize = parseInt(args[++i], 10);
        break;
      case "--chunk-overlap":
        config.chunkOverlap = parseInt(args[++i], 10);
        break;
      case "--metadata":
        config.metadataKeys = args[++i].split(",").map((k) => k.trim());
        break;
      case "--dry-run":
        config.dryRun = true;
        break;
    }
  }

  return config;
}

// ─── Main ───────────────────────────────────────────────────────────

async function ingestJSON(config) {
  const { jsonPath, patientId, contentKey, docType, chunkSize, chunkOverlap, metadataKeys, dryRun } = config;

  // 1. Load records
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`File not found: ${jsonPath}`);
  }

  console.log(`Loading JSON: ${jsonPath}`);
  const records = loadJSON(jsonPath);
  console.log(`Loaded ${records.length} records`);

  // 2. Extract content and chunk each record
  const allChunks = [];
  let skipped = 0;

  for (let r = 0; r < records.length; r++) {
    const record = records[r];
    const content = record[contentKey];

    if (!content || typeof content !== "string") {
      skipped++;
      continue;
    }

    // Extract metadata from record
    const metadata = {};
    for (const key of metadataKeys) {
      if (record[key] !== undefined) {
        metadata[key] = record[key];
      }
    }

    const chunks = splitText(content, chunkSize, chunkOverlap);
    for (let c = 0; c < chunks.length; c++) {
      allChunks.push({
        text: chunks[c],
        record_index: r,
        chunk_index: c,
        total_chunks: chunks.length,
        metadata,
      });
    }
  }

  console.log(`${records.length - skipped} records produced ${allChunks.length} chunks (${skipped} records skipped — no "${contentKey}" field)`);

  if (dryRun) {
    allChunks.forEach((chunk, i) => {
      const meta = Object.keys(chunk.metadata).length > 0
        ? ` | metadata: ${JSON.stringify(chunk.metadata)}`
        : "";
      console.log(`\n--- Chunk ${i + 1} (record ${chunk.record_index}, ${chunk.text.length} chars${meta}) ---`);
      console.log(chunk.text.substring(0, 200) + (chunk.text.length > 200 ? "..." : ""));
    });
    console.log(`\nDry run complete. ${allChunks.length} chunks would be indexed.`);
    return { records: records.length, chunks: allChunks.length, indexed: 0 };
  }

  // 3. Bulk index into patient_documents
  if (allChunks.length === 0) {
    console.log("No chunks to index.");
    return { records: records.length, chunks: 0, indexed: 0 };
  }

  const fileName = path.basename(jsonPath);
  const ops = allChunks.flatMap((chunk) => [
    { index: { _index: "patient_documents" } },
    {
      patient_id: patientId,
      doc_type: docType,
      content: chunk.text,
      raw_text: chunk.text,
      source_file: fileName,
      record_index: chunk.record_index,
      chunk_index: chunk.chunk_index,
      total_chunks: chunk.total_chunks,
      ...chunk.metadata,
      uploaded_at: new Date().toISOString(),
    },
  ]);

  console.log(`Indexing ${allChunks.length} chunks into patient_documents...`);
  const result = await esClient.bulk({
    operations: ops,
    refresh: "wait_for",
    timeout: "5m",
  });

  if (result.errors) {
    const errs = result.items.filter((item) => item.index?.error);
    console.error(`${errs.length} chunks failed to index:`);
    errs.slice(0, 3).forEach((e) => console.error(`  - ${e.index.error.reason}`));
    throw new Error(`${errs.length}/${allChunks.length} chunks failed to index`);
  }

  console.log(`Successfully indexed ${allChunks.length} chunks for patient ${patientId}`);
  return { records: records.length, chunks: allChunks.length, indexed: allChunks.length };
}

// ─── Run ────────────────────────────────────────────────────────────

if (require.main === module) {
  const config = parseArgs();
  ingestJSON(config)
    .then((result) => {
      console.log("\nDone.", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}

module.exports = { ingestJSON, splitText, loadJSON };
