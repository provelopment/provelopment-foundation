import {
  findLifecycleAuditProblems,
  purgeCompletionRef,
  purgeFailureRef,
  purgeIntentRef,
  purgeUncertainRef,
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

export interface PurgeExpiredEnquiriesDependencies {
  readonly lifecycle: EnquiryLifecyclePort;
  readonly clock: ClockPort;
  readonly telemetry: TelemetryPort;
  /** Explicit profile; TEST values in tests, owner values in production. Never defaulted. */
  readonly retention: RetentionProfile;
}

export interface PurgeExpiredEnquiriesRequest {
  /**
   * A session created by an authenticated server adapter (`createOperatorSession`). A caller-supplied
   * principal object is **not** authority and is refused.
   */
  readonly session: OperatorSession;
  readonly ownerRef: OwnerId;
  /** Bounded batch size; the caller owns the schedule and the number. */
  readonly limit: number;
}

export type PurgeExpiredEnquiriesRefusalReason =
  'unauthenticated' | 'principalMalformed' | 'ownerNotPermitted' | 'actionNotPermitted';

export type PurgeFailureReason =
  'auditUnavailable' | 'deletionUnavailable' | 'completionUnavailable';

export interface PurgeCounts {
  readonly scanned: number;
  readonly deleted: number;
  readonly skipped: number;
  /** Candidates the Module refused to act on (foreign owner, not due, or refused by the store). */
  readonly rejected: number;
}

export type PurgeExpiredEnquiriesResult =
  | { readonly kind: 'refused'; readonly reason: PurgeExpiredEnquiriesRefusalReason }
  | ({ readonly kind: 'completed' } & PurgeCounts)
  | ({ readonly kind: 'failed'; readonly reason: PurgeFailureReason } & PurgeCounts);

/**
 * Enquiry retention enforcement (M4 §7, two-phase audit for the 0.1.0 release gate).
 *
 * Owner-scoped by construction and deny-by-default. The **Module** decides whether a candidate may be
 * deleted: it re-checks the candidate's owner and the current `enquiry-content` deadline under the
 * explicitly supplied profile, so a store that returns a foreign or not-due record cannot cause a deletion.
 *
 * The audit trail distinguishes facts:
 *
 * 1. `enquiry.purge-intent` — durable **before** deletion, with a deterministic `auditRef`;
 * 2. `enquiry.purged` — written only after the store confirms the content is absent;
 * 3. `enquiry.purge-failed` / `enquiry.purge-uncertain` — a refusal or an unproven outcome.
 *
 * An interruption therefore leaves an unresolved intent, never a false completion. `ReconcileEnquiryDeletions`
 * resolves such intents idempotently.
 */
export class PurgeExpiredEnquiries {
  readonly #deps: PurgeExpiredEnquiriesDependencies;

  constructor(dependencies: PurgeExpiredEnquiriesDependencies) {
    const problems = findRetentionProfileProblems(dependencies.retention);
    if (problems.length > 0) {
      throw new TypeError(`retention profile is invalid: ${problems.join('; ')}`);
    }
    this.#deps = dependencies;
  }

  async execute(request: PurgeExpiredEnquiriesRequest): Promise<PurgeExpiredEnquiriesResult> {
    const atEpochMs = this.#deps.clock.nowEpochMs();
    if (!Number.isInteger(request.limit) || request.limit < 1) {
      throw new TypeError('purge.limit must be a positive integer');
    }

    if (!isOperatorSession(request.session)) {
      await this.#auditBestEffort({
        auditRef: `access-denied:${atEpochMs}`,
        action: 'operator.access-denied',
        atEpochMs,
        ownerRef: request.ownerRef,
        reason: 'unauthenticated',
      });
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
      await this.#auditBestEffort({
        auditRef: `access-denied:${atEpochMs}:${principal.operatorRef}`,
        action: 'operator.access-denied',
        atEpochMs,
        ownerRef: request.ownerRef,
        operatorRef: principal.operatorRef,
        reason: authorization.reason,
      });
      emitDiagnostic(this.#deps.telemetry, {
        name: 'lifecycle.accessDenied',
        code: 'INF-004',
        ownerRef: request.ownerRef,
      });
      return { kind: 'refused', reason: authorization.reason };
    }

    let candidates;
    try {
      candidates = await this.#deps.lifecycle.listRetentionCandidates({
        ownerRef: request.ownerRef,
        acceptedBeforeEpochMs: atEpochMs - this.#deps.retention.enquiryRetentionMs,
        limit: request.limit,
      });
    } catch {
      return {
        kind: 'failed',
        reason: 'deletionUnavailable',
        scanned: 0,
        deleted: 0,
        skipped: 0,
        rejected: 0,
      };
    }

    let deleted = 0;
    let skipped = 0;
    let rejected = 0;
    const counts = (): PurgeCounts => ({
      scanned: candidates.length,
      deleted,
      skipped,
      rejected,
    });

    for (const candidate of candidates) {
      const authorizedToDelete =
        candidate.ownerRef === request.ownerRef &&
        isRetentionDueFor(
          this.#deps.retention,
          'enquiry-content',
          candidate.acceptedAtEpochMs,
          atEpochMs,
        );

      if (!authorizedToDelete) {
        rejected += 1;
        emitDiagnostic(this.#deps.telemetry, {
          name: 'lifecycle.candidateRejected',
          ownerRef: request.ownerRef,
          counts: { rejected: 1 },
        });
        continue;
      }

      const intent: LifecycleAuditRecord = {
        auditRef: purgeIntentRef(candidate.submissionRef),
        action: 'enquiry.purge-intent',
        atEpochMs,
        ownerRef: request.ownerRef,
        submissionRef: candidate.submissionRef,
        acceptedAtEpochMs: candidate.acceptedAtEpochMs,
        operatorRef: principal.operatorRef,
        retentionProfileName: this.#deps.retention.name,
      };

      // No deletion happens unless the intent is durable first.
      try {
        await this.#audit(intent);
      } catch {
        return { kind: 'failed', reason: 'auditUnavailable', ...counts() };
      }
      emitDiagnostic(this.#deps.telemetry, {
        name: 'lifecycle.purgeIntent',
        ownerRef: request.ownerRef,
        submissionRef: candidate.submissionRef,
      });

      let outcome: Awaited<ReturnType<EnquiryLifecyclePort['deleteEnquiry']>>;
      try {
        outcome = await this.#deps.lifecycle.deleteEnquiry({
          submissionRef: candidate.submissionRef,
          ownerRef: request.ownerRef,
          acceptedAtEpochMs: candidate.acceptedAtEpochMs,
          atEpochMs,
        });
      } catch {
        // Intent is durable; the deletion outcome is unknown. Stop rather than claim progress.
        emitDiagnostic(this.#deps.telemetry, {
          name: 'lifecycle.deletionFailed',
          code: 'INF-004',
          ownerRef: request.ownerRef,
          counts: { deleted, skipped, rejected },
        });
        return { kind: 'failed', reason: 'deletionUnavailable', ...counts() };
      }

      if (outcome === 'deleted') {
        // Independent confirmation (R03-02): a store that reports `deleted` while a rendered message still
        // exists must never produce a completion record. The Module asks again, and `findEnquiry` covers
        // every content copy — record, job and outbound message snapshot.
        let remaining: Awaited<ReturnType<EnquiryLifecyclePort['findEnquiry']>>;
        try {
          remaining = await this.#deps.lifecycle.findEnquiry({
            submissionRef: candidate.submissionRef,
            ownerRef: request.ownerRef,
          });
        } catch {
          // Content may be gone, but the check itself failed: the outcome is unproven, not complete.
          return { kind: 'failed', reason: 'deletionUnavailable', ...counts() };
        }

        if (remaining !== 'absent') {
          await this.#auditBestEffort({
            auditRef: purgeFailureRef(candidate.submissionRef),
            action: 'enquiry.purge-failed',
            atEpochMs,
            ownerRef: request.ownerRef,
            submissionRef: candidate.submissionRef,
            acceptedAtEpochMs: candidate.acceptedAtEpochMs,
            intentRef: intent.auditRef,
            reason: 'contentRetained',
          });
          rejected += 1;
          emitDiagnostic(this.#deps.telemetry, {
            name: 'lifecycle.purgeFailed',
            ownerRef: request.ownerRef,
            submissionRef: candidate.submissionRef,
          });
          continue;
        }

        try {
          await this.#audit({
            auditRef: purgeCompletionRef(candidate.submissionRef),
            action: 'enquiry.purged',
            atEpochMs,
            ownerRef: request.ownerRef,
            submissionRef: candidate.submissionRef,
            acceptedAtEpochMs: candidate.acceptedAtEpochMs,
            intentRef: intent.auditRef,
            operatorRef: principal.operatorRef,
            retentionProfileName: this.#deps.retention.name,
          });
        } catch {
          // Content is gone but completion is unproven: the intent remains for reconciliation.
          return { kind: 'failed', reason: 'completionUnavailable', ...counts() };
        }
        deleted += 1;
        continue;
      }

      if (outcome === 'incomplete') {
        // A copy survived this attempt. Nothing is claimed: the record is still present, so the next
        // retention pass will find the same candidate and resume the deletion.
        await this.#auditBestEffort({
          auditRef: purgeFailureRef(candidate.submissionRef),
          action: 'enquiry.purge-failed',
          atEpochMs,
          ownerRef: request.ownerRef,
          submissionRef: candidate.submissionRef,
          acceptedAtEpochMs: candidate.acceptedAtEpochMs,
          intentRef: intent.auditRef,
          reason: 'contentRetained',
        });
        rejected += 1;
        emitDiagnostic(this.#deps.telemetry, {
          name: 'lifecycle.purgeFailed',
          ownerRef: request.ownerRef,
          submissionRef: candidate.submissionRef,
        });
        continue;
      }

      if (outcome === 'notFound') {
        // The content is absent, but this run did not observe the deletion. Record uncertainty; never claim
        // completion. Reconciliation confirms it from `findEnquiry`.
        await this.#auditBestEffort({
          auditRef: purgeUncertainRef(candidate.submissionRef),
          action: 'enquiry.purge-uncertain',
          atEpochMs,
          ownerRef: request.ownerRef,
          submissionRef: candidate.submissionRef,
          acceptedAtEpochMs: candidate.acceptedAtEpochMs,
          intentRef: intent.auditRef,
          reason: 'notFound',
        });
        skipped += 1;
        emitDiagnostic(this.#deps.telemetry, {
          name: 'lifecycle.uncertain',
          ownerRef: request.ownerRef,
          submissionRef: candidate.submissionRef,
        });
        continue;
      }

      await this.#auditBestEffort({
        auditRef: purgeFailureRef(candidate.submissionRef),
        action: 'enquiry.purge-failed',
        atEpochMs,
        ownerRef: request.ownerRef,
        submissionRef: candidate.submissionRef,
        acceptedAtEpochMs: candidate.acceptedAtEpochMs,
        intentRef: intent.auditRef,
        reason: outcome,
      });
      rejected += 1;
      emitDiagnostic(this.#deps.telemetry, {
        name: 'lifecycle.purgeFailed',
        ownerRef: request.ownerRef,
        submissionRef: candidate.submissionRef,
      });
    }

    emitDiagnostic(this.#deps.telemetry, {
      name: 'lifecycle.purged',
      ownerRef: request.ownerRef,
      counts: { scanned: candidates.length, deleted, skipped, rejected },
    });
    return { kind: 'completed', ...counts() };
  }

  async #audit(record: LifecycleAuditRecord): Promise<void> {
    const problems = findLifecycleAuditProblems(record);
    if (problems.length > 0) throw new TypeError(`audit record is invalid: ${problems.join('; ')}`);
    await this.#deps.lifecycle.recordAudit(record);
  }

  async #auditBestEffort(record: LifecycleAuditRecord): Promise<void> {
    try {
      await this.#audit(record);
    } catch {
      emitDiagnostic(this.#deps.telemetry, {
        name: 'lifecycle.deletionFailed',
        code: 'INF-004',
        ownerRef: record.ownerRef,
      });
    }
  }
}
