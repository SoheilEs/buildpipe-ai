# ADR-0007: Services registry, approver role and request API

Status: implemented in Phase 2.2 (2026-10-26). Role model and workload kinds were chosen by the owner.

## Decisions

**Approver role.** `UserRole` gains `approver`, placed in the hierarchy `viewer < operator < approver < admin` (`ROLE_HIERARCHY` in `roles.guard.ts`). An approver can do everything an operator can, plus the approvals of Phase 3. Separation of duties is not a role property: the state machine (ADR-0001) still stops anyone, approver or admin, from approving their own request. Roles are assigned by an admin through the existing `PATCH /users/:id`.

**Services registry.** A `Service` is one workload: cluster (existing `Cluster`), namespace, workload kind, workload name, Git repository, base branch and the repository paths of its manifests. It stores locations only, never credentials; the collector, executor and Git-writer identities are configured separately (ADR-0002). Workload kinds in the MVP: `Deployment` and `StatefulSet` (owner decision). Git provider: `github` only, kept as a column so the adapter stays swappable. One service per `(cluster, namespace, kind, name)`; names are unique.

**Strict, positive validation** (`services/domain/service-validation.ts`, pure and unit-tested). Every field later reaches a Kubernetes call or a Git operation, so anything not matching is rejected rather than cleaned: DNS-1123 names, `kube-system`, `kube-public` and `kube-node-lease` refused, `owner/name` repositories without `.git` or `..`, git ref rules (no leading `-`, no `..`, no `//`), manifest paths relative with a fixed character set, no `.`/`..`/`.git` segments and a `.yaml`/`.yml`/`.json` extension, at most 20 paths. An update is merged with the stored row and validated as a whole.

**Who may do what.**

| Action | Minimum role |
|---|---|
| list, read services; list, read, history of requests | viewer |
| create a request, cancel one's own request | operator |
| cancel anyone's request | admin |
| register, update, delete a service | admin |

Enforced by `RolesGuard` and, for cancel, by an ownership check in the controller. The requester is always the authenticated caller; a `requesterId` or `status` in a body is rejected by the validation pipe (`forbidNonWhitelisted`). Within the single organisation of the pilot every viewer can read every request; per-user visibility would need a decision when multi-tenancy is considered.

**Request API.** `POST /service-requests`, `GET /service-requests` (filters `status`, `requesterId`, `serviceId`; `limit` 1 to 100, default 50; `offset`), `GET /service-requests/:id`, `GET /service-requests/:id/history`, `POST /service-requests/:id/cancel` (reason required). The kind must be a known service card (`nonroot-runtime-review`). An `Idempotency-Key` header makes a retried create return the original request with 200 instead of 201. There is deliberately **no endpoint that sets an arbitrary status**: collection, approval, execution and verification move the request from their own modules.

**Data.** `ServiceRequest.serviceId` is required with `ON DELETE RESTRICT`; a service that has requests cannot be deleted (409 `SERVICE_IN_USE`). No soft delete, to keep the uniqueness rules simple. The migration adds a `NOT NULL` column, which fails on a database that already holds request rows; before this phase nothing but the DB tests could create them.

**Audit.** `SERVICE_CREATED`, `SERVICE_UPDATED`, `SERVICE_DELETED`, `REQUEST_CREATED` (not for an idempotent repeat) and `REQUEST_CANCELLED` go to the existing audit log. The hash chain arrives in Phase 2.9.

## Not done here

No collection, scanner, proposal or approval endpoints; no UI (ADR-0003); no per-service permissions; the Kubernetes-side existence of the workload is not checked at registration (the collector of Phase 2.4 will report it as evidence).
