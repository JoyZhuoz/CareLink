import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';

// Load .env FIRST before anything else
dotenv.config();

// Debug output
console.log('=== Environment Check ===');
console.log('ELASTICSEARCH_CLOUD_ID:', process.env.ELASTICSEARCH_CLOUD_ID || '[MISSING]');
console.log('ELASTICSEARCH_API_KEY:', process.env.ELASTICSEARCH_API_KEY ? '[EXISTS]' : '[MISSING]');
console.log('=========================');

// Validate before creating client
if (!process.env.ELASTICSEARCH_CLOUD_ID) {
  throw new Error('ELASTICSEARCH_CLOUD_ID is missing from .env');
}

if (!process.env.ELASTICSEARCH_API_KEY) {
  throw new Error('ELASTICSEARCH_API_KEY is missing from .env');
}

const client = new Client({
  cloud: { id: process.env.ELASTICSEARCH_CLOUD_ID },
  auth: { apiKey: process.env.ELASTICSEARCH_API_KEY }
});

export default client;