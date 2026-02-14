const express = require("express");
const router = express.Router();

const esClient = require("../config/elasticsearch");
const elasticService = require("../services/elasticService");

// ─── Cluster info ───────────────────────────────────────────────────

router.get("/es-info", async (req, res) => {
  try {
    const info = await esClient.info();
    res.json(info);
  } catch (err) {
    console.error("ES info error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Call queue ─────────────────────────────────────────────────────

router.get("/call-queue", async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const result = await esClient.search({
      index: "call_queue",
      query: { term: { status } },
      sort: [{ scheduled_at: "asc" }],
      size: 50,
    });
    res.json({
      total: result.hits.total.value,
      entries: result.hits.hits.map((h) => ({ _id: h._id, ...h._source })),
    });
  } catch (err) {
    console.error("Call queue error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Clinician summaries ────────────────────────────────────────────

router.get("/summaries/:patientId", async (req, res) => {
  try {
    const summaries = await elasticService.getRecentClinicianFlags(
      req.params.patientId,
      10
    );
    res.json({ summaries });
  } catch (err) {
    console.error("Summaries error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Recent calls for a patient ─────────────────────────────────────

router.get("/calls/:patientId", async (req, res) => {
  try {
    const calls = await elasticService.getRecentCalls(
      req.params.patientId,
      10
    );
    res.json({ calls });
  } catch (err) {
    console.error("Calls error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── List all patients from Elasticsearch ───────────────────────────

router.get("/patients", async (req, res) => {
  try {
    const patients = await elasticService.getAllPatients();
    res.json({ patients });
  } catch (err) {
    console.error("Patients error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get single patient ─────────────────────────────────────────────

router.get("/patients/:patientId", async (req, res) => {
  try {
    const patient = await elasticService.getPatient(req.params.patientId);
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json({ patient });
  } catch (err) {
    console.error("Patient error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
