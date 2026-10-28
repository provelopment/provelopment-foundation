/**
 * Identifier kinds. `transmission` identifies one non-durable direct send
 * (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`); the durable kinds are unchanged.
 */
export type IdentifierKind = 'submission' | 'deliveryJob' | 'deliveryAttempt' | 'transmission';

/**
 * Identifier generation is a port: the Module must not call a random source itself, and tests need
 * deterministic identities.
 *
 * **Uniqueness contract (state it, do not assume it):**
 *
 * - `deliveryJob` ids must be unique **within one idempotency namespace** — one `(installation,
 *   environment)` pair, declared to `DispatchDelivery` as `idempotencyNamespace`. They are *not* required
 *   to be unique across namespaces, and a generator that numbers jobs from 1 in every deployment is
 *   therefore acceptable;
 * - a job's provider identity is the pair `(namespace, jobId)`, which is what makes the provider
 *   idempotency key `coms-web:<namespace>:<jobId>` collision-free between two consumers that share one
 *   provider account;
 * - inside a namespace, an id must never be reused for a **different** logical job: the provider would
 *   then deduplicate two genuinely different messages into one;
 * - an id is stable: the same job yields the same value on every retry, so the derived key never changes.
 */
export interface IdGeneratorPort {
  next(kind: IdentifierKind): string;
}
