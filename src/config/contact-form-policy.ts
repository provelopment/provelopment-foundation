/**
 * THE SERVER-ONLY PRIVATE POLICY AUTHORITY FOR ONE SITE'S CONTACT FORM
 * ===================================================================
 * FOUNDATION-RELEASE-CANDIDATE (A3)
 *
 * A form's private recipients and sender are the one thing about a public contact form that must never be
 * authorable by a visitor, reachable from a browser bundle, or inferable from the public `mailto:` projection.
 * They therefore live HERE — in server-only module scope, read only at submission time — and never in
 * `site.config.json`, which client components import.
 *
 * WHY THE KEY IS `(spokeId, siteId)` AND NOT `siteId`: EFS Site ids are only unique WITHIN a Spoke. Both
 * Foundation reference Spokes declare a Site with id `main`, so a Site-only key would let one Spoke's private
 * policy answer for the other's Site. The composite key makes a cross-Spoke fallback impossible by
 * construction, and there is no wildcard and no default entry: a pair that is not listed answers `undefined`
 * and the submission fails closed.
 *
 * WHAT IS AUTHORIZED TODAY: exactly ONE entry — the `foundation` Spoke's `main` Site, whose only transport is
 * the OFFLINE demonstration transport. Its addresses are inert `.example` names reserved by RFC 2606, which no
 * mail system can deliver to. There is no real recipient, no provider credential and no environment lookup in
 * this module, so no configuration mistake here can start a real outbound path.
 *
 * THE ADOPTER EXTENSION POINT: a deployment that wants real delivery supplies its own private policy source
 * (same shape) and its own `MailTransportPort` in ITS application, not in a released Foundation file. Until it
 * does, every other Site keeps answering `undefined`, which is inactive — never "inherit someone else's".
 */
import type { ContactFormPolicySource } from "@/core/contact-form";

/** The composite key that identifies ONE Site inside ONE Spoke. */
export function contactFormPolicyKey(spokeId: string, siteId: string): string {
  return `${spokeId}/${siteId}`;
}

/**
 * The demonstration policy. The recipient and sender are FICTIONAL and undeliverable by design.
 *
 * `example.com` is reserved for documentation (RFC 2606), so even if an adopter wired a real transport to this
 * entry by mistake, no message could reach a person.
 */
const DEMONSTRATION_POLICY: ContactFormPolicySource = {
  recipients: [{ address: "contact-form-demonstration@example.com", kind: "to" }],
  sender: {
    fromAddress: "website-demonstration@example.com",
    fromDisplayName: "Foundation contact-form demonstration",
    replyTo: "visitor",
  },
};

/**
 * Every Site this Installation authorizes for a private contact-form policy. ONE entry, deliberately.
 *
 * Adding a key here is the act of authorizing that exact Site; there is no fallback, no prefix match and no
 * "default Site" entry.
 */
const POLICIES: Readonly<Record<string, ContactFormPolicySource>> = {
  [contactFormPolicyKey("foundation", "main")]: DEMONSTRATION_POLICY,
};

/**
 * The private policy of ONE Site, or `undefined` when this Installation does not authorize one.
 *
 * `undefined` is the fail-closed answer callers must handle: no sender is composed, no Connect use case is
 * built, and the visitor sees the localized "unavailable" state.
 */
export function contactFormPolicyForSite(
  spokeId: string,
  siteId: string,
): ContactFormPolicySource | undefined {
  return POLICIES[contactFormPolicyKey(spokeId, siteId)];
}

/** Whether a private policy is authorized at all — the one fact a caller needs before composing a sender. */
export function contactFormPolicyAuthorized(spokeId: string, siteId: string): boolean {
  return contactFormPolicyForSite(spokeId, siteId) !== undefined;
}
