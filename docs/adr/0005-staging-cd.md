# ADR-0005: Staging CD design

Status: proposed (Phase 1.5), 2026-10-26. The workflow is a draft and unverified.

## Context

Phase 1 asks for CD to a staging target only, from a specific branch and artifact, with secrets outside the repo, and no production deploy. Today there is no staging cluster (B1), no published image (M5) and no Helm chart (Phase 5). Infralark's own deployment is separate from the staging workload that Infralark later patches as a product feature.

## Decision

- `.github/workflows/deploy-staging.yml` is **manual only** (`workflow_dispatch`), runs **only from `main`**, and is **off until the repository variable `STAGING_DEPLOY_ENABLED` is `true`**. Until then every run shows the job as skipped.
- The artifact is an **image digest** (`sha256:` + 64 hex), never a tag. The input is validated and only reaches the shell through environment variables.
- The job uses the GitHub **Environment `staging`**. Required reviewers and the secret `STAGING_KUBECONFIG_B64` live there, not in the repo. Variables: `STAGING_NAMESPACE`, `STAGING_IMAGE_REPOSITORY`.
- The kubeconfig belongs to a **namespace-scoped ServiceAccount** (the deploy identity), distinct from the collector, executor and Git-writer identities of the product. It is written with `umask 077` and deleted in an `always()` step.
- The job refuses the `default` and `kube-system` namespaces and refuses to run when the Helm chart `deploy/helm/infralark` is missing.
- Deploy is `helm upgrade --install --atomic --wait --timeout 5m`. `--atomic` rolls back to the previous release when the rollout does not become ready. This is the only post-deploy check; a smoke test is not implemented.
- No third-party actions beyond the pinned `actions/checkout`; `helm` and `kubectl` come from the runner image. Their presence on `ubuntu-24.04` is **not verified**.
- No production workflow exists or is planned for the MVP.

## Not verified

The workflow passes actionlint v1.7.12. It has never executed: not the variable gate, the validation step, the kubeconfig handling or Helm. Image values `image.repository` and `image.digest` are a contract the future chart must satisfy.

## Consequences

Phase 5 supplies the chart and M5 supplies image publishing; only then can the workflow be enabled and verified against a real staging cluster. OIDC to a cloud-hosted cluster would replace the kubeconfig secret if the staging target supports it.
