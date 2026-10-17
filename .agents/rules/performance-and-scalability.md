---
trigger: always_on
name: performance-and-scalability
description: Prevents unnecessary frontend work, inefficient database queries, excessive network traffic, unsafe caching, and resource bottlenecks while preserving correctness and privacy.
---

# Performance and Scalability Engineering Rule

## Mission

Implement efficient, measurable solutions that remain reliable as application usage, data volume, and concurrent requests grow.

Optimize for real requirements and measured bottlenecks without sacrificing correctness, security, privacy, or maintainability.

## 1. Measure Before Optimizing

- Inspect existing rendering, API, query, and resource-consumption patterns.
- Identify the actual bottleneck or explain why a proposed optimization is necessary.
- Use available profiling, query analysis, build statistics, logs, or benchmarks where practical.
- Do not claim a performance improvement without appropriate evidence.
- Avoid premature optimization and unnecessary infrastructure.

## 2. Frontend Performance

- Follow established Next.js rendering and data-fetching conventions.
- Avoid unnecessary Client Components, hydration, large dependencies, and duplicated state.
- Prevent redundant API requests and repeated expensive computations.
- Reuse existing image optimization and asset-loading mechanisms.
- Lazy-load suitable noncritical resources.
- Prevent layout shifts and unnecessary component re-renders.
- Use memoization only when it offers a meaningful benefit.
- Keep forms and interactive pages responsive during network operations.
- Avoid rendering excessively large lists without appropriate pagination or virtualization where justified.
- Consider bundle size and loading behavior when adding dependencies.

## 3. Backend and Database Performance

- Use pagination with enforced maximum page sizes.
- Select only required database fields.
- Avoid N+1 queries and unnecessary relation loading.
- Review filters, sorting, joins, aggregates, and frequently executed queries.
- Use indexes based on actual access patterns and query plans.
- Avoid unbounded database operations and expensive work on the main request path.
- Consider connection pooling and database resource limits.
- Avoid repeated queries for data already available within the current operation.
- Use bulk operations where appropriate and safe.
- Never remove validation or authorization checks to improve performance.

## 4. API and Network Efficiency

- Avoid duplicate requests, polling without a justified need, and unnecessary payloads.
- Use appropriate pagination, filtering, and response projections.
- Apply timeouts and suitable error handling to external service calls.
- Prevent retries from multiplying load or repeating non-idempotent operations.
- Use background processing for appropriate long-running tasks when supported by the architecture.
- Avoid adding queues, caching layers, or additional infrastructure without evidence that they are needed.

## 5. Caching and Data Freshness

- Identify whether data is public, user-specific, role-restricted, or sensitive before caching it.
- Never share private cached data between users or authorization contexts.
- Use appropriate cache-control headers and Next.js caching behavior.
- Consider invalidation after profile updates, blocking, consent changes, account changes, and other permission changes.
- Avoid caching authorization decisions longer than their validity permits.
- Define freshness and invalidation behavior before introducing new caches.
- Never use public caching for private profile responses.
- Do not introduce Redis or another caching service solely as a precaution without a justified requirement.

## 6. Concurrency and Resource Limits

- Consider concurrent requests, database connection limits, file uploads, and external API quotas.
- Use rate limiting, bounded concurrency, and suitable timeouts where appropriate.
- Avoid loading entire tables or large datasets into application memory.
- Prevent unbounded background tasks and uncontrolled retries.
- Preserve atomicity and data integrity when optimizing write operations.
- Ensure cancellation or disconnection does not leave unnecessary work running where cancellation is supported.

## 7. File and Media Delivery

- Use appropriate image sizes and supported formats.
- Avoid transferring original high-resolution images when optimized versions are sufficient.
- Use the established object-storage and media-delivery architecture.
- Respect private media authorization and signed-URL expiration where applicable.
- Avoid routing large media payloads through application servers unnecessarily when direct, secure object-storage delivery is appropriate.
- Enforce upload limits and prevent uncontrolled storage consumption.

## 8. Verification

- Run relevant tests after performance-related changes.
- Compare measurements or query plans when practical.
- Check that authorization, data freshness, and existing functionality remain intact.
- Review bundle size or rendering behavior for substantial frontend changes.
- Review query behavior and database load for substantial backend changes.
- Document assumptions and remaining bottlenecks.
- Do not claim that an application supports a particular user count without appropriate workload testing.

## 9. Completion Requirements

Report:

1. The bottleneck or performance concern addressed.
2. Changes made and why they should help.
3. Measurements or tests actually performed.
4. Effects on caching, data freshness, privacy, and consistency.
5. Remaining bottlenecks and recommended follow-up work.

## Final Invariant

Optimize based on evidence. Never trade correctness, privacy, security, or data integrity for an unverified performance improvement.
