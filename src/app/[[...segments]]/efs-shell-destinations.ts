import type { EfsView } from "./efs-request";
import { shellAddressesForEfsView } from "./efs-shell-addresses";
import { publicPathBase } from "@/core/efs/publication";
import { pageRoutePathSegments } from "@/core/page-route-path";

/**
 * THE EFS AUTHORED-INTERNAL-DESTINATION RESOLVER
 * ==============================================
 *
 * A shared-shell link authored in presentation configuration — the CTA destination, a footer navigation
 * entry, a Connect gateway — names a **Page of the current Site**. Under `D31` §3 the only trustworthy
 * answer to "where is that Page published?" is the one Foundation already computed for THIS request:
 * `EfsView.site` (which Pages this Site declares), `EfsView.binding` (whose host/prefix/Site selector owns
 * the address) and `EfsView.navigation` (which of those Pages actually have a public, loadable
 * representation for this locale, each carrying its **already-computed** href).
 *
 * This module is therefore a POLICY, not a URL builder. It never composes an address: it proves that the
 * authored destination is a published Page of the current Site and hands back the href the request
 * boundary already produced. If it cannot prove that, it refuses with a classification instead of
 * inventing a plausible path.
 *
 * WHAT IT IS NOT
 * --------------
 *   · not a request parser — it reads no header, parses no incoming URL and matches no host;
 *   · not a second address grammar — the authored value is validated by the ONE route grammar
 *     (`pageRoutePathSegments`) and any address it returns is the navigation's own;
 *   · not `efsPageLinkContext` and not a replacement for it — that existing authority COMPOSES a
 *     Site-relative `route` into an address for a Page being rendered. This answers the different
 *     question "is this configured destination actually published?", and refuses when it is not proved;
 *   · not the live cutover. It is imported by nothing in the render graph during this work order.
 *
 * THE AUTHORED FORM. Presentation configuration stores a site-relative path with a leading `/`
 * (`/`, `/about`, `/legal/privacy`) — the `S1E2` convention `siteHref` documents, enforced by `schema.ts`
 * as "internal path (starting with `/`) or an absolute URL including protocol". So that leading `/` is
 * the documented configured-destination prefix and everything after it is the Page route path, judged
 * only by `pageRoutePathSegments`. Stripping that one prefix is not a new grammar; reinterpreting the
 * remainder is not permitted and never happens here.
 *
 * HOME. A configured `/` selects the Home Page **only** when the current Site actually publishes a Home
 * entry in its verified navigation — that fact comes from the accepted `shellAddressesForEfsView`
 * projection, so Home is decided in exactly one place. The reserved internal source name `home` is NOT an
 * alias for root: `/home` is refused, because reviving internal Home naming as a published destination is
 * precisely what `D43` retired.
 *
 * EXTERNAL DESTINATIONS. A value that does not start with `/` — `https:`, `mailto:`, `tel:`, a social,
 * directions or booking URL — is **not handled here**. It is classified `external` and left untouched:
 * those are existing approved capabilities with their own validation, and turning one into a relative
 * Page address would silently change what the author asked for. Their pass-through belongs to the later
 * integrated cutover.
 *
 * FAIL CLOSED. Contradictory input is refused rather than resolved: two declared Pages claiming one public
 * route, two different addresses for one Page in the navigation, or a navigation href that does not belong
 * to this binding's base or does not end at this Page's route.
 */

/**
 * The trusted facts this resolver reads — all already verified by the EFS request boundary.
 *
 * In production the argument is the `EfsView` for the request being rendered. The narrow type exists so
 * pure unit tests can supply an explicitly **simulated already-validated view**; it is not licence to
 * counterfeit a host claim or a runtime owner resolution.
 */
export type EfsShellDestinationSource = Pick<
  EfsView,
  "binding" | "site" | "facet" | "locale" | "localeKey" | "canonical" | "navigation" | "alternates" | "xDefault"
>;

/** Why an authored internal destination could not be turned into a published Page link. */
export type EfsShellDestinationRefusal =
  /** The first route segment names a Site of this Facet, so it is a cross-Site address, not a Page here. */
  | "site-scoped-authored-route"
  /** The reserved internal source name `home`; Home is addressed as `/`, never by its internal name. */
  | "reserved-home-route"
  /** Not a usable Page route path (`..`, a backslash, an empty segment, a depth/length cap or a bad slug). */
  | "unusable-authored-route"
  /** No Page of the CURRENT Site declares that public route. */
  | "no-declared-page"
  /** The Page exists but the verified navigation has no public, servable entry for it here. */
  | "not-published"
  /** The navigation entry's address does not belong to this binding base or does not end at this Page. */
  | "not-this-binding"
  /** Two declared Pages claim the route, or one Page carries two different addresses. */
  | "conflicting-page-identity"
  /** `/` was authored but this Site publishes no Home entry in the verified navigation. */
  | "no-published-home";

/** The outcome of resolving ONE authored internal destination. Plain, readonly, serializable data. */
export type EfsShellInternalDestination =
  /**
   * A published Page of the current Site. `href` is the address the request boundary already computed,
   * never a value rebuilt here.
   */
  | { readonly kind: "published"; readonly href: string; readonly pageId: string }
  /**
   * Not an internal Page destination. The caller keeps rendering it under its own separate, already
   * validated external contract; this resolver neither rewrites nor drops it.
   */
  | { readonly kind: "external" }
  /** No published Page address could be proved. Render the label without a link, or omit the entry. */
  | { readonly kind: "unavailable"; readonly reason: EfsShellDestinationRefusal };

