import type { DeliveryJob } from '../domain/delivery.js';
import type { SubmissionRecord } from '../domain/submission.js';
import type { SafeCategory } from '../domain/error-codes.js';
import type { SubmissionRef } from '../domain/identifiers.js';

/**
 * One acceptance commit. The submission record and its delivery job are written **atomically**, so
 * `accepted` can never exist without durable work (M1 §D.2, §C.6 step 4).
 */
export interface AcceptanceCommit {
  readonly submission: SubmissionRecord;
  readonly job: DeliveryJob;
}

export type AcceptanceCommitResult =
  | { readonly kind: 'committed'; readonly submissionRef: SubmissionRef }
  | {
      readonly kind: 'duplicate';
      readonly submissionRef: SubmissionRef;
      readonly originalCategory: SafeCategory;
    };

export interface SubmissionRepositoryPort {
  /**
   * Contract obligations (M1 §C.6, §D.2, §D.3):
   * - the dedupe key is the supplied context-scoped `idempotencyIdentity`; there is no global key
   *   namespace and no cross-context lookup;
   * - dedupe check and commit are one atomic operation: two concurrent identical submissions yield
   *   exactly one durable submission and one delivery job, the loser returning `duplicate`;
   * - the call resolves only after the record is durable; a failure throws, which the Module maps to
   *   `INF-001` (`unavailable`) rather than claiming acceptance.
   */
  commitAcceptance(commit: AcceptanceCommit): Promise<AcceptanceCommitResult>;

  /**
   * Optional fast path for a replay (M5 §3), scoped by the same context-scoped identity.
   *
   * It answers "does this exact submission already exist?" **without** granting authority: `commitAcceptance`
   * remains the atomic dedupe authority, and a store that cannot answer cheaply returns `undefined`. The
   * Module uses it so a replay is recognized before accepted-enquiry capacity is reserved; a replay that
   * races a first-time submission is still resolved atomically at commit.
   */
  findAcceptedByIdentity(idempotencyIdentity: string): Promise<SubmissionRef | undefined>;
}
