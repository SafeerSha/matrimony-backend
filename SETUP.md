# Matrimony Backend Setup Guide

Welcome to the Matrimony Backend project! This guide walks you through setting up, configuring, running, and testing the backend service for local development and production readiness.

This project is built using **NestJS 12**, **Prisma ORM**, **PostgreSQL**, and **Socket.IO** (for real-time messaging). It provides a full set of services for Authentication (Password & Phone OTP), Onboarding, Profiles, Search & Discovery, Match Connections, Real-time Chat, Photo Moderation, and Administration.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js** (v18, v20, or v22 LTS recommended)
- **npm** (v9+ bundled with Node)
- **PostgreSQL** (v14+ running locally, via Docker, or hosted)
- **Git**

---

## 🚀 Step-by-Step Setup

### 1. Install Dependencies
Navigate to the root directory and install the project dependencies:

```bash
cd matrimony-backend-prod-v2
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to create your local `.env` configuration:

```bash
# On Linux / macOS / Git Bash
cp .env.example .env

# On Windows PowerShell
Copy-Item .env.example .env
```

Review and configure your `.env` values:

```env
# Application Environment & Network
NODE_ENV=development
PORT=4000
API_PREFIX=api/v1
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
LOG_LEVEL=info

# PostgreSQL Connection String
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/matrimony?schema=public"

# Optional Redis Cache
REDIS_URL="redis://localhost:6379"

# JWT Authentication Secrets (Generate secure, high-entropy 256-bit strings)
JWT_ACCESS_SECRET="your-development-jwt-access-secret-min-32-chars"
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET="your-development-jwt-refresh-secret-min-32-chars"
JWT_REFRESH_EXPIRES_IN=7d
```

> **Security Note:** Never commit `.env` files containing production credentials or secret keys to source control.

### 3. Initialize the Database (Prisma)
1. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

2. **Run Migrations**:
   Run database migrations against your PostgreSQL instance to create all tables and constraints:
   ```bash
   npx prisma migrate dev
   ```

3. *(Optional)* **Inspect Database with Prisma Studio**:
   To visually browse and manage database records:
   ```bash
   npx prisma studio
   ```

### 4. Start the Application

#### Development Mode (with hot-reloading)
```bash
npm run start:dev
```

#### Production Build & Run
```bash
npm run build
npm run start:prod
```

Once started, the API server will run at `http://localhost:4000` with the global prefix `/api/v1`.

---

## 📚 Interactive API Documentation (Swagger)

Interactive OpenAPI / Swagger documentation is available out of the box:

