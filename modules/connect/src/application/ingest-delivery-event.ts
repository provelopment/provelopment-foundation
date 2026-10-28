import {
  evaluateDeliveryCorrelation,
  findDeliveryEventProblems,
  findEventCorrelationRefusal,
  type DeliveryCorrelation,
  type DeliveryEvidenceRefusal,
} from '../domain/delivery-event.js';
import { mintAuthenticatedEvidence } from '../domain/delivery-evidence-registry.js';
import type { DeliveryJobId, SubmissionRef } from '../domain/identifiers.js';
import type {
  DeliveryEventStorePort,
  DeliveryEventVerifierPort,
  DeliveryVerificationFailure,
  DeliveryVerificationIgnore,
} from '../ports/delivery-event-port.js';
import type { SubmissionStateStorePort } from '../ports/submission-state-port.js';

export interface IngestDeliveryEventDependencies {
  /** Trusted infrastructure: signature verification over the raw body, supplied by the consumer. */
  readonly verifier: DeliveryEventVerifierPort;
  /** Durable store for verified events, idempotent by `eventId`. */
  readonly events: DeliveryEventStorePort;
  /** Conditional lifecycle writes. Without this the Module cannot claim a submission moved. */
  readonly states: SubmissionStateStorePort;
}

export interface IngestDeliveryEventRequest {
  /** The request body exactly as received. A signature covers these bytes, not a parsed object. */
  readonly rawBody: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly receivedAtEpochMs: number;
  /**
   * Built from the consumer's **own durable job record** — never from callback fields. This is what the
   * evidence will be about, so a payload cannot choose its own subject.
   */
  readonly correlation: DeliveryCorrelation;
}

/**
 * Why authenticated, complete delivery evidence did **not** become a committed `delivered` state.
 *
 * - `not-found` / `owner-mismatch`: the record is missing or belongs to someone else;
 * - `transition-refused`: the authoritative state does not allow `delivered` (expired, already failed, …);
 * - `unavailable`: the state store failed. The evidence is kept, so a retry is safe and idempotent.
 */
export type DeliveryCommitRefusal =
  'not-found' | 'owner-mismatch' | 'transition-refused' | 'unavailable';

/**
 * What happened to one inbound delivery callback.
 *
 * Three facts are kept apart on purpose (R05-01):
 *
 * 1. **authenticated evidence** — the verifier vouched for the callback, every event matched the job, and every
 *    frozen recipient was delivered;
 * 2. **eligibility** — that evidence permits `delivered` for this submission;
 * 3. **commitment** — the authoritative state was durably advanced.
 *
 * Only `delivered` means (3) happened. `deliveryConfirmed` means (1) and (2) hold and (3) did **not**, and must
 * never be reported to a provider as success. `alreadyDelivered` means the store was already at the target —
 * truthful for a replay, but this call moved nothing.
 */
export type DeliveryIngestionResult =
  | { readonly kind: 'rejected'; readonly reason: DeliveryVerificationFailure }
  | { readonly kind: 'ignored'; readonly reason: DeliveryVerificationIgnore }
  | {
      readonly kind: 'malformed';
      readonly eventIndex: number;
      readonly problems: readonly string[];
    }
  /** The same provider event id arrived with different content: escalate, do not guess. */
  | { readonly kind: 'conflict'; readonly eventId: string }
  | { readonly kind: 'pending'; readonly reason: DeliveryEvidenceRefusal }
  | {
      /** Eligible and committed: the authoritative submission state is now `delivered`. */
      readonly kind: 'delivered';
      readonly jobId: DeliveryJobId;
      readonly submissionRef: SubmissionRef;
      readonly recipients: readonly string[];
    }
  | {
      /** The store was already at `delivered`; nothing was written. */
      readonly kind: 'alreadyDelivered';
      readonly jobId: DeliveryJobId;
      readonly submissionRef: SubmissionRef;
    }
  | {
      /**
       * Authenticated evidence is complete and eligible, but no durable commit happened. The caller must not
       * report success; the submission is unchanged.
       */
      readonly kind: 'deliveryConfirmed';
      readonly reason: DeliveryCommitRefusal;
      readonly jobId: DeliveryJobId;
      readonly submissionRef: SubmissionRef;
      readonly recipients: readonly string[];
    };

