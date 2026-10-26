# Test Results

Results are Passed / Failed / Not run / Blocked. Entries from 2026-10-23 and earlier are BuildPipe-era history and keep their original wording.

## 2026-10-26: Phase 1.5 staging deploy workflow draft (local)

Branch `infralark/phase-1-5-staging-cd` from `main` at `eb08cd4`. Only a workflow, docs and an ADR changed.

| Check | Result |
|---|---|
| `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12` on `deploy-staging.yml` and `ci.yml` | Passed (exit 0). Sanity check: the same command reports an error on a deliberately broken workflow |
| `npm run format:check`, `npm run lint` | Passed |
| Docs link check | Passed: 0 broken |
| Build, typecheck, unit, e2e | Not run: no source code changed |
| Workflow execution (variable gate, input validation, kubeconfig handling, Helm, rollback) | **Not run** (no staging cluster, image or chart) |
| `helm` and `kubectl` present on `ubuntu-24.04` | Not verified |
| GitHub CI on this branch | Not run yet |

## 2026-10-26: Infralark Phase 1 display rename (local, Node v24.18.0)

Branch `infralark/phase-1-rename` from `main` at `199142a`.

| Command | Result |
|---|---|
| `npm run build` | Passed: 8/8 tasks |
| `npm run typecheck` | Passed: 12/12 tasks |
| `npm test` | Passed: 5 suites, 40 tests |
| `npm run test:e2e` | Passed: 3 suites, 43 tests (the Swagger-title assertion now expects `Infralark API`) |
| `npm run lint` | Passed |
| `npm run format:check` | Passed after `prettier --write` on `app.setup.ts` (the first run failed on a long line) |
| `bash -n infrastructure/scripts/smoke.sh` | Passed (syntax only) |
| Docs link check | Passed: 0 broken |
| GitHub CI on this branch | Not run yet |
| Docker image build, `docker-up.ps1`, MCP server on stdio | Not run (only log text changed; not exercised) |
| Mutation check | Not run: the only behavioural assertion changed is a string literal |

## 2026-10-26: Infralark Phase 0 baseline (local, Windows 11, Node v24.18.0)

