import type { TemplateReference } from './destination-policy.js';
import type {
  DeliveryAttemptId,
  DeliveryJobId,
  PolicyId,
  PolicyRevision,
  SubmissionRef,
} from './identifiers.js';
import type { DeliveryAuthorization } from './communication-context.js';
import type { SubmissionState } from './submission.js';

/** What the transport actually reported (M1 §D.4). */
export type TransportObservation =
  | { readonly kind: 'accepted'; readonly providerReference?: string }
  /** A timeout is only ambiguous when the payload may already have left the process. */
  | { readonly kind: 'timeout'; readonly payloadSent: boolean }
  | { readonly kind: 'connectionReset'; readonly payloadSent: boolean }
  | { readonly kind: 'providerServerError'; readonly status: number }
  /**
   * Credentials or permissions were refused (an unusable key, a revoked scope). This is a
   * **configuration** fault, not a defect in the message and not a refusal of this recipient, so it is
   * classified as a retryable failure: it recovers when the operator rotates the credential, and it
   * stops being retried when the attempt budget or the job age is exhausted.
   */
  | { readonly kind: 'providerAuthError'; readonly providerCode: string }
  | { readonly kind: 'throttled'; readonly retryAfterMs?: number }
  | { readonly kind: 'rejectedMessage'; readonly providerCode: string }
  | { readonly kind: 'rejectedSender'; readonly providerCode: string }
  | { readonly kind: 'blockedRecipient'; readonly providerCode: string }
  | { readonly kind: 'providerRefusedPolicy'; readonly providerCode: string }
  | { readonly kind: 'unclassified' };

/** Attempt outcome. `handoffAmbiguous` is neither success nor failure (M1 §D.4.1). */
export type AttemptOutcome =
  'providerAccepted' | 'handoffAmbiguous' | 'retryableFailure' | 'permanentFailure';

export interface DeliveryAttempt {
  readonly attemptId: DeliveryAttemptId;
  readonly jobId: DeliveryJobId;
  readonly startedAtEpochMs: number;
  readonly outcome: AttemptOutcome;
  readonly providerReference?: string;
}

export type DeliveryJobState = Extract<
  SubmissionState,
  | 'queued'
  | 'attempting'
  | 'providerAccepted'
  | 'handoffAmbiguous'
  | 'retryScheduled'
  | 'failedPermanent'
  | 'expired'
  | 'delivered'
>;

/**
 * Delivery authority frozen at acceptance (M1 §D.3): recipient and sender never come from visitor
 * input or from a later lookup that could drift.
 */
export interface DeliveryPlan {
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly from: { readonly address: string; readonly displayName: string };
  readonly replyTo?: string;
  readonly template: TemplateReference;
  /** Values to insert into the template; the renderer escapes them (M1 §E.5). */
  readonly renderValues: Readonly<Record<string, string>>;
  readonly submissionReference: string;
}

export interface DeliveryJob {
  readonly jobId: DeliveryJobId;
  readonly submissionRef: SubmissionRef;
  readonly siteIdentityKey: string;
  /** Frozen context identifiers, used to re-authorize the job before every transport call (M3). */
  readonly authorization: DeliveryAuthorization;
  readonly policyId: PolicyId;
  readonly policyRevision: PolicyRevision;
  readonly createdAtEpochMs: number;
  readonly state: DeliveryJobState;
  readonly attempts: readonly DeliveryAttempt[];
  readonly plan: DeliveryPlan;
  readonly nextAttemptAtEpochMs?: number;
  /**
   * Why the stored deadline exists (R14-02): `'provider-minimum'` when it is a floor the provider stated, `'backoff'`
   * when it is this module's own preference, absent when nothing is scheduled.
   *
   * The distinction is what makes eligibility checkable rather than assumed. A backoff deadline is advisory: a worker
   * with a skewed clock may retry a little early and the only cost is a second attempt inside its own budget. A
   * provider floor is a promise to a third party, so a store may only lease it on a clock it can attest.
   */
  readonly nextAttemptBasis?: NextAttemptBasis;
  /**
   * Monotone counter of **applied scheduling decisions** (R09-02). Zero or absent before the first one.
   *
   * It exists because a deadline is not a clock-independent freshness proof: two workers may disagree about
   * "now" during a deployment transition, so a stale holder could propose a *later* deadline and still be older.
   * A scheduling write therefore names the revision it intends to replace, and the store applies it only if that
   * revision is still current (`expectedScheduleRevision`). Attempt-bearing writes do not move it.
   */
  readonly scheduleRevision?: number;
  /** Identity of the scheduling operation that produced the current revision, so a retry of it is idempotent. */
  readonly lastScheduleOperationId?: string;
}

/**
 * Numeric policy is supplied by the owner (`P-06`); the Module deliberately ships **no** default
 * budget, so an unconfigured deployment cannot invent one.
 */
