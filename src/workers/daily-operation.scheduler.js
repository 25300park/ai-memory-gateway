require("dotenv").config();

const {
  shouldRunDailyAutomationNow,
  runDailyOperationAutomation
} = require("../services/system.service");

const intervalSeconds = Math.max(Number(process.env.DAILY_OPERATION_SCHEDULER_INTERVAL_SECONDS || 60), 15);
let isRunning = false;

async function tick() {
  if (isRunning) {
    console.log("[Daily Operation Scheduler] Previous tick is still running. Skipping.");
    return;
  }

  isRunning = true;

  try {
    const decision = await shouldRunDailyAutomationNow();
    console.log(`[Daily Operation Scheduler] ${new Date().toISOString()} - ${decision.reason}`);

    if (decision.should_run) {
      const result = await runDailyOperationAutomation({
        run_type: "scheduler"
      });

      console.log("[Daily Operation Scheduler] Run completed:", {
        ok: result.ok,
        run_id: result.run_id,
        run_date: result.run_date,
        overall_status: result.overall_status,
        health_check_id: result.health_check_id,
        errors: result.errors
      });
    }
  } catch (error) {
    console.error("[Daily Operation Scheduler] Tick error:", error);
  } finally {
    isRunning = false;
  }
}

console.log("Daily Operation Scheduler starting...");
console.log("Interval seconds =", intervalSeconds);

tick();
setInterval(tick, intervalSeconds * 1000);
