/**
 * Runs the evidence and findings store against a real PostgreSQL (same rules as the other
 * *.db-spec.ts files: throwaway database, localhost only, migrations applied).
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EvidenceService } from '../src/evidence/evidence.service';
import { PrismaServiceRequestRepository } from '../src/service-requests/prisma-service-request.repository';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(databaseUrl)) {
  throw new Error(
    'test:db needs DATABASE_URL pointing at a throwaway PostgreSQL on localhost; refusing to run',
  );
}

describe('evidence and findings on PostgreSQL', () => {
  const prisma = new PrismaService();
  const requests = new ServiceRequestsService(new PrismaServiceRequestRepository(prisma));
  const evidence = new EvidenceService(prisma, requests);
  let userId: string;
  let serviceId: string;

  const item = (over: Record<string, unknown> = {}) => ({
    kind: 'workload-spec',
    source: 'kubernetes',
    sourceId: 'apps/v1/Deployment/staging/payments-api',
    sourceVersion: '1001',
    collectedAt: new Date(Date.now() - 1000),
    content: { replicas: 1, securityContext: { runAsUser: 0 } },
    ...over,
  });

  /** A request that is already in Collecting. */
  const collecting = async () => {
    const { request } = await requests.create({
      kind: 'nonroot-runtime-review',
      serviceId,
      requesterId: userId,
    });
    await requests.transition(request.id, 'Collecting', { actorId: 'system' });
    return request.id;
  };

  beforeAll(async () => {
    await prisma.$connect();
    userId = (
      await prisma.user.create({
        data: { email: `ev-${randomUUID()}@example.test`, passwordHash: 'x' },
      })
    ).id;
    const cluster = await prisma.cluster.create({
      data: { name: `ev-${randomUUID()}`, encryptedKubeconfig: 'x' },
    });
    serviceId = (
      await prisma.service.create({
        data: {
          name: `ev-${randomUUID()}`,
          clusterId: cluster.id,
          namespace: 'staging',
          workloadKind: 'Deployment',
          workloadName: `app-${randomUUID().slice(0, 8)}`,
          gitRepository: 'acme/config',
          configPaths: ['deploy.yaml'],
          createdById: userId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('evidence', () => {
    it('stores source, source id, version and collection time with the content', async () => {
      const requestId = await collecting();
      const at = new Date('2026-10-26T10:00:00Z');
      const { evidence: stored, created } = await evidence.addEvidence(
        requestId,
        item({ collectedAt: at }),
      );
      expect(created).toBe(true);
      expect(stored).toMatchObject({
        requestId,
        kind: 'workload-spec',
        source: 'kubernetes',
        sourceId: 'apps/v1/Deployment/staging/payments-api',
        sourceVersion: '1001',
        redactions: 0,
      });
      expect(stored.collectedAt.toISOString()).toBe(at.toISOString());
      expect(stored.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.content).toEqual({ replicas: 1, securityContext: { runAsUser: 0 } });
    });

    it('redacts secrets before anything is written and counts them', async () => {
      const requestId = await collecting();
      const { evidence: stored } = await evidence.addEvidence(
        requestId,
        item({
          content: {
            env: [
              { name: 'DB_PASSWORD', value: 'hunter2-very-secret' },
              { name: 'MODE', value: 'prod' },
            ],
            args: ['--token=abc123secret'],
          },
        }),
      );
      expect(stored.redactions).toBeGreaterThanOrEqual(2);
      const raw = await prisma.$queryRaw<Array<{ content: unknown }>>`
        SELECT "content" FROM "Evidence" WHERE "id" = ${stored.id}`;
      const text = JSON.stringify(raw[0].content);
      expect(text).not.toContain('hunter2-very-secret');
      expect(text).not.toContain('abc123secret');
      expect(text).toContain('prod');
    });

    it('hashes the redacted content, so equal observations share a hash', async () => {
      const a = await collecting();
      const b = await collecting();
      const one = await evidence.addEvidence(a, item({ content: { x: 1, y: 2 } }));
      const two = await evidence.addEvidence(b, item({ content: { y: 2, x: 1 } }));
      expect(one.evidence.contentHash).toBe(two.evidence.contentHash);
    });

    it('stores the same observation once and a changed one as a new row', async () => {
      const requestId = await collecting();
      const first = await evidence.addEvidence(requestId, item());
      const again = await evidence.addEvidence(requestId, item());
      expect(again.created).toBe(false);
      expect(again.evidence.id).toBe(first.evidence.id);

      const changed = await evidence.addEvidence(
        requestId,
        item({ sourceVersion: '1002', content: { replicas: 2 } }),
      );
      expect(changed.created).toBe(true);
      expect(await evidence.listEvidence(requestId)).toHaveLength(2);
    });

    it('stores one row when the same observation arrives five times in parallel', async () => {
      const requestId = await collecting();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => evidence.addEvidence(requestId, item())),
      );
      expect(new Set(results.map((r) => r.evidence.id)).size).toBe(1);
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(await evidence.listEvidence(requestId)).toHaveLength(1);
    });

    it('rejects invalid evidence with the problems per field and stores nothing', async () => {
      const requestId = await collecting();
      await expect(
        evidence.addEvidence(requestId, item({ sourceVersion: '', kind: 'nope' })),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'INVALID_EVIDENCE',
          problems: expect.objectContaining({
            sourceVersion: expect.any(String),
            kind: expect.any(String),
          }),
        }),
      });
      expect(await evidence.listEvidence(requestId)).toHaveLength(0);
    });

    it('answers 404 for an unknown request', async () => {
      await expect(evidence.addEvidence(randomUUID(), item())).rejects.toMatchObject({
        status: 404,
      });
    });

    it.each(['Requested', 'ProposalReady', 'Cancelled'] as const)(
      'refuses to add evidence while the request is %s (409 NOT_COLLECTING)',
      async (status) => {
        const { request } = await requests.create({
          kind: 'nonroot-runtime-review',
          serviceId,
          requesterId: userId,
        });
        const id = request.id;
        if (status === 'ProposalReady') {
          await requests.transition(id, 'Collecting', { actorId: 'system' });
          await requests.transition(id, 'ProposalReady', { actorId: 'system' });
        } else if (status === 'Cancelled') {
          await requests.transition(id, 'Cancelled', { actorId: userId, reason: 'test' });
        }
        await expect(evidence.addEvidence(id, item())).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'NOT_COLLECTING' }),
        });
        expect(await evidence.listEvidence(id)).toHaveLength(0);
      },
    );

    it('keeps the evidence readable after the request leaves Collecting', async () => {
      const requestId = await collecting();
      await evidence.addEvidence(requestId, item());
      await requests.transition(requestId, 'ProposalReady', { actorId: 'system' });
      expect(await evidence.listEvidence(requestId)).toHaveLength(1);
    });

    it('cannot slip evidence in while a transition out of Collecting is pending', async () => {
      // Deterministic: the transition has moved the row but not committed. The insert has to
      // wait for it (shared row lock) and then see ProposalReady, instead of reading the stale
      // Collecting status and writing.
      const requestId = await collecting();
      let insert: Promise<unknown> | undefined;
      await prisma.$transaction(async (tx) => {
        await tx.serviceRequest.update({
          where: { id: requestId },
          data: { status: 'ProposalReady', version: { increment: 1 } },
        });
        insert = evidence.addEvidence(requestId, item({ sourceVersion: 'pending' }));
        // Give the insert time to run its status check while the transition is uncommitted.
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      await expect(insert).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_COLLECTING' }),
      });
      expect(await evidence.listEvidence(requestId)).toHaveLength(0);
    });

    it('waits for a concurrent transition instead of writing into the wrong state', async () => {
      // The transition and the insert race. Whichever wins, the end state must be consistent:
      // if the request is no longer Collecting, no evidence may have been written after it.
      for (let i = 0; i < 8; i++) {
        const requestId = await collecting();
        const outcome = await Promise.allSettled([
          evidence.addEvidence(requestId, item({ sourceVersion: `race-${i}` })),
          requests.transition(requestId, 'ProposalReady', { actorId: 'system' }),
        ]);
        const added = outcome[0].status === 'fulfilled';
        const stored = await evidence.listEvidence(requestId);
        expect(stored).toHaveLength(added ? 1 : 0);
        expect(outcome[1].status).toBe('fulfilled');
        if (!added) {
          expect((outcome[0] as PromiseRejectedResult).reason.response.code).toBe('NOT_COLLECTING');
        }
      }
    });
  });

  describe('findings', () => {
    const evidenceFor = async (requestId: string, n: number) => {
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const { evidence: stored } = await evidence.addEvidence(
          requestId,
          item({ sourceVersion: `v${i}`, content: { i } }),
        );
        ids.push(stored.id);
      }
      return ids;
    };

    it('stores a finding with the ids of the evidence it cites', async () => {
      const requestId = await collecting();
      const [e1, e2] = await evidenceFor(requestId, 2);
      const finding = await evidence.addFinding(requestId, {
        code: 'RUNS_AS_ROOT',
        outcome: 'Present',
        summary: 'The container runs as user 0',
        evidenceIds: [e1, e2],
      });
      expect(finding).toMatchObject({ requestId, outcome: 'Present', code: 'RUNS_AS_ROOT' });
      const listed = await evidence.listFindings(requestId);
      expect(listed).toHaveLength(1);
      expect(listed[0].evidenceIds).toEqual([e1, e2].sort());
    });

    it('allows an Unknown finding without evidence and forbids a Present one without', async () => {
      const requestId = await collecting();
      await expect(
        evidence.addFinding(requestId, {
          code: 'IMAGE_USER_UNKNOWN',
          outcome: 'Unknown',
          summary: 'The image config could not be read',
          evidenceIds: [],
        }),
      ).resolves.toMatchObject({ outcome: 'Unknown' });
      await expect(
        evidence.addFinding(requestId, {
          code: 'RUNS_AS_ROOT',
          outcome: 'Present',
          summary: 'guess',
          evidenceIds: [],
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_FINDING' }) });
    });

    it("refuses to cite another request's evidence", async () => {
      const mine = await collecting();
      const theirs = await collecting();
      const [foreign] = await evidenceFor(theirs, 1);
      await expect(
        evidence.addFinding(mine, {
          code: 'RUNS_AS_ROOT',
          outcome: 'Present',
          summary: 'borrowed',
          evidenceIds: [foreign],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'INVALID_FINDING',
          problems: { evidenceIds: expect.stringContaining('this request') },
        }),
      });
      expect(await evidence.listFindings(mine)).toHaveLength(0);
    });

    it('refuses to cite evidence that does not exist', async () => {
      const requestId = await collecting();
      await expect(
        evidence.addFinding(requestId, {
          code: 'RUNS_AS_ROOT',
          outcome: 'Present',
          summary: 'x',
          evidenceIds: [randomUUID()],
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_FINDING' }) });
    });

    it('refuses a finding once the request has left Collecting', async () => {
      const requestId = await collecting();
      const [e1] = await evidenceFor(requestId, 1);
      await requests.transition(requestId, 'ProposalReady', { actorId: 'system' });
      await expect(
        evidence.addFinding(requestId, {
          code: 'RUNS_AS_ROOT',
          outcome: 'Present',
          summary: 'late',
          evidenceIds: [e1],
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'NOT_COLLECTING' }) });
    });
  });

  describe('append-only (database triggers)', () => {
    it.each([
      ['Evidence', `UPDATE "Evidence" SET "sourceId" = 'tampered'`],
      ['Evidence', `DELETE FROM "Evidence"`],
      ['Evidence', `TRUNCATE "Evidence" CASCADE`],
      ['Finding', `UPDATE "Finding" SET "summary" = 'tampered'`],
      ['Finding', `DELETE FROM "Finding"`],
      ['FindingEvidence', `DELETE FROM "FindingEvidence"`],
    ])('%s refuses: %s', async (_table, statement) => {
      // Make sure each table has at least one row, so the statement has something to touch.
      const requestId = await collecting();
      const { evidence: stored } = await evidence.addEvidence(
        requestId,
        item({ content: { t: 1 } }),
      );
      await evidence.addFinding(requestId, {
        code: 'ROW_FOR_TRIGGER_TEST',
        outcome: 'Present',
        summary: 'x',
        evidenceIds: [stored.id],
      });
      await expect(prisma.$executeRawUnsafe(statement)).rejects.toThrow(/append-only/);
    });
  });
});
