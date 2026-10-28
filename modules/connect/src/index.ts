/**
 * Public entry point of `@provelopment/coms-web`.
 *
 * Only domain contracts, application use cases and port interfaces are exported. Adapters — including
 * the reference in-memory implementations — are intentionally **not** exported: a consumer must
 * supply its own approved adapters, and no store, transport or provider is created here.
 *
 * M2 status: executable foundation only. No live email, no provider, no HTTP route, no durable store.
 */

export * from './domain/abuse-budget.js';
export * from './domain/communication-context.js';
export * from './domain/content.js';
export * from './domain/delivery.js';
export * from './domain/delivery-event.js';
export * from './domain/delivery-plan.js';
export * from './domain/destination-policy.js';
export * from './domain/diagnostics.js';
export * from './domain/direct-send.js';
export * from './domain/error-codes.js';
export * from './domain/escaping.js';
export * from './domain/fingerprint.js';
export * from './domain/identifiers.js';
export * from './domain/lifecycle.js';
export * from './domain/mailbox.js';
export * from './domain/operator-access.js';
export * from './domain/outbound-message.js';
export * from './domain/public-contact.js';
export * from './domain/purpose.js';
export * from './domain/redaction.js';
export * from './domain/result.js';
export * from './domain/retention.js';
export * from './domain/submission.js';

export * from './application/accept-communication.js';
export * from './application/dispatch-delivery.js';
export * from './application/ingest-delivery-event.js';
export * from './application/purge-expired-enquiries.js';
export * from './application/reconcile-enquiry-capacity.js';
export * from './application/reconcile-enquiry-deletions.js';
export * from './application/send-direct-enquiry.js';

export * from './ports/abuse-control-port.js';
export * from './ports/clock-port.js';
export * from './ports/destination-policy-port.js';
export * from './ports/delivery-event-port.js';
export * from './ports/enquiry-lifecycle-port.js';
export * from './ports/enquiry-quota-port.js';
export * from './ports/form-token-port.js';
export * from './ports/id-generator-port.js';
export * from './ports/mail-transport-port.js';
export * from './ports/outbox-port.js';
export * from './ports/submission-repository-port.js';
export * from './ports/submission-state-port.js';
export * from './ports/telemetry-port.js';
export * from './ports/template-renderer-port.js';
