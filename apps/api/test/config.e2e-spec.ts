import { INestApplication } from '@nestjs/common';
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

/** Startup configuration (S4) and CORS (S5) against the real application. */
describe('configuration (e2e)', () => {
  let app: INestApplication;
  const originalCors = process.env.CORS_ORIGIN;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    if (originalCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalCors;
  });

  describe('S5: CORS is closed by default', () => {
    it('sends no CORS headers to an arbitrary origin', async () => {
      delete process.env.CORS_ORIGIN;
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('refuses a cross-origin preflight by default', async () => {
      delete process.env.CORS_ORIGIN;
      const res = await request(app.getHttpServer())
        .options('/clusters')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows exactly the configured origins', async () => {
      process.env.CORS_ORIGIN = 'https://app.example.com,https://admin.example.com';

      const allowed = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://admin.example.com')
        .expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('https://admin.example.com');

      const denied = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still serves requests that carry no Origin header', async () => {
      delete process.env.CORS_ORIGIN;
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('S4: the application refuses to load with unsafe secrets', () => {
    const keys = ['JWT_SECRET', 'ENCRYPTION_KEY', 'CORS_ORIGIN', 'NODE_ENV'] as const;
    const saved: Record<string, string | undefined> = {};

    // ConfigModule.forRoot() is async: validation failures surface as a rejected promise when
    // Nest resolves AppModule's imports. Load a fresh copy and hand it to Nest in the same tick.
    const compileWithCurrentEnv = async (): Promise<unknown> => {
      let FreshAppModule: unknown;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- needs a sync, isolated load
        FreshAppModule = require('../src/app.module').AppModule;
      });
      return Test.createTestingModule({ imports: [FreshAppModule as never] }).compile();
    };

    beforeEach(() => {
      for (const key of keys) saved[key] = process.env[key];
    });

    afterEach(() => {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });

    it('rejects a secret that was published in the repository', async () => {
      process.env.JWT_SECRET = 'buildpipe-docker-jwt-secret-min-32-chars';
      await expect(compileWithCurrentEnv()).rejects.toThrow(/JWT_SECRET.*published/);
    });

    it('rejects the CHANGE_ME placeholder', async () => {
      process.env.ENCRYPTION_KEY = 'CHANGE_ME';
      await expect(compileWithCurrentEnv()).rejects.toThrow(/ENCRYPTION_KEY/);
    });

    it('rejects CORS_ORIGIN=* in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGIN = '*';
      await expect(compileWithCurrentEnv()).rejects.toThrow(/CORS_ORIGIN/);
    });
  });
});
