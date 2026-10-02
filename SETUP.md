# Matrimony Backend Setup Guide

Welcome to the Matrimony Backend project! This guide will walk you through the entire process of setting up, running, and understanding the backend architecture after you've cloned the repository.

This project is built using **NestJS**, **Prisma** (with an SQLite database for local development), and features a comprehensive suite of modules including Authentication, Profiles, Discovery, Connections, Chat (WebSockets), Media uploads, and an Admin dashboard.

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js** (v18 or v20 LTS recommended)
- **npm** (comes with Node.js)
- **Git**

*(Note: Docker is not strictly required for local development right now since we are using an SQLite file-based database. However, it will be useful if you transition to PostgreSQL/Redis later).*

---

## 🚀 Step-by-Step Setup

### 1. Install Dependencies
Open your terminal, navigate to the cloned project directory, and install all required Node modules.

```bash
cd matrimony-backend-prod-v2
npm install
```

### 2. Configure Environment Variables
The application relies on environment variables to run securely. 

1. Create a `.env` file in the root directory (at the same level as `package.json`).
2. Add the following variables to it:

```env
# Database connection string (SQLite used for local development)
DATABASE_URL="file:./dev.db"

# JWT Secret for authentication (Use a long, random string in production)
JWT_SECRET="your_super_secret_jwt_key_here"

# Application Port
PORT=4000
```

### 3. Setup the Database (Prisma)
We use Prisma as our ORM. We need to sync our Prisma schema with the local SQLite database.

First, generate the Prisma Client (this creates the TypeScript types for your database models):
```bash
npx prisma generate
```

Next, push the schema to the database. This will create the `dev.db` file in your `prisma` folder and build all the necessary tables:
```bash
npx prisma db push
```
*(Alternatively, you can run `npx prisma migrate dev --name init` to create a formal migration history).*

### 4. Start the Application
You are now ready to start the backend server! Run the application in development mode, which enables hot-reloading (the server restarts automatically when you save a file).

```bash
npm run start:dev
```

You should see output indicating that the Nest application has successfully started on port 4000 (or whichever port you specified in `.env`).

---

## 📡 API Overview & Testing

Once the server is running at `http://localhost:4000`, you can interact with the API. Below is a quick overview of the available modules:

### 1. Authentication (`/auth`)
- **POST `/auth/register`**: Register a new user (requires `email`, `password`, `firstName`, `lastName`).
- **POST `/auth/login`**: Authenticate and receive a JWT token.
- **GET `/auth/me`**: Get current logged-in user profile (Requires Bearer Token).

### 2. Profiles (`/profiles`)
- **PUT `/profiles/me`**: Upsert the user's detailed profile (bio, religion, height, etc.).
- **PUT `/profiles/me/preferences`**: Update partner preferences (minAge, maxAge, etc.).
- **GET `/profiles/:id`**: View a specific user's public profile.

### 3. Discovery (`/discovery`)
- **GET `/discovery/search`**: Search for other profiles using query parameters (e.g., `?minAge=20&maxAge=30&religion=Christian`).
- **GET `/discovery/recommendations`**: Get automated recommendations based on your saved Preferences.

### 4. Connections (`/connections`)
- **POST `/connections/interest/:userId`**: Send a connection request to a user.
- **POST `/connections/accept/:userId`**: Accept a pending connection request.
- **POST `/connections/reject/:userId`**: Reject a pending connection request.
- **GET `/connections?type=matches`**: Fetch all your accepted matches.

### 5. Media Uploads (`/media`)
- **POST `/media/upload`**: Upload a profile photo (multipart/form-data with a `photo` field). Images are saved locally to the `./uploads` folder.
- **DELETE `/media/:id`**: Delete a photo.

### 6. Admin Panel (`/admin`)
*(Requires the user to have `role: 'ADMIN'` in the database)*
- **GET `/admin/users`**: List all users.
- **GET `/admin/stats`**: View platform statistics.
- **POST `/admin/users/:id/ban`**: Ban a malicious user.
- **POST `/admin/photos/:id/verify`**: Approve or reject uploaded user photos.

### 7. Real-Time Chat (WebSockets)
- The app hosts a WebSocket server at the root URL. Clients can connect, pass their JWT token in the handshake, and emit `send_message` events to chat in real-time with their accepted matches!

---

## 📁 Directory Structure Breakdown

Understanding where things live is crucial:

- `/prisma`: Contains `schema.prisma` which defines all your database models (`User`, `Profile`, `Connection`, `Message`, `Notification`, etc.).
- `/src/auth`: JWT generation, Guards (`JwtAuthGuard`, `RolesGuard`), and Login/Register logic.
- `/src/profiles`: Logic for user bios, education, and preferences.
- `/src/discovery`: Search algorithms and matching recommendations.
- `/src/connections`: Sending/Accepting/Rejecting interests.
- `/src/chat`: Real-time WebSocket Gateway and Chat History.
- `/src/notifications`: System alerts for new matches and messages.
- `/src/media`: Handling file uploads locally via Multer.
- `/src/admin`: Restricted admin endpoints.
- `/uploads`: The directory where user images are stored (created automatically upon first upload).

---

## 🛠 Next Steps & Production Readiness

If you plan to deploy this backend to production later, keep these things in mind:
1. **Swap SQLite for PostgreSQL**: Update the `provider` in `schema.prisma` from `"sqlite"` to `"postgresql"` and update the `DATABASE_URL`.
2. **Swap Local Storage for AWS S3**: Update `media.controller.ts` to use `multer-s3` instead of `diskStorage`.
3. **Build the app**: Run `npm run build` to compile the TypeScript code into JavaScript, and then run `npm run start:prod` to run the production bundle.
