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
  patients: {
    mappings: {
      dynamic: "true",
      properties: {
        patient_id: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        phone: { type: "keyword" },
        age: { type: "integer" },
        gender: { type: "keyword" },
        surgery_type: { type: "text", fields: { keyword: { type: "keyword" } } },
        surgery_date: { type: "date" },
        risk_factors: { type: "keyword" },
        call_history: { type: "nested", dynamic: true },
        created_at: { type: "date" },
      },
    },
  },
  patient_documents: {
    mappings: {
      properties: {
        patient_id: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        doc_type: { type: "keyword" },
        content: { type: "semantic_text", inference_id: ".jina-embeddings-v3" },
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
        conversation_id: { type: "keyword" },
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

async function verifyInferenceEndpoint() {
  // Use the built-in .multilingual-e5-small-elasticsearch endpoint
  // It's pre-deployed on Elastic Cloud — no creation needed
  const endpointId = ".multilingual-e5-small-elasticsearch";
  try {
    await esClient.inference.get({ task_type: "text_embedding", inference_id: endpointId });
    console.log(`Inference endpoint "${endpointId}" is available (built-in).`);
  } catch (e) {
    console.warn(`Warning: built-in inference endpoint "${endpointId}" not found. semantic_text fields may not work.`);
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

const ES_CHAT_INFERENCE_ID =
  process.env.ES_CHAT_INFERENCE_ID || ".anthropic-claude-4.6-opus-chat_completion";

async function verifyChatEndpoint() {
  try {
    await esClient.inference.get({
      task_type: "chat_completion",
      inference_id: ES_CHAT_INFERENCE_ID,
    });
    console.log(
      `Chat completion endpoint "${ES_CHAT_INFERENCE_ID}" is available.`
    );
  } catch (e) {
    console.warn(
      `Warning: chat completion endpoint "${ES_CHAT_INFERENCE_ID}" not found. AI converse will not work.`
    );
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

    await verifyInferenceEndpoint();
    await verifyChatEndpoint();
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

module.exports = { indexExists, createAllIndices, verifyInferenceEndpoint, verifyChatEndpoint, INDEX_DEFINITIONS };
