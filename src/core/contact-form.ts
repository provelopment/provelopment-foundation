/**
 * THE OPTIONAL CONNECT-BACKED CONTACT FORM OF ONE SITE
 * ====================================================
 * FOUNDATION-RELEASE-CANDIDATE (A2)
 *
 * A Spoke may publish a website with no contact form, and this module never assumes otherwise. The mode is
 * authored on ONE Site's own record (`communication.contactForms[<siteId>]`), and the three states differ:
 *
 *   off        the Site offers no form and refuses every submission for itself;
 *   simple     Connect's released `SendDirectEnquiry` — exactly one transport attempt, nothing stored;
 *   advanced   Connect's durable engine, whose prerequisites a Foundation Installation does not have.
 *              Selecting it must never fall back to `simple`.
 *
 * WHEN THE RECORD IS ABSENT NOTHING CHANGES: no Foundation reference Site authors one, so the released
 * `features.contact` behaviour is exactly what it was. This contract is additive — it does not replace
 * `features.contact`, does not touch the public `mailto:` projection, and never turns a public address into
 * a private recipient.
 *
 * PRIVATE POLICY IS NOT IN `site.config.json`, DELIBERATELY. `siteConfig` is imported by CLIENT components,
 * so anything authored there can reach a browser bundle. A public `mailto:` address is public by design; a
 * form's private recipients and sender are not. They are supplied by a SERVER-ONLY policy source at
 * submission time (`@/config/contact-form-policy`), never authored in Git and never rendered. The authored
 * record below holds only what a visitor may see the EFFECT of.
 *
 * Framework-free: no React, no Next.js, no Node built-in, no Module import.
 */

/** The three form states a Site may author. `advanced` is expressible and NOT operational. */
export const CONTACT_FORM_MODES = ["off", "simple", "advanced"] as const;
export type ContactFormMode = (typeof CONTACT_FORM_MODES)[number];

/**
 * Which concrete transport may carry an authorized SIMPLE message.
 *
 * `none` is a first-class value: an owner can author the whole record and keep it inactive.
 *
 * `offline` is the ONLY transport Foundation ships, and it is honest about itself — no network I/O, no
 * provider, no delivery claim. A deployment that wants real delivery supplies its own `MailTransportPort`
 * (`modules/connect/README.md`); Foundation ships no provider credentials, and a provider transport that
 * cannot be rate-limited at the Installation boundary is refused rather than enabled.
 */
export const CONTACT_FORM_TRANSPORTS = ["none", "offline"] as const;
export type ContactFormTransport = (typeof CONTACT_FORM_TRANSPORTS)[number];

/** How an authorized policy recipient participates. Never visitor-selectable. */
export const CONTACT_FORM_RECIPIENT_KINDS = ["to", "cc"] as const;
export type ContactFormRecipientKind = (typeof CONTACT_FORM_RECIPIENT_KINDS)[number];

/** How the sender's Reply-To is chosen. `visitor` exposes ONLY the validated visitor address. */
export const CONTACT_FORM_REPLY_TO_MODES = ["visitor", "fixed"] as const;
export type ContactFormReplyToMode = (typeof CONTACT_FORM_REPLY_TO_MODES)[number];

/** The one authored placement. Rendering and submission read this SAME value. */
export type ContactFormPlacement = { readonly siteWide: true } | { readonly page: string };

/**
 * ONE SITE'S AUTHORED RECORD — public-safe by construction.
 *
 * It cannot name a recipient or a sender: an authoring file must never be able to redirect a business's
 * enquiries, and the value must never be inlined into a browser bundle.
 */
export interface AuthoredContactFormConfiguration {
  /** The form's authored identity; the submission must address the SAME form. */
  readonly formRef: string;
  /** The owner's switch. A disabled record presents nothing and refuses submissions. */
  readonly enabled: boolean;
  readonly mode: ContactFormMode;
  readonly transport: ContactFormTransport;
  readonly placement: ContactFormPlacement;
  /**
   * The verified publication/binding ids authorized to expose this form — explicit, no wildcard, so a newly
   * added publication cannot silently offer a form nobody approved for it.
   */
  readonly authorizationRefs: readonly string[];
}