export interface RetryBudget {
  readonly maxAttempts: number;
  readonly maxAgeMs: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/** One declared ambiguity policy per adapter (M1 §D.4.1 obligation 3). */
export type AmbiguityPolicy =
  'reconcile-then-decide' | 'single-cautious-retry' | 'operator-escalation';

export type DeliveryDecision =
  | { readonly kind: 'settled' }
  | { readonly kind: 'reconcile' }
  | { readonly kind: 'retry'; readonly delayMs: number }
  | { readonly kind: 'escalate' }
  /**
   * The provider requires a **minimum** wait that the configured policy cannot express.
   *
   * Scheduling earlier would retransmit against the provider's explicit instruction; scheduling later
   * would exceed the owner's `maxDelayMs` (`P-06`). Neither choice belongs to the Module, so the job
   * stops and an operator decides — it is not retried prematurely and the key is never re-minted.
   */
  | { readonly kind: 'blockedByGuidance'; readonly minimumWaitMs: number }
  | { readonly kind: 'permanent' }
  | { readonly kind: 'expired' };

/** Number of automatic retries allowed after an *ambiguous* handoff. */
export const MAX_AMBIGUOUS_RETRIES = 1;

/**
 * Classification of a transport observation (M1 §D.4). A timeout or reset **after** the payload was
 * sent is ambiguous, not retryable: retrying blindly is how a business receives two copies.
 */
export function classifyTransportObservation(observation: TransportObservation): AttemptOutcome {
  switch (observation.kind) {
    case 'accepted':
      return 'providerAccepted';
    case 'timeout':
    case 'connectionReset':
      return observation.payloadSent ? 'handoffAmbiguous' : 'retryableFailure';
    case 'providerServerError':
    case 'providerAuthError':
    case 'throttled':
      return 'retryableFailure';
    case 'rejectedMessage':
    case 'rejectedSender':
    case 'blockedRecipient':
    case 'providerRefusedPolicy':
      return 'permanentFailure';
    case 'unclassified':
      // M1 §D.4: unclassifiable results are retried until the budget is exhausted, then permanent.
      return 'retryableFailure';
  }
}

/** Deterministic exponential backoff, capped. Jitter is deferred to the `P-06` values. */
export function computeBackoffMs(budget: RetryBudget, attemptsMade: number): number {
  const exponent = Math.max(0, Math.min(attemptsMade - 1, 30));
  const raw = budget.baseDelayMs * 2 ** exponent;
  return Math.min(raw, budget.maxDelayMs);
}

export interface DeliveryDecisionInput {
  readonly outcome: AttemptOutcome;
  /** Attempts already made **including** the one being decided. */
  readonly attemptsMade: number;
  readonly jobAgeMs: number;
  readonly budget: RetryBudget;
  readonly ambiguityPolicy: AmbiguityPolicy;
  /**
   * The provider's own throttling guidance, when it supplied one (`throttled.retryAfterMs`).
   *
   * This is a **minimum permitted wait**, not a preference: the next attempt may not be scheduled
   * earlier than this, and the owner's `maxDelayMs` may not be used to shorten it.
   */
  readonly retryAfterMs?: number;
}

function hasRetryGuidance(retryAfterMs: number | undefined): retryAfterMs is number {
  return retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0;
}

/**
 * The single place that decides what happens next. `settled` deliberately says nothing about inbox
 * delivery: only `providerAccepted` leads there, and even that proves no delivery.
 *
 * **Provider guidance is a floor.** There are three possible answers once the provider has stated a
 * minimum wait, and none of them is "wait less than it asked for":
 *
 * 1. the floor fits inside the job's remaining horizon and the owner's `maxDelayMs` → `retry` at the
 *    floor (or at our own backoff, whichever is later);
 * 2. the floor does not fit in the remaining horizon → `expired`: the job cannot reach the provider
 *    again before its maximum age, so pretending otherwise would only burn attempts;
 * 3. the floor fits the horizon but exceeds `maxDelayMs` → `blockedByGuidance`: the configured policy
 *    cannot express the wait, so an operator must widen the ceiling or end the job. Retrying at the
 *    ceiling would retransmit while the provider has explicitly said it will refuse.
 */
export function decideDeliveryAction(input: DeliveryDecisionInput): DeliveryDecision {
  const { outcome, attemptsMade, jobAgeMs, budget, ambiguityPolicy } = input;

  if (outcome === 'providerAccepted') return { kind: 'settled' };
  if (jobAgeMs > budget.maxAgeMs) return { kind: 'expired' };
  if (outcome === 'permanentFailure') return { kind: 'permanent' };

  if (outcome === 'handoffAmbiguous') {
    switch (ambiguityPolicy) {
      case 'reconcile-then-decide':
        return { kind: 'reconcile' };
      case 'single-cautious-retry':
        return attemptsMade <= MAX_AMBIGUOUS_RETRIES
          ? { kind: 'retry', delayMs: computeBackoffMs(budget, attemptsMade) }
          : { kind: 'escalate' };
      case 'operator-escalation':
        return { kind: 'escalate' };
    }
  }

  if (attemptsMade >= budget.maxAttempts) return { kind: 'permanent' };

  const backoffMs = computeBackoffMs(budget, attemptsMade);
  if (!hasRetryGuidance(input.retryAfterMs)) return { kind: 'retry', delayMs: backoffMs };

  // The later of the provider's floor and our own backoff. Never the earlier of the two.
  const minimumWaitMs = Math.max(backoffMs, input.retryAfterMs);

  // (2) The wait must finish inside the job's horizon. Expiring is honest; minting a new idempotency key
  // to dodge the wait would risk a duplicate message.
  if (jobAgeMs + minimumWaitMs > budget.maxAgeMs) return { kind: 'expired' };

  // (3) A floor above the owner's ceiling cannot be honoured by this policy. Do not truncate it.
  if (minimumWaitMs > budget.maxDelayMs) return { kind: 'blockedByGuidance', minimumWaitMs };

  // (1) Honourable: schedule exactly the floor (or later, if backoff is later).
  return { kind: 'retry', delayMs: minimumWaitMs };
}

/** Configuration defects. A retry budget is never defaulted or repaired. */
export function findRetryBudgetProblems(budget: RetryBudget): readonly string[] {
  const problems: string[] = [];
  if (!Number.isInteger(budget.maxAttempts) || budget.maxAttempts < 1) {
    problems.push('maxAttempts must be an integer >= 1');
  }
  if (!Number.isFinite(budget.maxAgeMs) || budget.maxAgeMs <= 0) {
    problems.push('maxAgeMs must be positive');
  }
  if (!Number.isFinite(budget.baseDelayMs) || budget.baseDelayMs < 0) {
    problems.push('baseDelayMs must be >= 0');
  }
  if (!Number.isFinite(budget.maxDelayMs) || budget.maxDelayMs < budget.baseDelayMs) {
    problems.push('maxDelayMs must be >= baseDelayMs');
  }
  return problems;
}

/**
 * States a dispatch outcome may not leave (R06-02).
 *
 * `providerAccepted` proves the provider took this message: a later dispatch outcome for it belongs to a stale
 * worker, and applying it would send the same enquiry twice. The others are terminal — `delivered` is a fact
 * authenticated evidence established, and `failedPermanent` / `expired` are facts the retry budget established.
 * None of them can be undone by another write.
 */
export const DELIVERY_OUTCOME_IMMUTABLE_STATES: readonly DeliveryJobState[] = [
  'providerAccepted',
  'delivered',
  'failedPermanent',
  'expired',
];

export type DeliveryOutcomeRefusal =
  | 'immutable-state'
  | 'deliveryRequiresEvidence'
  | 'superseded'
  /**
   * An attempt-less retry-scheduling write arrived without a usable freshness precondition (R10-01). It is refused
   * rather than applied, because accepting it would let a worker that cannot prove its view is current overwrite a
   * newer schedule. The refusal is a *write* defect, not a storage failure: nothing was attempted.
   */
  | 'missing-precondition';

/**
 * Why an attempt's retry proposal was withheld while the attempt itself was recorded (R11-01, R12-01, R13-01).
 *
 * - `stale-revision` — the write carried a generation that a newer decision already replaced;
 * - `unverified-revision` — the write carried no usable generation, so it could not be ordered at all;
 * - `would-accelerate` — the generation was current but the requested deadline is earlier than the stored one;
 * - `provider-minimum-unverified` — guidance was present but is not a usable duration (non-positive, fractional,
 *   non-finite, unsafe, or it would overflow the timestamp range);
 * - `provider-minimum-unanchored` — the guidance is usable, but the write carries no trustworthy instant to start the
 *   provider's interval from, so no deadline can be scheduled without risking an early retry (R13-01).
 *
 * The first three leave the authoritative schedule untouched and keep the job runnable. The last two **hold** the job
 * instead of scheduling it: an automatic retry would be a guess about the provider's window, and this module does not
 * guess about a provider's instruction.
 */
export type ScheduleSupersessionReason =
  | 'stale-revision'
  | 'unverified-revision'
  | 'would-accelerate'
  | 'provider-minimum-unverified'
  | 'provider-minimum-unanchored';

/**
 * Why a stored deadline exists (R14-02).
 *
 * `'provider-minimum'` marks a deadline that is a **promise to a third party** — the provider said "not before this" —
 * so eligibility must be decided on a clock the store can attest. `'backoff'` marks this module's own preference,
 * which a worker may act on with its own clock because nothing outside the module depends on the exact instant.
 *
 * **When the promise is active, and when it is satisfied (CLOSEOUT-01).** A provider minimum is a wait *before the next
 * provider call*, so it is satisfied by that call and by nothing else:
 *
 * - **active** from the moment a deadline is committed under attested guidance, and for the whole of every later
 *   attempt-less scheduling operation that postpones it — a deferral moves a promise, it can never discharge one;
 * - **satisfied** when a provider attempt is appended to the job (`attemptRecorded`), because the store leased that
 *   attempt at or after the floor; from then on the next deadline is ordinary backoff, and a clock-less store may lease
 *   it again.
 *
 * That distinction is what `committedNextAttemptBasis` encodes, so no adapter has to re-derive it.
 */
export type NextAttemptBasis = 'provider-minimum' | 'backoff';

/** States from which a dispatch may take work. Anything else is already decided. */
export const DISPATCHABLE_JOB_STATES: readonly DeliveryJobState[] = ['queued', 'retryScheduled'];

export function isDispatchableJobState(state: DeliveryJobState): boolean {
  return DISPATCHABLE_JOB_STATES.includes(state);
}

/**
 * What applying a dispatch outcome would do to the authoritative job state.
 *
 * `advanced` and `recorded` are the two kinds that **write**; `alreadyApplied` and `refused` are the two that
 * must not. The distinction between them is the R07-01 correction: `recorded` means a *new* attempt was persisted
 * while the state stayed the same (`retryScheduled` → `retryScheduled` is a second real failure, not a replay),
 * whereas `alreadyApplied` means this exact attempt identity is already stored, or an identity-less decision
 * would request the state the job is already in.
 */
export type DeliveryOutcomeApplication =
  | {
      readonly kind: 'advanced';
      readonly from: DeliveryJobState;
      readonly to: DeliveryJobState;
      /** The retry deadline this write committed, if it committed one (R11-01). */
      readonly nextAttemptAtEpochMs?: number;
      /**
       * Set only when the committed deadline exists because the provider attested a minimum wait the stored schedule
       * did not yet satisfy (R12-01). It makes the one stale-scheduling exception auditable rather than implicit.
       */
      readonly providerMinimumWaitMs?: number;
      /** Set when the write also withheld (or refused) a schedule change (R13-01). */
      readonly scheduleSuperseded?: ScheduleSupersessionReason;
    }
  /** A new attempt was persisted; the lifecycle state it requested was already the current one. */
  | {
      readonly kind: 'recorded';
      readonly state: DeliveryJobState;
      /** The retry deadline this write committed, if it committed one (R11-01). */
      readonly nextAttemptAtEpochMs?: number;
      /** See `advanced.providerMinimumWaitMs`. */
      readonly providerMinimumWaitMs?: number;
      /**
       * The attempt was persisted but its retry proposal was **not** committed (R11-01). The provider request really
       * happened, so the attempt stays in the history; what is withheld is the schedule, because a newer decision
       * owns it or this write could not prove which generation it was taken from.
       */
      readonly scheduleSuperseded?: ScheduleSupersessionReason;
    }
  /**
   * A pre-send deferral moved the retry deadline durably while the state stayed `retryScheduled` (R08-01).
   *
   * This is neither an attempt (none happened) nor a replay (the schedule changed), which is why it is its own
   * kind: a caller must be able to tell "the job now waits until T" from "nothing changed".
   */
  | {
      readonly kind: 'rescheduled';
      readonly state: 'retryScheduled';
      readonly nextAttemptAtEpochMs: number;
    }
  | { readonly kind: 'alreadyApplied'; readonly state: DeliveryJobState }
  | {
      readonly kind: 'refused';
      readonly state: DeliveryJobState;
      readonly requested: DeliveryJobState;
      readonly reason: DeliveryOutcomeRefusal;
    };

/** The lifecycle state a decision asks for. One mapping, shared by every writer and the dispatcher. */
export function deliveryJobStateForDecision(decision: DeliveryDecision): DeliveryJobState {
  switch (decision.kind) {
    case 'settled':
      return 'providerAccepted';
    case 'reconcile':
    case 'escalate':
      return 'handoffAmbiguous';
    case 'retry':
      return 'retryScheduled';
    case 'permanent':
      // Terminal for this policy: the provider's minimum wait exceeds the owner's ceiling. The job is not retried
      // earlier than the provider allows.
      return 'failedPermanent';
    case 'blockedByGuidance':
      return 'failedPermanent';
    case 'expired':
      return 'expired';
  }
}

export interface DeliveryOutcomeClassificationInput {
  readonly current: DeliveryJobState;
  readonly requested: DeliveryJobState;
  /**
   * Identity of the attempt this write carries. Absent when the job was decided without a provider attempt
   * (a pre-dispatch gate refusal or deferral), where the schedule, not an attempt identity, describes the write.
   */
  readonly attemptId?: string;
  /** Attempt identities already stored for this job; the authoritative record of what was persisted. */
  readonly persistedAttemptIds: readonly string[];
  /** The retry deadline already stored, if any. Compared only for identity-less scheduling writes. */
  readonly currentNextAttemptAtEpochMs?: number;
  /** The retry deadline this write requests, if any. */
  readonly requestedNextAttemptAtEpochMs?: number;
  /**
   * The scheduling revision this write intends to replace (R09-02). **Mandatory** for an attempt-less
   * `retryScheduled` write (R10-01): absent or malformed ⇒ `missing-precondition`.
   *
   * A later deadline is **not** proof of a newer decision: a worker whose clock runs ahead, or whose process was
   * paused while another worker committed a decision, can propose a later deadline from a stale view. The revision
   * is the ordering proof; the deadline is only the payload.
   */
  readonly expectedScheduleRevision?: number;
  /** The job's current scheduling revision, as the store reads it under the same fence as the write. */
  readonly currentScheduleRevision?: number;
  /**
   * Identity of this scheduling **operation**, not of its deadline (R09-02). Repeating the same operation — a
   * persistence retry after an unknown outcome — must not schedule twice, so it is applied at most once.
   */
  readonly scheduleOperationId?: string;
  /** Identity of the operation that produced `currentScheduleRevision`. */
  readonly lastScheduleOperationId?: string;
  /**
   * The provider's own **attested minimum wait**, when the observation carried one (`throttled.retryAfterMs`), and
   * nothing else (R12-01).
   *
   * It is a *duration*, and a duration alone can never move a schedule: it must be started from a trustworthy instant
   * (see `trustedWriteTimeEpochMs`). Ordinary backoff is an opinion about when to try again; this is an instruction not
   * to, but even an instruction needs a clock the module can defend (R13-01).
   */
  readonly providerMinimumWaitMs?: number;
  /**
   * The instant this worker **observed the provider's response**, read from the same clock that sent the request
   * (R14-01). Optional; supplied by the dispatcher immediately after the transport call returns.
   *
   * It exists because a provider minimum is a *duration from the response*, and the batch-start clock reading that
   * timed the attempt can be minutes earlier than the response it is supposed to start from. Without this field a
   * current-generation retry would be scheduled from before the provider had even answered.
   *
   * **The guarantee.** On the clock that produced it, this instant is not before the response: the reading is taken
   * after the call settles. An interval started here is therefore never shorter than the provider asked, *measured on
   * one clock*.
   *
   * **The limits.** It says nothing about that clock's agreement with the store's clock or with the provider's, so it
   * is not a proof of an absolute provider floor. It is the best available anchor when the store cannot attest a
   * commit time, and it is always subordinate to `trustedWriteTimeEpochMs` when the store can: a worker reading that
   * is ahead of the store would otherwise postpone the job by its own skew, and one behind would advance it.
   */
  readonly responseObservedAtEpochMs?: number;
  /**
   * A **trustworthy instant at or after the provider's response**, supplied by the store that is committing this write
   * (R13-01). The provider-neutral form of "authoritative storage time": the moment this record became durable.
   *
   * Because that instant can never precede the response, `trustedWriteTimeEpochMs + providerMinimumWaitMs` is provably
   * *not earlier* than the instant the provider demanded — which is the only basis on which a minimum may be scheduled
   * automatically. A store that cannot attest such a time supplies nothing, and the write is held for reconciliation
   * instead. The caller-supplied `DeliveryOutcomeRecord.atEpochMs` is **not** that time: it is the worker's clock,
   * exactly the instant R13 exists to distrust.
   */
  readonly trustedWriteTimeEpochMs?: number;
}

/**
 * What an attempt-less retry-scheduling write is missing, if anything (R10-01).
 *
 * The freshness precondition is **mandatory** for such a write: the generation is the only thing that orders two
 * scheduling decisions, so a write that cannot state which generation it replaces cannot be ordered at all. This is
 * checked at runtime, not only in the type, because a consumer store can be written in plain JavaScript or can be
 * handed a hand-built record.
 */
export type SchedulePreconditionProblem =
  'expected-revision-invalid' | 'operation-identity-invalid';

export function findSchedulePreconditionProblem(
  input: DeliveryOutcomeClassificationInput,
): SchedulePreconditionProblem | undefined {
  const { expectedScheduleRevision, scheduleOperationId } = input;
  if (
    expectedScheduleRevision === undefined ||
    !Number.isInteger(expectedScheduleRevision) ||
    expectedScheduleRevision < 0
  ) {
    return 'expected-revision-invalid';
  }
  if (scheduleOperationId === undefined || scheduleOperationId.trim() === '') {
    return 'operation-identity-invalid';
  }
  return undefined;
}

export interface ScheduleChangeInput {
  readonly application: DeliveryOutcomeApplication;
  readonly currentNextAttemptAtEpochMs?: number;
  readonly currentScheduleRevision?: number;
  /** Identity of a real provider attempt, if this write carried one. */
  readonly attemptId?: string;
  /** Identity of an attempt-less scheduling operation, if this write was one. */
  readonly scheduleOperationId?: string;
}

export interface CommittedScheduleChange {
  readonly scheduleRevision: number;
  readonly lastScheduleOperationId: string;
}

/**
 * The one scheduling-generation protocol (R10-01, R11-01).
 *
 * **Every** durable retry-schedule change advances the generation — whether it came from a provider attempt or from
 * an attempt-less deferral — and every such change names the identity that caused it. That is what makes an earlier
 * view of the schedule invalid regardless of which writer moved it: the compare-and-set is on the generation, so a
 * pre-send decision taken before a provider attempt retried cannot pass afterwards.
 *
 * The application is the sole authority on what was committed: it reports the deadline it wrote, and nothing here
 * re-derives it from the record (R11-01). A write whose application carries no deadline — a replay, a refusal, an
 * attempt whose schedule was withheld — therefore cannot move the counter.
 *
 * The counter moves **exactly once per committed change**, and an attempt is never invented to advance it: the
 * identity is the attempt's own when there is one.
 *
 * Reference adapters call this under their own fence, in the same write as the deadline, the attempt history and the
 * projection. A production adapter must do the same inside one conditional update or row lock.
 */
export function committedScheduleChange(
  input: ScheduleChangeInput,
): CommittedScheduleChange | undefined {
  const { application } = input;
  const committedDeadline =
    application.kind === 'rescheduled' ||
    application.kind === 'advanced' ||
    application.kind === 'recorded'
      ? application.nextAttemptAtEpochMs
      : undefined;
  if (committedDeadline === undefined) return undefined;
  // The deadline the store committed is the caller's only when it differs: an unchanged schedule invalidates nothing.
  if (committedDeadline === input.currentNextAttemptAtEpochMs) return undefined;
  const operationId = input.attemptId ?? input.scheduleOperationId;
  if (operationId === undefined) return undefined;
  return {
    scheduleRevision: (input.currentScheduleRevision ?? 0) + 1,
    lastScheduleOperationId: operationId,
  };
}

export interface CommittedNextAttemptBasisInput {
  readonly application: DeliveryOutcomeApplication;
  /** The basis stored beside the deadline this write replaces, if the job had one. */
  readonly currentNextAttemptBasis?: NextAttemptBasis;
  /** Whether this write appends a provider attempt to the job's history. */
  readonly attemptRecorded: boolean;
}

/**
 * Why the deadline this write committed exists, as the store must record it (R14-02, CLOSEOUT-01).
 *
 * The adapter's only job is to persist the answer; the rule lives here so all three writers agree. Four cases, in
 * order, and the last one is the correction:
 *
 * 1. **no committed deadline** → `undefined`: the write scheduled nothing, so the stored basis stays beside the stored
 *    deadline and must not be touched;
 * 2. **guidance** → `'provider-minimum'`: the provider itself set this floor;
 * 3. **an attempt was appended** → `'backoff'`: the floor that preceded this call has been kept, so the wait it imposed
 *    is discharged and the next deadline is this module's own preference again;
 * 4. **neither — an attempt-less scheduling operation** → the stored basis is **inherited**.
 *
 * Case 4 is the defect this closes. A pre-send deferral carries no provider guidance, and treating that silence as
 * "ordinary backoff now" silently cancelled the promise: the deadline stayed at or after the floor (the monotone rule
 * guarantees that), but the marker that told a clock-less store *not to lease it on a caller's clock* was dropped. A
 * worker whose clock ran ahead could then lease the job before the provider's window had elapsed — inside D's window,
 * though the lease was nominally granted at the postponed deadline D′ > D, because nothing required the lease to be
 * granted on an attested clock any more. Inheritance is safe by construction: a deferral may only move the deadline
 * later, so the inherited marker still describes a deadline that is at least a provider floor.
 *
 * The inverse rule matters too: because a provider call discharges the wait, inheritance cannot make a floor permanent.
 * Once the job has been attempted, later backoff is leasable on any clock, and a store without an attested clock is not
 * stuck for the life of the job.
 */
export function committedNextAttemptBasis(
  input: CommittedNextAttemptBasisInput,
): NextAttemptBasis | undefined {
  const { application } = input;
  const committedDeadline =
    application.kind === 'rescheduled' ||
    application.kind === 'advanced' ||
    application.kind === 'recorded'
      ? application.nextAttemptAtEpochMs
      : undefined;
  if (committedDeadline === undefined) return undefined;
  if (
    (application.kind === 'advanced' || application.kind === 'recorded') &&
    application.providerMinimumWaitMs !== undefined
  ) {
    return 'provider-minimum';
  }
  if (input.attemptRecorded) return 'backoff';
  return input.currentNextAttemptBasis === 'provider-minimum' ? 'provider-minimum' : 'backoff';
}

/**
 * The single state policy for **every** writer of a delivery job (R06-02), corrected for attempt identity
 * (R07-01), pre-send deferral (R08-01), generation ordering (R09-02), mandatory preconditions (R10-01) and stale
 * provider outcomes (R11-01).
 *
 * Two invariants decide every write:
 *
 * - **the retry deadline never moves earlier.** A scheduling write may postpone a job; it may never accelerate one,
 *   not even across generations. That single rule keeps a provider's Retry-After minimum intact: once an attempt
 *   committed "not before T", no later decision can propose T' < T, whatever generation it holds. Acceleration is an
 *   administrative action, not a scheduling write.
 * - **the generation orders decisions.** An attempt-less scheduling write must prove it replaces the current
 *   generation; an attempt-bearing write is recorded regardless, but may only *replace* a schedule when its
 *   generation is current.
 *
 * Rules, in order:
 *
 * 1. an outcome never produces `delivered`: delivery comes from authenticated evidence through the state port;
 * 2. an attempt whose `attemptId` is already stored is a replay (`alreadyApplied`) — no second attempt, no state
 *    change, and no double count;
 * 3. an outcome never leaves `providerAccepted` or a terminal state;
 * 4. a write with **no** attempt that requests `retryScheduled` is a **scheduling** write. It must carry
 *    `expectedScheduleRevision` and `scheduleOperationId` (else `missing-precondition`) **and** its revision must be
 *    the current one (else `superseded`) — including the initial `accepted`/`queued → retryScheduled` transition
 *    that R11-02 closed;
 * 5. within the current generation its identity ordering is: the same operation id is `alreadyApplied`; a later
 *    deadline is `rescheduled`; an equal one is `alreadyApplied`; an earlier one is `superseded`;
 * 6. a write **with** an attempt is always recorded — the provider request happened — and its retry proposal is
 *    committed only when its generation is current and the deadline does not move earlier. Otherwise the attempt is
 *    recorded alone (`recorded` + `scheduleSuperseded`), except that a proposal *later* than the stored deadline is
 *    still committed: a provider minimum may extend the schedule, never be shortened by it;
 * 7. every committed deadline change advances the generation exactly once (`committedScheduleChange`), attributed to
 *    the attempt or the operation that caused it;
 * 8. any other identity-less repeat of the current state is `alreadyApplied`.
 */
export function classifyDeliveryOutcome(
  input: DeliveryOutcomeClassificationInput,
): DeliveryOutcomeApplication {
  const { current, requested, attemptId, persistedAttemptIds } = input;

  if (requested === 'delivered') {
    return { kind: 'refused', state: current, requested, reason: 'deliveryRequiresEvidence' };
  }
  // Identity first: a duplicate persistence request must not be counted twice, whatever the states say.
  if (attemptId !== undefined && persistedAttemptIds.includes(attemptId)) {
    return { kind: 'alreadyApplied', state: current };
  }
  if (DELIVERY_OUTCOME_IMMUTABLE_STATES.includes(current)) {
    return { kind: 'refused', state: current, requested, reason: 'immutable-state' };
  }
  // R10-01/R11-02: an attempt-less scheduling write proves presence **and** equality of the generation before any
  // branch — including the `advanced` path used by the first deferral, so a stale worker cannot enter the lifecycle
  // at all.
  if (attemptId === undefined && requested === 'retryScheduled') {
    if (findSchedulePreconditionProblem(input) !== undefined) {
      return { kind: 'refused', state: current, requested, reason: 'missing-precondition' };
    }
    // Identity outranks the compare-and-set (R09-02): repeating *this* operation after an unknown outcome is a
    // replay, not an attempt to overwrite a newer decision — its own commit already replaced the generation it names.
    if (
      input.scheduleOperationId !== undefined &&
      input.scheduleOperationId === input.lastScheduleOperationId
    ) {
      return { kind: 'alreadyApplied', state: current };
    }
    if (scheduleRevisionProof(input) !== 'current') {
      return { kind: 'refused', state: current, requested, reason: 'superseded' };
    }
    return current === requested ? classifyReschedule(input) : classifyInitialSchedule(input);
  }
  // R11-01: a provider attempt that proposes a retry is always recorded; only its schedule is gated.
  if (attemptId !== undefined && requested === 'retryScheduled') {
    return classifyAttemptRetry(input);
  }
  if (current === requested) {
    if (attemptId !== undefined) return { kind: 'recorded', state: current };
    return { kind: 'alreadyApplied', state: current };
  }
  return { kind: 'advanced', from: current, to: requested };
}

/** How the write's generation compares with the one the store read. */
function scheduleRevisionProof(
  input: DeliveryOutcomeClassificationInput,
): 'current' | 'stale' | 'unverified' {
  const { expectedScheduleRevision, currentScheduleRevision } = input;
  if (
    expectedScheduleRevision === undefined ||
    !Number.isInteger(expectedScheduleRevision) ||
    expectedScheduleRevision < 0
  ) {
    return 'unverified';
  }
  return expectedScheduleRevision === (currentScheduleRevision ?? 0) ? 'current' : 'stale';
}

/** Whether a proposed deadline is at or after the stored one: the monotone scheduling rule. */
function postponesDeadline(
  currentNextAttemptAtEpochMs: number | undefined,
  targetEpochMs: number,
): boolean {
  return currentNextAttemptAtEpochMs === undefined || targetEpochMs >= currentNextAttemptAtEpochMs;
}

/** What the write can say about the provider's own minimum wait (R12-01, R13-01). */
type ProviderMinimum =
  | { readonly kind: 'absent' }
  | { readonly kind: 'attested'; readonly minimumWaitMs: number }
  /** Not a usable duration: non-positive, fractional, non-finite or beyond the safe-integer range. */
  | { readonly kind: 'unverifiable' };

/**
 * Read the provider's attested minimum, if the write carries one.
 *
 * Guidance is treated as a **duration the provider stated**, never as a deadline: the value is validated as a whole
 * number of milliseconds inside the safe-integer range, and it is never converted into an instant here. Whether the
 * duration can be *started* depends on a trustworthy anchor, which is a separate question (R13-01).
 */
function providerMinimum(input: DeliveryOutcomeClassificationInput): ProviderMinimum {
  const minimumWaitMs = input.providerMinimumWaitMs;
  if (minimumWaitMs === undefined) return { kind: 'absent' };
  if (!Number.isSafeInteger(minimumWaitMs) || minimumWaitMs <= 0) return { kind: 'unverifiable' };
  return { kind: 'attested', minimumWaitMs };
}

/**
 * The first instant at or after the provider's minimum, taken from the best anchor this write can offer (R13-01,
 * R14-01).
 *
 * Precedence is deliberate and total:
 *
 * 1. **the store's attested commit instant** — absolute-safe by construction (the write follows the response), and
 *    immune to any worker's clock;
 * 2. **the worker's post-response reading** — safe *as an interval on that clock* (the read happens after the call
 *    settles) but not absolute, because the clock may disagree with the store's;
 * 3. **nothing** — `undefined`, i.e. reconcile rather than guess.
 *
 * The two are never combined: taking the maximum would let a worker clock that is ahead of the store postpone the job
 * by its own skew, and a clock behind would pull it forward. One authority is chosen, and the store's wins.
 */
function providerWaitFloor(
  input: DeliveryOutcomeClassificationInput,
  minimumWaitMs: number,
): number | 'unverifiable' | undefined {
  const anchor =
    input.trustedWriteTimeEpochMs !== undefined
      ? input.trustedWriteTimeEpochMs
      : input.responseObservedAtEpochMs;
  if (anchor === undefined) return undefined;
  if (!Number.isSafeInteger(anchor) || anchor <= 0) return 'unverifiable';
  const floor = anchor + minimumWaitMs;
  return Number.isSafeInteger(floor) ? floor : 'unverifiable';
}

/**
 * The caller's *delay*, measured on its own clock, if it stated both ends of it (R14-01).
 *
 * An instant cannot cross clocks, but a **duration** can: `proposed - responseObserved` is the wait this worker decided
 * on, computed from two readings of one clock, so any skew cancels. That is what lets a store-anchored write keep the
 * caller's longer backoff without importing the caller's idea of "now".
 */
function callerDelayMs(input: DeliveryOutcomeClassificationInput): number | undefined {
  const proposed = input.requestedNextAttemptAtEpochMs;
  const observed = input.responseObservedAtEpochMs;
  if (proposed === undefined || observed === undefined) return undefined;
  if (!Number.isSafeInteger(proposed) || !Number.isSafeInteger(observed)) return undefined;
  return Math.max(0, proposed - observed);
}

/** The attempt is recorded and the schedule is left exactly as the authoritative decision wrote it. */
function withheldAttempt(
  input: DeliveryOutcomeClassificationInput,
  reason: ScheduleSupersessionReason,
): DeliveryOutcomeApplication {
  return { kind: 'recorded', state: input.current, scheduleSuperseded: reason };
}

/**
 * The provider demanded a wait the module cannot prove it can honour, so the job stops here (R13-01).
 *
 * Nothing is scheduled and nothing is sent: the job leaves the runnable set, exactly as the pre-existing
 * `blockedByGuidance` outcome does when the minimum exceeds the owner's ceiling. Retrying at the stored deadline — or
 * immediately, because that deadline has already passed — would retransmit into the provider's window, so the honest
 * outcome is to stop and let an operator resolve it.
 */
function providerGuidanceHold(
  input: DeliveryOutcomeClassificationInput,
  reason: ScheduleSupersessionReason,
): DeliveryOutcomeApplication {
  return {
    kind: 'advanced',
    from: input.current,
    to: 'failedPermanent',
    scheduleSuperseded: reason,
  };
}

/** The reason a stale or unprovable write is reported with. */
function revisionSupersessionReason(
  input: DeliveryOutcomeClassificationInput,
): ScheduleSupersessionReason {
  return scheduleRevisionProof(input) === 'stale' ? 'stale-revision' : 'unverified-revision';
}

/** The first deferral of a job that is not yet `retryScheduled` (R11-02: behind the same compare-and-set). */
function classifyInitialSchedule(
  input: DeliveryOutcomeClassificationInput,
): DeliveryOutcomeApplication {
  const { current, requested } = input;
  const proposed = input.requestedNextAttemptAtEpochMs;
  if (proposed === undefined) return { kind: 'advanced', from: current, to: requested };
  if (!postponesDeadline(input.currentNextAttemptAtEpochMs, proposed)) {
    // The same rule as within a generation: a scheduling write cannot pull a retry forward.
    return { kind: 'refused', state: current, requested, reason: 'superseded' };
  }
  return { kind: 'advanced', from: current, to: requested, nextAttemptAtEpochMs: proposed };
}

/**
 * An attempt happened; what may it do to the schedule? (R11-01, R12-01, corrected by R13-01)
 *
 * The attempt is recorded in **every** branch except immutability: a provider request really happened, and dropping it
 * would erase the only evidence of that call. The schedule is a different question, and scheduling authority is not
 * something a later clock reading can buy:
 *
 * 1. **Guidance that is not a duration** → hold. It might be huge or nonsense; guessing either way is worse than
 *    asking an operator.
 * 2. **Generation current** → the worker owns the schedule and its own clock measured the wait it just received, so
 *    commit its deadline unless that would move it earlier. One clock saw request and response, so nothing has to be
 *    reconciled across workers.
 * 3. **Generation stale or unprovable, no guidance** → the newer decision owns the schedule; ordinary backoff acquires
 *    nothing, however late it proposes to retry.
 * 3. **Generation stale or unprovable, no guidance** → the newer decision owns the schedule; ordinary backoff
 *    acquires nothing, however late it proposes to retry.
 * 4. **Generation stale or unprovable, with guidance** → the duration is real but its start is not: the write must
 *    carry an instant at or after the response — the store's attested commit time (`trustedWriteTimeEpochMs`), or
 *    failing that the worker's own post-response reading (`responseObservedAtEpochMs`). With one, the floor
 *    `anchor + minimum` is never shorter than the provider asked, so it is scheduled (and still never earlier than the
 *    stored deadline). Without one, the job is **held** rather than measured from a stale deadline.
 *
 * The provider floor is now identical in both generations (R14-01): the only thing a current generation buys is the
 * right to schedule ordinary backoff, not the right to schedule *inside* a provider minimum.
 */
function classifyAttemptRetry(
  input: DeliveryOutcomeClassificationInput,
): DeliveryOutcomeApplication {
  const { current, requested } = input;
  const proposed = input.requestedNextAttemptAtEpochMs;
  const minimum = providerMinimum(input);

  // 1. Guidance we cannot read as a duration. Record the attempt, schedule nothing, ask for reconciliation.
  if (minimum.kind === 'unverifiable')
    return providerGuidanceHold(input, 'provider-minimum-unverified');

  // 2. Current generation: the worker owns the schedule, but a provider minimum is still a floor it may not go
  //    under (R14-01). The proposal is measured from the response, and the floor is re-established here from the same
  //    anchor — so a caller that forgot, or a transport that answered long after the batch began, cannot schedule
  //    inside the provider's window.
  if (scheduleRevisionProof(input) === 'current') {
    if (proposed === undefined) return { kind: 'recorded', state: current };
    if (!postponesDeadline(input.currentNextAttemptAtEpochMs, proposed)) {
      return withheldAttempt(input, 'would-accelerate');
    }
    if (minimum.kind === 'absent') {
      return current === requested
        ? { kind: 'recorded', state: current, nextAttemptAtEpochMs: proposed }
        : { kind: 'advanced', from: current, to: requested, nextAttemptAtEpochMs: proposed };
    }
    const currentFloor = providerWaitFloor(input, minimum.minimumWaitMs);
    if (currentFloor === undefined)
      return providerGuidanceHold(input, 'provider-minimum-unanchored');
    if (currentFloor === 'unverifiable') {
      return providerGuidanceHold(input, 'provider-minimum-unverified');
    }
    // Keep the caller's own longer wait — as a *duration*, so a skewed clock cannot stretch it (R14-01).
    const target = currentFloor + Math.max(0, (callerDelayMs(input) ?? 0) - minimum.minimumWaitMs);
    return current === requested
      ? {
          kind: 'recorded',
          state: current,
          nextAttemptAtEpochMs: target,
          providerMinimumWaitMs: minimum.minimumWaitMs,
        }
      : {
          kind: 'advanced',
          from: current,
          to: requested,
          nextAttemptAtEpochMs: target,
          providerMinimumWaitMs: minimum.minimumWaitMs,
        };
  }

  // 3. Stale or unprovable, ordinary backoff: no authority here, whatever it proposes.
  if (minimum.kind === 'absent') return withheldAttempt(input, revisionSupersessionReason(input));

  // 4. A verified minimum may still be scheduled — but only from a trustworthy anchor, never from a stale deadline.
  const floor = providerWaitFloor(input, minimum.minimumWaitMs);
  if (floor === undefined) return providerGuidanceHold(input, 'provider-minimum-unanchored');
  if (floor === 'unverifiable') return providerGuidanceHold(input, 'provider-minimum-unverified');
  return {
    kind: 'recorded',
    state: current,
    // Never earlier than what is already committed, and never earlier than the provider's window.
    nextAttemptAtEpochMs: Math.max(floor, input.currentNextAttemptAtEpochMs ?? floor),
    providerMinimumWaitMs: minimum.minimumWaitMs,
  };
}

/** The scheduling half of the policy: operation identity and revision decide; the deadline is only the payload. */
function classifyReschedule(input: DeliveryOutcomeClassificationInput): DeliveryOutcomeApplication {
  const {
    current,
    currentNextAttemptAtEpochMs,
    requestedNextAttemptAtEpochMs,
    currentScheduleRevision,
    expectedScheduleRevision,
    scheduleOperationId,
    lastScheduleOperationId,
  } = input;

  // 1. This very operation already committed (a persistence retry after an unknown outcome). It applies at most
  //    once, and reports as a replay rather than as a second scheduling decision.
  if (scheduleOperationId !== undefined && scheduleOperationId === lastScheduleOperationId) {
    return { kind: 'alreadyApplied', state: current };
  }
  // 2. Compare-and-set on the scheduling revision (R09-02). A holder whose view predates another committed
  //    decision may not write — **however late its proposed deadline looks**, because a later deadline is not
  //    proof of a newer decision when clocks or configuration differ between workers.
  if (
    expectedScheduleRevision !== undefined &&
    expectedScheduleRevision !== (currentScheduleRevision ?? 0)
  ) {
    return { kind: 'refused', state: current, requested: current, reason: 'superseded' };
  }
  // 3. A retry decision with no deadline schedules nothing; it is a repeat, not a new deferral.
  if (requestedNextAttemptAtEpochMs === undefined)
    return { kind: 'alreadyApplied', state: current };
  if (requestedNextAttemptAtEpochMs === currentNextAttemptAtEpochMs) {
    return { kind: 'alreadyApplied', state: current };
  }
  // 4. Within one generation a deferred job may only ever wait longer, so a duplicate cannot pull a retry forward
  //    and one generation cannot be replayed into an indefinite postponement.
  if (
    currentNextAttemptAtEpochMs !== undefined &&
    requestedNextAttemptAtEpochMs < currentNextAttemptAtEpochMs
  ) {
    return { kind: 'refused', state: current, requested: current, reason: 'superseded' };
  }
  return {
    kind: 'rescheduled',
    state: 'retryScheduled',
    nextAttemptAtEpochMs: requestedNextAttemptAtEpochMs,
  };
}
