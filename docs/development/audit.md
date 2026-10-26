# Phase 0 — Repository Audit (2026-10-23)

Audited commit: `04083b3` on `main` (3 commits total, last push 2026-05-31).
Scope: the full repository as cloned from `github.com/SoheilEs/buildpipe-ai`.

## 1. Repository and workspace

| Item | Finding |
|---|---|
| Layout | npm workspaces + Turborepo: `apps/{api,worker,ai-engine,mcp-server}`, `packages/{config,shared-types,kubernetes-sdk,ai-sdk}`, `prisma/`, `infrastructure/` |
| Size | ~6k lines (TS + docs). ~130 KB TypeScript |
| Lockfile | **None** (`package-lock.json` absent). Builds are not reproducible; `npm ci` cannot run |
| Node | `engines.node >= 20`; Dockerfiles use `node:20-alpine` |
| Branches | `main` only |
| CI | **None** (`.github/` absent) |
| Lint/format | `apps/api` has an `eslint` script but no ESLint is installed or configured; Prettier installed, no config, no script |

## 2. Modules that exist

| Module | Location | State |
|---|---|---|
| Auth (JWT + refresh rotation, GitHub/Google OAuth, OTP) | `apps/api/src/auth` | Implemented |
| RBAC (viewer < operator < admin) | `auth/guards/roles.guard.ts` | Implemented, global guard |
| Users | `apps/api/src/users` | Implemented |
| Clusters (AES-256-GCM encrypted kubeconfig) | `apps/api/src/clusters` | Implemented |
| Kubernetes read ops + `restartDeployment` | `apps/api/src/kubernetes`, `packages/kubernetes-sdk` | Implemented |
| Incidents + state machine (`CREATED→ENRICHING→ANALYZING→ANALYZED→RESOLVED`) | `apps/api/src/incidents` | Implemented |
| AI context pipeline (builder, normalizer, log reducer, event scorer) | `apps/api/src/ai/context` | Implemented |
| AI providers (OpenAI `gpt-4o-mini`, Anthropic `claude-3-5-haiku`) | `apps/api/src/ai/providers` | Implemented, hard-coded, no timeout/retry |
| Incident patterns (signature → root cause frequency) | `IncidentPattern` model | Primitive "memory" |
| Audit log | `apps/api/src/audit` | Implemented (free-form `metadata` string) |
| Events (NATS) | `apps/api/src/events` | Implemented, fire-and-forget |
| Queue (BullMQ/Redis) | `apps/api/src/queue`, `apps/worker` | Producer real; **worker analyze job is a stub** |
| WebSocket (Socket.IO) | `apps/api/src/websocket` | Implemented |
| Metrics (`/metrics`, prom-client) | `apps/api/src/metrics` | Default metrics only |
| MCP server (stdio → `/internal/mcp/*`) | `apps/mcp-server`, `apps/api/src/mcp` | Implemented |
| AI engine (heuristic) | `apps/ai-engine` | Duplicates API logic; optional |
| Frontend | — | **Does not exist** |

## 3. Data layer

- Prisma 6, **SQLite** (`file:/app/data/buildpipe.db`), shared by API and worker via a Docker volume.
- **No `prisma/migrations/`**; docs and compose use `db push`. There is no migration history to validate in CI.
- JSON stored as strings (`evidence`, `recommendations`, `metadata`).
- **No tenant/organization model.** Every user with `viewer` sees every cluster and incident.

## 4. Tests

| Spec | Covers |
|---|---|
| `incident-state-machine.service.spec.ts` | transitions + signature |
| `log-reducer.service.spec.ts` | log reduction |
| `event-scorer.service.spec.ts` | event scoring |

No integration, contract, e2e, or security tests. `test:e2e` points to a missing `test/jest-e2e.json`.

**Baseline result: the build is broken on `main`.** `turbo run build|test` aborts because `packageManager` is missing, and `nest build` for the API fails on a wrong import path in `incident-state-machine.service.spec.ts`. Two of the three spec suites pass (5/5 tests). Details are in [test-results.md](test-results.md).

