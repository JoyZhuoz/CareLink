/**
 * Claude-based chat fallback when Elastic Agent Builder is unavailable (404 or not configured).
 * Uses ANTHROPIC_API_KEY. Returns { conversation_id, response } for compatibility with /api/chat.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_CHAT_MODEL || process.env.CLAUDE_MODEL || "claude-3-5-haiku-20241022";

const SYSTEM = `You are CareLink, an AI clinical assistant for post-surgical patient monitoring.
Answer concisely about patients, symptoms, recovery, and care plans. If you don't have access to live patient data, say so and give general guidance. Use markdown when helpful.`;

export function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * @param {string} message - User message
 * @param {string|null} conversationId - Ignored (stateless); kept for API compatibility
 * @returns {Promise<{ conversation_id: string, response: string }>}
 */
export async function converse(message, conversationId) {
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: message }],
  });

  const text = resp.content?.find((b) => b.type === "text")?.text ?? "";
  return {
    conversation_id: conversationId || `claude-${Date.now()}`,
    response: text,
  };
}
