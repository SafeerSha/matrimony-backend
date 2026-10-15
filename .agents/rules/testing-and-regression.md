---
trigger: model_decision
description: Requires risk-based automated testing, regression prevention, truthful test reporting, and verification of existing functionality during application changes.
---

# Testing and Regression Prevention Rule

## Mission

Ensure every meaningful code change is verified against the requested behavior and the existing application's functionality. Prevent regressions, false-positive test results, and unverified claims of completion.

## 1. Inspect Before Testing

- Inspect existing test files, test frameworks, scripts, fixtures, and conventions before adding tests.
- Identify the behavior being changed and the functionality that could regress.
- Reuse existing test utilities and patterns.
- Do not introduce a new testing framework without justification.
- Never modify production data or run destructive commands to prepare a test environment.

## 2. Required Testing Strategy

Choose tests according to the change's risk and scope.

- Unit tests: business logic, utility functions, validation, state transitions, and component behavior.
- Integration tests: database access, service interactions, API handling, and transactions.
- Contract tests: request and response compatibility between frontend and backend.
- End-to-end tests: critical user journeys across the application.
- Regression tests: previously working behavior that could be affected by the change.
- Security tests: authentication, authorization, privacy, and access restrictions where applicable.
- Build and static checks: TypeScript, linting, compilation, and production builds.

Do not add every test category to every change. Select appropriate tests based on risk.

## 3. Backend Testing Requirements

- Test successful operations and expected failure conditions.
- Test DTO validation, missing records, duplicate submissions, and invalid state transitions.
- Verify that users cannot access or modify another user's resources without permission.
- Verify role restrictions and private-profile visibility.
- Test transaction rollback and database constraints where relevant.
- Test API status codes, response shapes, pagination, and error formats.
- Use isolated test databases and controlled fixtures.
- Never run database resets or destructive migration commands against production.

## 4. Frontend Testing Requirements

- Test important rendering behavior, form validation, interactions, and navigation.
- Verify loading, success, empty, unauthorized, and error states.
- Test API integration against the established contract.
- Check shared components for regressions in existing consumers.
- Test responsive behavior at relevant mobile and desktop viewport sizes.
- Verify keyboard accessibility for important interactive components.
- Check that restricted profile data is not rendered or exposed when access is denied.
- Avoid brittle tests that depend unnecessarily on implementation details.

## 5. Regression Prevention

- Identify existing features and consumers affected by a change.
- Add regression tests for bugs when practical.
- Preserve existing tests unless the behavior is intentionally changed and the test update is justified.
- Never remove, weaken, skip, or rewrite a failing test merely to make the suite pass.
- Investigate failures before attributing them to unrelated existing issues.
- Do not silently update snapshots or expected responses to conceal regressions.
- When an intentional behavior change is required, explain its impact and update relevant tests and documentation.

## 6. Execute and Verify

- Discover the project's actual scripts and execute appropriate commands.
- Run targeted tests first, followed by broader checks where practical.
- Run linting, type checks, builds, and relevant test suites when available.
- Review command exit codes and relevant output.
- Distinguish tests that passed, failed, were skipped, or could not be executed.
- If the environment prevents testing, report the limitation and provide the exact command needed.
- Never fabricate test results or claim that unexecuted checks passed.
- Never claim a complete regression audit when only a single test was run.

## 7. Failure Handling

When a check fails:

1. Identify the failing command and relevant error.
2. Determine whether the failure is caused by the current change or an existing issue.
3. Fix failures introduced by the implementation.
4. Avoid unrelated modifications while resolving the failure.
5. Rerun the affected check.
6. Report unresolved failures honestly.

Do not hide failures by weakening TypeScript settings, disabling lint rules globally, suppressing assertions, or bypassing validation.

## 8. Completion Report

Report:

- Tests added or updated.
- Existing behavior and regression risks considered.
- Commands actually executed and their results.
- Build, lint, and type-check status.
- Tests not executed and why.
- Known failures and remaining risks.

## Final Invariant

A successful implementation is not merely code that compiles. Verify that the requested behavior works and that important existing behavior remains intact.
