import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Evidence, Finding, FindingOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import {
  EvidenceInput,
  FindingInput,
  contentHash,
  validateEvidence,
  validateFinding,
} from './domain/evidence-rules';
import { EvidenceTooComplexError, redactValue } from './domain/redaction';

export interface AddEvidenceResult {
  evidence: Evidence;
  /** False when the same observation was already stored (same source, id, version and content). */
  created: boolean;
}

export type FindingWithEvidence = Finding & { evidenceIds: string[] };

/**
 * Stores what the collectors observe, and the findings drawn from it, for one request.
 * Writes are only possible while the request is in `Collecting`: later states see a frozen
 * record. There is deliberately no HTTP write path; collectors call this service in-process.
 */
@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: ServiceRequestsService,
  ) {}

  async addEvidence(requestId: string, input: EvidenceInput): Promise<AddEvidenceResult> {
    await this.requests.get(requestId); // 404 before doing any work

    const problems = validateEvidence(input, new Date());
    if (Object.keys(problems).length > 0) {
      throw new BadRequestException({
        code: 'INVALID_EVIDENCE',
        message: 'The evidence is not valid',
        problems,
      });
    }

    let redacted: { value: unknown; redactions: number };
    try {
      redacted = redactValue(input.content);
    } catch (error) {
      if (error instanceof EvidenceTooComplexError) {
        throw new BadRequestException({
          code: 'INVALID_EVIDENCE',
          message: 'The evidence is not valid',
          problems: { content: error.message },
        });
      }
      throw error;
    }
    const hash = contentHash(redacted.value);

    return this.prisma.$transaction(async (tx) => {
      await this.lockCollecting(tx, requestId);
      const key = {
        requestId,
        source: input.source,
        sourceId: input.sourceId,
        sourceVersion: input.sourceVersion,
        contentHash: hash,
      };
      const existing = await tx.evidence.findUnique({
        where: { requestId_source_sourceId_sourceVersion_contentHash: key },
      });
      if (existing) return { evidence: existing, created: false };

      const evidence = await tx.evidence.create({
        data: {
          ...key,
          kind: input.kind,
          collectedAt: input.collectedAt,
          content: redacted.value as Prisma.InputJsonValue,
          redactions: redacted.redactions,
        },
      });
      return { evidence, created: true };
    });
  }

  async addFinding(requestId: string, input: FindingInput): Promise<FindingWithEvidence> {
    await this.requests.get(requestId);

    const problems = validateFinding(input);
    if (Object.keys(problems).length > 0) {
      throw new BadRequestException({
        code: 'INVALID_FINDING',
        message: 'The finding is not valid',
        problems,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockCollecting(tx, requestId);

      // Every cited item must belong to this request: a finding cannot lean on another
      // request's evidence.
      const found = await tx.evidence.count({
        where: { requestId, id: { in: input.evidenceIds } },
      });
      if (found !== input.evidenceIds.length) {
        throw new BadRequestException({
          code: 'INVALID_FINDING',
          message: 'The finding is not valid',
          problems: { evidenceIds: 'every id must be evidence of this request' },
        });
      }

      const finding = await tx.finding.create({
        data: {
          requestId,
          code: input.code,
          outcome: input.outcome as FindingOutcome,
          summary: input.summary.trim(),
          evidence: { create: input.evidenceIds.map((evidenceId) => ({ evidenceId })) },
        },
      });
      return { ...finding, evidenceIds: [...input.evidenceIds] };
    });
  }

  async listEvidence(requestId: string): Promise<Evidence[]> {
    await this.requests.get(requestId);
    return this.prisma.evidence.findMany({
      where: { requestId },
      orderBy: [{ collectedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async listFindings(requestId: string): Promise<FindingWithEvidence[]> {
    await this.requests.get(requestId);
    const rows = await this.prisma.finding.findMany({
      where: { requestId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { evidence: { select: { evidenceId: true } } },
    });
    return rows.map(({ evidence, ...finding }) => ({
      ...finding,
      evidenceIds: evidence.map((link) => link.evidenceId).sort(),
    }));
  }

  /**
   * Takes a shared row lock on the request and checks its status inside the same transaction.
   * A concurrent transition has to wait for this transaction, so evidence can never be added
   * after the request has left Collecting.
   */
  private async lockCollecting(tx: Prisma.TransactionClient, requestId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text AS "status" FROM "ServiceRequest" WHERE "id" = ${requestId} FOR SHARE`;
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });
    }
    if (rows[0].status !== 'Collecting') {
      throw new ConflictException({
        code: 'NOT_COLLECTING',
        message: `Evidence can only be added while the request is Collecting (now ${rows[0].status})`,
      });
    }
  }
}
