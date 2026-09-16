import Link from "next/link";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { siteConfig } from "@/config";
import { assetPathFromUrl, availableFooterGraphicPath } from "@/config/assets";
import { getDictionary } from "@/config/i18n";
import type { DirectionLinkResolver } from "@/application/direction-link";
import { legalLabel, resolveLegalDocs } from "@/core/legal";
import { BusinessInfo } from "./business-info";
import { connectMethodLabel } from "./connect-method-label";
import { connectivityIcon, socialConnectivityLinks } from "./connectivity-links";
import { ContextConnectHeading } from "./context-connect-heading";
import { ContextNavLinks, type ContextNavLink } from "./context-nav-links";
import { FooterGraphic } from "./footer-graphic";
import { navItemKey } from "./nav-links";

interface SiteFooterProps {
    readonly locale: string;
    /** Provider-resolved direction link resolver (composed at the app boundary). */
    readonly directionLinkResolver: DirectionLinkResolver;
}

export async function SiteFooter({ locale, directionLinkResolver }: SiteFooterProps) {
    const dictionary = getDictionary(locale);
    // Phase K: the legacy global footer NAP is suppressed when operating
    // regions are configured — regional pages expose their own region's
    // identity, and the global block must never leak into them.
    const hasRegions = Object.keys(siteConfig.regions).length > 0;

    // Legal documents: exposed only at the intersection of the `legal[]`
    // config block and canonical (default-locale) content. Resolved with the
    // same content repository used everywhere else.
    const legalRepository = createFileSystemPageContentRepository({
        defaultLocale: siteConfig.defaultLocale,
        collection: "legal",
    });
    const canonicalLegalSlugs = await legalRepository.listSlugs(siteConfig.defaultLocale);
    const legalLinks = resolveLegalDocs(siteConfig.legal, canonicalLegalSlugs);

    // P5-6 — the footer nav list uses the same position-derived identity as the
    // header/aside/disclosure so duplicate destinations keep distinct React
    // identity everywhere (`href` is a destination, not an identity).
    const navLinks: readonly ContextNavLink[] = siteConfig.navigation.map((item, index) => ({
        href: item.href,
        key: navItemKey(index),
        label: dictionary.navigation.items[item.href] ?? item.label,
    }));

    // Phase M refinement — the footer Connect section is a pure gateway:
    //  - the section HEADING is the Connect-page link (ContextConnectHeading,
    //    resolved by the same URL-authoritative core resolver the header uses);
    //  - beneath it sit ONLY the configured connection methods (localized via
    //    the same connectMethodLabel helper the Connect page uses), so there is
    //    no duplicate Connect item and no separate Contact item — Message Us
    //    (the `/contact` method) is the single message-form action;
    //  - methods are region-aware: an internal one (`/contact`) is only shown
    //    where the (locale, region) context actually has it; external deep
    //    links (mailto/tel/https/viber) never reset locale or location.
    const methodLinks: readonly ContextNavLink[] = (siteConfig.connect?.methods ?? []).map(
        (method) => ({
            href: method.href,
            label: connectMethodLabel(dictionary, method),
            key: method.id,
            demoOnly: method.demoOnly,
            // CONNECTIVITY ICON SEAM — the optional supplementary icon goes
            // through the ONE connectivity screening point (`connectivityIcon`,
            // the same P6-1 boundary rule every configured icon leaf obeys):
            // absent → undefined (no icon), configured-but-unavailable → ""
            // (no icon, never a broken <img>). The method renders as an
            // authoritative text link either way.
            icon: connectivityIcon(method.icon),
        }),
    );

    // CONNECTIVITY ICON SEAM — social/profile destinations. These are
    // connectivity items like any other, so they render through the SAME shared
    // link path (`ContextNavLinks` → `NavItem`) as the connection methods: one
    // link semantic (external → new tab + `rel="noreferrer"`), one React
    // identity rule (the configured `platform`) and one decorative icon node —
    // no second renderer and no platform-specific branch.
    const socialLinks: readonly ContextNavLink[] = socialConnectivityLinks(
        siteConfig.socialLinks,
    );

    // P12-FG — the optional DECORATIVE footer graphic (`site.assets.footerGraphic`,
    // the `footer-graphic` role). Resolved through the SAME generic availability
    // rule as the banner/background roles, so configured-but-missing (or absent)
    // yields `undefined` → no layer is rendered at all.
    const footerGraphic = availableFooterGraphicPath(siteConfig.assets?.footerGraphic);

    return (
        <footer className="relative isolate mt-16 border-t border-border">
            {/* P12-FG — the optional decorative footer graphic / watermark. See
                `footer-graphic.tsx` for the full decorative-only contract. Nothing
                is rendered when no asset is configured (or the configured file is
                missing), so the footer's existing layout is unchanged. It is NOT
                the footer logo — that stays the independent `logoFooter` mark below.
                A CSS `background-image` bypasses the Next image optimizer (as the
                P12-BG page background does); it is a static decorative layer. */}
            <FooterGraphic src={footerGraphic} />
            {/* D2 footer robustness (reusable): `break-words` (overflow-wrap) on
                the grid lets any legitimate long unbreakable string — a long
                email address, phone, nav label, or business name — wrap within
                its column instead of overflowing into an adjacent one or forcing
                horizontal page scroll. `overflow-wrap: break-word` only breaks
                mid-word when a token would otherwise overflow, so normal text is
                unaffected. Combined with `lg:col-span-4` below so the copyright
                spans the full width as a coherent single line on desktop. */}
            <div className="mx-auto grid max-w-page break-words gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
                {hasRegions ? null : (
                    <BusinessInfo locale={locale} directionLinkResolver={directionLinkResolver} />
                )}

                <div>
                    <ContextConnectHeading
                        locale={locale}
                        label={dictionary.sections.connect}
                    />

                    <ContextNavLinks
                        locale={locale}
                        links={methodLinks}
                        className="mt-3 space-y-2"
                        linkClassName="hover:text-primary"
                        demoBadgeLabel={dictionary.connect.demoBadge}
                    />

                    {/* CONNECTIVITY ICON SEAM — social/profile destinations, in the
                        SAME Connect column, rendered through the shared link +
                        decorative-icon path. Text-only canonical behavior is
                        unchanged (an icon-less item renders exactly the label); a
                        configured icon adds supplementary artwork (`[icon] Label`,
                        1em, `aria-hidden`). An empty `socialLinks` list renders
                        nothing at all — the canonical Foundation's state. */}
                    {socialLinks.length > 0 ? (
                        <ContextNavLinks
                            locale={locale}
                            links={socialLinks}
                            className="mt-3 space-y-2"
                            linkClassName="hover:text-primary"
                        />
                    ) : null}
                </div>

                <nav aria-label={dictionary.navigation.footerLabel}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {dictionary.sections.navigate}
                    </h2>

                    <ContextNavLinks
                        locale={locale}
                        links={navLinks}
                        className="mt-3 space-y-2"
                        linkClassName="hover:text-primary"
                    />
                </nav>

                {legalLinks.length > 0 ? (
                    <nav aria-label={dictionary.legal.heading}>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            {dictionary.legal.heading}
                        </h2>

                        <ul className="mt-3 space-y-2">
                            {legalLinks.map((doc) => (
                                <li key={doc.slug}>
                                    <Link
                                        href={`/${locale}/legal/${doc.slug}`}
                                        className="hover:text-primary"
                                    >
                                        {legalLabel(dictionary.legal.labels, doc)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                ) : null}

                {/* P6-2D — the restrained `logo-footer` brand mark (generic role,
                    `site.assets.logoFooter`). Decorative (alt=""): the adjacent
                    copyright text already carries the accessible site name, so
                    the mark is purely supplementary, never a substitute for
                    text. Absent config → no element (never a broken image).
                    `assetPathFromUrl` re-derives a same-origin path so the
                    rendered <img> always resolves (see title-bar.tsx). */}
                <p className="flex items-center gap-2 self-end text-sm text-muted-foreground sm:justify-end lg:col-span-4 lg:pt-2 lg:justify-start">
                    {siteConfig.assets?.logoFooter ? (
                        // Owner ruling (2026-09) — the footer mark is the SAME
                        // coloured source as the header and renders at the SAME
                        // display size via the one `--ui-logo-display-size` token
                        // (`.ui-site-footer-logo`), never a second hardcoded size.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={assetPathFromUrl(siteConfig.assets.logoFooter)}
                            alt=""
                            aria-hidden="true"
                            className="ui-site-footer-logo"
                        />
                    ) : null}
                    <span className="break-words">
                        &copy; {new Date().getFullYear()} {siteConfig.name}
                    </span>
                </p>
            </div>
        </footer>
    );
}