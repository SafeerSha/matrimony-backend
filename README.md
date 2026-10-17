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

## Media & Cloudflare R2 Object Storage

The application provides a provider-agnostic storage abstraction (`STORAGE_SERVICE`) supporting both local disk storage and Cloudflare R2 object storage.

### Storage Drivers

- `STORAGE_DRIVER=local` (Default): Stores media in the `./uploads` directory on local disk. Uploaded photos are served via `/uploads/<filename>`.
- `STORAGE_DRIVER=r2`: Uploads media to Cloudflare R2 using the S3-compatible API. Files are stored with structured keys: `<R2_KEY_PREFIX>/users/<userId>/<uuid>.<ext>` and served publicly via `R2_PUBLIC_BASE_URL`.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `STORAGE_DRIVER` | No | `local` | Storage driver (`local` or `r2`) |
| `R2_ACCOUNT_ID` | When R2 enabled | - | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | When R2 enabled | - | Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | When R2 enabled | - | Cloudflare R2 Secret Access Key |
| `R2_BUCKET` | When R2 enabled | - | R2 Bucket name |
| `R2_REGION` | No | `auto` | R2 Region (defaults to `auto`) |
| `R2_ENDPOINT` | When R2 enabled | - | S3 endpoint URL (`https://<account_id>.r2.cloudflarestorage.com`) |
| `R2_PUBLIC_BASE_URL` | When R2 enabled | - | Public URL base without trailing slash (e.g. `https://media.example.com`) |
| `R2_KEY_PREFIX` | No | `uploads/` | Key prefix for uploaded objects |
| `R2_MAX_UPLOAD_MB` | No | `5` | Maximum upload size in megabytes |

When `STORAGE_DRIVER=r2`, the application validates required R2 configuration on startup and fails fast if any required variables are missing.

### Cloudflare R2 Setup Steps

1. **Create Bucket**: In the Cloudflare dashboard, navigate to **R2 Storage** and click **Create bucket** (e.g., `matrimony-media`).
2. **Generate API Credentials**:
   - Go to **Manage R2 API Tokens** and click **Create API Token**.
   - Select permissions: **Object Read & Write**.
   - Scope to the specific bucket or account.
   - Record the `Access Key ID` and `Secret Access Key`.
3. **Configure Public Access**:
   - In bucket settings, navigate to **Settings → Public Access**.
   - Either enable the `r2.dev` public subdomain or connect a custom domain (e.g., `media.yourdomain.com`).
   - Use this URL (e.g., `https://media.yourdomain.com`) as `R2_PUBLIC_BASE_URL` (no trailing slash).
4. **Obtain Endpoint**:
   - Copy the S3 API endpoint URL formatted as `https://<account_id>.r2.cloudflarestorage.com` into `R2_ENDPOINT`.

### Render Deployment Configuration

- In `render.yaml`, `STORAGE_DRIVER=r2` and non-secret defaults (`R2_REGION=auto`, `R2_KEY_PREFIX=uploads/`) are declared.
- Secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_BASE_URL`, `R2_ACCOUNT_ID`) must be set via the **Render Dashboard → Environment** tab for the web service. Never commit real credentials to source control.

### Backward Compatibility & Scope

- **Legacy Photos**: Existing photos created prior to R2 integration (`/uploads/<filename>`) continue to be served via the static route and can be deleted cleanly from local disk.
- **Backups**: Scheduled media backups and external bucket replication/exports are out of scope.

