import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Current Perplexity chat model (see https://docs.perplexity.ai/docs/model-cards)
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';

async function getExpectedRecoveryResponse(patient) {
  const { surgery_type, age, gender, risk_factors } = patient;

  const prompt = `For a ${age}-year-old ${gender} patient who underwent ${surgery_type} surgery with risk factors: ${(risk_factors && risk_factors.length) ? risk_factors.join(', ') : 'none'}.

Describe expected recovery symptoms 2-7 days post-surgery:
1. Normal/expected symptoms
2. Warning signs requiring medical attention
3. Typical pain levels and mobility expectations

Keep it concise and medically accurate.`;

  const response = await axios.post(
    'https://api.perplexity.ai/chat/completions',
    {
      model: PERPLEXITY_MODEL,
      messages: [
        { role: 'system', content: 'You are a medical information assistant.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    }
  );

  if (response.status !== 200) {
    const errBody = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
    throw new Error(`Perplexity API ${response.status}: ${errBody}`);
  }

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Perplexity API returned no content');
  }
  return content;
}

export { getExpectedRecoveryResponse };