# Third-Party Services Requirements

This document outlines the necessary third-party services required to take the Matrimony application to a production-ready state, based on the application's architecture and standard matchmaking platform requirements.

## 1. Infrastructure & Storage (Required)
These services are essential for handling data, media, and security at scale as defined in `ARCHITECTURE.md`.

* **Object Storage (e.g., AWS S3, Cloudflare R2, Google Cloud Storage)**
  * **Purpose:** The backend currently handles file uploads (like Profile Pictures), but storing them on a local disk is not scalable. Object storage is needed to securely host and serve user photos, KYC documents, and other media assets.
* **Managed Database Hosting (e.g., AWS RDS, Supabase, Railway)**
  * **Purpose:** While local development uses SQLite, the production architecture specifies **PostgreSQL**. A managed database provider is required for high availability, backups, and scalability.
* **Managed Redis (e.g., Upstash, AWS ElastiCache)**
  * **Purpose:** Required for scaling WebSockets (Chat module), rate limiting (Throttler), and session/data caching to reduce primary database load.
* **Edge Security & WAF (e.g., Cloudflare)**
  * **Purpose:** Provides DDoS protection, manages SSL certificates, and caches the Next.js frontend assets closer to the users for faster load times globally.

## 2. Communication Services (Essential)
Matrimony applications rely heavily on real-time notifications and user verification to maintain an active and authentic user base.

* **Email Delivery Service (e.g., Resend, SendGrid, Amazon SES)**
  * **Purpose:** Essential for sending account verification links, password reset emails, welcome emails, and "You have a new match/message!" notifications.
* **SMS Gateway (e.g., Twilio, MSG91, Amazon SNS)**
  * **Purpose:** Phone number verification via OTP (One-Time Password) is a standard requirement for matrimony apps to prevent fake profiles and ensure user authenticity.

## 3. Monetization & Trust (Business Requirements)
To operate a successful Matrimony business, handling payments securely and verifying user identities is critical.

* **Payment Gateway (e.g., Stripe, Razorpay, PayPal)**
  * **Purpose:** Most matrimony platforms monetize through premium subscriptions (e.g., unlocking the ability to see who liked your profile, or initiating chats with matches). A payment gateway handles these transactions securely.
* **Identity Verification / KYC (e.g., Onfido, Stripe Identity, Veriff)**
  * **Purpose:** Trust is the most important factor in matchmaking. Integrating a service that automatically verifies a user's government ID (Passport, Driver's License, National ID) allows you to award "Verified" badges to profiles, significantly increasing platform trust.
