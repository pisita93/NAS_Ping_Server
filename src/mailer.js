const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function notifyFailure(job, exec, consecutiveFailures) {
  const t = getTransporter();
  if (!t) {
    console.warn('[mailer] SMTP not configured; skipping notification');
    return;
  }
  const to = process.env.NOTIFY_TO;
  const from = process.env.NOTIFY_FROM || process.env.SMTP_USER;
  if (!to) {
    console.warn('[mailer] NOTIFY_TO not set; skipping notification');
    return;
  }

  const subject = `[NAS Ping] FAIL: ${job.name} (${consecutiveFailures}x)`;
  const link = process.env.PUBLIC_URL
    ? `${process.env.PUBLIC_URL}/jobs/${job.id}`
    : `(set PUBLIC_URL to include a link)`;

  const lines = [
    `Job: ${job.name}`,
    `URL: ${job.method} ${job.url}`,
    `Consecutive failures: ${consecutiveFailures}`,
    `Status code: ${exec.status_code ?? '(none)'}`,
    `Duration: ${exec.duration_ms} ms`,
    `Error: ${exec.error ?? '(none)'}`,
    '',
    `Details: ${link}`,
  ];

  try {
    await t.sendMail({
      from,
      to,
      subject,
      text: lines.join('\n'),
    });
    console.log(`[mailer] failure notification sent for job ${job.id}`);
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
  }
}

module.exports = { notifyFailure };
