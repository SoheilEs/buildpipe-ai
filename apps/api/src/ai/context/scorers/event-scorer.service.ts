import { Injectable } from '@nestjs/common';
import { EventSummary } from '@buildpipe/kubernetes-sdk';

const EVENT_SCORES: Record<string, number> = {
  OOMKilled: 0.95,
  CrashLoopBackOff: 0.9,
  FailedScheduling: 0.85,
  ImagePullBackOff: 0.8,
  ErrImagePull: 0.8,
  BackOff: 0.75,
  Unhealthy: 0.7,
  FailedMount: 0.65,
  NodeNotReady: 0.6,
  Evicted: 0.55,
};

const DEFAULT_SCORE = 0.1;

@Injectable()
export class EventScorerService {
  score(event: EventSummary): number {
    for (const [reason, score] of Object.entries(EVENT_SCORES)) {
      if (event.reason.includes(reason) || event.message.includes(reason)) {
        return score;
      }
    }
    return event.type === 'Warning' ? 0.5 : DEFAULT_SCORE;
  }

  scoreAll(events: EventSummary[]): Array<EventSummary & { score: number }> {
    return events.map((e) => ({ ...e, score: this.score(e) })).sort((a, b) => b.score - a.score);
  }
}
