const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    headers TEXT NOT NULL DEFAULT '{}',
    body TEXT,
    schedule TEXT NOT NULL,
    timeout_ms INTEGER NOT NULL DEFAULT 15000,
    expected_status INTEGER NOT NULL DEFAULT 200,
    enabled INTEGER NOT NULL DEFAULT 1,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_notified_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    status_code INTEGER,
    ok INTEGER NOT NULL,
    error TEXT,
    response_snippet TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_executions_job_started
    ON executions(job_id, started_at DESC);
`);

function ensureAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (row.n > 0) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme';
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(username, hash, Date.now());
  console.log(`[db] created admin user "${username}"`);
}

ensureAdmin();

module.exports = { db, DATA_DIR };
