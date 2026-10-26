# Progress

Statuses: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · VERIFIED · BLOCKED.
IMPLEMENTED means the code or document exists. VERIFIED means tests or CI evidence are recorded in [testing.md](testing.md).

## Infralark phases

| Phase | Scope | Status | Evidence | Blockers |
|---|---|---|---|---|
| 0 | Repository audit and plan | VERIFIED (CI) | Merged in PR #8 (199142a); CI run 40363558037 green (3 checks). Docs: [architecture/overview.md](architecture/overview.md), [product/infralark-mvp.md](product/infralark-mvp.md), ADR [0001](adr/0001-request-state-machine.md), [0002](adr/0002-module-boundaries-and-legacy.md), [0003](adr/0003-frontend-scope.md) | ADR-0001 state set taken as accepted by merge; owner can still amend |
| 1 | Display rename, docs skeleton, CI | IN_PROGRESS | 1.1 merged in PR #9 (eb08cd4), CI run 40365615314 green. 1.5 draft on branch `infralark/phase-1-5-staging-cd`. Sub-items below | Staging CD blocked by B1; frontend content edit is a separate repo (ADR-0003) |
| 2 | Read-only end-to-end flow | IN_PROGRESS | 2.0 PostgreSQL: VERIFIED (CI), merged in PR #11, `Migrations` job green on run 40375367643 ([ADR-0006](adr/0006-postgresql.md)). 2.1: VERIFIED (CI), merged in PR #12 (run 40377469142 green, including `test:db`). 2.2 services registry, approver role and request API: IMPLEMENTED on branch `infralark/phase-2-2-services-and-requests-api` ([ADR-0007](adr/0007-services-registry-and-request-api.md)); CI not run yet. 2.3 evidence and findings: IMPLEMENTED on branch `infralark/phase-2-3-evidence-findings`, stacked on the 2.2 branch ([ADR-0008](adr/0008-evidence-and-findings.md)); CI not run yet. 2.4 to 2.10 NOT_STARTED | Existing SQLite data is not migrated; owner must add the `Migrations` check to ruleset `protect-main` |
| 3 | Approval, Git PR, staging execution, verification | NOT_STARTED | — | Staging cluster (B1), scoped Git credential |
| 4 | Fixtures, reproducible staging, demo, metrics | NOT_STARTED | — | — |
| 5 | Pilot readiness | NOT_STARTED | — | — |

Open owner inputs: staging cluster or permission to use kind in CI (B1); LLM key or local endpoint, only for live AI runs (B4); a scoped GitHub credential and a config repo for fixtures (Phase 3); how OTPs are delivered if used as a step-up factor (B7).

### Phase 1 sub-items

| Item | Status | Note |
|---|---|---|
| 1.1 Display rename + identifier ADR | VERIFIED (CI) | Merged in PR #9; ADR-0004 lists identifiers kept on purpose |
| 1.2 Translation-ready strings | NOT APPLICABLE here | Backend has no UI text; the frontend repo already uses next-intl (en, de) |
| 1.3 Docs skeleton | IMPLEMENTED | `docs/runbooks/` is a placeholder until Phase 4 |
| 1.4 CI | Existing, unchanged | `ci.yml` already runs `npm ci` (lockfile), build, typecheck, unit, e2e, ESLint, Prettier, actionlint |
| 1.5 Staging CD workflow | DRAFT, unverified, BLOCKED (B1) | `deploy-staging.yml` passes actionlint only; never run. [ADR-0005](adr/0005-staging-cd.md), [runbook](runbooks/staging-deploy-setup.md). Needs a staging cluster, a published image (M5) and a Helm chart (Phase 5) |
| 1.6 Frontend content edit (repo `Desktop/velnor`) | IMPLEMENTED locally | Branch `content/infralark-product`, commit 137b9ce, not pushed; lint, typecheck, build pass (ADR-0003) |

Next action: owner reviews the Phase 2.2 PR and adds `Migrations` to ruleset `protect-main`. Phase 2.4 (read-only Kubernetes adapter, the first evidence collector) follows. The Phase 2.3 PR is stacked on 2.2: merge 2.2 first.

## BuildPipe baseline milestones (carried over)

History of the CI and security work before Infralark: [history/buildpipe/](history/buildpipe/).

