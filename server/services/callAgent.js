/**
 * AI service — uses ES Inference API (chatCompletionUnified) with RAG retrieval.
 *
 * Flow: Retrieve patient context from ES → Augment system prompt → Generate via ES chat completion.
 *
 * Environment variables:
 *   ELASTICSEARCH_URL, ELASTICSEARCH_API_KEY, ES_CHAT_INFERENCE_ID
 */

const { AGENT_SYSTEM_PROMPT } = require("../setup/createAgent");
const esClient = require("../config/elasticsearch");
const { searchPatientDocuments } = require("./elasticService");

const ES_CHAT_INFERENCE_ID =
  process.env.ES_CHAT_INFERENCE_ID || ".anthropic-claude-4.6-opus-chat_completion";

// ─── RAG retrieval ──────────────────────────────────────────────────

/**
 * Search the `patients` index for a name mentioned in the user message.
 * Returns the first matching patient record, or null.
 */
async function findPatientByMessage(message) {
  try {
    const result = await esClient.search({
      index: "patients",
      query: { match: { name: message } },
      size: 1,
    });
    return result.hits.hits[0]?._source || null;
  } catch {
    return null;
  }
}

/**
 * Retrieve Elasticsearch context for a user message.
 * Steps: find patient by name → fetch semantic docs → fetch care plan.
 */
async function retrieveContext(message) {
  const patient = await findPatientByMessage(message);
  if (!patient) return "";

  const pid = patient.patient_id;
  const sections = [];

  // 1. Patient record
  sections.push(`── Patient Record ──\n${JSON.stringify(patient, null, 2)}`);

  // 2. Semantic document search
  try {
    const docs = await searchPatientDocuments(pid, message);
    if (docs.length > 0) {
      const docsText = docs
        .map((d) => `[${d.doc_type}] ${d.content}`)
        .join("\n");
      sections.push(`── Relevant Documents ──\n${docsText}`);
    }
  } catch {
    // semantic search may not be available; skip
  }

  // 3. Care plan
  try {
    const cpResult = await esClient.search({
      index: "care_plans",
      query: { term: { patient_id: pid } },
      sort: [{ created_at: "desc" }],
      size: 1,
    });
    const carePlan = cpResult.hits.hits[0]?._source;
    if (carePlan) {
      sections.push(`── Care Plan ──\n${JSON.stringify(carePlan, null, 2)}`);
    }
  } catch {
    // index may not exist yet; skip
  }

  if (sections.length === 0) return "";
  return (
    "\n\n=== Retrieved Patient Context ===\n" +
    sections.join("\n\n") +
    "\n=== End Context ===\n"
  );
}

// ─── ES Inference chat completion ───────────────────────────────────

// In-memory conversation store
const conversations = new Map();

/**
 * Parse an SSE stream response from chatCompletionUnified into a single string.
 * The response is an ArrayBuffer containing SSE events in OpenAI format:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 */
function parseSSEResponse(response) {
  const text =
    typeof response === "string"
      ? response
      : Buffer.from(response).toString("utf-8");

  let result = "";
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try {
      const event = JSON.parse(line.slice(6));
      const content = event.choices?.[0]?.delta?.content;
      if (content) result += content;
    } catch {
      // skip malformed lines
    }
  }
  return result;
}

/**
 * Parse the agent's JSON output into { response, internal_analysis }.
 * Falls back gracefully if the output isn't valid JSON.
 */
function parseAgentOutput(raw) {
  const jsonMatch = (raw || "").match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.response) return parsed;
    } catch {
      // fall through
    }
  }
  // Fallback: treat the entire output as the response
  return { response: raw, internal_analysis: "" };
}

/**
 * Store internal analysis in Elasticsearch for clinician review.
 */
async function storeAnalysis(conversationId, message, analysis) {
  if (!analysis) return;
  try {
    await esClient.index({
      index: "clinician_summaries",
      document: {
        conversation_id: conversationId,
        user_message: message,
        internal_analysis: analysis,
        generated_at: new Date().toISOString(),
      },
    });
  } catch {
    // Don't fail the conversation if storage fails
  }
}

/**
 * Send a message through RAG + ES Inference chat completion.
 * Returns { conversation_id, response } with the clean response string.
 * Stores internal_analysis in ES for clinician review.
 */
async function converse(message, conversationId) {
  const convId =
    conversationId ||
    `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // RAG: retrieve relevant patient context from Elasticsearch
  const context = await retrieveContext(message);

  // Get or create conversation history
  let history = conversations.get(convId) || [];
  history.push({ role: "user", content: message });

  const systemPrompt = context
    ? AGENT_SYSTEM_PROMPT + context
    : AGENT_SYSTEM_PROMPT;

  // Build messages array with system prompt + conversation history
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  const sseResponse = await esClient.inference.chatCompletionUnified({
    inference_id: ES_CHAT_INFERENCE_ID,
    chat_completion_request: {
      messages,
      max_completion_tokens: 2048,
    },
  });

  const rawOutput = parseSSEResponse(sseResponse);
  history.push({ role: "assistant", content: rawOutput });
  conversations.set(convId, history);

  // Parse structured output
  const { response, internal_analysis } = parseAgentOutput(rawOutput);

  // Store internal analysis in ES (fire-and-forget)
  storeAnalysis(convId, message, internal_analysis);

  return {
    conversation_id: convId,
    response,
    internal_analysis,
  };
}

/**
 * Retrieve a conversation by ID (in-memory history).
 */
async function getConversation(conversationId) {
  const history = conversations.get(conversationId);
  if (!history) throw new Error(`Conversation ${conversationId} not found`);
  return { conversation_id: conversationId, messages: history };
}

function isConfigured() {
  return !!process.env.ELASTICSEARCH_URL;
}

function getMode() {
  return process.env.ELASTICSEARCH_URL ? "es_inference" : "not_configured";
}

module.exports = {
  isConfigured,
  converse,
  getConversation,
  getMode,
};
