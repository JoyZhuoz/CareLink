import express from 'express';
import * as patientService from '../services/patientService.js';

const router = express.Router();

// Create index
router.post('/setup', async (req, res) => {
  try {
    await patientService.createIndex();
    res.json({ message: 'Index created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add single patient
router.post('/', async (req, res) => {
  try {
    const result = await patientService.addPatient(req.body);
    res.json({ message: 'Patient added', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk import patients
router.post('/bulk', async (req, res) => {
  try {
    const { patients } = req.body;
    const result = await patientService.bulkImportPatients(patients);
    res.json({ message: `Imported ${patients.length} patients`, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all patients (for dashboard)
router.get('/', async (req, res) => {
  try {
    const patients = await patientService.getAllPatients();
    res.json(patients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get patients needing follow-up
router.get('/followup', async (req, res) => {
  try {
    const patients = await patientService.getPatientsForFollowup();
    res.json({ count: patients.length, patients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single patient
router.get('/:id', async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.id);
    res.json(patient);
  } catch (error) {
    res.status(404).json({ error: 'Patient not found' });
  }
});

// Add call to patient history
router.post('/:id/calls', async (req, res) => {
  try {
    const callData = {
      call_date: new Date().toISOString(),
      transcript: req.body.transcript,
      similarity_score: req.body.similarity_score,
      flagged: req.body.flagged || false
    };

    await patientService.addCallToHistory(req.params.id, callData);
    res.json({ message: 'Call recorded', callData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;