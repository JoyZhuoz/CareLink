/**
 * One-time setup script: creates all Elasticsearch indices and inference endpoints.
 * Targets Elasticsearch 9.x — uses indices.get() instead of deprecated indices.exists().
 *
 * Usage: node server/setup/createIndices.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });
const esClient = require("../config/elasticsearch");

const INDEX_DEFINITIONS = {
  patient_documents: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        doc_type: { type: "keyword" },
        content: {
          type: "semantic_text",
          inference_id: "jina-embeddings",
        },
        raw_text: { type: "text" },
        uploaded_at: { type: "date" },
      },
    },
  },
  care_plans: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        patient_name: { type: "text" },
        phone_number: { type: "keyword" },
        surgery_type: { type: "keyword" },
        surgery_date: { type: "date" },
        monitor_items: { type: "text" },
        check_in_questions: { type: "text" },
        call_frequency: { type: "keyword" },
        next_call_date: { type: "date" },
        created_at: { type: "date" },
      },
    },
  },
  medical_references: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        surgery_type: { type: "keyword" },
        recovery_day_range: { type: "keyword" },
        query_used: { type: "text" },
        perplexity_response: { type: "object", enabled: false },
        recovery_milestones: { type: "text" },
        red_flag_symptoms: { type: "text" },
        common_concerns: { type: "text" },
        fetched_at: { type: "date" },
      },
    },
  },
  check_in_calls: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        call_sid: { type: "keyword" },
        transcript: { type: "object", enabled: false },
        questions_asked: { type: "text" },
        questions_skipped: { type: "text" },
        overall_urgency: { type: "keyword" },
        call_duration_seconds: { type: "integer" },
        called_at: { type: "date" },
      },
    },
  },
  clinician_summaries: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        call_id: { type: "keyword" },
        patient_status: { type: "text" },
        normal_findings: { type: "text" },
        concerning_findings: { type: "text" },
        comparison_to_last_call: { type: "text" },
        recommended_action: { type: "keyword" },
        open_questions: { type: "text" },
        priority: { type: "boolean" },
        summary_text: { type: "text" },
        generated_at: { type: "date" },
      },
    },
  },
  call_queue: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        patient_name: { type: "text" },
        phone_number: { type: "keyword" },
        pre_call_briefing: { type: "object", enabled: false },
        medical_reference_used: { type: "keyword" },
        scheduled_at: { type: "date" },
        status: { type: "keyword" },
        call_sid: { type: "keyword" },
        completed_at: { type: "date" },
        retry_count: { type: "integer" },
      },
    },
  },
};

/**
 * ES 9.x compatible index existence check.
 * indices.exists() is deprecated in 9.x — use indices.get() with 404 handling.
 */
async function indexExists(name) {
  try {
    await esClient.indices.get({ index: name });
    return true;
  } catch (e) {
    if (e.meta?.statusCode === 404) return false;
    throw e;
  }
}

async function createInferenceEndpoint() {
  const endpointId = "jina-embeddings";
  try {
    await esClient.inference.get({ inference_id: endpointId });
    console.log(`Inference endpoint "${endpointId}" already exists.`);
  } catch (e) {
    if (e.meta?.statusCode === 404) {
      if (!process.env.JINA_API_KEY) {
        console.warn(
          "JINA_API_KEY not set — skipping inference endpoint creation."
        );
        return;
      }
      await esClient.inference.put({
        inference_id: endpointId,
        inference_config: {
          service: "jinaai",
          service_settings: {
            api_key: process.env.JINA_API_KEY,
            model_id: "jina-embeddings-v3",
            similarity: "cosine",
            dimensions: 1024,
          },
          task_settings: {
            input_type: "ingest",
          },
        },
      });
      console.log(`Created inference endpoint "${endpointId}".`);
    } else {
      throw e;
    }
  }
}

async function createIngestPipeline() {
  const pipelineId = "patient-doc-pipeline";
  try {
    await esClient.ingest.getPipeline({ id: pipelineId });
    console.log(`Ingest pipeline "${pipelineId}" already exists.`);
  } catch (e) {
    if (e.meta?.statusCode === 404) {
      await esClient.ingest.putPipeline({
        id: pipelineId,
        body: {
          description: "Extract text from PDF attachments for patient documents",
          processors: [
            {
              attachment: {
                field: "data",
                target_field: "attachment",
              },
            },
            {
              set: {
                field: "raw_text",
                value: "{{attachment.content}}",
              },
            },
            {
              set: {
                field: "content",
                value: "{{attachment.content}}",
              },
            },
            {
              remove: {
                field: ["data", "attachment"],
              },
            },
          ],
        },
      });
      console.log(`Created ingest pipeline "${pipelineId}".`);
    } else {
      throw e;
    }
  }
}

async function createAllIndices() {
  for (const [name, definition] of Object.entries(INDEX_DEFINITIONS)) {
    const exists = await indexExists(name);
    if (exists) {
      console.log(`Index "${name}" already exists — skipping.`);
      continue;
    }
    await esClient.indices.create({
      index: name,
      ...definition,
    });
    console.log(`Created index "${name}".`);
  }
}

async function run() {
  try {
    const info = await esClient.info();
    console.log(
      `Connected to Elasticsearch ${info.version.number} (${info.cluster_name})`
    );

    await createInferenceEndpoint();
    await createIngestPipeline();
    await createAllIndices();

    console.log("\nSetup complete.");
  } catch (err) {
    console.error("Setup failed:", err.message || err);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  run();
}

module.exports = { indexExists, createAllIndices, createInferenceEndpoint, INDEX_DEFINITIONS };
