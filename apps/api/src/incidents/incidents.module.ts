import { Module, forwardRef } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { IncidentStateMachine } from './incident-state-machine.service';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [AuditModule, forwardRef(() => AiModule), forwardRef(() => WebsocketModule)],
  providers: [IncidentsService, IncidentStateMachine],
  controllers: [IncidentsController],
  exports: [IncidentsService, IncidentStateMachine],
})
export class IncidentsModule {}
