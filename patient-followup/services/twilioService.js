import twilio from "twilio";
import dotenv from "dotenv";
import { classifyIdentity as claudeClassifyIdentity, getSymptomDecision as claudeGetSymptomDecision } from "./claudeService.js";
import * as elevenLabsService from "./elevenLabsService.js";

dotenv.config();

/** Use ElevenLabs for natural voice when configured; otherwise Twilio Say. */
async function playOrSay(node, text) {
  if (!text || !text.trim()) return;
  if (elevenLabsService.isConfigured()) {
    try {
      const url = await elevenLabsService.getPlayUrl(text);
      if (url) node.play(url);
      else node.say({ voice: "alice" }, text);
    } catch (e) {
      console.warn("ElevenLabs TTS failed, using Twilio Say:", e.message);
      node.say({ voice: "alice" }, text);
    }
  } else {
    node.say({ voice: "alice" }, text);
  }
}

// ---------------------------------------------------------------------------
// Twilio client
// ---------------------------------------------------------------------------
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

function getTwilioClient() {
  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }
  return twilio(accountSid, authToken);
}

// ---------------------------------------------------------------------------
// In-memory call state (MVP) — keyed by callSid
// ---------------------------------------------------------------------------
const callStore = new Map();

const MAX_FOLLOWUPS = 2;
const MAX_TURNS = 4;
const MAX_IDENTITY_ATTEMPTS = 2;

function getOrInitCallState(callSid, seed = {}) {
  if (callStore.has(callSid)) return callStore.get(callSid);
  const fresh = {
    createdAt: new Date().toISOString(),
    transcript: [],
    followupCount: 0,
    turnCount: 0,
    triageLevel: "green",
    reasoningSummary: "",
    matchedComplications: [],
    symptomsMentioned: [],
    missingCriticalFields: [],
    stage: "identity",
    identityConfirmed: false,
    identityAttempts: 0,
    ...seed,
  };
  callStore.set(callSid, fresh);
  return fresh;
}

function getCallState(callSid) {
  return callStore.get(callSid) || null;
}

// ---------------------------------------------------------------------------
// Identity confirmation via Claude
// ---------------------------------------------------------------------------
async function classifyIdentityWithClaude(answer) {
  if (!(answer && answer.trim())) return null;

  const result = await claudeClassifyIdentity(answer);
  if (!result) return null;

  const cls = (result.classification || "").toString().trim().toUpperCase();
  if (cls.startsWith("YES")) return true;
  if (cls.startsWith("NO")) return false;
  return null;
}

/** Keyword fallback when Agent Builder is unavailable */
function parseYesNo(answer) {
  const n = (answer || "").toLowerCase().trim();
  if (!n) return null;
  if (n === "1" || ["yes", "yep", "yeah", "correct", "this is"].some((w) => n.includes(w)))
    return true;
  if (n === "2" || ["no", "nope", "wrong", "not me", "not the patient"].some((w) => n.includes(w)))
    return false;
  return null;
}

/** Combined: Claude first, keyword fallback */
async function resolveIdentity(answer) {
  let result = await classifyIdentityWithClaude(answer);
  if (result === null) result = parseYesNo(answer);
  return result;
}

// ---------------------------------------------------------------------------
// Symptom reasoning via Claude direct (retrieval from ES + Claude reasoning)
// ---------------------------------------------------------------------------
async function getClaudeSymptomDecision(record, latestUtterance) {
  return await claudeGetSymptomDecision(record, latestUtterance);
}

const FALLBACK_QUESTIONS = [
  "Can you tell me when this started and whether it's getting better, worse, or the same?",
  "On a scale of 1 to 10, how would you rate the pain or discomfort?",
  "Is the symptom constant, or does it come and go?",
  "Can you describe it in a bit more detail?",
];

/** Pick a follow-up we haven't already asked (avoid repeating). */
function getNextFollowupQuestion(record) {
  const asked = (record.transcript || [])
    .filter((t) => t.speaker === "ai")
    .map((t) => (t.text || "").trim().slice(0, 80));
  for (const q of FALLBACK_QUESTIONS) {
    const qShort = q.slice(0, 50);
    if (!asked.some((a) => a.includes(qShort) || qShort.includes(a.slice(0, 50)))) {
      return q;
    }
  }
  return "Can you tell me a bit more so we can help?";
}

