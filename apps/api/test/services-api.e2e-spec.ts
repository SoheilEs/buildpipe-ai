import { ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import { QueueService } from '../src/queue/queue.service';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { ServicesService } from '../src/services/services.service';

jest.mock('@kubernetes/client-node', () => ({}));

/**
 * Server-side authorization of the services registry and the request API (brief scenario 4).
 * The real guards, JWT strategy, validation pipe and controllers run; only the two services and
 * the audit writer are replaced, so these tests prove who may call what, not what the database does.
 */
describe('services and service-requests API (e2e)', () => {
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

  const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
  const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
  const CLUSTER_ID = '33333333-3333-4333-8333-333333333333';

  const requestRecord = (requesterId: string) => ({
    id: REQUEST_ID,
    kind: 'nonroot-runtime-review',
    serviceId: SERVICE_ID,
    status: 'Requested',
    requesterId,
    idempotencyKey: null,
    version: 0,
  });

  const servicesStub = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const requestsStub = {
    create: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    history: jest.fn(),
    transition: jest.fn(),
  };
  const auditStub = { log: jest.fn(), findAll: jest.fn() };

  const prismaStub = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const bearer = (role: RoleName) =>
    `Bearer ${jwt.sign({ sub: users[role].id, email: users[role].email, role })}`;

  const serviceBody = () => ({
    name: 'Payments API',
    clusterId: CLUSTER_ID,
    namespace: 'staging',
    workloadKind: 'Deployment',
    workloadName: 'payments-api',
    gitRepository: 'acme/infra-config',
    configPaths: ['apps/payments/deployment.yaml'],
  });

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
      .overrideProvider(ServicesService)
      .useValue(servicesStub)
      .overrideProvider(ServiceRequestsService)
      .useValue(requestsStub)
      .overrideProvider(AuditService)
      .useValue(auditStub)
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
    servicesStub.findAll.mockResolvedValue([]);
    servicesStub.findOne.mockResolvedValue({ id: SERVICE_ID });
    servicesStub.create.mockResolvedValue({ id: SERVICE_ID });
    servicesStub.update.mockResolvedValue({ id: SERVICE_ID });
    servicesStub.remove.mockResolvedValue(undefined);
    requestsStub.list.mockResolvedValue([]);
    requestsStub.get.mockResolvedValue(requestRecord('u-operator'));
    requestsStub.history.mockResolvedValue([]);
    requestsStub.create.mockResolvedValue({ request: requestRecord('u-operator'), created: true });
    requestsStub.transition.mockResolvedValue({
      ...requestRecord('u-operator'),
      status: 'Cancelled',
    });
  });

  describe('anonymous callers are denied everywhere', () => {
    it.each([
      ['get', '/services'],
      ['get', `/services/${SERVICE_ID}`],
      ['post', '/services'],
      ['patch', `/services/${SERVICE_ID}`],
      ['delete', `/services/${SERVICE_ID}`],
      ['get', '/service-requests'],
      ['post', '/service-requests'],
      ['get', `/service-requests/${REQUEST_ID}`],
      ['get', `/service-requests/${REQUEST_ID}/history`],
      ['post', `/service-requests/${REQUEST_ID}/cancel`],
    ] as const)('%s %s -> 401', async (method, path) => {
      const res = await request(app.getHttpServer())[method](path);
      expect(res.status).toBe(401);
      expect(servicesStub.create).not.toHaveBeenCalled();
      expect(requestsStub.create).not.toHaveBeenCalled();
    });
  });

  describe('services registry', () => {
    it.each(roles)('%s can read', async (role) => {
      await request(app.getHttpServer())
        .get('/services')
        .set('Authorization', bearer(role))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/services/${SERVICE_ID}`)
        .set('Authorization', bearer(role))
        .expect(200);
    });

    it.each(['viewer', 'operator', 'approver'] as const)(
      '%s cannot register, change or delete a service (403)',
      async (role) => {
        const auth = bearer(role);
        await request(app.getHttpServer())
          .post('/services')
          .set('Authorization', auth)
          .send(serviceBody())
          .expect(403);
        await request(app.getHttpServer())
          .patch(`/services/${SERVICE_ID}`)
          .set('Authorization', auth)
          .send({ gitBaseBranch: 'x' })
          .expect(403);
        await request(app.getHttpServer())
          .delete(`/services/${SERVICE_ID}`)
          .set('Authorization', auth)
          .expect(403);
        expect(servicesStub.create).not.toHaveBeenCalled();
        expect(servicesStub.update).not.toHaveBeenCalled();
        expect(servicesStub.remove).not.toHaveBeenCalled();
      },
    );

    it('an admin registers a service, attributed to the admin', async () => {
      await request(app.getHttpServer())
        .post('/services')
        .set('Authorization', bearer('admin'))
        .send(serviceBody())
        .expect(201);
      expect(servicesStub.create).toHaveBeenCalledWith(
        'u-admin',
        expect.objectContaining({ workloadName: 'payments-api' }),
      );
    });

    it('an admin can update and delete', async () => {
      await request(app.getHttpServer())
        .patch(`/services/${SERVICE_ID}`)
        .set('Authorization', bearer('admin'))
        .send({ gitBaseBranch: 'release/1' })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/services/${SERVICE_ID}`)
        .set('Authorization', bearer('admin'))
        .expect(204);
    });

    it('rejects unknown fields and bad ids before reaching the service', async () => {
      await request(app.getHttpServer())
        .post('/services')
        .set('Authorization', bearer('admin'))
        .send({ ...serviceBody(), createdById: 'someone-else' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/services')
        .set('Authorization', bearer('admin'))
        .send({ ...serviceBody(), clusterId: 'not-a-uuid' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/services/not-a-uuid')
        .set('Authorization', bearer('viewer'))
        .expect(400);
      expect(servicesStub.create).not.toHaveBeenCalled();
    });
  });

  describe('requests: create', () => {
    it('a viewer cannot create a request (403)', async () => {
      await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', bearer('viewer'))
        .send({ serviceId: SERVICE_ID, kind: 'nonroot-runtime-review' })
        .expect(403);
      expect(requestsStub.create).not.toHaveBeenCalled();
    });

    it.each(['operator', 'approver', 'admin'] as const)('%s can create (201)', async (role) => {
      const res = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', bearer(role))
        .send({ serviceId: SERVICE_ID, kind: 'nonroot-runtime-review' })
        .expect(201);
      expect(res.body.id).toBe(REQUEST_ID);
      // The requester is always the caller, never taken from the body.
      expect(requestsStub.create).toHaveBeenCalledWith(
        expect.objectContaining({ requesterId: users[role].id, serviceId: SERVICE_ID }),
      );
      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_CREATED', userId: users[role].id }),
      );
    });

    it('refuses a requesterId in the body', async () => {
      await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', bearer('operator'))
        .send({ serviceId: SERVICE_ID, kind: 'nonroot-runtime-review', requesterId: 'u-admin' })
        .expect(400);
      expect(requestsStub.create).not.toHaveBeenCalled();
    });

    it('passes the Idempotency-Key header and answers 200 for a repeat', async () => {
      requestsStub.create.mockResolvedValueOnce({
        request: requestRecord('u-operator'),
        created: false,
      });
      const res = await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', bearer('operator'))
        .set('Idempotency-Key', 'retry-1')
        .send({ serviceId: SERVICE_ID, kind: 'nonroot-runtime-review' })
        .expect(200);
      expect(res.body.id).toBe(REQUEST_ID);
      expect(requestsStub.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'retry-1' }),
      );
      // A repeat is not a new request, so it is not audited again.
      expect(auditStub.log).not.toHaveBeenCalled();
    });

    it('answers 404 for an unregistered service and creates nothing', async () => {
      servicesStub.findOne.mockRejectedValueOnce(new NotFoundException('nf'));
      await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', bearer('operator'))
        .send({ serviceId: SERVICE_ID, kind: 'nonroot-runtime-review' })
        .expect(404);
      expect(requestsStub.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ serviceId: 'x', kind: 'nonroot-runtime-review' }],
      [{ kind: 'nonroot-runtime-review' }],
      [{ serviceId: SERVICE_ID }],
      [{ serviceId: SERVICE_ID, kind: 'x'.repeat(101) }],
    ])('rejects an invalid body %#', async (body) => {
      await request(app.getHttpServer())
        .post('/service-requests')
        .set('Authorization', bearer('operator'))
        .send(body)
        .expect(400);
    });
  });

  describe('requests: read', () => {
    it.each(roles)('%s can list, read and see the history', async (role) => {
      const auth = bearer(role);
      await request(app.getHttpServer())
        .get('/service-requests')
        .set('Authorization', auth)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/service-requests/${REQUEST_ID}`)
        .set('Authorization', auth)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/service-requests/${REQUEST_ID}/history`)
        .set('Authorization', auth)
        .expect(200);
    });

    it('applies the list defaults and validated filters', async () => {
      await request(app.getHttpServer())
        .get('/service-requests?status=Collecting&limit=5&offset=10')
        .set('Authorization', bearer('viewer'))
        .expect(200);
      expect(requestsStub.list).toHaveBeenCalledWith({
        status: 'Collecting',
        requesterId: undefined,
        serviceId: undefined,
        limit: 5,
        offset: 10,
      });
      await request(app.getHttpServer())
        .get('/service-requests')
        .set('Authorization', bearer('viewer'))
        .expect(200);
      expect(requestsStub.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, offset: 0 }),
      );
    });

    it.each(['status=Bogus', 'limit=0', 'limit=1000', 'offset=-1', 'requesterId=nope', 'x=1'])(
      'rejects the query %s',
      async (query) => {
        await request(app.getHttpServer())
          .get(`/service-requests?${query}`)
          .set('Authorization', bearer('viewer'))
          .expect(400);
      },
    );
  });

  describe('requests: cancel', () => {
    const cancel = (role: RoleName, body: object = { reason: 'not needed' }) =>
      request(app.getHttpServer())
        .post(`/service-requests/${REQUEST_ID}/cancel`)
        .set('Authorization', bearer(role))
        .send(body);

    it('a viewer cannot cancel (403)', async () => {
      await cancel('viewer').expect(403);
      expect(requestsStub.transition).not.toHaveBeenCalled();
    });

    it('the requester can cancel their own request, with the reason and as the actor', async () => {
      await cancel('operator').expect(200);
      expect(requestsStub.transition).toHaveBeenCalledWith(REQUEST_ID, 'Cancelled', {
        actorId: 'u-operator',
        reason: 'not needed',
      });
      expect(auditStub.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_CANCELLED', userId: 'u-operator' }),
      );
    });

    it.each(['approver'] as const)(
      'an %s who is not the requester cannot cancel it (403 NOT_REQUESTER)',
      async (role) => {
        const res = await cancel(role).expect(403);
        expect(res.body.code ?? res.body.message?.code).toBe('NOT_REQUESTER');
        expect(requestsStub.transition).not.toHaveBeenCalled();
      },
    );

    it('an admin can cancel someone else’s request', async () => {
      await cancel('admin').expect(200);
      expect(requestsStub.transition).toHaveBeenCalledWith(REQUEST_ID, 'Cancelled', {
        actorId: 'u-admin',
        reason: 'not needed',
      });
    });

    it('requires a reason', async () => {
      await cancel('operator', {}).expect(400);
      await cancel('operator', { reason: '' }).expect(400);
      expect(requestsStub.transition).not.toHaveBeenCalled();
    });

    it('does not accept a target status in the body (no generic status endpoint)', async () => {
      await cancel('operator', { reason: 'x', status: 'Approved' }).expect(400);
      expect(requestsStub.transition).not.toHaveBeenCalled();
    });

    it('relays a 409 from the state machine and audits nothing', async () => {
      requestsStub.transition.mockRejectedValueOnce(
        new ConflictException({ code: 'TERMINAL_STATE', message: 'final' }),
      );
      await cancel('operator').expect(409);
      expect(auditStub.log).not.toHaveBeenCalled();
    });

    it('has no endpoint that sets an arbitrary status', async () => {
      for (const path of ['approve', 'status', 'transition']) {
        const res = await request(app.getHttpServer())
          .post(`/service-requests/${REQUEST_ID}/${path}`)
          .set('Authorization', bearer('admin'))
          .send({ status: 'Approved' });
        expect(res.status).toBe(404);
      }
    });
  });

  it('documents the new routes in the OpenAPI document', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/services',
        '/services/{id}',
        '/service-requests',
        '/service-requests/{id}',
        '/service-requests/{id}/history',
        '/service-requests/{id}/cancel',
      ]),
    );
  });
});
