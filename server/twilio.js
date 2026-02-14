const express = require("express");
const twilio = require("twilio");
const { AGENT_BUILDER_SYSTEM_PROMPT } = require("./prompts/agentBuilderPrompt");

const router = express.Router();

// In-memory store for MVP: callSid -> call state
const callStore = new Map();
const MAX_FOLLOWUPS = 2;
const MAX_TURNS = 4;
const MAX_IDENTITY_ATTEMPTS = 2;

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Missing env var: ${name}`);
  return process.env[name];
}

function isE164(phone) {
  return /^\+\d{10,15}$/.test(phone);
}

function baseUrl(req) {
  // Prefer PUBLIC_BASE_URL, fallback to request host
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getOrInitRecord(callSid, seed = {}) {
  const existing = callStore.get(callSid);
  if (existing) return existing;

  const fresh = {
    createdAt: nowIso(),
    transcript: [],
    followupCount: 0,
    turnCount: 0,
    triageLevel: "green",
    reasoningSummary: "",
    matchedComplications: [],
    missingCriticalFields: [],
    ...seed,
  };
  callStore.set(callSid, fresh);
  return fresh;
}

function appendTranscript(record, speaker, text) {
  if (!text) return;
  record.transcript.push({
    speaker,
    text,
    timestamp: nowIso(),
  });
}

function includesAny(text, words) {
  const normalized = (text || "").toLowerCase();
  return words.some((w) => normalized.includes(w));
}

function parseYesNo(answer) {
  const normalized = (answer || "").toLowerCase().trim();
  if (!normalized) return null;

  if (normalized === "1" || includesAny(normalized, ["yes", "yep", "yeah", "correct", "this is"])) {
    return true;
  }
  if (normalized === "2" || includesAny(normalized, ["no", "nope", "wrong", "not me", "not the patient"])) {
    return false;
  }
  return null;
}

function defaultDecision(record, latestPatientUtterance) {
  const text = (latestPatientUtterance || "").toLowerCase();
  const redFlags = [
    "chest pain",
    "trouble breathing",
    "shortness of breath",
    "can't breathe",
    "bleeding",
    "confusion",
    "fainting",
    "high fever",
    "severe pain",
  ];

  if (includesAny(text, redFlags)) {
    return {
      next_question: "",
      needs_followup: false,
      end_call: true,
      triage_level: "red",
      reasoning_summary: "Red-flag symptom language was detected in the latest response.",
      triage_confidence: 0.88,
      matched_complications: ["possible acute post-op complication"],
      missing_critical_fields: [],
      patient_facing_ack:
        "Thank you for sharing that. Based on what you said, your care team should follow up urgently.",
    };
  }

  const needsFollowup = record.followupCount < MAX_FOLLOWUPS;
  return {
    next_question: needsFollowup
      ? "Can you tell me when this symptom started and whether it is getting better, worse, or staying the same?"
      : "",
    needs_followup: needsFollowup,
    end_call: !needsFollowup,
    triage_level: "yellow",
    reasoning_summary: "Symptoms need additional timeline and trend details to improve triage confidence.",
    triage_confidence: 0.55,
    matched_complications: ["nonspecific post-op symptom cluster"],
    missing_critical_fields: ["onset_time", "trend"],
    patient_facing_ack: "Thanks for explaining that.",
  };
}

function coerceAgentDecision(raw, record, latestPatientUtterance) {
  const fallback = defaultDecision(record, latestPatientUtterance);
  const candidate = raw && typeof raw === "object" ? raw : {};

  const decision = {
    next_question: typeof candidate.next_question === "string" ? candidate.next_question.trim() : "",
    needs_followup: Boolean(candidate.needs_followup),
    end_call: Boolean(candidate.end_call),
    triage_level:
      candidate.triage_level === "red" || candidate.triage_level === "yellow"
        ? candidate.triage_level
        : "green",
    reasoning_summary:
      typeof candidate.reasoning_summary === "string" && candidate.reasoning_summary.trim()
        ? candidate.reasoning_summary.trim()
        : fallback.reasoning_summary,
    triage_confidence:
      typeof candidate.triage_confidence === "number"
        ? Math.max(0, Math.min(1, candidate.triage_confidence))
        : fallback.triage_confidence,
    matched_complications: Array.isArray(candidate.matched_complications)
      ? candidate.matched_complications.slice(0, 5)
      : fallback.matched_complications,
    missing_critical_fields: Array.isArray(candidate.missing_critical_fields)
      ? candidate.missing_critical_fields.slice(0, 8)
      : fallback.missing_critical_fields,
    patient_facing_ack:
      typeof candidate.patient_facing_ack === "string" && candidate.patient_facing_ack.trim()
        ? candidate.patient_facing_ack.trim()
        : fallback.patient_facing_ack,
  };

  // Enforce two-followup cap in backend, regardless of model output.
  if (record.followupCount >= MAX_FOLLOWUPS) {
    decision.needs_followup = false;
  }
  if (decision.needs_followup && !decision.next_question) {
    decision.next_question = fallback.next_question;
  }
  if (!decision.needs_followup) {
    decision.end_call = true;
  }
  return decision;
}

function maybeParseJson(text) {
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function extractDecisionFromAgentResponse(data) {
  if (!data || typeof data !== "object") return null;

  if ("triage_level" in data || "next_question" in data) {
    return data;
  }

  if (data.output && typeof data.output === "object") return data.output;
  if (typeof data.output === "string") {
    const parsed = maybeParseJson(data.output);
    if (parsed) return parsed;
  }

  if (typeof data.response === "string") {
    const parsed = maybeParseJson(data.response);
    if (parsed) return parsed;
  }

  if (Array.isArray(data.messages) && data.messages.length > 0) {
    const last = data.messages[data.messages.length - 1];
    if (typeof last?.content === "string") {
      const parsed = maybeParseJson(last.content);
      if (parsed) return parsed;
    }
  }

  return null;
}

async function callElasticsearchAgent(record, latestPatientUtterance) {
  const endpoint = process.env.ES_AGENT_BUILDER_ENDPOINT;
  if (!endpoint) return null;

  const headers = { "Content-Type": "application/json" };
  if (process.env.ES_AGENT_BUILDER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ES_AGENT_BUILDER_API_KEY}`;
  }

  const payload = {
    input: {
      patient: {
        patient_id: record.patientId || null,
        surgery_type: record.surgeryType || null,
        days_post_surgery: record.daysPostSurgery ?? null,
      },
      latest_patient_utterance: latestPatientUtterance,
      transcript: record.transcript,
      followup_count_used: record.followupCount,
      max_followups: MAX_FOLLOWUPS,
      required_detail_fields: ["onset_time", "trend", "severity", "red_flags"],
    },
    system_prompt: AGENT_BUILDER_SYSTEM_PROMPT,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Agent builder call failed with status ${response.status}`);
  }
  const data = await response.json();
  return extractDecisionFromAgentResponse(data);
}

function createSpeechGather(twiml, questionText) {
  const gather = twiml.gather({
    input: "speech dtmf",
    action: "/twilio/gather",
    method: "POST",
    timeout: 6,
    speechTimeout: "auto",
  });
  gather.say({ voice: "alice" }, questionText);
}

function getIdentityPrompt(record) {
  if (record.patientName) {
    return `To confirm privacy, is this ${record.patientName}? Say yes or no, or press 1 for yes and 2 for no.`;
  }
  return "To confirm privacy, are you the patient this call is for? Say yes or no, or press 1 for yes and 2 for no.";
}

// ---------- 1) Initiate outbound call ----------
router.post("/api/calls", async (req, res) => {
  try {
    requireEnv("TWILIO_ACCOUNT_SID");
    requireEnv("TWILIO_AUTH_TOKEN");
    requireEnv("TWILIO_PHONE_NUMBER");

    const { to, patientId, patientName, surgeryType, daysPostSurgery } = req.body || {};
    if (!to || !isE164(to)) {
      return res
        .status(400)
        .json({ error: "Invalid phone number. Use E.164 format like +14155552671" });
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const url = `${baseUrl(req)}/twilio/voice`; // Twilio will request TwiML here
    const statusCallback = `${baseUrl(req)}/twilio/status`;

    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url,
      method: "POST",
      statusCallback,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    callStore.set(call.sid, {
      createdAt: nowIso(),
      transcript: [],
      followupCount: 0,
      turnCount: 0,
      triageLevel: "green",
      reasoningSummary: "",
      matchedComplications: [],
      missingCriticalFields: [],
      patientId: patientId || null,
      patientName: patientName || null,
      surgeryType: surgeryType || null,
      daysPostSurgery: Number.isFinite(Number(daysPostSurgery)) ? Number(daysPostSurgery) : null,
      phone: to,
      stage: "identity",
      identityConfirmed: false,
      identityAttempts: 0,
    });

    return res.json({ ok: true, callSid: call.sid, status: call.status });
  } catch (err) {
    console.error("Error creating call:", err);
    return res.status(500).json({ error: err.message || "Failed to create call" });
  }
});

// ---------- 2) TwiML: initial voice flow ----------
router.post("/twilio/voice", (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // Identify call
  const callSid = req.body.CallSid;
  const record = getOrInitRecord(callSid);
  record.stage = record.stage || "identity";
  record.identityConfirmed = Boolean(record.identityConfirmed);
  record.identityAttempts = Number.isInteger(record.identityAttempts) ? record.identityAttempts : 0;

  const intro = "Hi, this is CareLink calling for your post-surgery check-in.";
  const identityQuestion = getIdentityPrompt(record);
  appendTranscript(record, "ai", intro);
  appendTranscript(record, "ai", identityQuestion);

  twiml.say({ voice: "alice" }, intro);
  createSpeechGather(twiml, identityQuestion);

  // If no input, loop once politely.
  twiml.say({ voice: "alice" }, "Sorry, I didn't catch that.");
  createSpeechGather(twiml, identityQuestion);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ---------- 3) TwiML: gather handler ----------
router.post("/twilio/gather", async (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const callSid = req.body.CallSid;
  const speech = (req.body.SpeechResult || "").trim();
  const digits = (req.body.Digits || "").trim();
  const answer = speech || digits || "";
  const record = getOrInitRecord(callSid);
  record.stage = record.stage || "identity";
  record.identityConfirmed = Boolean(record.identityConfirmed);
  record.identityAttempts = Number.isInteger(record.identityAttempts) ? record.identityAttempts : 0;

  if (!answer) {
    const retry =
      record.stage === "identity"
        ? "I didn't catch that. Please say yes or no, or press 1 for yes and 2 for no."
        : "I didn't catch that. Could you repeat your symptoms in a short sentence?";
    appendTranscript(record, "ai", retry);
    createSpeechGather(twiml, retry);
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }
  appendTranscript(record, "patient", answer);

  if (record.stage === "identity") {
    const isPatient = parseYesNo(answer);
    record.identityAttempts += 1;

    if (isPatient === true) {
      record.identityConfirmed = true;
      record.stage = "symptoms";
      const thanks = "Thank you for confirming.";
      const openingQuestion =
        "How are you feeling today, and what symptoms are most bothering you right now?";
      appendTranscript(record, "ai", thanks);
      appendTranscript(record, "ai", openingQuestion);
      twiml.say({ voice: "alice" }, thanks);
      createSpeechGather(twiml, openingQuestion);
      callStore.set(callSid, record);
      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }

    if (isPatient === false) {
      const close =
        "Thanks for letting me know. For privacy, I can only continue with the patient directly. Please ask them to contact their care team. Goodbye.";
      appendTranscript(record, "ai", close);
      twiml.say({ voice: "alice" }, close);
      twiml.hangup();
      record.completedAt = nowIso();
      callStore.set(callSid, record);
      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }

    if (record.identityAttempts >= MAX_IDENTITY_ATTEMPTS) {
      const close =
        "Sorry, I couldn't confirm identity. For privacy, I'll end this call now. Please have the patient contact their care team if needed. Goodbye.";
      appendTranscript(record, "ai", close);
      twiml.say({ voice: "alice" }, close);
      twiml.hangup();
      record.completedAt = nowIso();
      callStore.set(callSid, record);
      res.type("text/xml");
      res.send(twiml.toString());
      return;
    }

    const retryIdentity = "Please confirm: are you the patient this call is for? Say yes or no, or press 1 for yes and 2 for no.";
    appendTranscript(record, "ai", retryIdentity);
    createSpeechGather(twiml, retryIdentity);
    callStore.set(callSid, record);
    res.type("text/xml");
    res.send(twiml.toString());
    return;
  }

  record.turnCount += 1;

  let rawDecision = null;
  try {
    rawDecision = await callElasticsearchAgent(record, answer);
  } catch (err) {
    console.error("Agent builder error:", err.message);
  }
  const decision = coerceAgentDecision(rawDecision, record, answer);

  record.triageLevel = decision.triage_level;
  record.reasoningSummary = decision.reasoning_summary;
  record.matchedComplications = decision.matched_complications;
  record.missingCriticalFields = decision.missing_critical_fields;

  const canFollowup = decision.needs_followup && record.followupCount < MAX_FOLLOWUPS && record.turnCount < MAX_TURNS;

  if (canFollowup) {
    record.followupCount += 1;
    if (decision.patient_facing_ack) {
      appendTranscript(record, "ai", decision.patient_facing_ack);
      twiml.say({ voice: "alice" }, decision.patient_facing_ack);
    }
    appendTranscript(record, "ai", decision.next_question);
    createSpeechGather(twiml, decision.next_question);
  } else {
    const triageText =
      record.triageLevel === "red"
        ? "Based on your responses, this may need urgent follow-up."
        : record.triageLevel === "yellow"
          ? "Based on your responses, a clinician should follow up soon."
          : "Based on your responses, your recovery appears stable.";

    const close =
      "Thank you for your time. If symptoms worsen, please contact your care team right away. Goodbye.";
    if (decision.patient_facing_ack) {
      appendTranscript(record, "ai", decision.patient_facing_ack);
      twiml.say({ voice: "alice" }, decision.patient_facing_ack);
    }
    appendTranscript(record, "ai", triageText);
    appendTranscript(record, "ai", close);
    twiml.say({ voice: "alice" }, triageText);
    twiml.say({ voice: "alice" }, close);
    twiml.hangup();
    record.completedAt = nowIso();
  }

  callStore.set(callSid, record);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ---------- 4) Optional: receive status callbacks ----------
router.post("/twilio/status", (req, res) => {
  // Twilio hits this endpoint with call progress updates
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  if (callSid && callStore.has(callSid)) {
    const record = callStore.get(callSid);
    record.callStatus = callStatus;
    if (callStatus === "completed") {
      record.completedAt = record.completedAt || nowIso();
    }
    callStore.set(callSid, record);
  }

  res.sendStatus(200);
});

// ---------- 5) Debug endpoint (optional): see stored answers ----------
router.get("/api/calls/:callSid", (req, res) => {
  const rec = callStore.get(req.params.callSid);
  if (!rec) return res.status(404).json({ error: "Not found" });
  res.json({ callSid: req.params.callSid, ...rec });
});

module.exports = router;