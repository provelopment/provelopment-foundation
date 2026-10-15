/**
 * THE SPOKE / HUB DOMAIN MODEL (FOUNDATION-MULTISITE-S1)
 * =====================================================
 *
 * FOUR containers, and they are NOT each other:
 *
 *   Spoke Hub   coordinates the installation's Spokes        (1..* Spokes)
 *   Spoke       ONE independently addressable domain          (1..* Site Hubs)
 *   Site Hub    an internal grouping of Sites in one Spoke    (1..* Sites; the type is `Hub`)
 *   Site        the EXISTING Foundation `sites[]` context     (unchanged; owned by `@/core/site`)
 *
 * WHY THE FOUR LEVELS ARE NOT COLLAPSED
 * -------------------------------------
 * A Site is Foundation's own long-standing context (`ww`, `de`, `ca`, …). A Site Hub groups Sites and
 * is NOT publicly addressable. A Spoke is the DOMAIN boundary — the context a request hostname
 * resolves to — and owns its Site Hubs. The Spoke Hub coordinates the Spokes. Collapsing any two of
 * these would make a hostname, a website grouping and a country context the same word, which is
 * precisely the ambiguity this vocabulary exists to remove.
 *
 * TWO ORGANISATIONAL LAYERS, TWO NAMES (FOUNDATION-ID-M2)
 * -----------------------------------------------------
 * The OUTER and the INNER organisational layer are separate concepts and now carry separate names:
 *
 *   Spoke Hub   the OUTER coordinator of an installation's Spokes   (`SpokeHub`)
 *   Site Hub    the INNER grouping of Sites inside ONE Spoke        (`Hub`, aliased below)
 *
 * CURRENT implementation: an installation composes exactly ONE Spoke Hub, and each of its Spokes
 * holds one IMPLICIT Site Hub — or the several its authored `sites[].hub` leaves name. APPROVED
 * TARGET (NOT implemented here, and deliberately not pretended here): SEVERAL independently
 * identified Spoke Hubs per installation, with Spoke ids scoped to their owning Spoke Hub, while Site
 * Hubs stay scoped to individual Spokes. Nothing in this module gains a Spoke-Hub id, a second Site
 * Hub layer or a membership rule of its own — the explicit names below are vocabulary, not behaviour.
 *
 * A SPOKE IS THE DOMAIN, SO IT CARRIES THE HOSTNAMES
 * --------------------------------------------------
 * A Spoke owns its canonical hostname and every EXACT hostname it answers for (`hostnameClaims`).
 * That is what makes `hostname → Spoke` a total, pure decision (`./resolve`) and what keeps a Hub
 * free of any public address.
 *
 * THIS SLICE MODELS CONTAINERS, NOT CONTENT
 * -----------------------------------------
 * A `Hub` carries its identity and the EXISTING Foundation Sites it owns (`ResolvedSite`,
 * `@/core/site` — the very type a deployment's `sites[]` already resolves to), and nothing else: a
 * Hub's assets, configuration, locales, pages and routing are LATER slices and are deliberately
 * absent, so this module cannot influence the released Foundation at all. A `Spoke` carries an
 * identity plus its Hubs; a `SpokeHub` carries its Spokes. The `1..*` cardinality of the RESOLVED
 * domain model — including that a Site code is unique across a Spoke — is expressed by the pure
 * coherence rules (`./coherence`), never by filesystem state, because authored material may
 * legitimately be incomplete.
 *
 * Framework-neutral: pure types only. No filesystem, no configuration, no request.
 */
import type { Hostname } from "./hostname";
import type { ResolvedSite } from "@/core/site";

/** A Spoke's stable identifier. */
export type SpokeId = string;

/** A Hub's stable identifier, unique within its Spoke. */
export type HubId = string;

/** WHICH Hub this is — its identity, never a path and never a hostname. */
export interface HubIdentity {
  readonly id: HubId;
}

