import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queue/queue.service';
import { EventsService } from '../events/events.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { AiOrchestratorService } from '../ai/services/incident-analyzer.service';
import { AuditAction, EVENT_SUBJECTS } from '@buildpipe/shared-types';
import { randomUUID } from 'crypto';
import { AnalyzeIncidentDto, CreateIncidentDto, ResolveIncidentDto } from './dto/incidents.dto';
import { generateIncidentSignature, IncidentStateMachine } from './incident-state-machine.service';

@Injectable()
export class IncidentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private queue: QueueService,
    private events: EventsService,
    private ws: WebsocketGateway,
    private stateMachine: IncidentStateMachine,
    @Inject(forwardRef(() => AiOrchestratorService))
    private aiOrchestrator: AiOrchestratorService,
  ) {}

  async create(userId: string, dto: CreateIncidentDto) {
    const cluster = await this.prisma.cluster.findFirst({
      where: { id: dto.clusterId, deletedAt: null },
    });
    if (!cluster) throw new NotFoundException('Cluster not found');

    const signature = generateIncidentSignature(dto);

    const incident = await this.prisma.incident.create({
      data: {
        clusterId: dto.clusterId,
        title: dto.title,
        description: dto.description,
        resourceType: dto.resourceType,
        resourceName: dto.resourceName,
        namespace: dto.namespace,
        signature,
        createdById: userId,
        status: IncidentStatus.CREATED,
      },
      include: { cluster: true, createdBy: { select: { id: true, email: true } } },
    });

    await this.audit.log({
      userId,
      action: AuditAction.INCIDENT_CREATED,
      resource: 'incident',
      resourceId: incident.id,
    });

    const event = {
      id: randomUUID(),
      type: 'incident.created' as const,
      version: 1 as const,
      timestamp: new Date().toISOString(),
      payload: {
        incidentId: incident.id,
        clusterId: incident.clusterId,
        title: incident.title,
        createdById: userId,
      },
    };

    await this.events.publish(EVENT_SUBJECTS.INCIDENT_CREATED, event);
    this.ws.emitToIncident(incident.id, 'incident.created', incident);
    await this.queue.enqueueEnrichIncident({ incidentId: incident.id });

    return incident;
  }

  async findAll(status?: IncidentStatus) {
    return this.prisma.incident.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      include: {
        cluster: { select: { id: true, name: true } },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const incident = await this.prisma.incident.findFirst({
      where: { id, deletedAt: null },
      include: {
        cluster: { select: { id: true, name: true } },
        analyses: { orderBy: { createdAt: 'desc' } },
        createdBy: { select: { id: true, email: true } },
      },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  async analyze(id: string, userId: string, dto: AnalyzeIncidentDto) {
    const incident = await this.findOne(id);
    if (!this.stateMachine.canAnalyze(incident.status)) {
      throw new BadRequestException(`Cannot analyze incident in status ${incident.status}`);
    }

    this.stateMachine.transition(incident.status, IncidentStatus.ANALYZING);

    const updated = await this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.ANALYZING },
    });

    this.ws.emitToIncident(id, 'incident.updated', updated);

    if (dto.sync) {
      const analysis = await this.aiOrchestrator.analyzeIncident(id, dto.provider);
      return analysis;
    }

    await this.queue.enqueueAnalyzeIncident({ incidentId: id, userId });
    return { message: 'Analysis queued', incidentId: id };
  }

  async resolve(id: string, userId: string, dto: ResolveIncidentDto) {
    const incident = await this.findOne(id);
    if (!this.stateMachine.canResolve(incident.status)) {
      throw new BadRequestException('Incident already resolved');
    }

    this.stateMachine.transition(incident.status, IncidentStatus.RESOLVED);

    const updated = await this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.RESOLVED, resolvedAt: new Date() },
    });

    const latestAnalysis = incident.analyses[0];
    if (incident.signature && latestAnalysis) {
      await this.upsertPattern(
        incident.signature,
        latestAnalysis.rootCause,
        latestAnalysis.confidence,
      );
    }

    await this.audit.log({
      userId,
      action: AuditAction.INCIDENT_RESOLVED,
      resource: 'incident',
      resourceId: id,
      metadata: { resolution: dto.resolution },
    });

    await this.events.publish(EVENT_SUBJECTS.INCIDENT_RESOLVED, {
      id: randomUUID(),
      type: 'incident.resolved',
      version: 1,
      timestamp: new Date().toISOString(),
      payload: { incidentId: id, resolvedById: userId },
    });

    this.ws.emitToIncident(id, 'incident.updated', updated);
    return updated;
  }

  async markEnriched(id: string) {
    const incident = await this.findOne(id);
    this.stateMachine.transition(incident.status, IncidentStatus.ENRICHING);
    return this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.ENRICHING },
    });
  }

  async markAnalyzed(id: string, analysisId: string) {
    const updated = await this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.ANALYZED },
    });
    this.ws.emitToIncident(id, 'incident.analyzed', updated);
    this.ws.emitToIncident(id, 'analysis.completed', { incidentId: id, analysisId });
    return updated;
  }

  private async upsertPattern(signature: string, rootCause: string, confidence: number) {
    const existing = await this.prisma.incidentPattern.findUnique({ where: { signature } });
    if (existing) {
      const frequency = existing.frequency + 1;
      const avgConfidence = (existing.avgConfidence * existing.frequency + confidence) / frequency;
      await this.prisma.incidentPattern.update({
        where: { signature },
        data: { frequency, avgConfidence, rootCause, lastSeenAt: new Date() },
      });
    } else {
      await this.prisma.incidentPattern.create({
        data: { signature, rootCause, frequency: 1, avgConfidence: confidence },
      });
    }
  }
}
