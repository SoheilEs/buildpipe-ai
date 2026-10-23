import 'dotenv/config';
import { Worker, Job, Queue, ConnectionOptions } from 'bullmq';
import { RedisOptions } from 'ioredis';
import { PrismaClient, IncidentStatus } from '@prisma/client';
import { QueueJobName, QueueName, EVENT_SUBJECTS } from '@buildpipe/shared-types';
import { connect, StringCodec } from 'nats';

const prisma = new PrismaClient();

const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  maxRetriesPerRequest: null,
};

const connection = redisOptions as ConnectionOptions;

const incidentProducer = new Queue(QueueName.INCIDENTS, { connection });
const healthProducer = new Queue(QueueName.HEALTH, { connection });

async function recordFailedJob(queueName: string, job: Job, error: Error) {
  await prisma.failedJob.create({
    data: {
      queueName,
      jobName: job.name,
      jobId: job.id ?? 'unknown',
      payload: JSON.stringify(job.data),
      error: error.message,
      attempts: job.attemptsMade,
    },
  });
}

async function setupNatsSubscriber() {
  try {
    const nc = await connect({ servers: process.env.NATS_URL ?? 'nats://localhost:4222' });
    const sc = StringCodec();

    const sub = nc.subscribe(EVENT_SUBJECTS.INCIDENT_CREATED);
    (async () => {
      for await (const msg of sub) {
        const event = JSON.parse(sc.decode(msg.data)) as {
          payload: { incidentId: string };
        };
        await incidentProducer.add(QueueJobName.ENRICH_INCIDENT, {
          incidentId: event.payload.incidentId,
        });
      }
    })();

    console.log('NATS subscriber connected for incident.created');
  } catch (err) {
    console.warn('NATS subscriber unavailable:', err);
  }
}

const incidentWorker = new Worker(
  QueueName.INCIDENTS,
  async (job: Job) => {
    console.log(`Processing job ${job.name} id=${job.id}`);

    switch (job.name) {
      case QueueJobName.ENRICH_INCIDENT: {
        const { incidentId } = job.data as { incidentId: string };
        await prisma.incident.update({
          where: { id: incidentId },
          data: { status: IncidentStatus.ENRICHING },
        });
        await incidentProducer.add(QueueJobName.ANALYZE_INCIDENT, {
          incidentId,
          userId: 'system',
        });
        break;
      }
      case QueueJobName.ANALYZE_INCIDENT: {
        const { incidentId, userId } = job.data as { incidentId: string; userId: string };
        await prisma.incident.update({
          where: { id: incidentId },
          data: { status: IncidentStatus.ANALYZING },
        });
        console.log(`Analysis queued processing for incident ${incidentId} by ${userId}`);
        await prisma.incident.update({
          where: { id: incidentId },
          data: { status: IncidentStatus.ANALYZED },
        });
        break;
      }
      default:
        console.warn(`Unknown job: ${job.name}`);
    }
  },
  { connection, concurrency: 5 },
);

incidentWorker.on('failed', (job, err) => {
  if (job) void recordFailedJob(QueueName.INCIDENTS, job, err);
});

const logsWorker = new Worker(
  QueueName.LOGS,
  async (job: Job) => {
    console.log(`Processing logs job ${job.id}`, job.data);
  },
  { connection, concurrency: 3 },
);

logsWorker.on('failed', (job, err) => {
  if (job) void recordFailedJob(QueueName.LOGS, job, err);
});

const healthWorker = new Worker(
  QueueName.HEALTH,
  async () => {
    const clusters = await prisma.cluster.findMany({ where: { deletedAt: null } });
    for (const cluster of clusters) {
      console.log(`Health scan for cluster ${cluster.name}`);
    }
  },
  { connection, concurrency: 1 },
);

healthWorker.on('failed', (job, err) => {
  if (job) void recordFailedJob(QueueName.HEALTH, job, err);
});

async function main() {
  console.log('BuildPipe AI Worker started');
  await setupNatsSubscriber();

  setInterval(
    () => {
      void healthProducer.add(QueueJobName.CLUSTER_HEALTH_SCAN, {
        triggeredAt: new Date().toISOString(),
      });
    },
    5 * 60 * 1000,
  );
}

main().catch(console.error);

process.on('SIGINT', async () => {
  await incidentWorker.close();
  await logsWorker.close();
  await healthWorker.close();
  await prisma.$disconnect();
  process.exit(0);
});
