/**
 * One direct send, end to end (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`, corrected by `…-R02`).
 *
 * The whole storage-free claim is expressed by what this class does **not** depend on. There is no
 * submission repository, no outbox, no delivery-event store, no state store, no enquiry-capacity ledger, no
 * form-token verifier and no retry scheduler — not "optional, unused" but **absent from the dependency
 * type**, so a later implementer cannot quietly introduce persistence: there is no slot to pass it through.
 *
 * What it does, in the fixed order the Module uses everywhere (`CTX` → `POL` → `FRM` → `ABS` → send):
 *
 * 1. parse the supplied context — untrusted, never trusted because of its TypeScript type;
 * 2. parse the consumed policy candidate — Connect validates it, the consumer only supplies authored facts;
 * 3. prove the policy covers this context (Site, placement, form, authorization) with the **shared**
 *    algorithm, and that owner/deployment/purpose agree;
 * 4. refuse a policy whose authored attempt budget nothing here can enforce (correction R02-01);
 * 5. refuse an oversized request;
 * 6. validate and normalize the visitor's content with the **shared** validator;
 * 7. apply the attempt budget when an adapter is configured, refusing when it is exhausted or unavailable;
 * 8. build the message through the **shared** delivery-plan authority and render it;
 * 9. perform exactly one transport call;
 * 10. classify it honestly (ambiguity is a first-class outcome);
 * 11. emit allowlisted diagnostics only.
 *
 * It never retries. A direct send has no store, so a "retry" could double a message the provider already
 * accepted and could never be reconciled against anything.
 */
import { assertHeaderSafe } from '../domain/escaping.js';
import { validateContent, type FieldError } from '../domain/content.js';
import { buildDeliveryPlan } from '../domain/delivery-plan.js';
import {
  directSendOutcome,
  parseDirectSendPolicy,
  type DirectSendNotSentReason,
  type DirectSendOutcome,
} from '../domain/direct-send.js';
import { categoryOf, type InternalCode } from '../domain/error-codes.js';
import {
  policyBindingSpecificity,
  requiresAttemptBudget,
  type QuotaLimits,
} from '../domain/destination-policy.js';
import type { TransportObservation } from '../domain/delivery.js';
import { fingerprintOf } from '../domain/fingerprint.js';
import { identifier, MAX_IDENTIFIER_LENGTH, type TransmissionRef } from '../domain/identifiers.js';
import {
  parseCommunicationContext,
  type CommunicationContext,
} from '../domain/communication-context.js';
import { directSendIdempotencyKeyFor, isIdempotencyNamespace } from '../domain/outbound-message.js';
import type { AbuseControlPort, AbuseDecision } from '../ports/abuse-control-port.js';
import type { ClockPort } from '../ports/clock-port.js';
import type { IdGeneratorPort } from '../ports/id-generator-port.js';
import type { MailTransportPort, OutboundMailMessage } from '../ports/mail-transport-port.js';
import type { RenderedMessage, TemplateRendererPort } from '../ports/template-renderer-port.js';
import type { TelemetryPort } from '../ports/telemetry-port.js';
import { emitDiagnostic } from '../ports/telemetry-port.js';

export interface SendDirectEnquiryInput {
  /** The consumer's authored policy candidate. Untrusted: parsed and validated here, before any transport call. */
  readonly policy: unknown;
  /** Untrusted communication context. */
  readonly context: unknown;
  /** Untrusted visitor content. */
  readonly content: unknown;
  /** Measured payload size in bytes, when the caller can provide it. */
  readonly payloadBytes?: number;
}

export interface SendDirectEnquiryLimits {
  readonly maxPayloadBytes: number;
}

export interface SendDirectEnquiryDependencies {
  readonly transport: MailTransportPort;
  readonly renderer: TemplateRendererPort;
  readonly telemetry: TelemetryPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  /**
   * Optional request-attempt accounting.
   *
   * It is optional **only** for a policy that configures no attempt budget. Once an owner authors
   * `quotas.attemptPerOwnerHour` or `quotas.attemptPerSiteHour`, enforcement stops being optional: `execute`
   * refuses as `POL-001` when this adapter is absent, so an authored limit can never be silently ignored
   * (correction R02-01). With no budget configured, a store-free deployment needs no counter at all and the
   * hostile-traffic knob is the hosting layer's (edge rate limiting / WAF) — an operator responsibility
   * recorded in the Module's implementation notes, never a claim this use case makes.
   */
  readonly abuse?: AbuseControlPort;
  readonly limits: SendDirectEnquiryLimits;
  /** One `(installation, environment)` pair; scopes the provider idempotency key. */
  readonly idempotencyNamespace: string;
}

