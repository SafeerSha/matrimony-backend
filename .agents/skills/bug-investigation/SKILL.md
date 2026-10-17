---
name: bug-investigation
description: Investigate and fix bugs through evidence-based reproduction, root-cause analysis, focused changes, and regression testing in the matrimony application.
---

# Bug Investigation Skill

## Purpose
Find and correct the root cause of a reported defect without guessing, masking symptoms, or creating unrelated changes.

## Workflow

### 1. Clarify the failure
- Identify expected behavior, actual behavior, reproduction steps, affected route/API, environment, and error evidence.
- Ask for missing information only when it prevents a meaningful investigation.
- Never request or print passwords, tokens, OTPs, private profile data, or production secrets.

### 2. Reproduce and gather evidence
- Inspect relevant code, logs, network responses, tests, configuration, and recent changes where available.
- Reproduce in a local or isolated test environment when possible.
- Distinguish confirmed facts from hypotheses.
- Do not claim reproduction if it was not achieved.
- Avoid destructive commands and production mutations.

### 3. Trace the cause
- Follow the flow across UI, API client, controller, service, validation, database, and external dependencies as relevant.
- Check boundary cases, null/missing data, concurrency, permissions, caching, and error handling.
- For frontend bugs, check state updates, stale requests, rendering boundaries, responsive layouts, and browser errors.
- For backend bugs, check DTO validation, guards, business rules, Prisma queries, constraints, transactions, and exception handling.
- For cross-repository issues, verify the actual API contract and state what evidence is unavailable.

### 4. Fix the root cause
- Prefer the smallest change that addresses the verified cause.
- Preserve existing API contracts, UI conventions, security boundaries, and business rules.
- Do not add arbitrary delays, broad exception swallowing, hardcoded workarounds, or disabled validation to hide symptoms.
- Avoid unrelated refactoring.
- If the cause is uncertain, explain the uncertainty before making a risky change.

### 5. Add regression protection
- Add a test that fails under the original bug and passes with the fix when practical.
- Cover the relevant edge case or failure path.
- Update existing tests only when behavior intentionally changes.
- Never delete or weaken a test merely to make the suite pass.

### 6. Verify
- Run the focused regression test and appropriate related tests.
- Run relevant lint, type-check, or build commands when warranted.
- Verify that the fix does not bypass authentication, authorization, privacy, or data-integrity controls.
- Report checks that could not be run and why.

## Completion report
Include:
1. Expected versus actual behavior.
2. Root cause and evidence, distinguishing facts from assumptions.
3. Files changed and why.
4. Regression test added or updated.
5. Commands executed and actual results.
6. Remaining uncertainty or follow-up work.

## Safety constraints
Never run destructive database commands or make production changes without explicit authorization. Never expose sensitive data in logs or reports.

## Success criteria
The root cause is addressed, the fix is focused, relevant regression protection exists, and verification status is reported accurately.
