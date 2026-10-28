import {
  classifyTransportObservation,
  computeBackoffMs,
  decideDeliveryAction,
  deliveryJobStateForDecision,
  findRetryBudgetProblems,
  isDispatchableJobState,
  type AmbiguityPolicy,
  type AttemptOutcome,
  type DeliveryAttempt,
  type DeliveryDecision,
  type DeliveryJob,
  type DeliveryJobState,
  type DeliveryOutcomeApplication,
  type RetryBudget,
  type TransportObservation,
} from '../domain/delivery.js';
import {
  comparePolicyIdentity,
  findPolicyConfigurationProblems,
  findStoredDestinationProblems,
  isPolicyUsable,
  policyBindingSpecificity,
} from '../domain/destination-policy.js';
import type { InternalCode } from '../domain/error-codes.js';
import {
  createOutboundMessageSnapshot,
  findOutboundMessageProblems,
  findSnapshotAuthorityDrift,
  findStoredSnapshotProblems,
  isIdempotencyNamespace,
  MAX_IDEMPOTENCY_NAMESPACE_LENGTH,
  providerIdempotencyKeyFor,
  type OutboundMessageSnapshot,
} from '../domain/outbound-message.js';
import { identifier } from '../domain/identifiers.js';
import { contextFromAuthorization } from '../domain/communication-context.js';
import type { ClockPort } from '../ports/clock-port.js';
import type { DestinationPolicyPort, PolicyResolution } from '../ports/destination-policy-port.js';
import type { IdGeneratorPort } from '../ports/id-generator-port.js';
import type { MailTransportPort } from '../ports/mail-transport-port.js';
import type { OutboxPort } from '../ports/outbox-port.js';
import type { TelemetryPort } from '../ports/telemetry-port.js';
import { emitDiagnostic } from '../ports/telemetry-port.js';
import type { TemplateRendererPort } from '../ports/template-renderer-port.js';

export interface DispatchDeliveryDependencies {
  readonly outbox: OutboxPort;
  readonly mail: MailTransportPort;
  readonly renderer: TemplateRendererPort;
  /** Mandatory: re-authorize against the current authority before every send (M3 §3). */
  readonly destinationPolicy: DestinationPolicyPort;
  readonly telemetry: TelemetryPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /** Supplied by the owner (`P-06`); never defaulted here. */
  readonly retryBudget: RetryBudget;
  readonly ambiguityPolicy: AmbiguityPolicy;
  /**
   * Namespace for every provider idempotency key this dispatcher derives: one `(installation,
   * environment)` context inside the provider account.
   *
   * It is mandatory and has no default. Two deployments that share a provider account and both call
   * their first job `job-1` would otherwise derive the same key, and the provider would treat the second
   * business's first enquiry as a duplicate of the first business's. See `providerIdempotencyKeyFor`.
   */
  readonly idempotencyNamespace: string;
  /**
   * The provider's documented idempotency retention window, when it has one.
   *
   * Supplying it makes the guarantee provable: the whole retry horizon (`maxAgeMs`) must fit inside the
   * window, so a retry can never reuse a key the provider has already forgotten. Without it, a retry
   * that lands after the window would be a genuinely new send — a possible duplicate. Production
   * wiring for a provider with a bounded window **must** supply it; the Module refuses to guess it.
   */
  readonly providerIdempotencyWindowMs?: number;
  readonly leaseMs: number;
  readonly batchSize: number;
}

export type DispatchResult =
  | {
      readonly kind: 'attempted';
      readonly jobId: string;
      readonly outcome:
        'providerAccepted' | 'handoffAmbiguous' | 'retryableFailure' | 'permanentFailure';
      readonly decision: string;
      /**
       * What the durable store did with this attempt (R07-02). A provider call may have happened — `outcome`
       * reports what was observed — but only `advanced` means the lifecycle state moved, and only `advanced` or
       * `recorded` mean the attempt history grew. `refused` and `unavailable` must never be read as success.
       */
      readonly persistence: DispatchPersistence;
      /**
       * Whether the state below was read from the store. When the write could not be verified this is `false` and
       * `recordedState` is absent: recovery must re-read storage rather than trust this result (R08-02).
       */
      readonly stateKnown: boolean;
      /** The authoritative state after the write, only when the store answered. */
      readonly recordedState?: DeliveryJobState;
      /** The retry deadline now stored, when this write scheduled one. */
      readonly nextAttemptAtEpochMs?: number;
    }
  | {
      /** Refused **before** any transport call; an outcome would be a lie, so there is none. */
      readonly kind: 'refused';
      readonly jobId: string;
      readonly code: InternalCode;
      readonly state: DeliveryJobState;
      readonly reason: string;
      /** Whether the refusal itself was durably recorded (R07-02, R08-02). */
      readonly persistence?: DispatchPersistence;
      /** `false` means `state` is the refusal's intended state and must not be read as durable. */
      readonly stateKnown?: boolean;
      /** The retry deadline now stored, when this refusal deferred the job. */
      readonly nextAttemptAtEpochMs?: number;
    };

