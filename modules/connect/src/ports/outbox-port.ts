import type {
  DeliveryAttempt,
  DeliveryDecision,
  DeliveryJob,
  DeliveryOutcomeApplication,
} from '../domain/delivery.js';
import type { DeliveryJobId } from '../domain/identifiers.js';
import type { OutboundMessageSnapshot } from '../domain/outbound-message.js';

export interface LeaseRequest {
  readonly atEpochMs: number;
  readonly limit: number;
  readonly leaseMs: number;
}

/**
 * A lease says *who may work*, never *that the work is due* (R14-02).
 *
 * `timeAuthority` reports which clock decided the job was eligible: the store's own (`'store'`) or the caller's
 * (`'caller'`) because the store has no clock it can attest. A caller that needs a provider floor to be honoured —
 * and every dispatch does — must not treat `'caller'` eligibility as an authoritative "the wait has elapsed".
 */
export interface LeasedDeliveryJob {
  readonly job: DeliveryJob;
  readonly leasedUntilEpochMs: number;
  readonly timeAuthority: TimeAuthority;
}

/** Which clock established that a leased job was due (R14-02). */
export type TimeAuthority = 'store' | 'caller';

export interface EstablishMessageSnapshotRequest {
  readonly job: DeliveryJob;
  /** The candidate rendered exactly once, by the dispatcher, immediately before this call. */
  readonly snapshot: OutboundMessageSnapshot;
}

/**
 * Result of establishing the immutable outbound message.
 *
 * `alreadyEstablished` carries the **winner's** snapshot, not the caller's candidate: two workers that
 * rendered different bytes for one job must converge on the bytes that were committed first, otherwise
 * the provider would receive two different payloads under one idempotency key.
 */
export type MessageSnapshotResult =
  | { readonly kind: 'established' }
  | { readonly kind: 'alreadyEstablished'; readonly snapshot: OutboundMessageSnapshot }
  /** The stored record exists but cannot be used (unreadable, or it belongs to another job). */
  | { readonly kind: 'conflict'; readonly reason: string };

/**
 * Both write paths below are **content-bearing** and must respect the deletion fence for their job (R04-02,
 * R05-02): a store must not commit a snapshot or an outcome after that fence exists, and the exclusion must
 * hold across processes and across independently constructed store instances — not merely between callers that
 * share one object. A storage failure that prevents the store from *reading* the fence must refuse the write
 * rather than assume no fence exists (R05-03).
 */

export interface DeliveryOutcomeRecord {
  readonly jobId: DeliveryJobId;
  /** Absent when the job was refused **before** any transport call (M3 pre-dispatch gate). */
  readonly attempt?: DeliveryAttempt;
  readonly decision: DeliveryDecision;
  readonly atEpochMs: number;
  readonly nextAttemptAtEpochMs?: number;
  /**
   * The scheduling revision this write intends to replace (R09-02), and the job's revision as the caller saw it.
   *
   * Required for a **scheduling** write (no attempt, `retry` decision). The store must compare it under the same
   * fence as the write and refuse when the record has moved on, because a later `nextAttemptAtEpochMs` is not proof
   * of a newer decision: during a deployment transition two workers may disagree about "now", and a paused worker
   * can propose a later deadline from a stale view.
   */
  readonly expectedScheduleRevision?: number;
  /**
   * Identity of the scheduling **operation** (R09-02). A store that has already applied an operation with this
   * identity reports `alreadyApplied` instead of scheduling again, so a persistence retry after an unknown outcome
   * cannot postpone the job twice.
   */
  readonly scheduleOperationId?: string;
  /**
   * The provider's own **attested minimum wait** for this outcome, if the observation carried one
   * (`throttled.retryAfterMs`) — and nothing else (R12-01).
   *
   * A store passes it through to `classifyDeliveryOutcome` unchanged; it never derives it. It is the only thing that
   * lets an attempt whose generation has already been superseded move the deadline, and the store must never widen
   * that permission to the record's `nextAttemptAtEpochMs`: ordinary backoff is the worker's opinion, and a stale
   * worker does not get to impose it on the authoritative schedule.
   *
   * The value is a **duration**, not an instant. On its own it proves nothing about *when* the provider expects the
   * wait to have started, so a store that forwards it must also decide whether it can supply `trustedWriteTimeEpochMs`
   * (below). Guidance that cannot be started from a trustworthy instant is held for reconciliation rather than
   * scheduled early (R13-01).
   *
   * **What makes it trustworthy is the transport, not the field.** The Module cannot authenticate a provider: it
   * records what its `MailTransportPort` implementation reported about a request that implementation actually made.
   * Guidance therefore carries exactly the trust of that adapter's response parsing — the module treats it as
   * *guidance to be honoured conservatively*, never as proof of an authenticated instruction, and never as evidence
   * that a message was or was not delivered.
   */
  readonly providerMinimumWaitMs?: number;
  /**
   * The instant this worker **observed the provider's response**, read after the transport call returned (R14-01).
   *
   * A store passes it through unchanged, exactly like `providerMinimumWaitMs`. It is the anchor of last resort for a
   * provider minimum: the store's own commit time (`trustedWriteTimeEpochMs`) supersedes it whenever the store has one,
   * because a worker reading carries no proof about any other clock.
   *
   * **Guarantee:** on the clock that produced it, this instant is not before the response, so an interval started here
   * is never shorter than the provider asked — measured on that clock.
   * **Limit:** it says nothing about how that clock agrees with the store's or the provider's. That is why a store that
   * can attest its own commit time must supply it instead of relying on this field.
   */
  readonly responseObservedAtEpochMs?: number;
  /**
   * The instant the store made **this write durable**, when the store can attest it (R13-01).
   *
   * Optional, and deliberately *not* `atEpochMs`: that value is the worker's clock, and the whole point of R13 is that
   * a provider minimum cannot be started from it. A store that owns an authoritative clock (a database server time, a
   * sequenced commit log, a store-issued monotonic timestamp) supplies this, and the core schedules
   * `trustedWriteTimeEpochMs + providerMinimumWaitMs` — provably not earlier than the provider demanded, because the
   * write necessarily happened after the response.
   *
   * A store that cannot attest such an instant supplies nothing. The core then refuses to schedule a superseded
   * provider minimum at all and holds the job for reconciliation: no deadline is invented, no retry happens inside
   * the provider's window, and the failure is visible rather than silent. Both reference adapters take `atEpochMs`
   * from their caller and therefore supply nothing.
   *
   * The timestamp is validated (safe-integer, positive, non-overflowing); an unusable value is treated as no anchor.
   */
  readonly trustedWriteTimeEpochMs?: number;
}

