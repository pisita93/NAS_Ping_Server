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

## Deploy on Synology via Portainer

These steps assume Container Manager / Docker is installed and Portainer is running.

### 1. Create a folder on the NAS

Via File Station (or SSH), create:

```
/volume1/docker/nas-ping-server/
/volume1/docker/nas-ping-server/data/
```

The `data/` folder will hold the SQLite database and sessions.

### 2. Copy the project to the NAS

Either clone with `git`:

```bash
ssh admin@nas
cd /volume1/docker/nas-ping-server
git clone https://github.com/<you>/NAS_Ping_Server.git app
```

…or upload the project files via File Station to
`/volume1/docker/nas-ping-server/app`.

### 3. Create the `.env` file

In `/volume1/docker/nas-ping-server/app/.env`:

```env
TZ=Asia/Bangkok
SESSION_SECRET=<long random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<choose one — only used on first boot>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your.address@gmail.com
SMTP_PASS=<gmail app password>
NOTIFY_FROM=NAS Ping Server <your.address@gmail.com>
NOTIFY_TO=your.address@gmail.com
NOTIFY_FAILURE_THRESHOLD=2

PUBLIC_URL=http://nas.local:5500
```

> **Gmail app password**: with 2-Step Verification enabled, generate one at
> <https://myaccount.google.com/apppasswords>. Your normal Gmail password will
> not work for SMTP.

### 4. Deploy in Portainer

1. Portainer → **Stacks** → **Add stack**
2. Name: `nas-ping-server`
3. Build method: **Upload** (upload `docker-compose.yml`) **or** **Web editor**
   (paste its contents).
4. Under **Environment variables**, either click **Load variables from .env file**
   and upload your `.env`, or paste each variable manually.
5. Edit the `volumes:` line so the host path matches the NAS, e.g.:

   ```yaml
   volumes:
     - /volume1/docker/nas-ping-server/data:/data
   ```

6. Edit the `build: .` line: Portainer stacks built from the web editor cannot
   build from a local folder. Two options:
   - **Easiest** — push this repo to GitHub Container Registry / Docker Hub,
     replace `build: .` with `image: ghcr.io/<you>/nas-ping-server:latest`.
   - **Or** — build the image once on the NAS via SSH:

     ```bash
     cd /volume1/docker/nas-ping-server/app
     docker build -t nas-ping-server:local .
     ```
     then change the compose file to `image: nas-ping-server:local`.

7. **Deploy the stack.** Browse to `http://<nas-ip>:5500` and log in.

### 5. (Optional) Reverse proxy with HTTPS

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
