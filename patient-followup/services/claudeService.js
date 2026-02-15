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

function buildTriageSystem(recoveryContext, priorCallsContext) {
  return `You are CareLink, an AI post-surgical patient triage agent.

You are conducting a voice follow-up call with a post-surgical patient.
${priorCallsContext ? `
═══════════════════════════════════════════════════════════════
PRIOR CALL(S) – USE AS CONTEXT FOR THIS FOLLOW-UP
═══════════════════════════════════════════════════════════════
${priorCallsContext}

Reference prior symptoms and triage when relevant. Ask whether things have improved, worsened, or stayed the same since the last call.
` : ""}
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
  "symptoms_mentioned": ["list of symptoms or concerns the patient reported during this call. Use short phrases (e.g. pain, swelling, fever, dizziness, sleep issues). Include everything the patient said across the full transcript so far. Empty array if none."],
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
- Do NOT repeat the same follow-up question you already asked. Check the transcript:
  if the last thing the agent said was a question and the patient just gave a partial
  answer (e.g. "It started", "A few days", "Worse"), acknowledge what they said and
  ask a *different* or more specific question (e.g. "When exactly—days or weeks ago?"
  or "Is it getting better, worse, or about the same?"). Never say the exact same
  question again.
- Ask at most ONE focused follow-up per turn. Do not exceed max_followups.
- Prioritize: symptom onset/timeline, worsening vs improving, severity, red flags.
- Only finalize triage (end_call true, needs_followup false) when:
  (a) you have asked at least one follow-up AND have enough detail,
  (b) followup_count_used >= max_followups, or
  (c) the response is a clear safety red-flag.

Triage policy:
- red: symptoms match WARNING SIGNS from the expected recovery doc, OR: radiating/spreading
  pain (e.g. pain "all the way to" another body part), fever >101F + site changes,
  uncontrolled bleeding, chest pain, severe dyspnea, confusion, signs of sepsis,
  sudden severe pain far worse than baseline. ALWAYS set end_call=true for red.
- yellow: symptoms outside NORMAL/EXPECTED range but not clear urgent warning signs.
- green: symptoms within NORMAL/EXPECTED recovery pattern.

Safety hard stops (always red, always end_call=true):
- Chest pain or pressure
- Severe shortness of breath
- Uncontrolled bleeding
- Confusion or altered mental status
- Fever >103F or signs of sepsis
- Sudden severe pain far worse than baseline
- Radiating or spreading pain (e.g. pain extending to other body parts, "all the way to my...")`;
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

/** Build a short summary of the patient's prior calls for context in follow-up calls. */
async function fetchPriorCallsContext(patientId) {
  try {
    const doc = await esClient.get({ index: "patients", id: patientId });
    const history = doc._source?.call_history;
    if (!Array.isArray(history) || history.length === 0) return null;

    const lines = history.slice(0, 5).map((call, i) => {
      const date = call.call_date ? new Date(call.call_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown date";
      const triage = call.triage_level || "green";
      const symptoms = call.symptoms_mentioned && call.symptoms_mentioned.length > 0
        ? call.symptoms_mentioned.join("; ")
        : "(no symptoms extracted)";
      const summary = call.reasoning_summary ? call.reasoning_summary.slice(0, 120) + (call.reasoning_summary.length > 120 ? "…" : "") : "";
      const change = call.condition_change || "";
      const changeLabel = change ? ` [${change}]` : "";
      return `Prior call ${i + 1} (${date})${changeLabel}: triage ${triage}. Symptoms: ${symptoms}. ${summary}`;
    });
    return "PREVIOUS CALL(S) FOR THIS PATIENT (use for follow-up context; ask about change since last time):\n" + lines.join("\n\n");
  } catch (err) {
    console.warn("Could not fetch prior calls for", patientId, err.message);
    return null;
  }
}

/** Parse JSON from Claude's response text. Tolerant of markdown fences, extra prose, trailing commas. */
function parseJSON(text) {
  if (!text || typeof text !== "string") return null;
  let cleaned = text.trim();
  // Strip markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  // If there's prose before/after, try to extract the first {...} object
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1);
  // Allow trailing commas (invalid JSON but some models emit them)
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
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
  // Step 1: Use cached context if present (avoids refetching ES on every turn)
  if (record.recoveryContext === undefined) {
    const [recovery, prior] = await Promise.all([
      fetchRecoveryContext(record.patientId),
      fetchPriorCallsContext(record.patientId),
    ]);
    record.recoveryContext = recovery;
    record.priorCallsContext = prior;
  }
  const recoveryContext = record.recoveryContext || null;
  const priorCallsContext = record.priorCallsContext || null;

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
      system: buildTriageSystem(recoveryContext, priorCallsContext),
      messages: [
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
    });

    const text = resp.content[0]?.text || "";
    const parsed = parseJSON(text);
    if (!parsed || typeof parsed !== "object") {
      console.error("Claude triage: invalid or empty JSON. Raw (first 400 chars):", text.slice(0, 400));
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("Claude triage error:", err.message, err.code || "");
    if (err.status) console.error("  status:", err.status);
    return null;
  }
}

const SYMPTOM_EXTRACT_SYSTEM = `You are extracting symptoms from a completed post-surgical follow-up call transcript.
Your task: list the symptoms or concerns the PATIENT reported, as short phrases suitable for a dashboard.
Rules:
- Use the ENTIRE transcript. Include every symptom or concern the patient mentioned.
- Output at most 4 short phrases (e.g. "chest pain", "fever", "swelling at incision", "dizziness").
- Each phrase should be a clear symptom or concern, not a timeline or vague description (e.g. not "just started a week ago").
- Return JSON only: { "symptoms": ["phrase1", "phrase2", ...] }
- If the patient reported no symptoms, return { "symptoms": [] }`;

/**
 * Extract up to 4 short symptom phrases from the full call transcript. Call this AFTER the call ends.
 * @param {Array<{ speaker: string, text: string }>} transcript
 * @returns {Promise<string[]>} up to 4 short symptom phrases
 */
async function extractSymptomsFromTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) return [];

  const text = transcript
    .map((t) => `${(t.speaker || "unknown").toUpperCase()}: ${(t.text || "").trim()}`)
    .filter((line) => line.length > 2)
    .join("\n");
  if (!text.trim()) return [];

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYMPTOM_EXTRACT_SYSTEM,
      messages: [{ role: "user", content: `Transcript:\n${text}` }],
    });
    const raw = resp.content[0]?.text || "";
    const parsed = parseJSON(raw);
    const list = parsed?.symptoms;
    if (!Array.isArray(list)) return [];
    return list
      .slice(0, 4)
      .map((s) => (typeof s === "string" ? s : String(s)).trim())
      .filter(Boolean);
  } catch (err) {
    console.error("Claude symptom extract error:", err.message);
    return [];
  }
}

export { classifyIdentity, getSymptomDecision, extractSymptomsFromTranscript };
