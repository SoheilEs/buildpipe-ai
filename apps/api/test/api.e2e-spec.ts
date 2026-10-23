import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueService } from '../src/queue/queue.service';
import { EventsService } from '../src/events/events.service';

// @kubernetes/client-node v1 is ESM-only and Jest runs CommonJS. These tests never reach a
// cluster, so an empty stand-in is enough to let the module graph load.
jest.mock('@kubernetes/client-node', () => ({}));

/**
 * Smoke tests against the real AppModule (real guards, JWT strategy, validation pipe and
 * Swagger). Only infrastructure is replaced: no database, Redis or NATS is needed.
 */
describe('API smoke (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const users: Record<string, { id: string; email: string; role: string; deletedAt: null }> = {
    viewer: { id: 'u-viewer', email: 'viewer@test.local', role: 'viewer', deletedAt: null },
    operator: { id: 'u-operator', email: 'operator@test.local', role: 'operator', deletedAt: null },
    admin: { id: 'u-admin', email: 'admin@test.local', role: 'admin', deletedAt: null },
  };

  const prismaStub = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    cluster: { findMany: jest.fn() },
    refreshToken: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const tokenFor = (role: keyof typeof users) =>
    jwt.sign({ sub: users[role].id, email: users[role].email, role });

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
    prismaStub.cluster.findMany.mockResolvedValue([]);
  });

  describe('public endpoints', () => {
    it('GET /health returns ok', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('sets security headers (helmet)', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('serves the OpenAPI document with the documented routes', async () => {
      const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      expect(res.body.info.title).toBe('BuildPipe AI API');
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/health', '/auth/login', '/clusters', '/incidents']),
      );
    });
  });

  describe('anonymous requests are denied', () => {
    it.each([
      ['GET', '/clusters'],
      ['GET', '/incidents'],
      ['GET', '/users/me'],
      ['GET', '/audit/logs'],
      ['GET', '/clusters/c1/kubernetes/namespaces'],
      ['POST', '/internal/mcp/get_pods'],
      ['POST', '/internal/mcp/restart_deployment'],
    ])('%s %s -> 401', async (method, path) => {
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post'](path);
      expect(res.status).toBe(401);
    });

    it('rejects a malformed bearer token', async () => {
      await request(app.getHttpServer())
        .get('/clusters')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const forged = new JwtService({ secret: 'some-other-secret-that-is-32-chars-long' }).sign({
        sub: users.admin.id,
        email: users.admin.email,
        role: 'admin',
      });
      await request(app.getHttpServer())
        .get('/audit/logs')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('rejects a valid token whose user no longer exists', async () => {
      prismaStub.user.findFirst.mockResolvedValue(null);
      await request(app.getHttpServer())
        .get('/clusters')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(401);
    });
  });

  describe('role-based access control', () => {
    it('lets a viewer read clusters', async () => {
      const res = await request(app.getHttpServer())
        .get('/clusters')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('forbids a viewer from admin routes', async () => {
      await request(app.getHttpServer())
        .get('/audit/logs')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .expect(403);
    });

    it('forbids a viewer from operator routes (create incident)', async () => {
      await request(app.getHttpServer())
        .post('/incidents')
        .set('Authorization', `Bearer ${tokenFor('viewer')}`)
        .send({})
        .expect(403);
    });

    it('forbids an operator from admin routes', async () => {
      await request(app.getHttpServer())
        .get('/audit/logs')
        .set('Authorization', `Bearer ${tokenFor('operator')}`)
        .expect(403);
    });
  });

  describe('input validation', () => {
    it('POST /auth/login rejects an empty body', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
    });

    it('POST /auth/login rejects unknown properties (whitelist)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'a@b.co', password: 'x', isAdmin: true })
        .expect(400);
    });
  });

  describe('public registration (S11: no self-assigned roles)', () => {
    const register = (body: Record<string, unknown>) =>
      request(app.getHttpServer()).post('/auth/register').send(body);

    beforeEach(() => {
      prismaStub.user.findUnique.mockResolvedValue(null);
      prismaStub.user.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'u-new',
          email: data.email,
          role: data.role,
          deletedAt: null,
        }),
      );
      prismaStub.refreshToken.create.mockResolvedValue({});
      prismaStub.auditLog.create.mockResolvedValue({});
    });

    it.each(['admin', 'operator', 'viewer'])(
      'rejects a request that supplies role=%s and creates no user',
      async (role) => {
        await register({ email: 'attacker@test.local', password: 'Password123!', role }).expect(
          400,
        );
        expect(prismaStub.user.create).not.toHaveBeenCalled();
      },
    );

    it('creates a viewer when no role is supplied', async () => {
      const res = await register({ email: 'new@test.local', password: 'Password123!' }).expect(201);

      expect(prismaStub.user.create).toHaveBeenCalledTimes(1);
      expect(prismaStub.user.create.mock.calls[0][0].data.role).toBe('viewer');
      expect(res.body.user.role).toBe('viewer');
    });

    it('does not let a freshly registered user reach admin routes', async () => {
      const res = await register({ email: 'new@test.local', password: 'Password123!' }).expect(201);
      prismaStub.user.findFirst.mockResolvedValue({
        id: 'u-new',
        email: 'new@test.local',
        role: 'viewer',
        deletedAt: null,
      });

      await request(app.getHttpServer())
        .get('/audit/logs')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(403);
    });
  });
});