/**
 * Truthful persistence vocabulary for one dispatch (R07-02, R08-01): the store's classification, or `unavailable`
 * when the store could not answer, or `not-attempted` when nothing was persisted because nothing was sent.
 */
export type DispatchPersistence =
  | 'advanced'
  | 'recorded'
  | 'rescheduled'
  | 'alreadyApplied'
  | 'refused'
  | 'unavailable'
  | 'not-attempted';

/** Only these mean the store accepted **and** the record changed. */
function isDurable(persistence: DispatchPersistence): boolean {
  return persistence === 'advanced' || persistence === 'recorded' || persistence === 'rescheduled';
}

/**
 * The retry deadline this write is allowed to report (R09-01).
 *
 * A deadline is authoritative only when **this** write committed it: `rescheduled` carries the value the store
 * classified, and `advanced`/`recorded` wrote exactly the requested one. A refused, replayed or unverified write
 * proves nothing about the stored deadline, so it reports none — a caller that needs it must read the job rather
 * than inherit a proposal that may never have been applied.
 */
/**
 * The deadline a persisted write **committed**, if any (R09-01, R11-01).
 *
 * The domain is the only authority on this: an application reports the deadline it wrote, so a refused, replayed or
 * withheld schedule reports none — a caller that needs the stored deadline reads the job rather than inheriting a
 * proposal that may never have been applied.
 */
function committedDeadline(application: DeliveryOutcomeApplication): number | undefined {
  if (application.kind === 'rescheduled') return application.nextAttemptAtEpochMs;
  if (application.kind === 'advanced' || application.kind === 'recorded') {
    return application.nextAttemptAtEpochMs;
  }
  return undefined;
}

type GateDecision =
  | { readonly kind: 'proceed' }
  | {
      readonly kind: 'stop';
      readonly code: InternalCode;
      readonly state: DeliveryJobState;
      readonly reason: string;
    };

/** How one attempt obtains its immutable outbound message (CW-01 Problem A). */
type MessageResolution =
  | { readonly kind: 'ready'; readonly snapshot: OutboundMessageSnapshot }
  | { readonly kind: 'render-failed' }
  | {
      /** Refused **before** any provider request; `permanent` separates a defect from an outage. */
      readonly kind: 'refused';
      readonly permanent: boolean;
      readonly code: InternalCode;
      readonly reason: string;
    };

function stop(code: InternalCode, state: DeliveryJobState, reason: string): GateDecision {
  return { kind: 'stop', code, state, reason };
}

/** The authoritative state a persistence classification leaves the record in. */
function applicationState(application: DeliveryOutcomeApplication): DeliveryJobState {
  return application.kind === 'advanced' ? application.to : application.state;
}

/**
 * Deferred dispatch. It never claims inbox delivery: a settled job means only that the provider took
 * the message, and an ambiguous handoff is recorded as such (M1 §D.1, §D.4.1).
 *
 * **M3 safety gate:** every job passes expiry, attempt-budget and *current-authority* re-authorization
 * checks before any transport call. A refused job makes **zero** transport calls.
 */
export class DispatchDelivery {
  readonly #deps: DispatchDeliveryDependencies;