/** The reserved internal source name for the Home Page. It is never a published destination. */
const RESERVED_HOME_ROUTE = "home";

/** D43: a Page route's identity is case-insensitive; its public spelling is the lowercase form. */
function routeKey(segments: readonly string[]): string {
  return segments.map((segment) => segment.toLowerCase()).join("/");
}

/** The Home destination, proved through the accepted projection so there is ONE Home rule in the codebase. */
function resolveHome(view: EfsShellDestinationSource): EfsShellInternalDestination {
  const homeHref = shellAddressesForEfsView(view).homeHref;
  if (homeHref === null) return { kind: "unavailable", reason: "no-published-home" };
  const entry = view.navigation.find((item) => item.href === homeHref);
  // The projection derives `homeHref` FROM a navigation entry, so this cannot normally happen; if a
  // contradictory input ever made it possible, refuse rather than guess which entry was meant.
  if (entry === undefined) return { kind: "unavailable", reason: "conflicting-page-identity" };
  return { kind: "published", href: homeHref, pageId: entry.pageId };
}

/**
 * Resolve one authored internal destination against ONE verified EFS view.
 *
 * Pure: the input is never mutated, no external state is read, and the same arguments always produce the
 * same answer. The result is plain data carrying only public facts (`href`, `pageId`) or a refusal
 * classification — no manifest, capsule path, source text, property bag, `view.context`, Spoke identity or
 * visitor header.
 */
export function resolveEfsShellInternalDestination(input: {
  readonly view: EfsShellDestinationSource;
  readonly authoredHref: string;
}): EfsShellInternalDestination {
  const { view, authoredHref } = input;

  // Anything that is not the documented site-relative form belongs to somebody else's contract.
  if (!authoredHref.startsWith("/")) return { kind: "external" };

  // The `S1E2` configured-destination prefix: `/` plus the Page route path.
  //
  // D43 folds the route BEFORE the approved grammar runs. A Page route's letter case is not its identity
  // and its canonical public spelling is the lowercase form, while `CONTENT_SLUG_PATTERN` is lowercase by
  // construction — so judging the raw authored case would refuse `/Team/Page` for carrying the very casing
  // the manifest legitimately declares, and would need a second, homegrown normalization to accept it.
  // Folding first keeps the ONE grammar authoritative: `..`, an empty segment, a backslash, a separator
  // run, a depth/length overflow and a non-slug character stay refused after folding, so this cannot make
  // an unusable route usable.
  const routePath = authoredHref.slice(1).toLowerCase();
  if (routePath === "") return resolveHome(view);

  const segments = pageRoutePathSegments(routePath);
  const [firstSegment] = segments;
  if (firstSegment === undefined) return { kind: "unavailable", reason: "unusable-authored-route" };
  const first = firstSegment.toLowerCase();

  // A first segment naming a Site of this Facet is a fully Site-scoped address — including another Site's.
  // This resolver only ever answers for the CURRENT Site, so it refuses rather than risk selecting a
  // sibling Site's Page that happens to share a route name.
  if (view.facet.sites.some((site) => site.id.toLowerCase() === first)) {
    return { kind: "unavailable", reason: "site-scoped-authored-route" };
  }

  // `home` is an internal authoring name; the published Home address is the Site+locale root via `/`.
  if (segments.length === 1 && first === RESERVED_HOME_ROUTE) {
    return { kind: "unavailable", reason: "reserved-home-route" };
  }

  const wanted = routeKey(segments);
  const declared = view.site.pages.filter((page) => routeKey(page.route) === wanted);
  if (declared.length > 1) return { kind: "unavailable", reason: "conflicting-page-identity" };
  const [page] = declared;
  if (page === undefined) return { kind: "unavailable", reason: "no-declared-page" };

  // Publication is decided by the verified navigation — never by this resolver, never by `binding.locales`.
  // An unlisted, missing, private or refused representation simply has no entry to return.
  const entries = view.navigation.filter((item) => item.pageId === page.id);
  if (new Set(entries.map((item) => item.href)).size > 1) {
    return { kind: "unavailable", reason: "conflicting-page-identity" };
  }
  const [entry] = entries;
  if (entry === undefined) return { kind: "unavailable", reason: "not-published" };

  // The address must belong to THIS binding (its prefix, plus the Site selector when the binding is open)
  // and must end at THIS Page's public route. The locale segment is deliberately NOT pinned: a Page served
  // through its declared fallback representation is published at the fallback's own locale key, and the
  // verified navigation entry is already the authority for which one that is.
  const base = publicPathBase(view.binding, view.site.id);
  const basePath = base.length === 0 ? "" : `/${base.join("/")}`;
  if (!entry.href.startsWith(`${basePath}/`) || !entry.href.endsWith(`/${routeKey(page.route)}`)) {
    return { kind: "unavailable", reason: "not-this-binding" };
  }

  return { kind: "published", href: entry.href, pageId: page.id };
}
