import { z } from 'zod';

export const incidentContextSchema = z.object({
  incidentId: z.string(),
  clusterId: z.string(),
  clusterName: z.string(),
  title: z.string(),
  description: z.string().optional(),
  resourceType: z.string().optional(),
  resourceName: z.string().optional(),
  namespace: z.string().optional(),
  pods: z.array(z.record(z.unknown())).default([]),
  events: z.array(z.object({
    type: z.string(),
    reason: z.string(),
    message: z.string(),
    score: z.number(),
    timestamp: z.string().optional(),
  })).default([]),
  logs: z.array(z.object({
    level: z.string(),
    message: z.string(),
    count: z.number().optional(),
  })).default([]),
  deployments: z.array(z.record(z.unknown())).default([]),
  metrics: z.array(z.record(z.unknown())).default([]),
  topEventScore: z.number().default(0),
  patternMatches: z.array(z.object({
    signature: z.string(),
    rootCause: z.string(),
    frequency: z.number(),
  })).default([]),
  collectedAt: z.string(),
});

export type IncidentContext = z.infer<typeof incidentContextSchema>;