## 5. Infrastructure

- Dockerfiles for api, worker, ai-engine, mcp-server: multi-stage, but run as **root**, copy the full `node_modules` (dev deps included) into the runtime image, no `HEALTHCHECK`, no OCI labels, no PID-1 signal handling (`tini`/`dumb-init`).
- `docker-compose.yml`: redis, nats, api, worker, ai-engine. No Postgres. No Kubernetes manifests, Helm, Kustomize, Argo CD or Terraform.
- `infrastructure/scripts/smoke.sh` exists and is a usable starting point for post-deploy smoke tests.

## 6. Security findings (ordered by severity)

| # | Finding | Location | Impact |
|---|---|---|---|
| S1 | OTP is consumed twice on the MCP restart path: `OtpGuard` verifies and consumes it, then `restartDeployment` calls `verifyOtp` again, finds no unconsumed challenge, and throws a plain `Error` (HTTP 500). | `mcp-bridge.controller.ts`, `kubernetes.service.ts` | Functional bug: MCP restart can never succeed |
| S2 | MCP audit logging spreads the whole DTO, **including the OTP code**, into `AuditLog.metadata`. | `mcp-bridge.controller.ts` `logMcp` | Secret written to the database |
| S3 | OTP plaintext is logged at `info` level, and returned as `devCode` whenever `NODE_ENV !== 'production'` (fails open on a missing or misspelled env). | `otp.service.ts` | OTP leakage |
| S4 **FIXED (M2.2)** | `.env.example` contains concrete JWT and encryption secrets, which `docker-compose` uses as-is. Encryption KDF uses a fixed salt. | `.env.example`, `encryption.service.ts` | Predictable keys in any deployment that copies the example |
| S5 **FIXED (M2.2)** | CORS defaults to `*`. | `main.ts` | Over-permissive |
| S6 | Kubeconfig carries whatever credentials the user uploads, often cluster-admin. The platform has no least-privilege service-account model and no READ_ONLY/DRY_RUN mode. | `clusters` | AI-adjacent path holds broad cluster credentials |
| S7 | No tenancy: any authenticated viewer can read every cluster's pods, logs and events. | all services | Cross-tenant data exposure (blocks commercial use) |
| S8 | MCP server uses one static long-lived JWT (`MCP_JWT_TOKEN`). | `mcp-server/src/server.ts` | Credential replay; every MCP action attributed to one user |
| S9 | Logs, events and annotations go into the LLM prompt with only control-char stripping; `stripSecretPatterns` exists but is **not called** on that path. | `ai/context`, `sanitize.util.ts` | Secret exfiltration to an external LLM; prompt injection |
| S10 | LLM provider calls have no timeout, retry, or circuit breaker, and provider error bodies are stored as "evidence". | `ai-providers.ts` | Hangs; error text leaks into stored RCA |
| **S13 (critical) FIXED (M2.2)** | Every container start ran `prisma/seed.ts` (via `entrypoint-api.sh`), which created `admin@buildpipe.ai` / `Admin123!`. The login was published in 8 places (README, DOCKER.md, docs, docker-up.ps1) and as the Swagger example, so any deployment had a publicly known admin account. Fix: no default admin. The seed creates the first admin only from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (12+ chars, no placeholder, not the old password); an existing account that still has the old password is rotated to `ADMIN_PASSWORD`; other accounts are untouched. | `prisma/seed.ts`, `entrypoint-api.sh`, docs | Unauthenticated admin takeover of every default deployment |
| **S11 (critical) FIXED and merged (PR #4, 8ce6f0a)** | `POST /auth/register` is public (`@Public()`), its DTO accepts `role`, and `AuthService.register` stores `dto.role`. Anyone can create an **admin** account unauthenticated and receives valid tokens. Was proven by an e2e test (stored role `"admin"`, expected `"viewer"`). Fix: `role` removed from `RegisterDto` (the global validation pipe now answers 400 to a payload containing it) and `register` always stores `viewer`; promotion is admin-only via `PATCH /users/:id`. Regression tests in `apps/api/test/api.e2e-spec.ts`. | `auth.controller.ts`, `auth.service.ts`, `auth.dto.ts` | Full privilege escalation: admin API, audit logs, cluster credentials, restart action |

## 7. Correctness and architecture debt

- The worker `ANALYZE_INCIDENT` job flips status `ANALYZING→ANALYZED` **without running any analysis**. The async path therefore produces "analyzed" incidents that have no analysis.
- Incidents are enqueued twice: the API enqueues `ENRICH_INCIDENT` directly *and* the worker re-enqueues on the NATS `incident.created` event.
- `enrichIncident` calls `markAnalyzed(id, '')` and bypasses the state machine. `markAnalyzed` never validates a transition.
- Sync analyze drops `userId` (`analyzeIncident(id, dto.provider)`), so the audit loses the actor.
- `ClustersService.create` throws `NotFoundException` for an invalid OTP (should be 401/403). Kubernetes restart throws a generic `Error` (500).
- `ContextEngineService` and `IncidentAnalyzerService` live in one file and call Prisma and the Kubernetes SDK directly. There are no ports or adapters, so the domain cannot be tested without infrastructure.
- `apps/ai-engine` duplicates analysis logic and is unused by the API.
- No outbox: DB write → NATS publish → enqueue are three independent side effects.

## 8. What is good and should be kept

- Clear NestJS module split, global guards, DTO validation with `whitelist` + `forbidNonWhitelisted`.
- Refresh-token rotation with family IDs; bcrypt-hashed OTPs with expiry.
- Kubeconfig encrypted at rest with AES-256-GCM.
- The context pipeline (reduce → score → normalize) is the correct seed for an evidence engine.
- The system prompt already demands "no invented data" and low confidence when context is missing.
- Shared zod-style schemas in `packages/shared-types` for AI input and output.

## 9. Gap analysis vs. the BuildPipe AI target

| Capability | Existing implementation | Missing functionality | Priority | Action |
|---|---|---|---|---|
| CI/CD | None | Lockfile, lint, typecheck, tests, build, security scans, image publish, deploy | P0 | Build step by step with the owner (see plan) |
| Tests | 3 unit specs | Integration, contract, security, incident-scenario suites | P0 | Grow alongside CI |
| Security baseline | Auth, RBAC, OTP, encryption | Fixes S1–S10 | P0 | Dedicated hardening milestone before new features |
| Database | SQLite, `db push` | Postgres, migration history, JSON columns, tenancy | P0 | ADR + baseline migration |
| Multi-tenancy | None | Organization model, scoped queries, membership roles | P1 | Before any commercial pilot |
| Evidence engine | Pods, events, logs (k8s only) | Evidence records with IDs, timeline, deployments/rollouts, endpoints, Prometheus, Loki adapters, hypotheses | P1 | Phase 1 |
| Structured RCA | `rootCause/confidence/evidence[]/recommendations[]` | Hypotheses, contradicting evidence, evidence references, missing-data notes | P1 | Phase 1 |
| Remediation | One action (`restart`) + OTP | Action contracts, policy chain, approvals bound to an immutable action hash, executor modes, idempotency | P1 | Phase 2 |
| Recovery verification | None | Strategy-based verifiers, observation windows | P1 | Phase 3 |
| Deployment guardian | None | Rollout history, GitOps (Argo CD/Flux) awareness | P2 | Phase 4 |
| AI providers | Two hard-coded clients | Provider factory, OpenAI-compatible/Ollama, timeouts, breaker, redaction | P1 | Phase 5 (redaction moves to the P0 hardening milestone) |
| Incident memory | `IncidentPattern` by exact signature | Similarity, operator feedback, validated remediations | P2 | Phase 6 |
| Frontend + i18n (en/fa, RTL) | None | Entire UI | P2 | Phase 7 |
| Self-observability | Default prom metrics, request ID | Domain metrics, OTel traces, correlation across jobs | P2 | Incremental |
| K8s deploy artifacts | None (compose only) | Helm chart or Kustomize, RBAC for BuildPipe itself | P1 | Before staging CD |
