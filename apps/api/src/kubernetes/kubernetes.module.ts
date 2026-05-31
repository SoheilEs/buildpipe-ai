import { Module, forwardRef } from '@nestjs/common';
import { KubernetesFacadeService } from './kubernetes.service';
import { KubernetesController } from './kubernetes.controller';
import { ClustersModule } from '../clusters/clusters.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    ClustersModule,
    AuthModule,
    AuditModule,
    EventsModule,
    forwardRef(() => WebsocketModule),
  ],
  providers: [KubernetesFacadeService],
  controllers: [KubernetesController],
  exports: [KubernetesFacadeService],
})
export class KubernetesModule {}
