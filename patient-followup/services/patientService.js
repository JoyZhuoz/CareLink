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
        ],
        must_not: [
          {
            nested: {
              path: 'call_history',
              query: { exists: { field: 'call_history.call_date' } }
            }
          }
        ]
      }
    }
  });

  return response.hits.hits.map(hit => ({
    id: hit._id,
    ...hit._source
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

export {
  createIndex,
  addPatient,
  bulkImportPatients,
  getPatientsForFollowup,
  getPatientById,
  addCallToHistory
};