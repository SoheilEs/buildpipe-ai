# ADR-0006: PostgreSQL with Prisma migrations

Status: accepted by owner (decision at the start of Phase 2), implemented 2026-10-26.

## Context

The base used SQLite shared by the API and the worker through a Docker volume, with `prisma db push` and no migration history. Phases 2 and 3 need persisted state history, idempotency keys and a per-target execution lock, which depend on real transactions and unique constraints under concurrent writers.

## Decision

- `provider = "postgresql"`; PostgreSQL 16 in `docker-compose.yml` (`postgres:16-alpine`), published only on `127.0.0.1`.
- Schema changes go through `prisma migrate`. The first migration, `20261026000000_baseline`, creates the current nine models and five enums; it was generated from `schema.prisma` with `prisma migrate diff --from-empty`. The API container runs `prisma migrate deploy` on start.
- No schema change in this step. JSON-as-string columns stay as they are; they are revisited when the new Infralark tables are designed.
- `POSTGRES_PASSWORD` has no default. Compose refuses to start without it, and `validateEnv` rejects a `file:` or non-PostgreSQL `DATABASE_URL` and a URL containing the `CHANGE_ME` placeholder.
- CI gets a `Migrations` job with a PostgreSQL service container: apply to an empty database, drift check, seed twice.
- No data migration from SQLite. No production data is known to exist; the upgrade note in `docs/deployment.md` says the new database starts empty. A one-off importer was not written.
- No multi-tenancy (owner decision).

## Consequences

- Existing SQLite deployments lose their data on upgrade unless they export it first.
- The e2e tests still stub Prisma and do not touch a database, so they do not exercise PostgreSQL. The `Migrations` job and the manual run recorded in docs/testing.md are the only database evidence so far.
- The new `Migrations` check is not required by ruleset `protect-main` until the owner adds it.
- Backup and restore runbooks for PostgreSQL are not written yet.
