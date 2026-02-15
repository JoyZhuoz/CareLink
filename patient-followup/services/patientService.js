import esClient from '../config/elasticsearch.js';

const INDEX_NAME = 'patients';

async function createIndex() {
  try {
    // Debug: verify client is available
    console.log('esClient exists:', !!esClient);
    console.log('esClient.indices exists:', !!esClient.indices);

    const exists = await esClient.indices.exists({ index: INDEX_NAME });

    if (!exists) {
      await esClient.indices.create({
        index: INDEX_NAME,
        mappings: {
          properties: {
            patient_id: { type: 'keyword' },
            name: { type: 'text' },
            phone: { type: 'keyword' },
            age: { type: 'integer' },
            gender: { type: 'keyword' },
            surgery_type: { type: 'text' },
            surgery_date: { type: 'date' },
            discharge_date: { type: 'date' },
            risk_factors: { type: 'keyword' },
            current_triage: { type: 'keyword' },
            expected_response_embedding: { type: 'dense_vector', dims: 384 },
            call_history: { type: 'nested' }
          }
        }
      });
      console.log('Index created successfully');
      return { created: true };
    } else {
      console.log('Index already exists');
      return { created: false, message: 'Index already exists' };
    }
  } catch (error) {
    console.error('Error in createIndex:', error);
    throw error;
  }
}

function getCurrentTriage(patient) {
  const history = patient.call_history;
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = history[history.length - 1];
  return last?.triage_level || null;
}

async function addPatient(patient) {
  const doc = { ...patient };
  doc.current_triage = getCurrentTriage(patient);
  return await esClient.index({
    index: INDEX_NAME,
    id: patient.patient_id,
    document: doc
  });
}

async function bulkImportPatients(patients) {
  const operations = patients.flatMap(patient => [
    { index: { _index: INDEX_NAME, _id: patient.patient_id } },
    patient
  ]);

  return await esClient.bulk({ operations });
}

async function getPatientsForFollowup() {
  const response = await esClient.search({
    index: INDEX_NAME,
    query: {
      bool: {
        must: [
          { range: { discharge_date: { lte: 'now-2d' } } }
        ]
      }
    },
    size: 500
  });

  // Only include patients with no call history (nested query can be flaky; filter in code)
  return response.hits.hits
    .map(hit => ({ id: hit._id, ...hit._source }))
    .filter(p => !p.call_history || p.call_history.length === 0);
}

async function getAllPatients() {
  const response = await esClient.search({
    index: INDEX_NAME,
    query: { match_all: {} },
    size: 500,
  });

  return response.hits.hits.map(hit => ({
    patient_id: hit._id,
    ...hit._source,
  }));
}

async function getPatientById(patientId) {
  const response = await esClient.get({
    index: INDEX_NAME,
    id: patientId
  });

  return response._source;
}

async function addCallToHistory(patientId, callData) {
  const triageLevel = callData?.triage_level || null;
  return await esClient.update({
    index: INDEX_NAME,
    id: patientId,
    script: {
      source: 'ctx._source.call_history.add(params.call); ctx._source.current_triage = params.triage_level;',
      params: { call: callData, triage_level: triageLevel }
    }
  });
}

/**
 * Backfill current_triage for all patients (e.g. after adding the field to the mapping).
 * Sets current_triage from the latest call in call_history.
 */
async function backfillCurrentTriage() {
  const response = await esClient.search({
    index: INDEX_NAME,
    query: { match_all: {} },
    size: 10000,
  });
  const updates = [];
  for (const hit of response.hits.hits) {
    const triage = getCurrentTriage(hit._source);
    if (triage != null && hit._source.current_triage !== triage) {
      updates.push(
        esClient.update({
          index: INDEX_NAME,
          id: hit._id,
          doc: { current_triage: triage },
        })
      );
    }
  }
  if (updates.length) await Promise.all(updates);
  return { updated: updates.length, total: response.hits.hits.length };
}

export {
  createIndex,
  addPatient,
  bulkImportPatients,
  getAllPatients,
  getPatientsForFollowup,
  getPatientById,
  addCallToHistory,
  backfillCurrentTriage,
};