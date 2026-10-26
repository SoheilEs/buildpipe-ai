# Infralark MVP (English summary)

Source of truth: [infralark-brief-fa.md](infralark-brief-fa.md) (Persian). This file summarises scope, the fixture and acceptance criteria. Nothing here is implemented yet unless [progress.md](../progress.md) says so.

## The one service

"Review and prepare a non-root runtime fix for one Kubernetes workload, test it in a staging target after human approval, and produce a before/after report."

## Flow

1. Requester picks the service and the "Container runtime security review (non-root)" card.
2. Read-only collection: workload spec, pods, current `securityContext`, scanner finding (Kubescape), Git-managed config file, image config.
3. Compatibility analysis. Insufficient or contradictory evidence ends in `NeedsReview` with a reason. A single-field "fix" is never proposed without evidence.
4. Deterministic proposal: a minimal patch to the Git-managed file, planned tests, limits, and the rollback method.
5. A different authorised person approves. The approval is bound to patch hash, base commit, target and a target-state snapshot.
6. Staging-only execution through a defined handler, then rollout, pod, readiness, a functional test and a scanner re-run.
7. Before/after report generated only from real tool and test results.

Out of scope: production, autonomous fixes, image or code changes, RBAC/NetworkPolicy/Secrets fixes, billing, multi-tenancy, marketplace.

## Authority boundaries

| Identity | May | May not |
|---|---|---|
| Collector | get/list/watch in the target namespace; read the repo | write anything |
| Executor | patch only the target workload in the staging namespace | touch other workloads, namespaces, production |
| Git writer | create a branch, commit, open a PR in the one allowed repository | merge, push to protected branches |
| AI provider | receive redacted evidence summaries | execute, approve, declare tests passed |

Each identity is a separate credential. Authorization is enforced server-side.

## Fixture scenario (to be built in Phase 4)

| Fixture | Behaviour | Expected outcome |
|---|---|---|
| A: compatible | runs as root today, works as non-root after the patch | patch, approval, staging run, scan passes, functional test passes |
| B: incompatible | needs to write to a root-owned path | no success reported; failure or referral shown |
| C: insufficient data | image or file cannot be inspected | stops in `NeedsReview` |

## Acceptance criteria (brief section 12)

1. Compatible target: patch, security check and functional test pass.
2. Incompatible app: no success claimed.
3. Insufficient data: stop, no guess.
4. Unauthorised user: rejected in the backend.
5. Patch changed after approval: old approval rejected.
6. Duplicate request or message: no double execution.
7. Invalid AI output or AI down: correct status, evidence kept.
8. Worker failure or timeout: recoverable state, no false success.
9. No credentials in reports or logs.
10. Final report matches real tool and test results.

Results are reported as Passed / Failed / Not run / Blocked. A clean scan is not "fully secure". Mock results are never reported as real connections.
