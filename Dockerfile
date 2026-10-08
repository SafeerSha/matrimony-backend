# ==========================================
# 1. Base / Dependencies Stage
# ==========================================
FROM node:22-alpine AS dependencies
WORKDIR /app

# Install native compilation dependencies for Argon2 and OpenSSL for Prisma on Alpine
RUN apk add --no-cache libc6-compat openssl python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps
RUN npx prisma generate

# ==========================================
# 2. Build Stage
# ==========================================
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ==========================================
# 3. Production Runner Stage
# ==========================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL & libc compatibility for Prisma runtime on Alpine
RUN apk add --no-cache libc6-compat openssl

# Prepare uploads directory with permissions for node user
RUN mkdir -p /app/uploads && chown -R node:node /app

# Copy dependencies, compiled code, Prisma files and entrypoint
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && chown -R node:node /app

USER node

# Render routes to the port in process.env.PORT (typically 10000 or custom)
EXPOSE 4000
EXPOSE 10000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
