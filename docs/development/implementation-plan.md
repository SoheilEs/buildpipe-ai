# Implementation Plan

Status date: 2026-10-23. Inputs: [audit.md](audit.md) and the market and security research summarized below.

## 1. Evaluation

### Where the project stands

BuildPipe AI today is a **well-structured prototype of an "AI explains a Kubernetes incident" tool**. Its NestJS skeleton (auth, RBAC, encrypted kubeconfigs, incident state machine, context pipeline, MCP bridge) is a good foundation. It is not yet the evidence → policy → approval → execution → verification platform described in the master prompt. It also has no CI, no lockfile, no migrations, no tenancy and no UI, and the security findings S1–S10 in the audit must be fixed before anything is exposed.

### Market position (research summary)

- **Crowded diagnosis layer.** Open-source diagnosis tools already exist: k8sgpt (Apache-2.0) and HolmesGPT (CNCF sandbox). Commercial ones include Komodor's Klaudia (change-history correlation), Metoro (eBPF, fix PRs), Resolve AI, NeuBird, Datadog Bits AI and Dynatrace Davis. "LLM reads pods, events and logs and explains" is a commodity, so BuildPipe cannot win on RCA alone.
- **Defensible gap: safe execution plus proof of recovery.** Most tools stop at diagnosis or open a PR. Vendor guidance on agent guardrails converges on a layered model: a per-action policy decision (allow / require-approval / deny), approval gates, cluster admission control as a backstop, and a full audit trail. Few products tie an **approval to an immutable action** *and* **verify recovery afterwards**. That is the master prompt's Phases 2–3, and it should be the product's spine.
- **Second differentiator: self-hosted, disconnected operation** with local models (Phase 5). EU and regulated buyers and air-gapped industrial sites need it, and most SaaS AI SRE tools cannot offer it.
- **MCP risk is real.** 2026 guidance on MCP tool servers highlights prompt injection through tool output, tool-description poisoning, and over-scoped service accounts. BuildPipe's current MCP bridge (static JWT, cluster-wide kubeconfig, logs fed raw to the LLM) has exactly that shape. Hence the hardening milestone comes first.
- **CI supply chain.** Pin third-party actions to full commit SHAs, default `GITHUB_TOKEN` to read-only, use OIDC instead of long-lived cloud keys, never use `pull_request_target` for untrusted code, and sign images and attach provenance. The tj-actions/changed-files tag-repointing incident is the standard cautionary example.

