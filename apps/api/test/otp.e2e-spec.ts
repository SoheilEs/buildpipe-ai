import crypto from 'crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ClustersService } from '../src/clusters/clusters.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { QueueService } from '../src/queue/queue.service';
import { EventsService } from '../src/events/events.service';

// @kubernetes/client-node v1 is ESM-only and Jest runs CommonJS. These tests never reach a
// cluster, so an empty stand-in is enough to let the module graph load.
jest.mock('@kubernetes/client-node', () => ({}));

/**
 * One-time codes (S1, S2, S3). The OTP stub is stateful on purpose: once a challenge is
 * consumed, a second verification of the same code fails, exactly like the real table.
 */
describe('OTP handling (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const operator = { id: 'u-operator', email: 'op@test.local', role: 'operator', deletedAt: null };
  const viewer = { id: 'u-viewer', email: 'viewer@test.local', role: 'viewer', deletedAt: null };
  const users = [operator, viewer];

  type Challenge = {
    id: string;
    userId: string;
    purpose: string;
    codeHash: string;
    consumedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  };
  let challenge: Challenge | null;

  const cluster = {
    id: 'c1',
    name: 'prod',
    context: null,
    encryptedKubeconfig: 'enc',
    lastConnectedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  };

  const prismaStub = {
    user: { findFirst: jest.fn() },
    cluster: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    otpChallenge: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const tokenFor = (u: typeof operator) => jwt.sign({ sub: u.id, email: u.email, role: u.role });
  const auth = () => ({ Authorization: `Bearer ${tokenFor(operator)}` });

  const issueOtp = (purpose: string, code = '123456') => {
    challenge = {
      id: 'ch-1',
      userId: operator.id,
      purpose,
      codeHash: bcrypt.hashSync(code, 4),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    };
  };

  const auditMetadata = (): string[] =>
    prismaStub.auditLog.create.mock.calls
      .map(([arg]: [{ data: { metadata?: string | null } }]) => arg.data.metadata ?? '')
      .filter(Boolean);

  const restart = jest.fn();

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

    // Kubernetes access is faked at the ClustersService seam; OTP logic stays real.
    const clusters = app.get(ClustersService);
    jest
      .spyOn(clusters, 'getKubeconfig')
      .mockResolvedValue({ kubeconfig: 'kubeconfig', context: null });
    jest
      .spyOn(clusters, 'getK8sServices')
      .mockReturnValue({ deployments: { restart } } as unknown as ReturnType<
        ClustersService['getK8sServices']
      >);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    challenge = null;
    delete process.env.OTP_DEV_MODE;

    prismaStub.user.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string } }) => users.find((u) => u.id === where.id) ?? null,
    );
    prismaStub.auditLog.create.mockResolvedValue({});
    prismaStub.cluster.findFirst.mockResolvedValue(cluster);
    prismaStub.cluster.create.mockResolvedValue(cluster);
    prismaStub.cluster.update.mockResolvedValue(cluster);

    prismaStub.otpChallenge.findFirst.mockImplementation(
      async ({ where }: { where: { userId: string; purpose: string } }) =>
        challenge &&
        challenge.userId === where.userId &&
        challenge.purpose === where.purpose &&
        challenge.consumedAt === null &&
        challenge.expiresAt > new Date()
          ? challenge
          : null,
    );
    prismaStub.otpChallenge.update.mockImplementation(
      async ({ data }: { data: { consumedAt: Date } }) => {
        if (challenge) challenge.consumedAt = data.consumedAt;
        return challenge;
      },
    );
    prismaStub.otpChallenge.create.mockImplementation(
      async ({ data }: { data: Omit<Challenge, 'id' | 'consumedAt' | 'createdAt'> }) => {
        challenge = { ...data, id: 'ch-new', consumedAt: null, createdAt: new Date() };
        return challenge;
      },
    );
  });

  describe('S1: an OTP is verified exactly once per request', () => {
    const clusterBody = { name: 'prod', kubeconfig: 'apiVersion: v1', otp: '123456' };

    it('POST /clusters succeeds with a valid OTP and consumes it once', async () => {
      issueOtp('cluster_register');
      await request(app.getHttpServer())
        .post('/clusters')
        .set(auth())
        .send(clusterBody)
        .expect(201);

      expect(prismaStub.cluster.create).toHaveBeenCalledTimes(1);
      expect(prismaStub.otpChallenge.update).toHaveBeenCalledTimes(1);
    });

    it('POST /clusters rejects a wrong OTP with 401 and creates nothing', async () => {
      issueOtp('cluster_register', '999999');
      await request(app.getHttpServer())
        .post('/clusters')
        .set(auth())
        .send(clusterBody)
        .expect(401);
      expect(prismaStub.cluster.create).not.toHaveBeenCalled();
    });

    it('POST /clusters cannot reuse a consumed OTP', async () => {
      issueOtp('cluster_register');
      await request(app.getHttpServer())
        .post('/clusters')
        .set(auth())
        .send(clusterBody)
        .expect(201);
      await request(app.getHttpServer())
        .post('/clusters')
        .set(auth())
        .send(clusterBody)
        .expect(401);
      expect(prismaStub.cluster.create).toHaveBeenCalledTimes(1);
    });

    it('PATCH /clusters/:id succeeds with a valid OTP', async () => {
      issueOtp('cluster_update');
      await request(app.getHttpServer())
        .patch('/clusters/c1')
        .set(auth())
        .send({ name: 'renamed', otp: '123456' })
        .expect(200);
      expect(prismaStub.cluster.update).toHaveBeenCalledTimes(1);
    });

    it('REST restart requires an OTP (400 without, 401 when wrong)', async () => {
      const body = { namespace: 'default', name: 'web' };
      issueOtp('deployment_restart', '999999');

      await request(app.getHttpServer())
        .post('/clusters/c1/kubernetes/deployments/restart')
        .set(auth())
        .send(body)
        .expect(400);
      await request(app.getHttpServer())
        .post('/clusters/c1/kubernetes/deployments/restart')
        .set(auth())
        .send({ ...body, otp: '123456' })
        .expect(401);
      expect(restart).not.toHaveBeenCalled();
    });

    it('REST restart succeeds with a valid OTP', async () => {
      issueOtp('deployment_restart');
      await request(app.getHttpServer())
        .post('/clusters/c1/kubernetes/deployments/restart')
        .set(auth())
        .send({ namespace: 'default', name: 'web', otp: '123456' })
        .expect(201);

      expect(restart).toHaveBeenCalledTimes(1);
      expect(restart.mock.calls[0].slice(1, 3)).toEqual(['default', 'web']);
    });

    it('MCP restart_deployment succeeds with a valid OTP (was always HTTP 500)', async () => {
      issueOtp('deployment_restart');
      await request(app.getHttpServer())
        .post('/internal/mcp/restart_deployment')
        .set(auth())
        .set('x-otp-code', '123456')
        .send({ clusterId: 'c1', namespace: 'default', deploymentName: 'web' })
        .expect(201);

      expect(restart).toHaveBeenCalledTimes(1);
      expect(prismaStub.otpChallenge.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('S2: the OTP never reaches the audit log', () => {
    it('MCP audit metadata is an allowlist without the OTP or free-form params', async () => {
      issueOtp('deployment_restart');
      await request(app.getHttpServer())
        .post('/internal/mcp/restart_deployment')
        .set(auth())
        .send({
          clusterId: 'c1',
          namespace: 'default',
          deploymentName: 'web',
          otp: '123456',
          params: { note: 'free-form value 123456' },
        })
        .expect(201);

      const all = auditMetadata();
      expect(all.length).toBeGreaterThan(0);
      for (const metadata of all) {
        expect(metadata).not.toContain('123456');
        expect(metadata).not.toContain('"otp"');
      }
      const mcp = all.map((m) => JSON.parse(m)).find((m) => m.tool === 'restart_deployment');
      expect(mcp).toEqual({
        tool: 'restart_deployment',
        clusterId: 'c1',
        namespace: 'default',
        deploymentName: 'web',
      });
    });
  });

  describe('S3: issuing an OTP is fail-closed', () => {
    const logged: string[] = [];

    beforeEach(() => {
      logged.length = 0;
      jest.spyOn(crypto, 'randomInt').mockImplementation(() => 424242);
      for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
        jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
      }
    });

    afterEach(() => {
      jest.restoreAllMocks();
      // restoreAllMocks also drops the ClustersService spies installed in beforeAll
      const clusters = app.get(ClustersService);
      jest
        .spyOn(clusters, 'getKubeconfig')
        .mockResolvedValue({ kubeconfig: 'kubeconfig', context: null });
      jest
        .spyOn(clusters, 'getK8sServices')
        .mockReturnValue({ deployments: { restart } } as unknown as ReturnType<
          ClustersService['getK8sServices']
        >);
    });

    it('does not return or log the code by default', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set(auth())
        .send({ purpose: 'deployment_restart' })
        .expect(201);

      expect(res.body.devCode).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('424242');
      expect(logged.join('\n')).not.toContain('424242');
      expect(auditMetadata().join('\n')).not.toContain('424242');
      expect(prismaStub.otpChallenge.create).toHaveBeenCalledTimes(1);
    });

    it('returns the code only when OTP_DEV_MODE=true', async () => {
      process.env.OTP_DEV_MODE = 'true';
      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set(auth())
        .send({ purpose: 'deployment_restart' })
        .expect(201);
      expect(res.body.devCode).toBe('424242');
    });

    it('is not fooled by NODE_ENV: any value other than "true" keeps it off', async () => {
      process.env.OTP_DEV_MODE = '1';
      const res = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set(auth())
        .send({ purpose: 'deployment_restart' })
        .expect(201);
      expect(res.body.devCode).toBeUndefined();
    });

    it('rejects an unknown purpose with 400 instead of a database error', async () => {
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set(auth())
        .send({ purpose: 'not_a_purpose' })
        .expect(400);
      expect(prismaStub.otpChallenge.create).not.toHaveBeenCalled();
    });
  });
});
