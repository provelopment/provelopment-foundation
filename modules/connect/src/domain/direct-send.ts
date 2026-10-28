/**
 * The **direct-send** contract (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`).
 *
 * A direct send performs exactly one transport attempt and stores nothing. That single fact decides this
 * whole file:
 *
 * - there is **no `accepted`** outcome. The strongest success token is `providerAccepted`, which is exactly
 *   what a transport can honestly report — the provider took the request. It is not "the business read it"
 *   and it is not the durable pipeline's `accepted` (`ACC-000`), which is reserved for a committed record;
 * - **ambiguity is a first-class outcome**, never an error path and never a retry instruction. A thrown
 *   transport call, a 5xx and an unclassified response all mean "we cannot prove the payload did not leave
 *   the process", and this Module does not guess in the visitor's favour;
 * - a refusal **before** transport reuses the released closed `InternalCode` set and its `SafeCategory`
 *   mapping, so pre-send refusals need no new vocabulary and no new public claim.
 *
 * The outcome mapping is derived from `classifyTransportObservation` — the Module's single classification
 * authority — and then narrowed, because "retryable" (a durable-scheduler judgement) is *not* the same
 * claim as "definitely not sent" (a statement about a payload that will never be retried).
 */
import { classifyTransportObservation, type TransportObservation } from './delivery.js';
import {
  findCorePolicyConfigurationProblems,
  isPolicyUsable,
  type PolicyApplicability,
  type PolicyAuthorizationCore,
  type PolicyBinding,
  type PolicyRecipient,
  type PolicyValidity,
  type QuotaLimits,
  type SenderIdentity,
  type TemplateReference,
} from './destination-policy.js';
import type { FieldError } from './content.js';
import type { InternalCode, SafeCategory } from './error-codes.js';
import { identifier, MAX_IDENTIFIER_LENGTH, type TransmissionRef } from './identifiers.js';
import { isPurpose } from './purpose.js';
import { err, isRecord, ok, type Result } from './result.js';

/**
 * Why a direct send could **not** establish what happened to the payload.
 *
 * Every one of these means "do not retry automatically": the Module cannot tell whether the business will
 * receive one copy or none, so a second attempt could produce a duplicate and a silent claim of success
 * could produce a lie.
 */
export const DIRECT_SEND_AMBIGUITY_REASONS = [
  'timeoutAfterPayload',
  'connectionResetAfterPayload',
  'transportThrew',
  'providerServerError',
  'unclassifiedResponse',
] as const;

export type DirectSendAmbiguityReason = (typeof DIRECT_SEND_AMBIGUITY_REASONS)[number];

/**
 * Why a direct send definitely did **not** reach the provider as an accepted message.
 *
 * Each value is backed by evidence, not by absence of evidence: the adapter reported a failure that
 * happens **before** acceptance (`transportUnavailable`), the provider explicitly refused the message
 * (`refusedByProvider`), or the Module's own configuration could not produce a sendable message at all
 * (`configuration`).
 */
export const DIRECT_SEND_NOT_SENT_REASONS = [
  'refusedByProvider',
  'transportUnavailable',
  'configuration',
] as const;

export type DirectSendNotSentReason = (typeof DIRECT_SEND_NOT_SENT_REASONS)[number];

/**
 * The closed result of one direct send.
 *
 * `refused` carries the released `SafeCategory` alongside the internal code, so a consumer renders its
 * existing visitor states without re-deriving the mapping — and without ever presenting a refusal as an
 * acceptance.
 */
export type DirectSendOutcome =
  | { readonly kind: 'providerAccepted'; readonly transmissionRef: TransmissionRef }
  | { readonly kind: 'ambiguous'; readonly reason: DirectSendAmbiguityReason }
  | { readonly kind: 'notSent'; readonly reason: DirectSendNotSentReason }
  | {
      readonly kind: 'refused';
      readonly category: SafeCategory;
      readonly code: InternalCode;
      readonly fieldErrors?: readonly FieldError[];
    };

