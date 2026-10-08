#!/bin/sh
set -e

echo "Starting Matrimony Backend container..."

# Run database migrations if DATABASE_URL is configured
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL detected. Applying Prisma database migrations..."
  npx prisma migrate deploy || {
    echo "WARNING: Prisma migration deploy failed or database is not reachable yet."
    echo "Continuing container startup..."
  }
else
  echo "DATABASE_URL is not set. Skipping Prisma database migrations."
fi

# Execute CMD passed to container (e.g. node dist/main.js)
exec "$@"
