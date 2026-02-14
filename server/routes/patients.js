const express = require("express");
const router = express.Router();

const elasticService = require("../services/elasticService");
const agent = require("../services/callAgent");

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

// ─── Generate care plan (via ES Inference) ──────────────────────────

router.post("/:patientId/care-plan", async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!agent.isConfigured()) {
      return res.status(503).json({
        error: "AI service not configured. Set ELASTICSEARCH_URL and ES_CHAT_INFERENCE_ID in .env.",
      });
    }

    // Load patient data from the static file
    const patients = require("../../data/patients.json");
    const patientData = patients.find((p) => p.patient_id === patientId);
    if (!patientData) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Post to AI agent — includes patient info in message
    const message = `[CARE_PLAN patient_id=${patientId}]\nPatient info: ${patientData.name}, ${patientData.age}, ${patientData.gender}, ${patientData.surgery_type}, ${patientData.surgery_date}, risk factors: ${(patientData.risk_factors || []).join(", ") || "none"}`;

    const result = await agent.converse(message);

    // Parse the agent's JSON response
    const responseText = result.response || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Agent did not return valid JSON for care plan");
    }
    const carePlanData = JSON.parse(jsonMatch[0]);

    // Compute next call date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Store in Elasticsearch
    const esResult = await elasticService.indexCarePlan({
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

    res.json({ ok: true, id: esResult._id, care_plan: carePlanData });
  } catch (err) {
    console.error("Error generating care plan:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Generate clinician summary (via ES Inference) ──────────────────

router.post("/:patientId/summary", async (req, res) => {
  try {
    const { patientId } = req.params;
    const { call_id, transcript } = req.body;

    if (!agent.isConfigured()) {
      return res.status(503).json({ error: "AI service not configured." });
    }

    if (!transcript) {
      return res.status(400).json({ error: "Provide 'transcript'" });
    }

    const transcriptText = Array.isArray(transcript)
      ? transcript
          .map((t) => `[${t.speaker}] ${t.text}${t.internal_note ? ` (note: ${t.internal_note})` : ""}`)
          .join("\n")
      : transcript;

    const result = await agent.converse(
      `[SUMMARY patient_id=${patientId} call_id=${call_id || "unknown"}]\nTranscript:\n${transcriptText}`
    );

    const responseText = result.response || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Agent did not return valid JSON for summary");
    }
    const summary = JSON.parse(jsonMatch[0]);

    // Determine overall urgency from transcript
    const overallUrgency = Array.isArray(transcript)
      ? transcript.some((t) => t.urgency === "urgent") ? "urgent" : "normal"
      : "normal";

    // Store in Elasticsearch
    const esResult = await elasticService.indexClinicianSummary({
      patient_id: patientId,
      call_id: call_id || "unknown",
      ...summary,
      priority: overallUrgency === "urgent",
    });

    res.json({ ok: true, id: esResult._id, summary });
  } catch (err) {
    console.error("Error generating summary:", err);
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
