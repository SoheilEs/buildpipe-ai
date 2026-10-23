# Test Results

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
