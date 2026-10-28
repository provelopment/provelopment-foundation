import type { ClockPort } from '../ports/clock-port.js';
import type { EnquiryQuotaPort } from '../ports/enquiry-quota-port.js';
import type { TelemetryPort } from '../ports/telemetry-port.js';
import { emitDiagnostic } from '../ports/telemetry-port.js';

export interface ReconcileEnquiryCapacityDependencies {
  readonly quota: EnquiryQuotaPort;
  readonly clock: ClockPort;
  readonly telemetry: TelemetryPort;
}

export interface ReconcileEnquiryCapacityRequest {
  readonly limit: number;
}

export type ReconcileEnquiryCapacityResult =
  | {
      readonly kind: 'completed';
      readonly scanned: number;
      readonly reconciled: number;
      readonly failed: number;
    }
  | {
      readonly kind: 'failed';
      readonly scanned: number;
      readonly reconciled: number;
      readonly failed: number;
      readonly reason: 'quotaUnavailable';
    };

/**
 * Completes accepted-enquiry capacity commits that were interrupted (0.1.0 release gate, §3A).
 *
 * A durable acceptance is never rolled back because its capacity commit failed. The adapter retains the
 * reservation under stable identities (`reservationRef` + `submissionRef`), and this reconciliation retries
 * the idempotent `commit`. Re-running it is safe: the adapter must not double-count, and a reservation that
 * is already committed is not returned by `listPendingCommits`.
 *
 * The Module cannot make a remote ledger atomic; a production adapter must supply a shared, transactional
 * store with unique constraints on both identities and must retain abandoned reservations long enough to be
 * reconciled. No distributed limiter is provided.
 */
export class ReconcileEnquiryCapacity {
  readonly #deps: ReconcileEnquiryCapacityDependencies;

  constructor(dependencies: ReconcileEnquiryCapacityDependencies) {
    this.#deps = dependencies;
  }

  async execute(request: ReconcileEnquiryCapacityRequest): Promise<ReconcileEnquiryCapacityResult> {
    if (!Number.isInteger(request.limit) || request.limit < 1) {
      throw new TypeError('reconcile.limit must be a positive integer');
    }
    const atEpochMs = this.#deps.clock.nowEpochMs();

    let pending;
    try {
      pending = await this.#deps.quota.listPendingCommits(request.limit);
    } catch {
      emitDiagnostic(this.#deps.telemetry, {
        name: 'acceptance.quotaReconciled',
        code: 'INF-005',
        counts: { scanned: 0, reconciled: 0, failed: 0 },
      });
      return { kind: 'failed', scanned: 0, reconciled: 0, failed: 0, reason: 'quotaUnavailable' };
    }

    let reconciled = 0;
    let failed = 0;
    for (const entry of pending) {
      try {
        await this.#deps.quota.commit({ ...entry, atEpochMs });
        reconciled += 1;
      } catch {
        failed += 1;
      }
    }

    emitDiagnostic(this.#deps.telemetry, {
      name: 'acceptance.quotaReconciled',
      counts: { scanned: pending.length, reconciled, failed },
    });
    return { kind: 'completed', scanned: pending.length, reconciled, failed };
  }
}
