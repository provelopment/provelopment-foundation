import type { OwnerId } from './identifiers.js';

/**
 * Operator access restrictions (M4 §7).
 *
 * Access is **deny-by-default** and always owner-scoped: an operator sees exactly the owners it is
 * explicitly granted, and only the actions it is explicitly granted. Nothing here widens a visitor's
 * access, and no production role model is chosen — the grants are configuration.
 */
export const OPERATOR_ACTIONS = ['read-enquiry', 'purge-expired'] as const;

export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

export interface OperatorPrincipal {
  readonly operatorRef: string;
  readonly permittedOwnerRefs: readonly OwnerId[];
  readonly permittedActions: readonly OperatorAction[];
}

export type OperatorAuthorization =
  | { readonly kind: 'allowed' }
  | {
      readonly kind: 'denied';
      readonly reason: 'principalMalformed' | 'ownerNotPermitted' | 'actionNotPermitted';
    };

export function findOperatorPrincipalProblems(principal: OperatorPrincipal): readonly string[] {
  const problems: string[] = [];
  if (principal.operatorRef.trim() === '') problems.push('operatorRef missing');
  if (principal.operatorRef.length > 200) problems.push('operatorRef too long');
  for (const owner of principal.permittedOwnerRefs) {
    if (owner.trim() === '') problems.push('permitted owner reference malformed');
  }
  for (const action of principal.permittedActions) {
    if (!(OPERATOR_ACTIONS as readonly string[]).includes(action)) {
      problems.push(`unknown operator action: ${action}`);
    }
  }
  return problems;
}

export function authorizeOperatorAction(
  principal: OperatorPrincipal,
  request: { readonly ownerRef: OwnerId; readonly action: OperatorAction },
): OperatorAuthorization {
  if (findOperatorPrincipalProblems(principal).length > 0) {
    return { kind: 'denied', reason: 'principalMalformed' };
  }
  if (!principal.permittedOwnerRefs.includes(request.ownerRef)) {
    return { kind: 'denied', reason: 'ownerNotPermitted' };
  }
  if (!principal.permittedActions.includes(request.action)) {
    return { kind: 'denied', reason: 'actionNotPermitted' };
  }
  return { kind: 'allowed' };
}

/**
 * Authenticated operator session (M5 §6).
 *
 * A principal is **not** authority: a caller-supplied object that merely claims `permittedOwnerRefs` and
 * `permittedActions` proves nothing. Only a consuming application's authenticated, authorized **server**
 * adapter may construct a session, after it has verified the real operator. The Module then treats the
 * session — not the claimed principal — as the authority input.
 *
 * `createOperatorSession` must only be called from that adapter. Sessions are registered in a module-private
 * `WeakSet`, so a plain object shaped like a session (or a spread copy of a real one) is refused at runtime;
 * this is defence in depth, not a substitute for the adapter's own authentication.
 */
const authenticatedSessions = new WeakSet<object>();

export interface OperatorSession {
  readonly principal: OperatorPrincipal;
  /** When the consumer's adapter authenticated the operator; audit evidence, never authority by itself. */
  readonly authenticatedAtEpochMs: number;
}

export function createOperatorSession(
  principal: OperatorPrincipal,
  authenticatedAtEpochMs: number,
): OperatorSession {
  const problems = findOperatorPrincipalProblems(principal);
  if (problems.length > 0) {
    throw new TypeError(`operator principal is invalid: ${problems.join('; ')}`);
  }
  if (!Number.isInteger(authenticatedAtEpochMs) || authenticatedAtEpochMs < 0) {
    throw new TypeError('authenticatedAtEpochMs must be a non-negative integer');
  }

  const session: OperatorSession = Object.freeze({
    principal: Object.freeze({
      operatorRef: principal.operatorRef,
      permittedOwnerRefs: Object.freeze([...principal.permittedOwnerRefs]),
      permittedActions: Object.freeze([...principal.permittedActions]),
    }),
    authenticatedAtEpochMs,
  });
  authenticatedSessions.add(session);
  return session;
}

export function isOperatorSession(value: unknown): value is OperatorSession {
  return typeof value === 'object' && value !== null && authenticatedSessions.has(value);
}
