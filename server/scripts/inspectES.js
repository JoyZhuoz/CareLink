/**
 * One-off script to print what's in Elasticsearch (for debugging graph/symptoms).
 * Run from repo root: node server/scripts/inspectES.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const esClient = require("../config/elasticsearch");
const elasticService = require("../services/elasticService");

async function main() {
  console.log("--- Elasticsearch indices ---\n");

  for (const indexName of ["patients", "check_in_calls", "clinician_summaries"]) {
    try {
      const countResp = await esClient.count({ index: indexName });
      const count = countResp.count ?? 0;
      console.log(`${indexName}: ${count} documents`);

      if (count > 0) {
        const searchResp = await esClient.search({
          index: indexName,
          query: { match_all: {} },
          size: 2,
        });
        const hits = searchResp.hits?.hits || [];
        hits.forEach((h, i) => {
          console.log(`  Sample ${i + 1} (_id: ${h._id}):`);
          console.log(JSON.stringify(h._source, null, 2).split("\n").map((l) => "    " + l).join("\n"));
        });
      }
      console.log("");
    } catch (err) {
      console.log(`${indexName}: ERROR ${err.message}\n`);
    }
  }

  console.log("--- Graph-relevant counts ---");
  const [patients, calls, summaries] = await Promise.all([
    elasticService.getAllPatients(),
    elasticService.getAllCheckInCalls(),
    elasticService.getAllClinicianSummaries(),
  ]);
  console.log(`Patients: ${patients.length}`);
  console.log(`Check-in calls: ${calls.length}`);
  console.log(`Clinician summaries: ${summaries.length}`);

  if (calls.length > 0) {
    const first = calls[0];
    console.log("\nFirst check_in_call keys:", Object.keys(first));
    console.log("First call transcript type:", first.transcript == null ? "null/undefined" : typeof first.transcript);
    if (first.transcript != null) {
      console.log("First call transcript (first 500 chars):", JSON.stringify(first.transcript).slice(0, 500));
    }
  }
  if (summaries.length > 0) {
    const first = summaries[0];
    console.log("\nFirst clinician_summary keys:", Object.keys(first));
    console.log("summary_text (first 200 chars):", (first.summary_text || "").slice(0, 200));
    console.log("concerning_findings (first 200 chars):", (first.concerning_findings || "").slice(0, 200));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