/**
 * A HUB: the internal container of Sites inside ONE Spoke.
 *
 * It has NO public address. A Hub is reached through a Site — a `/<site>` URL segment names a Site,
 * and the Site's membership identifies its Hub — never through a hostname and never through a Hub
 * path segment.
 *
 * `sites` holds the EXISTING Foundation Site values (`ResolvedSite`, `@/core/site`) this Hub owns:
 * the same type a deployment's `sites[]` already resolves to, so this composition introduces no
 * second Site concept and no Site semantics of its own. A Hub owns `1..*` Sites, and a Site code is
 * unique across the WHOLE Spoke (`./coherence`) — which is what makes `/<site>/…` unambiguous once
 * the hostname has selected the Spoke.
 */
export interface Hub {
  readonly identity: HubIdentity;
  readonly sites: readonly ResolvedSite[];
}

/**
 * EXPLICIT SITE HUB VOCABULARY (FOUNDATION-ID-M2)
 * ----------------------------------------------
 *
 * `Hub` is the INNER organisational layer: the internal grouping of Sites inside ONE Spoke. It is not
 * publicly addressable, and it is NOT the outer Spoke Hub that coordinates an installation's Spokes —
 * the two layers are different concepts and must never be read as each other.
 *
 * These three names are the SAME domain entity as `Hub`, `HubId` and `HubIdentity`, NOT a second type
 * model and NOT a second organisational layer. They are COMPILE-TIME vocabulary only: the existing
 * names stay the sole authority, every existing operation is untouched, and the old names remain
 * supported with no deprecation and no behavioural difference. They exist so that the newer
 * documentation and the configuration seams — which already say `SiteHubAssignment` and
 * `siteHubAssignments` — can name the layer the domain always meant.
 *
 * A Site Hub is NOT Business ownership. Grouping Sites under one Site Hub says nothing about which
 * Business owns them: carrying `(BusinessId, SiteId)` through membership and lookup is LATER work,
 * and nothing here changes what a membership assignment means today.
 */
export type SiteHub = Hub;

/** A Site Hub's stable identifier, unique within its Spoke — the SAME identifier as `HubId`. */
export type SiteHubId = HubId;

/** WHICH Site Hub this is — the SAME identity as `HubIdentity`, never a path and never a hostname. */
export type SiteHubIdentity = HubIdentity;

/**
 * WHICH Spoke this is: its identity, its canonical hostname, and every exact hostname it answers for.
 *
 * `canonicalHostname` is the domain's canonical origin host — the host every canonical URL, sitemap
 * entry and social card is built from — and it MUST appear in `hostnameClaims`; a Spoke whose
 * canonical host it does not claim is reported by `./coherence`.
 *
 * `hostnameClaims` lists every hostname the domain answers for, canonical first by convention: the
 * canonical host plus any exact aliases (`www.example.com` and `example.com` are two claims of ONE
 * domain). Ownership is EXPLICIT and EXACT — claiming `example.com` never claims
 * `foundation.example.com` or any other name beneath it, so those names stay available to other
 * domains.
 */
export interface SpokeIdentity {
  readonly id: SpokeId;
  readonly canonicalHostname: Hostname;
  readonly hostnameClaims: readonly Hostname[];
}

/**
 * A SPOKE: ONE independently addressable domain, owning `1..*` Hubs.
 *
 * Because a Hub never appears in a public URL, the Site domain's own default flag
 * (`ResolvedSite.isDefault`) is a SPOKE-wide fact: exactly ONE Site across all of the Spoke's Hubs is
 * the domain's default (`./coherence`), and each Spoke has its own.
 */
export interface Spoke {
  readonly identity: SpokeIdentity;
  readonly hubs: readonly Hub[];
}

/**
 * THE SPOKE HUB: the outer coordinator of an installation's Spokes.
 *
 * It owns the `hostname → Spoke` decision (`./resolve`), which is why the collection lives here and
 * is not a free-floating registry: the thing that answers "which domain is this request for?" is the
 * thing that holds the domains.
 */
export interface SpokeHub {
  readonly spokes: readonly Spoke[];
}

