import { Module } from '@nestjs/common';
import { PrismaServiceRequestRepository } from './prisma-service-request.repository';
import { ServiceRequestRepository } from './service-requests.repository';
import { ServiceRequestsService } from './service-requests.service';

/**
 * Request lifecycle (ADR-0001). No controller yet: the services registry (Phase 2.2) has to exist
 * before a request can name its target, and the HTTP layer needs role guards written with it.
 */
@Module({
  providers: [
    ServiceRequestsService,
    { provide: ServiceRequestRepository, useClass: PrismaServiceRequestRepository },
  ],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
