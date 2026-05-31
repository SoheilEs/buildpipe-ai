import { Module, forwardRef } from '@nestjs/common';
import { AiOrchestratorService, ContextEngineService, IncidentAnalyzerService } from './services/incident-analyzer.service';
import { ContextBuilderService } from './context/builders/context-builder.service';
import { ContextNormalizerService } from './context/normalizers/context-normalizer.service';
import { LogReducerService } from './context/reducers/log-reducer.service';
import { EventScorerService } from './context/scorers/event-scorer.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { OpenAiProvider, ClaudeProvider } from './providers/ai-providers';
import { ClustersModule } from '../clusters/clusters.module';
import { AuditModule } from '../audit/audit.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  imports: [
    ClustersModule,
    AuditModule,
    forwardRef(() => IncidentsModule),
  ],
  providers: [
    ContextBuilderService,
    ContextNormalizerService,
    LogReducerService,
    EventScorerService,
    PromptBuilderService,
    OpenAiProvider,
    ClaudeProvider,
    ContextEngineService,
    IncidentAnalyzerService,
    AiOrchestratorService,
  ],
  exports: [AiOrchestratorService, ContextEngineService, IncidentAnalyzerService],
})
export class AiModule {}
