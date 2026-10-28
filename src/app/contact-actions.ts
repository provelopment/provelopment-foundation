"use server";

import { createContactInquirySender } from "@/adapters/contact-inquiry";
import { createContactDirectSender } from "@/adapters/connect/contact-direct-send";
import { handleContactSubmission, type ContactSubmissionState } from "@/application/contact-inquiry-service";
import {
  handleContactFormSubmission,
  type ContactFormSubmissionState,
} from "@/application/contact-form-submission";
import { efsContactContextForCurrentRequest, efsRuntimeDeclared } from "@/app/[[...segments]]/efs-request";
import {
  contactFormAuthorizationProblems,
  type ContactFormFacts,
} from "@/core/contact-form";
import { contactFormOfferedMode, contactFormRecordForSite } from "@/config/contact-form-record";
import { contactFormPolicyForSite } from "@/config/contact-form-policy";
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
/**
 * Server Action backing the authored SIMPLE contact form (A5).
 *
 * Thin framework boundary over ONE verified authority. The request has already been proved by EFS before any of
 * this runs: the publication, the canonical binding (host + longest prefix), the Entity, Facet, Site and the
 * Page are the ones this Installation DECLARES for this exact path, and the Page section and form are read from
 * that Page authored source. Nothing here is chosen by a form field, a header, a query parameter or a Site name a
 * client could invent.
 *
 * THE AGREEMENT IT REQUIRES, in order, and each one fails closed on its own:
 *
 *   1. the verified route hosts a declared Page that authors a `contactForm` section;
 *   2. the Site that Page belongs to authors an effective `communication.contactForms[<EFS Site id>]` record;
 *   3. the record is ENABLED and selects a mode Foundation can present (SIMPLE);
 *   4. the Page section and the record name the SAME form;
 *   5. the verified publication is one the record explicitly authorizes;
 *   6. the record places the form on THIS Page;
 *   7. the OWNING Spoke authors a server-only private policy for THIS Site.
 *
 * Every check that Connect also owns is left to Connect: this passes the record authored `authorizationRefs`
 * (never a list manufactured from the current request) and the request independently verified publication
 * reference as separate facts, and the pinned `SendDirectEnquiry` use case re-validates both. A refusal here is
 * NEVER answered by the legacy webhook sender: an authored Connect form that is disabled, malformed or
 * unauthorized has no contact path at all, which is the only truthful outcome.
 */
export async function submitContactForm(
  _previousState: unknown,
  formData: FormData,
): Promise<ContactFormSubmissionState> {
  const verified = await efsContactContextForCurrentRequest();
  if (verified === null) {
    throw new Error(
      "FOUNDATION-CONTACT-FORM-A5: no verified EFS route answers this submission, so there is no form " +
        "authority to submit to.",
    );
  }

  const { context, origin } = verified;
  const siteId = origin.siteId;
  const pageId = verified.pageId;
  const sectionFormRef = verified.formRef;
  if (siteId === undefined || pageId === undefined || sectionFormRef === undefined) {
    return { status: "unavailable" };
  }

  const record = contactFormRecordForSite(context.siteConfig, siteId);
  if (record === undefined) return { status: "unavailable" };
  if (!record.enabled) return { status: "formDisabled" };
  if (record.formRef !== sectionFormRef) return { status: "unavailable" };

  const facts: ContactFormFacts = {
    deploymentId: context.runtimeSegment,
    publisherRef: context.runtimeSegment,
    ownerId: origin.entityId,
    siteId,
    formRef: record.formRef,
    authorizationRef: origin.bindingId,
    // THE AUTHORED PLACEMENT, REPORTED TRUTHFULLY (A7).
    //
    // A `siteWide` record authorizes this Site's Pages; a `page` record authorizes exactly one Page. A5 always
    // told Connect `page`, so a site-wide record was presented by the renderer and then refused by
    // `contactFormAuthorizationProblems` on every submission - the one place rendering and submission disagreed.
    // This reads the record's OWN authored placement, so a page-scoped record can never be widened into
    // site-wide authority here, and a site-wide record still needs a real Page section naming the same form
    // (that requirement lives in the verified route and the renderer, never in an injected default).
    placement: "siteWide" in record.placement ? { kind: "site-wide" } : { kind: "page", pageRef: pageId },
    ...(origin.locale === undefined ? {} : { locale: origin.locale }),
  };

  const problems = contactFormAuthorizationProblems(record, facts);
  const policy = contactFormPolicyForSite(context.resources.spokeRoot, siteId);
  if (policy === undefined) return { status: "unavailable" };

  const log = (message: string) => console.error(message);

  return handleContactFormSubmission({
    mode: contactFormOfferedMode(record),
    values: {
      name: formData.get("name"),
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
      // THE CONSENT CONTRACT KEY (A6). `contactFormContent` reads `transactionalConsentAck`, and Connect
      // validates that same field. The DOM control is named `acknowledgement` because that is what a visitor
      // sees; the mapping between the two belongs HERE, once, at the boundary. A5 passed the DOM name straight
      // through, so the orchestrator never saw consent and refused every correctly-acknowledged submission -
      // found by the A6 browser proof, not by the type checker.
      transactionalConsentAck: formData.get("acknowledgement"),
      locale: formData.get("locale"),
      website: formData.get("website"),
    },
    authorizationProblems: problems,
    createSender: () => createContactDirectSender({ record, facts, policy, log }),
    log,
  });
}
