import type { DeliveryJobId, OwnerId, SubmissionRef } from './identifiers.js';

/**
 * Verified delivery evidence (resend-readiness §5 CW-04).
 *
 * Four states must never be conflated:
 * 1. the Module accepted the submission;
 * 2. the provider accepted the **request**;
 * 3. delivery was confirmed by **authenticated provider evidence**;
 * 4. delivery failed or is still unresolved.
 *
 * This module owns (3) and (4) only, and only per recipient. A provider reports outcomes for individual
 * recipients, so "one recipient was delivered" is never evidence that the others were.
 */
export const RECIPIENT_OUTCOME_KINDS = [
  'delivered',
  'deferred',
  'bounced',
  'complained',
  'suppressed',
  'failed',
] as const;

export type RecipientOutcomeKind = (typeof RECIPIENT_OUTCOME_KINDS)[number];

/** Outcomes that describe a completed, unsuccessful delivery and cannot be undone by a later event. */
const TERMINAL_NEGATIVE: ReadonlySet<RecipientOutcomeKind> = new Set([
  'bounced',
  'complained',
  'suppressed',
  'failed',
]);

export interface RecipientOutcome {
  readonly address: string;
  readonly kind: RecipientOutcomeKind;
}

/**
 * One verified provider event, already correlated to Module identity by the consumer's verifier.
 *
 * The verifier — not this Module — resolves `jobId`, `ownerRef` and `submissionRef` from the provider
 * message reference against its own durable state. An event that cannot be scoped is not produced at all.
 */
export interface DeliveryEvent {
  /** Provider event id: the replay-protection key. */
  readonly eventId: string;
  /** Provider message id, correlating to `DeliveryAttempt.providerReference`. */
  readonly providerReference: string;
  readonly jobId: DeliveryJobId;
  readonly ownerRef: OwnerId;
  readonly submissionRef: SubmissionRef;
  readonly occurredAtEpochMs: number;
  readonly recipients: readonly RecipientOutcome[];
}

export function findDeliveryEventProblems(event: DeliveryEvent): readonly string[] {
  const problems: string[] = [];

  if (event.eventId.trim() === '') problems.push('empty event id');
  if (event.providerReference.trim() === '') problems.push('empty provider reference');
  if (event.recipients.length === 0) problems.push('event names no recipient');
  if (!Number.isInteger(event.occurredAtEpochMs) || event.occurredAtEpochMs < 0) {
    problems.push('invalid occurrence time');
  }

  // One address may appear at most once per event: a repeated address would make the outcome ambiguous.
  const seen = new Set<string>();
  for (const recipient of event.recipients) {
    const address = recipient.address.trim().toLowerCase();
    if (address === '') problems.push('empty recipient address');
    else if (seen.has(address)) problems.push('recipient repeated within one event');
    seen.add(address);
    if (!(RECIPIENT_OUTCOME_KINDS as readonly string[]).includes(recipient.kind)) {
      problems.push('unknown recipient outcome');
    }
  }

  return problems;
}

/**
 * Collapses replayed deliveries of the same event. Providers retry webhooks, so the same `eventId`
 * arriving twice must count once. The first occurrence is kept, which makes the result order-stable.
 */
export function dedupeDeliveryEvents(events: readonly DeliveryEvent[]): readonly DeliveryEvent[] {
  const byId = new Map<string, DeliveryEvent>();
  for (const event of events) {
    if (!byId.has(event.eventId)) byId.set(event.eventId, event);
  }
  return [...byId.values()].sort(compareEvents);
}

/** Deterministic ordering: occurrence time first, then event id, so arrival order cannot change a result. */
function compareEvents(left: DeliveryEvent, right: DeliveryEvent): number {
  if (left.occurredAtEpochMs !== right.occurredAtEpochMs) {
    return left.occurredAtEpochMs - right.occurredAtEpochMs;
  }
  return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
}

/**
 * The outcome for **one** recipient, or `pending` when no verified event names it yet.
 *
 * A terminal-negative outcome wins even if a `delivered` event arrives later: a bounce is a fact about
 * that delivery and a later claim cannot retract it. `deferred` is not terminal, so a later `delivered`
 * supersedes it.
 */
export function recipientOutcome(
  events: readonly DeliveryEvent[],
  address: string,
): RecipientOutcomeKind | 'pending' {
  const wanted = address.trim().toLowerCase();
  const ordered = dedupeDeliveryEvents(events);
  let deferred = false;
  let delivered = false;

  for (const event of ordered) {
    for (const recipient of event.recipients) {
      if (recipient.address.trim().toLowerCase() !== wanted) continue;
      if (TERMINAL_NEGATIVE.has(recipient.kind)) return recipient.kind;
      if (recipient.kind === 'delivered') delivered = true;
      if (recipient.kind === 'deferred') deferred = true;
    }
  }

  if (delivered) return 'delivered';
  if (deferred) return 'deferred';
  return 'pending';
}

export interface DeliverySummary {
  readonly kind: 'allDelivered' | 'partial' | 'noneDelivered' | 'pending';
  readonly recipients: readonly {
    readonly address: string;
    readonly kind: RecipientOutcomeKind | 'pending';
  }[];
}

