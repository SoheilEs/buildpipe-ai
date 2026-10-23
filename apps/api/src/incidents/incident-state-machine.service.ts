import { BadRequestException, Injectable } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import { createHash } from 'crypto';

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.CREATED]: [IncidentStatus.ENRICHING, IncidentStatus.RESOLVED],
  [IncidentStatus.ENRICHING]: [IncidentStatus.ANALYZING, IncidentStatus.RESOLVED],
  [IncidentStatus.ANALYZING]: [IncidentStatus.ANALYZED, IncidentStatus.RESOLVED],
  [IncidentStatus.ANALYZED]: [IncidentStatus.RESOLVED, IncidentStatus.ANALYZING],
  [IncidentStatus.RESOLVED]: [],
};

@Injectable()
export class IncidentStateMachine {
  transition(current: IncidentStatus, next: IncidentStatus): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Cannot transition from ${current} to ${next}`);
    }
  }

  canAnalyze(status: IncidentStatus): boolean {
    const analyzable: IncidentStatus[] = [
      IncidentStatus.CREATED,
      IncidentStatus.ANALYZED,
      IncidentStatus.ENRICHING,
    ];
    return analyzable.includes(status);
  }

  canResolve(status: IncidentStatus): boolean {
    return status !== IncidentStatus.RESOLVED;
  }
}

export function generateIncidentSignature(input: {
  resourceType?: string | null;
  resourceName?: string | null;
  namespace?: string | null;
  topReasons?: string[];
}): string {
  const payload = [
    input.resourceType ?? 'unknown',
    input.resourceName ?? 'unknown',
    input.namespace ?? 'default',
    ...(input.topReasons ?? []).slice(0, 5).sort(),
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
