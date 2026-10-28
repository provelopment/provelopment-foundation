import type { OwnerId, SubmissionRef } from './identifiers.js';

/**
 * Auditable lifecycle actions (M4 §7; phase separation added for the 0.1.0 release gate).
 *
 * A purge is two facts, not one: an **intent** (durable before any deletion) and a **completion** (only after
 * the content is confirmed absent). `enquiry.purge-failed` records a refused or failed deletion, and
 * `enquiry.purge-uncertain` records that the outcome could not be proven and needs reconciliation.
 *
 * An audit record is deliberately built from identifiers, counts and a bounded reason only: it can never
 * contain a visitor name, address, phone or message, because those fields do not exist here.
 */
export const LIFECYCLE_ACTIONS = [
  'enquiry.purge-intent',
  'enquiry.purged',
  'enquiry.purge-failed',
  'enquiry.purge-uncertain',
  'operator.access-denied',
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

/** Actions that resolve a previously recorded intent and therefore require `intentRef`. */
const RESOLVING_ACTIONS: ReadonlySet<LifecycleAction> = new Set([
  'enquiry.purged',
  'enquiry.purge-failed',
  'enquiry.purge-uncertain',
]);

export interface LifecycleAuditRecord {
  /** Stable identity. Writing the same `auditRef` twice is a no-op, so reconciliation is idempotent. */
  readonly auditRef: string;
  readonly action: LifecycleAction;
  readonly atEpochMs: number;
  readonly ownerRef: OwnerId;
  readonly submissionRef?: SubmissionRef;
  /** Acceptance time the decision was based on; lets reconciliation re-verify the retention date. */
  readonly acceptedAtEpochMs?: number;
  /** For a resolving action: the `auditRef` of the intent it resolves. */
  readonly intentRef?: string;
  readonly operatorRef?: string;
  readonly reason?: string;
  /** Named profile used for this action, so a retention decision is auditable without visitor content. */
  readonly retentionProfileName?: string;
  readonly counts?: Readonly<Record<string, number>>;
}

export const MAX_AUDIT_TEXT_LENGTH = 200;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const AUDIT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function findLifecycleAuditProblems(record: LifecycleAuditRecord): readonly string[] {
  const problems: string[] = [];
  if (!(LIFECYCLE_ACTIONS as readonly string[]).includes(record.action)) {
    problems.push('unknown lifecycle action');
  }
  if (
    typeof record.auditRef !== 'string' ||
    record.auditRef.length === 0 ||
    record.auditRef.length > MAX_AUDIT_TEXT_LENGTH ||
    !AUDIT_REF_PATTERN.test(record.auditRef)
  ) {
    problems.push('auditRef must be a bounded identifier');
  }
  if (!Number.isInteger(record.atEpochMs) || record.atEpochMs < 0) {
    problems.push('atEpochMs must be a non-negative integer');
  }
  if (record.ownerRef.trim() === '') problems.push('ownerRef missing');
  if (record.action.startsWith('enquiry.')) {
    if (record.submissionRef === undefined || record.submissionRef.trim() === '') {
      problems.push('submissionRef is required for an enquiry action');
    }
  }
  if (RESOLVING_ACTIONS.has(record.action) && record.intentRef === undefined) {
    problems.push('intentRef is required for a resolving action');
  }
  if (
    record.acceptedAtEpochMs !== undefined &&
    (!Number.isInteger(record.acceptedAtEpochMs) || record.acceptedAtEpochMs < 0)
  ) {
    problems.push('acceptedAtEpochMs must be a non-negative integer');
  }
  for (const [name, value] of [
    ['intentRef', record.intentRef],
    ['operatorRef', record.operatorRef],
    ['reason', record.reason],
    ['retentionProfileName', record.retentionProfileName],
  ] as const) {
    if (value === undefined) continue;
    if (value.length > MAX_AUDIT_TEXT_LENGTH) problems.push(`${name} too long`);
    if (CONTROL_CHARACTER_PATTERN.test(value)) problems.push(`${name} contains control characters`);
  }
  if (record.counts !== undefined) {
    for (const [key, value] of Object.entries(record.counts)) {
      if (!Number.isInteger(value) || value < 0) {
        problems.push(`count ${key} must be a non-negative integer`);
      }
    }
  }
  return problems;
}

/** Deterministic audit identities, so a retried purge cannot create a second intent or completion. */
export function purgeIntentRef(submissionRef: SubmissionRef): string {
  return `purge-intent:${submissionRef}`;
}

export function purgeCompletionRef(submissionRef: SubmissionRef): string {
  return `purge-completed:${submissionRef}`;
}

export function purgeFailureRef(submissionRef: SubmissionRef): string {
  return `purge-failed:${submissionRef}`;
}

export function purgeUncertainRef(submissionRef: SubmissionRef): string {
  return `purge-uncertain:${submissionRef}`;
}
