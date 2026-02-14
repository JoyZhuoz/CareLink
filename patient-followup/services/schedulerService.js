import cron from 'node-cron';
import * as patientService from './patientService.js';
import * as perplexityService from './perplexityService.js';
import * as embeddingService from './embeddingService.js';
import * as twilioService from './twilioService.js';

function startScheduler() {
  // Run daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily follow-up check...');
    await runFollowUpNow();
  });

  console.log('Scheduler started - runs daily at 9 AM');
}

async function runFollowUpNow() {
  const patients = await patientService.getPatientsForFollowup();
  console.log(`Found ${patients.length} patients needing follow-up`);

  const results = [];

  for (const patient of patients) {
    try {
      // 1. Get medical context from Perplexity
      const expectedResponse = await perplexityService.getExpectedRecoveryResponse(patient);

      // 2. Store embedding in Elasticsearch
      await embeddingService.storeExpectedResponseEmbedding(patient.patient_id, expectedResponse);

      // 3. Initiate Twilio call
      await twilioService.initiateFollowUpCall(patient);

      results.push({ patient: patient.name, status: 'success' });
    } catch (error) {
      results.push({ patient: patient.name, status: 'error', error: error.message });
    }
  }

  return results;
}

export { startScheduler, runFollowUpNow };