/**
 * The header fields of a message that is about to leave. The durable path applies the same guard through
 * `findOutboundMessageProblems` on every stored snapshot; here it is applied to the one fresh message,
 * because a renderer that emits a CR/LF into a subject — or a policy whose display name carries a control
 * character — is a configuration defect, not something to send.
 */
function hasUnsafeHeader(message: OutboundMailMessage): boolean {
  const headerValues: readonly string[] = [
    ...message.to,
    ...message.cc,
    message.from.address,
    message.from.displayName,
    ...(message.replyTo === undefined ? [] : [message.replyTo]),
    message.subject,
    message.providerIdempotencyKey,
    message.submissionReference,
  ];
  return headerValues.some((value) => !assertHeaderSafe(value).ok);
}

/**
 * A transmission identity must be usable as an opaque provider-key segment: non-empty, bounded, and free of
 * whitespace or control characters. Connect mints it itself, so a value that fails this is a wiring defect
 * and no key is ever derived from it (correction R02-03).
 */
function isUsableTransmissionIdentity(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return false;
  return !/[\u0000-\u001f\u007f\s]/.test(value);
}

/**
 * The single direct-send use case.
 *
 * `execute` never throws for an expected refusal and never throws for a transport failure: every outcome,
 * including "we do not know", is returned as a value.
 */
export class SendDirectEnquiry {
  readonly #deps: SendDirectEnquiryDependencies;

  constructor(dependencies: SendDirectEnquiryDependencies) {
    const { maxPayloadBytes } = dependencies.limits;
    if (!Number.isInteger(maxPayloadBytes) || maxPayloadBytes <= 0) {
      throw new TypeError('directSend.limits.maxPayloadBytes must be a positive integer');
    }
    if (!isIdempotencyNamespace(dependencies.idempotencyNamespace)) {
      throw new TypeError('directSend.idempotencyNamespace must be a valid idempotency namespace');
    }
    const transport = dependencies.transport as { send?: unknown } | undefined;
    if (transport === undefined || typeof transport.send !== 'function') {
      throw new TypeError('directSend.transport must implement send()');
    }
    const renderer = dependencies.renderer as { render?: unknown } | undefined;
    if (renderer === undefined || typeof renderer.render !== 'function') {
      throw new TypeError('directSend.renderer must implement render()');
    }
    this.#deps = dependencies;
  }