/**
 * The policy a direct send is authorized by: the shared core and **nothing else**.
 *
 * No frozen policy identity, no accepted-enquiry quota, no retention, no durable abuse profile, no deferred
 * acknowledgement, no service-interest enumeration — a form that stores nothing has nowhere to put them,
 * and requiring them would force an owner to invent values.
 */
export type DirectSendPolicy = PolicyAuthorizationCore;

/** A refused policy candidate. `problems` is operator-facing; it is never rendered to a visitor. */
export interface DirectSendPolicyRejection {
  readonly code: InternalCode;
  readonly problems: readonly string[];
}

/**
 * A direct-send policy candidate must be **exactly** this shape. Unknown fields are refused rather than
 * ignored, and that is the mechanism which keeps durable-only material out: a candidate carrying
 * `policyId`, `policyRevision`, `retention`, `abuseProfile`, `acknowledgement`, `serviceInterests` or an
 * accepted-enquiry quota is not "mostly fine" — it is a policy for a different contract, and accepting it
 * would invite the belief that those fields mean something here.
 */
const ALLOWED_POLICY_KEYS: ReadonlySet<string> = new Set([
  'deploymentRef',
  'ownerRef',
  'purpose',
  'applicability',
  'recipients',
  'sender',
  'template',
  'validity',
  'quotas',
  'messageMinLength',
]);

const ALLOWED_APPLICABILITY_KEYS: ReadonlySet<string> = new Set([
  'siteRefs',
  'bindings',
  'forms',
  'publisherRefs',
  'authorizationRefs',
]);

const ALLOWED_SENDER_KEYS: ReadonlySet<string> = new Set([
  'fromAddress',
  'fromDisplayName',
  'replyToMode',
  'replyToAddress',
]);

const ALLOWED_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  'templateId',
  'version',
  'localeFallbacks',
]);

const ALLOWED_VALIDITY_KEYS: ReadonlySet<string> = new Set([
  'enabled',
  'fromEpochMs',
  'untilEpochMs',
]);

/**
 * Only the **request-attempt** budgets belong to a non-durable send. The accepted-enquiry values are
 * refused here by name, because a direct send never commits a record and therefore has nothing to count.
 */
const ALLOWED_QUOTA_KEYS: ReadonlySet<string> = new Set([
  'attemptPerOwnerHour',
  'attemptPerSiteHour',
]);

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/** A bounded, trimmed, control-character-free opaque text value, or `undefined` when it is not that. */
function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return undefined;
  if (value.trim() !== value) return undefined;
  if (CONTROL_CHARACTER_PATTERN.test(value)) return undefined;
  return value;
}

function readTextList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    const text = readText(entry);
    if (text === undefined) return undefined;
    out.push(text);
  }
  return out;
}

function readBindings(value: unknown): PolicyBinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: PolicyBinding[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    if (entry['kind'] === 'site-wide') {
      if (Object.keys(entry).length !== 1) return undefined;
      out.push({ kind: 'site-wide' });
      continue;
    }
    if (entry['kind'] !== 'page') return undefined;
    if (Object.keys(entry).length !== 2) return undefined;
    const pageRef = readText(entry['pageRef']);
    if (pageRef === undefined) return undefined;
    out.push({ kind: 'page', pageRef: identifier.page(pageRef) });
  }
  return out;
}

function readRecipients(value: unknown): PolicyRecipient[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: PolicyRecipient[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    if (Object.keys(entry).length !== 2) return undefined;
    const kind = entry['kind'];
    if (kind !== 'to' && kind !== 'cc') return undefined;
    const address = entry['address'];
    if (typeof address !== 'string') return undefined;
    if (address.length === 0 || address.length > MAX_IDENTIFIER_LENGTH * 2) return undefined;
    out.push({ address, kind });
  }
  return out;
}

