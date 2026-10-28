/**
 * Named retention profiles (M4 §7).
 *
 * A profile is **named configuration**, not a policy decision: the owner supplies the numbers, the Module
 * validates them and computes deadlines. No retention period is chosen here, and no default is shipped —
 * a profile without positive integer values is refused rather than silently replaced.
 */
export interface RetentionProfile {
  readonly name: string;
  /** How long an accepted enquiry (and its frozen destination) is kept. */
  readonly enquiryRetentionMs: number;
  /** How long attempt/outcome history is kept for audit. */
  readonly attemptRetentionMs: number;
}

export const MAX_RETENTION_PROFILE_NAME_LENGTH = 64;

export function findRetentionProfileProblems(profile: RetentionProfile): readonly string[] {
  const problems: string[] = [];
  if (profile.name.trim() === '' || profile.name.length > MAX_RETENTION_PROFILE_NAME_LENGTH) {
    problems.push('retention profile name must be 1..64 characters');
  }
  for (const [name, value] of [
    ['enquiryRetentionMs', profile.enquiryRetentionMs],
    ['attemptRetentionMs', profile.attemptRetentionMs],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      problems.push(`${name} must be a positive integer number of milliseconds`);
    }
  }
  return problems;
}

/** Epoch milliseconds at which an enquiry accepted at `acceptedAtEpochMs` becomes purgeable. */
export function retentionDeadline(profile: RetentionProfile, acceptedAtEpochMs: number): number {
  return acceptedAtEpochMs + profile.enquiryRetentionMs;
}

export function isRetentionDue(
  profile: RetentionProfile,
  acceptedAtEpochMs: number,
  atEpochMs: number,
): boolean {
  return retentionDeadline(profile, acceptedAtEpochMs) <= atEpochMs;
}

/**
 * Retention scopes are independent policies (M5 §4).
 *
 * `enquiry-content` governs the visitor's enquiry and its frozen destination; `delivery-attempts` governs
 * attempt/outcome history. They are separate fields with separate deadlines, and one may never be used as
 * a substitute for the other: a short attempt retention must not delete enquiry content, and a long attempt
 * retention must not keep content alive past its own deadline.
 */
export type RetentionScope = 'enquiry-content' | 'delivery-attempts';

export function retentionDeadlineFor(
  profile: RetentionProfile,
  scope: RetentionScope,
  acceptedAtEpochMs: number,
): number {
  const duration =
    scope === 'enquiry-content' ? profile.enquiryRetentionMs : profile.attemptRetentionMs;
  return acceptedAtEpochMs + duration;
}

export function isRetentionDueFor(
  profile: RetentionProfile,
  scope: RetentionScope,
  acceptedAtEpochMs: number,
  atEpochMs: number,
): boolean {
  return retentionDeadlineFor(profile, scope, acceptedAtEpochMs) <= atEpochMs;
}
