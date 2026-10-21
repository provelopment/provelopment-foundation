import type { ContactInquiry, ContactInquiryOrigin } from "@/core/contact-inquiry";

/**
 * Port for sending a validated contact inquiry to the configured integration.
 *
 * Implementations live in `src/adapters/contact-inquiry/*`. The webhook adapter
 * is the only production-capable path; the stub reports an explicit demo/
 * unconfigured outcome and never pretends a real delivery happened.
 */
export type SendInquiryResult =
  | { ok: true }
  | { ok: false; kind: "adapterError" }
  | { ok: false; kind: "unconfiguredDemo" };

export interface ContactInquirySender {
  send(inquiry: ContactInquiry, origin?: ContactInquiryOrigin): Promise<SendInquiryResult>;
}