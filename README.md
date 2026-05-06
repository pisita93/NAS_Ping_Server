# NAS Ping Server

Self-hosted, cron-job.org‑style web app that pings HTTP endpoints on a schedule.
Built primarily to keep Render.com free-tier services awake from a Synology NAS
(running via Portainer), with Gmail email notifications on failure.

## Features

- Web UI to create / edit / pause / delete ping jobs
- Cron-style schedules (e.g. `*/14 * * * *` for every 14 minutes)
- Per-job: HTTP method, headers, body, timeout, expected status code
- Run-now button + execution history with success rate, latency, errors
- Single-admin login (bcrypt + signed session cookie, sessions persisted to SQLite)
- Gmail SMTP notifications after N consecutive failures
- SQLite storage in a single mounted volume — easy NAS backups
- Docker / docker-compose deployment, ready for Portainer

## Quick start (local)

```bash
cp .env.example .env
# edit .env (at minimum: SESSION_SECRET, ADMIN_PASSWORD, SMTP_*)
npm install
npm start
```

Open <http://localhost:5500> and sign in with the admin credentials from `.env`.

## Deploy on Synology via Portainer (zero manual build)

The image is auto-built and published to GitHub Container Registry by the
[`docker-publish.yml`](.github/workflows/docker-publish.yml) workflow on every
push to a default/release branch. Portainer pulls that image directly — no SSH,
no `docker build`, no file uploads to the NAS.

### One-time setup (first deploy only)

1. **Push this repo to GitHub** (already done if you cloned this).
2. **Wait for the first GitHub Actions run to finish** (Actions tab → green
   check). It publishes `ghcr.io/pisita93/nas-ping-server:latest`.
3. **Make the package public** so Portainer can pull it without auth:
   - GitHub → your profile → **Packages** → `nas-ping-server`
   - **Package settings** → **Change visibility** → **Public**

### Deploy the stack in Portainer

1. Portainer → **Stacks** → **Add stack**
2. **Name:** `nas-ping-server`
3. **Build method:** **Repository**
4. Fill in:
   - **Repository URL:** `https://github.com/pisita93/NAS_Ping_Server`
   - **Repository reference:** `refs/heads/main` (or whichever branch you push to)
   - **Compose path:** `docker-compose.yml`
   - (Optional) Tick **Automatic updates** + **Re-pull image** so Portainer
     redeploys whenever you push a new image to GHCR.
5. Under **Environment variables**, add at minimum:

   | Key | Example |
   | --- | --- |
   | `SESSION_SECRET` | `<long random string>` |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | `<your initial password>` |
   | `SMTP_USER` | `you@gmail.com` |
   | `SMTP_PASS` | `<gmail app password>` |
   | `NOTIFY_FROM` | `NAS Ping Server <you@gmail.com>` |
   | `NOTIFY_TO` | `you@gmail.com` |
   | `PUBLIC_URL` | `http://nas.local:5500` |
   | `DATA_PATH` | `/volume1/docker/nas-ping-server/data` *(recommended on Synology so backups are easy; omit to use a Docker-managed volume)* |

   > **Gmail app password**: with 2-Step Verification enabled, generate one at
   > <https://myaccount.google.com/apppasswords>. Your normal Gmail password
   > will not work for SMTP.

6. **Deploy the stack.** Browse to `http://<nas-ip>:5500` and log in.

### Updating

Push a new commit → GitHub Actions rebuilds → Portainer's automatic update
re-pulls and recreates the container. Or click **Pull and redeploy** in
Portainer manually.

### (Optional) Reverse proxy with HTTPS

Use Synology's built-in Reverse Proxy (Control Panel → Login Portal →
Advanced → Reverse Proxy) to expose the app at e.g.
`https://ping.your-domain.com` with a Let's Encrypt certificate.
Update `PUBLIC_URL` in `.env` to match.

## Cron schedule cheat sheet

| Goal                              | Expression       |
| --------------------------------- | ---------------- |
| Every minute                      | `* * * * *`      |
| Every 10 minutes                  | `*/10 * * * *`   |
| **Every 14 minutes (Render)**     | `*/14 * * * *`   |
| Top of every hour                 | `0 * * * *`      |
| 9:00 weekdays                     | `0 9 * * 1-5`    |

Render.com free services sleep after ~15 minutes of inactivity, so a 14-minute
interval keeps them awake comfortably.

## Configuration reference

| Variable                   | Default              | Notes                                                |
| -------------------------- | -------------------- | ---------------------------------------------------- |
| `PORT`                     | `5500`               | HTTP port inside the container                       |
| `TZ`                       | `Asia/Bangkok`       | Container timezone (affects cron + log timestamps)   |
| `DATA_DIR`                 | `/data`              | SQLite + session storage                             |
| `SESSION_SECRET`           | —                    | **Required.** Long random string                     |
| `ADMIN_USERNAME`           | `admin`              | Used only on first boot                              |
| `ADMIN_PASSWORD`           | `changeme`           | Used only on first boot — change in UI after login   |
| `SMTP_HOST`                | `smtp.gmail.com`     |                                                      |
| `SMTP_PORT`                | `465`                | `465` = SSL, `587` = STARTTLS                        |
| `SMTP_SECURE`              | `true`               | `true` for port 465, `false` for 587                 |
| `SMTP_USER` / `SMTP_PASS`  | —                    | Gmail address + **app password**                     |
| `NOTIFY_FROM`              | `SMTP_USER`          | RFC822 sender                                        |
| `NOTIFY_TO`                | —                    | Where failure alerts go                              |
| `NOTIFY_FAILURE_THRESHOLD` | `2`                  | Send email every Nth consecutive failure             |
| `EXECUTION_RETENTION`      | `1000`               | History rows kept per job                            |
| `PUBLIC_URL`               | —                    | Used to build links inside notification emails       |

## Backup

Stop the stack, then back up the `data/` directory — that's the entire state
(jobs, history, sessions, admin password hash).

## Project layout

```
src/
  server.js     - Express bootstrap
  routes.js     - HTTP routes (login, jobs CRUD, run-now, settings)
  auth.js       - bcrypt + session helpers
  db.js         - SQLite init + schema + first-run admin seed
  jobs.js       - Job + execution data access
  scheduler.js  - node-cron scheduling, run loop, retention
  pinger.js     - The actual HTTP ping (undici)
  mailer.js     - Gmail / SMTP failure notifications
views/          - EJS templates
public/         - Static CSS
Dockerfile, docker-compose.yml, .env.example
```

## License

MIT.
