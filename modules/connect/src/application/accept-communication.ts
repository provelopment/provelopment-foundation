import { validateContent, type FieldError } from '../domain/content.js';
import { buildDeliveryPlan } from '../domain/delivery-plan.js';
import type { DeliveryJob } from '../domain/delivery.js';
import {
  findPolicyConfigurationProblems,
  isPolicyUsable,
  permittedServiceInterests,
  policyBindingSpecificity,
  requiresAcceptedEnquiryQuota,
  type DestinationPolicy,
  type QuotaLimits,
} from '../domain/destination-policy.js';
import { categoryOf, type InternalCode, type SafeCategory } from '../domain/error-codes.js';
import { fingerprintOf } from '../domain/fingerprint.js';
import { identifier, type SubmissionRef } from '../domain/identifiers.js';
import {
  authorizationFromContext,
  parseCommunicationContext,
  placementKey,
  siteIdentityKeyOfContext,
  type CommunicationContext,
} from '../domain/communication-context.js';
import type { SubmissionRecord } from '../domain/submission.js';
import type { AbuseControlPort, AbuseDecision } from '../ports/abuse-control-port.js';
import type { ClockPort } from '../ports/clock-port.js';
import type { DestinationPolicyPort, PolicyResolution } from '../ports/destination-policy-port.js';
import type { EnquiryQuotaPort, EnquiryQuotaReservation } from '../ports/enquiry-quota-port.js';
import type { FormTokenPort, FormTokenVerdict } from '../ports/form-token-port.js';
import type { IdGeneratorPort } from '../ports/id-generator-port.js';
import type {
  AcceptanceCommit,
  AcceptanceCommitResult,
  SubmissionRepositoryPort,
} from '../ports/submission-repository-port.js';
import { emitDiagnostic } from '../ports/telemetry-port.js';
import type { TelemetryPort } from '../ports/telemetry-port.js';

export interface AcceptCommunicationInput {
  /** Untrusted, caller-supplied context. Validated here; never trusted because of its type. */
  readonly context: unknown;
  /** Untrusted form content. */
  readonly content: unknown;
  /** Visitor-controlled form token; never authority (M1 §C.6). */
  readonly formToken: unknown;
  /** Measured payload size in bytes, when the caller can provide it. */
  readonly payloadBytes?: number;
}

export interface AcceptCommunicationResult {
  readonly category: SafeCategory;
  readonly code: InternalCode;
  readonly submissionRef?: SubmissionRef;
  readonly fieldErrors?: readonly FieldError[];
}

export interface AcceptCommunicationLimits {
  readonly maxPayloadBytes: number;
}

export interface AcceptCommunicationDependencies {
  readonly destinationPolicy: DestinationPolicyPort;
  readonly abuse: AbuseControlPort;
  readonly repository: SubmissionRepositoryPort;
  readonly telemetry: TelemetryPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly limits: AcceptCommunicationLimits;
  /** Optional: without it, the form token is untrusted dedupe input only (M1 §C.6 fallback). */
  readonly formToken?: FormTokenPort;
  /**
   * Optional accepted-enquiry capacity (M5 §3). Distinct from `abuse`, which counts request attempts.
   * Without it, only the attempt budget exists and no successful-enquiry quota is enforced.
   */
  readonly enquiryQuota?: EnquiryQuotaPort;
}

const MAX_FORM_TOKEN_LENGTH = 512;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

interface DedupeKeyResolution {
  readonly kind: 'resolved';
  readonly key: string;
}

interface DedupeKeyRefusal {
  readonly kind: 'refused';
  readonly code: InternalCode;
}

function refuse(code: InternalCode): AcceptCommunicationResult {
  return { category: categoryOf(code), code };
}

/**
 * The single acceptance pipeline. Evaluation order is fixed by M1 §C.5.1
 * (`CTX` → `POL` → `FRM` → `ABS` → `DUP` → `ACC`), so exactly one code is produced per call.
 *
 * `accepted` is returned only after the repository reports a durable commit; a store failure is
 * `unavailable` (`INF-001`), never a false acceptance.
 */
export class AcceptCommunication {
  readonly #deps: AcceptCommunicationDependencies;

  constructor(dependencies: AcceptCommunicationDependencies) {
    const { maxPayloadBytes } = dependencies.limits;
    if (!Number.isInteger(maxPayloadBytes) || maxPayloadBytes <= 0) {
      throw new TypeError('acceptance.limits.maxPayloadBytes must be a positive integer');
    }
    this.#deps = dependencies;
  }

