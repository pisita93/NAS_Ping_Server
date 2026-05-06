const { request } = require('undici');

async function pingJob(job) {
  const started_at = Date.now();
  const headers = { 'user-agent': 'nas-ping-server/1.0', ...(job.headers || {}) };
  const hasBody = job.body && !['GET', 'HEAD'].includes(job.method);

  try {
    const { statusCode, body } = await request(job.url, {
      method: job.method,
      headers,
      body: hasBody ? job.body : undefined,
      headersTimeout: job.timeout_ms,
      bodyTimeout: job.timeout_ms,
    });

    let snippet = '';
    try {
      const text = await body.text();
      snippet = text.slice(0, 500);
    } catch {
      // ignore body read errors
    }

    const ok = statusCode === job.expected_status;
    return {
      started_at,
      duration_ms: Date.now() - started_at,
      status_code: statusCode,
      ok,
      error: ok ? null : `expected ${job.expected_status}, got ${statusCode}`,
      response_snippet: snippet,
    };
  } catch (err) {
    return {
      started_at,
      duration_ms: Date.now() - started_at,
      status_code: null,
      ok: false,
      error: err.message || String(err),
      response_snippet: null,
    };
  }
}

module.exports = { pingJob };
