import Link from "next/link";

import { siteConfig } from "@/config";
import { assetPathFromUrl, availableHeaderGraphicPath, availableIconName } from "@/config/assets";
import { getDictionary } from "@/config/i18n";
import { regionDisplayName } from "@/core/display-labels";
import { configuredRegionIds } from "@/core/regional-pages";
import { menuModeClass, resolveShellPattern, type ResolvedUiConfig } from "@/core/ui";
import { ShellMobileNav } from "@/components/shell";
import { Stack } from "@/components/ui/stack";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { LanguageSwitcher } from "./language-switcher";
import { LocationSwitcher } from "./location-switcher";
import { getSiteNavLinks } from "./nav-links";
import { headerGraphicBandProps } from "./header-graphic";

interface SiteHeaderProps {
    readonly locale: string;
    /** The resolved UI configuration (UI-02), computed once by the layout. */
    readonly resolved: ResolvedUiConfig;
}

export function SiteHeader({ locale, resolved }: SiteHeaderProps) {
    const dictionary = getDictionary(locale);
    const decision = resolveShellPattern(resolved);
    const mobilePattern = decision.mobile.primitiveKind;
    const desktopSlot = decision.desktop.slot;
    const tabletSlot = decision.tablet.slot;
    // The header renders the ≥md navigation landmark ONLY when the resolved
    // composition places navigation in the header slot (top-bar patterns). With
    // an aside composition (adaptive sidebar) the single nav landmark lives in
    // the shell sidebar instead — exactly one exposed landmark per viewport.
    const hasHeaderNav = (desktopSlot === "header" || tabletSlot === "header") && resolved.navigation.top.mode !== "closed";
    const topModeClass = menuModeClass(resolved.navigation.top.mode);
    const sidebarModeClass = menuModeClass(resolved.navigation.sidebar.mode);
    const desktopNavClassName = !hasHeaderNav
        ? undefined
        : desktopSlot === "header" && tabletSlot === "header"
            ? "hidden md:block"
            : desktopSlot === "header"
                ? "hidden lg:block"
                : "hidden md:block lg:hidden";
    // Phase M: the selector inventory is every CONFIGURED operating location
    // (`business.regions` is authoritative), so once any region is configured
    // the Location selector is available for every locale.
    const hasLocations = configuredRegionIds(siteConfig.regions).length > 0;
    const configuredRegionIdsList = configuredRegionIds(siteConfig.regions);
    // Phase M refinement — localized + English display names (pure helper).
    const regionLabels = Object.fromEntries(
        configuredRegionIdsList.map((regionId) => [
            regionId,
            regionDisplayName(locale, siteConfig.regions[regionId]),
        ]),
    );

    const navLinks: readonly ContextNavLink[] = getSiteNavLinks(locale);
    // P6-3B — the header's left brand slot renders the configured header logo
    // (the `site.assets.logo` role), replacing the former text label.
    // `assetPathFromUrl` keeps it same-origin; intrinsic aspect ratio is
    // preserved (`h-8 w-auto`, responsive); accessible name = the site name.
    // Absent config → the previous text brand link (graceful, never broken).
    const headerLogoSrc = assetPathFromUrl(siteConfig.assets?.logo);
    // P12-HG — the optional decorative header band (`site.assets.headerGraphic`,
    // the `header-graphic` role). Resolved on the SERVER through the shared
    // availability rule, so a configured-but-missing file resolves to
    // `undefined` → no band at all (and `node:fs` never reaches the browser).
    // It is painted as the header's OWN background (`headerGraphicBandProps`),
    // so it needs no extra DOM and cannot disturb the header's layout, the
    // page banner, the identity logo or the navigation.
    const headerGraphic = availableHeaderGraphicPath(siteConfig.assets?.headerGraphic);

    const navListElement = (
        <ContextNavLinks
            locale={locale}
            links={navLinks}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${topModeClass ?? ""}`}
            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
        />
    );

    // P5-4 — Shared responsive navigation contract: the mobile sidebar
    // disclosure (drawer AND overlay — the whole "Show Sidebar" contract)
    // presents navigation as a clean VERTICAL list, one item per line. The
    // horizontal `flex flex-wrap` class belongs ONLY to the ≥md header
    // top-navigation; previously the drawer pattern reused that horizontal
    // list, so classic/focus/workspace wrapped multiple items per line inside
    // the drawer (immersive's overlay showed the intended vertical layout).
    // A single vocabulary-agnostic list now yields the same vertical
    // presentation for every mobile disclosure (immersive markup is unchanged).
    const mobileNavListElement = (
        <ContextNavLinks
            locale={locale}
            links={navLinks}
            className={`flex flex-col items-start gap-y-2 ${sidebarModeClass ?? ""}`}
            linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
            // P5-5 — the mobile sidebar disclosure orders by configured
            // region (top → middle → bottom) like the aside rail.
            sortByRegion
        />
    );

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
    return (
        <header className="ui-site-header border-b border-border" {...headerGraphicBandProps(headerGraphic)}>
            <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4">
                {headerLogoSrc ? (
                    <Link
                        href={`/${locale}`}
                        aria-label={siteConfig.name}
                        className="ui-site-header-brand inline-flex items-center"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={headerLogoSrc}
                            alt={siteConfig.name}
                            className="ui-site-header-logo h-8 w-auto"
                        />
                    </Link>
                ) : (
                    <ContextNavLinks
                        locale={locale}
                        links={[{ href: "/", label: siteConfig.name }]}
                        className="font-semibold tracking-tight"
                    />
                )}

                <Stack direction="row" gap="gap-x-4 gap-y-2" items="items-center">
                    {hasHeaderNav ? (
                        <nav aria-label={dictionary.navigation.primaryLabel} className={desktopNavClassName}>
                            {navListElement}
                        </nav>
                    ) : null}

                    <Stack direction="row" gap="gap-x-3 gap-y-2" items="items-center">
                        {hasLocations ? (
                            <LocationSwitcher
                                locale={locale}
                                label={dictionary.location.label}
                                unspecifiedLabel={dictionary.location.unspecified}
                                regionLabels={regionLabels}
                            />
                        ) : null}
                        {siteConfig.locales.length > 1 ? (
                            <LanguageSwitcher
                                locale={locale}
                                label={dictionary.language.label}
                            />
                        ) : null}
                    </Stack>
                </Stack>

                {mobilePattern === "drawer" || mobilePattern === "overlay" ? (
                    <ShellMobileNav
                        pattern={mobilePattern}
                        id="shell-mobile-nav"
                        triggerLabel={dictionary.navigation.showSidebar}
                        className="md:hidden"
                        closeLabel={dictionary.navigation.hideSidebar}
                        // P5-5/P6-1 — the sidebar disclosure content is configured by
                        // `ui.navigation.sidebar` (icon asset + visible text). Icons are
                        // screened against public/assets here (the framework boundary) so
                        // the DOM never contains a broken-image element.
                        open={{
                            icon: availableIconName(resolved.navigation.sidebar.open.icon),
                            text: resolved.navigation.sidebar.open.text,
                        }}
                        close={{
                            icon: availableIconName(resolved.navigation.sidebar.close.icon),
                            text: resolved.navigation.sidebar.close.text,
                        }}
                    >
                        {mobileNavListElement}
                    </ShellMobileNav>
                ) : null}
            </div>
        </header>
    );
}