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
