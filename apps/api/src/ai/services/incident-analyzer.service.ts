import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { RiskLevel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClustersService } from '../../clusters/clusters.service';
import { AuditService } from '../../audit/audit.service';
import { EventsService } from '../../events/events.service';
import { AuditAction, EVENT_SUBJECTS } from '@buildpipe/shared-types';
import { randomUUID } from 'crypto';
import { ContextBuilderService } from '../context/builders/context-builder.service';
import { ContextNormalizerService } from '../context/normalizers/context-normalizer.service';
import { LogReducerService } from '../context/reducers/log-reducer.service';
import { EventScorerService } from '../context/scorers/event-scorer.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ClaudeProvider, OpenAiProvider } from '../providers/ai-providers';
import { IncidentsService } from '../../incidents/incidents.service';

@Injectable()
export class ContextEngineService {
  constructor(
    private clusters: ClustersService,
    private builder: ContextBuilderService,
    private normalizer: ContextNormalizerService,
    private logReducer: LogReducerService,
    private eventScorer: EventScorerService,
    private prisma: PrismaService,
  ) {}

  async buildContext(incidentId: string) {
    const incident = await this.prisma.incident.findFirstOrThrow({
      where: { id: incidentId },
      include: { cluster: true },
    });

    const { kubeconfig, context } = await this.clusters.getKubeconfig(incident.clusterId);
    const k8s = this.clusters.getK8sServices();

    let ctx = this.builder.buildBaseContext({
      incidentId: incident.id,
      clusterId: incident.clusterId,
      clusterName: incident.cluster.name,
      title: incident.title,
      description: incident.description,
      resourceType: incident.resourceType,
      resourceName: incident.resourceName,
      namespace: incident.namespace,
    });

    const pods = await k8s.pods.list(kubeconfig, incident.namespace ?? undefined, context ?? undefined);
    ctx = this.builder.withPods(ctx, pods);

    const events = await k8s.events.listEvents(
      kubeconfig,
      incident.namespace ?? undefined,
      undefined,
      context ?? undefined,
    );
    const scoredEvents = this.eventScorer.scoreAll(events);
    ctx = this.builder.withEvents(ctx, scoredEvents);

    if (incident.resourceName && incident.namespace) {
      const matchingPod = pods.find((p) => p.name.includes(incident.resourceName!));
      if (matchingPod) {
        const rawLogs = await k8s.logs.getPodLogs(
          kubeconfig,
          incident.namespace,
          matchingPod.name,
          { tailLines: 300 },
          context ?? undefined,
        );
        ctx = this.builder.withLogs(ctx, this.logReducer.reduce(rawLogs));
      }
    }

    if (incident.signature) {
      const patterns = await this.prisma.incidentPattern.findMany({
        where: { signature: incident.signature },
      });
      ctx.patternMatches = patterns.map((p) => ({
        signature: p.signature,
        rootCause: p.rootCause,
        frequency: p.frequency,
      }));
    }

    return this.normalizer.normalize(ctx);
  }
}

@Injectable()
export class IncidentAnalyzerService {
  constructor(
    private contextEngine: ContextEngineService,
    private promptBuilder: PromptBuilderService,
    private openai: OpenAiProvider,
    private claude: ClaudeProvider,
    private config: ConfigService,
    private prisma: PrismaService,
    private audit: AuditService,
    private events: EventsService,
  ) {}

  async analyze(incidentId: string, provider?: 'openai' | 'claude', userId?: string) {
    const context = await this.contextEngine.buildContext(incidentId);
    const { systemPrompt, userPrompt } = this.promptBuilder.build(context);

    const selectedProvider =
      provider ?? (this.config.get<string>('AI_DEFAULT_PROVIDER', 'openai') as 'openai' | 'claude');
    const aiProvider = selectedProvider === 'claude' ? this.claude : this.openai;

    let output = await aiProvider.analyze(userPrompt, systemPrompt);

    if (context.topEventScore === 0 && context.logs.length === 0 && context.events.length === 0) {
      output = {
        ...output,
        confidence: Math.min(output.confidence, 0.35),
        evidence: [
          ...output.evidence,
          'Insufficient Kubernetes context collected for high-confidence analysis',
        ],
      };
    }

    const rawPromptHash = createHash('sha256').update(userPrompt).digest('hex');

    const analysis = await this.prisma.aiAnalysis.create({
      data: {
        incidentId,
        provider: aiProvider.name,
        model: aiProvider.name === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-20241022',
        rootCause: output.rootCause,
        confidence: output.confidence,
        evidence: JSON.stringify(output.evidence),
        recommendations: JSON.stringify(output.recommendations),
        riskLevel: output.riskLevel as RiskLevel,
        rawPromptHash,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.INCIDENT_ANALYZED,
      resource: 'incident',
      resourceId: incidentId,
      metadata: { analysisId: analysis.id, confidence: output.confidence },
    });

    await this.events.publish(EVENT_SUBJECTS.INCIDENT_ANALYZED, {
      id: randomUUID(),
      type: 'incident.analyzed',
      version: 1,
      timestamp: new Date().toISOString(),
      payload: {
        incidentId,
        analysisId: analysis.id,
        confidence: output.confidence,
        rootCause: output.rootCause,
      },
    });

    return {
      ...output,
      analysisId: analysis.id,
      patternMatches: context.patternMatches,
    };
  }
}

@Injectable()
export class AiOrchestratorService {
  constructor(
    private analyzer: IncidentAnalyzerService,
    @Inject(forwardRef(() => IncidentsService))
    private incidents: IncidentsService,
  ) {}

  async analyzeIncident(incidentId: string, provider?: 'openai' | 'claude', userId?: string) {
    const result = await this.analyzer.analyze(incidentId, provider, userId);
    await this.incidents.markAnalyzed(incidentId, result.analysisId);
    return result;
  }

  async enrichIncident(incidentId: string) {
    await this.incidents.markEnriched(incidentId);
    await this.analyzer.analyze(incidentId);
    await this.incidents.markAnalyzed(incidentId, '');
  }
}
