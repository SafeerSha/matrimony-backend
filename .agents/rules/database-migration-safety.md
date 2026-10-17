---
trigger: model_decision
description: Protects PostgreSQL data integrity and Prisma schema evolution through reviewed migrations, backward compatibility, recovery planning, and production-safe database operations.
---

# Database Migration and Data Integrity Safety Rule

## Mission

Prevent accidental data loss, incompatible schema changes, inconsistent records, and unsafe production migrations while maintaining reliable Prisma and PostgreSQL operations.

## 1. Inspect Before Changing the Schema

- Inspect the current Prisma schema, migration history, relevant models, relations, indexes, and constraints.
- Review existing application queries and services that depend on affected models.
- Determine whether the requested change requires a schema migration or can be implemented without one.
- Identify affected records, constraints, API consumers, and deployment dependencies.
- Never assume a schema change is isolated to a single model.

## 2. Migration Safety

- Use the project's established Prisma migration workflow.
- Review generated SQL and migration files before applying them.
- Prefer additive, backward-compatible changes when practical.
- Never reset a shared or production database to resolve migration problems.
- Never silently drop columns, tables, constraints, or existing data.
- Do not make existing required fields nullable or non-nullable without assessing the impact.
- Do not assume that `prisma db push` is an appropriate production migration strategy.
- Never edit already-applied migration history casually.
- Never mark a failed migration as successfully applied without understanding and resolving its actual state.
- Obtain explicit approval before destructive migrations or irreversible data transformations.

## 3. Expand-and-Contract Strategy

For risky schema changes, prefer a staged approach:

1. Add compatible schema structures.
2. Deploy application code that supports both old and new representations when necessary.
3. Backfill existing records safely.
4. Verify data completeness and application compatibility.
5. Move consumers to the new representation.
6. Remove obsolete structures only after explicit approval and confirmation that they are no longer used.

Do not force a multi-stage migration for trivial, safe changes where it provides no meaningful benefit.

## 4. Data Integrity and Constraints

- Preserve foreign-key relationships and referential integrity.
- Use unique constraints for invariants that must hold under concurrent operations.
- Review defaults, nullability, indexes, and delete/update behavior.
- Validate data before transformations.
- Consider duplicate records, missing values, invalid legacy data, and concurrent writes.
- Use transactions for operations that must succeed or fail together.
- Make large backfills resumable and appropriately batched where necessary.
- Avoid destructive bulk updates without an approved scope and recovery plan.

## 5. Production Protection

- Never execute destructive commands against production without explicit authorization.
- Never run database resets, truncations, or unrestricted deletion commands as a shortcut.
- Do not assume local migration success guarantees production compatibility.
- Review migration locking, table size, index creation, deployment order, and downtime risk where relevant.
- Ensure the application version being deployed is compatible with the database schema.
- Identify required environment variables and migration commands before deployment.
- Do not expose database credentials in logs, generated reports, or committed files.

## 6. Backup and Recovery

Before high-risk production changes:

- Verify the applicable backup and recovery procedure.
- Identify the recovery point and restoration requirements.
- Determine how partial migration failure will be handled.
- Prefer forward-fix or compensating migrations when reversing a migration would risk data loss.
- Do not claim a backup is valid without evidence that the required backup and recovery process is available.
- Obtain approval before proceeding if an adequate recovery plan is missing.

## 7. Migration Verification

- Review the generated migration SQL.
- Validate the migration against an isolated test database or representative staging environment.
- Check affected queries, relations, constraints, and existing data.
- Run relevant integration tests and application builds.
- Verify migration status using the established workflow.
- Test rollback or recovery procedures when applicable and safe.
- Never use production data destructively to validate a migration.

## 8. Completion Requirements

Report:

1. Schema and migration changes.
2. Affected models, tables, columns, indexes, and constraints.
3. Data migration or backfill requirements.
4. Compatibility and deployment sequencing.
5. Verification actually performed.
6. Backup, recovery, and rollback limitations.
7. Required approval before any risky production operation.

## Final Invariant

Protect existing data by default. Never sacrifice database integrity for implementation convenience, and never execute irreversible production changes without explicit authorization and a reviewed recovery plan.
