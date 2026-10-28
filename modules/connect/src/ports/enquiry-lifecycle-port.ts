import type { LifecycleAuditRecord } from '../domain/lifecycle.js';
import type { OwnerId, SubmissionRef } from '../domain/identifiers.js';

/** An enquiry whose retention deadline has passed, as reported by a consumer's store. */
export interface RetentionCandidate {
  readonly submissionRef: SubmissionRef;
  readonly ownerRef: OwnerId;
  readonly acceptedAtEpochMs: number;
}

/**
 * The outcome of one deletion attempt.
 *
 * - `deleted` — every copy of the enquiry's content is gone (the Module confirms this independently);
 * - `notFound` — no content was found for that submission;
 * - `ownerMismatch` — the record belongs to another owner; nothing was touched;
 * - `notDue` — the acceptance time differs from the request; nothing was touched;
 * - `incomplete` — some content remains and could not be removed in this call. It is **not** a failure of
 *   the call and **not** a deletion: the intent stays unresolved and a later attempt resumes it.
 */
export type EnquiryDeletionResult =
  'deleted' | 'notFound' | 'ownerMismatch' | 'notDue' | 'incomplete';

/** A durable purge intent that has no completion record yet. */
export interface DeletionIntent {
  readonly intentRef: string;
  readonly submissionRef: SubmissionRef;
  readonly ownerRef: OwnerId;
  readonly acceptedAtEpochMs: number;
  readonly atEpochMs: number;
}

/**
 * Provider-neutral enquiry lifecycle (M4 §7, phase-separated for the 0.1.0 release gate).
 *
 * The Module owns the rules (which record is due, who may act, what must be audited). A consumer owns the
 * storage. Every method is owner-scoped: a store must never return or delete a record belonging to another
 * owner, and must answer `ownerMismatch` rather than silently deleting it.
 *
 * **What one deletion covers.** An enquiry is not one row. Removing it must remove *every* copy of the
 * visitor's content that the Module or the consumer can still produce for that submission:
 *
 * - the accepted submission record;
 * - its delivery job, attempt/outcome history and leases;
 * - the **immutable outbound message snapshot** — the fully rendered subject, text and HTML, which is the
 *   largest copy of the visitor's message and lives in its own store (see `OutboxPort`);
 * - any further payload copy the consumer keeps (index, queue payload, archive, search document).
 *
 * `P-09` decides retention periods; this contract decides what must disappear when one is enforced.
 *
 * **Ordering: payload copies first, the record last.** The record is the index that makes the other copies
 * reachable and attributable (`ownerRef`, `acceptedAtEpochMs`). A store that deletes the record first and is
 * then interrupted strands content it can no longer identify or re-authorise. Deleting content first keeps
 * the submission discoverable, so every interruption is retryable.
 *
 * **No resurrection.** Once deletion has begun, the store must refuse new content for that submission: a
 * delivery worker must not be able to re-establish a message snapshot for a purged job, and an outcome write
 * must not recreate the deleted record.
 *
 * **Fencing is atomic with the write (R04-02).** "Is deletion in progress?" and "commit this content" must be
 * one indivisible step for the same job. A check followed by a separate write leaves a window in which a purge
 * completes and the write then resurrects content that was already audited as deleted. A store must also
 * exclude in-flight writes before it reports a deletion complete, or wait for them to finish.
 *
 * **Across processes, not just objects (R05-02).** The exclusion must hold between independently constructed
 * store instances and between processes — a lock owned by one object excludes nothing. An operation that cannot
 * establish exclusive access must refuse instead of writing unprotected.
 *
 * **Storage failures are not answers (R05-03).** A fence read that fails for any reason other than genuine
 * absence is not "no fence"; a directory that cannot be enumerated is not "no content"; an unparseable record
 * is not "no record". Each must fail closed, and a deletion may be reported complete only after an authoritative
 * scan that succeeded.
 *
 * **Unreadable content is not absent.** If a stored payload copy exists but cannot be read, the store cannot
 * prove it is gone: `findEnquiry` must not answer `absent` and `deleteEnquiry` must not answer `deleted`.
 *
 * **Two-phase audited deletion.** `PurgeExpiredEnquiries` records `enquiry.purge-intent` durably before it
 * calls `deleteEnquiry`, and records `enquiry.purged` only after the store confirms **and the Module
 * re-confirms** that no content remains. A store must:
 *
 * - make `recordAudit` durable and **idempotent by `auditRef`** (a repeated write is a no-op);
 * - never delete content whose owner or acceptance time differs from the request;
 * - answer `findEnquiry` over **all** content copies, not just the record, so an interruption that removed
 *   the record but left a rendered message is still reported `present`;
 * - make `deleteEnquiry` idempotent: repeating it after an interruption finishes the deletion;
 * - return unresolved intents from `listDeletionIntents`, oldest first, owner-scoped.
 *
 * The Module still verifies every candidate itself (`ownerRef`, due-ness) before calling `deleteEnquiry`; an
 * adapter's candidate filter is not authority.
 */
export interface EnquiryLifecyclePort {
  listRetentionCandidates(request: {
    readonly ownerRef: OwnerId;
    readonly acceptedBeforeEpochMs: number;
    readonly limit: number;
  }): Promise<readonly RetentionCandidate[]>;

  /** Durable, idempotent audit write (`auditRef` is the idempotency key). */
  recordAudit(record: LifecycleAuditRecord): Promise<void>;

  /**
   * Remove every copy of this enquiry's content, in the order described above.
   *
   * A partial success is `incomplete`, never `deleted`: claiming `deleted` while a rendered message survives
   * is the exact failure this contract exists to prevent. Throwing is reserved for a store that could not
   * attempt the deletion at all.
   */
  deleteEnquiry(request: {
    readonly submissionRef: SubmissionRef;
    readonly ownerRef: OwnerId;
    readonly acceptedAtEpochMs: number;
    readonly atEpochMs: number;
  }): Promise<EnquiryDeletionResult>;

  /**
   * Is **any** content for this submission still present? `present` includes a leftover message snapshot
   * whose record is already gone; `absent` is a claim that nothing remains, not merely that the record is
   * missing.
   */
  findEnquiry(request: {
    readonly submissionRef: SubmissionRef;
    readonly ownerRef: OwnerId;
  }): Promise<'present' | 'absent' | 'ownerMismatch'>;

  listDeletionIntents(request: {
    readonly ownerRef: OwnerId;
    readonly limit: number;
  }): Promise<readonly DeletionIntent[]>;
}
