import express from 'express';
import * as analyticsService from '../services/analyticsService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const stats = await analyticsService.getAnalytics();
    res.json(stats);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
