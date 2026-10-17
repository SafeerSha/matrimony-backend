---
trigger: model_decision
description: Applies security-first engineering practices to authentication, authorization, privacy, input handling, uploads, API integrations, and sensitive operations.
---

# Security and Safety Engineering Rule

## Mission

Identify and prevent security vulnerabilities while implementing or modifying application features. Protect user accounts, personal information, authentication credentials, application resources, and production systems.

Security must be implemented in the application itself. Hiding UI elements or documenting security requirements is not sufficient.

## 1. Mandatory Security Analysis

- Inspect the relevant implementation before making security-sensitive changes.
- Identify trust boundaries, user-controlled inputs, authentication requirements, authorization checks, and sensitive data flows.
- Consider how an attacker could misuse the feature, not only how a legitimate user would use it.
- Distinguish verified vulnerabilities from potential risks.
- Avoid unrelated security changes that could break existing behavior.
- Never claim that a security control is effective without verifying its implementation.

## 2. Authentication and Authorization

- Never trust client-provided identity, role, ownership, or permission claims.
- Derive authenticated identity from validated server-side authentication context.
- Enforce authorization for every protected operation and requested resource.
- Prevent IDOR/BOLA vulnerabilities and privilege escalation.
- Apply least privilege to users, administrators, services, and database credentials.
- Preserve existing session security, token validation, expiration, and revocation behavior.
- Never bypass authorization to make a feature work.

## 3. Privacy and Sensitive Data

- Identify personal and sensitive information before exposing or processing it.
- Return and display only information the current user is authorized to access.
- Enforce matrimony profile visibility, consent, blocking, and contact-detail privacy on the backend.
- Never expose passwords, authentication tokens, OTPs, reset tokens, private credentials, or privileged API keys.
- Avoid leaking sensitive information through logs, error responses, URLs, browser storage, analytics, or caches.
- Apply appropriate redaction and retention practices to sensitive diagnostic data.
- Never assume frontend masking protects data returned by an API.

## 4. Input and Output Security

- Treat request bodies, query parameters, route parameters, uploaded files, external API responses, and user-generated content as untrusted.
- Validate input using established server-side validation mechanisms.
- Use safe parameterized database access and avoid unsafe dynamic SQL.
- Sanitize untrusted content when an output context requires it.
- Avoid unsafe HTML injection, command execution, dynamic code execution, and unvalidated redirects.
- Validate external URLs and outbound requests where applicable to prevent SSRF.
- Enforce appropriate file-type, file-size, content, and storage-access restrictions.

## 5. Web Application Protections

- Preserve secure CORS configuration and cookie settings.
- Consider CSRF protection when authentication relies on automatically attached cookies.
- Use suitable security headers and content security policies where appropriate.
- Apply rate limits to authentication, OTP delivery, messaging, uploads, and other abuse-prone operations.
- Prevent mass assignment and unauthorized modification of privileged fields.
- Avoid account enumeration and sensitive information leakage in authentication and recovery flows.
- Never disable a security mechanism merely to bypass an error.

## 6. Secrets and Configuration

- Never hardcode secrets or commit production credentials.
- Keep privileged keys and service credentials on trusted server-side infrastructure.
- Validate required environment configuration.
- Never expose private server environment variables through public frontend configuration.
- Do not print secrets during debugging or copy them into reports.
- Rotate exposed credentials using the appropriate operational procedure.

## 7. Security Testing

For relevant changes, test:

- Unauthenticated access to protected endpoints.
- Access to another user's resources.
- Unauthorized role and permission escalation.
- Invalid and unexpected input.
- Sensitive-field exposure.
- Rate-limit and duplicate-request behavior.
- Unsafe file uploads and access to restricted media.
- Authentication, session-expiration, and account-restriction behavior.

Use isolated test environments. Never perform destructive or intrusive security tests against production systems without explicit authorization.

## 8. Security Finding Severity

Classify findings as:

- Critical: severe compromise, unrestricted privileged access, or major exposure of sensitive data.
- High: significant unauthorized access, privilege escalation, or exploitable security weakness.
- Medium: meaningful security weakness with limited or conditional impact.
- Low: limited-risk weakness or hardening opportunity.

Explain the evidence, affected components, potential impact, and recommended remediation. Do not exaggerate findings or report speculation as confirmed vulnerability.

## 9. Approval and Change Control

- Do not silently weaken authentication, authorization, privacy, validation, or production safeguards.
- Obtain approval before risky security changes that may affect unrelated functionality or existing contracts.
- If a requested feature conflicts with a security requirement, explain the conflict before proceeding.
- Prefer the smallest effective fix.
- Never suppress or hide security findings to make a task appear complete.

## Completion Requirements

Report:

1. Security-sensitive components inspected or changed.
2. Threats and trust boundaries considered.
3. Protections implemented or verified.
4. Security tests actually executed.
5. Unresolved risks and recommended next steps.

## Final Invariant

Security must be enforced at the appropriate trust boundary. Never treat UI restrictions, developer instructions, or successful compilation as proof that an application is secure.