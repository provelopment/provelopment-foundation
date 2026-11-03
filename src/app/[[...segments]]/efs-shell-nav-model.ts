import {
  resolveEfsShellInternalDestination,
  type EfsShellDestinationSource,
} from "./efs-shell-destinations";
import type { EfsResolvedNavItem } from "@/components/site/context-nav-links";
import { navItemKey } from "@/components/site/nav-links";
import type { NavigationItem } from "@/config/site-config";
import { AUTHOR_ALLOWED_SCHEMES, classifyAuthorUrl } from "@/core/safe-url";

/**
 * THE EFS PRIMARY-NAVIGATION PRESENTATION MODEL
 * =============================================
 *
 * The one connective piece between the three accepted Stage B seams:
 *
 *   1. `efs-shell-addresses.ts` — the verified published navigation projection;
 *   2. `efs-shell-destinations.ts` — `resolveEfsShellInternalDestination`, which proves an authored
 *      Site-relative path names a published Page of the CURRENT Site and hands back the address the
 *      request boundary already computed;
 *   3. `context-nav-links.tsx` — its opt-in EFS rendering mode, which renders supplied destinations
 *      verbatim through the shared `NavItem` primitive.
 *
 * What was missing is this list builder. It takes the authored primary navigation a Site already
 * declares — its labels, icons, order, grouping and disabled flags — and replaces **only** the two
 * decisions that must come from the EFS publication: the ADDRESS and the CURRENT-PAGE state.
 * Everything presentational is preserved from the authored source, because the author was asked for it
 * and this module has no mandate to second-guess it.
 *
 * WHY IT EXISTS AT ALL. The legacy producer `getSiteNavLinks` returns the configured `href` untouched
 * (`/about`) and lets a CLIENT resolver turn it into an address from the pathname. Under EFS that is
 * exactly the second resolution the render seam exists to remove: the server already knows the verified
 * address for this binding, Site and locale, and a client path parse cannot reproduce it (an alias host
 * would produce a different string for the same Page). So this module asks the server-side authority
 * and emits a finished list.
 *
 * WHAT IT IS NOT
 * --------------
 *   · not a route, a page module or a public entrypoint — nothing in the render graph imports it yet;
 *   · not an address builder. It never imports `siteHref`, `pathContextOr`, `resolveNavHref`,
 *     `contentSegments` or `canonicalUrl` and never joins a prefix, Site selector or locale. Every
 *     internal href it emits is a value the request boundary already computed;
 *   · not a publication decision. Only the R04 resolver says whether an authored path is published, and
 *     only `view.navigation` says which Page is current;
 *   · not a Site or locale selector. It receives an ALREADY VERIFIED view and an ALREADY SELECTED
 *     navigation list — see THE PRECONDITION below;
 *   · not a second URL grammar. The authored internal form is the documented `S1E2` configured
 *     destination (`/`, `/about`, `/legal/privacy`) judged by the ONE route grammar inside R04, and the
 *     external form is judged by the ONE released classifier in `@/core/safe-url`.
 *
 * THE PRECONDITION — THE CALLER PROVES THE PRESENTATION SITE
 * ----------------------------------------------------------
 * This helper deliberately does NOT choose which Site's navigation to render. The later server
 * compositor is responsible for proving that `view.publication.presentationSiteCode` names an actual,
 * expressly selected presentation Site in the OWNING `view.context.siteConfig`, and for calling the
 * already approved `effectiveSitePageConfig` and dictionary/asset providers for that Site. Only then
 * does `authoredNavigation` mean "the primary navigation of the Site this page is presenting", rather
 * than "some list someone passed in". That ordering is what makes it impossible for one Entity's
 * authored navigation to be rendered against another Entity's publication. The precondition is stated
 * in the public API below rather than silently assumed here, and this module is not a configuration
 * merge rule.
 *
 * OMISSION IS THE ONLY HONEST REFUSAL FOR A PRIMARY NAV
 * -----------------------------------------------------
 * A footer or legal surface can render a label without a destination. A PRIMARY navigation entry
 * cannot: its entire purpose is to be navigable. So an authored internal destination that R04 cannot
 * prove is omitted rather than advertised as a dead link, and an external destination the released
 * classifier will not sanction is omitted for the same reason. Omission never renumbers the remaining
 * entries — their React identity rides on the ORIGINAL source index — and two configured entries with
 * the same destination stay two distinct items, because the author asked for two.
 */

/**
 * The inputs to one primary-navigation projection.
 *
 * Every field is an ALREADY DECIDED fact supplied by the caller. This module reads no module-global, no
 * environment, no header and no filesystem, so two Entities can never share an answer and a request can
 * never inherit another request's state.
 */
export interface EfsPrimaryNavigationModelInput {
  /**
   * The verified EFS view for THIS request. Only the fields the R04 resolver actually reads are
   * required, so this is the resolver's own narrow contract rather than a counterfeit whole view.
   */
  readonly view: EfsShellDestinationSource;
  /**
   * The effective presentation Site's ALREADY SELECTED primary navigation, in authored order.
   *
   * PRECONDITION: the caller has proved that the presentation Site named by the publication is an
   * expressly selected Site of the OWNING context, and has read this list from that Site's effective
   * page-facing configuration. This module performs no such selection.
   */
  readonly authoredNavigation: readonly NavigationItem[];
  /**
   * The same request's selected dictionary navigation labels, keyed by the AUTHORED href
   * (`"/"`, `"/about"`, …) — `dictionary.navigation.items`.
   */
  readonly dictionaryNavigationLabels: Readonly<Record<string, string>>;
  /**
   * The OWNER-SCOPED, already screened icon projection for this request (the context's own asset
   * resolver, `availableIconUrl`). Called only for icons the configuration actually declares, and only
   * on the server: the result is a plain URL string, so no resolver function reaches the client list.
   */
  readonly resolveIcon: (name: string | undefined) => string | undefined;
}

