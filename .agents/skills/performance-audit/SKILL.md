---
name: performance-audit
description: Diagnose performance bottlenecks in the Next.js frontend and NestJS/Prisma/PostgreSQL backend using evidence and safe, targeted recommendations.
---

# Performance Audit Skill

## Purpose
Identify measurable performance bottlenecks and recommend or implement focused improvements without sacrificing correctness, security, privacy, or maintainability.

## Default mode
Start with inspection and measurement. Do not make broad optimizations or introduce infrastructure without evidence. If the user requests an audit, report findings before changing code.

## Workflow

### 1. Define the symptom
- Identify the affected page, endpoint, query, workflow, dataset, environment, and expected behavior.
- Separate measured latency from subjective reports.
- Do not assume the database, network, or frontend is the cause without evidence.

### 2. Frontend investigation
- Inspect rendering strategy, Server/Client Component boundaries, hydration, bundle size, and network requests.
- Look for duplicate API calls, unnecessary re-renders, expensive computations, oversized assets, layout shifts, and large client bundles.
- Check image sizing, lazy loading, pagination, and long-list rendering.
- Review caching and revalidation behavior, ensuring private data is never publicly cached.
- Preserve accessibility, responsive behavior, and loading/error states.

### 3. Backend and database investigation
- Trace request latency through controllers, services, database calls, and external services where observability exists.
- Inspect Prisma query patterns, relation loading, N+1 behavior, selected fields, pagination, sorting, and filters.
- Use query plans or existing database metrics when available.
- Evaluate indexes based on real query patterns; do not add indexes blindly.
- Consider connection-pool limits, slow external calls, blocking work, large payloads, and unbounded operations.
- Preserve authorization and validation even when optimizing.

### 4. Caching and concurrency
- Determine whether caching is justified and define freshness/invalidation behavior.
- Never share private data across users or authorization contexts.
- Check invalidation after profile changes, consent changes, blocking, and account changes.
- Review retry storms, duplicate requests, uncontrolled concurrency, and rate limits.
- Do not add Redis, queues, a CDN, or other infrastructure without a justified need.

### 5. Establish evidence
- Use available profiler output, timings, logs, query plans, bundle analysis, or repeatable benchmarks.
- State the measurement method and its limitations.
- Do not invent baseline numbers or claim improvement without comparing evidence.
- Avoid load testing production without explicit authorization and an agreed safe plan.

### 6. Recommend or implement
- Rank findings by user impact, confidence, and implementation effort.
- Prefer the smallest change that addresses the measured bottleneck.
- For audit-only requests, do not modify files.
- For implementation requests, make focused changes and add relevant tests.
- Re-measure when possible and confirm behavior, security, and data freshness remain correct.

## Completion report
Include:
1. Observed symptom and evidence.
2. Likely bottleneck and confidence level.
3. Prioritized recommendations.
4. Files changed, if implementation was authorized.
5. Measurements and tests actually performed.
6. Trade-offs, remaining bottlenecks, and unverified assumptions.

## Success criteria
The outcome is evidence-based, safe, and actionable. Do not promise a particular user capacity or performance improvement without suitable measurements and workload testing.
