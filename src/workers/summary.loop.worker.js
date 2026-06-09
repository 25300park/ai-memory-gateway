const { processSummaryQueueBatch, getSummaryWorkerStatus, stringifySafe } = require("../services/summary-worker.service");

const BATCH_LIMIT = Number(process.env.SUMMARY_WORKER_BATCH_LIMIT || 5);
const INTERVAL_MS = Number(process.env.SUMMARY_WORKER_INTERVAL_MS || 30000);
const PROJECT_CODE = process.env.SUMMARY_WORKER_PROJECT_CODE || null;

let isRunning = false;

async function runLoopOnce() {
  if (isRunning) {
    console.log("Previous summary worker cycle still running. Skipping this cycle.");
    return;
  }

  isRunning = true;

  try {
    const statusBefore = await getSummaryWorkerStatus({ project_code: PROJECT_CODE, recent_limit: 5 });
    console.log(`[${new Date().toISOString()}] Summary worker status before cycle:`);
    console.log(stringifySafe({ worker_status: statusBefore.worker_status, counts: statusBefore.counts }));

    const result = await processSummaryQueueBatch({
      limit: BATCH_LIMIT,
      project_code: PROJECT_CODE,
      source: "worker_loop"
    });

    console.log(`[${new Date().toISOString()}] Summary loop result:`);
    console.log(stringifySafe(result));
  } catch (error) {
    console.error("Summary loop fatal error:", error.message);
  } finally {
    isRunning = false;
  }
}

async function main() {
  console.log("Summary Loop Worker started.");
  console.log(`Interval: ${INTERVAL_MS / 1000} seconds`);
  console.log(`Batch limit: ${BATCH_LIMIT}`);
  console.log(`Project filter: ${PROJECT_CODE || "all"}`);

  await runLoopOnce();
  setInterval(runLoopOnce, INTERVAL_MS);
}

main();
