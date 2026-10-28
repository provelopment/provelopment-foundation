import type { DeliveryJobId, OwnerId, SubmissionRef } from '../domain/identifiers.js';
import type { DeliveryEvidence, SubmissionState } from '../domain/submission.js';

/**
 * A requested lifecycle transition for one submission (R05-01).
 *
 * The caller supplies **what** it wants, never **what it believes the current state is**: the store reads the
 * authoritative state itself, checks the transition against the lifecycle table, and commits only if that
 * state is still the one it read. A caller-supplied expectation would let a stale reader overwrite a newer
 * fact.
 */
export interface SubmissionTransitionRequest {
  readonly submissionRef: SubmissionRef;
  readonly ownerRef: OwnerId;
  readonly jobId: DeliveryJobId;
  /** The state being requested. Only `delivered` is produced by this Module today. */
  readonly to: SubmissionState;
  /**
   * The evidence that authorises the transition. The store may check that it names this submission and job;
   * it must not treat the object as authentication of anything — minting is the Module's private act.
   */
  readonly evidence: DeliveryEvidence;
}

export type SubmissionTransitionOutcome =
  | { readonly kind: 'committed'; readonly from: SubmissionState }
  /** The authoritative state already equals the target: a replay, not a new movement. */
  | { readonly kind: 'alreadyAtTarget'; readonly state: SubmissionState }
  | { readonly kind: 'illegalTransition'; readonly from: SubmissionState }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'ownerMismatch' };

/**
 * Conditional lifecycle writes for a submission (R05-01).
 *
 * Why this is a port and not a domain function: `recordDelivery` is a pure check. A pure check cannot move a
 * submission, and reporting `delivered` after running one would claim a movement that never happened. This
 * port is the durable half.
 *
 * Contract obligations:
 * - **read-check-commit is one indivisible operation** for one submission. Two concurrent transitions must
 *   never both report `committed`: the loser reports `alreadyAtTarget` or `illegalTransition`;
 * - the authoritative `from` state comes from the store. A caller cannot state, or restate, the current state;
 * - the transition must be legal under `canTransition(from, to)`; otherwise `illegalTransition` and **no write**;
 * - `ownerMismatch` is returned without disclosing anything about the record, and `notFound` covers a missing
 *   or deleted submission;
 * - `committed` resolves only after the new state is durable. A failure throws, and the caller must report the
 *   transition as *not committed* rather than as done;
 * - `alreadyAtTarget` writes nothing, so a provider retry that arrives after a successful commit is safe;
 * - an implementation that projects the state onto more than one record must keep those projections consistent
 *   inside the same atomic write.
 *
 * The reference `FileStore` implements this over one file per submission with an atomic rename. That is
 * sufficient for the reference adapter; a production adapter must additionally make the read-check-commit
 * atomic **across processes** (a conditional write, a row lock, or serializable isolation). See
 * `.documentation/agent-reports/COMS-WEB-M6-RESEND-READINESS-A1-R05.md` §C.
 */
export interface SubmissionStateStorePort {
  transitionSubmission(request: SubmissionTransitionRequest): Promise<SubmissionTransitionOutcome>;
}
