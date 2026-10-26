import {
  MAX_REASON_LENGTH,
  REQUEST_STATES,
  RequestState,
  TERMINAL_STATES,
  allowedTransitions,
  checkTransition,
  isRequestState,
  requiresReason,
} from './request-state';

// Written out independently of the implementation table: this is ADR-0001, pair by pair.
const ALLOWED: ReadonlyArray<readonly [RequestState, RequestState]> = [
  ['Requested', 'Collecting'],
  ['Requested', 'Cancelled'],
  ['Collecting', 'NeedsReview'],
  ['Collecting', 'ProposalReady'],
  ['Collecting', 'Failed'],
  ['Collecting', 'Cancelled'],
  ['NeedsReview', 'Collecting'],
  ['NeedsReview', 'Rejected'],
  ['NeedsReview', 'Cancelled'],
  ['ProposalReady', 'AwaitingApproval'],
  ['ProposalReady', 'Cancelled'],
  ['AwaitingApproval', 'Approved'],
  ['AwaitingApproval', 'Rejected'],
  ['AwaitingApproval', 'Cancelled'],
  ['AwaitingApproval', 'ProposalReady'],
  ['Approved', 'Testing'],
  ['Approved', 'ProposalReady'],
  ['Approved', 'Cancelled'],
  ['Testing', 'Verified'],
  ['Testing', 'Failed'],
];

const isAllowed = (from: RequestState, to: RequestState) =>
  ALLOWED.some(([a, b]) => a === from && b === to);

const ctx = (over: Partial<{ actorId: string; requesterId: string; reason: string }> = {}) => ({
  actorId: 'approver-1',
  requesterId: 'requester-1',
  reason: 'because',
  ...over,
});

