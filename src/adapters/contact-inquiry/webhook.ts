import { randomUUID } from "node:crypto";

import type { ContactInquirySender, SendInquiryResult } from "@/application/contact-inquiry-sender";
import type { ContactInquiry, ContactInquiryOrigin } from "@/core/contact-inquiry";

export const WEBHOOK_TIMEOUT_MS = 10_000;

export interface WebhookContactInquirySenderOptions {
  readonly url: string;
  readonly token?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Payload sent to the adopter-controlled webhook endpoint.
 *
 * Deliberately minimal: only the inquiry data required by the contract, a
 * correlation/idempotency key (`id`), and a submission timestamp. No visitor
 * telemetry (IP, user-agent, cookies, referrer) is included unless a concrete
 * requirement later demands it. Foundation does not persist anything or
 * process downstream responses.
 */
export interface WebhookInquiryPayload {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly subject?: string;
  readonly message: string;
  readonly locale: string;
  readonly submittedAt: string;
  /** Additive, server-derived EFS provenance; omitted for a legacy non-EFS submission. */
  readonly origin?: ContactInquiryOrigin;
}

export function buildWebhookPayload(
  inquiry: ContactInquiry,
  origin?: ContactInquiryOrigin,
): WebhookInquiryPayload {
  return {
    id: randomUUID(),
    name: inquiry.name,
    email: inquiry.email,
    ...(inquiry.subject ? { subject: inquiry.subject } : {}),
    message: inquiry.message,
    locale: inquiry.locale,
    submittedAt: new Date().toISOString(),
    ...(origin ? { origin } : {}),
  };
}

/**
 * Production-capable sender: POSTs the inquiry JSON to the adopter-controlled
 * webhook receiver. The receiver is an external trust boundary owned by the
 * adopter. A non-2xx response or transport/timeout failure is reported as an
 * adapter error (never thrown to the visitor); nothing is logged here.
 */
export function createWebhookContactInquirySender(
  options: WebhookContactInquirySenderOptions,
): ContactInquirySender {
  const timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async send(inquiry, origin): Promise<SendInquiryResult> {
      const payload = buildWebhookPayload(inquiry, origin);
      try {
        const response = await fetchImpl(options.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });

        if (!response.ok) return { ok: false, kind: "adapterError" };

        // Arriving here only means the configured receiver accepted the
        // payload on the wire — not that a human read or processed it.
        return { ok: true };
      } catch {
        return { ok: false, kind: "adapterError" };
      }
    },
  };
}