  constructor(dependencies: DispatchDeliveryDependencies) {
    const problems = findRetryBudgetProblems(dependencies.retryBudget);
    if (problems.length > 0) {
      throw new TypeError(`delivery.retryBudget is invalid: ${problems.join('; ')}`);
    }
    if (!Number.isInteger(dependencies.batchSize) || dependencies.batchSize < 1) {
      throw new TypeError('delivery.batchSize must be a positive integer');
    }
    if (!Number.isInteger(dependencies.leaseMs) || dependencies.leaseMs < 1) {
      throw new TypeError('delivery.leaseMs must be a positive integer');
    }
    if (!isIdempotencyNamespace(dependencies.idempotencyNamespace)) {
      throw new TypeError(
        `delivery.idempotencyNamespace must be 1-${MAX_IDEMPOTENCY_NAMESPACE_LENGTH} characters matching [a-z0-9][a-z0-9._-]*, identifying this deployment inside the provider account`,
      );
    }

    const windowMs = dependencies.providerIdempotencyWindowMs;
    if (windowMs !== undefined) {
      if (!Number.isInteger(windowMs) || windowMs < 1) {
        throw new TypeError('delivery.providerIdempotencyWindowMs must be a positive integer');
      }
      if (windowMs < dependencies.retryBudget.maxAgeMs) {
        throw new TypeError(
          'delivery.providerIdempotencyWindowMs must be >= retryBudget.maxAgeMs; otherwise a retry could reuse an expired provider idempotency key and duplicate the message',
        );
      }
    }

    this.#deps = dependencies;
  }