/**
 * IDENTIFIED SPOKE HUBS (FOUNDATION-ID-M3-P1) — the vocabulary of a MULTI-HUB Installation
 * ===============================================================================
 *
 * The hierarchy this vocabulary names is
 *
 *   Installation → Spoke Hub → Spoke → Site Hub → Site → Locale
 *
 * and the three permanent rules it exists to express are:
 *
 *   · an Installation may eventually contain SEVERAL independently identified Spoke Hubs;
 *   · a Spoke Hub owns its own Spoke membership, so a Spoke ID is unique WITHIN its owning Spoke Hub and
 *     may REPEAT in another — which is why a Spoke can only ever be named by a COMPOSITE reference;
 *   · every hostname claim stays unique across the WHOLE Installation, because a request carries one host
 *     and must select exactly one Spoke.
 *
 * WHAT IS ADDITIVE HERE, AND WHAT IS NOT. These names add an identity to the container that already
 * exists — they do NOT redefine `SpokeHub`, `Spoke`, `Hub`/`SiteHub` or the Site identity. `SpokeHub`
 * keeps its exact contract (`{ readonly spokes }`), so every existing consumer compiles unchanged, and
 * `IdentifiedSpokeHub` is an identified `SpokeHub` — assignable to it, accepted by every existing pure
 * function (`./coherence`, `./resolve`, `./site-ownership`), with no behavioural difference.
 *
 * CURRENT implementation: an Installation composes exactly ONE Spoke Hub, which carries the reserved
 * `IMPLICIT_SPOKE_HUB_ID`. An AUTHORED collection of identified Hubs is recognised and validated by the
 * configuration seam but is deliberately NOT runnable (FOUNDATION-ID-M3-P1 §5): the runtime identity and
 * isolation work that lifts that gate is later, and until it lands the nested authoring form fails closed.
 * These types are the contract that work will be built on, not a switch that turns it on.
 *
 * A Spoke Hub IS NOT Business, Tenant or commercial ownership: it is an organisational coordinator of
 * Spokes. A Site's permanent intrinsic identity remains `(BusinessId, SiteId)`, independent of where it is
 * hosted — `@/core/business`, not this module.
 *
 * Framework-neutral: pure types only. No filesystem, no configuration, no request.
 */

/**
 * A Spoke Hub's stable identifier, unique within its Installation, and never a path, a hostname, a URL
 * segment or something a resource directory may be inferred from.
 */
export type SpokeHubId = string;

/** WHICH Spoke Hub this is — its identity, never a path and never a hostname. */
export interface SpokeHubIdentity {
  readonly id: SpokeHubId;
}

/**
 * A SPOKE HUB WITH AN IDENTITY: the outer coordinator, named.
 *
 * It is exactly a `SpokeHub` plus its identity — the same `{ spokes }` collection the runtime composes
 * today, and the same per-Spoke contract. Nothing else is added: no hostname (a Spoke Hub is never
 * addressed), no root, no Site Hub of its own (Site Hubs stay internal to individual Spokes) and no
 * membership registry.
 */
export interface IdentifiedSpokeHub extends SpokeHub {
  readonly identity: SpokeHubIdentity;
}

/**
 * A COMPOSITE reference to ONE Spoke: its OWNING Spoke Hub, plus the local id inside that Hub.
 *
 * A local `SpokeId` is not an identity on its own — the same id may be declared in two Spoke Hubs — so a
 * Spoke can only be named unambiguously by both halves together (`./spoke-hub-collection`, `spokeByRef`).
 */
export interface IdentifiedSpokeRef {
  readonly spokeHubId: SpokeHubId;
  readonly spokeId: SpokeId;
}

/**
 * An Installation's identified Spoke Hub collection, in AUTHORED order (never sorted, and never derived
 * from a directory listing).
 *
 * It is a plain readonly list for the same reason `SpokeHub.spokes` is: the container carries no state of
 * its own, and the coherence rules (`./spoke-hub-collection`) describe the collection rather than the
 * list. The current runtime composes exactly ONE, implicitly identified Spoke Hub.
 */
export type InstallationSpokeHubCollection = readonly IdentifiedSpokeHub[];
