const { processSummaryQueueBatch, stringifySafe } = require("../services/summary-worker.service");
const pool = require("../config/db");

async function main() {
  const limit = Number(process.env.SUMMARY_WORKER_BATCH_LIMIT || 5);
  const project_code = process.env.SUMMARY_WORKER_PROJECT_CODE || null;

  console.log("Summary Worker started.");
  console.log(`Batch limit: ${limit}`);
  console.log(`Project filter: ${project_code || "all"}`);

  try {
    const result = await processSummaryQueueBatch({
      limit,
      project_code,
      source: "worker_once"
    });

    console.log("Summary worker result:");
    console.log(stringifySafe(result));
  } catch (error) {
    console.error("Summary worker fatal error:", error);
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch (error) {
      // ignore pool end errors during worker shutdown
    }
  }
}

main();
