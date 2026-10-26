import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestState, TransitionFailureCode, checkTransition } from './domain/request-state';
import {
  ServiceRequestRecord,
  ServiceRequestRepository,
  TransitionRecord,
} from './service-requests.repository';

export interface CreateServiceRequestInput {
  kind: string;
  requesterId: string;
  idempotencyKey?: string;
}

export interface TransitionInput {
  /** A user id, or `system` for the worker. Never taken from a request body: callers set it. */
  actorId: string;
  reason?: string;
}

const MAX_KIND_LENGTH = 100;
const MAX_KEY_LENGTH = 200;

/**
 * Persists the request lifecycle. The rules live in the pure domain module; this class loads the
 * request, asks the domain whether the move is allowed, and writes the move and its history row
 * atomically. Authorization (who may call what) belongs to the controllers that will use it.
 */
@Injectable()
export class ServiceRequestsService {
  constructor(private readonly repository: ServiceRequestRepository) {}

  async create(
    input: CreateServiceRequestInput,
  ): Promise<{ request: ServiceRequestRecord; created: boolean }> {
    const kind = input.kind?.trim() ?? '';
    if (kind === '' || kind.length > MAX_KIND_LENGTH) {
      throw new BadRequestException({ code: 'INVALID_KIND', message: 'kind is required' });
    }
    if (!input.requesterId) {
      throw new BadRequestException({ code: 'ACTOR_REQUIRED', message: 'requesterId is required' });
    }
    if (input.idempotencyKey !== undefined) {
      const key = input.idempotencyKey.trim();
      if (key === '' || key.length > MAX_KEY_LENGTH) {
        throw new BadRequestException({
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: `idempotencyKey must be 1 to ${MAX_KEY_LENGTH} characters`,
        });
      }
    }

    const { record, created } = await this.repository.create({
      kind,
      requesterId: input.requesterId,
      idempotencyKey: input.idempotencyKey?.trim(),
    });
    return { request: record, created };
  }

  async get(id: string): Promise<ServiceRequestRecord> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });
    return record;
  }

  history(requestId: string): Promise<TransitionRecord[]> {
    return this.repository.listTransitions(requestId);
  }

  async transition(
    id: string,
    to: RequestState,
    input: TransitionInput,
  ): Promise<ServiceRequestRecord> {
    const current = await this.get(id);
    const reason = input.reason?.trim();

    const check = checkTransition(current.status, to, {
      actorId: input.actorId,
      requesterId: current.requesterId,
      reason,
    });
    if (!check.ok) this.throwFor(check.code, check.message);

    const updated = await this.repository.applyTransition({
      id,
      expectedVersion: current.version,
      from: current.status,
      to,
      actorId: input.actorId,
      reason: reason === '' ? undefined : reason,
    });

    if (!updated) {
      // Someone else moved the request between our read and our write. Nothing was changed, and
      // we do not retry: the caller must look at the new state and decide again.
      throw new ConflictException({
        code: 'CONCURRENT_MODIFICATION',
        message: 'The request changed while this transition was being applied; reload and retry',
      });
    }
    return updated;
  }

  private throwFor(code: TransitionFailureCode, message: string): never {
    const body = { code, message };
    switch (code) {
      case 'TERMINAL_STATE':
      case 'INVALID_TRANSITION':
        throw new ConflictException(body);
      case 'SELF_APPROVAL':
        throw new ForbiddenException(body);
      default:
        throw new BadRequestException(body);
    }
  }
}
