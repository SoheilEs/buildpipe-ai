# ADR-0008: Evidence and findings

Status: implemented in Phase 2.3 (2026-10-26).

## Context

Brief section 6 asks for evidence stored "with time, source, source identifier and related version", and the product rules say a clean scan is not "secure", an unknown stays unknown, and secrets never reach logs, reports or a model. Phase 2.4 to 2.6 (collectors) and 2.7 (proposal builder) need a store to write to and to read from.

## Decisions

**Evidence** (`Evidence` table, one observation per row): `kind`, `source`, `sourceId`, `sourceVersion`, `collectedAt`, redacted JSON `content` (at most 256 KiB), `contentHash`, `redactions`.

- `sourceVersion` is mandatory: a `resourceVersion`, image digest, commit SHA or, if the source has no object version, the tool version. "No version" is not storable.
- `collectedAt` is when the collector saw it, not when it was stored; it may not be more than five minutes in the future.
- A kind may only come from its declared sources: `workload-spec` and `pod-status` from `kubernetes`, `scanner-control` from `kubescape`, `image-config` from `registry`, `git-file` from `git`. A new kind or source is a code change with a test.
- Identical observations are one row: unique on `(requestId, source, sourceId, sourceVersion, contentHash)`; recording it again returns the existing row. A changed observation is a new row, so history is kept.

**Redaction before storage** (`evidence/domain/redaction.ts`, pure). Two layers on the parsed JSON: values under keys that name a secret (password, token, secret, api key, credential, authorization, cookie, kubeconfig, private key, client or CA certificate data) and Kubernetes env entries whose `name` looks secret; then patterns in strings (Bearer tokens, JWTs, private-key blocks, AWS access key ids, GitHub and Slack tokens, `user:password@` in URLs, `password=...` pairs). The hash is taken over the redacted content and the number of replaced values is stored. **This lowers the risk, it does not remove it**: an unlabelled secret in free text can survive, so collectors must also leave out what they do not need. Deeply nested or huge input is refused.

**Findings** (`Finding`, `FindingEvidence`): a `code` (UPPER_SNAKE_CASE), an outcome and a summary, linked to the evidence it cites. Outcomes: `Present`, `Absent`, `Unknown`, `Conflicting`. A `Present` or `Absent` finding must cite at least one evidence item, a `Conflicting` one at least two, and only `Unknown` may cite none, which makes "we could not tell" a stored answer rather than a missing row. Every cited item must belong to the same request. There is no severity or confidence score.

**Writes only while the request is Collecting.** Both writes run in one transaction that takes a shared row lock on the request (`SELECT ... FOR SHARE`) and checks the status. A concurrent transition has to wait for that transaction, so nothing can be written after the request has left `Collecting` (409 `NOT_COLLECTING`); a deterministic database test holds a transition open to prove it.

**Append-only.** A database trigger (`append_only_guard`) rejects UPDATE, DELETE and TRUNCATE on `Evidence`, `Finding` and `FindingEvidence`. Like the request history, this guards against application bugs and casual edits, not against a database administrator.

**HTTP.** Read-only: `GET /service-requests/:id/evidence` and `/findings`, for every role from viewer up. There is no write route; collectors call `EvidenceService` in-process. Content in responses is the redacted content.

## Not done here

No collectors, scanner parser or proposal builder (Phase 2.4 to 2.7). No retention or deletion policy for evidence (the tables are append-only and requests cannot be deleted). Redaction patterns are a starting set and are not a guarantee.
