/**
 * Phase 1 Tests — Elasticsearch setup, indices, and ingest pipeline.
 * Targets ES 9.x: uses indices.get() instead of deprecated indices.exists().
 *
 * Prerequisites:
 *   - Elasticsearch 9.x cluster running and accessible
 *   - ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY set in .env
 *   - Run `node server/setup/createIndices.js` first
 *
 * Usage: node tests/phase1.test.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const esClient = require("../server/config/elasticsearch");
const { INDEX_DEFINITIONS, indexExists } = require("../server/setup/createIndices");
const elasticService = require("../server/services/elasticService");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function testClusterConnection() {
  console.log("\n--- Test: Cluster Connection ---");
  const info = await esClient.info();
  assert(!!info.version, `Connected to ES ${info.version.number}`);
  assert(
    info.version.number.startsWith("9."),
    `Cluster is running ES 9.x (got ${info.version.number})`
  );
}

async function testIndicesExist() {
  console.log("\n--- Test: All Indices Exist (using indices.get) ---");
  for (const name of Object.keys(INDEX_DEFINITIONS)) {
    // ES 9.x: indices.exists() is deprecated, use indices.get() with 404 check
    const exists = await indexExists(name);
    assert(exists, `Index "${name}" exists`);
  }
}

async function testIndexMappings() {
  console.log("\n--- Test: Index Mappings ---");
  for (const [name, definition] of Object.entries(INDEX_DEFINITIONS)) {
    try {
      const response = await esClient.indices.get({ index: name });
      const mapping = response[name]?.mappings;
      assert(!!mapping, `Index "${name}" has mappings`);

      // Verify expected fields exist
      const expectedFields = Object.keys(definition.mappings.properties);
      const actualFields = Object.keys(mapping.properties || {});
      for (const field of expectedFields) {
        assert(
          actualFields.includes(field),
          `  "${name}" has field "${field}"`
        );
      }
    } catch (e) {
      assert(false, `Index "${name}" mapping check failed: ${e.message}`);
    }
  }
}

async function testInferenceEndpoint() {
  console.log("\n--- Test: Jina Inference Endpoint ---");
  try {
    const endpoint = await esClient.inference.get({
      inference_id: "jina-embeddings",
    });
    assert(!!endpoint, 'Inference endpoint "jina-embeddings" exists');
  } catch (e) {
    if (e.meta?.statusCode === 404) {
      assert(false, 'Inference endpoint "jina-embeddings" not found (JINA_API_KEY may not be set)');
    } else {
      assert(false, `Inference endpoint check failed: ${e.message}`);
    }
  }
}

async function testIngestPipeline() {
  console.log("\n--- Test: Ingest Pipeline ---");
  try {
    const pipeline = await esClient.ingest.getPipeline({
      id: "patient-doc-pipeline",
    });
    assert(!!pipeline, 'Ingest pipeline "patient-doc-pipeline" exists');
  } catch (e) {
    if (e.meta?.statusCode === 404) {
      assert(false, 'Ingest pipeline "patient-doc-pipeline" not found');
    } else {
      assert(false, `Pipeline check failed: ${e.message}`);
    }
  }
}

async function testIndexDocument() {
  console.log("\n--- Test: Index a Patient Document ---");
  try {
    const result = await elasticService.indexPatientDocument({
      patientId: "test-patient-001",
      docType: "discharge_notes",
      content: "Patient underwent ACL reconstruction. Post-op day 1: stable vitals, minimal swelling.",
    });
    assert(!!result._id, `Document indexed with ID: ${result._id}`);

    // Wait for ES to index
    await esClient.indices.refresh({ index: "patient_documents" });

    const docs = await elasticService.getPatientDocuments("test-patient-001");
    assert(docs.length > 0, `Retrieved ${docs.length} document(s) for test patient`);
    assert(
      docs[0].patient_id === "test-patient-001",
      "Document has correct patient_id"
    );
  } catch (e) {
    assert(false, `Index document failed: ${e.message}`);
  }
}

async function testIndexCarePlan() {
  console.log("\n--- Test: Index a Care Plan ---");
  try {
    const result = await elasticService.indexCarePlan({
      patient_id: "test-patient-001",
      patient_name: "Test Patient",
      phone_number: "+14155550000",
      surgery_type: "ACL reconstruction",
      surgery_date: "2026-02-11",
      monitor_items: ["wound healing", "pain level", "mobility"],
      check_in_questions: ["How is your pain?", "Can you bend your knee?"],
      call_frequency: "daily",
      next_call_date: new Date().toISOString(),
    });
    assert(!!result._id, `Care plan indexed with ID: ${result._id}`);

    await esClient.indices.refresh({ index: "care_plans" });

    const carePlan = await elasticService.getCarePlan("test-patient-001");
    assert(!!carePlan, "Care plan retrieved");
    assert(
      carePlan.patient_id === "test-patient-001",
      "Care plan has correct patient_id"
    );
  } catch (e) {
    assert(false, `Index care plan failed: ${e.message}`);
  }
}

async function cleanup() {
  console.log("\n--- Cleanup: Remove test data ---");
  try {
    await esClient.deleteByQuery({
      index: "patient_documents",
      query: { term: { patient_id: "test-patient-001" } },
    });
    await esClient.deleteByQuery({
      index: "care_plans",
      query: { term: { patient_id: "test-patient-001" } },
    });
    console.log("  Cleaned up test data.");
  } catch (e) {
    console.log(`  Cleanup note: ${e.message}`);
  }
}

async function run() {
  console.log("=== CareLink Phase 1 Tests (ES 9.x) ===");

  try {
    await testClusterConnection();
    await testIndicesExist();
    await testIndexMappings();
    await testInferenceEndpoint();
    await testIngestPipeline();
    await testIndexDocument();
    await testIndexCarePlan();
    await cleanup();
  } catch (err) {
    console.error("\nFatal error:", err.message || err);
    failed++;
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
