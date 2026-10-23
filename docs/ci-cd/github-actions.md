# GitHub Actions

## Workflows

| Workflow | File | Triggers | Purpose | Status |
|---|---|---|---|---|
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | PR → `main`, push to `main`, manual | Three jobs, listed below | M1.2, M1.3 |

e2e, migration, Docker and security jobs are added in later steps. The schedule is in [implementation-plan.md §4](../development/implementation-plan.md).

## CI jobs

Each job is its own check on the PR. The check name is the job `name:`, with no workflow prefix.

| Check name (use this in rulesets) | Job id | Runs | Fails when |
|---|---|---|---|
| `Build and test` | `build-test` | `npm ci`, `prisma generate`, build, **typecheck**, unit tests | Any step fails. Typecheck also covers `*.spec.ts`, which the build skips |
| `Static checks` | `static-checks` | `npm ci`, ESLint (`npm run lint`), Prettier (`npm run format:check`) | A lint error or an unformatted file |
| `Workflow lint` | `workflow-lint` | actionlint v1.7.12 (`go run …@v1.7.12`; Go and shellcheck come with the runner image) | A workflow syntax, expression or shell-script problem |

### `build-test` in detail

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
| Typecheck | `npm run typecheck` → per-workspace `tsc --noEmit --incremental false` | A type error anywhere, including specs. `--incremental false` keeps it from writing `tsbuildinfo`, which would make a later build skip emitting |
| Test | `npm test` → `turbo run test` | Any jest suite fails or does not compile |

Run the same thing locally:

```bash
npm ci && npx --no-install prisma generate && npm run build && npm run typecheck && npm test
npm run lint && npm run format:check   # Static checks
```

Fix formatting with `npm run format`.

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

Require all three checks on `main`: `Build and test`, `Static checks`, `Workflow lint` (Settings → Rules → Rulesets). That is M1.7, tracked as blocker B3. A check only appears in the picker after it has run once.
