---
trigger: model_decision
description: Protects production deployments, environment configuration, CI/CD workflows, application startup, database migration sequencing, and recovery procedures.
---

# Deployment and Configuration Safety Rule

## Mission

Prevent unsafe deployments, accidental secret exposure, configuration mistakes, incompatible releases, and avoidable production downtime.

Every deployment-related change must be reviewed for its effect on the existing environment, application compatibility, data integrity, and recovery options.

## 1. Inspect Before Changing Deployment Configuration

- Inspect existing environment configuration, build scripts, startup commands, deployment workflows, and infrastructure conventions.
- Identify the actual hosting environment and deployment process before making changes.
- Preserve working configuration unless a change is required.
- Do not assume a local development configuration is appropriate for production.
- Avoid changing unrelated infrastructure or deployment files.
- Explain deployment dependencies and risks before making significant changes.

## 2. Environment Variables and Secrets

- Never hardcode production credentials, database passwords, signing keys, API secrets, or service-account credentials.
- Keep secrets in environment variables or an approved secrets manager.
- Never commit `.env` files containing real secrets.
- Preserve and review `.gitignore` rules for environment files, generated secrets, and sensitive artifacts.
- Distinguish public frontend configuration from private server-side configuration.
- Never expose private credentials through `NEXT_PUBLIC_` variables or browser bundles.
- Validate required environment variables during application startup or deployment.
- Document required variable names and purposes without including their secret values.
- Do not print secret values during debugging or validation.
- If a secret is exposed, recommend appropriate revocation and rotation.

## 3. Frontend Deployment Safety

- Preserve the established Next.js build, startup, and hosting configuration.
- Verify that server-only credentials and privileged operations remain on trusted server infrastructure.
- Check environment-specific API base URLs and authentication settings.
- Ensure production builds do not depend on local-only files or development services.
- Review SSR, ISR, static generation, and caching behavior for privacy risks.
- Never statically publish sensitive, user-specific data unintentionally.
- Preserve required routing, redirects, metadata, and asset paths.
- Verify the application's build and relevant runtime configuration before release.
- Do not change hosting architecture without a justified requirement.

## 4. Backend Deployment Safety

- Preserve existing NestJS bootstrap, startup, health-check, logging, and shutdown conventions.
- Validate database connectivity and required configuration.
- Keep CORS, cookie security, trusted proxy configuration, and security headers appropriate for the actual production environment.
- Do not enable development-only diagnostics or expose internal tooling unintentionally.
- Avoid exposing stack traces, secrets, or internal configuration through production endpoints.
- Ensure startup and shutdown behavior handles database connections and other resources appropriately.
- Preserve existing authentication and authorization controls across environments.

## 5. Database and Release Sequencing

- Review Prisma migrations before deployment.
- Verify compatibility between the application version and the target database schema.
- Identify whether migrations can cause downtime, lock large tables, or require backfills.
- Prefer backward-compatible deployment sequences for changes affecting multiple application versions.
- Never automatically reset or destructively modify production databases.
- Do not execute production migrations without the required authorization.
- Avoid deploying code that requires a schema change before that change is safely available.
- Identify migration failure handling and recovery requirements.
- Keep schema cleanup separate from initial compatibility migrations when appropriate.

## 6. CI/CD and Build Safety

- Preserve existing CI/CD conventions and required validation checks.
- Run relevant lint, type-check, test, and build commands before release when available.
- Do not bypass failing required checks merely to deploy.
- Avoid exposing secrets in CI logs, artifacts, or build output.
- Do not run untrusted scripts with privileged deployment credentials.
- Review changes to deployment permissions and access controls.
- Avoid introducing new deployment tools or infrastructure without justification.
- Never claim a release is deployed or healthy solely because a local build succeeded.

## 7. Production Operations and Recovery

Before significant production changes:

- Identify the affected services and expected user impact.
- Verify the available backup and recovery procedures where data integrity is at risk.
- Define health checks and basic post-deployment verification.
- Identify how to recover from an unsuccessful application release.
- Consider rollback compatibility with database changes.
- Prefer forward-fix or compensating migrations when a database rollback would risk data loss.
- Obtain approval before destructive or irreversible production operations.
- Do not claim that a rollback or backup procedure works without evidence.

## 8. Deployment Verification

After a deployment when execution access is available:

- Verify application startup and health checks.
- Check relevant API endpoints and frontend routes.
- Confirm expected environment configuration without printing secrets.
- Check authentication, CORS, and other critical integration behavior.
- Review relevant logs for errors and failed migrations.
- Verify critical user journeys where practical.
- Distinguish successful build, successful deployment, and verified production health.
- Report any checks that could not be performed.

## 9. Change Control

- Do not silently modify production infrastructure, credentials, access permissions, or deployment workflows.
- Obtain explicit approval before destructive database operations, irreversible infrastructure changes, or risky production releases.
- Never delete existing resources simply to resolve a deployment issue without assessing their impact.
- Preserve unrelated deployment configuration.
- Document manual actions and required configuration changes.

## 10. Completion Requirements

Report:

1. Deployment and configuration files changed.
2. Required environment variables by name, without secret values.
3. Build and validation results actually obtained.
4. Database migration and release sequencing requirements.
5. Deployment risks, recovery considerations, and required approvals.
6. Production checks completed and any checks still outstanding.

## Final Invariant

Never compromise production security, data integrity, or recoverability to make a deployment succeed. A successful build is not proof of a safe or healthy production release.
