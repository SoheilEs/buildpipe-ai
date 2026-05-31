import { z } from 'zod';

const baseEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  version: z.literal(1),
  timestamp: z.string().datetime(),
});

export const incidentCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('incident.created'),
  payload: z.object({
    incidentId: z.string(),
    clusterId: z.string(),
    title: z.string(),
    createdById: z.string(),
  }),
});

export const incidentAnalyzedEventSchema = baseEventSchema.extend({
  type: z.literal('incident.analyzed'),
  payload: z.object({
    incidentId: z.string(),
    analysisId: z.string(),
    confidence: z.number(),
    rootCause: z.string(),
  }),
});

export const incidentResolvedEventSchema = baseEventSchema.extend({
  type: z.literal('incident.resolved'),
  payload: z.object({
    incidentId: z.string(),
    resolvedById: z.string(),
  }),
});

export const podCrashedEventSchema = baseEventSchema.extend({
  type: z.literal('pod.crashed'),
  payload: z.object({
    clusterId: z.string(),
    namespace: z.string(),
    podName: z.string(),
    reason: z.string(),
  }),
});

export const deploymentRestartedEventSchema = baseEventSchema.extend({
  type: z.literal('deployment.restarted'),
  payload: z.object({
    clusterId: z.string(),
    namespace: z.string(),
    deploymentName: z.string(),
    userId: z.string(),
  }),
});

export const clusterConnectedEventSchema = baseEventSchema.extend({
  type: z.literal('cluster.connected'),
  payload: z.object({
    clusterId: z.string(),
    clusterName: z.string(),
  }),
});

export const domainEventSchema = z.discriminatedUnion('type', [
  incidentCreatedEventSchema,
  incidentAnalyzedEventSchema,
  incidentResolvedEventSchema,
  podCrashedEventSchema,
  deploymentRestartedEventSchema,
  clusterConnectedEventSchema,
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type IncidentCreatedEvent = z.infer<typeof incidentCreatedEventSchema>;
export type IncidentAnalyzedEvent = z.infer<typeof incidentAnalyzedEventSchema>;
export type IncidentResolvedEvent = z.infer<typeof incidentResolvedEventSchema>;
export type PodCrashedEvent = z.infer<typeof podCrashedEventSchema>;
export type DeploymentRestartedEvent = z.infer<typeof deploymentRestartedEventSchema>;
export type ClusterConnectedEvent = z.infer<typeof clusterConnectedEventSchema>;

export const EVENT_SUBJECTS = {
  INCIDENT_CREATED: 'incident.created.v1',
  INCIDENT_ANALYZED: 'incident.analyzed.v1',
  INCIDENT_RESOLVED: 'incident.resolved.v1',
  POD_CRASHED: 'pod.crashed.v1',
  DEPLOYMENT_RESTARTED: 'deployment.restarted.v1',
  CLUSTER_CONNECTED: 'cluster.connected.v1',
} as const;