function readSender(value: unknown, problems: string[]): SenderIdentity | undefined {
  if (!isRecord(value)) {
    problems.push('sender missing or malformed');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_SENDER_KEYS.has(key)) problems.push('unknown sender field');
  }

  const fromAddress = readText(value['fromAddress']);
  const fromDisplayName = readText(value['fromDisplayName']);
  const replyToMode = value['replyToMode'];
  const replyToAddress =
    value['replyToAddress'] === undefined ? undefined : readText(value['replyToAddress']);

  if (fromAddress === undefined) problems.push('sender.fromAddress missing or malformed');
  if (fromDisplayName === undefined) problems.push('sender.fromDisplayName missing or malformed');
  if (replyToMode !== 'visitor' && replyToMode !== 'fixed') {
    problems.push('sender.replyToMode must be "visitor" or "fixed"');
  }
  if (value['replyToAddress'] !== undefined && replyToAddress === undefined) {
    problems.push('sender.replyToAddress malformed');
  }
  if (
    fromAddress === undefined ||
    fromDisplayName === undefined ||
    (replyToMode !== 'visitor' && replyToMode !== 'fixed')
  ) {
    return undefined;
  }

  return {
    fromAddress,
    fromDisplayName,
    replyToMode,
    ...(replyToAddress === undefined ? {} : { replyToAddress }),
  };
}

function readTemplate(value: unknown, problems: string[]): TemplateReference | undefined {
  if (!isRecord(value)) {
    problems.push('template missing or malformed');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_TEMPLATE_KEYS.has(key)) problems.push('unknown template field');
  }

  const templateId = readText(value['templateId']);
  const version = readText(value['version']);
  const localeFallbacks = readTextList(value['localeFallbacks']);
  if (templateId === undefined) problems.push('template.templateId missing or malformed');
  if (version === undefined) problems.push('template.version missing or malformed');
  if (localeFallbacks === undefined) {
    problems.push('template.localeFallbacks missing or malformed');
  }
  if (templateId === undefined || version === undefined || localeFallbacks === undefined) {
    return undefined;
  }
  return { templateId, version, localeFallbacks };
}

function readValidity(value: unknown, problems: string[]): PolicyValidity | undefined {
  if (!isRecord(value)) {
    problems.push('validity missing or malformed');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_VALIDITY_KEYS.has(key)) problems.push('unknown validity field');
  }

  const enabled = value['enabled'];
  if (typeof enabled !== 'boolean') problems.push('validity.enabled must be a boolean');

  const readInstant = (key: 'fromEpochMs' | 'untilEpochMs'): number | undefined => {
    const raw = value[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
      problems.push('validity window is not a valid instant');
      return undefined;
    }
    return raw;
  };
  const fromEpochMs = readInstant('fromEpochMs');
  const untilEpochMs = readInstant('untilEpochMs');

  if (typeof enabled !== 'boolean') return undefined;
  return {
    enabled,
    ...(fromEpochMs === undefined ? {} : { fromEpochMs }),
    ...(untilEpochMs === undefined ? {} : { untilEpochMs }),
  };
}

function readQuotas(value: unknown, problems: string[]): QuotaLimits | undefined {
  if (!isRecord(value)) {
    problems.push('quotas malformed');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (ALLOWED_QUOTA_KEYS.has(key)) continue;
    problems.push(
      key === 'perOwnerHour' || key === 'perSiteHour'
        ? 'accepted-enquiry capacity is not applicable to a direct send'
        : 'unknown quotas field',
    );
  }

  const quotas: { attemptPerOwnerHour?: number; attemptPerSiteHour?: number } = {};
  let valid = true;
  for (const key of ['attemptPerOwnerHour', 'attemptPerSiteHour'] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
      problems.push('quota limits must be positive integers');
      valid = false;
      continue;
    }
    quotas[key] = raw;
  }
  return valid ? quotas : undefined;
}