/**
 * Deferred work queue owned by a provider adapter (M1 §D.3). The Module depends on this port only;
 * a memory implementation exists for tests and is not durable.
 */
export interface OutboxPort {
  /**
   * Lease due jobs. A job must not be handed to two workers at once; leases expire rather than
   * vanishing, so a crashed worker leaves recoverable work.
   *
   * **Time authority (R14-02).** A lease says *who may work*, never *that the work is due*:
   * - a job whose `nextAttemptBasis` is `'provider-minimum'` is leased **only** on a clock the store
   *   attests (its own). With no attestable clock the store skips it — withholding is the
   *   conservative outcome — because a caller's `atEpochMs` may not declare a provider's waiting
   *   interval elapsed;
   * - a caller clock running **ahead** of the store's may not extend eligibility either: the
   *   effective instant is never later than the store's own reading, and the lease is bounded by it;
   * - `timeAuthority` reports which clock decided, so a caller can tell attested eligibility from an
   *   assumption, and `leasedUntilEpochMs` is derived from that same instant;
   * - eligibility also requires `isDispatchableJobState(job.state)` and the stored deadline, so a
   *   held or settled job is never handed out.
   *
   * Both reference adapters accept an injected `trustedClock`; unset means "no attestable clock",
   * which is why they withhold provider floors rather than trusting the caller. A production adapter
   * must supply the storage engine's clock.
   *
   * **Recording the basis (CLOSEOUT-01).** The basis is written with the deadline, from
   * `committedNextAttemptBasis`, never re-derived by the adapter. In particular a **scheduling**
   * write that carries no provider guidance must not clear or downgrade an outstanding
   * `'provider-minimum'`: such a write postpones a promise to a third party, and postponing it can
   * never discharge it. The promise is discharged only by a provider attempt appended to the job,
   * after which the next deadline is ordinary backoff. Both halves matter: without the first, a
   * guidance-free deferral would re-expose the job to caller-clock leasing inside the provider's
   * window; without the second, a store with no clock could never lease the job again.
   */
  leaseNext(request: LeaseRequest): Promise<readonly LeasedDeliveryJob[]>;

