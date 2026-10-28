import { INTERNAL_CODES, isInternalCode, type InternalCode } from './error-codes.js';
import {
  DIRECT_SEND_AMBIGUITY_REASONS,
  DIRECT_SEND_NOT_SENT_REASONS,
  type DirectSendAmbiguityReason,
  type DirectSendNotSentReason,
} from './direct-send.js';
import { MAX_IDENTIFIER_LENGTH } from './identifiers.js';

/**
 * Allowlisted diagnostic events (M5 §5; the telemetry schema since the 0.1.0 release preparation).
 *
 * Key-name redaction alone is **not** a sufficient protection for arbitrary untrusted data: PII routinely
 * arrives under innocuous keys (`detail`, `info`, `description`, `exception`, `extra`) and provider error
 * strings embed recipients. This type **is** the telemetry schema: only an allowlisted event name, a known
 * internal code, bounded identifiers and non-negative counts exist. There is no free-text field at all, so
 * visitor content, form payloads, recipient addresses and provider messages cannot be emitted.
 *
 * `redactForDiagnostics` remains available as a last-resort scrub for a structure that must be logged
 * outside this contract; it is not, and must not be described as, a guarantee.
 */
export const DIAGNOSTIC_EVENT_NAMES = [
  'acceptance.accepted',
  'acceptance.duplicate',
  'acceptance.refused',
  'acceptance.quotaExhausted',
  'acceptance.quotaCommitFailed',
  'acceptance.quotaReconciled',
  'directSend.providerAccepted',
  'directSend.ambiguous',
  'directSend.notSent',
  'directSend.refused',
  'delivery.attempted',
  'delivery.ambiguous',
  'delivery.refused',
  'delivery.retryScheduled',
  'delivery.rescheduled',
  'delivery.failedPermanent',
  'delivery.expired',
  'delivery.reauthorizationRefused',
  'delivery.dispatchAuthorityLost',
  'delivery.outcomeRefused',
  'delivery.outcomeReplay',
  'delivery.outcomePersistFailed',
  'delivery.schedulePreconditionMissing',
  'delivery.scheduleSuperseded',
  'delivery.scheduleExtendedForProviderMinimum',
  'delivery.providerMinimumUnreconciled',
  'formToken.unverified',
  'policy.configInvalid',
  'lifecycle.purged',
  'lifecycle.purgeIntent',
  'lifecycle.purgeFailed',
  'lifecycle.uncertain',
  'lifecycle.reconciled',
  'lifecycle.accessDenied',
  'lifecycle.candidateRejected',
  'lifecycle.deletionFailed',
] as const;

export type DiagnosticEventName = (typeof DIAGNOSTIC_EVENT_NAMES)[number];

/**
 * The closed set of direct-send outcomes a diagnostic may name (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`).
 *
 * It exists so an operator can tell *why* a send was ambiguous or not sent without any free text reaching a
 * sink: the vocabulary is the Module's own union, exactly as `InternalCode` is for refusals.
 */
export const DIRECT_SEND_DIAGNOSTIC_REASONS = [
  ...DIRECT_SEND_AMBIGUITY_REASONS,
  ...DIRECT_SEND_NOT_SENT_REASONS,
] as const;

export type DirectSendDiagnosticReason = DirectSendAmbiguityReason | DirectSendNotSentReason;

export interface DiagnosticEvent {
  readonly name: DiagnosticEventName;
  readonly code?: InternalCode;
  readonly deploymentId?: string;
  readonly ownerRef?: string;
  readonly siteRef?: string;
  readonly submissionRef?: string;
  readonly jobId?: string;
  /**
   * The identity of one **non-durable** direct send (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`). Bounded and
   * shape-checked exactly like every other identifier here; it is a correlation id, not evidence of
   * delivery.
   */
  readonly transmissionRef?: string;
  /**
   * Why a direct send ended as it did. A **closed vocabulary**, so an operator can distinguish an ambiguous
   * handoff from a definite non-send without any free text — and without a provider string — reaching a sink.
   */
  readonly outcome?: DirectSendDiagnosticReason;
  readonly counts?: Readonly<Record<string, number>>;
  readonly durationMs?: number;
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const COUNT_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,40}$/;
const MAX_COUNT_KEYS = 20;

function readIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return undefined;
  if (!IDENTIFIER_PATTERN.test(value)) return undefined;
  return value;
}

function readCounts(value: unknown): Readonly<Record<string, number>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_COUNT_KEYS) return undefined;

  const counts: Record<string, number> = {};
  for (const [key, count] of entries) {
    if (!COUNT_KEY_PATTERN.test(key)) return undefined;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return undefined;
    counts[key] = count;
  }
  return Object.freeze(counts);
}

/**
 * Builds a safe diagnostic event from untrusted input, or `undefined` when the event cannot be represented.
 * Unknown properties — including any PII-bearing `detail`, `info`, `description`, `exception` or `extra` —
 * are dropped, never passed through.
 */
export function createDiagnosticEvent(candidate: unknown): DiagnosticEvent | undefined {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
    return undefined;
  const source = candidate as Record<string, unknown>;

  const name = source['name'];
  if (typeof name !== 'string' || !(DIAGNOSTIC_EVENT_NAMES as readonly string[]).includes(name)) {
    return undefined;
  }

  const event: {
    name: DiagnosticEventName;
    code?: InternalCode;
    deploymentId?: string;
    ownerRef?: string;
    siteRef?: string;
    submissionRef?: string;
    jobId?: string;
    transmissionRef?: string;
    outcome?: DirectSendDiagnosticReason;
    counts?: Readonly<Record<string, number>>;
    durationMs?: number;
  } = { name: name as DiagnosticEventName };

  if (source['code'] !== undefined) {
    if (!isInternalCode(source['code'])) return undefined;
    event.code = source['code'];
  }

  for (const key of [
    'deploymentId',
    'ownerRef',
    'siteRef',
    'submissionRef',
    'jobId',
    'transmissionRef',
  ] as const) {
    const value = source[key];
    if (value === undefined) continue;
    const read = readIdentifier(value);
    if (read === undefined) return undefined;
    event[key] = read;
  }

  if (source['counts'] !== undefined) {
    const counts = readCounts(source['counts']);
    if (counts === undefined) return undefined;
    event.counts = counts;
  }

  if (source['outcome'] !== undefined) {
    const outcome = source['outcome'];
    if (
      typeof outcome !== 'string' ||
      !(DIRECT_SEND_DIAGNOSTIC_REASONS as readonly string[]).includes(outcome)
    ) {
      return undefined;
    }
    event.outcome = outcome as DirectSendDiagnosticReason;
  }

  if (source['durationMs'] !== undefined) {
    const duration = source['durationMs'];
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0)
      return undefined;
    event.durationMs = duration;
  }

  return Object.freeze(event);
}

/** True when every code is one of the Module's own internal codes (never a provider string). */
export function isKnownDiagnosticCode(value: unknown): boolean {
  return isInternalCode(value) && (INTERNAL_CODES as readonly string[]).includes(value);
}
