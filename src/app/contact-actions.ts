"use server";

import { createContactInquirySender } from "@/adapters/contact-inquiry";
import { handleContactSubmission, type ContactSubmissionState } from "@/application/contact-inquiry-service";
import { efsContextForCurrentRequest, efsRuntimeDeclared } from "@/app/[[...segments]]/efs-request";
import { runtimeContextForCurrentRequest } from "@/config/spoke-request";
import type { ContactInquiryEnv } from "@/core/contact-inquiry";

export type { ContactSubmissionState } from "@/application/contact-inquiry-service";

/**
 * Server Action backing the contact form (Phase B).
 *
 * Thin framework boundary: reads the raw FormData, resolves the configured
 * sender from `features.contact` + runtime environment variables (read lazily
 * here so production secrets are never required at build time), and delegates
 * to the application-layer orchestration.
 *
 * Security model (Next.js 16, documented): actions are POST-only endpoints
 * with an implicit per-build Action ID. Next.js enforces a same-origin check —
 * the request Origin is compared against the request Host (and the
 * `experimental.serverActions.allowedOrigins` set when configured); a
 * mismatch is rejected with HTTP 403. This is Next.js's CSRF mitigation. The
 * honeypot handled in `handleContactSubmission` adds a bot-defense layer
 * beyond the framework's protection.
 */
export async function submitContactInquiry(
  _previousState: ContactSubmissionState,
  formData: FormData,
): Promise<ContactSubmissionState> {
  const env: ContactInquiryEnv = {
    webhookUrl: process.env.CONTACT_WEBHOOK_URL,
    webhookToken: process.env.CONTACT_WEBHOOK_TOKEN,
  };

  const values: Record<string, unknown> = {
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    locale: formData.get("locale"),
    website: formData.get("website"),
  };

  // M17 + EFS — the CONTACT destination belongs to the Spoke that answers this request. An EFS
  // host is resolved by the publication's explicit owner, including a host the older Spoke-host
  // table does not know. The legacy selector is consulted ONLY when this deployment declares no
  // EFS runtime at all; once EFS is declared, an unclaimed host has no destination.
  const efsContext = await efsContextForCurrentRequest();
  const context =
    efsContext ??
    (efsRuntimeDeclared() ? null : await runtimeContextForCurrentRequest());
  if (context === null) {
    throw new Error(
      "FOUNDATION-MULTISITE-M16: no Spoke answers this request's host, so there is no contact " +
        "destination to submit to.",
    );
  }

  return handleContactSubmission({
    values,
    createSender: () => createContactInquirySender(context.siteConfig.contactFeature, env),
    log: (message) => console.error(message),
  });
}