  async execute(input: AcceptCommunicationInput): Promise<AcceptCommunicationResult> {
    const result = await this.#accept(input);
    if (result.category !== 'accepted' && result.category !== 'duplicate') {
      this.#record({ name: 'acceptance.refused', code: result.code });
    }
    return result;
  }

  async #accept(input: AcceptCommunicationInput): Promise<AcceptCommunicationResult> {
    const now = this.#deps.clock.nowEpochMs();

    const contextResult = parseCommunicationContext(input.context);
    if (!contextResult.ok) return refuse(contextResult.error.code);
    const context = contextResult.value;

    const policyResult = await this.#resolvePolicy(context);
    if (policyResult.kind === 'refused') return refuse(policyResult.code);
    const policy = policyResult.policy;

    const policyProblem = this.#checkPolicy(policy, context, now);
    if (policyProblem !== undefined) return refuse(policyProblem);

    // Fail closed when the owner configured an accepted-enquiry quota but no adapter enforces it. A quota is
    // never silently bypassed (0.1.0 release gate, §3A).
    if (requiresAcceptedEnquiryQuota(policy.quotas) && this.#deps.enquiryQuota === undefined) {
      this.#record({ name: 'policy.configInvalid', code: 'POL-001' });
      return refuse('POL-001');
    }

    if (
      input.payloadBytes !== undefined &&
      input.payloadBytes > this.#deps.limits.maxPayloadBytes
    ) {
      return refuse('FRM-002');
    }

    const contentResult = validateContent(context.purpose, input.content, {
      serviceInterests: permittedServiceInterests(policy),
      // The durable policy may author its own floor; absent keeps the released minimum of 10.
      ...(policy.messageMinLength === undefined
        ? {}
        : { messageMinLength: policy.messageMinLength }),
    });
    if (!contentResult.ok) {
      return {
        category: categoryOf(contentResult.error.code),
        code: contentResult.error.code,
        fieldErrors: contentResult.error.fields,
      };
    }
    const content = contentResult.value;

    const dedupe = await this.#resolveDedupeKey(input.formToken, context, now);
    if (dedupe.kind === 'refused') return refuse(dedupe.code);

    const contentFingerprint = fingerprintOf([context.purpose, content.email, content.message]);
    const abuse = await this.#evaluateAbuse(context, contentFingerprint, now, policy.quotas);
    if (abuse !== undefined) return refuse(abuse);

    const siteIdentity = siteIdentityKeyOfContext(context);
    const idempotencyIdentity = [
      context.deploymentId,
      context.publisherRef,
      context.ownerRef,
      context.siteRef,
      placementKey(context.placement),
      context.formRef,
      context.purpose,
      dedupe.key,
    ].join('\u0000');

    const submissionRef = identifier.submission(this.#deps.ids.next('submission'));
    const jobId = identifier.deliveryJob(this.#deps.ids.next('deliveryJob'));

    // Fast-path replay detection (M5 §3): a replay is not a new enquiry, so it must not reserve accepted
    // capacity. `commitAcceptance` remains the atomic authority if the replay races the first submission.
    const existing = await this.#findAccepted(idempotencyIdentity);
    if (existing !== undefined) {
      this.#record({
        name: 'acceptance.duplicate',
        code: 'DUP-001',
        deploymentId: context.deploymentId,
        ownerRef: context.ownerRef,
        siteRef: context.siteRef,
        submissionRef: existing,
      });
      return { category: 'duplicate', code: 'DUP-001', submissionRef: existing };
    }

    // Accepted-enquiry capacity is reserved separately from the request-attempt budget (M5 §3). The
    // reservation is resolved only by a durable commit (`commit`) or by `release` on duplicate/failure.
    const capacity = await this.#reserveEnquiryCapacity(context, policy.quotas, submissionRef, now);
    if (capacity !== undefined) return refuse(capacity);

    const submission: SubmissionRecord = {
      submissionRef,
      siteIdentityKey: siteIdentity,
      purpose: context.purpose,
      policyId: policy.policyId,
      policyRevision: policy.policyRevision,
      idempotencyIdentity,
      contentFingerprint,
      acceptedAtEpochMs: now,
      state: 'accepted',
    };