export function parseDirectSendPolicy(
  candidate: unknown,
  options: { readonly atEpochMs: number },
): Result<DirectSendPolicy, DirectSendPolicyRejection> {
  const problems: string[] = [];
  const refuse = (code: InternalCode = 'POL-001') => err({ code, problems });

  if (!isRecord(candidate)) {
    problems.push('policy is not an object');
    return refuse();
  }
  for (const key of Object.keys(candidate)) {
    if (!ALLOWED_POLICY_KEYS.has(key)) problems.push('unknown policy field');
  }
  if (problems.length > 0) return refuse();

  const deploymentRef = readText(candidate['deploymentRef']);
  const ownerRef = readText(candidate['ownerRef']);
  const rawPurpose = candidate['purpose'];
  if (deploymentRef === undefined) problems.push('deploymentRef missing or malformed');
  if (ownerRef === undefined) problems.push('ownerRef missing or malformed');
  if (!isPurpose(rawPurpose)) problems.push('purpose missing or unsupported');

  const applicability = readApplicability(candidate['applicability'], problems);
  const recipients = readRecipients(candidate['recipients']);
  if (recipients === undefined) problems.push('recipients missing or malformed');
  const sender = readSender(candidate['sender'], problems);
  const template = readTemplate(candidate['template'], problems);
  const validity = readValidity(candidate['validity'], problems);
  const quotas =
    candidate['quotas'] === undefined ? undefined : readQuotas(candidate['quotas'], problems);

  const rawMinLength = candidate['messageMinLength'];
  if (rawMinLength !== undefined && typeof rawMinLength !== 'number') {
    problems.push('messageMinLength is not a number');
  }

  if (problems.length > 0) return refuse();
  if (deploymentRef === undefined || ownerRef === undefined || !isPurpose(rawPurpose)) {
    return refuse();
  }
  if (
    applicability === undefined ||
    recipients === undefined ||
    sender === undefined ||
    template === undefined ||
    validity === undefined
  ) {
    return refuse();
  }

  const core: DirectSendPolicy = {
    deploymentRef: identifier.deployment(deploymentRef),
    ownerRef: identifier.owner(ownerRef),
    purpose: rawPurpose,
    applicability,
    recipients,
    sender,
    template,
    validity,
    ...(quotas === undefined ? {} : { quotas }),
    ...(typeof rawMinLength === 'number' ? { messageMinLength: rawMinLength } : {}),
  };

  // A direct send ships the contact purpose. `service-enquiry` needs an enumerated interest list that the
  // shared core does not carry, so it is refused explicitly rather than half-supported.
  if (core.purpose !== 'contact') {
    return err({ code: 'POL-003', problems: ['direct send supports the contact purpose only'] });
  }
  // Recipients, the sender mailbox and every other structural rule come from the **shared** core, so a
  // direct-send policy is held to exactly the standard a durable policy is (correction R02-02).
  for (const problem of findCorePolicyConfigurationProblems(core)) problems.push(problem);
  if (!isPolicyUsable(core, options.atEpochMs)) {
    problems.push('policy is disabled or outside its validity window');
  }
  if (problems.length > 0) return refuse();
  return ok(core);
}