| Phase | Feature | Status | Tests | Documentation | Blockers |
|---|---|---|---|---|---|
| 0 | Repository audit + gap analysis | VERIFIED | n/a | [audit.md](history/buildpipe/audit.md) | — |
| 0 | Implementation plan | IMPLEMENTED | n/a | [implementation-plan.md](history/buildpipe/implementation-plan.md) | — |
| M1.1 | Make main build: lockfile, packageManager, Node pin, spec fix | VERIFIED (CI) | CI run 39938152396 green: build 8/8, tests 7/7 ([results](testing.md)) | this file, implementation-log | Docker build unverified (daemon not running locally) |
| M1.2 | Minimal `ci.yml` | VERIFIED (CI) | actionlint clean; PR run 39938152396 green | [github-actions.md](ci-cd/github-actions.md) | PR #1 awaiting owner merge; required check not yet enforced (B3) |
| M1.3 | Static checks: ESLint, Prettier, typecheck, actionlint | VERIFIED (CI) | PR run 39939976084: all 3 checks green ([results](testing.md)) | [github-actions.md](ci-cd/github-actions.md) | Merged in PR #2 (4f9060a) |
| M1.4 | e2e harness + API smoke (+ S11 fix) | VERIFIED (CI) | PR run 39942238735: all 3 checks green, 24 e2e tests ([results](testing.md)) | [github-actions.md](ci-cd/github-actions.md) | Merged in PR #4 (8ce6f0a) |
| M1.5 | Migration validation job | NOT_STARTED | — | — | M3 |
| M1.6 | Docker build check | NOT_STARTED | — | — | M4 |
| M1.7 | Branch protection | VERIFIED (GitHub API) | ruleset `protect-main` read back: active, no bypass, 3 required checks | [github-actions.md](ci-cd/github-actions.md) | A rejected direct push has not been exercised; add a new job name to the ruleset whenever CI gains a job |
| M2.1 | OTP handling: single verification, no OTP in audit/logs, fail-closed dev mode (S1, S2, S3) | VERIFIED (CI) | 36 e2e + 7 unit pass locally; 9 of 12 new tests fail on the old code ([results](testing.md)) | [audit.md](history/buildpipe/audit.md), [api-reference](api-reference.md) | Merged in PR #6 (1984142); CI run 40361314416 green on f58af7c. B7: no OTP delivery channel |
| M2.2 | Secrets, default admin and CORS (S4, S5, S13) | VERIFIED (CI) | 40 unit + 31 e2e pass locally; real-process boot refusals 12/12; seed run through 5 scenarios ([results](testing.md)) | [audit.md](history/buildpipe/audit.md), [configuration](configuration.md), [deployment](deployment.md) | Merged in PR #7 (52b43d9); CI run 40362060921 green on 72cc8ba. Breaking for existing deployments, see the upgrade notes in deployment.md |
| M2.3 | Prompt data hygiene (S9) | NOT_STARTED | — | — | — |
| M2.4 | LLM call limits and error handling (S10) | NOT_STARTED | — | — | — |
| M3 | Postgres + migrations + tenancy | NOT_STARTED | — | — | — |
| M4 | Container hardening + `security.yml` | NOT_STARTED | — | — | — |
| M5 | GHCR build/publish | NOT_STARTED | — | — | — |
| M6 | Helm + staging CD | NOT_STARTED | — | — | B1 |
| 1 | Evidence engine + structured RCA | NOT_STARTED | — | — | — |
| 2 | Policy-controlled remediation | NOT_STARTED | — | — | — |
| 3 | Recovery verification | NOT_STARTED | — | — | — |
| 4 | Deployment guardian | NOT_STARTED | — | — | — |
| 5 | Private AI providers | NOT_STARTED | — | — | B4 |
| 6 | Incident memory | NOT_STARTED | — | — | — |
| 7 | Frontend + i18n | NOT_STARTED | — | — | — |

## Resume point (BuildPipe track)

M2.1 and M2.2 are merged. Remaining BuildPipe-track items (M2.3 prompt data hygiene S9, M2.4 LLM limits S10) are folded into Infralark Phase 2.8; M1.5 and M1.6 follow the PostgreSQL step and image hardening.
