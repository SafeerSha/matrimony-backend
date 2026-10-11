---
name: security-audit
description: Perform a structured, evidence-based security audit of the matrimony application's frontend or backend, focusing on exploitable risks and privacy protection.
---

# Security Audit Skill

## Purpose
Assess the selected application area for security and privacy weaknesses. Prioritize realistic attack paths and actionable fixes. This skill does not itself guarantee security or authorize intrusive testing.

## Scope and authorization
- Inspect only the repository and environments the user is authorized to assess.
- Default to read-only code and configuration review.
- Do not attack production, access other users' accounts, exfiltrate data, run destructive tests, or alter production settings.
- Ask for explicit authorization before intrusive testing or changes with operational impact.
- Never reproduce secrets or sensitive personal information in the report.

## Audit workflow

### 1. Map the attack surface
- Identify entry points, routes/endpoints, authentication flows, roles, external integrations, file handling, data stores, and sensitive data.
- Trace important operations from user input to authorization, business logic, persistence, and response.
- Inspect configuration and dependencies using existing safe tools.

### 2. Authentication and session management
- Verify authentication guards and token/session validation on protected backend endpoints.
- Review expiration, refresh, revocation, cookie security, CSRF protections where applicable, and password-reset/OTP flows.
- Check for account enumeration, brute-force opportunities, and insecure recovery behavior.
- Never assume frontend route guards provide backend protection.

### 3. Authorization and resource access
- Check object-level authorization on reads and mutations.
- Test or reason about access to another user's profile, messages, photos, requests, and other resources using safe test fixtures.
- Review role escalation, mass assignment, ownership checks, blocking, consent, and account restrictions.
- Verify admin-only operations are protected server-side.

### 4. Matrimony privacy
- Identify phone numbers, addresses, private photos, identity documents, and other sensitive profile fields.
- Check whether API responses, logs, caches, hydration payloads, URLs, or analytics expose restricted information.
- Verify profile visibility and consent rules are enforced by the backend.
- Review signed/private media access and expiration where applicable.
- Check that user-specific caches cannot leak data across accounts.

### 5. Input, output, and integrations
- Review DTO validation, unexpected fields, query construction, unsafe HTML, URL handling, file uploads, and outbound requests.
- Check upload size/content restrictions and storage permissions.
- Inspect CORS, security headers, cookies, rate limits, and request-size limits.
- Review webhook validation and replay protection where applicable.
- Check secrets handling and public frontend environment variables.

### 6. Data integrity and dependencies
- Review Prisma constraints, transactions, concurrent operations, migration risks, and destructive commands.
- Inspect dependency manifests and available audit output for known vulnerabilities.
- Do not automatically upgrade packages or run untrusted scripts during an audit.
- Consider denial-of-service risks such as unbounded queries, expensive endpoints, and uncontrolled retries.

### 7. Validate and prioritize
- Gather evidence for each finding.
- Distinguish verified vulnerabilities, plausible risks, and recommendations.
- Assign Critical, High, Medium, or Low severity based on realistic impact and exploitability.
- Avoid claiming that a vulnerability is exploitable without sufficient evidence.
- Do not claim the application is secure simply because no findings were found.

## Report format
For each finding include:
- Severity and affected component.
- Evidence and relevant file/location.
- Preconditions and likely attack path.
- Impact on accounts, privacy, data, or availability.
- Recommended remediation.
- Safe verification or regression test.

Conclude with prioritized remediation steps, areas not assessed, and tests that were or were not performed.

## Remediation mode
The default is audit-only. Implement fixes only when the user explicitly requests remediation. Make focused changes, add regression tests, and obtain approval before destructive operations, breaking API changes, or production changes.

## Success criteria
The audit produces evidence-based, prioritized findings and practical remediation guidance without exposing sensitive data or causing operational harm.
