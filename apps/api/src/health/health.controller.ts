import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/auth.decorators';
import { PrismaService } from '../common/prisma/prisma.service';
import { EventsService } from '../events/events.service';
import IORedis from 'ioredis';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private redis: IORedis | null = null;

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private config: ConfigService,
  ) {
    try {
      this.redis = new IORedis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
    } catch {
      this.redis = null;
    }
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check (DB, Redis, NATS)' })
  async ready() {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      if (this.redis) {
        await this.redis.connect();
        await this.redis.ping();
        checks.redis = 'ok';
        await this.redis.disconnect();
      } else {
        checks.redis = 'skipped';
      }
    } catch {
      checks.redis = 'error';
    }

    checks.nats = this.events.isConnected() ? 'ok' : 'degraded';

    const criticalOk = checks.database === 'ok';
    return {
      status: criticalOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
