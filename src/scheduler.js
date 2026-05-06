const cron = require('node-cron');
const cronParser = require('cron-parser');
const {
  listJobs,
  getJob,
  recordExecution,
  pruneExecutions,
  bumpFailureCounter,
  resetFailureCounter,
  markNotified,
} = require('./jobs');
const { pingJob } = require('./pinger');
const { notifyFailure } = require('./mailer');

const tasks = new Map(); // job.id -> cron task
const inFlight = new Set(); // job.id currently running

const RETENTION = parseInt(process.env.EXECUTION_RETENTION || '1000', 10);
const FAILURE_THRESHOLD = parseInt(
  process.env.NOTIFY_FAILURE_THRESHOLD || '2',
  10
);

async function runJob(jobId) {
  if (inFlight.has(jobId)) {
    console.log(`[scheduler] job ${jobId} already running; skipping tick`);
    return;
  }
  const job = getJob(jobId);
  if (!job || !job.enabled) return;

  inFlight.add(jobId);
  try {
    const exec = await pingJob(job);
    recordExecution(job.id, exec);
    pruneExecutions(job.id, RETENTION);

    if (exec.ok) {
      if (job.consecutive_failures > 0) resetFailureCounter(job.id);
    } else {
      const failures = bumpFailureCounter(job.id);
      if (failures >= FAILURE_THRESHOLD && failures % FAILURE_THRESHOLD === 0) {
        await notifyFailure(getJob(job.id), exec, failures);
        markNotified(job.id);
      }
    }
    return exec;
  } finally {
    inFlight.delete(jobId);
  }
}

function scheduleJob(job) {
  unscheduleJob(job.id);
  if (!job.enabled) return;
  if (!cron.validate(job.schedule)) {
    console.warn(`[scheduler] invalid cron for job ${job.id}: ${job.schedule}`);
    return;
  }
  const task = cron.schedule(job.schedule, () => {
    runJob(job.id).catch((err) =>
      console.error(`[scheduler] job ${job.id} crashed:`, err.message)
    );
  });
  tasks.set(job.id, task);
}

function unscheduleJob(jobId) {
  const t = tasks.get(jobId);
  if (t) {
    t.stop();
    tasks.delete(jobId);
  }
}

function rescheduleJob(jobId) {
  const job = getJob(jobId);
  if (!job) {
    unscheduleJob(jobId);
    return;
  }
  scheduleJob(job);
}

function nextRunAt(scheduleExpr) {
  try {
    return cronParser.parseExpression(scheduleExpr).next().toDate();
  } catch {
    return null;
  }
}

function start() {
  for (const job of listJobs()) scheduleJob(job);
  console.log(`[scheduler] started with ${tasks.size} active job(s)`);
}

module.exports = { start, scheduleJob, unscheduleJob, rescheduleJob, runJob, nextRunAt };