/** The private half, supplied server-side only (never from `site.config.json`). */
export interface ContactFormPolicySource {
  readonly recipients: readonly {
    readonly address: string;
    readonly kind: ContactFormRecipientKind;
  }[];
  readonly sender: {
    readonly fromAddress: string;
    readonly fromDisplayName: string;
    readonly replyTo: ContactFormReplyToMode;
    readonly replyToAddress?: string;
  };
  /** Optional authored floor; absent means Foundation's released one-character minimum. */
  readonly messageMinLength?: number;
}

/**
 * The facts a submission is judged against. Every one comes from VERIFIED runtime authority — the EFS
 * publication, Site, Page and binding the request actually resolved to — never from a form field, a header,
 * a query parameter or a hidden input.
 */
export interface ContactFormFacts {
  readonly deploymentId: string;
  readonly publisherRef: string;
  readonly ownerId: string;
  readonly siteId: string;
  readonly formRef: string;
  readonly authorizationRef: string;
  readonly placement:
    | { readonly kind: "site-wide" }
    | { readonly kind: "page"; readonly pageRef: string };
  readonly locale?: string;
}

/** Foundation's released message floor: adopting Connect must not tighten a working public form. */
export const DEFAULT_CONTACT_FORM_MESSAGE_MIN_LENGTH = 1;

/**
 * THE ONE FAIL-CLOSED PRE-CHECK, APPLIED BEFORE CONNECT.
 *
 * It is not a second policy authority: Connect owns mailbox syntax, recipient conflicts, applicability, the
 * sender principal, the attempt budget and the whole refusal vocabulary, and it re-validates all of them at
 * submission time. This answers only what a consumer can know — does this Site's record authorize THIS
 * verified form, in THIS verified place, over a transport this deployment can actually drive.
 *
 * Problems are operator-facing; a visitor only ever sees the safe category Connect (or this) produces.
 */
export function contactFormAuthorizationProblems(
  record: AuthoredContactFormConfiguration | undefined,
  facts: ContactFormFacts,
): readonly string[] {
  const problems: string[] = [];
  if (record === undefined) return ["no contact-form record"];

  if (record.mode !== "simple") {
    problems.push(`mode "${record.mode}" does not authorize a direct send`);
  }
  if (!record.enabled) problems.push("record is disabled");

  if (record.formRef !== facts.formRef) problems.push("form binding does not match the record");

  const placementMatches =
    "siteWide" in record.placement
      ? facts.placement.kind === "site-wide"
      : record.placement.page ===
        (facts.placement.kind === "page" ? facts.placement.pageRef : undefined);
  if (!placementMatches) problems.push("placement does not match the verified form location");

  if (!record.authorizationRefs.includes(facts.authorizationRef)) {
    problems.push("the verified publication is not authorized for this form");
  }

  if (record.transport === "none") problems.push("no transport is configured for this Site");

  return problems;
}

/**
 * THE REFUSAL CATEGORIES A VISITOR MAY BE TOLD APART BY.
 *
 * Connect's `SafeCategory` is the ONE authority; this subset is restated because `src/core` may not import
 * the Module. A deployment test compares the two against the pinned release, so a widened or renamed
 * category breaks a check instead of drifting.
 */
export const CONTACT_REFUSAL_CATEGORIES = [
  "rejected_invalid",
  "rejected_abuse",
  "unavailable",
  "context_unresolved",
] as const;
export type ContactRefusalCategory = (typeof CONTACT_REFUSAL_CATEGORIES)[number];

/** The visitor-facing state a refusal category maps onto. Total, and it reveals no recipient or reason. */
export type ContactFormRefusalState = "validationError" | "unavailable";

export function contactFormRefusalState(category: ContactRefusalCategory): ContactFormRefusalState {
  return category === "rejected_invalid" ? "validationError" : "unavailable";
}

