import type { InternalCode } from './error-codes.js';
import { normalizeBareMailbox } from './mailbox.js';
import type { Purpose } from './purpose.js';
import { isRecord, err, ok, type Result } from './result.js';

/**
 * Field contract for P0 purposes (M1 §C.2, §C.3).
 *
 * Two rules are deliberately different and must not be confused (M1 §C.4 step 7):
 * - single-line fields reject CR/LF and control characters outright (`FRM-003`);
 * - multi-line `message` accepts HTML-like text as **literal characters** (`FRM-003` only for
 *   control characters other than a normalized newline) and the renderer escapes it.
 */
export type FieldName =
  | 'name'
  | 'email'
  | 'phone'
  | 'organization'
  | 'subject'
  | 'message'
  | 'serviceInterest'
  | 'transactionalConsentAck';

export type FieldErrorField = FieldName | 'form';

export interface FieldError {
  readonly field: FieldErrorField;
  readonly code: InternalCode;
}

export interface ContactContent {
  readonly kind: 'contact';
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly subject?: string;
  readonly message: string;
}

export interface ServiceEnquiryContent {
  readonly kind: 'service-enquiry';
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly organization?: string;
  readonly subject?: string;
  readonly message: string;
  readonly serviceInterest: string;
}

export type NormalizedContent = ContactContent | ServiceEnquiryContent;

export interface ContentRejection {
  /** Exactly one internal code per call (M1 §C.5.1). */
  readonly code: InternalCode;
  readonly fields: readonly FieldError[];
}

export interface ContentValidationOptions {
  /** Permitted `serviceInterest` values, supplied by the resolved policy. */
  readonly serviceInterests?: readonly string[];
  /**
   * Policy-authored minimum message length in code points (`PolicyAuthorizationCore.messageMinLength`).
   *
   * The **policy layer** is the authority for this value: `findCorePolicyConfigurationProblems` refuses an
   * out-of-range one as `POL-001`. Here it is treated defensively, so an unvalidated option can neither
   * widen nor narrow the Module's published bound: an absent or unusable value falls back to the released
   * minimum (10). A value of 1 therefore accepts a one-character non-empty message, which is the floor
   * this contract supports — an empty message is refused as `FRM-004` regardless.
   */
  readonly messageMinLength?: number;
}

/**
 * Field contract for P0 purposes.
 *
 * The **ceilings** are the Module's own security and robustness bound, not a consumer preference: they cap
 * the worst-case input a single unauthenticated request can push through validation, rendering, and (in
 * durable mode) a stored row. `CONNECT-DIRECT-SEND-A4-SIMPLE-A1` raised them to the range consumers already
 * publish (`subject` 200, `message` 5000) so that adopting this Module never silently makes a working public
 * form stricter. The **message minimum** is different in kind — it is an owner's quality choice — which is
 * why its default lives here but its value comes from the policy.
 */
export const FIELD_LIMITS = {
  name: { min: 1, max: 120 },
  email: { min: 3, max: 254 },
  phone: { min: 0, max: 32 },
  organization: { min: 0, max: 200 },
  subject: { min: 0, max: 200 },
  message: { min: 10, max: 5000 },
  serviceInterest: { min: 1, max: 120 },
} as const satisfies Readonly<Record<string, { readonly min: number; readonly max: number }>>;

const COMMON_FIELDS: readonly FieldName[] = [
  'name',
  'email',
  'phone',
  'subject',
  'message',
  'transactionalConsentAck',
];

export const PURPOSE_FIELDS: Readonly<Record<Purpose, readonly FieldName[]>> = {
  contact: COMMON_FIELDS,
  'service-enquiry': [...COMMON_FIELDS, 'organization', 'serviceInterest'],
};

const CODE_PRIORITY: readonly InternalCode[] = ['FRM-001', 'FRM-002', 'FRM-003', 'FRM-004'];

const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MESSAGE_CONTROL_PATTERN = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const PHONE_CHARACTERS_PATTERN = /^[0-9+\-().\s]+$/;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

interface StringInspection {
  readonly errors: readonly FieldError[];
  readonly value?: string;
}

