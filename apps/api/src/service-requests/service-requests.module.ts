import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServicesModule } from '../services/services.module';
import { PrismaServiceRequestRepository } from './prisma-service-request.repository';
import { ServiceRequestRepository } from './service-requests.repository';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';

/**
 * Request lifecycle (ADR-0001). The HTTP layer exposes create, read and cancel only; the other
 * transitions are driven by later modules through ServiceRequestsService.
 */
@Module({
  imports: [AuditModule, ServicesModule],
  providers: [
    ServiceRequestsService,
    { provide: ServiceRequestRepository, useClass: PrismaServiceRequestRepository },
  ],
  controllers: [ServiceRequestsController],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
