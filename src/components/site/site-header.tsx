import Link from "next/link";
import type { ReactNode } from "react";

import type { SiteConfig } from "@/config/site-config";
import type { Dictionary } from "@/config/i18n/dictionary";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import { regionDisplayName } from "@/core/display-labels";
import { regionsForSite } from "@/core/regional-pages";
import {
    headerNavigationLayouts,
    layoutScopeAttributes,
    menuModeClass,
    resolveShellPattern,
    type ResolvedUiConfig,
} from "@/core/ui";
import type { RuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import { ContextNavLinks, type ContextNavLink, type EfsResolvedNavItem } from "./context-nav-links";
import { ClientRoutingProvider } from "./client-routing-context";
import { buildClientRoutingContext } from "./client-routing";
import { siteSetOf } from "@/core/site";
import { Stack } from "@/components/ui/stack";
import { EfsLanguageSwitcher, LanguageSwitcher, type EfsLanguageOption } from "./language-switcher";
import { LayoutSwitcher } from "./layout-switcher";
import { LocationSwitcher } from "./location-switcher";
import { SiteSelector, type SiteSelectorOption } from "./site-selector";
import { SpokeSwitcher, type SpokeSwitcherOption } from "./spoke-switcher";
import { getSiteNavLinks } from "./nav-links";
import { headerGraphicBandProps } from "./header-graphic";

interface SiteHeaderProps {
    /** The locale PATH KEY of the current URL (`en`, `fr-ca`) — the dictionary's key too. */
    readonly locale: string;
    /** The resolved UI configuration (UI-02), computed once by the layout. */
    readonly resolved: ResolvedUiConfig;
    /**
     * S1E2 — the site whose page tree this header belongs to: it selects the site's dictionary and
     * the site's effective navigation. Absent → the deployment's default site (the single-site case).
     */
    readonly siteId?: string;
    /**
     * S1E2 — the Site selector's options, resolved server-side by `@/application/site-switch`.
     * Fewer than two options (or absent) → NO selector renders, so a single-site deployment's
     * header is byte-identical to before.
     */
    readonly siteSwitch?: readonly SiteSelectorOption[];
    /**
     * M13 — THE RENDERING CONTEXT'S CONFIGURATION. This server component holds no Spoke authority of
     * its own: the configuration, the dictionary answers and the asset answers below all belong to the
     * context the composition was built for, so two contexts cannot share a header decision.
     */
    readonly siteConfig: SiteConfig;
    /**
     * `D40` Decision C (`R04-C31`) — the ALREADY RESOLVED brand logo of the EFS publication, as a
     * same-origin `owner-assets` path, or absent when the publication resolved none.
     *
     * It is a resolved ADDRESS, not a configured asset: the composition made the source decision and applied
     * the owner-assets representation, so this component must never pass it through the runtime catalog.
     * Absent leaves the existing configured-logo path — and its compact alternate — exactly as it was, so a
     * non-EFS composition is unaffected.
     */
    readonly resolvedLogoSrc?: string;
    /** M13 — that same context's dictionary answers (the header reads ITS site's dictionary). */
    readonly dictionaryAccess: RuntimeDictionaryAccess;
    /** M13 — that same context's asset resolver (server-only; never handed to a client component). */
    readonly assets: RuntimeAssetOwnershipResolver;
    /**
     * R1 — THE CROSS-SPOKE SWITCHER'S SERVER-RESOLVED PROJECTION: the identity of the Spoke THIS page
     * belongs to, the control's localized accessible name, and the ordered options the Installation authored.
     *
     * Absent → NO switcher renders, which is the state of every Installation that authors none (the platform
     * never invents Spokes, labels or destinations). The current Spoke is request/hostname-authoritative and
     * arrives already resolved, so the control marks the truth rather than a client-side guess.
     */
    readonly spokeSwitch?: {
        readonly current: string;
        readonly label: string;
        readonly options: readonly SpokeSwitcherOption[];
    };
    /**
     * GEO-04 R10 — THE EFS PRESENTATION OF THIS HEADER.
     *
     * Present → the header renders the PUBLICATION'S OWN verified facts and resolves nothing: no
     * `getSiteNavLinks`, no `siteSetOf`/`regionsForSite`, no `ClientRoutingProvider`, no `siteHref` and no
     * `buildClientRoutingContext`. This is mandatory, not an optimisation — the EFS shell composes no routing
     * provider (the legacy `ContextNavLinks`/`LanguageSwitcher` branches would throw or resolve a second time
     * against a page-binding model the EFS publication does not have).
     *
     * Absent → every legacy code path below is untouched, byte for byte.
     */
    readonly efs?: {
        /** Published primary navigation, already verified and `current`-marked (R09). */
        readonly navItems: readonly EfsResolvedNavItem[];
        /**
         * The published Home address (`EfsShellAddressProjection.homeHref`), or `null` when this Site
         * publishes no Home Page. `null` renders the brand UNLINKED — the header must never invent a locale
         * root, a default Site or a prefix that the publication did not prove.
         */
        readonly homeHref: string | null;
        /**
         * Published language alternates of THIS Page. Absent when the Page has no other published
         * representation, in which case no Language control is composed (a one-option selector would offer
         * a destination the visitor is already on).
         */
        readonly languages?: {
            /** The CURRENT representation's standards tag. */
            readonly current: string;
            /** Localized accessible name, from THIS Spoke's dictionary. */
            readonly label: string;
            readonly options: readonly EfsLanguageOption[];
        };
    };
}

/**
 * EN-M (English-master closure) — THE HEADER LINK HIT-AREA BOX.
 *
 * One definition of the ≥44px interaction-box contract the header's links share.
 * It carries LAYOUT only: typography, colour and state treatments stay with each
 * surface, so the box can be applied to a link whose visual design must not move.
 */
export const TOUCH_TARGET_BOX_CLASS = "inline-flex min-h-11 min-w-11 items-center";

/**
 * EN-M (English-master closure) — THE HEADER NAVIGATION LINK CONTRACT.
 *
 * The ≥44px interaction-target contract the programme already applies to the
 * mobile navigation trigger (VIS1C), the brand/home link (VIS1C) and the footer
 * links (VIS2S) was MISSING on the header's own navigation links: `text-sm` with
 * no vertical box produced a 20px-tall target at every desktop width, and the
 * same 20px in the drawer's vertical list — the smallest interactive targets in
 * the shell.
 *
 * The fix grows the INTERACTIVE BOX only, exactly like the brand link next to
 * it: `inline-flex` + `min-h-11` (+ `min-w-11`, so a short label can never be
 * narrower than the target floor). Typography, colour, the transition and
 * `aria-current` active treatment are unchanged, and the header's own height
 * does not move: the row is already ≥44px tall because the brand lockup is, so
 * the navigation links simply occupy the height the header already has.
 *
 * The same box is applied to the TEXT brand fallback (`TOUCH_TARGET_BOX_CLASS`)
 * — the path an adopter without a configured logo uses — so the "go home"
 * target meets the same floor with its typography untouched.
 *
 * This is a SHARED SHELL change — no profile CSS and no new configuration
 * surface, so every adopter and every site profile inherits it.
 */
export const HEADER_NAV_LINK_CLASS = `${TOUCH_TARGET_BOX_CLASS} text-sm text-muted-foreground transition-colors hover:text-foreground`;

/**
 * FOUNDATION-UI-R1F — THE COMPACT-LOGO BOUNDARY, in CSS pixels: BELOW it the configured compact artwork is the
 * header's identity, and AT OR ABOVE it the primary logo is.
 *
 * The boundary is expressed ONCE, as the `media` attribute of the ONE `<source>` the header composes — a CSS
 * MEDIA QUERY, so the BROWSER performs the selection natively, before layout and before any pixel is painted.
 * There is therefore no client state, no resize listener, no hydration-dependent switching and no second `<img>`
 * hidden behind CSS: the artwork the browser picked is the artwork that is fetched, and the answer is the same on
 * the first paint as at every resize.
 *
 * `599.98`, never `599`, is what makes "below 600 CSS pixels" exact: a viewport may be a fractional number of CSS
 * pixels (a zoomed or fractional-device-pixel window), and `max-width: 599px` would hand the PRIMARY artwork to a
 * 599.5px viewport — which is below the boundary the owner specified. The two-token form the alternative
 * `min-width`/`max-width` pair would need is avoided for the same reason: one `<source>` states the whole rule.
 */
const COMPACT_LOGO_MEDIA_QUERY = "(max-width: 599.98px)";

export function SiteHeader({
    locale,
    resolved,
    siteId,
    siteSwitch,
    spokeSwitch,
    siteConfig,
    dictionaryAccess,
    assets,
    resolvedLogoSrc,
    efs,
}: SiteHeaderProps) {
    const dictionary: Dictionary = dictionaryAccess.get(
        locale,
        siteId ?? siteConfig.defaultSite.code,
    );
    // M14 — this chrome composes ROUTING CONTROLS (navigation links and the Site/language/location
    // selectors), so it provides the CURRENT context's routing projection to them: the ONE client
    // transport, built from the same configuration the header renders with.
    // GEO-04 R10 — the routing projection is built ONLY for the legacy branch. An EFS header has no
    // provider to feed (and must not build one: its addresses come from the publication, not from a
    // page-binding model this publication does not have).
    const clientRouting =
        efs === undefined
            ? buildClientRoutingContext(
                  siteConfig,
                  siteSetOf(siteConfig.sites, siteConfig.defaultSite),
              )
            : null;
    const decision = resolveShellPattern(resolved);
    const desktopSlot = decision.desktop.slot;
    const tabletSlot = decision.tablet.slot;
    // NAV1B — THE HEADER COMPOSES NO MOBILE NAVIGATION. The sidebar composition's
    // constrained-width disclosure belongs to the sidebar/shell boundary and is composed there
    // by the shell engine, so this header owns exactly two semantic rows (identity + the
    // navigation-MODE selector, then every other control). Previously it lived here, where it
    // migrated between the header's lines as the visitor controls changed width — the reported
    // defect.
    // N2 — when the layout switcher is enabled the header must ALSO carry the
    // navigation for every composed layout that uses the header slot, because which
    // structure is displayed is decided client-side: the header's nav and the rail
    // both exist and the active layout presentation exposes exactly one of them
    // (globals.css — shell layout presentation).
    const layoutHeaderLayouts = resolved.layoutSwitcher.enabled
        ? headerNavigationLayouts(resolved)
        : [];
    // The header renders the ≥md navigation landmark ONLY when the resolved
    // composition places navigation in the header slot (top-bar patterns) or a
    // composed layout does. With an aside composition (adaptive sidebar) the single
    // nav landmark lives in the shell sidebar instead — exactly one exposed landmark
    // per viewport, in either case.
    const headerNavPresent =
        desktopSlot === "header" || tabletSlot === "header" || layoutHeaderLayouts.length > 0;
    const hasHeaderNav = headerNavPresent && resolved.navigation.top.mode !== "closed";
    const topModeClass = menuModeClass(resolved.navigation.top.mode);
    const desktopNavClassName = !hasHeaderNav
        ? undefined
        : layoutHeaderLayouts.length > 0
            // A switcher composes this navigation for a layout that uses it at BOTH
            // md bands, so the class covers whichever layout is active.
            ? "hidden md:block"
            : desktopSlot === "header" && tabletSlot === "header"
                ? "hidden md:block"
                : desktopSlot === "header"
                    ? "hidden lg:block"
                    : "hidden md:block lg:hidden";
    // R1C — the selector's inventory is the ACTIVE SITE's own locations, so a deployment with
    // several sites shows the Location control exactly where locations exist: Global (which binds
    // none) renders no Location control at all, and Germany's Berlin/Frankfurt can never be
    // offered on another site. Within a site the rule is unchanged — configuration, never
    // "locations compatible with my language" (Phase M).
    const siteRegionIds = regionsForSite(siteConfig.pageBindings, siteId ?? siteConfig.defaultSite.code);
    const hasLocations = siteRegionIds.length > 0;
    const configuredRegionIdsList = siteRegionIds;
    // Phase M refinement — localized + English display names (pure helper).
    const regionLabels = Object.fromEntries(
        configuredRegionIdsList.map((regionId) => [
            regionId,
            regionDisplayName(locale, siteConfig.regions[regionId]),
        ]),
    );

    // GEO-04 R10 — EFS destinations are ALREADY resolved (R09) and are never re-derived here.
    const navLinks: readonly ContextNavLink[] =
        efs === undefined
            ? getSiteNavLinks({
                  locale,
                  siteId,
                  siteConfig,
                  dictionary: dictionaryAccess,
                  iconUrl: assets.availableIconUrl,
              })
            : [];
    // P6-3B — the header's left brand slot renders the configured header logo
    // (the `site.assets.logo` role), replacing the former text label.
    // `runtimeAssetUrl` keeps it same-origin AND points it at the RUNTIME
    // NAMESPACE that holds the file (S3F1), so a Spoke's own logo is served from
    // that Spoke's namespace; intrinsic aspect ratio is
    // preserved (`h-8 w-auto`, responsive); accessible name = the site name.
    // Absent config → the previous text brand link (graceful, never broken).
    //
    // `D40` Decision C (`R04-C31`) — when the EFS publication resolved a logo of its own, the address is
    // ALREADY the binding's same-origin `owner-assets` path. It is used verbatim: handing an owner-assets
    // path to `runtimeAssetUrl` would re-derive it from the basename in the Spoke's catalog namespace, which
    // is exactly the "EFS URL through a catalog lookup" confusion the decision forbids. Absent means nothing
    // may be published from either source, so the text brand link stands.
    const headerLogoSrc = resolvedLogoSrc ?? assets.runtimeAssetUrl(siteConfig.assets?.logo);
    /**
     * FOUNDATION-UI-R1F — THE COMPACT ALTERNATIVE (`site.assets.logoCompact`, the `logo-compact` role).
     *
     * It is resolved exactly like the primary logo (same-origin, and pointed at the runtime namespace that holds
     * the file) and becomes the narrow-viewport `<source>` of the ONE `<picture>` below. The resolution itself is
     * not gated: the RENDER is, on `headerLogoSrc`, because a compact artwork is an alternative to a primary logo
     * and never an identity of its own (the schema refuses the combination outright).
     *
     * Absent → `undefined` → the image is handed ONE source, so at every width it is the primary logo, exactly as
     * before this milestone: no markup, no attribute and no network request is added to an installation that
     * configures no compact artwork.
     */
    const headerCompactLogoSrc =
        resolvedLogoSrc === undefined ? assets.runtimeAssetUrl(siteConfig.assets?.logoCompact) : undefined;
    // P12-HG — the optional decorative header band (`site.assets.headerGraphic`,
    // the `header-graphic` role). Resolved on the SERVER through the shared
    // availability rule, so a configured-but-missing file resolves to
    // `undefined` → no band at all (and `node:fs` never reaches the browser).
    // It is painted as the header's OWN background (`headerGraphicBandProps`),
    // so it needs no extra DOM and cannot disturb the header's layout, the
    // page banner, the identity logo or the navigation.
    const headerGraphic = assets.availableHeaderGraphicPath(siteConfig.assets?.headerGraphic);

    // The ≥md header navigation list — composed only for a CUSTOM composition that presents
    // one (NAV1B: neither shipped layout does; a Menu-bar composition presents its navigation
    // in the sticky bottom bar at every width).
    //
    // GEO-04 R10 — ONE list, TWO contracts: the EFS branch passes the publication's verified destinations
    // through the hook-free `efs-resolved` mode of the SAME component, so the markup, ordering, icon and
    // active treatment are shared and the EFS surface cannot drift.
    const navListElement =
        efs === undefined ? (
            <ContextNavLinks
                locale={locale}
                links={navLinks}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${topModeClass ?? ""}`}
                linkClassName={HEADER_NAV_LINK_CLASS}
            />
        ) : (
            <ContextNavLinks
                mode="efs-resolved"
                items={efs.navItems}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${topModeClass ?? ""}`}
                linkClassName={HEADER_NAV_LINK_CLASS}
            />
        );

    // NAV1B — WHO BELONGS TO THE SECONDARY ROW. `SiteSelector` (only when the deployment
    // serves more than one site), `LocationSwitcher` (only where the active site binds
    // locations) and `LanguageSwitcher` (only when more than one locale is configured) are the
    // existing CONTEXTUAL SELECTION GROUP: the controls that choose the context a page is read
    // in. The navigation-MODE selector is deliberately NOT one of them — it belongs to the top
    // row, beside the identity. A ≥md navigation a custom composition presents is not a
    // dropdown either, but it is secondary chrome: it shares this row rather than disturbing
    // the top row's fixed ownership.
    const siteSelectorPresent = siteSwitch !== undefined && siteSwitch.length > 1;
    // GEO-04 R10 — the EFS Language control is composed from the Page's PUBLISHED alternates, not from the
    // Site's declared locale list: a locale the Page has no representation in is not a destination.
    const languageSelectorPresent =
        efs === undefined ? siteConfig.locales.length > 1 : efs.languages !== undefined;
    const hasSecondaryControls =
        hasHeaderNav || siteSelectorPresent || hasLocations || languageSelectorPresent;

    // P6-3C — NO mobile drawer/overlay CTA is composed here. The primary CTA
    // has ONE authoritative home (the shell's top region, below the header), so
    // the disclosure carries navigation only: opening the drawer can never
    // expose a second Book Now alongside the always-visible top one.

    // P12-HG — the optional decorative header band is the header's OWN
    // background layer, so it needs no extra DOM, no stacking context and no
    // `z-index`: a background always paints behind the header's in-flow content
    // (logo, navigation, switchers, mobile trigger) and above the header's own
    // background colour. Unconfigured → no attribute and no inline style, so
    // the header renders exactly as it did before P12-HG.
    // GEO-04 R10 — THE BRAND DESTINATION, decided by ONE authority per branch. Legacy keeps the locale-root
    // link it has always emitted; EFS uses the publication's OWN Home address, and `null` (this Site publishes
    // no Home Page) means the brand renders UNLINKED rather than a synthesised root.
    const brandHref: string | null = efs === undefined ? `/${locale}` : efs.homeHref;

    const header = (
        <header className="ui-site-header border-b border-border" {...headerGraphicBandProps(headerGraphic)}>
            <div className="mx-auto max-w-page px-4 py-4">
                {/* ── TOP SEMANTIC ROW — THE BRAND IDENTITY + THE RIGHT-HAND CONTROL CLUSTER ─────
                    NAV1B-V2 (FOUNDATION-UI-R1) — ONE row, TWO occupants, ONE rule for BOTH identity
                    kinds: the brand is FIRST, the control cluster follows it, and the row WRAPS BY
                    CONTENT (a wrapping flex row — never a viewport breakpoint). While the two fit on
                    one line the brand keeps the left edge and the cluster is anchored at the right
                    edge of the padded header content; when they cannot share a line the cluster moves
                    ENTIRELY BENEATH the brand and stays right-aligned. The row never overlaps, never
                    stacks and never paints one occupant over the other: the brand may therefore keep
                    its own width (a text brand breaking inside itself, a graphic lockup keeping its
                    intrinsic aspect ratio) instead of being covered by the selector. The stylesheet
                    owns the arrangement — `globals.css`, NAV1B-V2 — so both kinds share it verbatim. */}
                <div className="ui-site-header-top">
                    <div
                        className={
                            headerLogoSrc
                                ? "ui-site-header-identity ui-site-header-identity--graphic"
                                : "ui-site-header-identity break-words"
                        }
                    >
                        {headerLogoSrc ? (
                            <BrandFrame
                                href={brandHref}
                                label={siteConfig.name}
                                // VIS1C — a >= 44px-tall HIT AREA for the brand/home link.
                                // The lockup artwork stays at its `h-8` visual scale; the
                                // interactive box around it grows so the site's primary
                                // "go home" target is comfortably tappable.
                            >
                                {/* FOUNDATION-UI-R1E — the mark's DISPLAY contract lives in ONE place: the
                                    stylesheet's `.ui-site-header-logo` rule (a maximum inline size of 280px
                                    by default, the shared display size as its height maximum, and the
                                    available container width, whichever is smallest — with the aspect ratio
                                    always preserved and never enlarged). No utility class pins a dimension
                                    here, because a forced height would stretch a naturally smaller mark and
                                    defeat both maxima. */}
                                {/* FOUNDATION-UI-R1F — ONE `<picture>`, ONE `<img>`, and the BROWSER performs the
                                    ART DIRECTION. The `<source>` is the configured compact artwork for a viewport
                                    narrower than 600 CSS pixels; the `<img>` is both the fallback (a browser that
                                    ignores `<picture>`, and the print/legacy path) and the primary artwork at every
                                    wider viewport. There is no client state, no resize listener, no
                                    hydration-dependent switching and no CSS-hidden second image: the selection happens
                                    in the source-selection algorithm, so the SAME markup answers correctly on the
                                    first paint and after any later resize. The wrapper carries no box of its own
                                    (`globals.css`, `.ui-site-header-logo-frame`), so the identity's flex sizing and
                                    the mark's display contract are untouched by it. */}
                                <picture className="ui-site-header-logo-frame">
                                    {headerCompactLogoSrc === undefined ? null : (
                                        <source
                                            media={COMPACT_LOGO_MEDIA_QUERY}
                                            srcSet={headerCompactLogoSrc}
                                        />
                                    )}
                                    <img
                                        src={headerLogoSrc}
                                        alt={siteConfig.name}
                                        className="ui-site-header-logo"
                                    />
                                </picture>
                            </BrandFrame>
                        ) : efs === undefined ? (
                            <ContextNavLinks
                                locale={locale}
                                links={[{ href: "/", label: siteConfig.name }]}
                                className="font-semibold tracking-tight"
                                // EN-M — the text brand fallback is the "go home" target for an
                                // adopter with no configured logo; it takes the same ≥44px box
                                // (its own typography and weight are untouched).
                                linkClassName={TOUCH_TARGET_BOX_CLASS}
                            />
                        ) : brandHref === null ? (
                            // GEO-04 R10 — no published Home Page: the name is a LABEL, never a link to an
                            // address the publication did not prove.
                            <span className={`font-semibold tracking-tight ${TOUCH_TARGET_BOX_CLASS}`}>
                                {siteConfig.name}
                            </span>
                        ) : (
                            <Link href={brandHref} className={`font-semibold tracking-tight ${TOUCH_TARGET_BOX_CLASS}`}>
                                {siteConfig.name}
                            </Link>
                        )}
                    </div>

                    {/* ── THE HEADER'S RIGHT-HAND CONTROL CLUSTER (R1) ─────────────────────
                        NAV1B-V2 keeps this row's ownership: the identity plus the controls that choose the
                        CHROME a visitor is reading in — the cross-Spoke switcher (when the Installation
                        authors one) and the navigation-MODE selector (when the adopter enables it). Both
                        keep their normal control sizing and sit at the right edge of the padded header
                        content, on the brand's own line while the two fit together and ENTIRELY BELOW the
                        brand when they do not (the row wraps by content — no overlay, no stacking, so the
                        cluster can never cover the identity). The cluster is itself a wrapping flex row, so
                        two controls that cannot share ITS line wrap inside it rather than disappear or
                        push the row wider.

                        WHY THE SPOKE SWITCHER LIVES HERE. It must remain visible on a Spoke that has ONE
                        Site, ONE language and NO Locations — the row below is composed only when such
                        controls exist, so a switcher placed there would vanish exactly where an Installation
                        that switches Spokes needs it most. */}
                    {spokeSwitch !== undefined || resolved.layoutSwitcher.enabled ? (
                        <div className="ui-site-header-controls flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                            {spokeSwitch !== undefined ? (
                                <SpokeSwitcher
                                    current={spokeSwitch.current}
                                    label={spokeSwitch.label}
                                    options={spokeSwitch.options}
                                />
                            ) : null}
                            {resolved.layoutSwitcher.enabled ? (
                                <div className="ui-site-header-mode">
                                    <LayoutSwitcher
                                        label={dictionary.layout.label}
                                        defaultLayout={resolved.layoutSwitcher.default}
                                        labels={{
                                            sidebar: dictionary.layout.sidebar,
                                            "menu-bar": dictionary.layout.menuBar,
                                        }}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {/* ── SECONDARY SEMANTIC ROW — EVERY OTHER HEADER CONTROL ───────────────
                    NAV1B — the contextual selectors (Site → Location → Language) and any ≥md
                    header navigation a CUSTOM composition presents live HERE: always below the
                    top row, left-aligned at the padded edge, in normal control sizing. They
                    wrap INSIDE this row when the width needs it and never move up. */}
                {hasSecondaryControls ? (
                    // The shared `Stack` (flex-wrap row + gap + item alignment) owns this row's
                    // flow: its controls wrap INSIDE the row and can never move up. The TOP row is
                    // a two-column grid instead, because its contract is not a wrapping flow —
                    // the selector stays anchored at the right edge while the identity yields
                    // (`Stack` deliberately expresses no column tracks: see `ui/stack.tsx`).
                    <Stack
                        direction="row"
                        gap="gap-x-3 gap-y-2"
                        items="items-center"
                        className="ui-site-header-context mt-3"
                    >
                    {hasHeaderNav ? (
                        <nav
                            aria-label={dictionary.navigation.primaryLabel}
                            className={desktopNavClassName}
                            {...layoutScopeAttributes(
                                "top-nav",
                                layoutHeaderLayouts,
                                resolved.layoutSwitcher.enabled,
                            )}
                        >
                            {navListElement}
                        </nav>
                    ) : null}

                    {/* S1E2 — the SITE selector comes first: it changes the whole context
                        (page tree + labels + navigation), which every other selector then
                        acts INSIDE. Rendered only when the deployment serves more than one
                        site, so a single-site deployment is unchanged. */}
                    {siteSelectorPresent ? (
                        <SiteSelector
                            current={siteId ?? siteConfig.defaultSite.code}
                            label={dictionary.site.label}
                            options={siteSwitch ?? []}
                        />
                    ) : null}
                    {hasLocations ? (
                        <LocationSwitcher
                            locale={locale}
                            label={dictionary.location.label}
                            unspecifiedLabel={dictionary.location.unspecified}
                            regionLabels={regionLabels}
                        />
                    ) : null}
                    {languageSelectorPresent ? (
                        efs === undefined || efs.languages === undefined ? (
                            <LanguageSwitcher locale={locale} label={dictionary.language.label} />
                        ) : (
                            <EfsLanguageSwitcher
                                current={efs.languages.current}
                                label={efs.languages.label}
                                options={efs.languages.options}
                            />
                        )
                    ) : null}
                    {/* GEO-04 R10 — EFS language control: PUBLISHED alternates only, resolved by the
                        compositor and rendered verbatim (see `EfsLanguageSwitcher`). */}
                    </Stack>
                ) : null}
            </div>
        </header>
    );
    // GEO-04 R10 — the ONE place the provider is chosen. An EFS header composes NO `ClientRoutingProvider`:
    // its links and its language control are hook-free, and giving them a page-binding routing projection
    // they do not have would be a second, contradictory address authority.
    return clientRouting === null ? (
        header
    ) : (
        <ClientRoutingProvider routing={clientRouting}>{header}</ClientRoutingProvider>
    );
}

/**
 * GEO-04 R10 — THE BRAND'S ONE INTERACTION FRAME.
 *
 * The header's identity is a "go home" target only when a Home address is PROVED. This renders the SAME box
 * and the SAME ≥44px hit area in both cases — as a link when `href` is an address, and as a plain labelled box
 * when it is `null` — so an EFS Site that publishes no Home Page cannot acquire a synthesised root, a default
 * Site or a locale guess, and the layout does not shift between the two states.
 */
function BrandFrame({
    href,
    label,
    children,
}: {
    readonly href: string | null;
    readonly label: string;
    readonly children: ReactNode;
}) {
    const className = "ui-site-header-brand inline-flex min-h-11 min-w-11 items-center";
    if (href === null) {
        return (
            <span aria-label={label} className={className}>
                {children}
            </span>
        );
    }
    return (
        <Link href={href} aria-label={label} className={className}>
            {children}
        </Link>
    );
}