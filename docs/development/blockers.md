# Blockers

| ID | Blocker | Affects | Needed from owner | Status |
|---|---|---|---|---|
| B1 | No staging Kubernetes cluster or kubeconfig/OIDC trust configured for GitHub Actions | M6 staging CD, real-cluster incident tests | A target cluster (or approval to use a kind cluster in CI for tests only) and GitHub Environment `staging` with its secrets | OPEN |
| B2 | No production environment | M10 | Environment definition + required reviewers | OPEN (by design, later) |
| B3 | Branch protection / required checks can only be set by the repo owner | M1.7 | **Done 2026-10-23**: ruleset `protect-main` (id 25716774), enforcement active, no bypass actors, targets the default branch. Rules: restrict deletions, block force pushes, require a pull request (0 approvals), require status checks `Build and test`, `Static checks`, `Workflow lint` with branches up to date. Read back via the GitHub API | CLOSED |
| B4 | Real LLM verification needs API keys or a local model endpoint | Phase 1 live RCA runs | `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` as repo secrets, or an Ollama endpoint. Unit tests use deterministic fakes and are not blocked | OPEN |
| B5 | No Prometheus/Loki in the dev stack | Phase 1 metric/log adapters (live) | Approval to add them to `docker-compose` for local dev | OPEN |
| B6 | Perplexity connector in this environment only imports dashboards; it has no search tool | Research step | None. Research was done with web search instead | NOTED |
