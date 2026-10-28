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
  siteId: string,
): AuthoredContactFormConfiguration | undefined {
  const declared = config.sites.some((entry) => entry.code === siteId);
  if (!declared) return undefined;
  return config.communication?.contactForms?.[siteId];
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
