const { db } = require('./db');

function rowToJob(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: !!row.enabled,
    headers: safeJson(row.headers, {}),
  };
}

function safeJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function listJobs() {
  return db
    .prepare('SELECT * FROM jobs ORDER BY id ASC')
    .all()
    .map(rowToJob);
}

function getJob(id) {
  return rowToJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
}

function createJob(input) {
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO jobs
        (name, url, method, headers, body, schedule, timeout_ms,
         expected_status, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.url,
      input.method || 'GET',
      JSON.stringify(input.headers || {}),
      input.body || null,
      input.schedule,
      input.timeout_ms || 15000,
      input.expected_status || 200,
      input.enabled ? 1 : 0,
      now,
      now
    );
  return getJob(result.lastInsertRowid);
}

function updateJob(id, input) {
  const now = Date.now();
  db.prepare(
    `UPDATE jobs SET
       name = ?, url = ?, method = ?, headers = ?, body = ?,
       schedule = ?, timeout_ms = ?, expected_status = ?,
       enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.name,
    input.url,
    input.method || 'GET',
    JSON.stringify(input.headers || {}),
    input.body || null,
    input.schedule,
    input.timeout_ms || 15000,
    input.expected_status || 200,
    input.enabled ? 1 : 0,
    now,
    id
  );
  return getJob(id);
}

function deleteJob(id) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

function setEnabled(id, enabled) {
  db.prepare('UPDATE jobs SET enabled = ?, updated_at = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    Date.now(),
    id
  );
  return getJob(id);
}

function recordExecution(jobId, exec) {
  db.prepare(
    `INSERT INTO executions
       (job_id, started_at, duration_ms, status_code, ok, error, response_snippet)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    jobId,
    exec.started_at,
    exec.duration_ms,
    exec.status_code ?? null,
    exec.ok ? 1 : 0,
    exec.error ?? null,
    exec.response_snippet ?? null
  );
}

function pruneExecutions(jobId, keep) {
  db.prepare(
    `DELETE FROM executions
     WHERE job_id = ?
       AND id NOT IN (
         SELECT id FROM executions
         WHERE job_id = ?
         ORDER BY started_at DESC
         LIMIT ?
       )`
  ).run(jobId, jobId, keep);
}

function listExecutions(jobId, limit = 50) {
  return db
    .prepare(
      `SELECT * FROM executions
       WHERE job_id = ?
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(jobId, limit);
}

function jobStats(jobId) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(ok) AS ok_count,
         AVG(duration_ms) AS avg_duration
       FROM executions WHERE job_id = ?`
    )
    .get(jobId);
}

function bumpFailureCounter(jobId) {
  db.prepare(
    'UPDATE jobs SET consecutive_failures = consecutive_failures + 1 WHERE id = ?'
  ).run(jobId);
  return db
    .prepare('SELECT consecutive_failures FROM jobs WHERE id = ?')
    .get(jobId).consecutive_failures;
}

function resetFailureCounter(jobId) {
  db.prepare(
    'UPDATE jobs SET consecutive_failures = 0, last_notified_at = NULL WHERE id = ?'
  ).run(jobId);
}

function markNotified(jobId) {
  db.prepare('UPDATE jobs SET last_notified_at = ? WHERE id = ?').run(
    Date.now(),
    jobId
  );
}

module.exports = {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  setEnabled,
  recordExecution,
  pruneExecutions,
  listExecutions,
  jobStats,
  bumpFailureCounter,
  resetFailureCounter,
  markNotified,
};
