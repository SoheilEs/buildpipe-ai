# ADR-0004: Identifiers that keep their BuildPipe names

Status: proposed (Phase 1), 2026-10-26.

## Context

Phase 1 changes the **display name** to Infralark (README, docs prose, Swagger title and description, startup log lines, the LLM system prompt, the Docker helper script). CLAUDE.md forbids renaming DB, API, package or env identifiers without a compatibility review and a migration plan. This ADR is that review.

## Identifiers left unchanged

| Identifier | Where | Why it stays | Risk if renamed |
|---|---|---|---|
| `@buildpipe/*` (api, worker, ai-engine, mcp-server, config, shared-types, kubernetes-sdk, ai-sdk) and root `buildpipe-ai` | every `package.json`, imports in ~25 files, Dockerfiles `npm run build -w ...`, `package-lock.json` | Internal workspace names; users never see them | Large mechanical diff, lockfile churn, Docker build breakage |
| GitHub repository `SoheilEs/buildpipe-ai` | remote, clone URLs in docs, ruleset | Renaming the remote is an owner action | Broken clones, PR links, CI badges |
| ~~`buildpipe.db` file and `buildpipe_data` volume~~ | replaced by PostgreSQL in Phase 2.0 ([ADR-0006](0006-postgresql.md)) | SQLite is gone; the old volume is no longer used and is not migrated | n/a |
| Compose project and container names (`buildpipe-ai-api`, `-worker`, `-ai-engine`) | derived from the directory name | Operators' scripts and monitoring | Orphaned containers and volumes |
| `scryptSync(key, 'buildpipe-salt', 32)` | `apps/api/src/common/crypto/encryption.service.ts` | Changing it makes every stored kubeconfig undecryptable | Data loss |
| MCP server name `buildpipe-ai` | `apps/mcp-server/src/server.ts` | MCP clients may key their config on it | Client config breaks silently |
| Prometheus `job_name: buildpipe-api` | `infrastructure/prometheus/scrape.yml` | Dashboards and alerts filter on it | Lost series continuity |
| Placeholder-secret reject list (`buildpipe-docker-*`) | `apps/api/src/config/env.validation.ts` | Must keep rejecting secrets copied from the old `.env.example` | Weak secrets accepted |
| `OTP_EMAIL_FROM` default `noreply@buildpipe.ai`, Swagger example emails, smoke-test emails | `env.schema.ts`, DTOs, `smoke.sh` | The domain is not confirmed as Infralark's; no email delivery exists | None until a real domain exists |
| Env var names (`JWT_SECRET`, `DATABASE_URL`, ...) | everywhere | Not branded | n/a |
| `docs/history/buildpipe/` | docs | Historical record | n/a |

## Display strings changed in Phase 1

Swagger title and description, startup log lines (api, worker, ai-engine, mcp-server), the SYSTEM_PROMPT sentence naming the product, `docker-up.ps1` messages, README, docs index and overview prose. The e2e test that asserted the Swagger title was updated with it.

## i18n

This repo is a backend with no UI text, so there is nothing to make translation-ready here. UI strings live in the frontend repo, which already uses `next-intl` with `en` and `de` (ADR-0003).

## Proposed non-destructive migration (later, owner decision)

1. PostgreSQL (ADR-0006) already uses Infralark names for the database and user (`infralark`) and the volume `postgres_data`; the SQLite file `buildpipe.db` and volume `buildpipe_data` are retired, not renamed.
2. Rename the npm scope in one dedicated PR (`@buildpipe/*` to `@infralark/*`) with a codemod and a rebuilt lockfile, only when no open PR touches imports.
3. Rename the GitHub repository (owner action); GitHub redirects old URLs. Then update docs links.
4. Introduce a new encryption salt with a versioned ciphertext prefix so old and new records both decrypt, then re-encrypt in a migration.
5. Add the new Prometheus job name alongside the old one for one release.
6. MCP server name: advertise the new name and keep accepting the old one for a deprecation period.
