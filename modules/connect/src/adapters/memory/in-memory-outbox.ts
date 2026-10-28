import {
  classifyDeliveryOutcome,
  committedNextAttemptBasis,
  committedScheduleChange,
  isDispatchableJobState,
} from '../../domain/delivery.js';
import type {
  DeliveryJob,
  DeliveryJobState,
  DeliveryOutcomeApplication,
} from '../../domain/delivery.js';
import type { OutboundMessageSnapshot } from '../../domain/outbound-message.js';
import type {
  DeliveryOutcomeRecord,
  EstablishMessageSnapshotRequest,
  LeaseRequest,
  LeasedDeliveryJob,
  TimeAuthority,
  MessageSnapshotResult,
  OutboxPort,
} from '../../ports/outbox-port.js';

interface Entry {
  job: DeliveryJob;
  dueAtEpochMs: number;
  leasedUntilEpochMs: number | undefined;
}

function stateForDecision(record: DeliveryOutcomeRecord): DeliveryJobState {
  switch (record.decision.kind) {
    case 'settled':
      return 'providerAccepted';
    case 'reconcile':
    case 'escalate':
      return 'handoffAmbiguous';
    case 'retry':
      return 'retryScheduled';
    case 'permanent':
      return 'failedPermanent';
    case 'blockedByGuidance':
      // Terminal **for this policy**: the provider's minimum wait exceeds `maxDelayMs`, and retrying
      // earlier is exactly what must not happen. An operator resolves it by widening the ceiling; the
      // distinct `delivery.blockedByGuidance` diagnostic is what tells them why.
      return 'failedPermanent';
    case 'expired':
      return 'expired';
  }
}

/**
 * Reference in-memory outbox. **Not durable and not for production** — it proves the `OutboxPort`
 * contract (lease, attempt history, honest ambiguous state) in tests without any queue, network or
 * filesystem access. Not exported from the package entry point.
 */
export class InMemoryOutbox implements OutboxPort {
  readonly #entries = new Map<string, Entry>();
  readonly #snapshots = new Map<string, OutboundMessageSnapshot>();
  /**
   * The store's own authoritative clock, when it has one (R13-01).
   *
   * Deliberately unset by default: the reference adapter is handed `atEpochMs` by its caller, which is the worker's
   * clock, and a provider minimum must not be started from that. A store that commits under its own authoritative
   * time passes it here, and a superseded provider minimum is then scheduled instead of held.
   */
  readonly #trustedClock: (() => number) | undefined;

  constructor(options: { readonly trustedClock?: () => number } = {}) {
    this.#trustedClock = options.trustedClock;
  }

