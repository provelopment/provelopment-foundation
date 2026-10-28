/**
 * THE SERVER-ONLY PRIVATE POLICY OF ONE SITE'S CONTACT FORM - THE GENERIC MECHANISM
 * =================================================================================
 * FOUNDATION-RELEASE-CANDIDATE (A5)
 *
 * A form's private recipients and sender are the one thing about a public contact form that must never be
 * authorable by a visitor, reachable from a browser bundle, or inferable from the public `mailto:`
 * projection. They therefore never live in `site.config.json` (which client components import) and never
 * live here: this module holds the MECHANISM only.
 *
 * THE OWNER OF THE DATA is whichever deployment Spoke the verified request resolved to. Its own authored root
 * (`SpokeRuntimeContext.resources.spokeRoot`, already resolved by the installation Spoke-descriptor authority)
 * supplies exactly one supported file:
 *
 *   <spokeRoot>/config/contact-form-policy.json
 *
 * The path is FIXED. No request value, form field, header, query parameter or Site name can choose it, so
 * there is nothing to traverse and no second path-management system: `spokeRoot` is the platform existing
 * resource authority and this module appends one constant relative path to it.
 *
 * WHY THIS IS SERVER-ONLY: the file is read with `node:fs` at submission time. `node:fs` cannot be bundled for
 * a browser, so this module cannot be imported by a client component - the compiler refuses it rather than a
 * convention forbidding it. Nothing here is exported into a page, a prop or an RSC payload; the Server Action
 * is the only caller and it hands the loaded policy straight to the sender.
 *
 * FAIL-CLOSED, ALWAYS: a missing file, unreadable file, malformed JSON, invalid shape or a Site the file does
 * not name all answer `undefined`. `undefined` means no policy, therefore no sender, therefore no send -
 * never "fall back to the first Spoke", "fall back to the default Site" or "borrow another Site policy".
 *
 * CROSS-SPOKE AND CROSS-HUB ISOLATION are properties of the LOCATION, not of a lookup guard: each Spoke policy
 * file belongs to that Spoke root, and EFS Site ids are only unique WITHIN a Spoke (both Foundation reference
 * Spokes declare a Site `main`). A Site id alone is therefore never enough to reach a policy - the caller must
 * also supply the verified Spoke own root.
 *
 * THE REFERENCE DEMONSTRATION keeps its (fictional, RFC 2606 `.example`) addresses in
 * `deployment/spokes/foundation/config/contact-form-policy.json`, which belongs to that deployment and is
 * excluded from a platform release. A clean-room Installation established from a release has no such file, so
 * it inherits none of this: its answer is `undefined` until ITS owner authors its own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import type { ContactFormPolicySource } from "@/core/contact-form";

/** The ONE supported location, relative to the owning Spoke authored root. */
const POLICY_DIRECTORY = "config";
const POLICY_FILE = "contact-form-policy.json";

const policyFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Keyed by the VERIFIED EFS Site id of THIS Spoke - never a presentation Site code. */
  sites: z.record(
    z.string().min(1),
    z.strictObject({
      recipients: z
        .array(z.strictObject({ address: z.string().min(3), kind: z.enum(["to", "cc"]) }))
        .min(1)
        .max(10),
      sender: z.strictObject({
        fromAddress: z.string().min(3),
        fromDisplayName: z.string().min(1).max(120),
        replyTo: z.enum(["visitor", "fixed"]),
        replyToAddress: z.string().min(3).optional(),
      }),
      messageMinLength: z.number().int().min(1).max(2000).optional(),
    }),
  ),
});

/** The policy file of ONE Spoke. Exposed so an operator-facing message can name the expected file. */
export function contactFormPolicyPathFor(spokeRoot: string): string {
  return join(spokeRoot, POLICY_DIRECTORY, POLICY_FILE);
}

/**
 * The private policy of ONE Site, read from the OWNING Spoke own file, or `undefined`.
 *
 * `undefined` is the fail-closed answer every caller must handle: no sender is composed, no Connect use case is
 * built, and the visitor sees the localized "unavailable" state.
 */
export function contactFormPolicyForSite(
  spokeRoot: string,
  efsSiteId: string,
): ContactFormPolicySource | undefined {
  let text: string;
  try {
    text = readFileSync(contactFormPolicyPathFor(spokeRoot), "utf8");
  } catch {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }

  const result = policyFileSchema.safeParse(parsed);
  if (!result.success) return undefined;

  const entry = result.data.sites[efsSiteId];
  if (entry === undefined) return undefined;

  return {
    recipients: entry.recipients.map((recipient) => ({
      address: recipient.address,
      kind: recipient.kind,
    })),
    sender: {
      fromAddress: entry.sender.fromAddress,
      fromDisplayName: entry.sender.fromDisplayName,
      replyTo: entry.sender.replyTo,
      ...(entry.sender.replyToAddress === undefined
        ? {}
        : { replyToAddress: entry.sender.replyToAddress }),
    },
    ...(entry.messageMinLength === undefined ? {} : { messageMinLength: entry.messageMinLength }),
  };
}

/** Whether a private policy is authorized at all - the one fact a caller needs before composing a sender. */
export function contactFormPolicyAuthorized(spokeRoot: string, efsSiteId: string): boolean {
  return contactFormPolicyForSite(spokeRoot, efsSiteId) !== undefined;
}
