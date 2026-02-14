/**
 * Elasticsearch service — all ES queries for CareLink.
 * Targets Elasticsearch 9.x client.
 */

const esClient = require("../config/elasticsearch");

// ─── Patient Documents ──────────────────────────────────────────────

async function indexPatientDocument({ patientId, docType, content, pipeline }) {
  const doc = {
    patient_id: patientId,
    doc_type: docType || "discharge_notes",
    content,
    raw_text: content,
    uploaded_at: new Date().toISOString(),
  };

  const params = {
    index: "patient_documents",
    document: doc,
  };

  if (pipeline) {
    params.pipeline = pipeline;
  }

  return esClient.index(params);
}

async function indexPatientDocumentPDF({ patientId, docType, base64Data }) {
  return esClient.index({
    index: "patient_documents",
    pipeline: "patient-doc-pipeline",
    document: {
      patient_id: patientId,
      doc_type: docType || "discharge_notes",
      data: base64Data,
      uploaded_at: new Date().toISOString(),
    },
  });
}

async function getPatientDocuments(patientId) {
  const result = await esClient.search({
    index: "patient_documents",
    query: { term: { patient_id: patientId } },
    size: 100,
  });
  return result.hits.hits.map((h) => h._source);
}

async function searchPatientDocuments(patientId, queryText) {
  const result = await esClient.search({
    index: "patient_documents",
    query: {
      bool: {
        must: [
          { term: { patient_id: patientId } },
          { semantic: { field: "content", query: queryText } },
        ],
      },
    },
    size: 5,
  });
  return result.hits.hits.map((h) => ({ ...h._source, _score: h._score }));
}

// ─── Care Plans ─────────────────────────────────────────────────────

async function indexCarePlan(carePlan) {
  return esClient.index({
    index: "care_plans",
    document: {
      ...carePlan,
      created_at: new Date().toISOString(),
    },
  });
}

async function getCarePlan(patientId) {
  const result = await esClient.search({
    index: "care_plans",
    query: { term: { patient_id: patientId } },
    sort: [{ created_at: "desc" }],
    size: 1,
  });
  return result.hits.hits[0]?._source || null;
}

async function getPatientsForCalling() {
  const result = await esClient.search({
    index: "care_plans",
    query: { range: { next_call_date: { lte: "now/d" } } },
    size: 100,
  });
  return result.hits.hits.map((h) => h._source);
}

async function updateNextCallDate(patientId, nextDate) {
  const result = await esClient.search({
    index: "care_plans",
    query: { term: { patient_id: patientId } },
    sort: [{ created_at: "desc" }],
    size: 1,
  });

  if (result.hits.hits.length === 0) return null;

  return esClient.update({
    index: "care_plans",
    id: result.hits.hits[0]._id,
    doc: { next_call_date: nextDate },
  });
}

// ─── Medical References ─────────────────────────────────────────────

async function indexMedicalReference(ref) {
  return esClient.index({
    index: "medical_references",
    document: {
      ...ref,
      fetched_at: new Date().toISOString(),
    },
  });
}

async function getMedicalReference(patientId, dayRange) {
  const result = await esClient.search({
    index: "medical_references",
    query: {
      bool: {
        must: [
          { term: { patient_id: patientId } },
          { term: { recovery_day_range: dayRange } },
        ],
      },
    },
    size: 1,
  });
  return result.hits.hits[0]?._source || null;
}

// ─── Check-in Calls ─────────────────────────────────────────────────

async function indexCheckInCall(callDoc) {
  return esClient.index({
    index: "check_in_calls",
    document: {
      ...callDoc,
      called_at: new Date().toISOString(),
    },
  });
}

async function getRecentCalls(patientId, count = 3) {
  const result = await esClient.search({
    index: "check_in_calls",
    query: { term: { patient_id: patientId } },
    sort: [{ called_at: "desc" }],
    size: count,
  });
  return result.hits.hits.map((h) => h._source);
}

// ─── Clinician Summaries ────────────────────────────────────────────

async function indexClinicianSummary(summary) {
  return esClient.index({
    index: "clinician_summaries",
    document: {
      ...summary,
      generated_at: new Date().toISOString(),
    },
  });
}

async function getRecentClinicianFlags(patientId, count = 3) {
  const result = await esClient.search({
    index: "clinician_summaries",
    query: { term: { patient_id: patientId } },
    sort: [{ generated_at: "desc" }],
    size: count,
  });
  return result.hits.hits.map((h) => h._source);
}

// ─── Call Queue ─────────────────────────────────────────────────────

async function indexCallQueueEntry(entry) {
  return esClient.index({
    index: "call_queue",
    document: {
      ...entry,
      scheduled_at: new Date().toISOString(),
      status: "pending",
      retry_count: 0,
    },
  });
}

async function getPendingCalls() {
  const result = await esClient.search({
    index: "call_queue",
    query: { term: { status: "pending" } },
    sort: [{ scheduled_at: "asc" }],
    size: 1,
  });
  return result.hits.hits.map((h) => ({ _id: h._id, ...h._source }));
}

async function updateCallQueueEntry(docId, updates) {
  return esClient.update({
    index: "call_queue",
    id: docId,
    doc: updates,
  });
}

module.exports = {
  // Patient documents
  indexPatientDocument,
  indexPatientDocumentPDF,
  getPatientDocuments,
  searchPatientDocuments,
  // Care plans
  indexCarePlan,
  getCarePlan,
  getPatientsForCalling,
  updateNextCallDate,
  // Medical references
  indexMedicalReference,
  getMedicalReference,
  // Check-in calls
  indexCheckInCall,
  getRecentCalls,
  // Clinician summaries
  indexClinicianSummary,
  getRecentClinicianFlags,
  // Call queue
  indexCallQueueEntry,
  getPendingCalls,
  updateCallQueueEntry,
};