  async executeOnce(): Promise<readonly DispatchResult[]> {
    const now = this.#deps.clock.nowEpochMs();
    const leased = await this.#deps.outbox.leaseNext({
      atEpochMs: now,
      limit: this.#deps.batchSize,
      leaseMs: this.#deps.leaseMs,
    });

    const results: DispatchResult[] = [];
    for (const { job } of leased) {
      results.push(await this.#attempt(job, now));
    }
    return results;
  }

  async #attempt(job: DeliveryJob, nowEpochMs: number): Promise<DispatchResult> {
    const attemptId = identifier.deliveryAttempt(this.#deps.ids.next('deliveryAttempt'));

    // R07-03: a lease says *who may work*, not that the work is still needed. Authority is re-established against
    // the authoritative record **before** any provider call, because another worker or a delivery promotion may
    // have advanced (or already settled) this job since it was leased.
    const authority = await this.#confirmDispatchAuthority(job);
    if (authority.kind === 'lost') {
      this.#recordFor(job, {
        name: 'delivery.dispatchAuthorityLost',
        code: 'CTX-004',
        jobId: job.jobId,
      });
      return {
        kind: 'refused',
        jobId: job.jobId,
        code: 'CTX-004',
        state: authority.state,
        reason: authority.reason,
        // Nothing is persisted: an outcome for a job whose authority we no longer hold would be a guess about a
        // send that never happened.
        persistence: 'not-attempted',
      };
    }

    const gate = await this.#gate(job, nowEpochMs);
    if (gate.kind === 'stop') {
      const persistence = await this.#persist(job, {
        decision: gate.state === 'expired' ? { kind: 'expired' } : { kind: 'permanent' },
        atEpochMs: nowEpochMs,
      });
      this.#recordFor(job, {
        name: 'delivery.reauthorizationRefused',
        code: gate.code,
        jobId: job.jobId,
      });
      return {
        kind: 'refused',
        jobId: job.jobId,
        code: gate.code,
        // The state the record is actually in — a refused or unverified write must not be reported as the
        // intended state.
        state: persistence.state,
        reason: gate.reason,
        persistence: persistence.kind,
        stateKnown: persistence.stateKnown,
        ...(persistence.nextAttemptAtEpochMs === undefined
          ? {}
          : { nextAttemptAtEpochMs: persistence.nextAttemptAtEpochMs }),
      };
    }

    // CW-01: the outbound message is established **once**, durably, before the first provider request,
    // and every retry re-sends those exact bytes. `#resolveMessage` never renders twice for one job.
    const resolution = await this.#resolveMessage(job, nowEpochMs);
    if (resolution.kind === 'render-failed') {
      // A broken or missing template cannot fix itself: fail permanently rather than send a
      // partially rendered message. No provider request is made; the attempt record is kept for
      // compatibility with the pre-existing contract.
      const attempt: DeliveryAttempt = {
        attemptId,
        jobId: job.jobId,
        startedAtEpochMs: nowEpochMs,
        outcome: 'permanentFailure',
      };
      const persistence = await this.#persist(job, {
        attempt,
        decision: { kind: 'permanent' },
        atEpochMs: nowEpochMs,
      });
      // The diagnostic states a transition, so it is only emitted when the transition is durable (R08-02).
      if (persistence.stateKnown && isDurable(persistence.kind)) {
        this.#recordFor(job, {
          name: 'delivery.failedPermanent',
          code: 'INF-004',
          jobId: job.jobId,
        });
      }
      return {
        kind: 'attempted',
        jobId: job.jobId,
        outcome: 'permanentFailure',
        decision: 'permanent',
        persistence: persistence.kind,
        stateKnown: persistence.stateKnown,
        ...(persistence.stateKnown ? { recordedState: persistence.state } : {}),
        ...(persistence.nextAttemptAtEpochMs === undefined
          ? {}
          : { nextAttemptAtEpochMs: persistence.nextAttemptAtEpochMs }),
      };
    }
    if (resolution.kind === 'refused') {
      // No attempt will be recorded, so the execution identity becomes the *scheduling* operation identity
      // (R09-02): it is what makes a retried persistence of this same decision idempotent.
      return this.#refuse(job, nowEpochMs, resolution, attemptId);
    }
    const message = resolution.snapshot;

    // A thrown transport call is **not** a safe retry: the message may already have left the
    // process, and the adapter supplied no observation. Ambiguity is the only honest reading.
    let observation: TransportObservation | undefined;
    try {
      observation = await this.#deps.mail.send({ message });
    } catch {
      observation = undefined;
    }

    const outcome: AttemptOutcome =
      observation === undefined ? 'handoffAmbiguous' : classifyTransportObservation(observation);
    // R14-01: a provider minimum is a duration **from the response**, and `nowEpochMs` was read before the call — it
    // can be minutes early. Read the clock again now that the call has settled: on this clock the reading is not
    // before the response, so an interval started here is never shorter than the provider asked. The store's own
    // committed time still supersedes it whenever the store can attest one.
    const respondedAtEpochMs = Math.max(nowEpochMs, this.#deps.clock.nowEpochMs());
    const attempt: DeliveryAttempt = {
      attemptId,
      jobId: job.jobId,
      startedAtEpochMs: nowEpochMs,
      outcome,
      ...(observation?.kind === 'accepted' && observation.providerReference !== undefined
        ? { providerReference: observation.providerReference }
        : {}),
    };

    const decision = decideDeliveryAction({
      outcome,
      attemptsMade: job.attempts.length + 1,
      // Age and delay are both measured at the response, not at the moment the batch began.
      jobAgeMs: respondedAtEpochMs - job.createdAtEpochMs,
      budget: this.#deps.retryBudget,
      ambiguityPolicy: this.#deps.ambiguityPolicy,
      // Provider throttling guidance is carried through to the decision instead of being discarded.
      ...(observation?.kind === 'throttled' && observation.retryAfterMs !== undefined
        ? { retryAfterMs: observation.retryAfterMs }
        : {}),
    });

    const persistence = await this.#persist(job, {
      attempt,
      decision,
      atEpochMs: respondedAtEpochMs,
      ...(decision.kind === 'retry'
        ? { nextAttemptAtEpochMs: respondedAtEpochMs + decision.delayMs }
        : {}),
      // An attempt that proposes a retry also states the generation it was taken from (R11-01), so a worker whose
      // provider call outlived another worker's decision cannot replace that newer schedule.
      ...(decision.kind === 'retry' ? { expectedScheduleRevision: job.scheduleRevision ?? 0 } : {}),
      // The provider's own minimum wait, when it stated one, and nothing else (R12-01). It is not our backoff: a
      // superseded attempt may still honour an instruction it received, but it may not impose its own timing.
      ...(observation?.kind === 'throttled' && observation.retryAfterMs !== undefined
        ? { providerMinimumWaitMs: observation.retryAfterMs }
        : {}),
      // …and the instant this worker saw that answer, so the store can bound the wait from a post-response anchor
      // even when it has no clock of its own (R14-01).
      ...(observation?.kind === 'throttled' && observation.retryAfterMs !== undefined
        ? { responseObservedAtEpochMs: respondedAtEpochMs }
        : {}),
    });

    // A diagnostic that names a state transition is only emitted when the transition is durable (R08-02). The
    // store's own refusals and failures were already reported by `#persist`.
    if (persistence.stateKnown && isDurable(persistence.kind)) {
      switch (decision.kind) {
        case 'settled':
          this.#recordFor(job, { name: 'delivery.attempted', code: 'ACC-000', jobId: job.jobId });
          break;
        case 'reconcile':
        case 'escalate':
          this.#recordFor(job, { name: 'delivery.ambiguous', code: 'INF-004', jobId: job.jobId });
          break;
        case 'blockedByGuidance':
          // Not ambiguous: the provider answered clearly and asked for a wait this policy cannot express.
          this.#recordFor(job, {
            name: 'delivery.blockedByGuidance',
            code: 'INF-004',
            jobId: job.jobId,
          });
          break;
        case 'retry':
          // A retry is announced only when a deadline was actually committed (R13-01): a held or superseded write
          // schedules nothing, and claiming otherwise would send operators looking for a retry that does not exist.
          if (persistence.nextAttemptAtEpochMs !== undefined) {
            this.#recordFor(job, {
              name: 'delivery.retryScheduled',
              code: 'INF-004',
              jobId: job.jobId,
            });
          }
          break;
        case 'permanent':
          this.#recordFor(job, {
            name: 'delivery.failedPermanent',
            code: 'INF-004',
            jobId: job.jobId,
          });
          break;
        case 'expired':
          this.#recordFor(job, { name: 'delivery.expired', code: 'INF-004', jobId: job.jobId });
          break;
      }
    }

    return {
      kind: 'attempted',
      jobId: job.jobId,
      outcome,
      decision: decision.kind,
      persistence: persistence.kind,
      stateKnown: persistence.stateKnown,
      ...(persistence.stateKnown ? { recordedState: persistence.state } : {}),
      ...(persistence.nextAttemptAtEpochMs === undefined
        ? {}
        : { nextAttemptAtEpochMs: persistence.nextAttemptAtEpochMs }),
    };
  }

  /**
   * Pre-dispatch gate (M3 §3). Order matters: cheapest and safest checks first, and **no** transport
   * call may happen unless this returns `proceed`.
   *
   * A policy that was removed, disabled, expired, narrowed, re-scoped, re-pointed at another Entity or
   * whose publication association no longer exists means the job is refused — never redirected.
   */
  async #gate(job: DeliveryJob, nowEpochMs: number): Promise<GateDecision> {
    if (nowEpochMs - job.createdAtEpochMs > this.#deps.retryBudget.maxAgeMs) {
      return stop('INF-004', 'expired', 'job exceeded its maximum age');
    }
    if (job.attempts.length >= this.#deps.retryBudget.maxAttempts) {
      return stop('INF-004', 'failedPermanent', 'attempt budget exhausted');
    }

    const context = contextFromAuthorization(job.authorization);

    let resolution: PolicyResolution;
    try {
      resolution = await this.#deps.destinationPolicy.resolve({ context });
    } catch {
      // Cannot prove the destination is still authorized → fail closed without sending.
      return stop('INF-002', 'failedPermanent', 're-authorization unavailable');
    }

    switch (resolution.kind) {
      case 'resolved':
        break;
      case 'notFound':
        return stop('POL-001', 'expired', 'destination policy removed');
      case 'scopeMismatch':
        return stop('POL-002', 'expired', 'policy scope narrowed');
      case 'purposeNotPermitted':
        return stop('POL-003', 'expired', 'purpose no longer permitted');
      case 'senderUnverified':
        return stop('POL-004', 'expired', 'sender no longer verified');
      case 'contextInvalid':
        return stop('CTX-002', 'expired', 'Facet/Site ownership no longer valid');
      case 'associationUnauthorized':
        return stop('CTX-003', 'expired', 'publication association revoked');
      case 'ambiguous':
        return stop('CTX-004', 'expired', 'policy ambiguous at dispatch time');
    }

    const policy = resolution.policy;

    // A policy that is internally defective (duplicate or contradictory recipients, no authorization
    // reference, …) is never a usable authority at dispatch time (M4 §2).
    if (findPolicyConfigurationProblems(policy).length > 0) {
      return stop('POL-001', 'expired', 'current policy is not a valid authority');
    }

    // The policy that authorized acceptance must still be the policy in force. A different identity is
    // never a silent substitute, even when it names the same mailbox (M4 §3). A changed revision is
    // only recognized here; the binding and destination checks below must still prove the authorization
    // surface is byte-for-byte the approved one.
    const identity = comparePolicyIdentity(
      { policyId: job.policyId, policyRevision: job.policyRevision },
      policy,
    );
    if (identity.kind === 'incompatible') {
      return stop('CTX-004', 'expired', identity.reason);
    }

    if (policy.deploymentRef !== job.authorization.deploymentId) {
      return stop('CTX-004', 'expired', 'policy now names another deployment namespace');
    }
    if (policy.ownerRef !== job.authorization.ownerRef) {
      return stop('CTX-004', 'expired', 'policy now names another owner');
    }
    if (policy.purpose !== job.authorization.purpose) {
      return stop('POL-003', 'expired', 'policy purpose changed');
    }
    if (!isPolicyUsable(policy, nowEpochMs)) {
      return stop('POL-001', 'expired', 'policy disabled or expired');
    }
    // Site + placement (Page binding or explicit site-wide) + form + authorization reference must
    // all still match. A page whose binding moved is refused, never re-targeted to the new inbox.
    if (policyBindingSpecificity(policy, context) === undefined) {
      return stop(
        'POL-002',
        'expired',
        'Site, placement, form or authorization is no longer authorized',
      );
    }

    const destinationProblems = findStoredDestinationProblems(policy, {
      to: job.plan.to,
      cc: job.plan.cc,
      fromAddress: job.plan.from.address,
    });
    if (destinationProblems.length > 0) {
      return stop(
        'POL-002',
        'expired',
        `authorized destination changed: ${destinationProblems.join('; ')}`,
      );
    }

    return { kind: 'proceed' };
  }

  /** Delivery events carry the job plus its frozen owner/Site identifiers, never payload content. */
  #recordFor(job: DeliveryJob, event: Record<string, unknown>): void {
    emitDiagnostic(this.#deps.telemetry, {
      ...event,
      deploymentId: job.authorization.deploymentId,
      ownerRef: job.authorization.ownerRef,
      siteRef: job.authorization.siteRef,
    });
  }

  /**
   * The immutable message for this job: the committed snapshot when one exists, otherwise a **single**
   * render that is committed atomically before it is used.
   *
   * Nothing here may fall back to "render again and hope": a second render for one job would produce
   * different bytes under one idempotency key after any template edit, which is precisely what the
   * snapshot exists to prevent.
   */
  async #resolveMessage(job: DeliveryJob, nowEpochMs: number): Promise<MessageResolution> {
    let stored: OutboundMessageSnapshot | undefined;
    try {
      stored = await this.#deps.outbox.findMessageSnapshot(job.jobId);
    } catch {
      return {
        kind: 'refused',
        permanent: false,
        code: 'INF-001',
        reason: 'message snapshot store unavailable',
      };
    }

    if (stored === undefined) {
      let rendered;
      try {
        rendered = await this.#deps.renderer.render({
          template: job.plan.template,
          values: job.plan.renderValues,
          submissionReference: job.plan.submissionReference,
        });
      } catch {
        return { kind: 'render-failed' };
      }

      const candidate = createOutboundMessageSnapshot({
        jobId: job.jobId,
        to: job.plan.to,
        cc: job.plan.cc,
        from: job.plan.from,
        ...(job.plan.replyTo === undefined ? {} : { replyTo: job.plan.replyTo }),
        subject: rendered.subject,
        textBody: rendered.textBody,
        ...(rendered.htmlBody === undefined ? {} : { htmlBody: rendered.htmlBody }),
        providerIdempotencyKey: providerIdempotencyKeyFor(
          this.#deps.idempotencyNamespace,
          job.jobId,
        ),
        submissionReference: job.plan.submissionReference,
        establishedAtEpochMs: nowEpochMs,
      });

      const problems = findOutboundMessageProblems(candidate);
      if (problems.length > 0) {
        return {
          kind: 'refused',
          permanent: true,
          code: 'INF-004',
          reason: `rendered message is not sendable: ${problems.join('; ')}`,
        };
      }

      let established;
      try {
        established = await this.#deps.outbox.establishMessageSnapshot({
          job,
          snapshot: candidate,
        });
      } catch {
        return {
          kind: 'refused',
          permanent: false,
          code: 'INF-001',
          reason: 'message snapshot could not be committed',
        };
      }

      if (established.kind === 'conflict') {
        // The store's own explanation is deliberately not propagated: it is untrusted store text and
        // may name a path or a recipient.
        return {
          kind: 'refused',
          permanent: true,
          code: 'INF-004',
          reason: 'stored message snapshot is unusable',
        };
      }

      // `alreadyEstablished` returns the **winner's** bytes, so two concurrent workers converge on the
      // message that was committed first instead of sending two payloads under one key.
      stored = established.kind === 'alreadyEstablished' ? established.snapshot : candidate;
    }

    // A stored message is data, not authority: re-validate it exactly like a freshly rendered one, and
    // against its own digest, before any provider call. Corruption, a partial write or a store that
    // rewrote the record all end here rather than in an inbox.
    const integrity = findStoredSnapshotProblems(stored);
    if (integrity.length > 0) {
      return {
        kind: 'refused',
        permanent: true,
        code: 'INF-004',
        reason: `stored message snapshot is unusable: ${integrity.join('; ')}`,
      };
    }

    const drift = findSnapshotAuthorityDrift(stored, job, this.#deps.idempotencyNamespace);
    if (drift.length > 0) {
      return {
        kind: 'refused',
        permanent: true,
        code: 'CTX-004',
        reason: `committed message no longer matches the job authority: ${drift.join('; ')}`,
      };
    }

    return { kind: 'ready', snapshot: stored };
  }

  /**
   * Record a refusal that happened **before** any provider request. The outcome record carries no
   * attempt, because claiming one would misstate what happened; a transient refusal schedules a bounded
   * retry with the same deterministic backoff the retry path uses, so an outage cannot spin the queue.
   *
   * The scheduling write is a compare-and-set on the job's scheduling revision (R09-02) and is identified by
   * `scheduleOperationId`, so a retried persistence of the *same* decision is applied at most once.
   */
  async #refuse(
    job: DeliveryJob,
    nowEpochMs: number,
    refusal: { readonly permanent: boolean; readonly code: InternalCode; readonly reason: string },
    scheduleOperationId: string,
  ): Promise<DispatchResult> {
    const decision: DeliveryDecision = refusal.permanent
      ? { kind: 'permanent' }
      : {
          kind: 'retry',
          delayMs: computeBackoffMs(this.#deps.retryBudget, job.attempts.length + 1),
        };

    const persistence = await this.#persist(job, {
      decision,
      atEpochMs: nowEpochMs,
      ...(decision.kind === 'retry'
        ? {
            nextAttemptAtEpochMs: nowEpochMs + decision.delayMs,
            expectedScheduleRevision: job.scheduleRevision ?? 0,
            scheduleOperationId,
          }
        : {}),
    });

    this.#recordFor(job, { name: 'delivery.refused', code: refusal.code, jobId: job.jobId });
    return {
      kind: 'refused',
      jobId: job.jobId,
      code: refusal.code,
      // Whatever the record actually says now; the intended state only when the write committed.
      state: persistence.state,
      reason: refusal.reason,
      persistence: persistence.kind,
      stateKnown: persistence.stateKnown,
      // Only a committed deadline is reported (R09-01).
      ...(persistence.nextAttemptAtEpochMs === undefined
        ? {}
        : { nextAttemptAtEpochMs: persistence.nextAttemptAtEpochMs }),
    };
  }

  /**
   * Re-establish dispatch authority at the point of send (R07-03).
   *
   * A lease is permission to work, and it can outlive the reason for the work: a webhook can promote the job to
   * `delivered`, another worker can record a newer attempt, or the job can be purged. Sending on a stale lease
   * would duplicate the message the webhook already confirmed. The check compares the authoritative state *and*
   * the attempt revision, because a `retryScheduled` job that gained an attempt has moved even though its state
   * label did not.
   *
   * This is deliberately a re-read, not a claim: no provider call can be transactional with state persistence.
   * The obligation this cannot discharge is stated in `OutboxPort.findJob` — the store must apply
   * `classifyDeliveryOutcome` under the same job fence, so the worst case is a late refusal, never a corrupted
   * lifecycle. A production store should go further and make the lease itself conditional on the state it leased.
   */
  async #confirmDispatchAuthority(
    job: DeliveryJob,
  ): Promise<
    | { readonly kind: 'authorized' }
    | { readonly kind: 'lost'; readonly state: DeliveryJobState; readonly reason: string }
  > {
    let current: DeliveryJob | undefined;
    try {
      current = await this.#deps.outbox.findJob(job.jobId);
    } catch {
      // Cannot prove the job is still ours → do not send.
      return { kind: 'lost', state: job.state, reason: 'authoritative job state unavailable' };
    }
    if (current === undefined) {
      return { kind: 'lost', state: job.state, reason: 'delivery job no longer exists' };
    }
    if (!isDispatchableJobState(current.state)) {
      return { kind: 'lost', state: current.state, reason: 'job is no longer dispatchable' };
    }
    if (current.state !== job.state) {
      return {
        kind: 'lost',
        state: current.state,
        reason: 'job state changed since it was leased',
      };
    }
    if (
      current.attempts.length !== job.attempts.length ||
      current.nextAttemptAtEpochMs !== job.nextAttemptAtEpochMs ||
      (current.scheduleRevision ?? 0) !== (job.scheduleRevision ?? 0)
    ) {
      return { kind: 'lost', state: current.state, reason: 'job was advanced since it was leased' };
    }
    return { kind: 'authorized' };
  }

  /**
   * Persist one decision and report what the store actually did (R07-02, R08-02).
   *
   * The report is the authority: `state` is the record's state **only when `stateKnown` is true**. A storage
   * failure yields `stateKnown: false` and the *intended* state, which must never be read as durable — recovery
   * has to re-read storage (`findJob`) rather than trust this result.
   */
  async #persist(
    job: DeliveryJob,
    record: {
      readonly attempt?: DeliveryAttempt;
      readonly decision: DeliveryDecision;
      readonly atEpochMs: number;
      readonly nextAttemptAtEpochMs?: number;
      /** Compare-and-set precondition for a scheduling write (R09-02); absent for an attempt-bearing write. */
      readonly expectedScheduleRevision?: number;
      /** Identity of the scheduling operation, so a retry of it is applied at most once (R09-02). */
      readonly scheduleOperationId?: string;
      /** The provider's attested minimum wait, when the observation carried one (R12-01). */
      readonly providerMinimumWaitMs?: number;
    },
  ): Promise<{
    readonly kind: DispatchPersistence;
    readonly state: DeliveryJobState;
    readonly stateKnown: boolean;
    readonly nextAttemptAtEpochMs?: number;
  }> {
    try {
      const application = await this.#deps.outbox.recordOutcome({ jobId: job.jobId, ...record });
      const state = applicationState(application);
      const nextAttemptAtEpochMs = committedDeadline(application);
      switch (application.kind) {
        case 'alreadyApplied':
          // Not an error, but not a change either: the record was already in this shape.
          this.#recordFor(job, {
            name: 'delivery.outcomeReplay',
            code: 'INF-001',
            jobId: job.jobId,
          });
          break;
        case 'refused':
          // The provider may already have acted; the lifecycle did not move. Say so rather than implying success.
          this.#recordFor(job, {
            name: 'delivery.outcomeRefused',
            code: 'INF-004',
            jobId: job.jobId,
          });
          // A refused scheduling write is either an ordering conflict or a *malformed* one; the second is an
          // operator-visible defect in the caller, not a race (R10-01), so it gets its own signal.
          if (application.reason === 'missing-precondition') {
            this.#recordFor(job, {
              name: 'delivery.schedulePreconditionMissing',
              code: 'INF-004',
              jobId: job.jobId,
            });
          }
          break;
        case 'rescheduled':
          this.#recordFor(job, {
            name: 'delivery.rescheduled',
            code: 'INF-001',
            jobId: job.jobId,
          });
          break;
        case 'advanced':
        case 'recorded':
          // An attempt whose schedule was withheld is neither a failure nor a silence: the provider was called, the
          // attempt is durable, and a newer decision still owns the retry schedule (R11-01). Operators must
          // reconcile rather than assume the job will retry when this worker proposed.
          if (application.kind === 'recorded' && application.scheduleSuperseded !== undefined) {
            this.#recordFor(job, {
              name: 'delivery.scheduleSuperseded',
              code: 'INF-001',
              jobId: job.jobId,
            });
          }
          // The one exception, said out loud (R12-01): the deadline moved because the provider attested a minimum
          // wait, started from a trustworthy instant, not because this worker preferred a later time.
          if (application.providerMinimumWaitMs !== undefined) {
            this.#recordFor(job, {
              name: 'delivery.scheduleExtendedForProviderMinimum',
              code: 'INF-004',
              jobId: job.jobId,
            });
          }
          // A guidance hold (R13-01): the provider demanded a wait this module cannot prove it can honour, so the job
          // stops and an operator must resolve it. Nothing was scheduled, and nothing will be sent meanwhile.
          if (
            application.scheduleSuperseded === 'provider-minimum-unverified' ||
            application.scheduleSuperseded === 'provider-minimum-unanchored'
          ) {
            this.#recordFor(job, {
              name: 'delivery.providerMinimumUnreconciled',
              code: 'INF-004',
              jobId: job.jobId,
            });
          }
          break;
      }
      return {
        kind: application.kind,
        state,
        stateKnown: true,
        ...(nextAttemptAtEpochMs === undefined ? {} : { nextAttemptAtEpochMs }),
      };
    } catch {
      // Storage failure: the caller still reports the provider observation, but **no** state is proven durable —
      // not even the one the lease was granted for. The lease expires and the job is reclaimed, and the next run
      // re-reads the authoritative state instead of inheriting this assumption.
      this.#recordFor(job, {
        name: 'delivery.outcomePersistFailed',
        code: 'INF-001',
        jobId: job.jobId,
      });
      return {
        kind: 'unavailable',
        state: deliveryJobStateForDecision(record.decision),
        stateKnown: false,
      };
    }
  }
}