function defaultDecision(record, utterance) {
  const t = (utterance || "").toLowerCase();
  const redFlags = [
    "chest pain",
    "trouble breathing",
    "shortness of breath",
    "bleeding",
    "confusion",
    "high fever",
    "severe pain",
    "radiating",
    "all the way to",
    "spreading to",
    "can't breathe",
    "uncontrolled",
  ];
  const isRed = redFlags.some((w) => t.includes(w));

  const symptomsFromUtterance = utterance && utterance.trim() ? [utterance.trim().slice(0, 80)] : [];
  if (isRed) {
    return {
      next_question: "",
      needs_followup: false,
      end_call: true,
      triage_level: "red",
      reasoning_summary: "Red-flag symptom detected.",
      triage_confidence: 0.88,
      matched_complications: ["possible acute post-op complication"],
      symptoms_mentioned: symptomsFromUtterance,
      patient_facing_ack: "Thank you for sharing that. Your care team should follow up urgently.",
      recommended_action:
        "Readmit patient to hospital for urgent evaluation of possible post-surgical complication.",
    };
  }

  const needsMore = record.followupCount < MAX_FOLLOWUPS;
  return {
    next_question: needsMore ? getNextFollowupQuestion(record) : "",
    needs_followup: needsMore,
    end_call: !needsMore,
    triage_level: "yellow",
    reasoning_summary: "More detail needed for confident triage.",
    triage_confidence: 0.55,
    matched_complications: ["nonspecific post-op symptom"],
    symptoms_mentioned: symptomsFromUtterance,
    patient_facing_ack: "Thanks for explaining that.",
    recommended_action: needsMore
      ? "Gathering more information before recommending action."
      : "Refer patient to outpatient follow-up within 24-48 hours for further assessment.",
  };
}

// Only allow ending the call on first symptom turn if the utterance clearly contains a safety red-flag phrase.
function hasClearSafetyRedFlag(utterance) {
  const t = (utterance || "").toLowerCase();
  const safetyPhrases = [
    "chest pain", "can't breathe", "cannot breathe", "shortness of breath",
    "trouble breathing", "uncontrolled bleeding", "bleeding a lot",
    "confusion", "confused", "fever over 103", "104 fever",
    "severe pain", "worst pain", "emergency", "911"
  ];
  return safetyPhrases.some(phrase => t.includes(phrase));
}

function coerceDecision(raw, record, utterance) {
  const fb = defaultDecision(record, utterance);
  const c = raw && typeof raw === "object" ? raw : {};
  const agentReturnedValid = c && ("needs_followup" in c || "end_call" in c || "next_question" in c);

  const d = {
    next_question: typeof c.next_question === "string" ? c.next_question.trim() : "",
    needs_followup: agentReturnedValid ? Boolean(c.needs_followup) : fb.needs_followup,
    end_call: agentReturnedValid ? Boolean(c.end_call) : fb.end_call,
    triage_level: ["red", "yellow", "green"].includes(c.triage_level)
      ? c.triage_level
      : fb.triage_level,
    reasoning_summary:
      (typeof c.reasoning_summary === "string" && c.reasoning_summary.trim()) ||
      fb.reasoning_summary,
    triage_confidence:
      typeof c.triage_confidence === "number"
        ? Math.max(0, Math.min(1, c.triage_confidence))
        : fb.triage_confidence,
    matched_complications: Array.isArray(c.matched_complications)
      ? c.matched_complications.slice(0, 5)
      : fb.matched_complications,
    patient_facing_ack:
      (typeof c.patient_facing_ack === "string" && c.patient_facing_ack.trim()) ||
      fb.patient_facing_ack,
    recommended_action:
      (typeof c.recommended_action === "string" && c.recommended_action.trim()) ||
      fb.recommended_action,
    symptoms_mentioned: Array.isArray(c.symptoms_mentioned)
      ? c.symptoms_mentioned.filter((s) => s != null && String(s).trim())
      : (fb.symptoms_mentioned || []),
  };
  // Derive recommended_action from triage if agent didn't provide one
  if (!d.recommended_action) {
    if (d.triage_level === "red")
      d.recommended_action = "Readmit patient to hospital for urgent evaluation.";
    else if (d.triage_level === "yellow")
      d.recommended_action = "Refer patient to outpatient follow-up within 24-48 hours.";
    else d.recommended_action = "No immediate action needed. Continue routine monitoring.";
  }
  if (record.followupCount >= MAX_FOLLOWUPS) d.needs_followup = false;
  if (d.needs_followup && !d.next_question) d.next_question = fb.next_question;
  if (!d.needs_followup) d.end_call = true;

  // First symptom turn: always ask at least one follow-up unless there's a clear safety red-flag in what they said.
  const isFirstSymptomTurn = record.followupCount === 0;
  const allowEndOnFirstTurn = isFirstSymptomTurn && (
    d.triage_level === "red" && hasClearSafetyRedFlag(utterance)
  );
  if (isFirstSymptomTurn && d.end_call && !allowEndOnFirstTurn) {
    d.needs_followup = true;
    d.end_call = false;
    d.next_question =
      d.next_question ||
      "Can you tell me when that started, and whether it's getting better, worse, or about the same?";
  }

  return d;
}

// ---------------------------------------------------------------------------
// Public API — used by routes/twilio.js and schedulerService.js
// ---------------------------------------------------------------------------