function inspectSingleLine(
  field: FieldName,
  raw: unknown,
  required: boolean,
  limits: { readonly min: number; readonly max: number },
): StringInspection {
  if (raw === undefined) {
    return required ? { errors: [{ field, code: 'FRM-001' }] } : { errors: [] };
  }
  if (typeof raw !== 'string') return { errors: [{ field, code: 'FRM-001' }] };
  if (SINGLE_LINE_CONTROL_PATTERN.test(raw)) return { errors: [{ field, code: 'FRM-003' }] };

  const collapsed = raw.trim().replace(/ {2,}/g, ' ');
  const length = codePointLength(collapsed);
  if (length === 0 && !required) return { errors: [] };
  if (length < limits.min || length > limits.max) {
    return { errors: [{ field, code: 'FRM-002' }] };
  }
  return { errors: [], value: collapsed };
}

function inspectMessage(
  raw: unknown,
  limits: { readonly min: number; readonly max: number },
): StringInspection {
  if (raw === undefined || typeof raw !== 'string') {
    return { errors: [{ field: 'message', code: 'FRM-001' }] };
  }
  // Browsers submit CRLF; normalize newlines before enforcing the control-character rule.
  const normalizedNewlines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (MESSAGE_CONTROL_PATTERN.test(normalizedNewlines)) {
    return { errors: [{ field: 'message', code: 'FRM-003' }] };
  }
  const trimmed = normalizedNewlines.replace(/^\s+|\s+$/g, '');
  const length = codePointLength(trimmed);
  if (length === 0) return { errors: [{ field: 'message', code: 'FRM-004' }] };
  if (length < limits.min || length > limits.max) {
    return { errors: [{ field: 'message', code: 'FRM-002' }] };
  }
  return { errors: [], value: trimmed };
}

/**
 * The visitor's address, validated by the Module's **one** mailbox authority (`domain/mailbox.ts`) — the same
 * rule that decides whether an owner may authorize a policy recipient. Local-part case is preserved and the
 * domain is folded, so the value the renderer receives is already normalized.
 */
function normalizeEmailValue(raw: string): string | undefined {
  return normalizeBareMailbox(raw);
}

function inspectEmail(raw: unknown): StringInspection {
  if (raw === undefined || typeof raw !== 'string') {
    return { errors: [{ field: 'email', code: 'FRM-001' }] };
  }
  if (SINGLE_LINE_CONTROL_PATTERN.test(raw))
    return { errors: [{ field: 'email', code: 'FRM-003' }] };
  const trimmed = raw.trim();
  const length = codePointLength(trimmed);
  if (length < FIELD_LIMITS.email.min || length > FIELD_LIMITS.email.max) {
    return { errors: [{ field: 'email', code: 'FRM-002' }] };
  }
  const normalized = normalizeEmailValue(trimmed);
  if (normalized === undefined) return { errors: [{ field: 'email', code: 'FRM-004' }] };
  return { errors: [], value: normalized };
}

function inspectPhone(raw: unknown): StringInspection {
  if (raw === undefined) return { errors: [] };
  if (typeof raw !== 'string') return { errors: [{ field: 'phone', code: 'FRM-001' }] };
  if (SINGLE_LINE_CONTROL_PATTERN.test(raw))
    return { errors: [{ field: 'phone', code: 'FRM-003' }] };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { errors: [] };
  if (codePointLength(trimmed) > FIELD_LIMITS.phone.max) {
    return { errors: [{ field: 'phone', code: 'FRM-002' }] };
  }
  if (!PHONE_CHARACTERS_PATTERN.test(trimmed)) {
    return { errors: [{ field: 'phone', code: 'FRM-004' }] };
  }
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length < 6 || digits.length > 15) {
    return { errors: [{ field: 'phone', code: 'FRM-004' }] };
  }
  return { errors: [], value: trimmed.startsWith('+') ? `+${digits}` : digits };
}

function firstCode(errors: readonly FieldError[]): InternalCode {
  let best: InternalCode = 'FRM-004';
  let bestRank = CODE_PRIORITY.length;
  for (const error of errors) {
    const rank = CODE_PRIORITY.indexOf(error.code);
    if (rank >= 0 && rank < bestRank) {
      bestRank = rank;
      best = error.code;
    }
  }
  return best;
}