/**
 * Does this already-classified value carry one of the released authoring schemes EXPLICITLY?
 *
 * `classifyAuthorUrl` answers "may an author emit this at all", and it deliberately accepts same-site
 * paths, fragments and relative references as well — those are ordinary Markdown links. A
 * primary-navigation EXTERNAL destination is a stronger claim: it says "this leaves the site". A bare
 * word, `./x`, `#top` or `?q=1` cannot substantiate that claim, so it is not promoted into a trusted
 * external link merely because the broader authoring policy tolerates it.
 *
 * The test is a prefix comparison against `AUTHOR_ALLOWED_SCHEMES` — the SAME released list, not a new
 * grammar and not a second allowlist. `classifyAuthorUrl` has already refused `javascript:`, `data:`,
 * protocol-relative `//host`, nested character references and every unknown scheme before this runs, so
 * this only distinguishes "explicitly one of ours" from "a relative reference".
 */
function hasAllowedExplicitScheme(href: string): boolean {
  return AUTHOR_ALLOWED_SCHEMES.some((scheme) => {
    const prefix = `${scheme}:`;
    return href.length >= prefix.length && href.slice(0, prefix.length).toLowerCase() === prefix;
  });
}

/**
 * Project one presentation Site's authored primary navigation into the exact list the R05 render seam
 * accepts.
 *
 * Pure and side-effect free: the input is never mutated, no state is read or cached, and the same
 * arguments always produce the same answer. The result carries only public facts — a verified address, a
 * label, a position-derived key, the verified current-Page flag and the author's own presentation
 * leaves. No view, manifest, capsule path, source text, property bag, Spoke identity, dictionary
 * resolver or asset resolver function crosses the boundary.
 */
export function efsPrimaryNavigationModel(
  input: EfsPrimaryNavigationModelInput,
): readonly EfsResolvedNavItem[] {
  const { view, authoredNavigation, dictionaryNavigationLabels, resolveIcon } = input;
  const items: EfsResolvedNavItem[] = [];

  authoredNavigation.forEach((authored, index) => {
    // The approved legacy label rule, unchanged: a localized label keyed by the AUTHORED href wins, and
    // the configured label is the fallback. A missing translation can therefore only ever change text —
    // it can never produce a different publication.
    const label = dictionaryNavigationLabels[authored.href] ?? authored.label;

    // The author's own presentation leaves. Icon resolution runs ONLY for declared icons, and an
    // `undefined` or `""` answer passes through unchanged so a missing asset degrades to text exactly as
    // the legacy producer behaved. No sidebar default is applied here — that remains the sidebar
    // surface's decision, which is why the header and bottom bar cannot gain icons by accident.
    const icon = authored.icon === undefined ? undefined : resolveIcon(authored.icon);
    const openIcon = authored.iconOpen === undefined ? undefined : resolveIcon(authored.iconOpen);
    const closedIcon =
      authored.iconClosed === undefined ? undefined : resolveIcon(authored.iconClosed);

    if (authored.href.startsWith("/")) {
      // INTERNAL — the documented site-relative configured form. R04 is the ONLY authority on whether
      // this names a published Page of the current Site, and its returned href is emitted verbatim.
      //
      // A protocol-relative value (`//host`) lands here too, because it begins with `/`, and is refused
      // by R04's one route grammar (an empty segment) rather than being re-read as an external link —
      // which is the behaviour we want: it is never navigable and never becomes a trusted destination.
      const destination = resolveEfsShellInternalDestination({
        view,
        authoredHref: authored.href,
      });
      if (destination.kind !== "published") return;

      // CURRENT PAGE — read from the SAME verified navigation decision the resolver consulted, matched
      // on both the page identity and the exact address it returned. Never a client pathname, never a
      // raw `window.location`, and never a case- or host-dependent comparison, so an alias host or a
      // case-varied Page path cannot change which entry is current.
      const entry = view.navigation.find(
        (candidate) =>
          candidate.pageId === destination.pageId && candidate.href === destination.href,
      );

      items.push({
        href: destination.href,
        key: navItemKey(index),
        label,
        active: entry?.current === true,
        icon,
        openIcon,
        closedIcon,
        position: authored.position,
        disabled: authored.disabled,
      });
      return;
    }

    // EXTERNAL — anything that is not the site-relative configured form. The config schema validates only
    // nonempty text here, so a parsed `NavigationItem` is NOT proof that a scheme is safe: the released
    // classifier decides. Both conditions are required — a destination the authoring policy refuses, or
    // one that is merely a relative reference rather than an explicit scheme, is omitted rather than
    // promoted into a cross-site link.
    const verdict = classifyAuthorUrl(authored.href);
    if (!verdict.ok) return;
    // The classifier returns the DECODED, validated value; that is what is emitted, never the
    // unclassified original, so validation and rendering can never read different strings.
    if (!hasAllowedExplicitScheme(verdict.href)) return;

    items.push({
      href: verdict.href,
      key: navItemKey(index),
      label,
      // An external destination is never the current page on this site.
      active: false,
      external: true,
      icon,
      openIcon,
      closedIcon,
      position: authored.position,
      disabled: authored.disabled,
    });
  });

  return items;
}
