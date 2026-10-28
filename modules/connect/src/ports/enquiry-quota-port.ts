import type { CommunicationContext } from '../domain/communication-context.js';
import type { QuotaLimits } from '../domain/destination-policy.js';
import type { SubmissionRef } from '../domain/identifiers.js';

/**
 * Accepted-enquiry capacity (M5 §3) — deliberately **separate** from `AbuseControlPort`.
 *
 * `AbuseControlPort` answers a *request-attempt* question: "may this attempt proceed at all?". It runs
 * before anything is persisted, so it also sees replays, and an owner may reasonably want that protective
 * counting. It must never be the only thing standing between a business and its successful-enquiry quota,
 * because attempts are not enquiries.
 *
 * `EnquiryQuotaPort` answers the *accepted-enquiry* question and is tied to the durable commit:
 *
 * 1. `reserve` before the commit, atomically per `(deploymentId, ownerRef, siteRef)`;
 * 2. `commit` **only** after the repository reports `committed`;
 * 3. `release` when the commit reported `duplicate`, threw, or was refused.
 *
 * Consequences the tests rely on: replaying an already-accepted token consumes attempt budget but releases
 * its reservation, so the accepted-enquiry quota is consumed once; a failed commit releases its reservation,
 * so a transient persistence outage cannot permanently consume capacity. An adapter must expire abandoned
 * reservations on its own schedule; this Module never assumes a distributed limiter.
 */
export interface EnquiryQuotaReservationRequest {
  /** Stable for the attempt; the Module passes the submission reference. */
  readonly reservationRef: SubmissionRef;
  /** Stable identity of the durable record this reservation belongs to (release gate §3A). */
  readonly submissionRef: SubmissionRef;
  readonly context: CommunicationContext;
  /** Owner-authored quotas from the resolved policy. Never defaulted. */
  readonly quotas: QuotaLimits;
  readonly atEpochMs: number;
}

export type EnquiryQuotaReservation =
  { readonly kind: 'reserved' } | { readonly kind: 'exhausted' } | { readonly kind: 'unavailable' };

export type EnquiryQuotaReleaseReason = 'duplicate' | 'failedCommit' | 'refused';

/** A durable reservation whose accepted-enquiry commit has not been confirmed yet. */
export interface PendingEnquiryCapacityCommit {
  readonly reservationRef: SubmissionRef;
  readonly submissionRef: SubmissionRef;
  readonly atEpochMs: number;
}

export interface EnquiryQuotaPort {
  reserve(request: EnquiryQuotaReservationRequest): Promise<EnquiryQuotaReservation>;

  /**
   * Idempotent commit, keyed by `reservationRef` and `submissionRef`.
   *
   * A shared-store adapter must enforce a unique constraint on **both** identities and treat a repeated call
   * (or a retry after an unknown outcome) as success without adding capacity twice. It must not delete a
   * reservation before the accepted entry is durable, and it must retain abandoned reservations long enough
   * for `listPendingCommits` reconciliation. No distributed limiter is provided by this Module.
   */
  commit(request: {
    readonly reservationRef: SubmissionRef;
    readonly submissionRef: SubmissionRef;
    readonly atEpochMs: number;
  }): Promise<void>;

  /** Idempotent release: releasing twice, or releasing an already-committed reservation, is safe. */
  release(request: {
    readonly reservationRef: SubmissionRef;
    readonly reason: EnquiryQuotaReleaseReason;
    readonly atEpochMs: number;
  }): Promise<void>;

  /**
   * Durable reservations awaiting commit, owner-agnostic and bounded. Used by
   * `ReconcileEnquiryCapacity` after a commit failure or a process interruption; an adapter must return
   * reservations whose outcome is unknown, not only those it considers fresh.
   */
  listPendingCommits(limit: number): Promise<readonly PendingEnquiryCapacityCommit[]>;
}
