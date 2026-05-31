import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Job, ConnectionOptions } from 'bullmq';
import IORedis, { RedisOptions } from 'ioredis';
import { QueueJobName, QueueName } from '@buildpipe/shared-types';
import { PrismaService } from '../common/prisma/prisma.service';

export interface AnalyzeIncidentJobData {
  incidentId: string;
  userId: string;
}

export interface EnrichIncidentJobData {
  incidentId: string;
}

@Injectable()
export class QueueService {
  private readonly redisOptions: RedisOptions;
  private incidentQueue: Queue;
  private logsQueue: Queue;
  private metricsQueue: Queue;
  private healthQueue: Queue;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.redisOptions = {
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
    };

    const connection = this.redisOptions as ConnectionOptions;
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: false,
    };

    this.incidentQueue = new Queue(QueueName.INCIDENTS, {
      connection,
      defaultJobOptions,
    });
    this.logsQueue = new Queue(QueueName.LOGS, { connection, defaultJobOptions });
    this.metricsQueue = new Queue(QueueName.METRICS, { connection, defaultJobOptions });
    this.healthQueue = new Queue(QueueName.HEALTH, { connection, defaultJobOptions });
  }

  async enqueueAnalyzeIncident(data: AnalyzeIncidentJobData) {
    return this.incidentQueue.add(QueueJobName.ANALYZE_INCIDENT, data, {
      jobId: `analyze-${data.incidentId}-${Date.now()}`,
    });
  }

  async enqueueEnrichIncident(data: EnrichIncidentJobData) {
    return this.incidentQueue.add(QueueJobName.ENRICH_INCIDENT, data, {
      jobId: `enrich-${data.incidentId}`,
    });
  }

  async enqueueProcessLogs(data: Record<string, unknown>) {
    return this.logsQueue.add(QueueJobName.PROCESS_LOGS, data);
  }

  async enqueueSyncMetrics(data: Record<string, unknown>) {
    return this.metricsQueue.add(QueueJobName.SYNC_METRICS, data);
  }

  async enqueueClusterHealthScan(data: Record<string, unknown>) {
    return this.healthQueue.add(QueueJobName.CLUSTER_HEALTH_SCAN, data);
  }

  async recordFailedJob(queueName: string, job: Job, error: Error) {
    await this.prisma.failedJob.create({
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

  getConnection() {
    return new IORedis(this.redisOptions);
  }

  getQueues() {
    return {
      incidents: this.incidentQueue,
      logs: this.logsQueue,
      metrics: this.metricsQueue,
      health: this.healthQueue,
    };
  }
}