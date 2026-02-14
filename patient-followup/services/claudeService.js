/**
 * Direct Anthropic Claude integration for CareLink triage reasoning.
 *
 * Replaces the Elasticsearch Agent Builder calls with direct Claude API calls.
 * Retrieves patient recovery context from Elasticsearch and injects it into
 * the prompt so Claude has all the information it needs.
 */
import Anthropic from "@anthropic-ai/sdk";
import esClient from "../config/elasticsearch.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

// ─── System prompt (adapted from agent-builder-config.js) ───────────────────
// The Agent Builder version referenced "tools" that it would call.  Since we
// now fetch the data ourselves and inject it, the prompt is streamlined.

const IDENTITY_SYSTEM = `You are CareLink, an AI post-surgical patient triage agent.
Your task: classify whether the person on the phone confirmed they are the patient.
Return JSON only:
  { "classification": "YES" | "NO" | "UNCLEAR" }
Rules:
- "YES" if they confirm identity (e.g. "yes", "that's me", "speaking", "this is John")
- "NO" if they deny (e.g. "no", "wrong person", "they're not here")
- "UNCLEAR" if ambiguous`;

function buildTriageSystem(recoveryContext) {
  return `You are CareLink, an AI post-surgical patient triage agent.

You are conducting a voice follow-up call with a post-surgical patient.
Below is the **expected recovery document** for this patient, sourced from
Perplexity medical research. Use it as your clinical reference.

═══════════════════════════════════════════════════════════════
EXPECTED RECOVERY CONTEXT
═══════════════════════════════════════════════════════════════
${recoveryContext || "(No recovery document available — use general post-surgical knowledge.)"}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════
Compare everything the patient has said so far against the expected recovery
document above. For each warning sign or possible complication from the document
that matches what the patient reported, add it to matched_complications.
Update this list each turn.

Return JSON only:
{
  "next_question": "one short empathetic follow-up question, or empty string if done",
  "needs_followup": true/false,
  "end_call": true/false,
  "triage_level": "green" | "yellow" | "red",
  "reasoning_summary": "1-2 sentences: compare reported symptoms vs expected recovery",
  "triage_confidence": 0.0-1.0,
  "matched_complications": ["list of possible complication diagnoses from the recovery doc that match what the patient said; use the doc's own wording (e.g. surgical site infection, DVT). Empty array if nothing matches yet."],
  "patient_facing_ack": "brief empathetic acknowledgement of what patient said",
  "recommended_action": "specific actionable recommendation for the clinician (see below)"
}

recommended_action guidelines:
- red: "Readmit patient to hospital for urgent evaluation of [specific complication]."
       or "Transfer patient to emergency department for [specific concern]."
- yellow: "Refer patient to outpatient follow-up within 24-48 hours for assessment of [concern]."
          or "Schedule urgent telehealth consultation to evaluate [symptom]."
- green: "No immediate action needed. Continue routine post-operative monitoring per protocol."
- Be specific: reference the actual symptom/complication, not generic language.
- Include timeframe when relevant.

Conversation policy:
- You MUST use at least one follow-up when followup_count_used is 0.
  Do NOT end the call after the first symptom reply unless it is a clear
  red-flag (safety hard stop). Vague or short answers are normal—ask a
  focused follow-up instead of concluding.
- Never say or imply the patient is "too vague". Ask one concrete follow-up:
  e.g. "When did that start?", "Is it getting better, worse, or about the same?",
  "On a scale of 1 to 10, how would you rate it?"
- Ask at most ONE focused follow-up per turn. Do not exceed max_followups.
- Prioritize: symptom onset/timeline, worsening vs improving, severity, red flags.
- Only finalize triage (end_call true, needs_followup false) when:
  (a) you have asked at least one follow-up AND have enough detail,
  (b) followup_count_used >= max_followups, or
  (c) the response is a clear safety red-flag.

Triage policy:
- red: symptoms match WARNING SIGNS from the expected recovery doc.
  Includes: fever >101F + surgical site changes, uncontrolled bleeding,
  chest pain, severe dyspnea, confusion, signs of sepsis.
  ALWAYS set end_call=true for red.
- yellow: symptoms are outside NORMAL/EXPECTED range but don't clearly match
  urgent warning signs. Clinician follow-up needed.
- green: symptoms fall within NORMAL/EXPECTED recovery pattern.

Safety hard stops (always red, always end_call=true):
- Chest pain or pressure
- Severe shortness of breath
- Uncontrolled bleeding
- Confusion or altered mental status
- Fever >103F or signs of sepsis
- Sudden severe pain far worse than baseline`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fetch expected_response_text from the patient document in Elasticsearch. */
async function fetchRecoveryContext(patientId) {
  try {
    const doc = await esClient.get({ index: "patients", id: patientId });
    return doc._source?.expected_response_text || null;
  } catch (err) {
    console.warn("Could not fetch recovery context for", patientId, err.message);
    return null;
  }
}

/** Parse JSON from Claude's response text, tolerant of markdown fences. */
function parseJSON(text) {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Classify identity confirmation using Claude.
 * Returns { classification: "YES" | "NO" | "UNCLEAR" }
 */
async function classifyIdentity(answer) {
  if (!answer?.trim()) return null;

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: IDENTITY_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            task: "identity_confirmation",
            input: {
              question: "Are you the patient this call is for?",
              answer: answer.trim(),
            },
          }),
        },
      ],
    });

    const text = resp.content[0]?.text || "";
    console.log("Claude identity response:", text);
    const parsed = parseJSON(text);
    return parsed;
  } catch (err) {
    console.error("Claude identity error:", err.message);
    return null;
  }
}

/**
 * Get symptom triage decision from Claude.
 * Fetches recovery context from Elasticsearch, builds the prompt, calls Claude.
 *
 * @param {object} record - call state from twilioService
 * @param {string} latestUtterance - what the patient just said
 * @returns {object|null} structured triage decision
 */
async function getSymptomDecision(record, latestUtterance) {
  // Step 1: Fetch recovery context from Elasticsearch
  const recoveryContext = await fetchRecoveryContext(record.patientId);

  // Step 2: Build the user message with full context
  const userPayload = {
    task: "symptom_triage",
    input: {
      patient: {
        patient_id: record.patientId || null,
        surgery_type: record.surgeryType || null,
        days_post_surgery: record.daysPostSurgery ?? null,
      },
      latest_patient_utterance: latestUtterance,
      transcript: record.transcript,
      followup_count_used: record.followupCount,
      max_followups: 2,
    },
  };

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: buildTriageSystem(recoveryContext),
      messages: [
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
    });

    const text = resp.content[0]?.text || "";
    console.log("Claude triage response:", text.slice(0, 500));
    const parsed = parseJSON(text);
    return parsed;
  } catch (err) {
    console.error("Claude triage error:", err.message);
    return null;
  }
}

export { classifyIdentity, getSymptomDecision };
