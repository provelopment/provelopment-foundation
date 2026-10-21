/**
 * Contact-inquiry domain model (Phase B, Tier 1).
 *
 * Framework-free and adapter-agnostic. Defines:
 *  - the shared Zod validation schema (server-authoritative; the client mirrors
 *    it for instant feedback),
 *  - the provider/environment configuration types consumed by the application
 *    layer and the adapters,
 *  - the explicit misconfiguration error used to fail loudly when a webhook
 *    provider has no endpoint — never silently downgrade to demo/stub.
 */
import { z } from "zod";

export const CONTACT_NAME_MAX = 120;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_SUBJECT_MAX = 200;
export const CONTACT_MESSAGE_MAX = 5000;

/** Honeypot field name. Real visitors never see or fill it. */
export const HONEYPOT_FIELD = "website";

export const contactInquirySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "required")
    .max(CONTACT_NAME_MAX, "too_long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(CONTACT_EMAIL_MAX, "too_long")
    .pipe(z.email("invalid")),
  subject: z.string().trim().max(CONTACT_SUBJECT_MAX, "too_long").optional(),
  message: z
    .string()
    .trim()
    .min(1, "required")
    .max(CONTACT_MESSAGE_MAX, "too_long"),
  locale: z.string().min(1).max(32),
});

export type ContactInquiry = z.infer<typeof contactInquirySchema>;

/**
 * Server-derived provenance for an inquiry submitted to an EFS publication.
 *
 * These values come from the resolved binding/publication, never from a form field. They contain no
 * filesystem path, credential or visitor telemetry, and are additive to the webhook payload so existing
 * receivers remain compatible.
 */
export interface ContactInquiryOrigin {
  readonly publicationId: string;
  readonly bindingId: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly siteId?: string;
  readonly locale?: string;
  readonly host: string;
  readonly path: string;
}

export type ContactField = "name" | "email" | "subject" | "message";

export type ContactProvider = "webhook" | "stub";

/** `features.contact` in `site.config.json` (validated by the config schema). */
export interface ContactFeatureConfig {
  readonly provider: ContactProvider;
  readonly fields?: { readonly subject?: boolean };
}

/** Auth-bearing/operational values. Environment-backed, never in config JSON. */
export interface ContactInquiryEnv {
  readonly webhookUrl?: string;
  readonly webhookToken?: string;
}

/**
 * Thrown by the sender factory when `provider: "webhook"` cannot be honoured
 * (missing/unsafe endpoint). The application layer catches this to surface a
 * distinct "configuration error" state — never a silent demo/stub fallback.
 */
export class ContactInquiryMisconfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactInquiryMisconfigurationError";
  }
}