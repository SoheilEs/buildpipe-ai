import { INestApplication, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EvidenceService } from '../src/evidence/evidence.service';
import { EventsService } from '../src/events/events.service';
import { QueueService } from '../src/queue/queue.service';

jest.mock('@kubernetes/client-node', () => ({}));

/** Read-only evidence API: who may read, and that nothing can write over HTTP. */
describe('evidence API (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const roles = ['viewer', 'operator', 'approver', 'admin'] as const;
  type RoleName = (typeof roles)[number];
  const users = Object.fromEntries(
    roles.map((role) => [
      role,
      { id: `u-${role}`, email: `${role}@test.local`, role, deletedAt: null },
    ]),
  ) as Record<RoleName, { id: string; email: string; role: RoleName; deletedAt: null }>;

  const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
  const evidenceStub = {
    listEvidence: jest.fn(),
    listFindings: jest.fn(),
    addEvidence: jest.fn(),
    addFinding: jest.fn(),
  };
  const prismaStub = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const bearer = (role: RoleName) =>
    `Bearer ${jwt.sign({ sub: users[role].id, email: users[role].email, role })}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(QueueService)
      .useValue({})
      .overrideProvider(EventsService)
      .useValue({
        publish: jest.fn(),
        subscribe: jest.fn(),
        isConnected: () => false,
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(EvidenceService)
      .useValue(evidenceStub)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaStub.user.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string } }) =>
        Object.values(users).find((u) => u.id === where.id) ?? null,
    );
    evidenceStub.listEvidence.mockResolvedValue([{ id: 'e1', kind: 'workload-spec' }]);
    evidenceStub.listFindings.mockResolvedValue([{ id: 'f1', evidenceIds: ['e1'] }]);
  });

  it.each(['evidence', 'findings'])(
    'anonymous GET /service-requests/:id/%s -> 401',
    async (leaf) => {
      await request(app.getHttpServer()).get(`/service-requests/${REQUEST_ID}/${leaf}`).expect(401);
      expect(evidenceStub.listEvidence).not.toHaveBeenCalled();
      expect(evidenceStub.listFindings).not.toHaveBeenCalled();
    },
  );

  it.each(roles)('%s can read evidence and findings', async (role) => {
    const evidence = await request(app.getHttpServer())
      .get(`/service-requests/${REQUEST_ID}/evidence`)
      .set('Authorization', bearer(role))
      .expect(200);
    expect(evidence.body).toEqual([{ id: 'e1', kind: 'workload-spec' }]);
    const findings = await request(app.getHttpServer())
      .get(`/service-requests/${REQUEST_ID}/findings`)
      .set('Authorization', bearer(role))
      .expect(200);
    expect(findings.body).toEqual([{ id: 'f1', evidenceIds: ['e1'] }]);
    expect(evidenceStub.listEvidence).toHaveBeenCalledWith(REQUEST_ID);
  });

  it('rejects a malformed request id before reaching the service', async () => {
    await request(app.getHttpServer())
      .get('/service-requests/not-a-uuid/evidence')
      .set('Authorization', bearer('viewer'))
      .expect(400);
    expect(evidenceStub.listEvidence).not.toHaveBeenCalled();
  });

  it('relays 404 for an unknown request', async () => {
    evidenceStub.listEvidence.mockRejectedValueOnce(new NotFoundException('nf'));
    await request(app.getHttpServer())
      .get(`/service-requests/${REQUEST_ID}/evidence`)
      .set('Authorization', bearer('viewer'))
      .expect(404);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'there is no way to %s evidence or findings over HTTP, even as admin',
    async (method) => {
      for (const leaf of ['evidence', 'findings']) {
        const res = await request(app.getHttpServer())
          [method](`/service-requests/${REQUEST_ID}/${leaf}`)
          .set('Authorization', bearer('admin'))
          .send({ kind: 'workload-spec' });
        expect(res.status).toBe(404);
      }
      expect(evidenceStub.addEvidence).not.toHaveBeenCalled();
      expect(evidenceStub.addFinding).not.toHaveBeenCalled();
    },
  );

  it('documents the read routes in the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/service-requests/{requestId}/evidence',
        '/service-requests/{requestId}/findings',
      ]),
    );
  });
});