Branch `infralark/foundation` from `main` at `52b43d9` (after PRs #5, #6, #7 merged). Only docs, `CLAUDE.md`, one code comment path (`otp.service.ts`) differ from `main`.

| Command | Result |
|---|---|
| `npm ci --no-audit --no-fund` | Passed in practice: later steps ran on the installed tree. Exit code not captured separately. npm warned about pending install scripts (`npm approve-scripts`) |
| `npx prisma generate` | Passed |
| `npm run build` | Passed: 8/8 tasks |
| `npm run typecheck` | Passed: 12/12 tasks |
| `npm test` | Passed: 5 suites, 40 tests |
| `npm run test:e2e` | Passed: 3 suites, 43 tests |
| `npm run lint` | Passed (exit 0) |
| `npm run format:check` | Passed |
| Docs link check (`node` script over all `*.md`, relative links) | Passed: 0 broken |
| GitHub CI on this branch | Not run (nothing pushed yet) |
| Docker image builds, real PostgreSQL, Redis/NATS, real Kubernetes, Kubescape, Git write, staging | Not run (none exist yet or are blocked by B1) |

Turbo reported cached tasks on some runs, so build and typecheck timings are not meaningful here.

## 2026-10-23 — Phase 0 baseline (local, Windows 11, Node v24.18.0, npm 11.16.0)

Commit `04083b3`, clean clone. No lockfile in the repo, so dependency versions were resolved fresh. The results are therefore **not reproducible** until M1.1 lands.

| Command | Result |
|---|---|
| `npm install --no-audit --no-fund` | exit 0 |
| `npx prisma generate` | exit 0 |
| `npm run build` (`turbo run build`) | **exit 1**: turbo 2.11.10 refuses to run: *"Could not resolve workspace. Missing `devEngines.packageManager` or legacy `packageManager` field in package.json"* |
| `npm test` (`turbo run test`) | **exit 1**: same turbo error |
| `npm run build -w @buildpipe/{config,shared-types,kubernetes-sdk,ai-sdk,worker,mcp-server,ai-engine}` | exit 0 each |
| `npm run build -w @buildpipe/api` (`nest build`) | **exit 1**: `src/incidents/incident-state-machine.service.spec.ts:1:43 TS2307 Cannot find module '../incident-state-machine.service'`. The spec sits in the same directory as the service, so the import must be `./`. `nest build` compiles spec files. Docker builds don't hit this because `.dockerignore` excludes `**/*.spec.ts` |
| `cd apps/api && npx jest` | **1 suite failed** (same import error), 2 suites passed, **5/5 tests passed** in the suites that compiled |

### Conclusions feeding M1.1

1. Add `"packageManager": "npm@<version>"` to the root `package.json` and commit a lockfile.
2. Fix the spec import path (`../` → `./`) and exclude specs from `nest build` (`tsconfig.build.json`).
3. Node version is unpinned: Docker uses 20 and this machine used 24. Pin it via `.nvmrc` and CI.

Remote CI: **not run** (no workflows exist).

## 2026-10-23 — M1.1 "make main build" (branch `ci/m1.1-buildable-main`, local, Windows 11, Node v24.18.0, npm 11.16.0)

| Command | Result |
|---|---|
| `npm install` with `legacy-peer-deps` removed, fresh lockfile | exit 0, no ERESOLVE. The peer-dep override was unnecessary |
| `rm -rf node_modules … && npm ci` (from the new lockfile) | exit 0 |
| `npx prisma generate` | exit 0 |
| `npm run build` (first try) | **exit 2**: `ai-sdk`/`worker` TS2307 for `@buildpipe/shared-types`. Root cause: stale `tsconfig.tsbuildinfo` outside `dist/` made `tsc` skip emitting after `dist/` was deleted. Fixed by setting `tsBuildInfoFile: dist/.tsbuildinfo` |
| `npm run build` | exit 0, turbo **8/8 tasks** |
| `npm test` | exit 0, `@buildpipe/api`: **3/3 suites, 7/7 tests** |
| `rm -rf apps/*/dist packages/*/dist .turbo && npx turbo run build --force` | exit 0, 8/8 |
| `find apps/api/dist -name '*.spec.*'` | 0 files (specs excluded from build) |
| Docker image build | **NOT RUN**: Docker Desktop daemon not running on this machine |

Remote CI: not run (workflow arrives in M1.2).

## 2026-10-23 — M1.2 minimal `ci.yml` (local validation only)

| Command | Result |
|---|---|
| YAML parse (`js-yaml`) + pin check (every `uses:` is a 40-char SHA) | pass, 2 actions pinned |
| `gh api repos/actions/{checkout,setup-node}/commits/<tag>` vs pinned SHAs | both match (`v7.0.1`, `v7.1.0`) |
| `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml` | exit 0, no findings (shellcheck not installed, so the shell-script pass was skipped) |
| Workflow steps run locally: `npx --no-install prisma generate && npm run build && npm test` | exit 0. Build 8/8, tests 3/3 suites, 7/7 tests. `npm ci` was not re-run (lockfile unchanged since M1.1, where it passed) |
| Remote GitHub Actions run | **NOT RUN**. The workflow triggers on PRs to `main`, and no PR exists yet |

### M1.1 + M1.2: first remote run (verified in CI)

| Item | Result |
|---|---|
| Run | [`39938152396`](https://github.com/SoheilEs/buildpipe-ai/actions/runs/39938152396), event `pull_request` (PR #1), commit `8e61e8f`, **success**, about 54 s |
| Runner toolchain | Node v24.21.0, npm 11.19.0 (newer than `packageManager` npm@11.16.0; npm does not enforce that field) |
| Steps | checkout, setup-node, toolchain versions, `npm ci`, `prisma generate`, build, test: all success |
| Build | turbo 8/8 tasks |
| Tests | `@buildpipe/api`: 3/3 suites, 7/7 tests |

This is the first evidence from a clean Linux environment. Local Windows results above are no longer the only proof. Still **not** verified: Docker image builds, any real Kubernetes environment, staging.

## 2026-10-23: M1.3 static checks (branch `ci/m1.3-static-checks`, local, Node v24.18.0)

| Command | Result |
|---|---|
| `npx eslint .` (first run, before fixes) | 8 errors: 5 unused imports/args, 1 dead self-assignment (`apps/mcp-server`), 1 intentional control-char regex (`sanitize.util.ts`), 1 unused import in `seed.ts`. No logic bugs |
| `npm run lint` after fixes | exit 0 |
| `npx prettier --check .` (first run) | 96 files flagged. Most differed only by CRLF in the Windows working tree; git stored them as LF. `prettier --write` changed 28 files in git |
| `npm run format:check` after formatting | exit 0 |
| `npm run typecheck` | exit 0, 12 turbo tasks, specs included |
| Negative test: restore the old bad spec import `'../incident-state-machine.service'` | `apps/api` typecheck **fails** with TS2307 (exit 2); passes again once restored. The gate would have caught the original M1 bug |
| `prisma generate` after deleting `prisma/prisma.config.ts` | exit 0. Warning: `package.json#prisma` (seed config) is deprecated and removed in Prisma 7. Pre-existing |
| `npm run build`, `npm test` after formatting | exit 0; 8/8 build tasks, 3 suites / 7 tests |
| `actionlint v1.7.12` on the updated `ci.yml` | exit 0 (local run has no shellcheck, so shell-script checks are skipped locally) |
| Remote GitHub run | **NOT RUN**. Unconfirmed until it runs: that the runner has Go and shellcheck preinstalled for the `Workflow lint` job |

### M1.3: first remote run (verified in CI)

| Item | Result |
|---|---|
| Run | [`39939976084`](https://github.com/SoheilEs/buildpipe-ai/actions/runs/39939976084), event `pull_request` (PR #2), commit `250d39a` |
| `Build and test` | success, 50 s: build 8/8, typecheck 12/12, tests 3 suites / 7 tests |
| `Static checks` | success, 31 s: ESLint clean, "All matched files use Prettier code style!" |
| `Workflow lint` | success, 19 s: `go run …actionlint@v1.7.12` ran on the runner's preinstalled Go (module downloaded through the Go proxy) |
| Not shown by the logs | Whether shellcheck ran inside actionlint. Treat shell-script linting as unverified until a deliberately bad `run:` snippet is seen to fail |
| Post-merge push run on `main` (4f9060a) | run `39940154139` was still in progress when this was written; not yet recorded |

Still not verified: Docker image builds, a real Kubernetes environment, staging. `main` has no ruleset, so the green checks are not yet enforced (B3).

## 2026-10-23: M1.4 e2e smoke tests (branch `ci/m1.4-e2e-smoke`, local, Node v24.18.0)

| Command | Result |
|---|---|
| First `jest --config ./test/jest-e2e.json` | failed to load: `@kubernetes/client-node` (ESM-only) → `SyntaxError: Unexpected token 'export'`; ts-jest also warned about transforming workspace `dist/*.js`. Fixed with a module mock and `transform` limited to `.ts` |
| `npm run test:e2e` | exit 0, **20/20 tests**, 1 suite, about 13 s, `--detectOpenHandles` reported nothing |
| Negative test A: run test `S11` as a normal test | fails with `Expected: "viewer"  Received: "admin"`, so the defect is real and `it.failing` fails for the right reason |
| Negative test B: temporarily make `JwtAuthGuard` always allow | **11 of 20 tests fail** (all anonymous-denial tests plus "viewer can read clusters" shape check). Guard restored; `git diff` empty |
| `npm run build`, `typecheck` (now also covers `test/`), `npm test`, `lint`, `format:check` | all exit 0; unit tests still 3 suites / 7 tests; `apps/api/dist/main.js` present, no e2e files in `dist` |
| `actionlint v1.7.12` on updated `ci.yml` | exit 0 |
| Remote GitHub run | see "M1.4: first remote run" below |

### M1.4 follow-up: S11 fix (same branch, local)

| Item | Result |
|---|---|
| Fix | `role` removed from `RegisterDto`; `AuthService.register` always stores `viewer`. Other role paths checked: `PATCH /users/:id` is admin-only; OAuth sign-up creates `viewer`; `seed.ts` does not use `RegisterDto` |
| `npm run test:e2e` | **24/24** (the pinned `it.failing` test was replaced by 5 regression tests: role=admin/operator/viewer rejected with 400 and no user created; role-less registration creates a viewer; a freshly registered token gets 403 on `/audit/logs`) |
| Mutation check: temporarily restore the old `auth.service.ts` / `auth.dto.ts` | the three "rejects role=…" tests **fail**, 21 pass; fix restored afterwards |
| Final full run: build, typecheck, unit (3 suites / 7 tests), e2e (24), lint, prettier | all exit 0 |
| Behaviour change | clients that sent `role` on register now receive 400 instead of an account with that role. No client in this repo does |

### M1.4 (+ S11 fix): first remote run (verified in CI)

| Item | Result |
|---|---|
| Run | [`39942238735`](https://github.com/SoheilEs/buildpipe-ai/actions/runs/39942238735), event `pull_request` (PR #4), head `5b64096` (after merging `main`) |
| `Build and test` | success, 64 s: build 8/8, typecheck 12/12, unit 3 suites / 7 tests, **e2e 1 suite / 24 tests** |
| `Static checks` | success, 28 s |
| `Workflow lint` | success, 18 s |
| Post-merge push run on `main` (`8ce6f0a`) | [`39942518838`](https://github.com/SoheilEs/buildpipe-ai/actions/runs/39942518838) success. The earlier `main` run for PR #3 (`61bc086`, run `39942112133`) also succeeded |

The e2e suite passing on a clean Linux runner confirms the stubbed-infrastructure approach works without Redis, NATS or a database.

Still not verified: Docker image builds, any real database, Redis/BullMQ, NATS or Kubernetes, staging. `main` has **no ruleset** (B3), so these green checks are still not enforced.

## 2026-10-23: M2.1 OTP handling (branch `security/m2.1-otp-handling`, local, Node v24.18.0)

| Item | Result |
|---|---|
| New suite `apps/api/test/otp.e2e-spec.ts` | 12 tests, stateful OTP stub (a consumed challenge cannot be verified again) |
| Mutation check: run the suite against the pre-fix `apps/api/src` | **9 failed, 3 passed**. Failing: POST /clusters (valid OTP), reuse of a consumed OTP, PATCH /clusters/:id, REST restart (wrong OTP returned 500), MCP restart (500), audit metadata, default non-disclosure of the code, dev flag, unknown purpose. The 3 passing ones were already correct on the old code (wrong OTP gives 401 on cluster create, REST restart with a valid OTP, `NODE_ENV=production` hid `devCode`) |
| Fix restored; full run | build 8/8, typecheck, unit 3 suites / 7 tests, **e2e 2 suites / 36 tests**, lint, format: all exit 0 |
| Remote GitHub run | **NOT RUN** (nothing committed or pushed yet) |

Limits: Kubernetes is faked at the `ClustersService` seam, so a real cluster restart is untested. The OTP table is an in-memory stub, not a real database.

## 2026-10-23: M2.2 secrets, default admin and CORS (branch `security/m2.2-secrets-cors`, local, Node v24.18.0)

| Item | Result |
|---|---|
| Unit: `env.validation.spec.ts`, `cors.spec.ts` | 33 new tests: every published secret rejected, CHANGE_ME variants, short, low-variety, duplicates, all problems reported at once without echoing values, `CORS_ORIGIN=*` rejected in production only, `.env.example` as shipped does not boot |
| E2E: `config.e2e-spec.ts` | 7 tests: no CORS headers by default (request and preflight), exact allowlist, no-Origin requests still served; `AppModule` refuses a published secret, a placeholder, and `*` in production |
| First e2e attempt | crashed the Jest process: `ConfigModule.forRoot()` is async, so a validation error is a rejected promise created at import. Fixed by loading a fresh `AppModule` under `jest.isolateModules` and handing it to Nest in the same tick |
| Real process, built `dist/main.js`, 3 rounds x 4 bad configs (published secret, placeholders, `CORS_ORIGIN=*` in production, nothing set) | **12/12** exit 1 in about 1 s with `Refusing to start`, secret values not printed. A good configuration boots (stopped by the timeout; NATS/Redis being down only warns) |
| Harness note | an earlier single run showed the published-secret case "not refusing"; it was a 15 s timeout killing a cold first start. Repeating with a 60 s timeout showed no such case |
| Seed script, throwaway SQLite, 5 scenarios | no credentials: nobody seeded (exit 0). Short / CHANGE_ME / `Admin123!` password: exit 1, nobody seeded. Strong password: admin created and the password verifies. Existing account with the old password: rotated (old no longer matches, new does). Existing account with another password: unchanged |
| Mutation A: restore `origin: process.env.CORS_ORIGIN ?? '*'` | 3 CORS e2e tests fail |
| Mutation B: remove `validate: validateEnv` from `ConfigModule.forRoot` | 3 startup e2e tests fail (an earlier attempt hung because the unvalidated app tried a real database; it was stopped, the files restored, and it was rerun with a timeout) |
| Full run: build, typecheck, unit (5 suites / 40), e2e (2 suites / 31), lint, format | all exit 0 |
| Remote GitHub run | **NOT RUN** |

Not tested: the container image, `docker compose up` with a real `.env`, the seed running inside the entrypoint, and the WebSocket CORS handler through a live socket (covered only through the shared handler's unit tests).
