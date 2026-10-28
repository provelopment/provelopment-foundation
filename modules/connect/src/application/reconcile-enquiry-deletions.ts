import {
  findLifecycleAuditProblems,
  purgeCompletionRef,
  purgeFailureRef,
  type LifecycleAuditRecord,
} from '../domain/lifecycle.js';
import type { OwnerId } from '../domain/identifiers.js';
import {
  authorizeOperatorAction,
  isOperatorSession,
  type OperatorAuthorization,
  type OperatorSession,
} from '../domain/operator-access.js';
import {
  findRetentionProfileProblems,
  isRetentionDueFor,
  type RetentionProfile,
} from '../domain/retention.js';
import type { ClockPort } from '../ports/clock-port.js';
import type { EnquiryLifecyclePort } from '../ports/enquiry-lifecycle-port.js';
import type { TelemetryPort } from '../ports/telemetry-port.js';
import { emitDiagnostic } from '../ports/telemetry-port.js';

export interface ReconcileEnquiryDeletionsDependencies {
  readonly lifecycle: EnquiryLifecyclePort;
  readonly clock: ClockPort;
  readonly telemetry: TelemetryPort;
  /** The current profile; an intent that is no longer due is failed, never completed. */
  readonly retention: RetentionProfile;
}

export interface ReconcileEnquiryDeletionsRequest {
  /** Created only by an authenticated server adapter; a bare principal is refused. */
  readonly session: OperatorSession;
  readonly ownerRef: OwnerId;
  readonly limit: number;
}

export type ReconcileEnquiryDeletionsResult =
  | {
      readonly kind: 'refused';
      readonly reason:
        'unauthenticated' | 'principalMalformed' | 'ownerNotPermitted' | 'actionNotPermitted';
    }
  | {
      readonly kind: 'completed';
      readonly scanned: number;
      /** Intents confirmed absent and completed. */
      readonly completed: number;
      /** Intents failed honestly (content retained, owner mismatch or no longer due). */
      readonly failed: number;
    }
  | {
      readonly kind: 'failed';
      readonly scanned: number;
      readonly completed: number;
      readonly failed: number;
      readonly reason: 'auditUnavailable' | 'lifecycleUnavailable';
    };

/**
 * Resolves purge intents left by an interruption (0.1.0 release gate, §3B).
 *
 * An intent proves a deletion was *attempted*, never that it happened. This use case asks the store whether
 * the content is actually present and records the matching resolution:
 *
 * - absent → `enquiry.purged` (completion, idempotent by `auditRef`);
 * - present → `enquiry.purge-failed` with `contentRetained` (content untouched);
 * - owner mismatch → `enquiry.purge-failed` with `ownerMismatch`;
 * - no longer due under the current profile → `enquiry.purge-failed` with `notDue`.
 *
 * Re-running it cannot double-count or create duplicate audit evidence: the store records each `auditRef`
 * once, and completion uses the same deterministic `auditRef` for the same submission.
 */
export class ReconcileEnquiryDeletions {
  readonly #deps: ReconcileEnquiryDeletionsDependencies;

  constructor(dependencies: ReconcileEnquiryDeletionsDependencies) {
    const problems = findRetentionProfileProblems(dependencies.retention);
    if (problems.length > 0) {
      throw new TypeError(`retention profile is invalid: ${problems.join('; ')}`);
    }
    this.#deps = dependencies;
  }

  async execute(
    request: ReconcileEnquiryDeletionsRequest,
  ): Promise<ReconcileEnquiryDeletionsResult> {
    if (!Number.isInteger(request.limit) || request.limit < 1) {
      throw new TypeError('reconcile.limit must be a positive integer');
    }
    const atEpochMs = this.#deps.clock.nowEpochMs();

    if (!isOperatorSession(request.session)) {
      emitDiagnostic(this.#deps.telemetry, {
        name: 'lifecycle.accessDenied',
        code: 'INF-004',
        ownerRef: request.ownerRef,
      });
      return { kind: 'refused', reason: 'unauthenticated' };
    }

    const principal = request.session.principal;
    const authorization: OperatorAuthorization = authorizeOperatorAction(principal, {
      ownerRef: request.ownerRef,
      action: 'purge-expired',
    });
    if (authorization.kind === 'denied') {
      emitDiagnostic(this.#deps.telemetry, {
        name: 'lifecycle.accessDenied',
        code: 'INF-004',
        ownerRef: request.ownerRef,
      });
      return { kind: 'refused', reason: authorization.reason };
    }

    let intents;
    try {
      intents = await this.#deps.lifecycle.listDeletionIntents({
        ownerRef: request.ownerRef,
        limit: request.limit,
      });
    } catch {
      return {
        kind: 'failed',
        scanned: 0,
        completed: 0,
        failed: 0,
        reason: 'lifecycleUnavailable',
      };
    }

    let completed = 0;
    let failed = 0;
    const counts = () => ({ scanned: intents.length, completed, failed });

    for (const intent of intents) {
      if (intent.ownerRef !== request.ownerRef) {
        failed += 1;
        continue;
      }

      let status: Awaited<ReturnType<EnquiryLifecyclePort['findEnquiry']>>;
      try {
        status = await this.#deps.lifecycle.findEnquiry({
          submissionRef: intent.submissionRef,
          ownerRef: request.ownerRef,
        });
      } catch {
        return { kind: 'failed', reason: 'lifecycleUnavailable', ...counts() };
      }

      const resolution: LifecycleAuditRecord =
        status === 'absent'
          ? {
              auditRef: purgeCompletionRef(intent.submissionRef),
              action: 'enquiry.purged',
              atEpochMs,
              ownerRef: request.ownerRef,
              submissionRef: intent.submissionRef,
              acceptedAtEpochMs: intent.acceptedAtEpochMs,
              intentRef: intent.intentRef,
              operatorRef: principal.operatorRef,
              retentionProfileName: this.#deps.retention.name,
              reason: 'reconciled',
            }
          : {
              auditRef: purgeFailureRef(intent.submissionRef),
              action: 'enquiry.purge-failed',
              atEpochMs,
              ownerRef: request.ownerRef,
              submissionRef: intent.submissionRef,
              acceptedAtEpochMs: intent.acceptedAtEpochMs,
              intentRef: intent.intentRef,
              operatorRef: principal.operatorRef,
              retentionProfileName: this.#deps.retention.name,
              reason:
                status === 'ownerMismatch'
                  ? 'ownerMismatch'
                  : isRetentionDueFor(
                        this.#deps.retention,
                        'enquiry-content',
                        intent.acceptedAtEpochMs,
                        atEpochMs,
                      )
                    ? 'contentRetained'
                    : 'notDue',
            };

      try {
        await this.#audit(resolution);
      } catch {
        return { kind: 'failed', reason: 'auditUnavailable', ...counts() };
      }

      if (status === 'absent') completed += 1;
      else failed += 1;
    }

    emitDiagnostic(this.#deps.telemetry, {
      name: 'lifecycle.reconciled',
      ownerRef: request.ownerRef,
      counts: { scanned: intents.length, completed, failed },
    });
    return { kind: 'completed', ...counts() };
  }

  async #audit(record: LifecycleAuditRecord): Promise<void> {
    const problems = findLifecycleAuditProblems(record);
    if (problems.length > 0) throw new TypeError(`audit record is invalid: ${problems.join('; ')}`);
    await this.#deps.lifecycle.recordAudit(record);
  }
}
