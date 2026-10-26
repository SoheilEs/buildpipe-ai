/**
 * Pure state machine for a service request (ADR-0001). No Nest, Prisma or HTTP imports, so it is
 * unit-testable without infrastructure. It knows nothing about roles: who may trigger a
 * transition is enforced server-side by the callers. The only identity rule here is separation
 * of duties on approval, because it follows from the states themselves.
 */

export const REQUEST_STATES = [
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
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];

const TRANSITIONS: Readonly<Record<RequestState, readonly RequestState[]>> = {
  Requested: ['Collecting', 'Cancelled'],
  Collecting: ['NeedsReview', 'ProposalReady', 'Failed', 'Cancelled'],
  NeedsReview: ['Collecting', 'Rejected', 'Cancelled'],
  ProposalReady: ['AwaitingApproval', 'Cancelled'],
  // Back to ProposalReady when the patch or the target changed and the approval is invalidated.
  AwaitingApproval: ['Approved', 'Rejected', 'Cancelled', 'ProposalReady'],
  Approved: ['Testing', 'ProposalReady', 'Cancelled'],
  // No Cancelled here: an in-flight execution is aborted through the Execution record (Phase 3),
  // which then fails the request.
  Testing: ['Verified', 'Failed'],
  Verified: [],
  Failed: [],
  Rejected: [],
  Cancelled: [],
};

export const TERMINAL_STATES: readonly RequestState[] = REQUEST_STATES.filter(
  (state) => TRANSITIONS[state].length === 0,
);

/** Moves that must carry a human-readable reason in the history. */
const REASON_REQUIRED_TARGETS: ReadonlySet<RequestState> = new Set([
  'NeedsReview',
  'Failed',
  'Rejected',
  'Cancelled',
]);
const INVALIDATION: ReadonlyArray<readonly [RequestState, RequestState]> = [
  ['AwaitingApproval', 'ProposalReady'],
  ['Approved', 'ProposalReady'],
];

export const MAX_REASON_LENGTH = 1000;

export interface TransitionContext {
  /** Who triggers the move: a user id, or `system` for the worker. */
  actorId: string;
  /** The user who created the request. */
  requesterId: string;
  reason?: string;
}

export type TransitionFailureCode =
  | 'UNKNOWN_STATE'
  | 'TERMINAL_STATE'
  | 'INVALID_TRANSITION'
  | 'ACTOR_REQUIRED'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_LONG'
  | 'SELF_APPROVAL';

export type TransitionCheck =
  { ok: true } | { ok: false; code: TransitionFailureCode; message: string };

export function isRequestState(value: unknown): value is RequestState {
  return typeof value === 'string' && (REQUEST_STATES as readonly string[]).includes(value);
}

export function allowedTransitions(from: RequestState): readonly RequestState[] {
  return TRANSITIONS[from];
}

export function isTerminal(state: RequestState): boolean {
  return TRANSITIONS[state].length === 0;
}

export function requiresReason(from: RequestState, to: RequestState): boolean {
  return (
    REASON_REQUIRED_TARGETS.has(to) ||
    INVALIDATION.some(([source, target]) => source === from && target === to)
  );
}

const fail = (code: TransitionFailureCode, message: string): TransitionCheck => ({
  ok: false,
  code,
  message,
});

export function checkTransition(
  from: unknown,
  to: unknown,
  context: TransitionContext,
): TransitionCheck {
  if (!isRequestState(from) || !isRequestState(to)) {
    return fail(
      'UNKNOWN_STATE',
      `Unknown request state: ${String(isRequestState(from) ? to : from)}`,
    );
  }
  if (isTerminal(from)) {
    return fail('TERMINAL_STATE', `${from} is a final state and cannot be left`);
  }
  if (!TRANSITIONS[from].includes(to)) {
    return fail('INVALID_TRANSITION', `Cannot move a request from ${from} to ${to}`);
  }
  if (!context.actorId || context.actorId.trim() === '') {
    return fail('ACTOR_REQUIRED', 'Every transition must record who triggered it');
  }
  if (requiresReason(from, to)) {
    const reason = context.reason?.trim() ?? '';
    if (reason === '') {
      return fail('REASON_REQUIRED', `Moving from ${from} to ${to} requires a reason`);
    }
  }
  if (context.reason !== undefined && context.reason.length > MAX_REASON_LENGTH) {
    return fail('REASON_TOO_LONG', `The reason is longer than ${MAX_REASON_LENGTH} characters`);
  }
  // Separation of duties: the requester cannot decide on their own request.
  if (from === 'AwaitingApproval' && (to === 'Approved' || to === 'Rejected')) {
    if (context.actorId === context.requesterId) {
      return fail('SELF_APPROVAL', 'The requester cannot approve or reject their own request');
    }
  }
  return { ok: true };
}