    const job: DeliveryJob = {
      jobId,
      submissionRef,
      siteIdentityKey: siteIdentity,
      authorization: authorizationFromContext(context),
      policyId: policy.policyId,
      policyRevision: policy.policyRevision,
      createdAtEpochMs: now,
      state: 'queued',
      attempts: [],
      plan: buildDeliveryPlan(policy, content, submissionRef),
      nextAttemptAtEpochMs: now,
      // Baseline of the scheduling generation (R09-02); the first pre-send deferral takes it to 1.
      scheduleRevision: 0,
    };

    const commit = await this.#commit({ submission, job });
    if (commit === undefined) {
      await this.#releaseEnquiryCapacity(submissionRef, 'failedCommit', now);
      return refuse('INF-001');
    }

    if (commit.kind === 'duplicate') {
      // A replay is not a new enquiry: release the held capacity so replays cannot consume the quota.
      await this.#releaseEnquiryCapacity(submissionRef, 'duplicate', now);
      this.#record({
        name: 'acceptance.duplicate',
        code: 'DUP-001',
        deploymentId: context.deploymentId,
        ownerRef: context.ownerRef,
        siteRef: context.siteRef,
        submissionRef: commit.submissionRef,
      });
      return { category: 'duplicate', code: 'DUP-001', submissionRef: commit.submissionRef };
    }

    await this.#commitEnquiryCapacity(submissionRef, commit.submissionRef, now);

    this.#record({
      name: 'acceptance.accepted',
      code: 'ACC-000',
      deploymentId: context.deploymentId,
      ownerRef: context.ownerRef,
      siteRef: context.siteRef,
      submissionRef: commit.submissionRef,
    });
    return { category: 'accepted', code: 'ACC-000', submissionRef: commit.submissionRef };
  }

  async #resolvePolicy(
    context: CommunicationContext,
  ): Promise<
    | { readonly kind: 'resolved'; readonly policy: DestinationPolicy }
    | { readonly kind: 'refused'; readonly code: InternalCode }
  > {
    let resolution: PolicyResolution;
    try {
      resolution = await this.#deps.destinationPolicy.resolve({ context });
    } catch {
      return { kind: 'refused', code: 'INF-002' };
    }

    switch (resolution.kind) {
      case 'resolved':
        return { kind: 'resolved', policy: resolution.policy };
      case 'notFound':
        return { kind: 'refused', code: 'POL-001' };
      case 'scopeMismatch':
        return { kind: 'refused', code: 'POL-002' };
      case 'purposeNotPermitted':
        return { kind: 'refused', code: 'POL-003' };
      case 'senderUnverified':
        return { kind: 'refused', code: 'POL-004' };
      case 'contextInvalid':
        return { kind: 'refused', code: 'CTX-002' };
      case 'associationUnauthorized':
        return { kind: 'refused', code: 'CTX-003' };
      case 'ambiguous':
        return { kind: 'refused', code: 'CTX-004' };
    }
  }

  /**
   * Structural consistency between the resolved policy and the supplied context. A policy that names
   * another owner or deployment namespace, another purpose, a disabled window, or a Site/placement/
   * form/authorization it does not cover is refused — never "repaired" by searching another owner.
   */
  #checkPolicy(
    policy: DestinationPolicy,
    context: CommunicationContext,
    nowEpochMs: number,
  ): InternalCode | undefined {
    const problems = findPolicyConfigurationProblems(policy);
    if (problems.length > 0) {
      this.#record({
        name: 'policy.configInvalid',
        code: 'POL-001',
        counts: { problems: problems.length },
      });
      return 'POL-001';
    }
    if (policy.deploymentRef !== context.deploymentId || policy.ownerRef !== context.ownerRef) {
      return 'CTX-004';
    }
    if (policy.purpose !== context.purpose) return 'POL-003';
    if (!isPolicyUsable(policy, nowEpochMs)) return 'POL-001';
    if (policyBindingSpecificity(policy, context) === undefined) return 'POL-002';
    return undefined;
  }

  async #resolveDedupeKey(
    token: unknown,
    context: CommunicationContext,
    nowEpochMs: number,
  ): Promise<DedupeKeyResolution | DedupeKeyRefusal> {
    if (typeof token !== 'string') return { kind: 'refused', code: 'FRM-005' };
    const trimmed = token.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FORM_TOKEN_LENGTH) {
      return { kind: 'refused', code: 'FRM-005' };
    }
    if (CONTROL_CHARACTER_PATTERN.test(token)) return { kind: 'refused', code: 'FRM-005' };

    const verifier = this.#deps.formToken;
    if (verifier === undefined) {
      // Fallback path (M1 §C.6 rule 2): the key may inform dedupe, it never authorizes anything.
      this.#record({ name: 'formToken.unverified', code: 'FRM-005' });
      return { kind: 'resolved', key: trimmed };
    }

    let verdict: FormTokenVerdict;
    try {
      verdict = await verifier.verify({ token: trimmed, context, atEpochMs: nowEpochMs });
    } catch {
      return { kind: 'refused', code: 'INF-004' };
    }
    if (verdict.kind === 'rejected') return { kind: 'refused', code: 'FRM-005' };
    if (verdict.dedupeKey.trim() === '') return { kind: 'refused', code: 'INF-004' };
    return { kind: 'resolved', key: verdict.dedupeKey };
  }

  async #evaluateAbuse(
    context: CommunicationContext,
    contentFingerprint: string,
    nowEpochMs: number,
    quotas: QuotaLimits,
  ): Promise<InternalCode | undefined> {
    let decision: AbuseDecision;
    try {
      decision = await this.#deps.abuse.evaluate({
        context,
        contentFingerprint,
        atEpochMs: nowEpochMs,
        quotas,
      });
    } catch {
      return 'INF-003';
    }
    switch (decision.kind) {
      case 'allowed':
        return undefined;
      case 'budgetExhausted':
        return 'ABS-001';
      case 'verificationRefused':
        return 'ABS-002';
      case 'verificationUnavailable':
        return 'ABS-003';
    }
  }

  async #commit(commit: AcceptanceCommit): Promise<AcceptanceCommitResult | undefined> {
    try {
      return await this.#deps.repository.commitAcceptance(commit);
    } catch {
      return undefined;
    }
  }

  /** Best-effort replay lookup; a store that cannot answer simply falls through to the atomic commit. */
  async #findAccepted(idempotencyIdentity: string): Promise<SubmissionRef | undefined> {
    try {
      return await this.#deps.repository.findAcceptedByIdentity(idempotencyIdentity);
    } catch {
      return undefined;
    }
  }

  /**
   * Reserves accepted-enquiry capacity, if a quota adapter is configured. Deliberately runs **after** the
   * request-attempt budget and **before** the commit, so the two budgets answer different questions and
   * neither can consume the other's capacity.
   */
  async #reserveEnquiryCapacity(
    context: CommunicationContext,
    quotas: QuotaLimits,
    reservationRef: SubmissionRef,
    atEpochMs: number,
  ): Promise<InternalCode | undefined> {
    const quota = this.#deps.enquiryQuota;
    if (quota === undefined) return undefined;

    let reservation: EnquiryQuotaReservation;
    try {
      reservation = await quota.reserve({
        reservationRef,
        submissionRef: reservationRef,
        context,
        quotas,
        atEpochMs,
      });
    } catch {
      return 'INF-005';
    }

    switch (reservation.kind) {
      case 'reserved':
        return undefined;
      case 'exhausted':
        this.#record({ name: 'acceptance.quotaExhausted', code: 'ABS-004' });
        return 'ABS-004';
      case 'unavailable':
        return 'INF-005';
    }
  }

  /** Releases a held reservation. A release failure is recorded, never turned into a false acceptance. */
  async #releaseEnquiryCapacity(
    reservationRef: SubmissionRef,
    reason: 'duplicate' | 'failedCommit',
    atEpochMs: number,
  ): Promise<void> {
    const quota = this.#deps.enquiryQuota;
    if (quota === undefined) return;
    try {
      await quota.release({ reservationRef, reason, atEpochMs });
    } catch {
      this.#record({ name: 'acceptance.quotaCommitFailed', code: 'INF-004' });
    }
  }

  /**
   * Commits capacity **after** the record is durable. A failure here under-counts the owner's usage but can
   * never revoke an acceptance that already exists, so it is recorded and swallowed.
   */
  async #commitEnquiryCapacity(
    reservationRef: SubmissionRef,
    submissionRef: SubmissionRef,
    atEpochMs: number,
  ): Promise<void> {
    const quota = this.#deps.enquiryQuota;
    if (quota === undefined) return;
    try {
      await quota.commit({ reservationRef, submissionRef, atEpochMs });
    } catch {
      this.#record({ name: 'acceptance.quotaCommitFailed', code: 'INF-004' });
    }
  }

  #record(event: Record<string, unknown>): void {
    emitDiagnostic(this.#deps.telemetry, event);
  }
}
