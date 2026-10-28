import type { DeliveryEvent } from '../domain/delivery-event.js';
import type { DeliveryJobId } from '../domain/identifiers.js';

/** Why a delivery callback was refused. These are fixed tokens: a verifier must not report provider text. */
export type DeliveryVerificationFailure =
  'signature-missing' | 'signature-invalid' | 'payload-malformed' | 'payload-too-large';

/** Why a delivery callback was accepted but produced no evidence. */
export type DeliveryVerificationIgnore = 'unhandled-event-type' | 'unrelated-message';

export type DeliveryEventVerification =
  | { readonly kind: 'verified'; readonly events: readonly DeliveryEvent[] }
  | { readonly kind: 'rejected'; readonly reason: DeliveryVerificationFailure }
  | { readonly kind: 'ignored'; readonly reason: DeliveryVerificationIgnore };

/**
 * Verifies an inbound delivery callback and maps it onto Module identity (CW-04).
 *
 * Contract obligations:
 * - verification runs over the **raw request body** exactly as received. Parsing and re-serialising
 *   first changes the bytes a signature covers, so the raw bytes are supplied here;
 * - a callback that cannot be authenticated produces `rejected`, never `verified`, and the caller must
 *   answer it with a client error (not a retryable server error);
 * - an authenticated callback for a message this deployment does not own produces `ignored`, so a
 *   shared endpoint cannot leak another tenant's existence;
 * - `rejected.reason` and `ignored.reason` are fixed tokens. A provider or signature string must never
 *   be placed in them.
 */
export interface DeliveryEventVerifierPort {
  verify(request: {
    readonly rawBody: Uint8Array;
    readonly headers: Readonly<Record<string, string>>;
    readonly receivedAtEpochMs: number;
  }): Promise<DeliveryEventVerification>;
}

/**
 * `recorded` — new evidence; `duplicate` — the same event id was already stored (a provider retry, which
 * must be answered with success); `conflict` — the same event id arrived with different content, which is
 * a defect worth escalating rather than silently accepting.
 */
export type DeliveryEventRecordOutcome = 'recorded' | 'duplicate' | 'conflict';

/**
 * Durable store for verified delivery events.
 *
 * Contract obligations:
 * - `record` is idempotent by `eventId`;
 * - arrival order is irrelevant, because providers deliver out of order and retry: the store must not
 *   assume the newest arrival is the newest event;
 * - results are scoped by job, which carries the owner and submission identity, so one tenant's
 *   evidence is never readable through another tenant's lookup;
 * - a failure throws, and the caller must answer the callback with a retryable status rather than
 *   acknowledging evidence it did not keep.
 */
export interface DeliveryEventStorePort {
  record(event: DeliveryEvent): Promise<DeliveryEventRecordOutcome>;
  listForJob(jobId: DeliveryJobId): Promise<readonly DeliveryEvent[]>;
}
