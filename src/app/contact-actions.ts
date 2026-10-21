"use server";

import { createContactInquirySender } from "@/adapters/contact-inquiry";
import { handleContactSubmission, type ContactSubmissionState } from "@/application/contact-inquiry-service";
import { efsContextForCurrentRequest, efsRuntimeDeclared } from "@/app/[[...segments]]/efs-request";
import { runtimeContextForCurrentRequest } from "@/config/spoke-request";
import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import type { ContactInquiryEnv } from "@/core/contact-inquiry";

export type { ContactSubmissionState } from "@/application/contact-inquiry-service";

/**
 * The receiver environment for ONE verified owner.
 *
 * `CONTACT_WEBHOOK_URL` / `CONTACT_WEBHOOK_TOKEN` remain the installation-wide defaults. An
 * installation that hosts several Spokes with distinct receivers may set the additive
 * `CONTACT_WEBHOOK_URL__<SPOKE_KEY>` / `CONTACT_WEBHOOK_TOKEN__<SPOKE_KEY>` override, where
 * `<SPOKE_KEY>` is the composite owner identity upper-cased with every non-alphanumeric run
 * replaced by `_` (for example `hub-one/acme-spoke` → `HUB_ONE_ACME_SPOKE`).
 *
 * The owner is resolved before this function is called; no form value or client header chooses it.
 */
function contactEnvForOwner(owner: SpokeRuntimeContext): ContactInquiryEnv {
  const key = (owner.spokeHubId ? `${owner.spokeHubId}__${owner.id}` : owner.id)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
  return {
    webhookUrl:
      process.env[`CONTACT_WEBHOOK_URL__${key}`] ?? process.env.CONTACT_WEBHOOK_URL,
    webhookToken:
      process.env[`CONTACT_WEBHOOK_TOKEN__${key}`] ?? process.env.CONTACT_WEBHOOK_TOKEN,
  };
}

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
  const values: Record<string, unknown> = {
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    locale: formData.get("locale"),
    website: formData.get("website"),
  };

  // M17 + EFS — the CONTACT destination belongs to the Spoke that owns the exact EFS binding
  // (host + longest prefix) that answered this request. The path is stamped by the edge proxy,
  // never selected by a form field or client header. The legacy selector is consulted ONLY when
  // this deployment declares no EFS runtime at all; once EFS is declared, an unclaimed host or
  // prefix has no destination.
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
  const env = contactEnvForOwner(context);

  return handleContactSubmission({
    values,
    createSender: () => createContactInquirySender(context.siteConfig.contactFeature, env),
    log: (message) => console.error(message),
  });
}