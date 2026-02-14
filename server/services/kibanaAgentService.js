/**
 * Kibana Agent Builder REST API wrapper.
 * Requires Elastic 9.3 Enterprise tier with Agent Builder enabled.
 *
 * Environment variables:
 *   KIBANA_URL          — your Kibana endpoint (e.g. https://deploy.kb.us-central1.gcp.cloud.es.io)
 *   KIBANA_API_KEY      — API key with Agent Builder access
 *   CARELINK_AGENT_ID   — the agent ID created via Kibana or REST API
 */

const KIBANA_URL = process.env.KIBANA_URL;
const KIBANA_API_KEY = process.env.KIBANA_API_KEY;
const CARELINK_AGENT_ID = process.env.CARELINK_AGENT_ID;

function getHeaders() {
  return {
    Authorization: `ApiKey ${KIBANA_API_KEY}`,
    "kbn-xsrf": "true",
    "Content-Type": "application/json",
  };
}

function isConfigured() {
  return !!(KIBANA_URL && KIBANA_API_KEY && CARELINK_AGENT_ID);
}

/**
 * Start a new conversation with the Agent Builder agent.
 */
async function createConversation(message, agentId) {
  const response = await fetch(`${KIBANA_URL}/api/agent_builder/converse`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      agent_id: agentId || CARELINK_AGENT_ID,
      message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent Builder API error ${response.status}: ${body}`);
  }

  return response.json();
}

/**
 * Continue an existing conversation.
 */
async function continueConversation(conversationId, message, agentId) {
  const response = await fetch(`${KIBANA_URL}/api/agent_builder/converse`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      agent_id: agentId || CARELINK_AGENT_ID,
      conversation_id: conversationId,
      message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent Builder API error ${response.status}: ${body}`);
  }

  return response.json();
}

/**
 * Retrieve a conversation by ID.
 */
async function getConversation(conversationId) {
  const response = await fetch(
    `${KIBANA_URL}/api/agent_builder/conversations/${conversationId}`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent Builder API error ${response.status}: ${body}`);
  }

  return response.json();
}

module.exports = {
  isConfigured,
  createConversation,
  continueConversation,
  getConversation,
};
