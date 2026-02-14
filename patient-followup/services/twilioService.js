import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

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
// Elasticsearch Agent Builder — single API for all LLM reasoning
// ---------------------------------------------------------------------------
const agentEndpoint = process.env.ES_AGENT_BUILDER_ENDPOINT;
const agentApiKey = process.env.ES_AGENT_BUILDER_API_KEY;

/**
 * Generic call to the Elasticsearch Agent Builder endpoint.
 * The agent is configured in the Elastic Cloud dashboard with:
 *   - Claude as the LLM
 *   - medical_protocols + past_cases indices for retrieval
 *   - System prompt for triage reasoning
 * We just send structured input and parse the response.
 */
async function callAgentBuilder(input) {
  if (!agentEndpoint) return null;

  const headers = { "Content-Type": "application/json" };
  if (agentApiKey) {
    headers["Authorization"] = `ApiKey ${agentApiKey}`;
  }

  try {
    const response = await fetch(agentEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      console.error("Agent Builder call failed:", response.status);
      return null;
    }
    const data = await response.json();
    return extractAgentResponse(data);
  } catch (err) {
    console.error("Agent Builder error:", err.message);
    return null;
  }
}

/** Try common response envelope shapes from Agent Builder */
function extractAgentResponse(data) {
  if (!data || typeof data !== "object") return null;

  // Direct structured output
  if ("triage_level" in data || "next_question" in data || "classification" in data) return data;

  // Nested in .output
  if (data.output && typeof data.output === "object") return data.output;
  if (typeof data.output === "string") {
    try {
      return JSON.parse(data.output);
    } catch (_) {}
  }

  // Nested in .response
  if (typeof data.response === "string") {
    try {
      return JSON.parse(data.response);
    } catch (_) {}
  }

  // Nested in .result
  if (data.result && typeof data.result === "object") return data.result;
  if (typeof data.result === "string") {
    try {
      return JSON.parse(data.result);
    } catch (_) {}
  }

  // Last message in a messages array
  if (Array.isArray(data.messages) && data.messages.length > 0) {
    const last = data.messages[data.messages.length - 1];
    if (typeof last?.content === "string") {
      try {
        return JSON.parse(last.content);
      } catch (_) {}
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Identity confirmation via Agent Builder
// ---------------------------------------------------------------------------
async function classifyIdentityWithAgent(answer) {
  if (!(answer && answer.trim())) return null;

  const result = await callAgentBuilder({
    task: "identity_confirmation",
    input: {
      question: "Are you the patient this call is for?",
      answer: answer.trim(),
    },
  });

  if (!result) return null;

  // Agent should return { classification: "YES" | "NO" | "UNCLEAR" }
  const cls = (result.classification || result.answer || "").toString().trim().toUpperCase();
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

/** Combined: Agent Builder first, keyword fallback */
async function resolveIdentity(answer) {
  let result = await classifyIdentityWithAgent(answer);
  if (result === null) result = parseYesNo(answer);
  return result;
}

// ---------------------------------------------------------------------------
// Symptom reasoning via Agent Builder (retrieval + Claude behind the scenes)
// ---------------------------------------------------------------------------
async function getAgentSymptomDecision(record, latestUtterance) {
  const result = await callAgentBuilder({
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
      max_followups: MAX_FOLLOWUPS,
    },
  });

  return result;
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
  ];
  const isRed = redFlags.some((w) => t.includes(w));

  if (isRed) {
    return {
      next_question: "",
      needs_followup: false,
      end_call: true,
      triage_level: "red",
      reasoning_summary: "Red-flag symptom detected.",
      triage_confidence: 0.88,
      matched_complications: ["possible acute post-op complication"],
      patient_facing_ack: "Thank you for sharing that. Your care team should follow up urgently.",
      recommended_action:
        "Readmit patient to hospital for urgent evaluation of possible post-surgical complication.",
    };
  }

  const needsMore = record.followupCount < MAX_FOLLOWUPS;
  return {
    next_question: needsMore
      ? "Can you tell me when this started and whether it is getting better, worse, or the same?"
      : "",
    needs_followup: needsMore,
    end_call: !needsMore,
    triage_level: "yellow",
    reasoning_summary: "More detail needed for confident triage.",
    triage_confidence: 0.55,
    matched_complications: ["nonspecific post-op symptom"],
    patient_facing_ack: "Thanks for explaining that.",
    recommended_action: needsMore
      ? "Gathering more information before recommending action."
      : "Refer patient to outpatient follow-up within 24-48 hours for further assessment.",
  };
}

function coerceDecision(raw, record, utterance) {
  const fb = defaultDecision(record, utterance);
  const c = raw && typeof raw === "object" ? raw : {};
  const d = {
    next_question: typeof c.next_question === "string" ? c.next_question.trim() : "",
    needs_followup: Boolean(c.needs_followup),
    end_call: Boolean(c.end_call),
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

  // Guard: do not end call after first symptom reply unless red. Force at least one follow-up.
  if (
    record.followupCount === 0 &&
    d.triage_level !== "red" &&
    d.end_call
  ) {
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
function generateVoiceResponse(patient) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const patientId = patient.patient_id;
  const name = patient.name || "the patient";

  // Greet and ask for identity confirmation
  twiml.say({ voice: "alice" }, "Hi, this is CareLink calling for your post-surgery check-in.");

  const gather = twiml.gather({
    input: "speech dtmf",
    action: `${baseUrl}/api/twilio/gather/${patientId}`,
    method: "POST",
    timeout: 6,
    speechTimeout: "auto",
  });
  gather.say(
    { voice: "alice" },
    `To confirm privacy, is this ${name}? Say yes or no, or press 1 for yes and 2 for no.`
  );

  // Fallback if no input
  twiml.say({ voice: "alice" }, "Sorry, I didn't catch that.");
  const retryGather = twiml.gather({
    input: "speech dtmf",
    action: `${baseUrl}/api/twilio/gather/${patientId}`,
    method: "POST",
    timeout: 6,
    speechTimeout: "auto",
  });
  retryGather.say(
    { voice: "alice" },
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
      twiml.say(
        { voice: "alice" },
        "I didn't catch that. Please say yes or no, or press 1 for yes and 2 for no."
      );
      const g = twiml.gather({
        input: "speech dtmf",
        action: `${baseUrl}/api/twilio/gather/${patientId}`,
        method: "POST",
        timeout: 6,
        speechTimeout: "auto",
      });
      g.say({ voice: "alice" }, "Are you the patient?");
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
      twiml.say({ voice: "alice" }, "Thank you for confirming.");
      const g = twiml.gather({
        input: "speech dtmf",
        action: `${baseUrl}/api/twilio/gather/${patientId}`,
        method: "POST",
        timeout: 6,
        speechTimeout: "auto",
      });
      g.say({ voice: "alice" }, symptomQ);
      logAI("Thank you for confirming. " + symptomQ);
      return twiml.toString();
    }

    if (isPatient === false) {
      const msg =
        "Thanks for letting me know. For privacy, I can only continue with the patient directly. Goodbye.";
      twiml.say({ voice: "alice" }, msg);
      twiml.hangup();
      logAI(msg);
      record.completedAt = new Date().toISOString();
      return twiml.toString();
    }

    if (record.identityAttempts >= MAX_IDENTITY_ATTEMPTS) {
      const msg =
        "Sorry, I couldn't confirm identity. For privacy, I'll end this call now. Goodbye.";
      twiml.say({ voice: "alice" }, msg);
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
    g.say({ voice: "alice" }, retryMsg);
    logAI(retryMsg);
    return twiml.toString();
  }

  // ---- Symptom stage ----
  if (!answer) {
    const retryMsg = "I didn't catch that. Please describe how you're feeling.";
    twiml.say(
      { voice: "alice" },
      "I didn't catch that. Could you repeat your symptoms in a short sentence?"
    );
    const g = twiml.gather({
      input: "speech dtmf",
      action: `${baseUrl}/api/twilio/gather/${patientId}`,
      method: "POST",
      timeout: 6,
      speechTimeout: "auto",
    });
    g.say({ voice: "alice" }, "Please describe how you're feeling.");
    logAI(retryMsg);
    return twiml.toString();
  }

  record.turnCount += 1;

  // Agent Builder reasoning (retrieval + Claude, or fallback)
  let rawDecision = null;
  try {
    rawDecision = await getAgentSymptomDecision(record, answer);
  } catch (e) {
    console.error("Agent error:", e.message);
  }
  const decision = coerceDecision(rawDecision, record, answer);

  record.triageLevel = decision.triage_level;
  record.reasoningSummary = decision.reasoning_summary;
  record.matchedComplications = decision.matched_complications;
  record.recommendedAction = decision.recommended_action;

  const canFollowup =
    decision.needs_followup && record.followupCount < MAX_FOLLOWUPS && record.turnCount < MAX_TURNS;

  if (canFollowup) {
    record.followupCount += 1;
    const ackAndQuestion = [decision.patient_facing_ack, decision.next_question]
      .filter(Boolean)
      .join(" ");
    if (decision.patient_facing_ack) twiml.say({ voice: "alice" }, decision.patient_facing_ack);
    const g = twiml.gather({
      input: "speech dtmf",
      action: `${baseUrl}/api/twilio/gather/${patientId}`,
      method: "POST",
      timeout: 6,
      speechTimeout: "auto",
    });
    g.say({ voice: "alice" }, decision.next_question);
    logAI(ackAndQuestion);
  } else {
    let closingMsg = "";
    if (decision.patient_facing_ack) {
      twiml.say({ voice: "alice" }, decision.patient_facing_ack);
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
    twiml.say({ voice: "alice" }, triageMsg);
    closingMsg += triageMsg;

    const farewell = "Thank you for your time. Take care and have a good day. Goodbye.";
    twiml.say({ voice: "alice" }, farewell);
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
