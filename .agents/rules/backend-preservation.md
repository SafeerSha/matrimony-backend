---
name: backend-preservation
description: Enforces secure, backward-compatible, production-ready NestJS backend development with Prisma and PostgreSQL while preserving API contracts, authorization, privacy, business logic, and database integrity.
---

# Backend Preservation and Secure Engineering Rule

## Mission

Implement backend features, endpoints, and refactoring safely without breaking existing clients, compromising authentication, exposing sensitive data, corrupting database records, or introducing unnecessary architectural complexity.

Every change must preserve established behavior by default and remain secure, testable, maintainable, and suitable for production deployment.

## 1. Repository Boundaries

- Treat the current backend repository as the source of truth for backend implementation.
- Modify only files required for the requested feature and its necessary supporting changes.
- Do not assume the frontend repository is available or modify frontend source code.
- Use existing API contracts, OpenAPI specifications, integration tests, and backend response DTOs to understand frontend dependencies.
- Never invent frontend expectations or silently change public contracts.
- Identify frontend coordination requirements when a change affects request or response structures.
- Never overwrite unrelated user changes or discard existing work.
- Avoid unrelated refactoring, formatting changes, new dependencies, or architectural replacements without justification.

## 2. Mandatory Pre-Implementation Analysis

Before modifying code:

- Inspect the existing modules, controllers, services, providers, guards, interceptors, pipes, decorators, DTOs, and exception handling.
- Trace the request flow from the controller through business logic to Prisma and PostgreSQL.
- Inspect related models, relations, indexes, constraints, migrations, and tests.
- Identify affected endpoints, consumers, roles, data ownership rules, and business invariants.
- Understand existing authentication, session management, authorization, validation, logging, and rate-limiting patterns.
- Reuse established project conventions instead of introducing duplicate implementations.
- Identify security, privacy, migration, performance, and compatibility risks.
- For significant changes, provide a concise impact analysis before implementation.

Do not assume a feature or security control is absent without inspecting its implementation and tests.

## 3. API Contract and Backward Compatibility

- Preserve existing endpoint paths, HTTP methods, status codes, response envelopes, field names, field types, pagination conventions, and established error formats.
- Do not silently rename, remove, or restructure fields consumed by existing clients.
- Treat frontend applications, mobile clients, integrations, and automated tests as API consumers.
- Keep new parameters optional or provide compatible defaults when appropriate.
- Preserve existing business rules unless a change is explicitly requested.
- Maintain consistent validation and error-handling behavior.
- Never change API response structures merely to simplify internal implementation.
- If a breaking change is necessary, explain its impact and obtain approval before implementing it.
- Propose API versioning, compatibility layers, or a coordinated migration where appropriate.
- Update relevant contract tests and API documentation when contracts legitimately change.

## 4. Authentication and Session Security

- Use the application's established authentication architecture.
- Validate authentication on the server for protected endpoints.
- Derive the acting user's identity and role from the validated authentication context.
- Never trust user IDs, roles, permissions, or ownership claims supplied in request bodies, query parameters, headers, or route parameters as proof of identity.
- Use appropriate NestJS guards and permission checks.
- Follow the existing session expiration, refresh-token rotation, revocation, and cookie-security design.
- Never log passwords, password hashes, access tokens, refresh tokens, OTPs, reset tokens, or session secrets.
- Keep secrets in environment variables or an approved secrets manager.
- Never hardcode production credentials or privileged service keys.
- Validate required configuration at application startup.
- Never disable authentication or weaken security controls to bypass an implementation error.

## 5. Authorization and Matrimony Privacy

- Enforce authorization for every protected read, create, update, delete, download, and relationship-based operation.
- Prevent IDOR/BOLA vulnerabilities by checking access to the specific requested resource.
- Verify resource ownership, membership, roles, permissions, account status, and relevant business restrictions.
- Apply authorization in backend guards or services as appropriate; do not rely exclusively on controllers or frontend checks.
- Enforce profile visibility, contact-detail privacy, consent, blocking, reporting, and account restrictions according to the application's business rules.
- Return only the profile fields the requesting user is authorized to access.
- Protect phone numbers, private addresses, private photographs, identity documents, and other sensitive personal information.
- Do not expose raw Prisma records when they contain private or internal fields.
- Protect administrator operations with explicit server-side permissions.
- Do not treat authentication as authorization.
- Use secure access mechanisms for private media and restricted downloads.
- Audit sensitive administrative actions where appropriate, without recording unnecessary personal information.
- Test access attempts involving other users' records and restricted profiles.