Sources: [Mezmo AI SRE tools](https://www.mezmo.com/learn/best-ai-sre-tools-00035), [Corelayer ranking](https://www.corelayer.com/guides/best-ai-sre-tools-2026), [Aurora RCA benchmark](https://www.aurorasre.ai/blog/top-10-aiops-platforms-free-root-cause-analysis-2026), [awesome-ai-sre](https://github.com/agamm/awesome-ai-sre), [Qovery guardrails](https://www.qovery.com/blog/policy-guardrails-ai-agents-infrastructure-automation-platforms), [cmdev OPA approval](https://creativeminds.dev/blog/opa-for-ai-agent-action-approval/), [MCP in Kubernetes hardening](https://www.systemshardening.com/articles/kubernetes/kubernetes-mcp-server-security/), [Checkmarx MCP risks](https://checkmarx.com/learn/mcp-security-risks-real-world-incidents-and-security-controls/), [GH Actions hardening](https://safeguard.sh/resources/blog/github-actions-supply-chain-hardening-checklist-2026). Most of these are vendor or blog sources. Treat specific numbers as indicative only.

### Positioning recommendation

> "The AI SRE you can let touch production": evidence-cited RCA, policy-gated actions bound to human approval, and verified recovery, deployable fully on-prem.

## 2. Architecture direction (to be captured as ADRs)

| ADR | Decision | Rationale |
|---|---|---|
| ADR-0001 | Keep a **modular monolith** (API + worker). Fold `apps/ai-engine` into the API's AI module or delete it | It duplicates logic, has no consumer, and adds an extra image and attack surface |
| ADR-0002 | **SQLite → PostgreSQL**, adopt `prisma migrate` with a baseline migration | Concurrency between API and worker, JSON columns, row-level tenancy, and an operational standard for pilots |
| ADR-0003 | **Ports and adapters** for Kubernetes, LLM, metrics and log sources inside `apps/api/src/modules/*`. Move gradually, not in one big bang | Testability, plus the master prompt's domain-isolation rule |
| ADR-0004 | **Transactional outbox** for domain events. Pick BullMQ *or* NATS as the internal bus, not both | Removes the current double-enqueue and lost-event risk |
| ADR-0005 | **Action contract + approval hash**: approvals sign `sha256(canonical action JSON)` and the executor refuses on mismatch, expiry, stale `resourceVersion` or a replayed idempotency key | Core differentiator |
| ADR-0006 | **Deployment target**: Helm chart in-repo plus GHCR images. Staging via `helm upgrade --atomic` from GitHub Actions; GitOps later if adopted | No deployment tooling exists today, and Helm is the lowest-friction path to both CD and customer installs |

## 3. Milestones (dependency order)

| # | Milestone | Key outputs | Done when |
|---|---|---|---|
| M0 | Audit + plan | `audit.md`, this file, progress, blockers | ✅ this session |
| **M1** | **CI foundation (step by step with the owner)** | See §4 | `ci.yml` green on GitHub on a PR |
| M2 | Security hardening P0 | Fixes S1–S5, S9, S10 with regression tests | Tests prove each fix |
| M3 | Postgres + migrations + tenancy | ADR-0002, `Organization`/`Membership`, scoped repositories, cross-tenant tests | Migration validated in CI against a Postgres service container |
| M4 | Container hardening + security workflow | Non-root slim images, healthchecks, Trivy/gitleaks/osv/zizmor | `security.yml` green |
| M5 | Build & publish to GHCR | `build-publish.yml`, digests, SBOM, provenance | Image pushed from `main` |
| M6 | Helm chart + staging CD | `deploy/helm/buildpipe`, `deploy-staging.yml`, smoke test | Blocked until a staging cluster exists (see blockers) |
| M7 | Phase 1: evidence engine + structured RCA | Evidence model, timeline, hypotheses, 10 incident fixtures | Fixture suite green; kind-cluster run documented |
| M8 | Phase 2: policy-controlled remediation | Action contracts, policy chain, approval manager, executor modes | Security test list from the master prompt §5 green |
| M9 | Phase 3: recovery verification | Verifier strategies and lifecycle | Every execution ends VERIFIED/FAILED/INCONCLUSIVE |
| M10 | Production CD | `deploy-production.yml` with environment approval and rollback | Documented; live run blocked until prod exists |
| M11+ | Phases 4–7 | Deployment guardian, private AI, incident memory, frontend + i18n | Per phase |

## 4. M1 — CI foundation, step by step

Each step is a separate small PR. The owner reviews and approves each one before the next starts.

| Step | Change | Why it comes first |
|---|---|---|
| **1.1** | Make `main` build: add `packageManager` to the root `package.json`, commit a `package-lock.json`, fix the spec import path, add `apps/api/tsconfig.build.json` that excludes specs, pin Node via `.nvmrc`. Proof: `npm ci && npm run build && npm test` green locally | The baseline build is broken today (see [test-results.md](test-results.md)). Without a lockfile, `npm ci` and cache keys cannot work |
| 1.2 | Minimal `ci.yml`: checkout → setup-node (cache npm) → `npm ci` → `prisma generate` → `turbo build` → `turbo test`. Read-only `permissions`, `concurrency` cancel-in-progress, actions pinned to SHAs | First green signal on real commands |
| 1.3 | Add ESLint (flat config) + Prettier config, then `lint`, `format:check` and `typecheck` jobs. Format the codebase once in a dedicated commit | Static gate |
| 1.4 | Fix `test:e2e` (add `test/jest-e2e.json`) and add a first Supertest smoke (health + auth guard denies anonymous) | Real integration signal |
| 1.5 | Prisma migration validation job (after M3 switches to Postgres: service container + `prisma migrate deploy` + `migrate diff` drift check) | Needs M3 |
| 1.6 | Docker build check (no push) for api + worker images on PRs, with Buildx cache | Needs M4 Dockerfile fixes to be meaningful |
| 1.7 | Branch protection on `main` requiring the CI checks (owner does this in GitHub settings; documented) | Makes failures blocking |

## 5. Explicitly out of scope until earlier milestones land

- Production deployment, auto-remediation in production, Git write access to customer repos.
- Vector search for incident memory (only if exact and structured similarity proves insufficient).
- Replacing NestJS, Prisma, or BullMQ.
