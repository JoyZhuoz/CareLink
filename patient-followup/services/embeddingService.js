import esClient from '../config/elasticsearch.js';

async function generateEmbedding(text) {
  const response = await esClient.inference.inference({
    inference_id: '.multilingual-e5-small',
    task_type: 'text_embedding',
    input: text
  });

  return response.text_embedding;
}

async function storeExpectedResponseEmbedding(patientId, expectedResponse) {
  const embedding = await generateEmbedding(expectedResponse);

  await esClient.update({
    index: 'patients',
    id: patientId,
    doc: {
      expected_response_text: expectedResponse,
      expected_response_embedding: embedding
    }
  });

  return embedding;
}

async function compareResponses(patientId, transcript) {
  const transcriptEmbedding = await generateEmbedding(transcript);

  const response = await esClient.search({
    index: 'patients',
    knn: {
      field: 'expected_response_embedding',
      query_vector: transcriptEmbedding,
      k: 1
    }
  });

  const score = response.hits.hits[0]?._score || 0;

  return {
    similarity_score: score,
    flagged: score < 0.7,
    message: score < 0.7
      ? '⚠️ Response differs from expected - flag for review'
      : '✓ Response within normal range'
  };
}

export { generateEmbedding, storeExpectedResponseEmbedding, compareResponses };