const express = require("express");
const twilio = require("twilio");

const router = express.Router();

// In-memory store for MVP
const callStore = new Map(); // callSid -> { q1, q2, createdAt }

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

// ---------- 1) Initiate outbound call ----------
router.post("/api/calls", async (req, res) => {
  try {
    requireEnv("TWILIO_ACCOUNT_SID");
    requireEnv("TWILIO_AUTH_TOKEN");
    requireEnv("TWILIO_PHONE_NUMBER");

    const { to } = req.body || {};
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

    callStore.set(call.sid, { createdAt: new Date().toISOString() });

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
  if (callSid && !callStore.has(callSid)) {
    callStore.set(callSid, { createdAt: new Date().toISOString() });
  }

  twiml.say(
    { voice: "alice" },
    "Hi, this is CareLink calling for your daily check-in."
  );

  const gather = twiml.gather({
    input: "speech dtmf",
    action: "/twilio/gather?q=1",
    method: "POST",
    timeout: 5,
    speechTimeout: "auto",
  });

  gather.say(
    { voice: "alice" },
    "How are you feeling today? You can say better, same, or worse."
  );

  // If no input, loop back politely
  twiml.say({ voice: "alice" }, "Sorry, I didn't catch that.");
  twiml.redirect({ method: "POST" }, "/twilio/voice");

  res.type("text/xml");
  res.send(twiml.toString());
});

// ---------- 3) TwiML: gather handler ----------
router.post("/twilio/gather", (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const q = req.query.q; // "1" or "2"
  const callSid = req.body.CallSid;

  const speech = (req.body.SpeechResult || "").trim();
  const digits = (req.body.Digits || "").trim();
  const answer = speech || digits || "";

  const record = callStore.get(callSid) || { createdAt: new Date().toISOString() };

  if (q === "1") record.q1 = answer;
  if (q === "2") record.q2 = answer;

  callStore.set(callSid, record);

  if (q === "1") {
    const gather2 = twiml.gather({
      input: "speech dtmf",
      action: "/twilio/gather?q=2",
      method: "POST",
      timeout: 6,
      speechTimeout: "auto",
    });

    gather2.say(
      { voice: "alice" },
      "Do you have any new or worsening symptoms like fever, trouble breathing, or uncontrolled pain? Say yes or no."
    );

    twiml.say({ voice: "alice" }, "Sorry, I didn't catch that.");
    twiml.redirect({ method: "POST" }, "/twilio/voice");
  } else {
    twiml.say({ voice: "alice" }, "Thanks. A clinician may follow up if needed. Goodbye.");
    twiml.hangup();
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ---------- 4) Optional: receive status callbacks ----------
router.post("/twilio/status", (req, res) => {
  // Twilio hits this endpoint with call progress updates
  // Useful later for logging / debugging.
  // console.log("Twilio status:", req.body.CallSid, req.body.CallStatus);

  res.sendStatus(200);
});

// ---------- 5) Debug endpoint (optional): see stored answers ----------
router.get("/api/calls/:callSid", (req, res) => {
  const rec = callStore.get(req.params.callSid);
  if (!rec) return res.status(404).json({ error: "Not found" });
  res.json({ callSid: req.params.callSid, ...rec });
});

module.exports = router;