/**
 * The effective message bounds: the **ceiling** is always the Module's, and the **floor** is the policy's
 * value when that value is an integer inside the published bound, otherwise the released default.
 *
 * An unusable option can therefore never widen nor narrow the contract by itself; the policy validator is
 * what refuses it (`POL-001`), which keeps one authority for one rule.
 */
function messageLimitsFor(policyMinimum: number | undefined): {
  readonly min: number;
  readonly max: number;
} {
  const max = FIELD_LIMITS.message.max;
  if (
    policyMinimum === undefined ||
    !Number.isInteger(policyMinimum) ||
    policyMinimum < 1 ||
    policyMinimum > max
  ) {
    return { min: FIELD_LIMITS.message.min, max };
  }
  return { min: policyMinimum, max };
}

/**
 * Deterministic purpose-aware validation. Ordering is fixed so that one call always yields exactly
 * one internal code: `FRM-001` (shape) → `FRM-002` (bounds) → `FRM-003` (control/header) →
 * `FRM-004` (format/enumeration/consent).
 */
export function validateContent(
  purpose: Purpose,
  input: unknown,
  options: ContentValidationOptions = {},
): Result<NormalizedContent, ContentRejection> {
  if (!isRecord(input)) {
    return err({ code: 'FRM-001', fields: [{ field: 'form', code: 'FRM-001' }] });
  }

  const errors: FieldError[] = [];
  const allowed = PURPOSE_FIELDS[purpose];
  for (const key of Object.keys(input)) {
    if (!(allowed as readonly string[]).includes(key)) {
      errors.push({ field: 'form', code: 'FRM-001' });
    }
  }

  const name = inspectSingleLine('name', input['name'], true, FIELD_LIMITS.name);
  const email = inspectEmail(input['email']);
  const phone = inspectPhone(input['phone']);
  const subject = inspectSingleLine('subject', input['subject'], false, FIELD_LIMITS.subject);
  const message = inspectMessage(input['message'], messageLimitsFor(options.messageMinLength));
  errors.push(
    ...name.errors,
    ...email.errors,
    ...phone.errors,
    ...subject.errors,
    ...message.errors,
  );

  let organization: StringInspection = { errors: [] };
  if (purpose === 'service-enquiry') {
    organization = inspectSingleLine(
      'organization',
      input['organization'],
      false,
      FIELD_LIMITS.organization,
    );
    errors.push(...organization.errors);
  }

  let serviceInterest: string | undefined;
  if (purpose === 'service-enquiry') {
    const raw = input['serviceInterest'];
    if (raw === undefined || typeof raw !== 'string') {
      errors.push({ field: 'serviceInterest', code: 'FRM-001' });
    } else if (SINGLE_LINE_CONTROL_PATTERN.test(raw)) {
      errors.push({ field: 'serviceInterest', code: 'FRM-003' });
    } else {
      const trimmed = raw.trim();
      const length = codePointLength(trimmed);
      if (length < FIELD_LIMITS.serviceInterest.min || length > FIELD_LIMITS.serviceInterest.max) {
        errors.push({ field: 'serviceInterest', code: 'FRM-002' });
      } else if (!(options.serviceInterests ?? []).includes(trimmed)) {
        errors.push({ field: 'serviceInterest', code: 'FRM-004' });
      } else {
        serviceInterest = trimmed;
      }
    }
  }

  const consent = input['transactionalConsentAck'];
  if (consent === undefined || typeof consent !== 'boolean') {
    errors.push({ field: 'transactionalConsentAck', code: 'FRM-001' });
  } else if (consent !== true) {
    errors.push({ field: 'transactionalConsentAck', code: 'FRM-004' });
  }

  if (errors.length > 0) {
    return err({ code: firstCode(errors), fields: errors });
  }

  const base = {
    name: name.value ?? '',
    email: email.value ?? '',
    message: message.value ?? '',
    ...(phone.value === undefined ? {} : { phone: phone.value }),
    ...(subject.value === undefined ? {} : { subject: subject.value }),
  };

  if (purpose === 'contact') {
    return ok({ kind: 'contact', ...base });
  }

  return ok({
    kind: 'service-enquiry',
    ...base,
    ...(organization.value === undefined ? {} : { organization: organization.value }),
    serviceInterest: serviceInterest ?? '',
  });
}
