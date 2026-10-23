import { Injectable } from '@nestjs/common';
import { IncidentContext, AiAnalysisOutput } from '@buildpipe/shared-types';

@Injectable()
export class AiEngineService {
  analyzeContext(context: IncidentContext): AiAnalysisOutput {
    const hasEvents = context.events.length > 0;
    const hasLogs = context.logs.length > 0;

    if (!hasEvents && !hasLogs) {
      return {
        rootCause: 'Insufficient infrastructure context for analysis',
        confidence: 0.2,
        evidence: ['No events or logs collected from cluster'],
        recommendations: ['Verify cluster connectivity and resource identifiers'],
        riskLevel: 'low',
      };
    }

    const topEvent = context.events[0];
    return {
      rootCause: topEvent
        ? `Likely related to ${topEvent.reason}: ${topEvent.message.slice(0, 200)}`
        : 'Error patterns detected in logs',
      confidence: Math.min(context.topEventScore || 0.5, 0.85),
      evidence: [
        ...context.events.slice(0, 3).map((e) => `[${e.reason}] ${e.message}`),
        ...context.logs
          .filter((l) => l.level === 'error')
          .slice(0, 3)
          .map((l) => l.message),
      ],
      recommendations: [
        'Review pod events and container restart counts',
        'Check resource limits and node capacity',
        'Inspect recent deployment changes',
      ],
      riskLevel: (context.topEventScore ?? 0) > 0.8 ? 'high' : 'medium',
    };
  }
}
