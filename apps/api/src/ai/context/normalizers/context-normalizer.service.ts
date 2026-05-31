import { Injectable } from '@nestjs/common';
import { IncidentContext } from '@buildpipe/shared-types';

@Injectable()
export class ContextNormalizerService {
  normalize(context: IncidentContext): IncidentContext {
    return {
      ...context,
      title: context.title.trim().slice(0, 500),
      description: context.description?.trim().slice(0, 2000),
      pods: context.pods.slice(0, 50),
      events: context.events.slice(0, 100),
      logs: context.logs.slice(0, 200),
      deployments: context.deployments.slice(0, 20),
      metrics: context.metrics.slice(0, 50),
    };
  }
}
