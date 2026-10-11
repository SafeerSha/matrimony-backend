---
name: code-review
description: Review code changes for correctness, security, privacy, API compatibility, database integrity, maintainability, and missing tests without modifying code by default.
---

# Code Review Skill

## Purpose
Provide an evidence-based review of a diff, pull request, or specified change. Find actionable defects rather than stylistic preferences.

## Default mode
Review only. Do not edit files, apply fixes, commit, push, merge, or deploy unless the user explicitly asks for remediation.

## Review workflow

### 1. Establish scope
- Inspect the diff and relevant surrounding code.
- Read repository guidance and identify the intended behavior.
- Check related callers, consumers, tests, schema, and contracts as needed.
- Do not review unrelated pre-existing code unless it materially affects the change.

### 2. Look for correctness defects
- Incorrect business logic, edge cases, state transitions, race conditions, and partial failures.
- Null/missing values, incorrect types, pagination errors, and inconsistent error handling.
- Regressions in existing behavior or undocumented changes to public contracts.
- Duplicate operations, stale frontend state, and incorrect retry behavior.

### 3. Look for security and privacy defects
- Missing authentication or object-level authorization.
- IDOR/BOLA, privilege escalation, mass assignment, and untrusted identity claims.
- Exposure of passwords, tokens, private profile fields, addresses, or restricted media.
- Unsafe HTML rendering, SQL construction, file uploads, external URLs, or redirects.
- Weak CORS/cookie/CSRF configuration, rate-limit bypasses, or secret exposure.
- Authorization enforced only in the frontend.

### 4. Look for data and operational risks
- Unsafe Prisma schema changes, destructive migrations, missing constraints, and invalid relation behavior.
- Missing transactions for operations that must be atomic.
- Concurrency defects, duplicate writes, and non-idempotent retries.
- Unbounded queries, N+1 access, missing pagination, and unsafe caching.
- Deployment/configuration changes that may break startup, compatibility, or recovery.

### 5. Look for frontend quality issues
- Broken responsive behavior, inaccessible controls, missing loading/error/empty states.
- Incorrect API types or assumptions about response envelopes.
- Server/client boundary violations and accidental exposure of server-only values.
- Unnecessary dependencies, excessive client-side JavaScript, and duplicated logic.

### 6. Validate findings
- Confirm each finding against actual code and relevant context.
- Do not report hypothetical concerns as confirmed defects.
- Do not infer that a control is missing solely because its implementation is outside the reviewed diff; inspect the relevant code when available.
- Do not claim tests passed unless they were executed.

## Severity
- Critical: likely severe compromise, major sensitive-data exposure, or catastrophic data loss.
- High: significant exploitable vulnerability, major functional failure, or serious integrity risk.
- Medium: meaningful defect with bounded or conditional impact.
- Low: minor defect or improvement with limited impact.

Prioritize actionable correctness and security issues over style preferences.

## Finding format
For each finding provide:
- Severity.
- File and line/location where available.
- The specific condition that causes the problem.
- Concrete impact.
- A practical remediation.

If no actionable findings are identified, say so and state what was and was not reviewed. Do not guarantee the code is defect-free.

## Final report
Summarize the highest-priority findings first, then test coverage gaps, compatibility concerns, and checks performed. Clearly distinguish verified issues from questions or recommendations.

## Success criteria
The review is focused, evidence-based, non-destructive, and useful for deciding whether changes are ready to merge.