/**
 * Per-recipient outcomes for the frozen recipient list of one message.
 *
 * `allDelivered` requires **every** recipient to have a verified `delivered` event; one recipient's
 * delivery is never extrapolated to the others. Any unresolved recipient keeps the whole summary
 * `pending`, because an incomplete picture is not a result.
 */
export function summariseDelivery(
  recipients: readonly string[],
  events: readonly DeliveryEvent[],
): DeliverySummary {
  const outcomes = recipients.map((address) => ({
    address,
    kind: recipientOutcome(events, address),
  }));
  const delivered = outcomes.filter((outcome) => outcome.kind === 'delivered').length;
  const pending = outcomes.some((outcome) => outcome.kind === 'pending');

  const kind: DeliverySummary['kind'] =
    outcomes.length === 0
      ? 'noneDelivered'
      : pending
        ? 'pending'
        : delivered === outcomes.length
          ? 'allDelivered'
          : delivered === 0
            ? 'noneDelivered'
            : 'partial';

  return { kind, recipients: outcomes };
}

/**
 * Everything a piece of delivery evidence must be tied to before it can promote a submission.
 *
 * The consumer builds this from its **own durable job record** — the job id, the frozen owner and
 * submission references, the `providerReference` stored on the successful attempt, and the frozen
 * recipient set — never from fields taken out of a callback payload. A verifier that echoes a reference
 * from the request body cannot satisfy this, which is the point: the correlation, not the payload,
 * decides what the evidence is about.
 */
export interface DeliveryCorrelation {
  readonly jobId: DeliveryJobId;
  readonly ownerRef: OwnerId;
  readonly submissionRef: SubmissionRef;
  readonly providerReference: string;
  /** The recipient set frozen at acceptance (`to` + `cc`). Nothing outside it may be counted. */
  readonly recipients: readonly string[];
}

/** Why correlated events did not produce evidence. Fixed tokens only; never provider text. */
export type DeliveryEvidenceRefusal =
  | 'incomplete-correlation'
  | 'job-mismatch'
  | 'owner-mismatch'
  | 'submission-mismatch'
  | 'provider-reference-mismatch'
  | 'unexpected-recipient'
  | 'not-fully-delivered';

/**
 * Why one event does not belong to this message, or `undefined` when it does.
 *
 * The frozen recipient set is derived from the correlation (the consumer's own job record), so an event that
 * names an address outside it is refused rather than filtered out.
 */
export function findEventCorrelationRefusal(
  correlation: DeliveryCorrelation,
  event: DeliveryEvent,
): DeliveryEvidenceRefusal | undefined {
  const reference = correlation.providerReference.trim();
  if (reference === '' || correlation.recipients.length === 0) return 'incomplete-correlation';

  const frozen = new Set<string>();
  for (const recipient of correlation.recipients) {
    const address = recipient.trim().toLowerCase();
    if (address === '') return 'incomplete-correlation';
    frozen.add(address);
  }
  if (frozen.size !== correlation.recipients.length) return 'incomplete-correlation';

  if (event.jobId !== correlation.jobId) return 'job-mismatch';
  if (event.ownerRef !== correlation.ownerRef) return 'owner-mismatch';
  if (event.submissionRef !== correlation.submissionRef) return 'submission-mismatch';
  if (event.providerReference !== correlation.providerReference) {
    return 'provider-reference-mismatch';
  }
  for (const recipient of event.recipients) {
    if (!frozen.has(recipient.address.trim().toLowerCase())) return 'unexpected-recipient';
  }
  return undefined;
}

/**
 * The result of evaluating stored events against one message.
 *
 * `satisfied` is a statement about **correlated, already-verified** events. It is deliberately not a
 * credential: it carries no evidence object and cannot promote anything by itself. Promotion happens in
 * `IngestDeliveryEvent`, which is the only code that mints evidence, and only after the consumer's verifier
 * has authenticated the raw callback.
 */
export type DeliveryEvaluation =
  | { readonly kind: 'satisfied'; readonly summary: DeliverySummary }
  | { readonly kind: 'pending'; readonly reason: DeliveryEvidenceRefusal };

/**
 * Evaluate whether a message's stored events prove that every frozen recipient was delivered.
 *
 * It refuses rather than filters. Every event handed in must belong to the correlated job, owner, submission
 * and provider message, and every recipient it names must be in the frozen set; one mismatch means the input
 * is not about this message at all, so nothing is inferred from the rest of it. That is what stops an
 * unrelated message's `delivered` event — or another tenant's — from counting towards this submission.
 *
 * Replay and ordering are handled here too: `dedupeDeliveryEvents` collapses provider retries and
 * `recipientOutcome` is order-independent, so a replayed or late-arriving event changes nothing.
 *
 * Provider **acceptance** is still not delivery, and this function cannot promote anything.
 */
export function evaluateDeliveryCorrelation(
  correlation: DeliveryCorrelation,
  events: readonly DeliveryEvent[],
): DeliveryEvaluation {
  for (const event of events) {
    const refusal = findEventCorrelationRefusal(correlation, event);
    if (refusal !== undefined) return { kind: 'pending', reason: refusal };
  }

  const summary = summariseDelivery(correlation.recipients, events);
  if (summary.kind !== 'allDelivered') return { kind: 'pending', reason: 'not-fully-delivered' };
  return { kind: 'satisfied', summary };
}