- **Swagger UI**: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- **Root Health Ping**: [http://localhost:4000/](http://localhost:4000/)
- **Liveness Endpoint**: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

You can test endpoints directly in the browser by clicking **Authorize** and supplying your JWT access token.

---

## 📡 API Overview

All API endpoints are prefixed with `/api/v1`:

### 1. Authentication (`/api/v1/auth`)
- **POST `/api/v1/auth/quick-register`**: 1-step draft registration (phone, name, gender, lookingIn).
- **POST `/api/v1/auth/send-otp`**: Send phone verification OTP (rate-limited).
- **POST `/api/v1/auth/verify-otp`**: Verify phone OTP and receive JWT access/refresh tokens.
- **POST `/api/v1/auth/verify-registration`**: Verify OTP and bind optional email address.
- **POST `/api/v1/auth/register`**: Standard email + password registration.
- **POST `/api/v1/auth/login`**: Sign in with email or phone number + password.
- **POST `/api/v1/auth/set-password`**: Set or update user password and enable password login *(Requires JWT)*.
- **POST `/api/v1/auth/enable-password`**: Enable password login, optionally providing new password credentials *(Requires JWT)*.
- **POST `/api/v1/auth/disable-password`**: Disable password login; OTP login remains active *(Requires JWT)*.
- **GET `/api/v1/auth/password-status`**: Retrieve password enablement status, existence flag, and change timestamp *(Requires JWT)*.
- **GET `/api/v1/auth/devices`**: Fetch all active login devices and sessions *(Requires JWT)*.
- **POST `/api/v1/auth/devices/logout-others`**: Invalidate and disconnect all other logged-in devices *(Requires JWT)*.
- **DELETE `/api/v1/auth/devices/:id`**: Revoke and disconnect a specific logged-in device *(Requires JWT)*.
- **POST `/api/v1/auth/refresh`**: Rotate refresh tokens for fresh access tokens.
- **POST `/api/v1/auth/logout`**: Terminate session and clear auth cookies *(Requires JWT)*.
- **GET `/api/v1/auth/me`**: Get current authenticated user profile *(Requires JWT)*.

### 2. Onboarding (`/api/v1/onboarding`)
- **POST `/api/v1/onboarding/complete`**: Complete mandatory profile fields (`gender`, `dob`, `education`, photo requirement) and activate profile status *(Requires JWT)*.

### 3. Profiles & Preferences (`/api/v1/profiles`)
- **GET `/api/v1/profiles/me`**: Fetch logged-in user profile, preferences, and photos *(Requires JWT)*.
- **GET `/api/v1/profiles/:id`**: View public profile by ID (restricted to active members) *(Requires JWT)*.
- **PUT `/api/v1/profiles/me`**: Update personal profile details *(Requires JWT)*.
- **PUT `/api/v1/profiles/me/preferences`**: Update partner search criteria *(Requires JWT)*.
- **PUT `/api/v1/profiles/me/photos/:id/primary`**: Set photo as primary *(Requires JWT)*.
- **DELETE `/api/v1/profiles/me/photos/:id`**: Delete a profile photo *(Requires JWT)*.

### 4. Media Management (`/api/v1/media`)
- **POST `/api/v1/media/upload`**: Upload single profile photo (5MB max, magic bytes validation, max 5 photos) *(Requires JWT)*.
- **POST `/api/v1/media/upload-multiple`**: Upload batch photos up to the 5-photo limit *(Requires JWT)*.
- **PUT `/api/v1/media/:id/primary`**: Set photo as primary *(Requires JWT)*.
- **DELETE `/api/v1/media/:id`**: Delete photo from database and disk *(Requires JWT)*.
- **GET `/uploads/:filename`**: Static photo delivery.

### 5. Discovery & Recommendations (`/api/v1/discovery`)
- **GET `/api/v1/discovery/search`**: Search profiles with filters (`religion`, `city`, `maritalStatus`, `education`, `occupation`, `minAge`, `maxAge`, `page`, `limit`) *(Requires JWT)*.
- **GET `/api/v1/discovery/recommendations`**: Fetch AI/criteria-matched profiles using saved partner preferences *(Requires JWT)*.

### 6. Connections & Matching (`/api/v1/connections`)
- **POST `/api/v1/connections/interest/:userId`**: Send connection interest to member *(Requires JWT)*.
- **POST `/api/v1/connections/accept/:userId`**: Accept incoming connection request *(Requires JWT)*.
- **POST `/api/v1/connections/reject/:userId`**: Decline connection request *(Requires JWT)*.
- **POST `/api/v1/connections/shortlist/:userId`**: Bookmark / shortlist a profile *(Requires JWT)*.
- **GET `/api/v1/connections?type=sent|received|matches`**: List connection records *(Requires JWT)*.

### 7. Real-Time Chat (`/api/v1/chat` & WebSockets)
- **HTTP GET `/api/v1/chat/history/:contactId`**: Fetch chat message history with a match *(Requires JWT)*.
- **HTTP PUT `/api/v1/chat/read/:contactId`**: Mark conversation messages as read *(Requires JWT)*.
- **WebSocket Gateway (`ws://localhost:4000`)**:
  - Connect with JWT auth token in handshake (`auth.token` or `Authorization` header).
  - Listen for `receive_message`.
  - Emit `send_message` with payload: `{ "receiverId": "string", "content": "string" }`.

### 8. Notifications (`/api/v1/notifications`)
- **GET `/api/v1/notifications`**: Get list of user notifications *(Requires JWT)*.
- **PUT `/api/v1/notifications/read-all`**: Mark all notifications as read *(Requires JWT)*.
- **PUT `/api/v1/notifications/:id/read`**: Mark specific notification as read *(Requires JWT)*.

### 9. Administration (`/api/v1/admin`)
*(Requires JWT with `role: 'ADMIN'`)*
- **GET `/api/v1/admin/users?page=1&limit=20`**: Paginated user management list.
- **GET `/api/v1/admin/stats`**: Platform metrics (`totalUsers`, `totalMatches`, `unverifiedPhotos`).
- **POST `/api/v1/admin/users/:id/ban`**: Suspend / ban a user account.
- **POST `/api/v1/admin/photos/:id/verify`**: Approve or reject uploaded photo with payload `{ "status": "approved" | "rejected" }`.

---

## 🧪 Testing & Quality Assurance

Run automated unit and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run code coverage report
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run linter
npm run lint
```

---

## 📁 Project Architecture & Layout

```
src/
├── admin/          # Admin reporting, user banning, and photo moderation
├── auth/           # JWT strategy, OTP delivery, argon2 hashing, rate limits
├── chat/           # Chat history service and real-time Socket.IO gateway
├── common/         # Phone normalization, name parsing, and XSS sanitizers
├── connections/    # Interest handling, acceptance/rejection, shortlisting
├── discovery/      # Partner search queries and recommendation algorithms
├── health/         # System liveness, readiness, and root diagnostics
├── media/          # Multer disk storage, magic bytes MIME-type checking
├── notifications/  # Notification persistence and read status tracking
├── onboarding/     # Onboarding completion logic and validation
├── prisma/         # PrismaService lifecycle connection provider
├── profiles/       # User profile details and partner preference mappings
├── users/          # User record lookup and profileId generation
├── app.module.ts   # Root NestJS application module
└── main.ts         # Server bootstrap, Swagger setup, Helmet, CORS, cookies
prisma/
└── schema.prisma   # PostgreSQL database schema & relational models
```
