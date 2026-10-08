# Deploying Matrimony Backend on Render (via Docker)

This NestJS backend is containerized and configured for zero-hassle deployment on **Render** using Docker.

---

## Method 1: 1-Click Deployment with Render Blueprint (Recommended)

Render Blueprints read the included [`render.yaml`](./render.yaml) and automatically configure:
1. A **PostgreSQL Database** (`matrimony-db`)
2. A **Docker Web Service** (`matrimony-backend`) with connected `DATABASE_URL`, health checks, and secrets.

### Steps:
1. Push your code to your GitHub / GitLab repository.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** -> **Blueprint**.
4. Select your backend repository and branch.
5. Render will detect `render.yaml` and show the services to create:
   - `matrimony-backend` (Docker Web Service)
   - `matrimony-db` (PostgreSQL)
6. Click **Apply**.
7. Render will build the Docker container, run database migrations automatically, and deploy your live API!

---

## Method 2: Manual Web Service Deployment on Render

If you already have a PostgreSQL database (e.g., Supabase, Neon, or an existing Render Postgres instance):

### Steps:
1. Push your project to GitHub / GitLab.
2. In [Render Dashboard](https://dashboard.render.com/), click **New +** -> **Web Service**.
3. Connect your repository.
4. Render will detect the `Dockerfile`:
   - **Runtime**: `Docker`
   - **Region**: Choose the region closest to your database (e.g., `Oregon`, `Frankfurt`, or `Singapore`).
   - **Branch**: `main` (or your active branch).
5. In **Environment Variables**, add the following:

| Key | Example Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `10000` | Render port (handled dynamically) |
| `API_PREFIX` | `api/v1` | Global API prefix |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname?sslmode=require` | Your PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | `generate-a-strong-random-secret` | 32+ char secret for JWT authentication |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Token expiration |
| `CORS_ORIGINS` | `*` or `https://your-frontend-domain.com` | Allowed CORS origins |
| `LOG_LEVEL` | `info` | Logging verbosity |

6. In **Advanced Settings**:
   - **Health Check Path**: `/api/v1/health`
7. Click **Create Web Service**.

---

## Automated Features Included in This Setup

- **Automated Database Migrations**: The container includes [`docker-entrypoint.sh`](./docker-entrypoint.sh) which runs `npx prisma migrate deploy` on container startup whenever `DATABASE_URL` is present.
- **Network Interface**: Configured to listen on `0.0.0.0` (required for Render router connectivity).
- **Multi-Stage Dockerfile**: Builds in Alpine Linux with OpenSSL, native compile tools for Argon2, and non-root execution (`USER node`) for security.
- **Uploads Directory**: Created with proper permissions inside the container for media uploads.
- **Health Checks**: Responds with HTTP 200 on `/api/v1/health` and `/` for Render zero-downtime health probing.
