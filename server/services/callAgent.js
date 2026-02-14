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
 * Known agent steps — the Agent Builder runs these tools in order.
 * Used to send predictive progress events before the API responds.
 */
export const AGENT_STEPS = [
  { id: "query",   label: "Understanding your query" },
  { id: "search",  label: "Searching patient records" },
  { id: "analyze", label: "Analyzing clinical data" },
  { id: "respond", label: "Generating response" },
];

/**
 * Extract step labels from the Agent Builder response.
 * The response may include tool calls, events, or steps
 * depending on the Kibana version.
 */
export function extractSteps(data) {
  const steps = [];

  // Agent Builder may include events/steps array
  if (data.events && Array.isArray(data.events)) {
    for (const evt of data.events) {
      if (evt.type === "tool_call" || evt.type === "tool_result") {
        steps.push({
          id: evt.tool || evt.name || "tool",
          label: formatToolLabel(evt.tool || evt.name),
          detail: evt.input ? JSON.stringify(evt.input).slice(0, 100) : undefined,
        });
      }
    }
  }

  // Or it may have a steps array
  if (data.steps && Array.isArray(data.steps)) {
    for (const step of data.steps) {
      steps.push({
        id: step.tool || step.type || "step",
        label: formatToolLabel(step.tool || step.type || step.action),
        detail: step.query || step.input || undefined,
      });
    }
  }

  // Or tool_calls on the response object
  if (data.response?.tool_calls && Array.isArray(data.response.tool_calls)) {
    for (const tc of data.response.tool_calls) {
      steps.push({
        id: tc.name || "tool",
        label: formatToolLabel(tc.name),
        detail: tc.arguments ? JSON.stringify(tc.arguments).slice(0, 100) : undefined,
      });
    }
  }

  return steps;
}

function formatToolLabel(toolName) {
  if (!toolName) return "Processing";
  const labels = {
    search_patient_recovery_context: "Retrieving patient recovery context",
    search_similar_patient_cases: "Searching similar patient cases",
    query_patients: "Querying patient database",
    search_patients: "Searching patient records",
  };
  return labels[toolName] || toolName.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Send a message to the Agent Builder converse endpoint.
 * Returns { conversation_id, response, steps, rawData }.
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
  const steps = extractSteps(data);

  return {
    conversation_id: data.conversation_id,
    response: data.response?.message || "",
    steps,
    rawData: data,
  };
}

export function isConfigured() {
  return !!(KIBANA_URL && API_KEY);
}
