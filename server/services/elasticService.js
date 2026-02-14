/**
 * Elasticsearch service — all ES queries for CareLink.
 * Targets Elasticsearch 9.x client.
 */

const esClient = require("../config/elasticsearch");

// ─── Patients ───────────────────────────────────────────────────────

/**
 * Upload a single patient: writes to `patients` index and creates
 * semantic documents in `patient_documents` for doctor_notes,
 * medical_report_summary, call_history, and basic info.
 */
async function uploadPatient(patient) {
  // 1. Index structured record
  await esClient.index({
    index: "patients",
    id: patient.patient_id,
    document: { ...patient, created_at: new Date().toISOString() },
    refresh: "wait_for",
  });

  // 2. Build semantic docs
  const semDocs = buildSemanticDocs(patient);
  if (semDocs.length > 0) {
    const ops = semDocs.flatMap((d) => [
      { index: { _index: "patient_documents", _id: d._docId } },
      { patient_id: d.patient_id, name: d.name, doc_type: d.doc_type, content: d.content, raw_text: d.content, uploaded_at: new Date().toISOString() },
    ]);
    const result = await esClient.bulk({ operations: ops, refresh: "wait_for", timeout: "5m" });
    if (result.errors) {
      const errs = result.items.filter((i) => i.index?.error);
      if (errs.length) throw new Error(`Semantic indexing failed for ${errs.length} docs: ${errs[0].index.error.reason}`);
    }
  }

  return { patient_id: patient.patient_id, semantic_docs: semDocs.length };
}

/**
 * Upload multiple patients in bulk.
 */
async function bulkUploadPatients(patients) {
  // 1. Bulk index structured records
  const patientOps = patients.flatMap((p) => [
    { index: { _index: "patients", _id: p.patient_id } },
    { ...p, created_at: new Date().toISOString() },
  ]);
  await esClient.bulk({ operations: patientOps, refresh: "wait_for" });

  // 2. Bulk index semantic docs
  const allSemDocs = patients.flatMap(buildSemanticDocs);
  if (allSemDocs.length > 0) {
    const semOps = allSemDocs.flatMap((d) => [
      { index: { _index: "patient_documents", _id: d._docId } },
      { patient_id: d.patient_id, name: d.name, doc_type: d.doc_type, content: d.content, raw_text: d.content, uploaded_at: new Date().toISOString() },
    ]);
    const result = await esClient.bulk({ operations: semOps, refresh: "wait_for", timeout: "5m" });
    if (result.errors) {
      const errs = result.items.filter((i) => i.index?.error);
      if (errs.length) throw new Error(`Semantic indexing failed for ${errs.length} docs`);
    }
  }

  return { patients: patients.length, semantic_docs: allSemDocs.length };
}

/**
 * Build semantic search documents from a patient record.
 * Creates separate docs for: patient_info, doctor_notes,
 * medical_report, and each call_history entry.
 */
function buildSemanticDocs(patient) {
  const docs = [];
  const pid = patient.patient_id;

  // Basic info
  const riskStr = (patient.risk_factors || []).join(", ") || "none";
  docs.push({
    _docId: `${pid}-patient_info`,
    patient_id: pid,
    name: patient.name,
    doc_type: "patient_info",
    content: `Patient: ${patient.name}. Age: ${patient.age}, Gender: ${patient.gender}. Surgery: ${patient.surgery_type} on ${patient.surgery_date}. Risk factors: ${riskStr}.`,
  });

  // Doctor notes
  if (patient.doctor_notes) {
    docs.push({
      _docId: `${pid}-doctor_notes`,
      patient_id: pid,
      name: patient.name,
      doc_type: "doctor_notes",
      content: patient.doctor_notes,
    });
  }

  // Medical report
  if (patient.medical_report_summary) {
    docs.push({
      _docId: `${pid}-medical_report`,
      patient_id: pid,
      name: patient.name,
      doc_type: "medical_report",
      content: patient.medical_report_summary,
    });
  }

  // Call history
  for (const call of patient.call_history || []) {
    docs.push({
      _docId: `${pid}-call-${call.call_id}`,
      patient_id: pid,
      name: patient.name,
      doc_type: "call_summary",
      content: `Call on ${call.call_date}: ${call.summary} Status: ${call.status}.`,
    });
  }

  return docs;
}

// Legacy aliases
const indexPatient = uploadPatient;
const bulkIndexPatients = bulkUploadPatients;

async function getPatient(patientId) {
  try {
    const result = await esClient.get({ index: "patients", id: patientId });
    return result._source;
  } catch (e) {
    if (e.meta?.statusCode === 404) return null;
    throw e;
  }
}

async function getAllPatients() {
  const result = await esClient.search({
    index: "patients",
    query: { match_all: {} },
    size: 1000,
    sort: [{ patient_id: "asc" }],
  });
  return result.hits.hits.map((h) => h._source);
}

async function updatePatient(patientId, updates) {
  return esClient.update({
    index: "patients",
    id: patientId,
    doc: updates,
  });
}

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
  // Patients
  uploadPatient,
  bulkUploadPatients,
  indexPatient,
  bulkIndexPatients,
  getPatient,
  getAllPatients,
  updatePatient,
  buildSemanticDocs,
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
