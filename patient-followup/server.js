import express from 'express';
import dotenv from 'dotenv';
import patientRoutes from './routes/patients.js';
import twilioRoutes from './routes/twilio.js';
import { startScheduler, runFollowUpNow } from './services/schedulerService.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/patients', patientRoutes);
app.use('/api/twilio', twilioRoutes);

// Manual trigger for testing
app.post('/api/run-followup', async (req, res) => {
  try {
    const results = await runFollowUpNow();
    res.json({ message: 'Follow-up completed', results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});