/**
 * The supported ingestion workflow for provider delivery callbacks (R04-01, corrected by R05-01).
 *
 * **Why this exists.** A pure "correlate these events" helper could be called with objects the caller built
 * itself, so its output proved only that the Module had been asked nicely. Provenance of an object is not
 * authenticity of a provider event. This use case is the only path from provider input to `delivered`, and it
 * never accepts events from its caller — only raw bytes, which the trusted verifier must authenticate first.
 *
 * **Why commitment is separate from eligibility.** `recordDelivery` is a pure lifecycle check; running it moves
 * nothing. Reporting `delivered` on the strength of a pure check claimed a state change that had not happened
 * and that no reader could observe. Now the use case mints evidence, asks the state store to commit a
 * conditional transition using the store's **own** current state, and reports `delivered` only when the store
 * says it committed. Everything else is reported as eligibility (`deliveryConfirmed`) or as a replay
 * (`alreadyDelivered`), never as movement.
 *
 * **Division of responsibility.**
 *
 * - The **verifier** (consumer-owned, trusted) proves the callback is authentic over the raw bytes and maps the
 *   provider message reference onto Module identity (`jobId`, `ownerRef`, `submissionRef`). It is the trust root.
 * - The **event store** keeps verified events, idempotently by `eventId`, so retries and out-of-order arrival
 *   are safe.
 * - The **state store** owns the authoritative lifecycle state and commits the transition atomically.
 * - The **Module** proves that the stored events agree with the job's frozen facts, that every frozen recipient
 *   was delivered, and that the evidence names the submission being moved. It mints evidence only here.
 *
 * **Trust assumption, stated plainly:** a consumer-supplied verifier is trusted infrastructure. An
 * implementation that answers `verified` for unauthenticated input defeats this boundary, and no in-process
 * check can detect that — the Module does not pretend otherwise.
 *
 * **Failure and retry.** A state-store failure returns `deliveryConfirmed / unavailable` and never `delivered`;
 * the verified events are already durable, so retrying the callback is idempotent and safe. A retry that finds
 * the state already advanced returns `alreadyDelivered`.
 *
 * **Not a webhook endpoint.** This is the provider-neutral step an endpoint calls after it has the raw body.
 */
export class IngestDeliveryEvent {
  readonly #deps: IngestDeliveryEventDependencies;

  constructor(dependencies: IngestDeliveryEventDependencies) {
    this.#deps = dependencies;
  }

  async execute(request: IngestDeliveryEventRequest): Promise<DeliveryIngestionResult> {
    // 1. The trust boundary. Nothing downstream happens without an authenticated verdict, and the caller's
    //    own idea of what the callback said is never consulted.
    const verification = await this.#deps.verifier.verify({
      rawBody: request.rawBody,
      headers: request.headers,
      receivedAtEpochMs: request.receivedAtEpochMs,
    });
    if (verification.kind === 'rejected') return { kind: 'rejected', reason: verification.reason };
    if (verification.kind === 'ignored') return { kind: 'ignored', reason: verification.reason };

    // 2. Structure and correlation before storage: an event that is malformed, or that is about another job,
    //    owner, submission, message or recipient, is refused before anything durable is written.
    for (const [index, event] of verification.events.entries()) {
      const problems = findDeliveryEventProblems(event);
      if (problems.length > 0) return { kind: 'malformed', eventIndex: index, problems };
      const refusal = findEventCorrelationRefusal(request.correlation, event);
      if (refusal !== undefined) return { kind: 'pending', reason: refusal };
    }

    // 3. Durable, idempotent storage. A contradiction is surfaced, never merged.
    for (const event of verification.events) {
      const outcome = await this.#deps.events.record(event);
      if (outcome === 'conflict') return { kind: 'conflict', eventId: event.eventId };
    }

    // 4. Evaluate over the **stored** set: a retried callback, a late event or a batch split across two
    //    invocations all produce the same answer, because the answer is a function of stored evidence.
    const stored = await this.#deps.events.listForJob(request.correlation.jobId);
    const evaluation = evaluateDeliveryCorrelation(request.correlation, stored);
    if (evaluation.kind === 'pending') return evaluation;

    // 5. The single minting site, reachable only after step 1 produced a verified verdict and step 4 a
    //    satisfied correlation. Evidence is minted from the correlation itself, so it cannot describe
    //    anything the payload chose.
    const { jobId, ownerRef, submissionRef, recipients } = request.correlation;
    const evidence = mintAuthenticatedEvidence({
      kind: 'authenticated-delivery-signal' as const,
      providerReference: request.correlation.providerReference,
      jobId,
      ownerRef,
      submissionRef,
      recipients: [...recipients],
    });

    const eligible = { jobId, submissionRef, recipients: [...recipients] };

    // 6. Commitment. The store reads its own state and decides; the Module contributes no expectation, so a
    //    stale reader cannot overwrite a newer fact.
    let outcome;
    try {
      outcome = await this.#deps.states.transitionSubmission({
        submissionRef,
        ownerRef,
        jobId,
        to: 'delivered',
        evidence,
      });
    } catch {
      // The commit did not happen. Say so, and keep the evidence: the callback can be retried safely.
      return { kind: 'deliveryConfirmed', reason: 'unavailable', ...eligible };
    }

    if (outcome.kind === 'committed') return { kind: 'delivered', ...eligible };
    if (outcome.kind === 'alreadyAtTarget') {
      return { kind: 'alreadyDelivered', jobId, submissionRef };
    }

    const reason: DeliveryCommitRefusal =
      outcome.kind === 'notFound'
        ? 'not-found'
        : outcome.kind === 'ownerMismatch'
          ? 'owner-mismatch'
          : 'transition-refused';
    return { kind: 'deliveryConfirmed', reason, ...eligible };
  }
}
