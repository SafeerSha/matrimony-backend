---
name: feature-implementation
description: Plan and implement a requested feature safely in the existing Next.js frontend or NestJS backend, preserving contracts, architecture, security, and established behavior.
---

# Feature Implementation Skill

## Purpose
Deliver the smallest complete implementation that satisfies the requested feature while preserving existing behavior and following the repository's active rules.

## Workflow

### 1. Understand the request
- Restate the expected behavior and observable acceptance criteria.
- Identify unclear requirements that materially affect data, permissions, API contracts, or user experience. Ask a focused question when necessary; otherwise state reasonable assumptions.
- Do not expand the scope with unrelated improvements.

### 2. Inspect before editing
- Inspect the relevant routes, components, modules, services, DTOs, Prisma models, API clients, tests, and project scripts.
- Trace the affected user flow and dependencies.
- Search for existing functionality before creating new abstractions.
- Check repository status and preserve unrelated user changes.
- Identify frontend/backend coordination needs. Never assume the other repository is available.

### 3. Plan the change
- List the files and layers likely to change.
- Identify API contract, authorization, privacy, migration, concurrency, responsive-design, and regression risks as applicable.
- Prefer existing patterns and dependencies.
- For significant or risky changes, present a concise plan before editing.

### 4. Implement
- Make focused, incremental changes.
- Preserve existing public API shapes unless a change is explicitly requested and approved.
- Frontend: reuse design tokens and components; preserve Next.js server/client boundaries, rendering, accessibility, and responsive behavior.
- Backend: follow NestJS module conventions, validate DTOs, enforce authorization server-side, map safe response DTOs, and use Prisma safely.
- Treat client input and user-generated content as untrusted.
- Keep private data and secrets out of browser bundles, URLs, logs, and public caches.
- Add schema changes only when necessary. Review generated migrations and never reset or destructively alter a shared/production database.
- Do not add dependencies or refactor unrelated modules without justification.

### 5. Verify
- Discover and use the repository's actual scripts; do not guess that a script exists.
- Run the most relevant tests first, then appropriate lint, type-check, and build commands.
- Add or update regression tests for changed behavior.
- For API changes, verify request/response compatibility and identify frontend coordination requirements.
- For UI changes, inspect affected responsive states and loading/error/empty states.
- For database changes, validate the schema and migration using a safe environment.
- Never claim a check passed unless it actually ran and passed.

### 6. Review the diff
- Inspect the final diff for unrelated edits, accidental secret exposure, weakened validation, removed tests, unsafe casts, and contract changes.
- Fix issues introduced by the implementation.
- Do not hide or suppress failures merely to obtain a passing build.

## Completion report
Summarize:
1. Behavior implemented.
2. Important files/modules changed.
3. API or database implications.
4. Tests and checks actually run, with results.
5. Known limitations, unresolved failures, or manual steps.

## Stop and ask for approval
Ask before destructive database operations, breaking public API changes, weakening security, irreversible production actions, or substantial unrelated refactoring.

## Success criteria
The feature meets the requested behavior, follows repository conventions, preserves unrelated functionality, has appropriate verification, and reports remaining risks honestly.
