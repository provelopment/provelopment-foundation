"use server";

import { createContactInquirySender } from "@/adapters/contact-inquiry";
import { handleContactSubmission, type ContactSubmissionState } from "@/application/contact-inquiry-service";
import { efsContactContextForCurrentRequest, efsRuntimeDeclared } from "@/app/[[...segments]]/efs-request";
import { runtimeContextForCurrentRequest } from "@/config/spoke-request";
import {
  contactOwnerLabel,
  contactReceiverKey,
  contactReceiverLegacyGroups,
  contactReceiverLegacyKey,
  type ContactOwnerIdentity,
} from "@/config/contact-receiver";
import { ContactInquiryMisconfigurationError, type ContactInquiryEnv } from "@/core/contact-inquiry";

export type { ContactSubmissionState } from "@/application/contact-inquiry-service";

const URL_PREFIX = "CONTACT_WEBHOOK_URL__";
const TOKEN_PREFIX = "CONTACT_WEBHOOK_TOKEN__";

function configured(prefix: string, key: string): string | undefined {
  return process.env[`${prefix}${key}`];
}

/**
 * The receiver environment for ONE verified owner.
 *
 * `CONTACT_WEBHOOK_URL` / `CONTACT_WEBHOOK_TOKEN` remain the installation-wide defaults. Per-Spoke
 * overrides use the collision-free keys from `@/config/contact-receiver`. The only environment reads
 * are here, at call time, exactly as the architecture boundary requires.
 *
 * The owner is resolved before this function is called; no form value, URL component or client header
 * chooses it.
 */
function contactReceiverEnv(
  owner: ContactOwnerIdentity,
  allOwners: readonly ContactOwnerIdentity[],
): ContactInquiryEnv {
  const owners = allOwners.length > 0 ? allOwners : [owner];
  const key = contactReceiverKey(owner);
  const legacyKey = contactReceiverLegacyKey(owner);
  const url = configured(URL_PREFIX, key);
  const token = configured(TOKEN_PREFIX, key);

  const collision = contactReceiverLegacyGroups(owners).find(
    (group) =>
      configured(URL_PREFIX, group.key) !== undefined ||
      configured(TOKEN_PREFIX, group.key) !== undefined,
  );
  if (collision) {
    throw new ContactInquiryMisconfigurationError(
      `contact receiver key "${collision.key}" is ambiguous for ` +
        `${collision.owners.map(contactOwnerLabel).join(", ")}; use the collision-free keys ` +
        `${collision.owners.map(contactReceiverKey).join(", ")}.`,
    );
  }

  if (key !== legacyKey && configured(URL_PREFIX, legacyKey) !== undefined) {
    throw new ContactInquiryMisconfigurationError(
      `contact receiver key "${legacyKey}" cannot identify this Spoke unambiguously; ` +
        `use "${key}" for ${contactOwnerLabel(owner)}.`,
    );
  }
  if (key !== legacyKey && configured(TOKEN_PREFIX, legacyKey) !== undefined) {
    throw new ContactInquiryMisconfigurationError(
      `contact receiver token key "${legacyKey}" cannot identify this Spoke unambiguously; ` +
        `use "${key}" for ${contactOwnerLabel(owner)}.`,
    );
  }

  return {
    webhookUrl: url ?? process.env.CONTACT_WEBHOOK_URL,
    webhookToken: token ?? process.env.CONTACT_WEBHOOK_TOKEN,
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
  const efsContact = await efsContactContextForCurrentRequest();
  const context =
    efsContact?.context ??
    (efsRuntimeDeclared() ? null : await runtimeContextForCurrentRequest());
  if (context === null) {
    throw new Error(
      "FOUNDATION-MULTISITE-M16: no Spoke answers this request's host, so there is no contact " +
        "destination to submit to.",
    );
  }
  const owners: readonly ContactOwnerIdentity[] =
    efsContact?.owners ??
    [{ id: context.id, ...(context.spokeHubId === undefined ? {} : { spokeHubId: context.spokeHubId }) }];

  return handleContactSubmission({
    values,
    origin: efsContact?.origin,
    createSender: () =>
      createContactInquirySender(
        context.siteConfig.contactFeature,
        contactReceiverEnv(context, owners),
      ),
    log: (message) => console.error(message),
  });
}