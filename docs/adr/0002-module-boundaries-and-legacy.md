# ADR-0002: Modular monolith, module boundaries, legacy code

Status: proposed (Phase 0), 2026-10-26.

## Decision

- Keep one NestJS API plus the existing BullMQ worker (modular monolith). No new services, no new broker.
- New modules live under `apps/api/src/` with the brief's boundaries: `service-requests`, `services`, `evidence`, `analysis`, `proposals`, `approvals`, `execution`, `verification`, `reporting`. `identity` and `audit` extend the existing `auth`, `users` and `audit` modules rather than duplicating them.
- Domain logic (state machine, proposal builder, approval binding) is pure TypeScript with no Nest, Prisma or HTTP imports. Git, scanner, AI, Kubernetes-read and executor sit behind interfaces with an in-memory fake for tests.
- Legacy modules (`incidents`, `ai`, `mcp`, `apps/ai-engine`, `kubernetes` restart path) are **frozen, not deleted**: no new features, security fixes only. Removal is a later owner decision because deleting them is outside the MVP and would break existing API consumers.
- Roles: keep `viewer < operator < admin`. Add an `approver` capability in Phase 3. A requester cannot approve their own request; this is enforced server-side.
- `AuditLog` is extended (hash chain) rather than replaced by a second table.
- `AiAnalysis.confidence` is legacy. New analysis output carries no confidence number.

## Consequences

Phase 2 can start without touching legacy behaviour. Two audit/AI code paths coexist until the owner decides to retire the legacy ones.
