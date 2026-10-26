# Runbook: set up staging deploy (draft, unverified)

Applies to `.github/workflows/deploy-staging.yml` ([ADR-0005](../adr/0005-staging-cd.md)). Nothing here has been run: there is no staging cluster yet (blocker B1). Steps that need an owner action are marked **Owner**.

## Prerequisites (all missing today)

1. A staging Kubernetes cluster and a dedicated namespace for Infralark (not `default`, not `kube-system`).
2. A published image and its digest (M5).
3. A Helm chart at `deploy/helm/infralark` that accepts `image.repository` and `image.digest` (Phase 5).

## GitHub configuration (Owner)

1. Settings → Environments → New environment `staging`.
2. Add **required reviewers** and restrict deployment branches to `main`.
3. Environment secret `STAGING_KUBECONFIG_B64`: base64 of a kubeconfig that uses the deploy ServiceAccount token below.
4. Repository or environment variables: `STAGING_NAMESPACE`, `STAGING_IMAGE_REPOSITORY`.
5. When everything above exists, set the repository variable `STAGING_DEPLOY_ENABLED` to `true`. Leave it unset to keep the workflow inert.

## Deploy identity (least privilege)

Create a ServiceAccount in the staging namespace and bind it to a namespaced Role only. The Role below is an **untested starting point**; Helm needs access to its release Secrets and to whatever the chart creates. Tighten it against the real chart.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: infralark-deployer
  namespace: <STAGING_NAMESPACE>
rules:
  - apiGroups: ['', 'apps']
    resources: [deployments, services, configmaps, secrets, serviceaccounts, pods]
    verbs: [get, list, watch, create, update, patch, delete]
```

No ClusterRole, no access to other namespaces, no node or RBAC resources. Issue a short-lived token where the cluster supports it and rotate it; revoke by deleting the RoleBinding.

## Run

Actions → Deploy staging → Run workflow on `main`, input the image digest, approve in the environment gate.

## Verification checklist (to fill when it first runs)

| Check | Result |
|---|---|
| Run with the variable unset shows the job skipped | Not run |
| Bad digest (tag, short hex) is rejected | Not run |
| Missing secret or variable stops with `BLOCKED` | Not run |
| Namespace `default` is refused | Not run |
| Helm upgrade succeeds on a real cluster | Blocked (B1) |
| Failed rollout rolls back (`--atomic`) | Blocked (B1) |
| Kubeconfig file removed after the job | Not run |

## Known gaps

No post-deploy smoke test; no OIDC; `helm` and `kubectl` on the runner image are assumed, not confirmed; the Role above is not validated against any chart.
