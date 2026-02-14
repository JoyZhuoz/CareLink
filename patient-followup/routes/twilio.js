import express from 'express';
import twilio from 'twilio';
import * as twilioService from '../services/twilioService.js';
import * as patientService from '../services/patientService.js';
import * as embeddingService from '../services/embeddingService.js';

const router = express.Router();

// Voice webhook
router.post('/voice/:patientId', async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.patientId);
    const twiml = twilioService.generateVoiceResponse(patient);
    res.type('text/xml').send(twiml);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transcription webhook
router.post('/transcription/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const transcript = req.body.TranscriptionText;

    const comparison = await embeddingService.compareResponses(patientId, transcript);

    await patientService.addCallToHistory(patientId, {
      call_date: new Date().toISOString(),
      transcript,
      similarity_score: comparison.similarity_score,
      flagged: comparison.flagged
    });

    res.json({ success: true, comparison });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recording complete webhook
router.post('/recording-complete/:patientId', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  response.say({ voice: 'alice' }, 'Thank you. Our care team will review your response. Goodbye.');
  response.hangup();
  res.type('text/xml').send(response.toString());
});

// Manual call trigger
router.post('/call/:patientId', async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.patientId);
    const call = await twilioService.initiateFollowUpCall(patient);
    res.json({ message: 'Call initiated', callSid: call.sid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;