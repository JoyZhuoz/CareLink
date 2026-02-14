import express from 'express';
import * as twilioService from '../services/twilioService.js';
import * as patientService from '../services/patientService.js';
import * as embeddingService from '../services/embeddingService.js';
import * as perplexityService from '../services/perplexityService.js';
import * as elevenLabsService from '../services/elevenLabsService.js';

const router = express.Router();

// ---------- ElevenLabs TTS: serve cached audio for Twilio <Play> ----------
router.get('/tts/play/:id', (req, res) => {
  const entry = elevenLabsService.getCachedAudio(req.params.id);
  if (!entry) return res.status(404).send('Audio not found or expired');
  res.set('Content-Type', entry.contentType);
  res.send(entry.buffer);
});

function errorTwiml(message = "We're sorry, something went wrong. Please try again later. Goodbye.") {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${message.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</Say><Hangup/></Response>`;
}

// ---------- Voice webhook (call starts here) ----------
router.post('/voice/:patientId', async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.patientId);
    const twiml = await twilioService.generateVoiceResponse(patient);
    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Voice webhook error:', error.message);
    res.type('text/xml').status(500).send(errorTwiml());
  }
});

// ---------- Gather webhook (identity + symptom turns) ----------
router.post('/gather/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const callSid = req.body.CallSid;
    const speech  = (req.body.SpeechResult || '').trim();
    const digits  = (req.body.Digits || '').trim();
    const answer  = speech || digits || '';

    const twiml = await twilioService.handleGather(patientId, callSid, answer);

    // After call ends, persist full conversation transcript + triage
    const state = twilioService.getCallState(callSid);
    if (state && state.completedAt) {
      try {
        // Full conversation with speaker labels and timestamps
        const conversationTranscript = state.transcript.map(t => ({
          speaker: t.speaker,
          text: t.text,
          timestamp: t.timestamp,
        }));

        // Patient-only text for embedding comparison
        const patientText = state.transcript
          .filter(t => t.speaker === 'patient')
          .map(t => t.text)
          .join(' ');

        let comparison = { similarity_score: null, flagged: false };
        if (patientText) {
          try {
            comparison = await embeddingService.compareResponses(patientId, patientText);
          } catch (embErr) {
            console.warn('Embedding comparison skipped:', embErr.message);
          }
        }

        // Condition change vs previous call: escalation | recovery | stable | first_call
        let conditionChange = 'first_call';
        try {
          const patient = await patientService.getPatientById(patientId);
          const priorCalls = patient?.call_history || [];
          if (priorCalls.length > 0) {
            const prev = priorCalls[0];
            const prevLevel = (prev.triage_level || 'green').toLowerCase();
            const currLevel = (state.triageLevel || 'green').toLowerCase();
            const order = { green: 0, yellow: 1, red: 2 };
            const prevSeverity = order[prevLevel] ?? 0;
            const currSeverity = order[currLevel] ?? 0;
            if (currSeverity > prevSeverity) conditionChange = 'escalation';
            else if (currSeverity < prevSeverity) conditionChange = 'recovery';
            else conditionChange = 'stable';
          }
        } catch (e) {
          console.warn('Could not compute condition_change:', e.message);
        }

        await patientService.addCallToHistory(patientId, {
          call_date: new Date().toISOString(),
          transcript: conversationTranscript,
          triage_level: state.triageLevel,
          reasoning_summary: state.reasoningSummary,
          matched_complications: state.matchedComplications,
          recommended_action: state.recommendedAction,
          symptoms_mentioned: state.symptomsMentioned || [],
          condition_change: conditionChange,
          similarity_score: comparison.similarity_score,
          flagged: comparison.flagged,
        });
      } catch (persistErr) {
        console.error('Error persisting call record:', persistErr.message);
      }
    }

    res.type('text/xml').send(twiml);
  } catch (error) {
    console.error('Gather webhook error:', error.message);
    res.type('text/xml').status(500).send(errorTwiml());
  }
});

// ---------- Transcription webhook (legacy / fallback) ----------
router.post('/transcription/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const transcript = req.body.TranscriptionText;

    const comparison = await embeddingService.compareResponses(patientId, transcript);

    await patientService.addCallToHistory(patientId, {
      call_date: new Date().toISOString(),
      transcript,
      similarity_score: comparison.similarity_score,
      flagged: comparison.flagged,
    });

    res.json({ success: true, comparison });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Status callback ----------
router.post('/status/:patientId', (req, res) => {
  const callSid    = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const state = twilioService.getCallState(callSid);
  if (state) {
    state.callStatus = callStatus;
    if (callStatus === 'completed') {
      state.completedAt = state.completedAt || new Date().toISOString();
    }
  }
  res.sendStatus(200);
});

// ---------- Manual call trigger ----------
router.post('/call/:patientId', async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.patientId);

    // Ensure Perplexity recovery context is populated before calling
    try {
      const existing = patient.expected_response_text;
      if (!existing) {
        console.log(`Fetching Perplexity recovery context for ${req.params.patientId}...`);
        const expectedResponse = await perplexityService.getExpectedRecoveryResponse(patient);
        await embeddingService.storeExpectedResponseEmbedding(req.params.patientId, expectedResponse);
        console.log(`Recovery context saved for ${req.params.patientId}`);
      } else {
        console.log(`Recovery context already exists for ${req.params.patientId}`);
      }
    } catch (perplexityErr) {
      console.warn(`Perplexity skipped for ${req.params.patientId}:`, perplexityErr.message);
    }

    const call = await twilioService.initiateFollowUpCall(patient);
    res.json({ message: 'Call initiated', callSid: call.sid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Debug: inspect call state ----------
router.get('/calls/:callSid', (req, res) => {
  const state = twilioService.getCallState(req.params.callSid);
  if (!state) return res.status(404).json({ error: 'Not found' });
  res.json({ callSid: req.params.callSid, ...state });
});

export default router;