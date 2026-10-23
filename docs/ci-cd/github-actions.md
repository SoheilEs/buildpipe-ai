# GitHub Actions

## Workflows

| Workflow | File | Triggers | Purpose | Status |
|---|---|---|---|---|
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | PR → `main`, push to `main`, manual | Install from lockfile, generate Prisma client, build all workspaces, run unit tests | M1.2 |

Lint, typecheck, e2e, migration, Docker and security jobs are added in later steps. The schedule is in [implementation-plan.md §4](../development/implementation-plan.md).

## CI job: `build-test`

```mermaid
flowchart LR
  A[checkout<br/>no persisted token] --> B[setup-node<br/>.nvmrc + npm cache]
  B --> C[npm ci]
  C --> D[prisma generate]
  D --> E[turbo build<br/>8 workspaces]
  E --> F[turbo test]
```

| Step | Command | Fails the run when |
|---|---|---|
| Install | `npm ci --no-audit --no-fund` | `package-lock.json` is missing or out of sync with any `package.json` |
| Prisma | `npx --no-install prisma generate` | The schema is invalid. `--no-install` forbids fetching an unpinned Prisma |
| Build | `npm run build` → `turbo run build` | Any workspace fails to compile |
| Test | `npm test` → `turbo run test` | Any jest suite fails or does not compile |

Run the same thing locally:

```bash
npm ci && npx --no-install prisma generate && npm run build && npm test
```

## Security conventions (apply to every workflow)

- **Pinned actions.** Every `uses:` references a full 40-character commit SHA with the release tag in a comment. Tags can be re-pointed, which is what happened in the tj-actions/changed-files compromise. Update pins deliberately: resolve the new tag's SHA with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.
- **Least-privilege token.** The workflow-level `permissions: contents: read`. Jobs that need more (for example `packages: write` for GHCR) declare it on the job only.
- **No persisted credentials.** `actions/checkout` uses `persist-credentials: false`, so later steps such as `npm ci` lifecycle scripts can't read the token from `.git/config`.
- **No `pull_request_target`.** Fork PRs run with a read-only token and no secrets.
- **Concurrency.** A new push to a PR cancels that PR's previous run. Runs on `main` are never cancelled.
- **Telemetry off.** Turbo (`TURBO_TELEMETRY_DISABLED`) and Prisma (`CHECKPOINT_DISABLE`) phone-home is disabled.

## Toolchain

- Node version comes from `.nvmrc` (24). The runner image is pinned to `ubuntu-24.04` instead of `ubuntu-latest`, so image upgrades are deliberate.
- `packageManager` declares `npm@11.16.0`. npm itself does not enforce this field. The runner uses whatever npm ships with the resolved Node 24 release, and the "Toolchain versions" step prints both versions in every run.

## Validating workflow changes locally

```bash
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/*.yml
```

actionlint runs shellcheck on `run:` blocks only when `shellcheck` is installed.

## Required checks

Once the workflow has run on GitHub at least once, the owner should require the **CI / Build and test** check on `main` (Settings → Rules → Rulesets). That is M1.7, tracked as blocker B3.
