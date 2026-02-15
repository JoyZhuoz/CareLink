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

async function addPatient(patient) {
  return await esClient.index({
    index: INDEX_NAME,
    id: patient.patient_id,
    document: patient
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
  return await esClient.update({
    index: INDEX_NAME,
    id: patientId,
    script: {
      source: 'ctx._source.call_history.add(params.call)',
      params: { call: callData }
    }
  });
}

async function updatePatientFields(patientId, fields) {
  return await esClient.update({
    index: INDEX_NAME,
    id: patientId,
    doc: fields,
  });
}

async function escalateLatestCallTriage(patientId) {
  return await esClient.update({
    index: INDEX_NAME,
    id: patientId,
    script: {
      source: `
        if (ctx._source.call_history != null && ctx._source.call_history.size() > 0) {
          def last = ctx._source.call_history[ctx._source.call_history.size() - 1];

          // Determine current level from either path
          def level = null;
          if (last.containsKey('triage_level') && last.triage_level != null) {
            level = last.triage_level;
          } else if (last.containsKey('fields') && last.fields != null
                     && last.fields.containsKey('triage_level')
                     && last.fields.triage_level != null
                     && last.fields.triage_level.size() > 0) {
            level = last.fields.triage_level[0];
          }

          // Compute new level
          def newLevel;
          if (level == null || level == 'green') {
            newLevel = 'yellow';
          } else if (level == 'yellow') {
            newLevel = 'red';
          } else {
            newLevel = level;
          }

          // Write back to both paths so reads always find it
          last.triage_level = newLevel;
          if (last.containsKey('fields') && last.fields != null) {
            last.fields.triage_level = [newLevel];
          }
        }
      `,
      lang: 'painless',
    },
  });
}

export {
  createIndex,
  addPatient,
  bulkImportPatients,
  getAllPatients,
  getPatientsForFollowup,
  getPatientById,
  addCallToHistory,
  updatePatientFields,
  escalateLatestCallTriage
};