  /**
   * Persist the attempt outcome and the decision that followed it, and answer what happened (R06-02, R07-01).
   *
   * Contract obligations:
   * - the policy in `classifyDeliveryOutcome` is authoritative: an outcome never produces `delivered`, and
   *   never leaves `providerAccepted` or a terminal state. A refused write changes nothing;
   * - **attempt identity is the replay test, not state equality.** A write carrying an `attemptId` already in
   *   `job.attempts` is `alreadyApplied` and must not be counted again; a write carrying a *new* `attemptId` is
   *   persisted even when the state it requests equals the current one (`retryScheduled` after a second and third
   *   consecutive failure) and is reported as `recorded`;
   * - a write with no attempt (a pre-dispatch decision) that requests `retryScheduled` is a **scheduling** write.
   *   Its ordering proof is `expectedScheduleRevision` — **mandatory**, and refused as `missing-precondition` when
   *   absent or malformed — and its idempotency proof is `scheduleOperationId`; the requested deadline is only the
   *   payload. A later deadline never outranks a newer revision, and every committed schedule change (an
   *   attempt-less deferral *or* an attempt-bearing retry) increments `job.scheduleRevision` by exactly one, with
   *   `job.lastScheduleOperationId` naming the attempt or operation that caused it. A store that cannot perform the
   *   comparison atomically (a read followed by an unconditional write) does not satisfy this port: it would let a
   *   paused or clock-skewed worker postpone a job another worker already rescheduled (R09-02, R10-01);
   * - **a provider attempt is always recorded; its schedule is usually not.** A retry proposal from an attempt is
   *   committed when `expectedScheduleRevision` is current *and* the deadline does not move earlier. When the
   *   generation is stale or unprovable the attempt is appended alone and reported as `recorded` with
   *   `scheduleSuperseded` (`stale-revision` / `unverified-revision` / `would-accelerate` /
   *   `provider-minimum-unverified`). Losing the attempt would erase a real provider call; applying its backoff would
   *   overwrite a newer decision (R11-01);
   * - **only a provider's attested minimum crosses a generation boundary, and only from a trustworthy anchor.** A
   *   superseded attempt may move the deadline for one reason: the provider stated a minimum wait. Because that is a
   *   *duration* — its interval starts at the provider's response — it is scheduled only from `trustedWriteTimeEpochMs`,
   *   an instant the store attests and which necessarily follows the response, giving
   *   `trustedWriteTimeEpochMs + providerMinimumWaitMs`. A store that cannot attest such an instant passes nothing, and
   *   the write is held for reconciliation instead: no deadline is invented, and no retry happens inside the provider's
   *   window (R13-01). The record's `nextAttemptAtEpochMs` and `atEpochMs` are the worker's own claims and are never
   *   used as that anchor;
   * - **the retry deadline never moves earlier, from any writer, in any generation.** Together with the rule above
   *   this is what preserves a provider's Retry-After minimum against an intervening scheduling write; accelerating a
   *   job is an administrative action, not a scheduling write. The classification reports the deadline it committed,
   *   and an adapter must persist exactly that (`application.nextAttemptAtEpochMs`), never the record's proposal;
   * - a persisted attempt is appended exactly once, with the attempt's own identity, and the write also sets the
   *   state, `nextAttemptAtEpochMs`, the retry accounting the caller derives from `job.attempts`, and clears any
   *   lease for the job;
   * - the authoritative job state and the submission-state projection move in **one** atomic write;
   * - an adapter must return the classification rather than `void`; reporting success for a write it refused is
   *   the defect this returns to prevent. In particular, an adapter must never answer `advanced`/`recorded`/
   *   `rescheduled` for a write whose deadline it did not persist, and must never report a *requested* deadline as
   *   authoritative (R09-01);
   * - read-check-write is serialised against `transitionSubmission`, `leaseNext` and every other writer of the
   *   same job, so a webhook promotion and a late dispatch outcome cannot both decide the final state;
   * - an adapter must return the classification rather than `void`; reporting success for a write it refused is
   *   the defect this returns to prevent.
   */
  recordOutcome(record: DeliveryOutcomeRecord): Promise<DeliveryOutcomeApplication>;

  /**
   * Authoritative read of one job, used to re-establish dispatch authority immediately before a provider call
   * (R07-03).
   *
   * A lease proves *who may work*, not *that the work is still needed*: another worker or a delivery promotion
   * can advance the job after it was leased. The dispatcher re-reads here and refuses to send when the job is no
   * longer dispatchable. This read is necessarily a snapshot — no transport call can be transactional with state
   * persistence — so the store additionally guarantees that the later `recordOutcome` applies the
   * `classifyDeliveryOutcome` policy under the same job fence. Undefined means the job no longer exists.
   */
  findJob(jobId: DeliveryJobId): Promise<DeliveryJob | undefined>;

  /**
   * Read the immutable outbound message for a job, or `undefined` when it has not been established.
   *
   * A dispatcher **must** consult this before rendering: once a snapshot exists, the stored bytes are
   * the message, and re-rendering would break the provider's payload-match idempotency guarantee.
   *
   * The store returns the record **exactly as committed**. It must not re-render, re-normalise, "repair"
   * or partially update a stored message, because the dispatcher re-validates the record it receives
   * (structure, header safety, identifiers and `payloadDigest`) before every provider call and refuses to
   * send anything that fails. A store that rewrites committed bytes is therefore not merely lossy: its
   * jobs stop being delivered.
   */
  findMessageSnapshot(jobId: DeliveryJobId): Promise<OutboundMessageSnapshot | undefined>;

  /**
   * Establish the immutable outbound message. This call is the **atomic** insert-if-absent operation:
   * of two concurrent workers, exactly one receives `established`, and the other receives the winner's
   * snapshot as `alreadyEstablished`. A store that cannot guarantee this (for example a last-write-wins
   * update) does not satisfy the port.
   *
   * The call must resolve only after the snapshot is durable, so a crash after this call but before the
   * provider request cannot lose it. A failure throws; the dispatcher then refuses to send and retries
   * later rather than sending an unrecorded message.
   */
  establishMessageSnapshot(
    request: EstablishMessageSnapshotRequest,
  ): Promise<MessageSnapshotResult>;
}
