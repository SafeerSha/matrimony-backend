# Matrimony Backend

Production-oriented NestJS foundation for the Matrimony application.

## Requirements
- Node.js LTS
- npm
- Docker Desktop

## Local setup

```powershell
Copy-Item .env.example .env
npm install
npx prisma generate
docker compose up -d
npx prisma migrate dev --name init
npm run start:dev
```

API: http://localhost:4000/api/v1/health

## Keep-alive automation (GitHub Actions)

The workflow `.github/workflows/keep-render-alive.yml` periodically sends a `GET` request to the backend's public, lightweight health endpoint (`/api/v1/health`) to reduce the chance of the free Render service going inactive due to inactivity. It runs every 10 minutes on GitHub-hosted runners, so it does not depend on any local development machine.

### Configuration

1. In the GitHub repository, go to **Settings → Secrets and variables → Actions → Variables**.
2. Create a repository variable named `RENDER_BACKEND_URL` containing the backend base URL, for example `https://your-app.onrender.com` (scheme and host only, no trailing slash).
3. The workflow appends `/api/v1/health` to that base URL automatically.

### Manual run

Go to **Actions → Keep Render Backend Alive → Run workflow** (the workflow also supports `workflow_dispatch`).

### Execution logs

Open **Actions → Keep Render Backend Alive** and select a run. Each attempt logs the UTC timestamp, target endpoint, HTTP status code, and whether the check succeeded or failed. Response bodies are discarded and never logged.

> Scheduled execution is best-effort: GitHub Actions may start scheduled workflows late or skip runs during heavy load. This workflow reduces the chance of inactivity sleep but does **not** guarantee uptime.
