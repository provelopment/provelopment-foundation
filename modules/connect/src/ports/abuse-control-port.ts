import type { CommunicationContext } from '../domain/communication-context.js';
import type { QuotaLimits } from '../domain/destination-policy.js';

export interface AbuseEvaluationRequest {
  readonly context: CommunicationContext;
  /** Secondary duplicate signal only; never an authorization claim (M1 §C.6). */
  readonly contentFingerprint: string;
  readonly atEpochMs: number;
  /**
   * Owner-authored limits from the **resolved policy** (M5 §3). Only the `attempt*` values apply here: this
   * port counts request attempts, including replays. Accepted-enquiry capacity is a separate port, so a
   * protective attempt limit can never be mistaken for a business's successful-enquiry quota.
   */
  readonly quotas: QuotaLimits;
}

/**
 * `verificationUnavailable` is a fail-closed answer (`ABS-003`). An adapter must not silently allow
 * traffic when its verifier is down unless the owner has accepted fail-open (`P-07`).
 */
export type AbuseDecision =
  | { readonly kind: 'allowed' }
  | { readonly kind: 'budgetExhausted' }
  | { readonly kind: 'verificationRefused' }
  | { readonly kind: 'verificationUnavailable' };

export interface AbuseControlPort {
  /**
   * Contract obligations:
   * - account per Site/Facet/Entity as configured; never share one Entity's budget with another;
   * - treat client-supplied hints as untrusted;
   * - throw only for genuine adapter failure (the Module maps a throw to `INF-003`).
   */
  evaluate(request: AbuseEvaluationRequest): Promise<AbuseDecision>;
}
