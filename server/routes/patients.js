const express = require("express");
const router = express.Router();

const elasticService = require("../services/elasticService");
const claudeService = require("../services/claudeService");

// ─── Upload patient document (text or PDF base64) ───────────────────

router.post("/:patientId/documents", async (req, res) => {
  try {
    const { patientId } = req.params;
    const { content, doc_type, base64_pdf } = req.body;

    if (!content && !base64_pdf) {
      return res.status(400).json({ error: "Provide 'content' (text) or 'base64_pdf'" });
    }

    let result;
    if (base64_pdf) {
      result = await elasticService.indexPatientDocumentPDF({
        patientId,
        docType: doc_type,
        base64Data: base64_pdf,
      });
    } else {
      result = await elasticService.indexPatientDocument({
        patientId,
        docType: doc_type,
        content,
      });
    }

    res.json({ ok: true, id: result._id });
  } catch (err) {
    console.error("Error uploading document:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get patient documents ──────────────────────────────────────────

router.get("/:patientId/documents", async (req, res) => {
  try {
    const docs = await elasticService.getPatientDocuments(req.params.patientId);
    res.json({ documents: docs });
  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Generate care plan ─────────────────────────────────────────────

router.post("/:patientId/care-plan", async (req, res) => {
  try {
    const { patientId } = req.params;

    // Load patient data from the static file as fallback
    const patients = require("../../data/patients.json");
    const patientData = patients.find((p) => p.patient_id === patientId);
    if (!patientData) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Fetch all documents for this patient
    const docs = await elasticService.getPatientDocuments(patientId);
    const documentTexts = docs.map((d) => d.raw_text || d.content || "");

    if (documentTexts.length === 0) {
      return res
        .status(400)
        .json({ error: "No documents found. Upload documents first." });
    }

    // Generate care plan via Claude (or Agent Builder)
    const carePlanData = await claudeService.generateCarePlan({
      patientData,
      documentTexts,
    });

    // Compute next call date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Store in Elasticsearch
    const result = await elasticService.indexCarePlan({
      patient_id: patientId,
      patient_name: patientData.name,
      phone_number: patientData.phone,
      surgery_type: patientData.surgery_type,
      surgery_date: patientData.surgery_date,
      monitor_items: carePlanData.monitor_items,
      check_in_questions: carePlanData.check_in_questions,
      call_frequency: carePlanData.call_frequency || "daily",
      next_call_date: tomorrow.toISOString(),
    });

    res.json({ ok: true, id: result._id, care_plan: carePlanData });
  } catch (err) {
    console.error("Error generating care plan:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get care plan ──────────────────────────────────────────────────

router.get("/:patientId/care-plan", async (req, res) => {
  try {
    const carePlan = await elasticService.getCarePlan(req.params.patientId);
    if (!carePlan) {
      return res.status(404).json({ error: "No care plan found" });
    }
    res.json({ care_plan: carePlan });
  } catch (err) {
    console.error("Error fetching care plan:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Semantic search in patient documents ───────────────────────────

router.post("/:patientId/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Provide 'query'" });
    }
    const results = await elasticService.searchPatientDocuments(
      req.params.patientId,
      query
    );
    res.json({ results });
  } catch (err) {
    console.error("Error searching documents:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