function readApplicability(value: unknown, problems: string[]): PolicyApplicability | undefined {
  if (!isRecord(value)) {
    problems.push('applicability missing or malformed');
    return undefined;
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_APPLICABILITY_KEYS.has(key)) problems.push('unknown applicability field');
  }

  const siteRefs = readTextList(value['siteRefs']);
  const authorizationRefs = readTextList(value['authorizationRefs']);
  const bindings = readBindings(value['bindings']);
  const forms = value['forms'] === undefined ? [] : readTextList(value['forms']);
  const publisherRefs =
    value['publisherRefs'] === undefined ? undefined : readTextList(value['publisherRefs']);

  if (siteRefs === undefined) problems.push('applicability.siteRefs missing or malformed');
  if (authorizationRefs === undefined) {
    problems.push('applicability.authorizationRefs missing or malformed');
  }
  if (bindings === undefined) problems.push('applicability.bindings missing or malformed');
  if (forms === undefined) problems.push('applicability.forms malformed');
  if (value['publisherRefs'] !== undefined && publisherRefs === undefined) {
    problems.push('applicability.publisherRefs malformed');
  }
  if (
    siteRefs === undefined ||
    authorizationRefs === undefined ||
    bindings === undefined ||
    forms === undefined
  ) {
    return undefined;
  }

  return {
    siteRefs: siteRefs.map((ref) => identifier.site(ref)),
    bindings,
    ...(value['forms'] === undefined ? {} : { forms: forms.map((ref) => identifier.form(ref)) }),
    ...(publisherRefs === undefined
      ? {}
      : { publisherRefs: publisherRefs.map((ref) => identifier.publisher(ref)) }),
    authorizationRefs: authorizationRefs.map((ref) => identifier.authorization(ref)),
  };
}

/**
 * The honest reading of one transport observation (or of a transport that threw).
 *
 * The first stage is `classifyTransportObservation`, so the Module keeps **one** classification authority.
 * The second stage is what a non-durable send must add, because "retryable" says nothing about whether the
 * payload left the process:
 *
 * | Observation | Classifier | Direct-send outcome | Why |
 * | --- | --- | --- | --- |
 * | `accepted` | `providerAccepted` | `providerAccepted` | the provider took the request |
 * | `timeout` / `connectionReset`, `payloadSent: true` | `handoffAmbiguous` | `ambiguous` | the payload may have left |
 * | `timeout` / `connectionReset`, `payloadSent: false` | `retryableFailure` | `notSent: transportUnavailable` | the adapter attests nothing left |
 * | `providerAuthError` | `retryableFailure` | `notSent: configuration` | credentials refused before acceptance |
 * | `throttled` | `retryableFailure` | `notSent: transportUnavailable` | refused before acceptance |
 * | `providerServerError` | `retryableFailure` | `ambiguous` | a 5xx may follow a completed delivery |
 * | `unclassified` | `retryableFailure` | `ambiguous` | unknown is not "not sent" |
 * | `rejected*`, `blockedRecipient`, `providerRefusedPolicy` | `permanentFailure` | `notSent: refusedByProvider` | explicitly refused |
 * | transport threw | — | `ambiguous: transportThrew` | a throw proves nothing about the payload |
 */
export function directSendOutcome(
  observation: TransportObservation | undefined,
  transmissionRef: TransmissionRef,
): DirectSendOutcome {
  if (observation === undefined) return { kind: 'ambiguous', reason: 'transportThrew' };

  switch (classifyTransportObservation(observation)) {
    case 'providerAccepted':
      return { kind: 'providerAccepted', transmissionRef };
    case 'handoffAmbiguous':
      return {
        kind: 'ambiguous',
        reason:
          observation.kind === 'connectionReset'
            ? 'connectionResetAfterPayload'
            : 'timeoutAfterPayload',
      };
    case 'permanentFailure':
      return { kind: 'notSent', reason: 'refusedByProvider' };
    case 'retryableFailure':
      switch (observation.kind) {
        case 'timeout':
        case 'connectionReset':
          // Only the adapter's own `payloadSent: false` attests that nothing left the process.
          return { kind: 'notSent', reason: 'transportUnavailable' };
        case 'providerAuthError':
          return { kind: 'notSent', reason: 'configuration' };
        case 'throttled':
          return { kind: 'notSent', reason: 'transportUnavailable' };
        case 'providerServerError':
          // A 5xx may be returned after the provider already accepted and started delivering.
          return { kind: 'ambiguous', reason: 'providerServerError' };
        default:
          return { kind: 'ambiguous', reason: 'unclassifiedResponse' };
      }
  }
}
