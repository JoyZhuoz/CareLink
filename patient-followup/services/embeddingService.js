import esClient from '../config/elasticsearch.js';

const INFERENCE_ID = 'carelink-e5-embedding';

async function generateEmbedding(text) {
  const response = await esClient.inference.inference({
    inference_id: INFERENCE_ID,
    task_type: 'text_embedding',
    input: text
  });

  // Response format: { text_embedding: [{ embedding: [0.05, ...] }] }
  const results = response.text_embedding;
  if (Array.isArray(results) && results[0]?.embedding) {
    return results[0].embedding;
  }
  // Fallback if format differs
  return results;
}

/**
 * Store Perplexity expected recovery text on the patient document.
 * Embedding is attempted but optional — text is always saved.
 */
async function storeExpectedResponseEmbedding(patientId, expectedResponse) {
  // Always save the text first
  await esClient.update({
    index: 'patients',
    id: patientId,
    doc: {
      expected_response_text: expectedResponse,
    }
  });
  console.log(`Saved expected_response_text for ${patientId}`);

  // Try to generate and store embedding (optional)
  try {
    const embedding = await generateEmbedding(expectedResponse);
    await esClient.update({
      index: 'patients',
      id: patientId,
      doc: {
        expected_response_embedding: embedding,
      }
    });
    console.log(`Saved embedding for ${patientId}`);
    return embedding;
  } catch (embErr) {
    console.warn(`Embedding skipped for ${patientId} (text still saved):`, embErr.message);
    return null;
  }
}

/**
 * Compare patient transcript against stored expected response.
 * Falls back to text-based comparison if embedding is unavailable.
 */
async function compareResponses(patientId, transcript) {
  // Try vector comparison first
  try {
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
        ? 'Response differs from expected - flag for review'
        : 'Response within normal range'
    };
  } catch (err) {
    console.warn('Vector comparison unavailable, using text fallback:', err.message);

    // Fallback: keyword overlap comparison
    const patient = await esClient.get({ index: 'patients', id: patientId }).catch(() => null);
    const expectedText = (patient?._source?.expected_response_text || '').toLowerCase();
    const transcriptLower = transcript.toLowerCase();

    const warningKeywords = ['fever', 'infection', 'bleeding', 'swelling', 'redness', 'pain', 'nausea', 'vomiting', 'breathing', 'chest'];
    const mentionedWarnings = warningKeywords.filter(w => transcriptLower.includes(w));
    const expectedWarnings = warningKeywords.filter(w => expectedText.includes(w));
    const matchedWarnings = mentionedWarnings.filter(w => expectedWarnings.includes(w));

    const flagged = mentionedWarnings.length > 0;

    return {
      similarity_score: null,
      flagged,
      message: flagged
        ? `Patient mentioned warning keywords: ${mentionedWarnings.join(', ')}`
        : 'No warning keywords detected in transcript'
    };
  }
}

export { generateEmbedding, storeExpectedResponseEmbedding, compareResponses };