describe('request state machine (ADR-0001)', () => {
  it('has the eleven states of the ADR', () => {
    expect([...REQUEST_STATES].sort()).toEqual(
      [
        'Requested',
        'Collecting',
        'NeedsReview',
        'ProposalReady',
        'AwaitingApproval',
        'Approved',
        'Testing',
        'Verified',
        'Failed',
        'Rejected',
        'Cancelled',
      ].sort(),
    );
  });

  describe('every ordered pair of states', () => {
    const pairs = REQUEST_STATES.flatMap((from) => REQUEST_STATES.map((to) => [from, to] as const));

    it.each(pairs)('%s -> %s matches the ADR', (from, to) => {
      const result = checkTransition(from, to, ctx());
      if (isAllowed(from, to)) {
        expect(result).toEqual({ ok: true });
      } else {
        expect(result.ok).toBe(false);
      }
    });

    it('covers all 121 pairs and 20 allowed ones', () => {
      expect(pairs).toHaveLength(121);
      expect(pairs.filter(([a, b]) => isAllowed(a, b))).toHaveLength(20);
    });
  });

  it('exposes the same allowed set through allowedTransitions', () => {
    for (const from of REQUEST_STATES) {
      const expected = ALLOWED.filter(([a]) => a === from).map(([, b]) => b);
      expect([...allowedTransitions(from)].sort()).toEqual([...expected].sort());
    }
  });

  describe('failure codes', () => {
    it('rejects a self transition as invalid', () => {
      expect(checkTransition('Collecting', 'Collecting', ctx())).toMatchObject({
        ok: false,
        code: 'INVALID_TRANSITION',
      });
    });

    it.each(['Verified', 'Failed', 'Rejected', 'Cancelled'] as const)(
      'treats %s as final, whatever the target',
      (from) => {
        for (const to of REQUEST_STATES) {
          expect(checkTransition(from, to, ctx())).toMatchObject({
            ok: false,
            code: 'TERMINAL_STATE',
          });
        }
      },
    );

    it('lists exactly the four final states', () => {
      expect([...TERMINAL_STATES].sort()).toEqual(['Cancelled', 'Failed', 'Rejected', 'Verified']);
    });

    it('cannot skip steps (Requested -> Approved, Collecting -> Testing)', () => {
      expect(checkTransition('Requested', 'Approved', ctx())).toMatchObject({
        code: 'INVALID_TRANSITION',
      });
      expect(checkTransition('Collecting', 'Testing', ctx())).toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    });

    it('cannot cancel while testing: an execution is aborted, then the request fails', () => {
      expect(checkTransition('Testing', 'Cancelled', ctx())).toMatchObject({
        code: 'INVALID_TRANSITION',
      });
    });

    it.each([undefined, null, 42, '', 'requested', 'Unknown'])(
      'reports UNKNOWN_STATE for %p',
      (value) => {
        expect(checkTransition(value, 'Collecting', ctx())).toMatchObject({
          ok: false,
          code: 'UNKNOWN_STATE',
        });
        expect(checkTransition('Requested', value, ctx())).toMatchObject({
          ok: false,
          code: 'UNKNOWN_STATE',
        });
      },
    );

    it('isRequestState narrows only real states', () => {
      expect(isRequestState('Approved')).toBe(true);
      expect(isRequestState('approved')).toBe(false);
      expect(isRequestState(null)).toBe(false);
    });
  });

  describe('actor', () => {
    it.each(['', '   '])('requires an actor (%p)', (actorId) => {
      expect(checkTransition('Requested', 'Collecting', ctx({ actorId }))).toMatchObject({
        ok: false,
        code: 'ACTOR_REQUIRED',
      });
    });
  });

  describe('reasons', () => {
    const reasonRequired: ReadonlyArray<readonly [RequestState, RequestState]> = [
      ['Collecting', 'NeedsReview'],
      ['Collecting', 'Failed'],
      ['NeedsReview', 'Rejected'],
      ['AwaitingApproval', 'Rejected'],
      ['Requested', 'Cancelled'],
      ['Approved', 'Cancelled'],
      ['Testing', 'Failed'],
      // invalidation of a pending or given approval
      ['AwaitingApproval', 'ProposalReady'],
      ['Approved', 'ProposalReady'],
    ];

    it.each(reasonRequired)('%s -> %s requires a reason', (from, to) => {
      expect(requiresReason(from, to)).toBe(true);
      expect(checkTransition(from, to, ctx({ reason: undefined }))).toMatchObject({
        ok: false,
        code: 'REASON_REQUIRED',
      });
      expect(checkTransition(from, to, ctx({ reason: '   ' }))).toMatchObject({
        code: 'REASON_REQUIRED',
      });
      expect(checkTransition(from, to, ctx({ reason: 'a real reason' }))).toEqual({ ok: true });
    });

    it.each([
      ['Requested', 'Collecting'],
      ['Collecting', 'ProposalReady'],
      ['NeedsReview', 'Collecting'],
      ['ProposalReady', 'AwaitingApproval'],
      ['AwaitingApproval', 'Approved'],
      ['Approved', 'Testing'],
      ['Testing', 'Verified'],
    ] as const)('%s -> %s does not need a reason', (from, to) => {
      expect(requiresReason(from, to)).toBe(false);
      expect(checkTransition(from, to, ctx({ reason: undefined }))).toEqual({ ok: true });
    });

    it('rejects a reason longer than the limit', () => {
      const tooLong = 'x'.repeat(MAX_REASON_LENGTH + 1);
      expect(checkTransition('Collecting', 'Failed', ctx({ reason: tooLong }))).toMatchObject({
        code: 'REASON_TOO_LONG',
      });
      expect(
        checkTransition('Collecting', 'Failed', ctx({ reason: 'x'.repeat(MAX_REASON_LENGTH) })),
      ).toEqual({ ok: true });
    });
  });

  describe('separation of duties', () => {
    it.each(['Approved', 'Rejected'] as const)(
      'the requester cannot move their own request to %s',
      (to) => {
        expect(
          checkTransition('AwaitingApproval', to, ctx({ actorId: 'requester-1' })),
        ).toMatchObject({ ok: false, code: 'SELF_APPROVAL' });
      },
    );

    it('another person can approve', () => {
      expect(
        checkTransition('AwaitingApproval', 'Approved', ctx({ actorId: 'someone-else' })),
      ).toEqual({ ok: true });
    });

    it('the requester can still cancel or invalidate their own request', () => {
      expect(
        checkTransition('AwaitingApproval', 'Cancelled', ctx({ actorId: 'requester-1' })),
      ).toEqual({ ok: true });
      expect(
        checkTransition('AwaitingApproval', 'ProposalReady', ctx({ actorId: 'requester-1' })),
      ).toEqual({ ok: true });
    });

    it('the system actor can run the non-approval steps', () => {
      expect(checkTransition('Requested', 'Collecting', ctx({ actorId: 'system' }))).toEqual({
        ok: true,
      });
    });
  });

  it('walks the whole happy path', () => {
    const path: RequestState[] = [
      'Requested',
      'Collecting',
      'ProposalReady',
      'AwaitingApproval',
      'Approved',
      'Testing',
      'Verified',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(checkTransition(path[i], path[i + 1], ctx())).toEqual({ ok: true });
    }
  });
});
