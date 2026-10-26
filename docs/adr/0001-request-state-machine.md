# ADR-0001: Service request state machine

Status: proposed (Phase 0), 2026-10-26.

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

## Consequences

- `IncidentStateMachine` stays as-is for the legacy incident flow; it is not generalised.
- The audit log records every transition.
- The state set is larger than the brief's list (Collecting→Failed, re-entry from NeedsReview and from invalidated approval). These are deliberate and need owner confirmation.
