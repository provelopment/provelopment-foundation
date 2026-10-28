import { dedupeDeliveryEvents, type DeliveryEvent } from '../../domain/delivery-event.js';
import type { DeliveryJobId } from '../../domain/identifiers.js';
import type {
  DeliveryEventRecordOutcome,
  DeliveryEventStorePort,
} from '../../ports/delivery-event-port.js';

/** Stable, order-independent content of an event, used to tell a replay from a contradiction. */
function fingerprintOf(event: DeliveryEvent): string {
  return JSON.stringify([
    event.providerReference,
    event.jobId,
    event.ownerRef,
    event.submissionRef,
    event.occurredAtEpochMs,
    event.recipients
      .map((recipient) => `${recipient.address.trim().toLowerCase()}:${recipient.kind}`)
      .sort(),
  ]);
}

/**
 * Reference in-memory delivery-event store. **Not durable and not for production** — it exists to
 * exercise the `DeliveryEventStorePort` contract (idempotent by event id, order-independent, job-scoped)
 * without a database. Not exported from the package entry point.
 */
export class InMemoryDeliveryEventStore implements DeliveryEventStorePort {
  readonly #byId = new Map<
    string,
    { readonly event: DeliveryEvent; readonly fingerprint: string }
  >();

  async record(event: DeliveryEvent): Promise<DeliveryEventRecordOutcome> {
    const fingerprint = fingerprintOf(event);
    const existing = this.#byId.get(event.eventId);
    if (existing === undefined) {
      this.#byId.set(event.eventId, { event, fingerprint });
      return 'recorded';
    }
    return existing.fingerprint === fingerprint ? 'duplicate' : 'conflict';
  }

  async listForJob(jobId: DeliveryJobId): Promise<readonly DeliveryEvent[]> {
    return dedupeDeliveryEvents(
      [...this.#byId.values()].map((entry) => entry.event).filter((event) => event.jobId === jobId),
    );
  }
}
