const { Client } = require("@elastic/elasticsearch");

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  auth: process.env.ELASTICSEARCH_API_KEY
    ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
    : undefined,
  requestTimeout: 30000,
  tls: process.env.ELASTICSEARCH_CA_CERT
    ? { ca: process.env.ELASTICSEARCH_CA_CERT }
    : undefined,
});

module.exports = esClient;
