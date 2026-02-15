/**
 * AI service — calls the Elastic Agent Builder (Kibana).
 *
 * Environment variables:
 *   KIBANA                    – Kibana base URL (no trailing slash)
 *   ELASTICSEARCH_API_KEY     – API key with read_agent_builder (Elastic Cloud → Security → API Keys)
 *   AGENT_BUILDER_AGENT_ID    – Agent ID from Kibana Settings (default: clinician-chatbot)
 *   KIBANA_SPACE              – Optional; if using a space: default | marketing etc. Path becomes /s/{space}/api/...
 */

const KIBANA_URL = (process.env.KIBANA || "").replace(/\/$/, "");
const API_KEY = process.env.ELASTICSEARCH_API_KEY;
const AGENT_ID = process.env.AGENT_BUILDER_AGENT_ID || "clinician-chatbot";
const SPACE = process.env.KIBANA_SPACE; // e.g. "default" → /s/default/api/agent_builder/converse
const API_BASE = SPACE ? `${KIBANA_URL}/s/${encodeURIComponent(SPACE)}` : KIBANA_URL;

/**
 * Send a message to the Agent Builder converse endpoint.
 * Returns { conversation_id, response }.
 */
export async function converse(message, conversationId) {
  const body = {
    input: message,
    agent_id: AGENT_ID,
  };
  if (conversationId) {
    body.conversation_id = conversationId;
  }

  const res = await fetch(`${API_BASE}/api/agent_builder/converse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${API_KEY}`,
      "kbn-xsrf": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent Builder error ${res.status}: ${text}`);
  }

  const data = await res.json();

  return {
    conversation_id: data.conversation_id,
    response: data.response?.message || "",
  };
}

export function isConfigured() {
  return !!(KIBANA_URL && API_KEY);
}
