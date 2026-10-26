# Progress

Statuses: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · VERIFIED · BLOCKED.
IMPLEMENTED means the code exists. VERIFIED means tests or CI evidence are recorded in [test-results.md](test-results.md).

| Phase | Feature | Status | Tests | Documentation | Blockers |
|---|---|---|---|---|---|
| 0 | Repository audit + gap analysis | VERIFIED | n/a | [audit.md](audit.md) | — |
| 0 | Implementation plan | IMPLEMENTED | n/a | [implementation-plan.md](implementation-plan.md) | — |
| M1.1 | Make main build: lockfile, packageManager, Node pin, spec fix | VERIFIED (CI) | CI run 39938152396 green: build 8/8, tests 7/7 ([results](test-results.md)) | this file, implementation-log | Docker build unverified (daemon not running locally) |
| M1.2 | Minimal `ci.yml` | VERIFIED (CI) | actionlint clean; PR run 39938152396 green | [github-actions.md](../ci-cd/github-actions.md) | PR #1 awaiting owner merge; required check not yet enforced (B3) |
| M1.3 | Static checks: ESLint, Prettier, typecheck, actionlint | VERIFIED (CI) | PR run 39939976084: all 3 checks green ([results](test-results.md)) | [github-actions.md](../ci-cd/github-actions.md) | Merged in PR #2 (4f9060a) |
| M1.4 | e2e harness + API smoke (+ S11 fix) | VERIFIED (CI) | PR run 39942238735: all 3 checks green, 24 e2e tests ([results](test-results.md)) | [github-actions.md](../ci-cd/github-actions.md) | Merged in PR #4 (8ce6f0a) |
| M1.5 | Migration validation job | NOT_STARTED | — | — | M3 |
| M1.6 | Docker build check | NOT_STARTED | — | — | M4 |
| M1.7 | Branch protection | VERIFIED (GitHub API) | ruleset `protect-main` read back: active, no bypass, 3 required checks | [github-actions.md](../ci-cd/github-actions.md) | A rejected direct push has not been exercised; add a new job name to the ruleset whenever CI gains a job |
| M2.1 | OTP handling: single verification, no OTP in audit/logs, fail-closed dev mode (S1, S2, S3) | IMPLEMENTED | 36 e2e + 7 unit pass locally; 9 of 12 new tests fail on the old code ([results](test-results.md)) | [audit.md](audit.md), [api-reference](../api-reference.md) | Branch `security/m2.1-otp-handling`, awaiting review. B7: no OTP delivery channel |
| M2.2 | Secrets, default admin and CORS (S4, S5, S13) | IMPLEMENTED | 40 unit + 31 e2e pass locally; real-process boot refusals 12/12; seed run through 5 scenarios ([results](test-results.md)) | [audit.md](audit.md), [configuration](../configuration.md), [deployment](../deployment.md) | Branch `security/m2.2-secrets-cors`, awaiting review. Breaking for existing deployments, see the upgrade notes in deployment.md |
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

## Resume point

Next action: owner reviews M2.1 (PR #6) and M2.2 (PR #7). Decide B7 (how OTPs are delivered). Then M2.3 and M2.4. The M1.5 migration check and M1.6 Docker build check wait for M3 and M4.
