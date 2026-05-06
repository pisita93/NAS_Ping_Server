const express = require('express');
const cron = require('node-cron');
const { verifyLogin, changePassword, requireAuth } = require('./auth');
const {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  setEnabled,
  listExecutions,
  jobStats,
} = require('./jobs');
const { rescheduleJob, unscheduleJob, runJob, nextRunAt } = require('./scheduler');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = verifyLogin(username, password);
  if (!user) return res.render('login', { error: 'Invalid credentials' });
  req.session.user = user;
  res.redirect('/');
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/', requireAuth, (req, res) => {
  const jobs = listJobs().map((j) => {
    const last = listExecutions(j.id, 1)[0];
    return {
      ...j,
      next_run_at: j.enabled ? nextRunAt(j.schedule) : null,
      last_execution: last || null,
    };
  });
  res.render('jobs', { user: req.session.user, jobs });
});

router.get('/jobs/new', requireAuth, (req, res) => {
  res.render('job_form', {
    user: req.session.user,
    job: null,
    error: null,
  });
});

router.post('/jobs/new', requireAuth, (req, res) => {
  const input = parseJobInput(req.body);
  const err = validateJobInput(input);
  if (err) {
    return res.render('job_form', { user: req.session.user, job: input, error: err });
  }
  const job = createJob(input);
  rescheduleJob(job.id);
  res.redirect(`/jobs/${job.id}`);
});

router.get('/jobs/:id', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send('Not found');
  const executions = listExecutions(job.id, 100);
  const stats = jobStats(job.id);
  res.render('job_detail', {
    user: req.session.user,
    job,
    executions,
    stats,
    next_run_at: job.enabled ? nextRunAt(job.schedule) : null,
  });
});

router.get('/jobs/:id/edit', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send('Not found');
  res.render('job_form', { user: req.session.user, job, error: null });
});

router.post('/jobs/:id/edit', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send('Not found');
  const input = parseJobInput(req.body);
  const err = validateJobInput(input);
  if (err) {
    return res.render('job_form', {
      user: req.session.user,
      job: { ...input, id: job.id },
      error: err,
    });
  }
  updateJob(job.id, input);
  rescheduleJob(job.id);
  res.redirect(`/jobs/${job.id}`);
});

router.post('/jobs/:id/toggle', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send('Not found');
  setEnabled(job.id, !job.enabled);
  rescheduleJob(job.id);
  res.redirect(req.get('referer') || '/');
});

router.post('/jobs/:id/run', requireAuth, async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send('Not found');
  await runJob(job.id);
  res.redirect(`/jobs/${job.id}`);
});

router.post('/jobs/:id/delete', requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send('Not found');
  unscheduleJob(job.id);
  deleteJob(job.id);
  res.redirect('/');
});

router.get('/settings', requireAuth, (req, res) => {
  res.render('settings', {
    user: req.session.user,
    message: null,
    error: null,
  });
});

router.post('/settings/password', requireAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const ok = verifyLogin(req.session.user.username, current_password);
  if (!ok) {
    return res.render('settings', {
      user: req.session.user,
      message: null,
      error: 'Current password is incorrect',
    });
  }
  if (!new_password || new_password.length < 8) {
    return res.render('settings', {
      user: req.session.user,
      message: null,
      error: 'New password must be at least 8 characters',
    });
  }
  if (new_password !== confirm_password) {
    return res.render('settings', {
      user: req.session.user,
      message: null,
      error: 'Passwords do not match',
    });
  }
  changePassword(req.session.user.id, new_password);
  res.render('settings', {
    user: req.session.user,
    message: 'Password updated.',
    error: null,
  });
});

router.get('/healthz', (req, res) => res.send('ok'));

function parseJobInput(body) {
  let headers = {};
  if (body.headers && body.headers.trim()) {
    try {
      headers = JSON.parse(body.headers);
    } catch {
      headers = '__INVALID__';
    }
  }
  return {
    name: (body.name || '').trim(),
    url: (body.url || '').trim(),
    method: (body.method || 'GET').toUpperCase(),
    headers,
    body: body.body || null,
    schedule: (body.schedule || '').trim(),
    timeout_ms: parseInt(body.timeout_ms || '15000', 10),
    expected_status: parseInt(body.expected_status || '200', 10),
    enabled: body.enabled === 'on' || body.enabled === 'true' || body.enabled === true,
  };
}

function validateJobInput(input) {
  if (!input.name) return 'Name is required';
  if (!input.url || !/^https?:\/\//i.test(input.url))
    return 'URL must start with http:// or https://';
  if (!cron.validate(input.schedule)) return 'Schedule must be a valid cron expression';
  if (input.headers === '__INVALID__') return 'Headers must be valid JSON';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(input.method))
    return 'Unsupported HTTP method';
  if (input.timeout_ms < 1000 || input.timeout_ms > 120000)
    return 'Timeout must be between 1000 and 120000 ms';
  return null;
}

module.exports = router;
