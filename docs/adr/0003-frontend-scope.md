# ADR-0003: Frontend scope

Status: accepted by owner instruction, 2026-10-26.

## Decision

This repo gets no new frontend app. The existing Infralark web frontend lives in a separate repo (`Desktop/velnor`, Next.js + pnpm, en/de). It keeps its design and structure. Only its content (copy in `messages/*.json`, `config/site.ts`, docs) is edited so it describes the Infralark product instead of a personal portfolio.

The product panel pages from the brief (Services, New Request, Request Details, Approvals, Report, Settings) are not built in this repo until the owner decides where they live. Until then the backend exposes the same data through the REST API and Swagger, and the end-to-end demo runs against the API.

## Consequences

- Plan item "Phase 1.2: apps/web skeleton" and "Phase 2.10: UI" are replaced by "content edit in the existing frontend repo" and "API-only demo".
- Rules in the frontend repo's own CLAUDE.md (no personal name, no fabricated facts, illustrations labelled) stay in force and must be reconciled with the product content in a separate change there.
