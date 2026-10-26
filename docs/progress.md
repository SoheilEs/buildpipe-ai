# Progress

Statuses: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · VERIFIED · BLOCKED.
IMPLEMENTED means the code or document exists. VERIFIED means tests or CI evidence are recorded in [testing.md](testing.md).

## Infralark phases

| Phase | Scope | Status | Evidence | Blockers |
|---|---|---|---|---|
| 0 | Repository audit and plan | IMPLEMENTED (docs only, awaiting owner review) | [architecture/overview.md](architecture/overview.md), [product/infralark-mvp.md](product/infralark-mvp.md), ADR [0001](adr/0001-request-state-machine.md), [0002](adr/0002-module-boundaries-and-legacy.md), [0003](adr/0003-frontend-scope.md). Baseline checks on `main` (52b43d9) are in [testing.md](testing.md) | ADR-0001 states need owner confirmation |
| 1 | Display rename, docs skeleton, CI | NOT_STARTED | — | Frontend is content-only in a separate repo (ADR-0003). Staging CD blocked by B1 |
| 2 | Read-only end-to-end flow | NOT_STARTED | — | PostgreSQL step first (owner decision) |
| 3 | Approval, Git PR, staging execution, verification | NOT_STARTED | — | Staging cluster (B1), scoped Git credential |
| 4 | Fixtures, reproducible staging, demo, metrics | NOT_STARTED | — | — |
| 5 | Pilot readiness | NOT_STARTED | — | — |

Open owner inputs: staging cluster or permission to use kind in CI (B1); LLM key or local endpoint, only for live AI runs (B4); a scoped GitHub credential and a config repo for fixtures (Phase 3); how OTPs are delivered if used as a step-up factor (B7).

Next action: owner reviews Phase 0 docs. Then Phase 1: ADR for identifiers that keep their BuildPipe names, display rename, and content-only edits in the frontend repo.

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
