/**
 * Runs the service-request repository and service against a real PostgreSQL. Not part of
 * `npm test` or `npm run test:e2e` (those need no database): run it with `npm run test:db -w
 * @buildpipe/api` against a database that already has the migrations applied. It leaves rows
 * behind on purpose (the history table is append-only), so only point it at a throwaway database.
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PrismaServiceRequestRepository } from '../src/service-requests/prisma-service-request.repository';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(databaseUrl)) {
  throw new Error(
    'test:db needs DATABASE_URL pointing at a throwaway PostgreSQL on localhost; refusing to run',
  );
}

describe('service requests on PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new ServiceRequestsService(new PrismaServiceRequestRepository(prisma));
  const KIND = 'nonroot-runtime-review';
  let requesterId: string;
  let approverId: string;
  let serviceId: string;

  const newUser = async (label: string) =>
    (
      await prisma.user.create({
        data: { email: `${label}-${randomUUID()}@example.test`, passwordHash: 'x' },
      })
    ).id;

  const newRequest = async (idempotencyKey?: string) =>
    (await service.create({ kind: KIND, serviceId, requesterId, idempotencyKey })).request;

  beforeAll(async () => {
    await prisma.$connect();
    requesterId = await newUser('requester');
    approverId = await newUser('approver');
    const cluster = await prisma.cluster.create({
      data: { name: 'db-test-' + randomUUID(), encryptedKubeconfig: 'not-a-real-kubeconfig' },
    });
    const svc = await prisma.service.create({
      data: {
        name: 'db-test-' + randomUUID(),
        clusterId: cluster.id,
        namespace: 'staging',
        workloadKind: 'Deployment',
        workloadName: 'app-' + randomUUID().slice(0, 8),
        gitRepository: 'acme/config',
        configPaths: ['deploy.yaml'],
        createdById: approverId,
      },
    });
    serviceId = svc.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates the request and its creation history row together', async () => {
    const request = await newRequest();
    expect(request).toMatchObject({ status: 'Requested', version: 0, requesterId });
    const history = await service.history(request.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'Requested',
      actorId: requesterId,
    });
  });

  it('returns the same request for a repeated idempotency key', async () => {
    const key = `key-${randomUUID()}`;
    const first = await service.create({ kind: KIND, serviceId, requesterId, idempotencyKey: key });
    const second = await service.create({
      kind: KIND,
      serviceId,
      requesterId,
      idempotencyKey: key,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.request.id).toBe(first.request.id);
  });

  it('creates exactly one request when the same key is sent in parallel', async () => {
    const key = `race-${randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.create({ kind: KIND, serviceId, requesterId, idempotencyKey: key }),
      ),
    );
    expect(new Set(results.map((r) => r.request.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const rows = await prisma.serviceRequest.count({ where: { requesterId, idempotencyKey: key } });
    expect(rows).toBe(1);
    expect(await service.history(results[0].request.id)).toHaveLength(1);
  });

  it('allows many requests without a key (NULL keys never collide)', async () => {
    const a = await newRequest();
    const b = await newRequest();
    expect(a.id).not.toBe(b.id);
  });

  it('rejects a request for a service that is not registered (400 SERVICE_NOT_FOUND)', async () => {
    await expect(
      service.create({ kind: KIND, serviceId: randomUUID(), requesterId }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SERVICE_NOT_FOUND' }) });
  });

  it('rejects a request for a requester that does not exist', async () => {
    await expect(
      service.create({ kind: KIND, serviceId, requesterId: randomUUID() }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('records the whole happy path in order', async () => {
    const request = await newRequest();
    const id = request.id;
    await service.transition(id, 'Collecting', { actorId: 'system' });
    await service.transition(id, 'ProposalReady', { actorId: 'system' });
    await service.transition(id, 'AwaitingApproval', { actorId: requesterId });
    await service.transition(id, 'Approved', { actorId: approverId });
    await service.transition(id, 'Testing', { actorId: 'system' });
    const done = await service.transition(id, 'Verified', { actorId: 'system' });

    expect(done).toMatchObject({ status: 'Verified', version: 6 });
    const history = await service.history(id);
    expect(history.map((h) => h.toStatus)).toEqual([
      'Requested',
      'Collecting',
      'ProposalReady',
      'AwaitingApproval',
      'Approved',
      'Testing',
      'Verified',
    ]);
    expect(history.map((h) => h.fromStatus)).toEqual([
      null,
      'Requested',
      'Collecting',
      'ProposalReady',
      'AwaitingApproval',
      'Approved',
      'Testing',
    ]);
  });

  it('leaves the row and the history untouched after a rejected move', async () => {
    const request = await newRequest();
    await expect(
      service.transition(request.id, 'Approved', { actorId: approverId }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_TRANSITION' }) });
    expect(await service.get(request.id)).toMatchObject({ status: 'Requested', version: 0 });
    expect(await service.history(request.id)).toHaveLength(1);
  });

  it('applies only one of two conflicting transitions that race', async () => {
    const request = await newRequest();
    const results = await Promise.allSettled([
      service.transition(request.id, 'Collecting', { actorId: 'system' }),
      service.transition(request.id, 'Cancelled', { actorId: requesterId, reason: 'race' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason.getStatus()).toBe(409);

    const after = await service.get(request.id);
    expect(after.version).toBe(1);
    expect(await service.history(request.id)).toHaveLength(2);
  });

  it('applies a transition once when the same message is delivered five times in parallel', async () => {
    const request = await newRequest();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.transition(request.id, 'Collecting', { actorId: 'system' }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const history = await service.history(request.id);
    expect(history.filter((h) => h.toStatus === 'Collecting')).toHaveLength(1);
    expect((await service.get(request.id)).version).toBe(1);
  });

  describe('append-only history (database trigger)', () => {
    it('refuses UPDATE', async () => {
      const request = await newRequest();
      await expect(
        prisma.$executeRaw`UPDATE "ServiceRequestTransition" SET "reason" = 'tampered' WHERE "requestId" = ${request.id}`,
      ).rejects.toThrow(/append-only/);
      expect((await service.history(request.id))[0].reason).toBeNull();
    });

    it('refuses DELETE', async () => {
      const request = await newRequest();
      await expect(
        prisma.$executeRaw`DELETE FROM "ServiceRequestTransition" WHERE "requestId" = ${request.id}`,
      ).rejects.toThrow(/append-only/);
      expect(await service.history(request.id)).toHaveLength(1);
    });

    it('refuses TRUNCATE', async () => {
      await expect(prisma.$executeRawUnsafe('TRUNCATE "ServiceRequestTransition"')).rejects.toThrow(
        /append-only/,
      );
    });
  });
});
