# Fortis Monthly Planner

Plan an entire month — Gantt timeline, projects, task allocation, work details, outputs and goals — and export it to a
formatted Excel workbook. Includes **sign up / sign in** and a **database** (SQLite), so each person's plan is saved to
their account and available from any device.

No npm packages to install. Needs Node.js 22.13+ only.

## Run locally

```bash
cd monthly-planner
npm start                 # http://localhost:3000
```

Data is stored in `./data/planner.db` (override with `DATA_DIR`).

## Put it live

The app is one container with one persistent folder. Any of these work:

**Render** — New + → Blueprint → pick this repo (uses `render.yaml`: Docker, 1 GB disk, generated session secret).

**Fly.io / Railway / any Docker host**

```bash
docker build -t fortis-planner monthly-planner
docker run -d -p 3000:3000 -v planner-data:/data -e SESSION_SECRET=$(openssl rand -hex 32) fortis-planner
```

Mount a **persistent volume at `/data`**, otherwise accounts and plans are lost on redeploy. Put the app behind HTTPS
(every host above does this for you); session cookies are then marked `Secure` automatically.

### Settings (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where `planner.db` lives. Back this folder up. |
| `SESSION_SECRET` | generated once into `DATA_DIR` | Signs login cookies. Set it explicitly on hosts with ephemeral disks. |
| `ALLOW_SIGNUP` | `true` | Set `false` once you and your team have registered; the first account can always be created. |
| `TRUST_PROXY` | `true` | Read client IP / HTTPS from `X-Forwarded-*` headers (correct behind a host's proxy). |

### What's included

- Passwords hashed with scrypt; HttpOnly, SameSite=Lax session cookie (30 days); login/sign-up rate limiting.
- Each account has a private plan; edits autosave. Editing the same plan in two tabs is detected and the latest copy is reloaded.
- CSP and security headers; `/healthz` endpoint for uptime checks.

Not included (add when needed): password reset by email, sharing one plan between several accounts.

## Using the app

Overview, Gantt Timeline (drag to reschedule, drag edges to resize, dependencies, milestones), Projects, Tasks,
Team & Allocation (daily hours heat-map, overload warnings), Goals & Outputs, and **Export Excel**
(Overview, Gantt Chart with live bars, Task Register, Allocation, Projects, Goals & Outputs, Team).
Shortcuts: `N` new task · `/` search · `Esc` close.

Without the server (opening `public/index.html` from a static host) it falls back to browser-only storage.
Vendored: ExcelJS 4.4.0 (MIT) in `public/vendor/`.
