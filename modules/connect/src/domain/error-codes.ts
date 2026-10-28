/**
 * Internal refusal codes and their exhaustive public mapping (M1 §C.5.1).
 *
 * The internal code is for telemetry and for the caller's own diagnostics; the public
 * `SafeCategory` is the only thing a visitor may ever be told. The mapping below is exhaustive by
 * construction: `SAFE_CATEGORY_BY_CODE` is a total `Record` over the code union, so adding a code
 * without a category is a compile error.
 */

export const SAFE_CATEGORIES = [
  'accepted',
  'duplicate',
  'rejected_invalid',
  'rejected_abuse',
  'unavailable',
  'context_unresolved',
] as const;

export type SafeCategory = (typeof SAFE_CATEGORIES)[number];

export const INTERNAL_CODES = [
  'CTX-001',
  'CTX-002',
  'CTX-003',
  'CTX-004',
  'POL-001',
  'POL-002',
  'POL-003',
  'POL-004',
  'FRM-001',
  'FRM-002',
  'FRM-003',
  'FRM-004',
  'FRM-005',
  'ABS-001',
  'ABS-002',
  'ABS-003',
  'ABS-004',
  'DUP-001',
  'INF-001',
  'INF-002',
  'INF-003',
  'INF-004',
  'INF-005',
  'ACC-000',
] as const;

export type InternalCode = (typeof INTERNAL_CODES)[number];

export const SAFE_CATEGORY_BY_CODE: Readonly<Record<InternalCode, SafeCategory>> = {
  'CTX-001': 'context_unresolved',
  'CTX-002': 'context_unresolved',
  'CTX-003': 'context_unresolved',
  'CTX-004': 'context_unresolved',
  'POL-001': 'unavailable',
  'POL-002': 'unavailable',
  'POL-003': 'unavailable',
  'POL-004': 'unavailable',
  'FRM-001': 'rejected_invalid',
  'FRM-002': 'rejected_invalid',
  'FRM-003': 'rejected_invalid',
  'FRM-004': 'rejected_invalid',
  'FRM-005': 'rejected_invalid',
  'ABS-001': 'rejected_abuse',
  'ABS-002': 'rejected_abuse',
  'ABS-003': 'unavailable',
  'ABS-004': 'rejected_abuse',
  'DUP-001': 'duplicate',
  'INF-001': 'unavailable',
  'INF-002': 'unavailable',
  'INF-003': 'unavailable',
  'INF-004': 'unavailable',
  'INF-005': 'unavailable',
  'ACC-000': 'accepted',
};

/** Human-readable internal meaning. Never shown to a visitor. */
export const CODE_DESCRIPTIONS: Readonly<Record<InternalCode, string>> = {
  'CTX-001': 'Required communication-context field missing or malformed',
  'CTX-002': 'Site/Page/form ownership cannot be satisfied for this owner',
  'CTX-003': 'Publication authorization absent, unauthored or otherwise unauthorized',
  'CTX-004': 'Context is ambiguous or contradicted by the resolved authority',
  'POL-001': 'No applicable destination policy, or the policy is unusable/disabled/expired',
  'POL-002': 'Policy scope does not cover the supplied Site, placement, form or authorization',
  'POL-003': 'Purpose not permitted for this context',
  'POL-004': 'Sender identity unverified or not permitted',
  'FRM-001': 'Unknown field, wrong shape, or field not permitted for the purpose',
  'FRM-002': 'Payload or per-field bounds exceeded',
  'FRM-003': 'Control characters, line breaks in a single-line field, or header-shaped content',
  'FRM-004': 'Format, enumeration or consent-acknowledgement invalid',
  'FRM-005': 'Form token missing, malformed, expired or integrity-invalid',
  'ABS-001': 'Abuse budget exhausted',
  'ABS-002': 'Human verification refused or unsupported',
  'ABS-003': 'Verification service unavailable under a fail-closed posture',
  'ABS-004': 'Accepted-enquiry capacity exhausted (separate from the request-attempt budget)',
  'DUP-001': 'Replay of an already-accepted submission inside the dedupe window',
  'INF-001': 'Durable acceptance unavailable at commit time',
  'INF-002': 'Destination-policy adapter threw or timed out',
  'INF-003': 'Abuse-control adapter threw or timed out',
  'INF-004': 'Unclassified internal error',
  'INF-005': 'Enquiry-capacity adapter threw, timed out or could not reserve',
  'ACC-000': 'Accepted and durably recorded',
};

export function categoryOf(code: InternalCode): SafeCategory {
  return SAFE_CATEGORY_BY_CODE[code];
}

export function isInternalCode(value: unknown): value is InternalCode {
  return typeof value === 'string' && (INTERNAL_CODES as readonly string[]).includes(value);
}
