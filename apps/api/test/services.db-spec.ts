/**
 * Runs the services registry against a real PostgreSQL (same rules and warnings as
 * service-requests.db-spec.ts: throwaway database, localhost only, migrations applied).
 */
import { randomUUID } from 'crypto';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PrismaServiceRequestRepository } from '../src/service-requests/prisma-service-request.repository';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { CreateServiceDto } from '../src/services/dto/services.dto';
import { ServicesService } from '../src/services/services.service';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(databaseUrl)) {
  throw new Error(
    'test:db needs DATABASE_URL pointing at a throwaway PostgreSQL on localhost; refusing to run',
  );
}

describe('services registry on PostgreSQL', () => {
  const prisma = new PrismaService();
  const services = new ServicesService(prisma, new AuditService(prisma));
  const requests = new ServiceRequestsService(new PrismaServiceRequestRepository(prisma));
  let adminId: string;
  let clusterId: string;

  const unique = () => randomUUID().slice(0, 8);
  const dto = (over: Partial<CreateServiceDto> = {}): CreateServiceDto => ({
    name: `svc-${unique()}`,
    clusterId,
    namespace: 'staging',
    workloadKind: 'Deployment',
    workloadName: `app-${unique()}`,
    gitRepository: 'acme/infra-config',
    configPaths: ['apps/app/deployment.yaml'],
    ...over,
  });

  beforeAll(async () => {
    await prisma.$connect();
    adminId = (
      await prisma.user.create({
        data: { email: `admin-${randomUUID()}@example.test`, passwordHash: 'x', role: 'admin' },
      })
    ).id;
    clusterId = (
      await prisma.cluster.create({
        data: { name: `cluster-${randomUUID()}`, encryptedKubeconfig: 'not-a-real-kubeconfig' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('stores a service with defaults and a path list, and reads it back', async () => {
    const created = await services.create(adminId, dto({ configPaths: ['a.yaml', 'k8s/b.yml'] }));
    expect(created).toMatchObject({
      gitProvider: 'github',
      gitBaseBranch: 'main',
      configPaths: ['a.yaml', 'k8s/b.yml'],
      createdById: adminId,
    });
    expect(await services.findOne(created.id)).toMatchObject({ id: created.id });
    expect((await services.findAll()).map((s) => s.id)).toContain(created.id);
  });

  it('accepts the approver role value in the database enum', async () => {
    const user = await prisma.user.create({
      data: { email: `approver-${randomUUID()}@example.test`, passwordHash: 'x', role: 'approver' },
    });
    expect(user.role).toBe('approver');
  });

  it('refuses an invalid definition with the problems per field', async () => {
    await expect(
      services.create(adminId, dto({ namespace: 'kube-system', configPaths: ['../x.yaml'] })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_SERVICE',
        problems: expect.objectContaining({
          namespace: expect.any(String),
          configPaths: expect.any(String),
        }),
      }),
    });
  });

  it('refuses a cluster that is not registered', async () => {
    await expect(services.create(adminId, dto({ clusterId: randomUUID() }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLUSTER_NOT_FOUND' }),
    });
  });

  it('refuses a soft-deleted cluster', async () => {
    const gone = await prisma.cluster.create({
      data: {
        name: `gone-${randomUUID()}`,
        encryptedKubeconfig: 'x',
        deletedAt: new Date(),
      },
    });
    await expect(services.create(adminId, dto({ clusterId: gone.id }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLUSTER_NOT_FOUND' }),
    });
  });

  it('answers 409 for a duplicate name and for a duplicate workload', async () => {
    const first = await services.create(adminId, dto());
    await expect(services.create(adminId, dto({ name: first.name }))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SERVICE_EXISTS' }),
    });
    await expect(
      services.create(
        adminId,
        dto({ namespace: first.namespace, workloadName: first.workloadName }),
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SERVICE_EXISTS' }) });
    // Same workload name in another namespace is a different service.
    await expect(
      services.create(adminId, dto({ namespace: 'other', workloadName: first.workloadName })),
    ).resolves.toMatchObject({ namespace: 'other' });
  });

  it('merges a partial update and validates the result', async () => {
    const created = await services.create(adminId, dto());
    const updated = await services.update(adminId, created.id, { gitBaseBranch: 'release/1.0' });
    expect(updated).toMatchObject({
      gitBaseBranch: 'release/1.0',
      workloadName: created.workloadName,
      configPaths: created.configPaths,
    });
    await expect(
      services.update(adminId, created.id, { configPaths: ['/etc/passwd'] }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_SERVICE' }) });
    expect((await services.findOne(created.id)).configPaths).toEqual(created.configPaths);
  });

  it('answers 404 for an unknown service', async () => {
    await expect(services.findOne(randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it('deletes a service without requests and refuses one that has requests', async () => {
    const free = await services.create(adminId, dto());
    await services.remove(adminId, free.id);
    await expect(services.findOne(free.id)).rejects.toMatchObject({ status: 404 });

    const used = await services.create(adminId, dto());
    await requests.create({
      kind: 'nonroot-runtime-review',
      serviceId: used.id,
      requesterId: adminId,
    });
    await expect(services.remove(adminId, used.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SERVICE_IN_USE' }),
    });
    expect(await services.findOne(used.id)).toBeDefined();
  });

  it('writes audit rows for create, update and delete', async () => {
    const created = await services.create(adminId, dto());
    await services.update(adminId, created.id, { description: 'changed' });
    await services.remove(adminId, created.id);
    const actions = (
      await prisma.auditLog.findMany({
        where: { resourceId: created.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((row) => row.action);
    // Sorted: the three rows can share a millisecond, so their time order is not reliable.
    expect([...actions].sort()).toEqual(['SERVICE_CREATED', 'SERVICE_DELETED', 'SERVICE_UPDATED']);
  });
});
