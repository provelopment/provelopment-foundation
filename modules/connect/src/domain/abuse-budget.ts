import type { DeploymentId, OwnerId, SiteId } from './identifiers.js';

/**
 * Owner-, Site- and **deployment-scoped** submission budgets (M5 §2, extending M4 §6).
 *
 * This is a **pure** evaluation: it holds no clock, no state and no defaults. A consumer's abuse adapter
 * records submissions and calls this rule with the quotas declared by the resolved policy, so unrelated
 * deployments, owners and Sites never share a budget and no numeric value is invented by the Module.
 *
 * Partitioning matches the policy identity namespace: `deploymentId` is part of every key. Two independent
 * deployments may legitimately reuse the same owner and Site identifiers, and a Site slug is unique only
 * inside `(deploymentId, ownerRef)` — a budget keyed without the deployment would collide across tenants.
 *
 * The window is one hour by definition of the quota names (`perOwnerHour`, `perSiteHour`).
 */
export const SUBMISSION_BUDGET_WINDOW_MS = 3_600_000;

export interface SubmissionStamp {
  readonly deploymentId: DeploymentId;
  readonly ownerRef: OwnerId;
  readonly siteRef: SiteId;
  readonly atEpochMs: number;
}

export interface SubmissionBudgetTarget {
  readonly deploymentId: DeploymentId;
  readonly ownerRef: OwnerId;
  readonly siteRef: SiteId;
}

export interface SubmissionBudgetLimits {
  readonly perOwnerHour?: number;
  readonly perSiteHour?: number;
}

export type SubmissionBudgetVerdict = 'allowed' | 'ownerBudgetExhausted' | 'siteBudgetExhausted';

export function evaluateSubmissionBudget(
  stamps: readonly SubmissionStamp[],
  target: SubmissionBudgetTarget,
  limits: SubmissionBudgetLimits,
  atEpochMs: number,
): SubmissionBudgetVerdict {
  const windowStart = atEpochMs - SUBMISSION_BUDGET_WINDOW_MS;
  const inWindow = stamps.filter(
    (stamp) =>
      stamp.deploymentId === target.deploymentId &&
      stamp.atEpochMs > windowStart &&
      stamp.atEpochMs <= atEpochMs,
  );

  if (limits.perOwnerHour !== undefined) {
    const ownerCount = inWindow.filter((stamp) => stamp.ownerRef === target.ownerRef).length;
    if (ownerCount >= limits.perOwnerHour) return 'ownerBudgetExhausted';
  }

  if (limits.perSiteHour !== undefined) {
    const siteCount = inWindow.filter(
      (stamp) => stamp.ownerRef === target.ownerRef && stamp.siteRef === target.siteRef,
    ).length;
    if (siteCount >= limits.perSiteHour) return 'siteBudgetExhausted';
  }

  return 'allowed';
}

/** Configuration defects of injected quota values. Zero, negative and fractional limits are refused. */
export function findSubmissionBudgetProblems(limits: SubmissionBudgetLimits): readonly string[] {
  const problems: string[] = [];
  for (const [name, value] of [
    ['perOwnerHour', limits.perOwnerHour],
    ['perSiteHour', limits.perSiteHour],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      problems.push(`${name} must be a positive integer`);
    }
  }
  return problems;
}
