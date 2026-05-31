import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, NatsConnection, StringCodec } from 'nats';
import { DomainEvent } from '@buildpipe/shared-types';

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private nc: NatsConnection | null = null;
  private sc = StringCodec();

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    try {
      this.nc = await connect({ servers: this.config.get<string>('NATS_URL') });
      this.logger.log('Connected to NATS');
    } catch (err) {
      this.logger.warn(`NATS unavailable: ${err}. Events will be logged locally.`);
    }
  }

  async onModuleDestroy() {
    if (this.nc) await this.nc.drain();
  }

  async publish(subject: string, event: DomainEvent): Promise<void> {
    if (!this.nc) {
      this.logger.debug(`[local-event] ${subject}: ${JSON.stringify(event)}`);
      return;
    }
    this.nc.publish(subject, this.sc.encode(JSON.stringify(event)));
  }

  async subscribe(subject: string, handler: (event: DomainEvent) => Promise<void>) {
    if (!this.nc) {
      this.logger.warn(`Cannot subscribe to ${subject}: NATS not connected`);
      return;
    }

    const sub = this.nc.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        try {
          const data = JSON.parse(this.sc.decode(msg.data)) as DomainEvent;
          await handler(data);
        } catch (err) {
          this.logger.error(`Failed to process event on ${subject}`, err);
        }
      }
    })();
  }

  isConnected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }
}
