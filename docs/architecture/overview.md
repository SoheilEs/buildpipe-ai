# Architecture overview: current vs target

Date: 2026-10-26. Audited commit: `main` at `52b43d9`. Older detail: [architecture.md](../architecture.md) (BuildPipe-era) and [history/buildpipe/audit.md](../history/buildpipe/audit.md).

## Current (verified by reading the repo)

NestJS API (`apps/api`) + BullMQ worker (`apps/worker`) + Prisma 6 on PostgreSQL 16 with `prisma migrate` (Phase 2.0; was SQLite without migrations) + Redis + NATS. Legacy modules: incidents with a state machine, AI analysis (OpenAI/Anthropic, hard-coded), MCP bridge, a heuristic `ai-engine`, Kubernetes read plus deployment restart. No frontend, no Git, scanner or executor adapter. CI runs build, typecheck, unit, e2e, ESLint, Prettier and actionlint, and `main` is protected by ruleset `protect-main`.

## Target (modular monolith, same runtime)

```
API (NestJS)
 ├─ identity (auth, users, roles, approver)      extends existing
 ├─ integrations (cluster, git, scanner, ai)     extends clusters, new adapters
 ├─ services            registry of services -> cluster/namespace/workload/repo/files
 ├─ service-requests    request + state machine (ADR-0001)
 ├─ evidence            timestamped, versioned, redacted
 ├─ analysis            deterministic compatibility checks + optional AI summary
 ├─ proposals           deterministic patch builder
 ├─ approvals           bound to patch hash, base commit, target, state snapshot
 ├─ execution           idempotency key, per-target lock, staging handler
 ├─ verification        rollout/pod/readiness/functional test/scan re-run
 ├─ reporting           before/after, Passed/Failed/Not run/Blocked
 └─ audit               append-only hash chain
Ports (interfaces + fakes): KubernetesReader, ScannerPort, ImageInspector, GitPort, AiPort, StagingExecutor
Worker (BullMQ): collection and execution jobs with job ids derived from the idempotency key
DB: PostgreSQL + prisma migrate (decision: start of Phase 2)
```

The workflow core has no AI dependency. AI output is optional and schema-validated.

## Module map (Phase 0 classification)

Labels: Exists & verified / Partial / New / Unknown. Evidence is file paths. "Verified" means covered by passing tests recorded in [testing.md](../testing.md).

| Module | Class | Evidence / gap |
|---|---|---|
| identity | Partial | `apps/api/src/auth`, `users`; JWT, refresh rotation, RBAC viewer/operator/approver/admin (approver added in Phase 2.2) and OTP are tested (e2e). Separation of duties lives in the request state machine; approvals are Phase 3 |
| integrations | Partial | `clusters` (encrypted kubeconfig), `kubernetes`, `packages/kubernetes-sdk` (read plus restart). No Git, scanner, or least-privilege per-identity credentials |
| services | Partial (Phase 2.2) | registry model, strict validation, admin-only CRUD with audit, in `apps/api/src/services`. Stores locations only; no Kubernetes-side existence check yet |
| service-requests | Partial (Phase 2.1) | state machine, persistence, history and idempotent create exist in `apps/api/src/service-requests` with unit and PostgreSQL tests. HTTP layer added in Phase 2.2: create, list, read, history, cancel; no arbitrary status endpoint |
| evidence | Partial | `apps/api/src/ai/context/*` reduces and scores logs/events (unit-tested). No evidence records with source/version |
| analysis | Partial | `apps/api/src/ai/*` exists but has open findings S9 (no redaction in prompt path) and S10 (no timeout); `confidence` field conflicts with product rules |
| proposals | New | none |
| approvals | New | only OTP guard (`auth/guards/otp.guard.ts`), not bound to an action |
| execution | New | no executor, lock or idempotency; `restart` is the only mutation |
| verification | New | none |
| reporting | New | none |
| audit | Partial | `apps/api/src/audit`; append-only by convention only, no hash chain, free-form metadata |

## Entity mapping

| Logical entity | Existing | Action |
|---|---|---|
| Service | none | new |
| ServiceRequest | `Incident` (different purpose) | new table; do not repurpose Incident |
| Evidence | `AiAnalysis.evidence` (JSON string) | new table |
| Finding | none | new |
| ChangeProposal | none | new |
| Approval | `OtpChallenge` (login-style OTP) | new table; OTP stays a step-up factor only |
| Execution, VerificationResult | none | new |
| AuditEvent | `AuditLog` | extend with `prevHash`, `hash` |
| Integration (cluster) | `Cluster` | reuse; add per-identity credentials |

No duplicates are planned: `Incident` and `AiAnalysis` remain legacy and are not reused for new semantics.

## Known gaps carried from the audit

S6 (broad kubeconfig), S7 (no tenancy; single-organisation pilot makes this a non-goal for the MVP), S8 (static MCP token), S9, S10, S12 are open. Container images run as root, which is a credibility problem for a non-root product and is scheduled before the pilot.
