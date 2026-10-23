# Blockers

| ID | Blocker | Affects | Needed from owner | Status |
|---|---|---|---|---|
| B1 | No staging Kubernetes cluster or kubeconfig/OIDC trust configured for GitHub Actions | M6 staging CD, real-cluster incident tests | A target cluster (or approval to use a kind cluster in CI for tests only) and GitHub Environment `staging` with its secrets | OPEN |
| B2 | No production environment | M10 | Environment definition + required reviewers | OPEN (by design, later) |
| B3 | Branch protection / required checks can only be set by the repo owner. As of 2026-10-23 PR #1 is merged but `GET /repos/SoheilEs/buildpipe-ai/rulesets` returns no rulesets, so `main` is **unprotected** | M1.7 | Create ruleset `protect-main` requiring PRs and the checks `Build and test`, `Static checks`, `Workflow lint` (steps in [github-actions.md](../ci-cd/github-actions.md)) | OPEN |
| B4 | Real LLM verification needs API keys or a local model endpoint | Phase 1 live RCA runs | `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` as repo secrets, or an Ollama endpoint. Unit tests use deterministic fakes and are not blocked | OPEN |
| B5 | No Prometheus/Loki in the dev stack | Phase 1 metric/log adapters (live) | Approval to add them to `docker-compose` for local dev | OPEN |
| B6 | Perplexity connector in this environment only imports dashboards; it has no search tool | Research step | None. Research was done with web search instead | NOTED |
| B7 | No OTP delivery channel. `requestOtp` creates a challenge but nothing sends it (email/SMS/TOTP). After M2.1 the code is only visible with `OTP_DEV_MODE=true`, so OTP-gated actions (register/update cluster, restart deployment) are unusable in any deployment that must not run dev mode | M2.1 follow-up, Phase 2 approvals | Decision: SMTP provider, an authenticator-app (TOTP) flow, or another channel, plus credentials | OPEN |
