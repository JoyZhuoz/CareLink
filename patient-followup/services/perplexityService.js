import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function getExpectedRecoveryResponse(patient) {
  const { surgery_type, age, gender, risk_factors } = patient;

  const prompt = `For a ${age}-year-old ${gender} patient who underwent ${surgery_type} surgery with risk factors: ${risk_factors.length > 0 ? risk_factors.join(', ') : 'none'}.

Describe expected recovery symptoms 2-7 days post-surgery:
1. Normal/expected symptoms
2. Warning signs requiring medical attention
3. Typical pain levels and mobility expectations

Keep it concise and medically accurate.`;

  const response = await axios.post(
    'https://api.perplexity.ai/chat/completions',
    {
      model: 'llama-3.1-sonar-small-128k-online',
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
      }
    }
  );

  return response.data.choices[0].message.content;
}

export { getExpectedRecoveryResponse };