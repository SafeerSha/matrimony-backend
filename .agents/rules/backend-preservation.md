---
name: backend-preservation
description: Preserves API contracts, security boundaries, database integrity, and response formats when implementing backend features.
---

# Backend & API Contract Preservation Rule

## Mission
When implementing new backend features, endpoints, or refactoring existing business logic, preserve all existing API contracts, database integrity, authorization boundaries, and response structures. New features must never break existing clients (web or mobile).

## Core Invariants

### 1. API Contract & Backward Compatibility
- **Never Alter Existing Response Shapes**: Existing frontend/mobile consumers rely on exact keys and types. Do not rename, remove, or restructure fields in existing endpoints.
- **Additive-Only Changes**: New parameters must be optional or provide backward-compatible default values.
- **Consistent Envelope**: Follow the project's established response schema (e.g., `{ success: true, data: ... }`).

### 2. Authorization & Tenant Isolation
- **Never Trust Client-Provided User Identity**: Always derive the acting user's ID and role from the validated session/JWT on the server. Never trust `userId` or `role` passed in the request body or query parameters.
- **Enforce Object-Level Authorization (IDOR/BOLA)**: Always verify that the authenticated user owns or has explicit permission to access/mutate the requested record.

### 3. Data Protection & Sanitization
- **Strict DTOs / Never Return Raw Entities**: Always map database entities to explicit DTOs. Never expose sensitive fields (`password`, `password_hash`, refresh tokens, reset tokens, or private PII).
- **Server-Side Input Validation**: Validate all inputs using strict schema validation (allow-list approach, type checks, length/boundary limits).

### 4. Database Safety
- **Zero Destructive Schema Changes**: Never drop existing tables/columns or alter non-null constraints without fallback defaults in active environments.
- **Use Transactions**: Wrap multi-table operations in database transactions to avoid inconsistent or orphaned states.

### 5. Error Handling
- **Safe Public Errors**: Return standardized, sanitised client error messages. Never leak database errors, stack traces, or internal server details to the client.
