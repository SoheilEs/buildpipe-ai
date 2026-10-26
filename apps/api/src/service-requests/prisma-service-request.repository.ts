import { Injectable } from '@nestjs/common';
import { Prisma, ServiceRequest, ServiceRequestTransition } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestState } from './domain/request-state';
import {
  ApplyTransitionInput,
  CreateRequestInput,
  ListRequestsFilter,
  UnknownServiceError,
  ServiceRequestRecord,
  ServiceRequestRepository,
  TransitionRecord,
} from './service-requests.repository';

const toRecord = (row: ServiceRequest): ServiceRequestRecord => ({
  id: row.id,
  kind: row.kind,
  serviceId: row.serviceId,
  status: row.status as RequestState,
  requesterId: row.requesterId,
  idempotencyKey: row.idempotencyKey,
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toTransition = (row: ServiceRequestTransition): TransitionRecord => ({
  id: row.id,
  requestId: row.requestId,
  fromStatus: row.fromStatus as RequestState | null,
  toStatus: row.toStatus as RequestState,
  actorId: row.actorId,
  reason: row.reason,
  createdAt: row.createdAt,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class PrismaServiceRequestRepository extends ServiceRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    input: CreateRequestInput,
  ): Promise<{ record: ServiceRequestRecord; created: boolean }> {
    const key = input.idempotencyKey ?? null;

    if (key !== null) {
      const existing = await this.findByKey(input.requesterId, key);
      if (existing) return { record: existing, created: false };
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const request = await tx.serviceRequest.create({
          data: {
            kind: input.kind,
            serviceId: input.serviceId,
            requesterId: input.requesterId,
            idempotencyKey: key,
          },
        });
        await tx.serviceRequestTransition.create({
          data: {
            requestId: request.id,
            fromStatus: null,
            toStatus: 'Requested',
            actorId: input.requesterId,
          },
        });
        return request;
      });
      return { record: toRecord(row), created: true };
    } catch (error) {
      // Two calls with the same key raced past the lookup; the unique index let one win.
      if (key !== null && isUniqueViolation(error)) {
        const existing = await this.findByKey(input.requesterId, key);
        if (existing) return { record: existing, created: false };
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003' &&
        `${String(error.meta?.constraint ?? '')} ${String(error.meta?.field_name ?? '')}`.includes(
          'serviceId',
        )
      ) {
        throw new UnknownServiceError(input.serviceId);
      }
      throw error;
    }
  }

  async list(filter: ListRequestsFilter): Promise<ServiceRequestRecord[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      where: {
        status: filter.status,
        requesterId: filter.requesterId,
        serviceId: filter.serviceId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: filter.limit,
      skip: filter.offset,
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ServiceRequestRecord | null> {
    const row = await this.prisma.serviceRequest.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async applyTransition(input: ApplyTransitionInput): Promise<ServiceRequestRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-set on version and status: a concurrent writer makes this match nothing.
      const updated = await tx.serviceRequest.updateMany({
        where: { id: input.id, version: input.expectedVersion, status: input.from },
        data: { status: input.to, version: { increment: 1 } },
      });
      if (updated.count === 0) return null;

      await tx.serviceRequestTransition.create({
        data: {
          requestId: input.id,
          fromStatus: input.from,
          toStatus: input.to,
          actorId: input.actorId,
          reason: input.reason ?? null,
        },
      });
      const row = await tx.serviceRequest.findUniqueOrThrow({ where: { id: input.id } });
      return toRecord(row);
    });
  }

  async listTransitions(requestId: string): Promise<TransitionRecord[]> {
    const rows = await this.prisma.serviceRequestTransition.findMany({
      where: { requestId },
      orderBy: { seq: 'asc' },
    });
    return rows.map(toTransition);
  }

  private async findByKey(
    requesterId: string,
    idempotencyKey: string,
  ): Promise<ServiceRequestRecord | null> {
    const row = await this.prisma.serviceRequest.findUnique({
      where: { requesterId_idempotencyKey: { requesterId, idempotencyKey } },
    });
    return row ? toRecord(row) : null;
  }
}
