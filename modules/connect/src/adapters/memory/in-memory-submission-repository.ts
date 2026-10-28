import type { DeliveryJob } from '../../domain/delivery.js';
import type { SubmissionRef } from '../../domain/identifiers.js';
import type {
  AcceptanceCommit,
  AcceptanceCommitResult,
  SubmissionRepositoryPort,
} from '../../ports/submission-repository-port.js';

/**
 * Reference in-memory adapter.
 *
 * **Not durable and not for production**: it exists so the port's atomic-accept contract can be
 * exercised deterministically. It performs no I/O, holds no secrets and is not exported from the
 * package entry point. Deduplication and commit happen in one synchronous step, which is atomic for
 * a single-threaded event loop.
 */
export class InMemorySubmissionRepository implements SubmissionRepositoryPort {
  readonly #accepted = new Map<string, SubmissionRef>();
  readonly #jobs: DeliveryJob[] = [];

  async commitAcceptance(commit: AcceptanceCommit): Promise<AcceptanceCommitResult> {
    const key = commit.submission.idempotencyIdentity;
    const existing = this.#accepted.get(key);
    if (existing !== undefined) {
      return { kind: 'duplicate', submissionRef: existing, originalCategory: 'accepted' };
    }
    this.#accepted.set(key, commit.submission.submissionRef);
    this.#jobs.push(commit.job);
    return { kind: 'committed', submissionRef: commit.submission.submissionRef };
  }

  async findAcceptedByIdentity(idempotencyIdentity: string): Promise<SubmissionRef | undefined> {
    return this.#accepted.get(idempotencyIdentity);
  }

  get acceptedCount(): number {
    return this.#accepted.size;
  }

  get jobs(): readonly DeliveryJob[] {
    return this.#jobs;
  }
}