  enqueue(job: DeliveryJob): void {
    this.#entries.set(job.jobId, {
      job,
      dueAtEpochMs: job.nextAttemptAtEpochMs ?? job.createdAtEpochMs,
      leasedUntilEpochMs: undefined,
    });
  }

  async leaseNext(request: LeaseRequest): Promise<readonly LeasedDeliveryJob[]> {
    const leased: LeasedDeliveryJob[] = [];
    // R14-02: eligibility is decided on the store's own clock when it has one. A caller clock that runs ahead may not
    // extend eligibility — a worker's timestamp is a request, and `min` keeps it from buying time the store does not
    // have. With no clock at all the store cannot attest anything, which is why provider floors are withheld below.
    const trustedNow = this.#trustedClock?.();
    const timeAuthority: TimeAuthority = trustedNow === undefined ? 'caller' : 'store';
    // A store with a clock uses **it**, not the caller's: an ahead clock may not extend eligibility and a behind clock
    // may not shrink it (R14-02).
    const now = trustedNow ?? request.atEpochMs;

    const due = [...this.#entries.values()]
      .filter(
        (entry) =>
          // Dispatchability is a domain policy, not an adapter's opinion (R13-01): a job held for reconciliation must
          // never be leased again, whatever its stored deadline says.
          isDispatchableJobState(entry.job.state) &&
          // A provider floor is a promise to a third party, so it needs a clock the store can attest (R14-02).
          (entry.job.nextAttemptBasis !== 'provider-minimum' || timeAuthority === 'store') &&
          entry.dueAtEpochMs <= now &&
          (entry.leasedUntilEpochMs === undefined || entry.leasedUntilEpochMs <= now),
      )
      .sort((left, right) => left.dueAtEpochMs - right.dueAtEpochMs)
      .slice(0, request.limit);

    for (const entry of due) {
      entry.leasedUntilEpochMs = now + request.leaseMs;
      leased.push({
        job: entry.job,
        leasedUntilEpochMs: entry.leasedUntilEpochMs,
        timeAuthority,
      });
    }
    return leased;
  }

  async recordOutcome(record: DeliveryOutcomeRecord): Promise<DeliveryOutcomeApplication> {
    const entry = this.#entries.get(record.jobId);
    if (entry === undefined) throw new Error(`unknown delivery job: ${record.jobId}`);

    // Same policy as every other writer (R06-02), keyed on attempt identity (R07-01): a duplicate persistence
    // request changes nothing, a new attempt is recorded even when the state it requests is the current one.
    const application = classifyDeliveryOutcome({
      current: entry.job.state,
      requested: stateForDecision(record),
      ...(record.attempt === undefined ? {} : { attemptId: record.attempt.attemptId }),
      persistedAttemptIds: entry.job.attempts.map((attempt) => attempt.attemptId),
      ...(entry.job.nextAttemptAtEpochMs === undefined
        ? {}
        : { currentNextAttemptAtEpochMs: entry.job.nextAttemptAtEpochMs }),
      ...(record.nextAttemptAtEpochMs === undefined
        ? {}
        : { requestedNextAttemptAtEpochMs: record.nextAttemptAtEpochMs }),
      ...(record.expectedScheduleRevision === undefined
        ? {}
        : { expectedScheduleRevision: record.expectedScheduleRevision }),
      ...(entry.job.scheduleRevision === undefined
        ? {}
        : { currentScheduleRevision: entry.job.scheduleRevision }),
      ...(record.scheduleOperationId === undefined
        ? {}
        : { scheduleOperationId: record.scheduleOperationId }),
      ...(entry.job.lastScheduleOperationId === undefined
        ? {}
        : { lastScheduleOperationId: entry.job.lastScheduleOperationId }),
      // Provider guidance travels with the record and is interpreted only by the domain (R12-01), together with the
      // instant this worker saw the answer (R14-01).
      ...(record.providerMinimumWaitMs === undefined
        ? {}
        : { providerMinimumWaitMs: record.providerMinimumWaitMs }),
      ...(record.responseObservedAtEpochMs === undefined
        ? {}
        : { responseObservedAtEpochMs: record.responseObservedAtEpochMs }),
      // Deliberately no `trustedWriteTimeEpochMs` unless this store owns a clock: `atEpochMs` comes from the caller,
      // which is precisely the worker clock R13-01 distrusts. With a clock, the minimum schedules itself.
      ...(this.#trustedClock === undefined
        ? {}
        : { trustedWriteTimeEpochMs: this.#trustedClock() }),
    });
    if (
      application.kind !== 'advanced' &&
      application.kind !== 'recorded' &&
      application.kind !== 'rescheduled'
    ) {
      return application;
    }

    const scheduleChange = committedScheduleChange({
      application,
      ...(entry.job.nextAttemptAtEpochMs === undefined
        ? {}
        : { currentNextAttemptAtEpochMs: entry.job.nextAttemptAtEpochMs }),
      ...(entry.job.scheduleRevision === undefined
        ? {}
        : { currentScheduleRevision: entry.job.scheduleRevision }),
      ...(record.attempt === undefined ? {} : { attemptId: record.attempt.attemptId }),
      ...(record.scheduleOperationId === undefined
        ? {}
        : { scheduleOperationId: record.scheduleOperationId }),
    });

    // The application is the sole authority on the deadline that was committed (R11-01): a write whose schedule was
    // withheld must not overwrite the stored one with the deadline it merely proposed.
    const committedDeadline = application.nextAttemptAtEpochMs;
    // Why that deadline exists travels with it, decided by the module's own rule rather than here (R14-02,
    // CLOSEOUT-01): a guidance-free deferral postpones a provider floor, it never discharges one.
    const nextAttemptBasis = committedNextAttemptBasis({
      application,
      attemptRecorded: record.attempt !== undefined,
      ...(entry.job.nextAttemptBasis === undefined
        ? {}
        : { currentNextAttemptBasis: entry.job.nextAttemptBasis }),
    });

    entry.job = {
      ...entry.job,
      state: application.kind === 'advanced' ? application.to : entry.job.state,
      attempts:
        record.attempt === undefined ? entry.job.attempts : [...entry.job.attempts, record.attempt],
      ...(committedDeadline === undefined
        ? {}
        : {
            nextAttemptAtEpochMs: committedDeadline,
            ...(nextAttemptBasis === undefined ? {} : { nextAttemptBasis }),
          }),
      // Every durable schedule change advances the generation exactly once, whichever writer made it (R10-01).
      ...(scheduleChange === undefined ? {} : scheduleChange),
    };
    entry.dueAtEpochMs = entry.job.nextAttemptAtEpochMs ?? Number.POSITIVE_INFINITY;
    entry.leasedUntilEpochMs = undefined;
    return application;
  }

  get(jobId: string): DeliveryJob | undefined {
    return this.#entries.get(jobId)?.job;
  }

  /** Authoritative read for dispatch revalidation (R07-03); mirrors `FileStore.findJob`. */
  async findJob(jobId: DeliveryJob['jobId']): Promise<DeliveryJob | undefined> {
    return this.#entries.get(jobId)?.job;
  }

  async findMessageSnapshot(
    jobId: DeliveryJob['jobId'],
  ): Promise<OutboundMessageSnapshot | undefined> {
    return this.#snapshots.get(jobId);
  }

  async establishMessageSnapshot({
    job,
    snapshot,
  }: EstablishMessageSnapshotRequest): Promise<MessageSnapshotResult> {
    if (snapshot.jobId !== job.jobId) {
      return { kind: 'conflict', reason: 'snapshot does not belong to this job' };
    }
    const existing = this.#snapshots.get(job.jobId);
    if (existing !== undefined) return { kind: 'alreadyEstablished', snapshot: existing };
    this.#snapshots.set(job.jobId, snapshot);
    return { kind: 'established' };
  }
}