  async execute(input: SendDirectEnquiryInput): Promise<DirectSendOutcome> {
    const now = this.#deps.clock.nowEpochMs();

    const contextResult = parseCommunicationContext(input.context);
    if (!contextResult.ok) return this.#refuse(contextResult.error.code);
    const context = contextResult.value;

    const policyResult = parseDirectSendPolicy(input.policy, { atEpochMs: now });
    if (!policyResult.ok) {
      // Counts only: the problem strings are operator material and never enter a diagnostic event.
      this.#record({
        name: 'policy.configInvalid',
        code: policyResult.error.code,
        counts: { problems: policyResult.error.problems.length },
      });
      return this.#refuse(policyResult.error.code);
    }
    const policy = policyResult.value;

    // The consumer proved the *external* association; this check proves the *supplied policy* covers the
    // *supplied context*, and that the two name one owner and one deployment.
    if (policy.deploymentRef !== context.deploymentId || policy.ownerRef !== context.ownerRef) {
      return this.#refuse('CTX-004');
    }
    if (policy.purpose !== context.purpose) return this.#refuse('POL-003');
    if (policyBindingSpecificity(policy, context) === undefined) return this.#refuse('POL-002');

    // An authored limit is a promise to the owner. If this policy declares a request-attempt budget, an
    // adapter must actually enforce it — `abuse` is optional only for policies that configure none. Refused
    // as `POL-001` (configuration), exactly as the durable path refuses a configured accepted-enquiry quota
    // without a ledger, and **before** any transport call (correction R02-01).
    if (requiresAttemptBudget(policy.quotas) && this.#deps.abuse === undefined) {
      this.#record({ name: 'policy.configInvalid', code: 'POL-001', counts: { problems: 1 } });
      return this.#refuse('POL-001');
    }

    if (
      input.payloadBytes !== undefined &&
      input.payloadBytes > this.#deps.limits.maxPayloadBytes
    ) {
      return this.#refuse('FRM-002');
    }

    const contentResult = validateContent(context.purpose, input.content, {
      ...(policy.messageMinLength === undefined
        ? {}
        : { messageMinLength: policy.messageMinLength }),
    });
    if (!contentResult.ok) {
      return this.#refuse(contentResult.error.code, contentResult.error.fields);
    }
    const content = contentResult.value;

    const abuseDecision = await this.#evaluateAbuse(
      context,
      fingerprintOf([context.purpose, content.email, content.message]),
      now,
      policy.quotas,
    );
    if (abuseDecision !== undefined) return this.#refuse(abuseDecision);

    const transmissionId: unknown = this.#deps.ids.next('transmission');
    if (!isUsableTransmissionIdentity(transmissionId)) {
      // Connect mints this identity itself, so an unusable one is a wiring defect: no key is derived from it
      // and nothing is sent.
      return this.#notSent('configuration', context);
    }
    const transmissionRef = identifier.transmission(transmissionId);
    const plan = buildDeliveryPlan(policy, content, transmissionRef);

    let rendered: RenderedMessage;
    try {
      rendered = await this.#deps.renderer.render({
        template: plan.template,
        values: plan.renderValues,
        submissionReference: transmissionRef,
      });
    } catch {
      // A missing or broken template cannot fix itself, and nothing has been transmitted.
      return this.#notSent('configuration', context, transmissionRef);
    }

    const message: OutboundMailMessage = {
      to: plan.to,
      cc: plan.cc,
      from: plan.from,
      ...(plan.replyTo === undefined ? {} : { replyTo: plan.replyTo }),
      subject: rendered.subject,
      textBody: rendered.textBody,
      ...(rendered.htmlBody === undefined ? {} : { htmlBody: rendered.htmlBody }),
      // The same derivation authority as the durable path, in a space that provably cannot intersect it
      // (correction R02-03).
      providerIdempotencyKey: directSendIdempotencyKeyFor(
        this.#deps.idempotencyNamespace,
        transmissionRef,
      ),
      submissionReference: transmissionRef,
    };
    if (hasUnsafeHeader(message)) {
      return this.#notSent('configuration', context, transmissionRef);
    }

    // Exactly one call, and a thrown call is **not** evidence that nothing was transmitted.
    let observation: TransportObservation | undefined;
    try {
      observation = await this.#deps.transport.send({ message });
    } catch {
      observation = undefined;
    }

    const outcome = directSendOutcome(observation, transmissionRef);
    this.#recordSendOutcome(outcome, transmissionRef, context);
    return outcome;
  }

  /** Refusal **before** any transport call: the released vocabulary, and never a delivery claim. */
  #refuse(code: InternalCode, fieldErrors?: readonly FieldError[]): DirectSendOutcome {
    this.#record({ name: 'directSend.refused', code });
    return {
      kind: 'refused',
      category: categoryOf(code),
      code,
      ...(fieldErrors === undefined ? {} : { fieldErrors }),
    };
  }

  /**
   * A definite non-send. `transmissionRef` is absent only when the send could not even be given an identity,
   * in which case there is nothing to correlate and nothing was transmitted.
   */
  #notSent(
    reason: DirectSendNotSentReason,
    context: CommunicationContext,
    transmissionRef?: TransmissionRef,
  ): DirectSendOutcome {
    this.#record({
      name: 'directSend.notSent',
      outcome: reason,
      ...(transmissionRef === undefined ? {} : { transmissionRef }),
      deploymentId: context.deploymentId,
      ownerRef: context.ownerRef,
      siteRef: context.siteRef,
    });
    return { kind: 'notSent', reason };
  }

  #recordSendOutcome(
    outcome: DirectSendOutcome,
    transmissionRef: TransmissionRef,
    context: CommunicationContext,
  ): void {
    const where = {
      transmissionRef,
      deploymentId: context.deploymentId,
      ownerRef: context.ownerRef,
      siteRef: context.siteRef,
    };
    switch (outcome.kind) {
      case 'providerAccepted':
        this.#record({ name: 'directSend.providerAccepted', ...where });
        return;
      case 'ambiguous':
        this.#record({ name: 'directSend.ambiguous', outcome: outcome.reason, ...where });
        return;
      case 'notSent':
        this.#record({ name: 'directSend.notSent', outcome: outcome.reason, ...where });
        return;
      case 'refused':
        // Already recorded by `#refuse`; no transport call happened.
        return;
    }
  }

  /**
   * The optional request-attempt budget. An absent adapter means **no application-level accounting at all**,
   * and this method says so by returning `undefined` rather than pretending a limit was enforced.
   */
  async #evaluateAbuse(
    context: CommunicationContext,
    contentFingerprint: string,
    nowEpochMs: number,
    quotas: QuotaLimits | undefined,
  ): Promise<InternalCode | undefined> {
    const abuse = this.#deps.abuse;
    if (abuse === undefined) return undefined;

    let decision: AbuseDecision;
    try {
      decision = await abuse.evaluate({
        context,
        contentFingerprint,
        atEpochMs: nowEpochMs,
        // A direct send has no accepted-enquiry capacity to report; attempt limits pass through unchanged.
        quotas: quotas ?? {},
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

  #record(event: Record<string, unknown>): void {
    emitDiagnostic(this.#deps.telemetry, event);
  }
}