/**
 * Generate initial TwiML for a follow-up call.
 * Starts with identity confirmation, then a symptom question + recording.
 */
async function generateVoiceResponse(patient) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const patientId = patient.patient_id;
  const name = patient.name || "the patient";

  await playOrSay(twiml, "Hi, this is CareLink calling for your post-surgery check-in.");

  const gather = twiml.gather({
    input: "speech dtmf",
    action: `${baseUrl}/api/twilio/gather/${patientId}`,
    method: "POST",
    timeout: 6,
    speechTimeout: "auto",
  });
  await playOrSay(
    gather,
    `To confirm privacy, is this ${name}? Say yes or no, or press 1 for yes and 2 for no.`
  );

  await playOrSay(twiml, "Sorry, I didn't catch that.");
  const retryGather = twiml.gather({
    input: "speech dtmf",
    action: `${baseUrl}/api/twilio/gather/${patientId}`,
    method: "POST",
    timeout: 6,
    speechTimeout: "auto",
  });
  await playOrSay(
    retryGather,
    "Are you the patient this call is for? Say yes or no, or press 1 for yes and 2 for no."
  );

  return twiml.toString();
}

/**
 * Handle a gather response (identity or symptom turn).
 * Returns TwiML string.
 */
async function handleGather(patientId, callSid, answer) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  const record = getOrInitCallState(callSid, { patientId });

  // On very first gather, seed the transcript with the opening greeting from generateVoiceResponse
  if (record.transcript.length === 0) {
    const greeting =
      "Hi, this is CareLink calling for your post-surgery check-in. To confirm privacy, is this the patient? Say yes or no, or press 1 for yes and 2 for no.";
    record.transcript.push({ speaker: "ai", text: greeting, timestamp: new Date().toISOString() });
  }

  // Append patient utterance
  if (answer) {
    record.transcript.push({
      speaker: "patient",
      text: answer,
      timestamp: new Date().toISOString(),
    });
  }

  // Helper to log AI speech in the transcript
  const logAI = (text) => {
    record.transcript.push({ speaker: "ai", text, timestamp: new Date().toISOString() });
  };

  // ---- Identity stage ----
  if (record.stage === "identity") {
    if (!answer) {
      const msg = "I didn't catch that. Are you the patient?";
      await playOrSay(
        twiml,
        "I didn't catch that. Please say yes or no, or press 1 for yes and 2 for no."
      );
      const g = twiml.gather({
        input: "speech dtmf",
        action: `${baseUrl}/api/twilio/gather/${patientId}`,
        method: "POST",
        timeout: 6,
        speechTimeout: "auto",
      });
      await playOrSay(g, "Are you the patient?");
      logAI(msg);
      return twiml.toString();
    }

    const isPatient = await resolveIdentity(answer);
    record.identityAttempts += 1;

    if (isPatient === true) {
      record.identityConfirmed = true;
      record.stage = "symptoms";
      const symptomQ =
        "How are you feeling today, and what symptoms are most bothering you right now?";
      await playOrSay(twiml, "Thank you for confirming.");
      const g = twiml.gather({
        input: "speech dtmf",
        action: `${baseUrl}/api/twilio/gather/${patientId}`,
        method: "POST",
        timeout: 6,
        speechTimeout: "auto",
      });
      await playOrSay(g, symptomQ);
      logAI("Thank you for confirming. " + symptomQ);
      return twiml.toString();
    }

    if (isPatient === false) {
      const msg =
        "Thanks for letting me know. For privacy, I can only continue with the patient directly. Goodbye.";
      await playOrSay(twiml, msg);
      twiml.hangup();
      logAI(msg);
      record.completedAt = new Date().toISOString();
      return twiml.toString();
    }

    if (record.identityAttempts >= MAX_IDENTITY_ATTEMPTS) {
      const msg =
        "Sorry, I couldn't confirm identity. For privacy, I'll end this call now. Goodbye.";
      await playOrSay(twiml, msg);
      twiml.hangup();
      logAI(msg);
      record.completedAt = new Date().toISOString();
      return twiml.toString();
    }

    const retryMsg = "Please confirm: are you the patient this call is for? Say yes or no.";
    const g = twiml.gather({
      input: "speech dtmf",
      action: `${baseUrl}/api/twilio/gather/${patientId}`,
      method: "POST",
      timeout: 6,
      speechTimeout: "auto",
    });
    await playOrSay(g, retryMsg);
    logAI(retryMsg);
    return twiml.toString();
  }

  // ---- Symptom stage ----
  if (!answer) {
    const retryMsg = "I didn't catch that. Please describe how you're feeling.";
    await playOrSay(
      twiml,
      "I didn't catch that. Could you repeat your symptoms in a short sentence?"
    );
    const g = twiml.gather({
      input: "speech dtmf",
      action: `${baseUrl}/api/twilio/gather/${patientId}`,
      method: "POST",
      timeout: 6,
      speechTimeout: "auto",
    });
    await playOrSay(g, "Please describe how you're feeling.");
    logAI(retryMsg);
    return twiml.toString();
  }

  record.turnCount += 1;

  // Claude reasoning (ES retrieval + Claude, or fallback)
  let rawDecision = null;
  try {
    rawDecision = await getClaudeSymptomDecision(record, answer);
  } catch (e) {
    console.error("Claude reasoning error:", e.message);
  }
  const decision = coerceDecision(rawDecision, record, answer);

  record.triageLevel = decision.triage_level;
  record.reasoningSummary = decision.reasoning_summary;
  record.matchedComplications = decision.matched_complications;
  record.recommendedAction = decision.recommended_action;
  record.symptomsMentioned = Array.isArray(decision.symptoms_mentioned)
    ? decision.symptoms_mentioned.filter((s) => s && String(s).trim())
    : record.symptomsMentioned || [];

  const canFollowup =
    decision.needs_followup && record.followupCount < MAX_FOLLOWUPS && record.turnCount < MAX_TURNS;

  if (canFollowup) {
    record.followupCount += 1;
    // Never repeat the same question: if last AI message was this question, use a different one
    let questionToAsk = (decision.next_question || "").trim();
    const lastAI = (record.transcript || [])
      .filter((t) => t.speaker === "ai")
      .map((t) => (t.text || "").trim())
      .pop();
    if (questionToAsk && lastAI && (lastAI.includes(questionToAsk.slice(0, 40)) || questionToAsk.includes(lastAI.slice(0, 40)))) {
      questionToAsk = getNextFollowupQuestion(record);
    }
    if (!questionToAsk) questionToAsk = getNextFollowupQuestion(record);

    const ackAndQuestion = [decision.patient_facing_ack, questionToAsk].filter(Boolean).join(" ");
    if (decision.patient_facing_ack) await playOrSay(twiml, decision.patient_facing_ack);
    const g = twiml.gather({
      input: "speech dtmf",
      action: `${baseUrl}/api/twilio/gather/${patientId}`,
      method: "POST",
      timeout: 6,
      speechTimeout: "auto",
    });
    await playOrSay(g, questionToAsk);
    logAI(ackAndQuestion);
  } else {
    let closingMsg = "";
    if (decision.patient_facing_ack) {
      await playOrSay(twiml, decision.patient_facing_ack);
      closingMsg += decision.patient_facing_ack + " ";
    }

    let triageMsg = "";
    if (decision.triage_level === "red") {
      triageMsg =
        "Based on your responses, we believe you should be seen by your care team as soon as possible. " +
        "We are notifying your clinical team now and someone will reach out to you shortly. " +
        "If your symptoms worsen before then, please go to the nearest emergency room or call 911.";
    } else if (decision.triage_level === "yellow") {
      triageMsg =
        "Based on your responses, we recommend a follow-up with your care team within the next day or two. " +
        "We will notify your clinician so they can schedule that for you. " +
        "In the meantime, if symptoms worsen, please contact your care team right away.";
    } else {
      triageMsg =
        "Based on your responses, your recovery looks like it is on track. " +
        "Keep following your post-surgery care instructions. " +
        "We will check in again at your next scheduled follow-up.";
    }
    await playOrSay(twiml, triageMsg);
    closingMsg += triageMsg;

    const farewell = "Thank you for your time. Take care and have a good day. Goodbye.";
    await playOrSay(twiml, farewell);
    closingMsg += " " + farewell;

    logAI(closingMsg.trim());
    twiml.hangup();
    record.completedAt = new Date().toISOString();
  }

  return twiml.toString();
}

/**
 * Initiate an outbound follow-up call to a patient.
 */
async function initiateFollowUpCall(patient) {
  const client = getTwilioClient();
  const patientId = patient.patient_id;

  const call = await client.calls.create({
    to: patient.phone,
    from: fromNumber,
    url: `${baseUrl}/api/twilio/voice/${patientId}`,
    method: "POST",
    statusCallback: `${baseUrl}/api/twilio/status/${patientId}`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });

  // Seed call state with patient context
  getOrInitCallState(call.sid, {
    patientId,
    patientName: patient.name,
    surgeryType: patient.surgery_type,
    daysPostSurgery: patient.discharge_date
      ? Math.floor((Date.now() - new Date(patient.discharge_date).getTime()) / 86400000)
      : null,
    phone: patient.phone,
  });

  return call;
}

export {
  generateVoiceResponse,
  handleGather,
  initiateFollowUpCall,
  getCallState,
  getOrInitCallState,
  callStore,
  resolveIdentity,
  MAX_FOLLOWUPS,
  MAX_TURNS,
};
