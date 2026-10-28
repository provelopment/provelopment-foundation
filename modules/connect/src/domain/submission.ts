import type { InternalCode } from './error-codes.js';
import type {
  DeliveryJobId,
  OwnerId,
  PolicyId,
  PolicyRevision,
  SubmissionRef,
} from './identifiers.js';
import { isMintedAuthenticatedEvidence } from './delivery-evidence-registry.js';
import type { Purpose } from './purpose.js';
import { err, ok, type Result } from './result.js';

/**
 * Submission lifecycle (M1 §D.1). Each state proves only what its name says: `accepted` proves the
 * Module holds the enquiry, never that a provider took it, and `providerAccepted` never proves
 * inbox delivery.
 */
export const SUBMISSION_STATES = [
  'received',
  'validated',
  'policyAuthorized',
  'abuseChecked',
  'accepted',
  'queued',
  'attempting',
  'providerAccepted',
  'handoffAmbiguous',
  'retryScheduled',
  'failedPermanent',
  'expired',
  'delivered',
] as const;

export type SubmissionState = (typeof SUBMISSION_STATES)[number];

export const SUBMISSION_TRANSITIONS: Readonly<Record<SubmissionState, readonly SubmissionState[]>> =
  {
    received: ['validated', 'expired'],
    validated: ['policyAuthorized', 'expired'],
    policyAuthorized: ['abuseChecked', 'expired'],
    abuseChecked: ['accepted', 'expired'],
    accepted: ['queued', 'expired'],
    queued: ['attempting', 'expired', 'failedPermanent'],
    attempting: [
      'providerAccepted',
      'handoffAmbiguous',
      'retryScheduled',
      'failedPermanent',
      'expired',
    ],
    providerAccepted: ['delivered', 'expired'],
    handoffAmbiguous: ['retryScheduled', 'failedPermanent', 'expired'],
    // An attempt-bearing write may conclude the job permanently while a newer decision has it parked in
    // `retryScheduled` (R13-01): the attempt did happen, so this is not a shortcut past `attempting`, and a retry that
    // cannot be scheduled safely must not leave the job runnable.
    retryScheduled: ['attempting', 'expired', 'failedPermanent'],
    failedPermanent: [],
    expired: [],
    delivered: [],
  };

export const SUBMISSION_TERMINAL_STATES: readonly SubmissionState[] = [
  'failedPermanent',
  'expired',
  'delivered',
];

/** A terminal state records a fact that a later write cannot undo (R06-02). */
export function isTerminalSubmissionState(state: SubmissionState): boolean {
  return SUBMISSION_TERMINAL_STATES.includes(state);
}

export function canTransition(from: SubmissionState, to: SubmissionState): boolean {
  return SUBMISSION_TRANSITIONS[from].includes(to);
}

/** An illegal transition is a Module defect, not a visitor error: it maps to `INF-004`. */
export function transition(
  from: SubmissionState,
  to: SubmissionState,
): Result<SubmissionState, InternalCode> {
  if (!canTransition(from, to)) return err('INF-004');
  return ok(to);
}

/**
 * What a piece of delivery evidence **is**.
 *
 * The Module can prove a narrow, real thing: this object was minted by `correlateDeliveryEvidence` from
 * events that matched one job, owner, submission, provider message and frozen recipient set, and it is the
 * only kind of object `recordDelivery` will accept at runtime.
 *
 * **What the Module cannot prove, and the consumer's verifier must:** that the callback was signed by the
 * provider over the exact raw bytes, and that the provider message id genuinely belongs to that job. The
 * verifier is the trust root. If it lies, no amount of checking here can tell — so the Module never claims
 * to have authenticated a provider event itself.
 */
export interface DeliveryEvidence {
  readonly kind: 'authenticated-delivery-signal';
  /** The provider message id the events were correlated against. Never empty. */
  readonly providerReference: string;
  /** The job those events belonged to. */
  readonly jobId: DeliveryJobId;
  /** The owner that job belonged to. */
  readonly ownerRef: OwnerId;
  /** The submission the evidence is about; re-checked at the transition. */
  readonly submissionRef: SubmissionRef;
  /** The recipient set frozen at acceptance; every address in it was confirmed delivered. */
  readonly recipients: readonly string[];
}

/**
 * Promote a submission to `delivered`.
 *
 * Three independent conditions, none of which a caller can satisfy by constructing an object:
 *
 * 1. `evidence` must be an object this module minted (`isMintedAuthenticatedEvidence`). A structural
 *    look-alike, a spread copy, a `JSON.parse` round-trip or an imported brand is refused at runtime;
 * 2. the evidence must name the submission being promoted, so evidence for one enquiry cannot advance
 *    another;
 * 3. the lifecycle must allow `providerAccepted → delivered`.
 *
 * Provider acceptance on its own mints no evidence, so it can never reach `delivered`.
 */
export function recordDelivery(
  from: SubmissionState,
  submissionRef: SubmissionRef,
  evidence: DeliveryEvidence | undefined,
): Result<SubmissionState, InternalCode> {
  if (evidence === undefined || !isMintedAuthenticatedEvidence(evidence)) return err('INF-004');
  if (evidence.providerReference.trim() === '') return err('INF-004');
  if (evidence.submissionRef !== submissionRef) return err('INF-004');
  return transition(from, 'delivered');
}

/**
 * Durable record written at acceptance (M1 §D.2). It carries the context keys, the policy revision
 * and the dedupe identity that were in force, so a later reader never has to re-derive authority.
 */
export interface SubmissionRecord {
  readonly submissionRef: SubmissionRef;
  /**
   * Site identity key `(deploymentId, ownerRef, siteRef)`: a local Site slug is unique only inside its
   * owner's namespace, so two owners may reuse the same slug without colliding.
   */
  readonly siteIdentityKey: string;
  readonly purpose: Purpose;
  readonly policyId: PolicyId;
  readonly policyRevision: PolicyRevision;
  readonly idempotencyIdentity: string;
  readonly contentFingerprint: string;
  readonly acceptedAtEpochMs: number;
  readonly state: SubmissionState;
}
