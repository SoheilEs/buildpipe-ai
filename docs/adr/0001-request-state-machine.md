# ADR-0001: Service request state machine

Status: request machine implemented in Phase 2.1 (2026-10-26); the execution machine is Phase 3. Merged in Phase 0 without objection; owner may still amend.

## Context

The product brief (section 9) proposes: Requested → Collecting → NeedsReview | ProposalReady → AwaitingApproval → Approved → Testing → Verified | Failed, plus Rejected and Cancelled. It also requires that "patch ready", "PR created", "executed in staging" and "tests passed" are distinct states with their own timestamps.

The repo has one state machine today, `IncidentStateMachine` in `apps/api/src/incidents/incident-state-machine.service.ts`: a transition table, a `BadRequestException` on invalid moves, no persisted history, and callers that bypass it (audit §7). Its table-driven shape is reusable; its coupling to Nest and Prisma enums and its lack of history are not.

## Decision

Two machines, not one, so request-level and execution-level facts cannot be mixed up.

**ServiceRequest** (coarse, what the requester sees):

| From | To |
|---|---|
| Requested | Collecting, Cancelled |
| Collecting | NeedsReview, ProposalReady, Failed, Cancelled |
| NeedsReview | Collecting (re-run after new input), Rejected, Cancelled |
| ProposalReady | AwaitingApproval, Cancelled |
| AwaitingApproval | Approved, Rejected, Cancelled, ProposalReady (patch or target changed, approval invalidated) |
| Approved | Testing, ProposalReady (approval invalidated), Cancelled |
| Testing | Verified, Failed |
| Verified, Failed, Rejected, Cancelled | (terminal) |

**Execution** (fine, one row per attempt, created only after Approved): `PatchReady → PrCreated → ExecutedInStaging → TestsPassed | TestsFailed`, plus `TimedOut`, `Aborted`. Each step has its own timestamp. `Verified` on the request is set only from `TestsPassed` plus a passing re-scan; the request never reads "success" from any earlier step.

Rules:

- The transition table is a pure function module with no Nest or Prisma imports, so it is unit-testable without infrastructure. A thin Nest service persists the move and a history row (`from`, `to`, `actorId`, `reason`, `at`) in one transaction.
- Every invalid transition throws a typed domain error. Each allowed and each disallowed pair gets a test.
- Terminal states cannot be left. A retry is a new request or a new Execution row, never a state rewind.
- `Failed` carries a machine-readable reason (collection error, test failure, timeout, worker loss) and `Blocked`/`Not run` are report-level labels, not request states.

## Implementation notes (Phase 2.1)

- Domain: `apps/api/src/service-requests/domain/request-state.ts` (pure). Besides the table it enforces: an actor on every move, a reason (max 1000 characters) for moves to NeedsReview, Failed, Rejected, Cancelled and for invalidation back to ProposalReady, and **separation of duties**: the requester cannot move their own request from AwaitingApproval to Approved or Rejected.
- Failure mapping in `ServiceRequestsService`: unknown state, missing actor or reason answer 400; invalid or final-state moves 409; self-approval 403; a lost race 409 `CONCURRENT_MODIFICATION`.
- Concurrency: each request has a `version`. A transition is a compare-and-set on `(id, version, status)` in one database transaction together with its history row. A duplicate or racing message therefore applies at most once.
- History: table `ServiceRequestTransition`, ordered by a `seq` column. Inserts only: a database trigger rejects UPDATE, DELETE and TRUNCATE. This is a guard against application bugs and casual edits, not against a database administrator, who can drop the trigger.
- Idempotent create: unique `(requesterId, idempotencyKey)`; parallel creates with the same key produce one request.
- No controller yet. Who may call which transition (roles) is enforced in the HTTP layer that arrives with the services registry (Phase 2.2). The domain does not model roles.

## Consequences

- `IncidentStateMachine` stays as-is for the legacy incident flow; it is not generalised.
- The audit log records every transition.
- The state set is larger than the brief's list (Collecting→Failed, re-entry from NeedsReview and from invalidated approval). These are deliberate and need owner confirmation.