## 6. DTOs, Input Validation, and Mass Assignment

- Use explicit request DTOs and response DTOs.
- Follow the project's established NestJS validation and transformation conventions.
- Apply allow-listed fields, type checks, length limits, range limits, and format validation.
- Configure validation consistently with the existing API contract.
- Reject unexpected fields where appropriate and compatible with established behavior.
- Never pass untrusted request bodies directly into Prisma create or update operations.
- Construct explicit persistence objects from permitted fields.
- Prevent mass assignment of roles, ownership IDs, account status, verification flags, or other privileged fields.
- Validate route IDs, pagination, sorting, filters, uploaded file metadata, and external identifiers.
- Enforce business rules in backend services, even when the frontend performs the same validation.
- Use safe, explicit DTO mappings for responses.

## 7. NestJS Architecture and Dependency Management

- Preserve the established module boundaries and dependency-injection conventions.
- Keep controllers responsible for HTTP concerns and delegate business logic to appropriate services.
- Reuse existing guards, decorators, pipes, interceptors, exception filters, and shared utilities.
- Avoid duplicating business logic across controllers or services.
- Follow the existing repository and data-access conventions where present.
- Do not introduce a repository abstraction or architectural pattern solely for stylistic preference.
- Avoid circular dependencies and unnecessary service coupling.
- Use appropriate provider lifetimes and avoid storing request-specific state in shared singleton providers.
- Do not bypass dependency injection with unnecessary manual instantiation.
- Preserve the existing application bootstrap, middleware order, and global configuration unless changes are necessary and reviewed.
- Introduce dependencies only when existing capabilities are insufficient and the need is justified.

## 8. Prisma and PostgreSQL Integrity

- Follow the existing Prisma schema and migration workflow.
- Review model relations, foreign keys, uniqueness, nullability, defaults, indexes, and referential actions before schema changes.
- Never reset, drop, truncate, or destructively modify production database structures or records as a shortcut.
- Never remove existing tables, columns, constraints, or data without explicit approval and a reviewed migration plan.
- Prefer additive, backward-compatible migrations where practical.
- For risky changes, use an expand-and-contract approach with compatible schema changes, data migration, application updates, and a separately approved cleanup.
- Generate and review Prisma migrations before deployment.
- Use the established production migration workflow, such as Prisma Migrate when configured.
- Do not assume `prisma db push` is appropriate for production deployment.
- Never execute production migrations without the required authorization and deployment safeguards.
- Use database constraints to enforce critical invariants wherever appropriate.
- Use transactions for operations that must succeed or fail together.
- Handle unique-constraint violations, foreign-key violations, missing records, and transaction failures safely.
- Avoid N+1 queries, unbounded result sets, unnecessary relation loading, and selecting excessive columns.
- Add indexes based on actual query patterns and expected workload.
- Never run destructive migration or reset commands against a shared or production database without explicit authorization and an approved recovery plan.

## 9. Transactions, Concurrency, and Idempotency

- Consider concurrent requests, retries, duplicate submissions, and partial failures.
- Use transactions for multi-step operations requiring atomicity.
- Prefer atomic database operations and constraints for race-sensitive invariants.
- Use optimistic concurrency controls or locking strategies where appropriate.
- Prevent duplicate records and inconsistent status transitions.
- Make retryable operations idempotent where necessary.
- Apply suitable idempotency mechanisms to payments, webhook processing, and other operations where duplicate execution could cause harm.
- Do not rely on frontend button disabling to prevent duplicate writes.
- Avoid external network calls inside long-running database transactions when they can safely be performed outside them.
- Handle partial failures and compensating actions where a single transaction cannot cover the entire workflow.

## 10. Security, Rate Limiting, and Abuse Prevention

