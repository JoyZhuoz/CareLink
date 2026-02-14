/**
 * Claude API service — handles all LLM calls for CareLink.
 *
 * Care plan generation, pre-call briefing, and clinician summary are routed
 * through Kibana Agent Builder when configured (Elastic 9.3 Enterprise).
 * Falls back to direct Anthropic SDK calls otherwise.
 *
 * Voice call conversation always uses direct Claude (real-time latency requirements).
 */

const Anthropic = require("@anthropic-ai/sdk");
const kibanaAgent = require("./kibanaAgentService");
const {
  CARE_PLAN_SYSTEM_PROMPT,
  buildCarePlanUserPrompt,
} = require("../prompts/carePlan");
const {
  PRE_CALL_BRIEFING_SYSTEM_PROMPT,
  buildPreCallBriefingUserPrompt,
} = require("../prompts/preCallBriefing");
const {
  CLINICIAN_SUMMARY_SYSTEM_PROMPT,
  buildClinicianSummaryUserPrompt,
} = require("../prompts/clinicianSummary");
const { buildCallSystemPrompt } = require("../prompts/callConversation");

const anthropic = new Anthropic();

const MODEL = "claude-sonnet-4-5-20250929";

// ─── Care Plan Generation ───────────────────────────────────────────

async function generateCarePlan({ patientData, documentTexts }) {
  const userPrompt = buildCarePlanUserPrompt({ patientData, documentTexts });

  // Route through Agent Builder if configured
  if (kibanaAgent.isConfigured()) {
    const result = await kibanaAgent.createConversation(
      `${CARE_PLAN_SYSTEM_PROMPT}\n\n${userPrompt}`
    );
    return JSON.parse(result.message || result.response || JSON.stringify(result));
  }

  // Direct Claude call
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: CARE_PLAN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse care plan JSON from Claude response");
  return JSON.parse(jsonMatch[0]);
}

// ─── Pre-Call Briefing ──────────────────────────────────────────────

async function generatePreCallBriefing({
  carePlan,
  daysSinceSurgery,
  callHistory,
  clinicianFlags,
  medicalReference,
}) {
  const userPrompt = buildPreCallBriefingUserPrompt({
    carePlan,
    daysSinceSurgery,
    callHistory,
    clinicianFlags,
    medicalReference,
  });

  // Route through Agent Builder if configured
  if (kibanaAgent.isConfigured()) {
    const result = await kibanaAgent.createConversation(
      `${PRE_CALL_BRIEFING_SYSTEM_PROMPT}\n\n${userPrompt}`
    );
    return result.message || result.response || result;
  }

  // Direct Claude call
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: PRE_CALL_BRIEFING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content[0].text;
}

// ─── Voice Call Conversation (always direct Claude — latency critical) ──

async function getCallResponse({ systemPrompt, conversationHistory }) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages: conversationHistory,
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      spoken_reply: text,
      internal_note: "",
      next_action: "next_question",
      urgency: "normal",
      question_index: 0,
    };
  }
  return JSON.parse(jsonMatch[0]);
}

// ─── Clinician Summary ──────────────────────────────────────────────

async function generateClinicianSummary({ carePlan, medicalReference, callDoc }) {
  const userPrompt = buildClinicianSummaryUserPrompt({
    carePlan,
    medicalReference,
    callDoc,
  });

  // Route through Agent Builder if configured
  if (kibanaAgent.isConfigured()) {
    const result = await kibanaAgent.createConversation(
      `${CLINICIAN_SUMMARY_SYSTEM_PROMPT}\n\n${userPrompt}`
    );
    return JSON.parse(result.message || result.response || JSON.stringify(result));
  }

  // Direct Claude call
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: CLINICIAN_SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse summary JSON from Claude response");
  return JSON.parse(jsonMatch[0]);
}

module.exports = {
  generateCarePlan,
  generatePreCallBriefing,
  getCallResponse,
  generateClinicianSummary,
  buildCallSystemPrompt,
};
