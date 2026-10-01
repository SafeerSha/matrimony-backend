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
