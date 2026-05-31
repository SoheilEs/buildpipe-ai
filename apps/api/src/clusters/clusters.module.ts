import { Module } from '@nestjs/common';
import { ClustersService } from './clusters.service';
import { ClustersController } from './clusters.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AuthModule, AuditModule, EventsModule],
  providers: [ClustersService],
  controllers: [ClustersController],
  exports: [ClustersService],
})
export class ClustersModule {}