- Apply suitable rate limits to authentication, OTP delivery, password recovery, messaging, searches, uploads, and other abuse-prone endpoints.
- Configure trusted proxy behavior correctly when determining client IP addresses.
- Enforce request-size limits and appropriate upload limits.
- Validate file content and permitted types server-side; do not trust filenames or MIME headers alone.
- Use safe parameterized database access.
- Avoid unsafe dynamic SQL and unvalidated raw queries.
- Validate external URLs and outbound requests where relevant to prevent SSRF.
- Configure CORS using explicitly trusted origins and appropriate credential settings.
- Apply suitable security headers and production-safe configuration.
- Avoid exposing internal endpoints or development tooling unintentionally in production.
- Apply appropriate password-hashing, verification, and account-recovery practices.
- Do not implement custom cryptography when established, maintained libraries are suitable.
- Do not weaken protections to work around rate-limit, CORS, validation, or authentication errors.

## 11. Error Handling and Logging

- Follow the established API error envelope and HTTP status-code conventions.
- Return sanitized client-facing messages without stack traces, raw database errors, SQL details, or internal infrastructure information.
- Use centralized exception handling where the project already supports it.
- Distinguish expected business errors from unexpected internal failures.
- Never swallow exceptions or report success when an operation failed.
- Log useful diagnostic information without passwords, tokens, OTPs, secrets, or unnecessary personal information.
- Redact sensitive fields from structured logs and error-reporting payloads.
- Avoid logging complete request bodies for sensitive endpoints.
- Keep production error responses separate from development diagnostics.

## 12. Performance and Resource Management

- Enforce pagination and maximum page sizes.
- Select only the database fields required for the operation.
- Review expensive joins, filters, sorting, aggregation, and relation loading.
- Avoid redundant database calls and unbounded in-memory processing.
- Use connection pooling and resource limits consistent with the deployment architecture.
- Use caching only when invalidation, authorization, privacy, and consistency have been considered.
- Never allow cached private data to leak across users or authorization contexts.
- Use background processing for suitable long-running tasks where the existing architecture supports it.
- Avoid unnecessary synchronous external service calls in critical request paths.
- Do not introduce queues, caches, or additional infrastructure without a justified requirement.

## 13. Configuration and Deployment Safety

- Validate required environment variables and application configuration.
- Keep development, testing, staging, and production settings appropriately separated.
- Never commit secrets, private credentials, or sensitive production configuration.
- Preserve the established build, startup, health-check, and deployment conventions.
- Ensure migrations are reviewed and compatible with the application version being deployed.
- Avoid deployment steps that require unsafe downtime or irreversible schema changes without an approved plan.
- Do not claim deployment success based solely on a successful local build.
- Identify any configuration, migration, or operational steps required for a feature.

## 14. Testing and Regression Prevention

- Add or update unit tests for business logic.
- Add integration tests for relevant database operations and transactions.
- Test authentication, authorization, ownership, and privacy boundaries.
- Test attempts to access another user's resources.
- Test invalid inputs, missing records, duplicate requests, and expected error responses.
- Test rate-limit behavior and other relevant abuse protections.
- Add regression tests for existing endpoints and business behavior affected by the change.
- Test concurrency-sensitive logic where appropriate.
- Run the project's actual lint, type-check, test, and build commands.
- Use safe test databases and isolated test environments.
- Never run destructive tests against production data.
- Do not delete or weaken existing tests to make a change pass.
- Never claim that tests passed unless they were actually executed successfully.

## 15. Change Control and Approval

- Keep changes limited to the requested feature and necessary supporting files.
- Preserve existing API contracts, business logic, and database integrity by default.
- Do not silently modify authentication, authorization, public response formats, or database migration strategies.
- Obtain approval before making breaking API changes, destructive schema changes, irreversible data migrations, or risky changes affecting unrelated features.
- If a requirement conflicts with security, privacy, data integrity, or backward compatibility, explain the conflict before implementing the risky change.
- Never hide a failing test or suppress a security finding to make a task appear complete.
- Prefer small, reviewable changes over broad rewrites.

## 16. Completion Checklist

Before completing a task, report:

1. What changed and why.
2. Which modules, endpoints, services, and models were affected.
3. Whether existing API contracts were preserved.
4. Database schema or migration implications.
5. Security, authorization, and privacy considerations.
6. Tests, linting, type checks, and builds actually executed.
7. Required deployment or configuration steps.
8. Known risks, limitations, and remaining work.

## Final Invariant

Never sacrifice security, privacy, authorization, API compatibility, or database integrity for implementation convenience. Preserve existing behavior by default and require explicit approval for risky or breaking changes.