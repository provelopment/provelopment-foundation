import { contentSegments } from "@/core/efs/publication";

import type { EfsView } from "./efs-request";

/**
 * THE EFS SHELL ADDRESS PROJECTION — public addresses for the shared shell, and nothing else
 * ============================================================================================
 *
 * `D31` §3 makes `src/core/efs/publication.ts` the ONE public-address authority: a binding owns a host, an
 * optional prefix, its Site set and its locale set, and every public URL is `contentSegments` of a route the
 * declaration actually publishes. `EfsView` (built at the EFS request boundary in `./efs-request`) is the
 * already-verified answer to "which publication, Site, Page and representation is this request?".
 *
 * This module is a PURE SHAPE ADAPTER over that verified view. It computes nothing `EfsView` has not already
 * decided and it selects nothing: it does not read headers, match a host, parse a URL, choose a Site, locale
 * or Page, resolve a Spoke, touch the filesystem or consult configuration. It exists so the future shared-shell
 * cutover can consume a small, serializable, client-safe value instead of the server-only view.
 *
 * WHAT THIS IS NOT. It is not the cutover, and it is deliberately not imported by `layout.tsx`,
 * `server-composition.tsx`, any client component or the error/404 surfaces. It is also NOT a replacement for
 * destination-specific decisions that need their own validated authoring: there is no `siteSwitchOptions`, no
 * CTA destination picker, no footer/legal presence system, no speculative locale completion and no
 * cross-publication route selection here. Those belong to the live-cutover assignment, where each destination
 * can be proved against the declaration that owns it.
 *
 * EVERY FIELD IS A PUBLIC FACT:
 *
 *   - `canonical` is `view.canonical` verbatim — never `siteConfig.url`, an incoming `Host`, a Spoke id or a
 *     guessed origin. The view already built it from the CANONICAL binding (`view.binding` is
 *     `matched.canonicalBinding`), so an alias request still advertises the canonical address.
 *   - `navigation` preserves the view's published, ordered entries — each Page's real `pageId`, its published
 *     `label`, its already-computed public `href` and its `current` marker. Addresses are NOT rebuilt here and
 *     no Page absent from `view.navigation` is admitted.
 *   - `homeHref` is the published Home entry's own href when, and only when, the navigation actually contains
 *     it. Otherwise it is `null`: no synthetic locale root, no default Site, no unverified prefix, and never
 *     another Entity's Home.
 *   - `languageAlternates` are exactly `view.alternates` — the published representations of THIS Page — so a
 *     locale merely declared in `binding.locales` can never appear as a language option.
 *   - `xDefault` is passed through only when the view supplied it (i.e. only while that representation is
 *     public). No default is generated.
 *
 * Nothing server-side crosses this boundary: no publication, manifest, capsule path, source text, property bag,
 * `context`/`siteConfig`, Map, function or React element. The result is plain data and survives serialization
 * to a client component unchanged.
 */

/**
 * The subset of a validated `EfsView` this projection reads.
 *
 * In production the argument is ALWAYS the `EfsView` returned by the EFS request boundary, which satisfies this
 * subset structurally. The narrower type exists so pure unit tests can build a minimal, explicitly
 * SIMULATED-ALREADY-VALIDATED view without fabricating a runtime owner resolution or a host claim.
 */
export type EfsShellAddressSource = Pick<
  EfsView,
  | "binding"
  | "site"
  | "locale"
  | "localeKey"
  | "canonical"
  | "navigation"
  | "alternates"
  | "xDefault"
>;

/** One published navigation destination, as the shell may advertise it. */
export interface EfsShellAddressNavigationItem {
  readonly pageId: string;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

/** One published language representation of the current Page (`hreflang` + its canonical href). */
export interface EfsShellAddressLanguageAlternate {
  readonly hreflang: string;
  readonly href: string;
}

/** The public shell addresses for ONE verified EFS request. Plain, readonly, serializable data. */
export interface EfsShellAddressProjection {
  /** The canonical absolute URL of the current Page (`D31` §3). */
  readonly canonical: string;
  /** The published Page destinations in their authored order, with duplicate destinations preserved. */
  readonly navigation: readonly EfsShellAddressNavigationItem[];
  /** The published Home Page's public href, or `null` when this Site publishes no Home entry. */
  readonly homeHref: string | null;
  /** The published representations of THIS Page only — never every declared locale. */
  readonly languageAlternates: readonly EfsShellAddressLanguageAlternate[];
  /** The view's truthful `x-default`, present only while that representation is public. */
  readonly xDefault?: string;
  /** The current locale as the STANDARDS tag (`de-DE`) for `lang`/`hreflang`. */
  readonly locale: string;
  /** The same locale as its lowercase public PATH key (`de-de`), which the URL uses. */
  readonly localeKey: string;
}

/**
 * The public href of a Site's Home Page inside a binding, or `null` when the navigation does not publish one.
 *
 * A Home Page is the Page whose public route is EMPTY — the same rule the request boundary applies when it sets
 * `view.home` (`publicRoute(page).length === 0`). So the Home address is the binding's Site+locale root, built by
 * the existing `contentSegments` authority rather than by string concatenation, and it is returned only if one of
 * the published destinations actually carries that address. A missing, unlisted or non-public Home therefore
 * yields `null` instead of a synthesised root or a default Site.
 */
function publishedHomeHref(view: EfsShellAddressSource): string | null {
  const homeAddress = `/${contentSegments(view.binding, {
    siteId: view.site.id,
    locale: view.locale,
    localeKey: view.localeKey,
    // An empty Page route IS the authored Home Page.
    pageRoute: [],
  }).join("/")}`;
  // Page routes are unique within a Site, so an entry carrying the Site's root address is the Home entry.
  return view.navigation.some((item) => item.href === homeAddress) ? homeAddress : null;
}

/**
 * Project a validated EFS view into the shared shell's public addresses. Pure: no input is mutated, no external
 * state is read, and the same view always yields the same value.
 */
export function shellAddressesForEfsView(
  view: EfsShellAddressSource,
): EfsShellAddressProjection {
  return {
    canonical: view.canonical,
    // A fresh, readonly copy per call: the boundary hands out data, never the view's own objects.
    navigation: view.navigation.map(
      (item): EfsShellAddressNavigationItem => ({
        pageId: item.pageId,
        label: item.label,
        href: item.href,
        current: item.current,
      }),
    ),
    homeHref: publishedHomeHref(view),
    languageAlternates: view.alternates.map(
      (alternate): EfsShellAddressLanguageAlternate => ({
        hreflang: alternate.hreflang,
        href: alternate.href,
      }),
    ),
    ...(view.xDefault === undefined ? {} : { xDefault: view.xDefault }),
    locale: view.locale,
    localeKey: view.localeKey,
  };
}
