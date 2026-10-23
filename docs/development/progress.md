# Progress

Statuses: NOT_STARTED · IN_PROGRESS · IMPLEMENTED · VERIFIED · BLOCKED.
IMPLEMENTED means the code exists. VERIFIED means tests or CI evidence are recorded in [test-results.md](test-results.md).

| Phase | Feature | Status | Tests | Documentation | Blockers |
|---|---|---|---|---|---|
| 0 | Repository audit + gap analysis | VERIFIED | n/a | [audit.md](audit.md) | — |
| 0 | Implementation plan | IMPLEMENTED | n/a | [implementation-plan.md](implementation-plan.md) | — |
| M1.1 | Make main build: lockfile, packageManager, Node pin, spec fix | IMPLEMENTED | local build 8/8, tests 7/7 ([results](test-results.md)) | this file, implementation-log | Pushed on `ci/m1.1-buildable-main` (7871886). Docker build unverified |
| M1.2 | Minimal `ci.yml` | IMPLEMENTED | actionlint clean; steps pass locally. **Not yet run on GitHub** | [github-actions.md](../ci-cd/github-actions.md) | Needs a PR to `main` to trigger the first run |
| M1.3 | ESLint + Prettier + typecheck jobs | NOT_STARTED | — | — | M1.2 |
| M1.4 | e2e harness + API smoke | NOT_STARTED | — | — | M1.2 |
| M1.5 | Migration validation job | NOT_STARTED | — | — | M3 |
| M1.6 | Docker build check | NOT_STARTED | — | — | M4 |
| M1.7 | Branch protection | NOT_STARTED | — | — | B3 |
| M2 | Security hardening S1–S5, S9, S10 | NOT_STARTED | — | [audit.md §6](audit.md) | — |
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

Next action: owner reviews the M1.2 diff. After commit and push, open a PR `ci/m1.1-buildable-main` → `main` so CI runs on GitHub for the first time. Mark M1.1/M1.2 VERIFIED only after that run is green. Then **M1.3**.
