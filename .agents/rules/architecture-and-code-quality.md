---
trigger: always_on
name: architecture-and-code-quality
description: Preserves existing Next.js and NestJS architecture, modularity, dependency management, maintainability, and established coding conventions.
---

# Architecture and Code Quality Rule

## Mission

Maintain a coherent, maintainable application architecture while implementing new functionality. Prefer small, understandable changes that fit existing conventions over unnecessary rewrites or architectural complexity.

## 1. Architecture Discovery

- Inspect the existing repository structure before implementation.
- Identify the established architectural patterns, module boundaries, naming conventions, dependency-injection strategy, and testing conventions.
- Reuse existing utilities, services, hooks, components, and abstractions where appropriate.
- Do not introduce a new architecture merely because another pattern is fashionable.
- Do not duplicate existing functionality without a demonstrated need.
- Keep changes limited to the requested feature and necessary supporting code.

## 2. General Code Quality

- Write readable, cohesive, maintainable code.
- Use clear names that communicate purpose.
- Keep functions and classes focused on well-defined responsibilities.
- Avoid unnecessary nesting, duplicated logic, overly complex conditions, and oversized modules.
- Use explicit types and avoid unsafe casts or broad type suppressions.
- Handle errors intentionally rather than swallowing exceptions.
- Avoid dead code, unused dependencies, and abandoned abstractions.
- Follow established formatting, linting, and naming conventions.
- Prefer straightforward solutions over premature optimization.

## 3. Frontend Architecture

- Preserve established Next.js routing and rendering conventions.
- Respect Server Component and Client Component boundaries.
- Keep UI components focused and reusable.
- Separate API communication and reusable business logic according to existing project conventions.
- Avoid duplicating API calls, validation rules, or state-management logic across pages.
- Use shared state only when multiple components genuinely require it.
- Avoid introducing global state for local UI behavior.
- Reuse the existing form library, API client, UI primitives, and design tokens.
- Do not create duplicate components or styling systems for functionality already supported.
- Keep private server-only logic and credentials out of browser bundles.

## 4. Backend Architecture

- Preserve established NestJS modules, controllers, providers, services, guards, pipes, interceptors, and exception-handling patterns.
- Keep controllers focused on HTTP concerns.
- Place business logic in the appropriate services or established domain layer.
- Reuse existing authentication, authorization, validation, and logging mechanisms.
- Preserve the established database-access conventions.
- Avoid circular dependencies and unnecessary module coupling.
- Use dependency injection rather than unnecessary manual instantiation.
- Do not introduce repository abstractions, CQRS, event sourcing, or additional architectural layers solely for stylistic preference.
- Avoid exposing persistence models directly when explicit DTOs are required.

## 5. Dependencies and Reuse

- Inspect existing dependencies before adding another library.
- Prefer built-in capabilities or already-installed dependencies when they meet the requirement.
- Add a new dependency only when it provides a justified benefit.
- Consider maintenance status, security risks, bundle size, compatibility, and licensing where relevant.
- Never replace an established library or framework without explaining the reason and impact.
- Do not duplicate functionality already available through project utilities or shared components.

## 6. Change Scope

- Do not perform broad refactoring as part of an unrelated feature.
- Do not rename public methods, API fields, routes, modules, or shared components without a justified requirement.
- Preserve public contracts and established behavior.
- Separate necessary bug fixes from optional cleanup where practical.
- If a substantial refactor is required, explain the scope, risks, and alternatives before proceeding.
- Do not overwrite unrelated changes or assume uncommitted code is disposable.

## 7. Documentation and Maintainability

- Update relevant documentation when introducing new public behavior, configuration, or operational requirements.
- Document non-obvious business rules and architectural decisions.
- Avoid comments that merely repeat the code.
- Keep examples and configuration instructions consistent with the actual implementation.
- Do not claim that documentation was updated if it was not.

## 8. Completion Requirements

Report:

1. Architectural patterns reused.
2. Important files and modules changed.
3. New dependencies or abstractions and why they were necessary.
4. Significant trade-offs or compatibility concerns.
5. Relevant validation and test results.
6. Any remaining technical debt introduced by the change.

## Final Invariant

Follow the architecture that exists unless there is a justified reason to change it. Do not trade maintainability for unnecessary abstraction or implementation speed.
