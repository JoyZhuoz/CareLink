/**
 * AI service — calls the Elastic Agent Builder (Kibana) for the
 * "carelink_clinical" agent.
 *
 * Environment variables:
 *   KIBANA          – Kibana base URL
 *   ELASTICSEARCH_API_KEY – API key (shared with ES / Kibana)
 */

const KIBANA_URL = process.env.KIBANA;
const API_KEY = process.env.ELASTICSEARCH_API_KEY;
const AGENT_ID = "carelink_clinical";

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

  const res = await fetch(`${KIBANA_URL}/api/agent_builder/converse`, {
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
