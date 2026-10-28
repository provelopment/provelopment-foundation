/**
 * ONE SITE'S EFFECTIVE CONTACT-FORM RECORD, THROUGH THE ONE FAIL-CLOSED LOOKUP
 * ==========================================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * A form belongs to ONE Site. This is the single place a caller asks "does THIS Site author a contact form,
 * and which mode did it author?" — over the same Site population the runtime resolved, with the same
 * fail-closed guard the public-contact source applies: a Site code the deployment does not DECLARE answers
 * `undefined`, so no implicit/default Site can ever stand in as proof of ownership for a record it does not
 * own.
 */
import type { AuthoredContactFormConfiguration, ContactFormMode } from "@/core/contact-form";

import type { SiteConfig } from "./site-config";

export function contactFormRecordForSite(
  config: SiteConfig,
  efsSiteId: string,
): AuthoredContactFormConfiguration | undefined {
  // FOUNDATION-RELEASE-CANDIDATE (A5) — THE IDENTITY IS THE VERIFIED EFS SITE ID.
  //
  // `sites[].code` is a PRESENTATION Site code (the reference Site's is `ww`), not an authorization
  // identity. A5 received the reference Site's EFS id (`main`) from the verified route while this lookup
  // compared it with `ww`, so a correctly authored record was unreachable and the Site kept presenting the
  // legacy state. The guard is gone, and it was deliberately NOT replaced with a permissive one:
  //
  //  - the request is verified BEFORE this call — EFS resolved the publication, binding, Entity, Facet,
  //    Site and Page, and refused anything it does not declare, so an unverified Site id never arrives;
  //  - the Site id is the one EFS proved, never a form field, header or query parameter;
  //  - the key space is the record itself, so an EFS Site that authors no record answers `undefined`
  //    (inactive), never "inherit another Site's";
  //  - `config` is the OWNING Spoke's validation of its own file, so another Spoke's `main` Site cannot
  //    reach this record even though both declare a Site with that id.
  return config.communication?.contactForms?.[efsSiteId];
}

/**
 * The VISITOR-FACING state of one Site's form.
 *
 * `legacy` is the ABSENT case and is not a fourth mode: this Site authors no record, so the released
 * `features.contact` behaviour is exactly what it was.
 */
export type ContactFormPresentation = "legacy" | ContactFormMode;

/**
 * The mode a record actually OFFERS a visitor.
 *
 * An inactive record offers NOTHING. One switch governs the ONE decision both callers need — what this Site
 * presents — so rendering and submission cannot disagree, and a visitor is never invited to compose a
 * message that would be refused every time.
 */
export function contactFormOfferedMode(
  record: AuthoredContactFormConfiguration,
): ContactFormMode {
  return record.enabled ? record.mode : "off";
}

export function contactFormPresentationForSite(
  config: SiteConfig,
  siteId: string,
): ContactFormPresentation {
  const record = contactFormRecordForSite(config, siteId);
  return record === undefined ? "legacy" : contactFormOfferedMode(record);
}

/**
 * DOES THIS RECORD PRESENT ITS FORM ON *THAT* PAGE?
 *
 * A `page` placement is the owner's statement of WHERE the form belongs, and the same statement authorizes
 * a submission from that page (`contactFormAuthorizationProblems` compares it with the VERIFIED page
 * reference). Rendering reads it too, so a record placed on one Page can never offer its form on another
 * and then refuse every submission from there.
 *
 * `siteWide` is an explicit owner statement and presents on every page of that Site; an absent record never
 * reaches this function.
 */
export function contactFormPresentsOnPage(
  record: AuthoredContactFormConfiguration,
  pageId: string,
): boolean {
  if (contactFormOfferedMode(record) !== "simple") return false;
  return "siteWide" in record.placement ? true : record.placement.page === pageId;
}
