import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RequestState } from './domain/request-state';
import {
  ApplyTransitionInput,
  CreateRequestInput,
  ServiceRequestRecord,
  ServiceRequestRepository,
  TransitionRecord,
} from './service-requests.repository';
import { ServiceRequestsService } from './service-requests.service';

/** In-memory stand-in for the Prisma repository, with the same compare-and-set contract. */
class InMemoryRepository extends ServiceRequestRepository {
  readonly requests = new Map<string, ServiceRequestRecord>();
  readonly history: TransitionRecord[] = [];
  /** Runs once, right before the next applyTransition, to simulate a concurrent writer. */
  beforeApply?: () => void;
  private counter = 0;

  create(input: CreateRequestInput) {
    if (input.idempotencyKey !== undefined) {
      const existing = [...this.requests.values()].find(
        (r) => r.requesterId === input.requesterId && r.idempotencyKey === input.idempotencyKey,
      );
      if (existing) return Promise.resolve({ record: existing, created: false });
    }
    const now = new Date();
    const record: ServiceRequestRecord = {
      id: `req-${++this.counter}`,
      kind: input.kind,
      status: 'Requested',
      requesterId: input.requesterId,
      idempotencyKey: input.idempotencyKey ?? null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(record.id, record);
    this.push(record.id, null, 'Requested', input.requesterId, null);
    return Promise.resolve({ record, created: true });
  }

  findById(id: string) {
    const record = this.requests.get(id);
    return Promise.resolve(record ? { ...record } : null);
  }

  applyTransition(input: ApplyTransitionInput) {
    if (this.beforeApply) {
      const hook = this.beforeApply;
      this.beforeApply = undefined;
      hook();
    }
    const current = this.requests.get(input.id);
    if (!current || current.version !== input.expectedVersion || current.status !== input.from) {
      return Promise.resolve(null);
    }
    const next = { ...current, status: input.to, version: current.version + 1 };
    this.requests.set(next.id, next);
    this.push(next.id, input.from, input.to, input.actorId, input.reason ?? null);
    return Promise.resolve({ ...next });
  }

  listTransitions(requestId: string) {
    return Promise.resolve(this.history.filter((h) => h.requestId === requestId));
  }

  private push(
    requestId: string,
    from: RequestState | null,
    to: RequestState,
    actorId: string,
    reason: string | null,
  ) {
    this.history.push({
      id: `h-${this.history.length + 1}`,
      requestId,
      fromStatus: from,
      toStatus: to,
      actorId,
      reason,
      createdAt: new Date(),
    });
  }
}

const REQUESTER = 'user-requester';
const APPROVER = 'user-approver';

async function setup() {
  const repo = new InMemoryRepository();
  const service = new ServiceRequestsService(repo);
  const { request } = await service.create({
    kind: 'nonroot-runtime-review',
    requesterId: REQUESTER,
  });
  return { repo, service, id: request.id };
}

describe('ServiceRequestsService', () => {
  describe('create', () => {
    it('starts in Requested at version 0 with a creation history row', async () => {
      const { repo, service, id } = await setup();
      const request = await service.get(id);
      expect(request).toMatchObject({ status: 'Requested', version: 0, requesterId: REQUESTER });
      expect(repo.history).toEqual([
        expect.objectContaining({
          requestId: id,
          fromStatus: null,
          toStatus: 'Requested',
          actorId: REQUESTER,
        }),
      ]);
    });

    it('returns the same request for the same requester and idempotency key', async () => {
      const repo = new InMemoryRepository();
      const service = new ServiceRequestsService(repo);
      const first = await service.create({
        kind: 'k',
        requesterId: REQUESTER,
        idempotencyKey: 'abc',
      });
      const second = await service.create({
        kind: 'k',
        requesterId: REQUESTER,
        idempotencyKey: 'abc',
      });
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.request.id).toBe(first.request.id);
      expect(repo.requests.size).toBe(1);
    });

    it('does not share a key between requesters', async () => {
      const repo = new InMemoryRepository();
      const service = new ServiceRequestsService(repo);
      const a = await service.create({ kind: 'k', requesterId: 'a', idempotencyKey: 'abc' });
      const b = await service.create({ kind: 'k', requesterId: 'b', idempotencyKey: 'abc' });
      expect(b.created).toBe(true);
      expect(b.request.id).not.toBe(a.request.id);
    });

    it('without a key every call creates a new request', async () => {
      const repo = new InMemoryRepository();
      const service = new ServiceRequestsService(repo);
      await service.create({ kind: 'k', requesterId: REQUESTER });
      await service.create({ kind: 'k', requesterId: REQUESTER });
      expect(repo.requests.size).toBe(2);
    });

    it.each([
      [{ kind: '', requesterId: REQUESTER }, 'INVALID_KIND'],
      [{ kind: '   ', requesterId: REQUESTER }, 'INVALID_KIND'],
      [{ kind: 'x'.repeat(101), requesterId: REQUESTER }, 'INVALID_KIND'],
      [{ kind: 'k', requesterId: '' }, 'ACTOR_REQUIRED'],
      [{ kind: 'k', requesterId: REQUESTER, idempotencyKey: '' }, 'INVALID_IDEMPOTENCY_KEY'],
      [
        { kind: 'k', requesterId: REQUESTER, idempotencyKey: 'x'.repeat(201) },
        'INVALID_IDEMPOTENCY_KEY',
      ],
    ])('rejects invalid input %#', async (input, code) => {
      const service = new ServiceRequestsService(new InMemoryRepository());
      await expect(service.create(input)).rejects.toMatchObject({
        response: expect.objectContaining({ code }),
      });
      await expect(service.create(input)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('get', () => {
    it('throws NotFound for an unknown id', async () => {
      const service = new ServiceRequestsService(new InMemoryRepository());
      await expect(service.get('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('transition', () => {
    it('applies an allowed move, bumps the version and appends history', async () => {
      const { repo, service, id } = await setup();
      const updated = await service.transition(id, 'Collecting', { actorId: 'system' });
      expect(updated).toMatchObject({ status: 'Collecting', version: 1 });
      expect(repo.history.at(-1)).toMatchObject({
        fromStatus: 'Requested',
        toStatus: 'Collecting',
        actorId: 'system',
        reason: null,
      });
    });

    it('stores the trimmed reason', async () => {
      const { repo, service, id } = await setup();
      await service.transition(id, 'Cancelled', { actorId: REQUESTER, reason: '  not needed  ' });
      expect(repo.history.at(-1)?.reason).toBe('not needed');
    });

    it('walks the happy path with the approver being a different person', async () => {
      const { repo, service, id } = await setup();
      await service.transition(id, 'Collecting', { actorId: 'system' });
      await service.transition(id, 'ProposalReady', { actorId: 'system' });
      await service.transition(id, 'AwaitingApproval', { actorId: REQUESTER });
      await service.transition(id, 'Approved', { actorId: APPROVER });
      await service.transition(id, 'Testing', { actorId: 'system' });
      const done = await service.transition(id, 'Verified', { actorId: 'system' });
      expect(done).toMatchObject({ status: 'Verified', version: 6 });
      expect(repo.history.map((h) => h.toStatus)).toEqual([
        'Requested',
        'Collecting',
        'ProposalReady',
        'AwaitingApproval',
        'Approved',
        'Testing',
        'Verified',
      ]);
    });

    it('answers 409 for an invalid move and changes nothing', async () => {
      const { repo, service, id } = await setup();
      await expect(
        service.transition(id, 'Approved', { actorId: APPROVER }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await service.get(id)).status).toBe('Requested');
      expect(repo.history).toHaveLength(1);
    });

    it('answers 409 for any move out of a final state', async () => {
      const { service, id } = await setup();
      await service.transition(id, 'Cancelled', { actorId: REQUESTER, reason: 'changed my mind' });
      await expect(
        service.transition(id, 'Collecting', { actorId: 'system' }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TERMINAL_STATE' }) });
    });

    it('answers 400 when a required reason is missing', async () => {
      const { repo, service, id } = await setup();
      await expect(
        service.transition(id, 'Cancelled', { actorId: REQUESTER }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REASON_REQUIRED' }) });
      expect(repo.history).toHaveLength(1);
    });

    it('answers 400 for an unknown target state', async () => {
      const { service, id } = await setup();
      await expect(
        service.transition(id, 'Bogus' as RequestState, { actorId: 'system' }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'UNKNOWN_STATE' }) });
    });

    it('answers 400 without an actor', async () => {
      const { service, id } = await setup();
      await expect(service.transition(id, 'Collecting', { actorId: '' })).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ACTOR_REQUIRED' }),
      });
    });

    it('answers 403 when the requester approves their own request', async () => {
      const { repo, service, id } = await setup();
      await service.transition(id, 'Collecting', { actorId: 'system' });
      await service.transition(id, 'ProposalReady', { actorId: 'system' });
      await service.transition(id, 'AwaitingApproval', { actorId: REQUESTER });
      await expect(
        service.transition(id, 'Approved', { actorId: REQUESTER }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((await service.get(id)).status).toBe('AwaitingApproval');
      expect(repo.history.at(-1)?.toStatus).toBe('AwaitingApproval');
    });

    it('answers 404 for an unknown request', async () => {
      const service = new ServiceRequestsService(new InMemoryRepository());
      await expect(
        service.transition('missing', 'Collecting', { actorId: 'system' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports a concurrent change as 409 and writes nothing for the loser', async () => {
      const { repo, service, id } = await setup();
      // Another worker moves the request after we read it and before we write.
      repo.beforeApply = () => {
        const row = repo.requests.get(id)!;
        repo.requests.set(id, { ...row, status: 'Cancelled', version: row.version + 1 });
      };
      await expect(
        service.transition(id, 'Collecting', { actorId: 'system' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CONCURRENT_MODIFICATION' }),
      });
      expect(repo.requests.get(id)?.status).toBe('Cancelled');
      expect(repo.history).toHaveLength(1);
    });

    it('a duplicate delivery of the same transition is rejected, not applied twice', async () => {
      const { repo, service, id } = await setup();
      await service.transition(id, 'Collecting', { actorId: 'system' });
      await expect(
        service.transition(id, 'Collecting', { actorId: 'system' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.history.filter((h) => h.toStatus === 'Collecting')).toHaveLength(1);
    });
  });

  describe('history', () => {
    it('returns the transitions in order', async () => {
      const { service, id } = await setup();
      await service.transition(id, 'Collecting', { actorId: 'system' });
      const history = await service.history(id);
      expect(history.map((h) => h.toStatus)).toEqual(['Requested', 'Collecting']);
    });
  });
});
