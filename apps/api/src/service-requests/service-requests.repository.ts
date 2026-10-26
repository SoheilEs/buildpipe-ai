import { RequestState } from './domain/request-state';

export interface ServiceRequestRecord {
  id: string;
  kind: string;
  status: RequestState;
  requesterId: string;
  idempotencyKey: string | null;
  /** Optimistic lock: incremented by every transition. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransitionRecord {
  id: string;
  requestId: string;
  /** Null only for the creation row. */
  fromStatus: RequestState | null;
  toStatus: RequestState;
  actorId: string;
  reason: string | null;
  createdAt: Date;
}

export interface CreateRequestInput {
  kind: string;
  requesterId: string;
  idempotencyKey?: string;
}

export interface ApplyTransitionInput {
  id: string;
  /** The version the caller validated the transition against. */
  expectedVersion: number;
  from: RequestState;
  to: RequestState;
  actorId: string;
  reason?: string;
}

/**
 * Storage port for the service-request module. An abstract class so Nest can use it as the
 * injection token; the domain and the service never see Prisma.
 */
export abstract class ServiceRequestRepository {
  /**
   * Creates the request and its creation history row together. With an idempotency key, a second
   * call from the same requester returns the existing request with `created: false`.
   */
  abstract create(
    input: CreateRequestInput,
  ): Promise<{ record: ServiceRequestRecord; created: boolean }>;

  abstract findById(id: string): Promise<ServiceRequestRecord | null>;

  /**
   * Applies one transition and appends its history row in a single atomic step. Returns null,
   * changing nothing, when the request is no longer at `expectedVersion` and `from`.
   */
  abstract applyTransition(input: ApplyTransitionInput): Promise<ServiceRequestRecord | null>;

  /** History in the order the transitions happened. */
  abstract listTransitions(requestId: string): Promise<TransitionRecord[]>;
}
