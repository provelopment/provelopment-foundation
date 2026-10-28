import type { CommunicationConfiguration } from "@/config/schema";
import type { PageLinkReference, PageLinkResolver } from "@/core/page-document";

/**
 * The ONLY Foundation-side import of Connect, and it is Connect's public entry point — extensionless, the
 * convention Web-1 proved: the pinned tree is TypeScript SOURCE (`modules/connect/src/index.ts`), and
 * appending `.js` names a file that does not exist in the pinned bytes. Naming it `.js` to "look like"
 * emitted output is exactly what Turbopack refused; the fix is the honest specifier, never a rewritten
 * Connect tree.
 */
import { identifier, MAX_IDENTIFIER_LENGTH, projectPublicContact } from "../../../modules/connect/src/index";

/** The authored Site entry this adapter reads; never authored by the adopter beyond its own Site. */
type DeclaredPublicContact = NonNullable<CommunicationConfiguration["publicContact"]>[string];

/**
 * THE PUBLIC EMAIL DESTINATION, ANSWERED BY THE PINNED CONNECT MODULE
 * ===================================================================
 * FOUNDATION-CONNECT-MODULE-INTEGRATION-A9
 *
 * Foundation does not decide whether a public address may be shown, and it does not build a `mailto:`
 * itself. `projectPublicContact` — carried byte-for-byte in `modules/connect/src` — makes that decision
 * from two inputs: the authority Foundation has ALREADY verified, and the Site's own authored
 * configuration. This module's whole job is to hand it truthful inputs and to translate its answer.
 *
 * The three outcomes are not interchangeable, and flattening them to a boolean would be the defect:
 *
 *   available    → render the authored method as a native `mailto:`
 *   absent       → render NO destination; an unconfigured site is not broken, it simply offers nothing
 *   unavailable  → render no destination AND do not treat it as normal (malformed, scope mismatch,
 *                  publication mismatch, unauthorized)
 *
 * Foundation deliberately does not re-validate the address, the label, the method reference or the
 * publication association: those are the Module's rules, and a second copy in Foundation would be free
 * to disagree with the one that actually guards the link. This file only refuses to *invent* identity —
 * it composes the Connect document from values the runtime already proved.
 */

/** The single application-link key a page document uses to ask for the Site's public email address. */
export const PUBLIC_CONTACT_LINK_KEY = "public-contact-email";

/**
 * The verified facts a render already holds. Every field comes from Foundation's own resolution of the
 * request — never from a visitor, never from a hostname string parsed here, never from a module global.
 */
export interface VerifiedPublicContactAuthority {
  /** Collision-free runtime identity of the owning Spoke (`context.runtimeSegment`). */
  readonly deploymentId: string;
  /** The verified EFS Entity that owns the publication. */
  readonly ownerId: string;
  /** The verified EFS Site being rendered. */
  readonly siteId: string;
  /** The verified canonical binding that authorized this publication. */
  readonly authorizationRef: string;
  /** The publishing Spoke's verified identity, when the Installation identifies its Hubs. */
  readonly publisherRef?: string;
}

/**
 * Compose Connect's configuration document from the Site's authored entry and the verified identity.
 *
 * Identity is NOT authored by the adopter — it is supplied here from what the runtime already proved, so
 * an author cannot accidentally (or deliberately) point their Site at another Site's publication. The
 * adopter authors only what is genuinely theirs: which publications may show this address, whether the
 * capability is enabled, and the methods themselves.
 */
function configurationDocument(
  declared: DeclaredPublicContact,
  authority: VerifiedPublicContactAuthority,
): unknown {
  return {
    deploymentId: authority.deploymentId,
    ownerId: authority.ownerId,
    siteId: authority.siteId,
    status: declared.status,
    authorizationRefs: declared.authorizationRefs,
    ...(declared.publisherRefs === undefined ? {} : { publisherRefs: declared.publisherRefs }),
    methods: declared.methods.map((method) => ({
      methodRef: method.methodRef,
      label: method.label,
      kind: "email",
      address: method.address,
      status: method.status,
    })),
  };
}

/**
 * Brand one verified value through the Module's own factory, after bounding it.
 *
 * The Module's helpers are documented as performing NO validation — "never call them with visitor
 * input" — so the bound is checked here, once, before anything is branded. Returning `null` rather than
 * throwing keeps the fail-closed shape: an impossible identity produces no destination, never an error
 * page that would confirm the identity exists.
 */
function bounded<T>(value: string, brand: (input: string) => T): T | null {
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return null;
  return brand(value);
}

/**
 * Answer the page document's `public-contact-email` reference for ONE render.
 *
 * Returns the `mailto:` destination the Module authorized, or `null`. `null` is the only refusal this
 * contract has — absent, disabled, revoked, malformed, unauthorized and unconfigured all collapse into
 * "this page offers no address", because a caller that could tell them apart could start to guess.
 */
export function resolvePublicContactLink(input: {
  readonly authority: VerifiedPublicContactAuthority;
  readonly configuration: CommunicationConfiguration | undefined;
}): string | null {
  // Keyed by EFS Site id so a Site can only ever speak for itself. A missing entry is `absent`, never
  // "fall back to the default Site": that fallback would be a site borrowing another site's authority.
  const declared = input.configuration?.publicContact?.[input.authority.siteId];
  if (declared === undefined) return null;

  const deploymentId = bounded(input.authority.deploymentId, identifier.deployment);
  const ownerId = bounded(input.authority.ownerId, identifier.owner);
  const siteId = bounded(input.authority.siteId, identifier.site);
  const authorizationRef = bounded(input.authority.authorizationRef, identifier.authorization);
  if (deploymentId === null || ownerId === null || siteId === null || authorizationRef === null) {
    return null;
  }
  let publisherRef: ReturnType<typeof identifier.publisher> | undefined;
  if (input.authority.publisherRef !== undefined) {
    const brandedPublisher = bounded(input.authority.publisherRef, identifier.publisher);
    if (brandedPublisher === null) return null;
    publisherRef = brandedPublisher;
  }

  const projection = projectPublicContact({
    authority: {
      deploymentId,
      ownerId,
      siteId,
      authorizationRef,
      ...(publisherRef === undefined ? {} : { publisherRef }),
    },
    configuration: configurationDocument(declared, input.authority),
  });

  if (projection.kind !== "available") return null;

  // Authored order is the owner's order: the first method the Module found available IS the primary
  // destination. A page has one link slot here, so choosing silently would be worse than choosing first.
  const method = projection.methods[0];
  if (method === undefined) return null;
  // The Module already returns a finished `mailto:` href — no query string, no header, no script. Rebuilding
  // it here would be a second spelling of the one rule that guards the destination.
  return method.href;
}

/**
 * Bind the above to the renderer's contract for one request.
 *
 * The resolver closes over THIS request's verified authority. It is created per render and never cached,
 * so two Spokes — or two Hubs' Spokes sharing one hostname — cannot see each other's answer.
 */
export function publicContactLinkResolver(input: {
  readonly authority: VerifiedPublicContactAuthority;
  readonly configuration: CommunicationConfiguration | undefined;
}): PageLinkResolver {
  return (reference: PageLinkReference) =>
    reference.reference === "applicationLink" && reference.key === PUBLIC_CONTACT_LINK_KEY
      ? resolvePublicContactLink(input)
      : null;
}
