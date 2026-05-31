import { Injectable } from '@nestjs/common';
import { IncidentContext } from '@buildpipe/shared-types';
import { EventSummary, PodSummary } from '@buildpipe/kubernetes-sdk';

@Injectable()
export class ContextBuilderService {
  buildBaseContext(input: {
    incidentId: string;
    clusterId: string;
    clusterName: string;
    title: string;
    description?: string | null;
    resourceType?: string | null;
    resourceName?: string | null;
    namespace?: string | null;
  }): IncidentContext {
    return {
      ...input,
      description: input.description ?? undefined,
      resourceType: input.resourceType ?? undefined,
      resourceName: input.resourceName ?? undefined,
      namespace: input.namespace ?? undefined,
      pods: [],
      events: [],
      logs: [],
      deployments: [],
      metrics: [],
      topEventScore: 0,
      patternMatches: [],
      collectedAt: new Date().toISOString(),
    };
  }

  withPods(context: IncidentContext, pods: PodSummary[]): IncidentContext {
    return { ...context, pods: pods as unknown as Record<string, unknown>[] };
  }

  withEvents(
    context: IncidentContext,
    events: Array<EventSummary & { score: number }>,
  ): IncidentContext {
    const topEventScore = events.reduce((max, e) => Math.max(max, e.score), 0);
    return {
      ...context,
      events: events.map((e) => ({
        type: e.type,
        reason: e.reason,
        message: e.message,
        score: e.score,
        timestamp: e.timestamp,
      })),
      topEventScore,
    };
  }

  withLogs(context: IncidentContext, logs: Array<{ level: string; message: string; count?: number }>): IncidentContext {
    return { ...context, logs };
  }
}
