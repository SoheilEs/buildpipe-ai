# Session handoff

Rewritten in full each time; only the current state lives here. History: [progress.md](progress.md), [testing.md](testing.md).
Last written: 2026-10-27. Items marked *unconfirmed* could not be verified when this was written.

## 1. Where things stand

- **Phase / step:** Phase 2 (read-only end-to-end flow). 2.0 to 2.2 are on `main`. 2.3 (evidence and findings) is in open PR 14. 2.4 not started.
- **`main`:** `d6ef32d` (merge of PR 13). PRs 1 to 13 are merged.
- **Current branch:** `infralark/agent-team`, created from `origin/main` (HEAD `d6ef32d`, no commits of its own). Staged, not committed: `.claude/agents/{coder,tester,cicd,docs,context-keeper}.md`, `.claude/settings.json`, `CLAUDE.md` (two new sections), `docs/session-handoff.md`. The owner chose a separate small PR for these.
- **Open pull request:** PR 14, "Infralark Phase 2.3: redacted append-only evidence and findings", branch `infralark/phase-2-3-evidence-findings`, head `da8116d`, base `main`, mergeable. Its commit message was amended (trailer removed) and force-pushed with lease; the tree is unchanged (head commit author matches the approved git identity). Auto-fix: *unconfirmed* (GitHub shows no auto-merge request; Auto-fix is a session-side setting that cannot be checked from git or gh).
- **CI for PR 14** (run `40541080476`, event `pull_request`, head `da8116d`): Build and test pass, Migrations pass, Static checks pass, Workflow lint pass (all four green, re-read with `gh pr checks 14`).
- **CI on `main`:** PR 13's last run was green on all four checks (run `40383073959`).
- **Frontend repo** (`C:\Users\soheil\Desktop\velnor`): branch `content/infralark-product`, commit `137b9ce`, local only, working tree clean.

## 2. Done in this session

- Phase 2.3 PR 14 opened; its commit message rewritten and force-pushed.
- Agent team files written and staged on `infralark/agent-team` (not committed).
- Half-done: the team-files PR (diff must be shown to the owner first) and the PR 14 CI result. No code is half-done.
- The project agents under `.claude/agents` are not loaded in the running session (they load at session start); this refresh was done through a general-purpose agent following the same role file.

## 3. Decisions (and why)

| Decision | Reason |
|---|---|
| Phase 2.4 uses a collector port plus fakes and fixtures; no kind cluster for now | Owner's choice; no staging cluster exists yet |
| Contents of the five agents and the git identity (name Soheil Eissazadeh, email soheil.eissazadeh@gmail.com) are approved | Owner approval this session |
| Team files go in their own small PR, separate from 2.3 | Owner's choice |
| Every outward action (commit, push, PR) only on the owner's explicit order; the owner merges | Standing working agreement |
| All work goes through the agent team; the supervisor does not write code | Owner instruction of 2026-10-27 |
| No trace of the coding tool in commits, PR text, branch names, comments or docs | Owner instruction of 2026-10-27; see CLAUDE.md |
| Approver is a role: `viewer < operator < approver < admin`; PostgreSQL with Prisma migrations; frontend content-only in a separate repo (ADR-0003) | Earlier owner decisions, see ADRs |

Waiting for the owner:

1. Show the staged diff of the team files; then the order to commit, push and open that PR.
2. Settle PR 14 (CI is green; merge by the owner).
3. The go for Phase 2.4. **Do not start 2.4 before 1 and 2 are settled and the owner says go.**
4. Still open from earlier: add the `Migrations` check to ruleset `protect-main`; push the velnor branch if wanted; longer term a staging cluster, a scoped Git credential for Phase 3, an LLM key or local endpoint, an OTP delivery decision.

## 4. Test results

| What | Result | Where it ran |
|---|---|---|
| Phase 2.3: build 8/8, typecheck 12/12, unit 10 suites / 416 tests, e2e 5 suites / 107 tests, lint, format, docs links (as recorded in `docs/testing.md` on the 2.3 branch) | Passed | local, Windows, Node 24 |
| Phase 2.3: `test:db` 3 suites / 47 tests, migration drift check | Passed | embedded PostgreSQL 16.14, not the CI image |
| Phase 2.3 in CI (Build and test, Migrations, Static checks, Workflow lint) | Passed | GitHub Actions run `40541080476` |
| Anything against a real cluster, real scanner output, a real Git write, a real staging deploy | Not run | none of it exists yet |

Unresolved errors: none known. Docker is not running locally, so image builds and `docker compose up` have not been run.

## 5. Exact next step

1. Tell the owner PR 14 CI is green; the owner merges.
2. Show the owner `git diff --cached` on `infralark/agent-team`; commit, push and open the PR only on the explicit order (no tool attribution in any text).
3. After both are settled and the owner says go: Phase 2.4 per the owner's decision. Plan: pure collector port and fakes in `apps/api/src/evidence`, fixtures, evidence written through `EvidenceService.addEvidence` while the request is `Collecting`, Kubernetes env values left out by redaction. A real adapter over `packages/kubernetes-sdk` (get/list/watch only, own identity) is later. Order: coder, tester, cicd, docs, supervisor review.

## 6. Open risks and unverified claims

- Local tests used embedded PostgreSQL, not the CI image; the CI Migrations and database jobs on PR 14 passed.
- Auto-fix on PR 14: *unconfirmed*.
- The staging deploy workflow has never run (no cluster, image or chart).
- Earlier commits on `main` carry a Co-Authored-By trailer and earlier PR texts a generator line; they cannot be removed without rewriting `main`. New work follows the no-attribution rule.
- Redaction lowers but does not remove the risk of secrets in free text.
