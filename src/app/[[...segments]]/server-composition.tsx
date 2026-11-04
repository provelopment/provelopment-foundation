/**
 * THE SHARED SERVER RENDER GRAPH, BOUND TO ONE EXPLICIT SpokeRuntimeContext (FOUNDATION-MULTISITE-M13)
 * ====================================================================================================
 *
 *     existing public Next route (page.tsx / layout.tsx)
 *                 │
 *                 ▼   requestPublicDestination()          ← the REQUEST-selected Spoke, at the boundary
 *         ONE explicit SpokeRuntimeContext
 *                 │
 *                 ▼   spokeServerComposition(context)      ← every context-derived fact, built ONCE
 *     page / layout / metadata / static-params composition
 *                 │
 *                 ▼   context.siteConfig · context.resources · context.runtimeAssetNamespaces
 *
 * WHAT CHANGED. The page route and the root layout used to derive their Spoke-specific facts from
 * MODULE-GLOBAL state — the compatibility `siteConfig`, the compatibility `getDictionary`, the
 * compatibility asset resolver in `./assets`. Those facts now come from the context that is being
 * rendered: its configuration, the dictionary access bound to ITS roots
 * (`dictionaryAccessForRuntimeContext`), the asset resolver built from ITS own runtime namespaces
 * (`createRuntimeAssetOwnershipResolver(context.runtimeAssetNamespaces)`) and the page composition bound to
 * ITS authored trees (`context.resources`). Nothing in this module reads a module-global Spoke authority,
 * so TWO contexts can be composed in one process, in any order (A/B/A/B), without influencing each other —
 * proved in `tests/unit/server-composition-context.test.ts`.
 *
 * WHAT DID NOT CHANGE. Every rule, precedence, URL, wording and attribute: content precedence
 * (JSON over Markdown), home-page behaviour, regional namespaces and bindings, dedicated pages, route
 * discovery, `dynamicParams = false`, metadata shape, canonical origins, hreflang, the shell's resolved UI
 * configuration, banner/background/status availability, the icon leaf assertion and the Site-switch
 * destinations. This is a COMPOSITION refactor: the public route is now the compatibility CALLER of the
 * shared renderer, and the renderer takes the context as an argument.
 *
 * SERVER ONLY: the composition reads configuration, dictionaries, pages and asset headers from files, so it
 * must never become reachable from a client chunk. Values handed to CLIENT components stay narrow and
 * serializable (labels, URLs, booleans) — never a context, a resolver, a registry or a filesystem path.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import type { PageSources, ResolvedPage } from "@/adapters/content/page-sources";
import { createPageSources } from "@/adapters/content/page-sources";
import type { PageAvailability } from "@/application/site-switch";
import type { DirectionLinkResolver } from "@/application/direction-link";
import { createPageAvailability } from "@/adapters/content/page-availability";
import { createAnalyticsProvider } from "@/adapters/analytics";
import { createBookingActionResolver } from "@/adapters/booking";
import type { BookingActionResolver } from "@/application/booking-action";
import { createDirectionLinkResolver } from "@/adapters/maps";
import { resolveRegionalPageContext } from "@/application/page-context";
import { siteSwitchOptions } from "@/application/site-switch";
import { ErrorMessagesProvider } from "@/components/site/error-messages-context";
import { ContextNavLinks } from "@/components/site/context-nav-links";
import { StatusGraphicProvider } from "@/components/site/status-graphic-context";
import { StructuredData } from "@/components/site/structured-data";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteNotice } from "@/components/site/site-notice";
import { ShellEngine } from "@/components/shell";
import { SidebarPreferenceBoot } from "@/components/ui/sidebar-preference-boot";
import { PageBanner } from "@/components/site/page-banner";
import { PageBackground } from "@/components/site/page-background";
import { ClientRoutingProvider } from "@/components/site/client-routing-context";
import { buildClientRoutingContext, type ClientRoutingContext } from "@/components/site/client-routing";
import { getSiteNavLinks, withSidebarNavIcons } from "@/components/site/nav-links";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { ResolvedRegionBlock } from "@/components/site/region-block";
import { RegionStructuredData } from "@/components/site/region-structured-data";
import { SafeMarkdownContent } from "@/components/site/safe-markdown-content";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { assertConfiguredCompactLogoAvailableFor, assertConfiguredIconAssetsExistFor } from "@/config/assets";
import type { Dictionary } from "@/config/i18n/dictionary";
import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import { canonicalLocaleTag, localePathKey } from "@/core/efs/locales";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import type { SiteConfig } from "@/config/site-config";
import { effectiveSitePageConfig } from "@/config/site-page-config";
import type { EfsView } from "./efs-request";
import { ShellDocument } from "./efs-shell";
import { shellAddressesForEfsView } from "./efs-shell-addresses";
import { resolveEfsShellInternalDestination } from "./efs-shell-destinations";
import { efsOwnedPrimaryNavigation } from "./efs-shell-nav-ownership";
import type { EfsResolvedNavItem } from "@/components/site/context-nav-links";
import { assetUrl, publicPathBase, publicationOwnedBy } from "@/core/efs/publication";
import { ownerAssetReference, PUBLIC_FACT_KEYS, resolvePublicFacts, type PublicFactState } from "@/core/efs/public-facts";
import type { PropertyLevel } from "@/core/efs/properties";
import { siteDescriptionForLocale } from "@/config/site-metadata";
import { spokeSwitcherForRenderingSpoke } from "@/config/spoke-routing";
import { buildLanguageAlternates, type LanguageAlternateLocale } from "@/core/locale";
import { resolveSiteNotice } from "@/core/notice";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { isUnlistedPage } from "@/core/page-document";
import { legalPageRoutePath } from "@/core/legal";
import { classifyAuthorUrl } from "@/core/safe-url";
import { pageRoutePathSegments } from "@/core/page-route-path";
import {
  bindingsForSite,
  buildRegionalLanguageAlternates,
  configuredRegionIds,
  hasPageEntry,
  regionalPath,
  regionsForLocale,
  resolveLocaleDestination,
} from "@/core/regional-pages";
import { buildOpenGraphData, buildTwitterData, resolveOgImageUrl } from "@/core/seo-metadata";
import {
  pathContextOr,
  resolveSiteRequest,
  siteHref,
  siteLocalePath,
  sitePath,
  sitePrefixPath,
  siteSetOf,
  type ResolvedSite,
  type SiteRequest,
  type SiteSet,
} from "@/core/site";

/**
 * R1 — ONE OPTIONAL DICTIONARY SECTION, REQUIRED HERE.
 *
 * The build's locks (`@/config/runtime-dictionaries` → `assertSiteNoticeCopyPresent`,
 * `assertSpokeSwitcherLabelPresent`) guarantee that a Spoke presenting a notice, and an Installation
 * authoring a switcher, resolve that copy for every locale they serve — so a VALID build always finds it. This
 * converts that invariant into a typed non-optional value and makes a bypassed lock a LOUD internal error
 * instead of an unnamed control or a blank notice.
 *
 * IT IS DEFINED LOCALLY ON PURPOSE. `@/config/i18n`'s `requireDictionarySection` is the same rule, but that
 * module's body constructs the compatibility dictionary binding at import time — which is exactly the
 * process-global Spoke authority this composition exists to avoid (a multi-Spoke build must compose two
 * contexts in one process, A/B/A/B, without either influencing the other). The rule is three lines of typing,
 * not a second dictionary authority.
 */
function requiredSection<T extends keyof Dictionary>(
  dictionary: Dictionary,
  section: T,
): NonNullable<Dictionary[T]> {
  const value = dictionary[section];
  if (!value) {
    throw new Error(
      `R1: the dictionary section "${String(section)}" is missing; the build's feature lock should have ` +
        "refused this deployment at configuration time.",
    );
  }
  return value as NonNullable<Dictionary[T]>;
}

/**
 * EVERY CONTEXT-DERIVED FACT THE SERVER GRAPH NEEDS, built ONCE per composition.
 *
 * The whole point of the bundle is that the CONTEXT is chosen once (at the route boundary) and every
 * context-dependent answer below — configuration, sites, page composition, dictionary access, asset
 * resolver, direction links, resolved UI — is derived from it exactly once, so a request cannot mix facts
 * from two Spokes, and a layout and its page (which share one composition) cannot disagree.
 */
export interface SpokeServerComposition {
  readonly context: SpokeRuntimeContext;
  readonly siteConfig: SiteConfig;
  readonly siteSet: SiteSet;
  readonly routes: PageSources;
  readonly availability: PageAvailability;
  readonly dictionaries: RuntimeDictionaryAccess;
  readonly assets: RuntimeAssetOwnershipResolver;
  readonly directionLinks: DirectionLinkResolver;
  readonly bookingActions: BookingActionResolver;
  readonly resolvedUi: ResolvedUiConfig;
  /** M14 — the CLIENT-safe routing projection of THIS Spoke, for the controls that resolve destinations. */
  readonly clientRouting: ClientRoutingContext;
  /**
   * `D40` Decision C (`R04-C31`) — the ONE resolved EFS brand-logo address for the shell, already a
   * same-origin `owner-assets` path. Absent means the shell publishes no logo from either source, so the
   * header keeps its existing text brand link. A non-EFS composition never sets it, so its header path is
   * exactly what it was.
   */
  readonly brandLogo?: string;
}

/**
 * Compose ONE explicit runtime context into everything the server render graph reads.
 *
 * Four bindings are the milestone, and each is bound to THIS context alone:
 *
 *   page sources      `createPageSources({ sites, roots: context.resources })` — the context's OWN
 *                     authored trees, so content roots are never rediscovered and never global;
 *   page availability the same composition (through the accepted port), so a Site-switch decision for
 *                     this context can never be answered out of another context's pages;
 *   dictionaries      `dictionaryAccessForRuntimeContext(context)` — the context-bound access (M13 uses
 *                     no compatibility `getDictionary` in the shared renderer);
 *   assets            `createRuntimeAssetOwnershipResolver(context.runtimeAssetNamespaces)` plus the SAME
 *                     icon-leaf assertion, asked of THAT resolver (one rule, one diagnostic).
 *
 * The UI configuration and the direction-link resolver are the accepted functions of the context's own
 * configuration. Nothing here selects a Spoke, remembers one, or reads a module-global authority.
 */
export function spokeServerComposition(
  context: SpokeRuntimeContext,
  presentation?: {
    readonly siteConfig?: SiteConfig;
    readonly siteSet?: SiteSet;
    /** `D40` Decision C — the EFS shell's one resolved brand logo, when the EFS path supplies one. */
    readonly brandLogo?: string;
  },
): SpokeServerComposition {
  const siteConfig = presentation?.siteConfig ?? context.siteConfig;
  const siteSet = presentation?.siteSet ?? siteSetOf(siteConfig.sites, siteConfig.defaultSite);

  // P6-1 — every configured UI icon leaf must be backed by a real file (or deliberately ""), judged
  // against the runtime namespaces THIS context resolves artwork from. Loud at composition time
  // (server-only), so a missing icon can never become a broken-image placeholder — and a context can
  // never be validated against another context's artwork.
  const assets = createRuntimeAssetOwnershipResolver(context.runtimeAssetNamespaces);
  assertConfiguredIconAssetsExistFor(assets, siteConfig);
  // FOUNDATION-UI-R1F — …and the OPTIONAL compact header logo gets the same treatment for the reason it exists:
  // it is only ever SERVED (never authored) through a runtime namespace, so a configured compact asset that this
  // context cannot serve is a build-time error rather than a broken responsive image at the 600px boundary.
  // Asked of THAT resolver, exactly like the icon rule above, so a Spoke can only ever be judged by the artwork
  // it may serve — never by another Spoke's private namespace.
  assertConfiguredCompactLogoAvailableFor(assets, siteConfig);

  return {
    context,
    siteConfig,
    siteSet,
    routes: createPageSources({ sites: siteConfig.sites, roots: context.resources }),
    availability: createPageAvailability({ sites: siteConfig.sites, roots: context.resources }),
    dictionaries: dictionaryAccessForRuntimeContext(context),
    assets,
    directionLinks: createDirectionLinkResolver(siteConfig.mapsFeature),
    bookingActions: createBookingActionResolver(siteConfig.bookingFeature),
    resolvedUi: resolveUiConfig(siteConfig.ui ?? {}),
    // M14 — ONE client-safe projection per composition: the four routing controls read it through the ONE
    // transport, so no client can reach a configuration module and no placement can use a different source.
    clientRouting: buildClientRoutingContext(siteConfig, siteSet),
    // `D40` Decision C — carried through, never re-derived downstream: the header renders THE answer this
    // composition was given (or nothing), so a second logo decision cannot appear later in the graph.
    ...(presentation?.brandLogo === undefined ? {} : { brandLogo: presentation.brandLogo }),
  };
}

/** The site context this URL names, or `null` when it names no site at all. */
function requestOf(
  composition: SpokeServerComposition,
  segments: readonly string[] | undefined,
): SiteRequest | null {
  return resolveSiteRequest(composition.siteSet, segments ?? []);
}

/** The region namespace this route path enters, with its page slug, or `null`. */
function regionContextOf(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  locale: string,
  routePath: string,
): { readonly region: string; readonly slug: string | null } | null {
  const bindings = bindingsForSite(composition.siteConfig.pageBindings, site.code);
  const segments = pageRoutePathSegments(routePath);
  const first = segments[0];
  if (first === undefined || !regionsForLocale(bindings, locale).includes(first)) return null;

  if (segments.length === 1) return { region: first, slug: null };
  if (segments.length === 2 && hasPageEntry(bindings, locale, first, segments[1] as string)) {
    return { region: first, slug: segments[1] as string };
  }
  return null;
}

/** Whether the route path ENTERS a region namespace (which must then resolve completely). */
function entersRegionNamespace(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  locale: string,
  routePath: string,
): boolean {
  const bindings = bindingsForSite(composition.siteConfig.pageBindings, site.code);
  const first = pageRoutePathSegments(routePath)[0];
  return first !== undefined && regionsForLocale(bindings, locale).includes(first);
}

/** The authored page's frame: a Markdown body under its title, or a declarative document. */
function authoredContent(page: ResolvedPage, locale: string) {
  return page.kind === "markdown" ? (
    <>
      <Heading level={1} tone="title">
        {page.title}
      </Heading>
      <div className="mt-6">
        <SafeMarkdownContent markdown={page.body} />
      </div>
    </>
  ) : (
    // The JSON authoring mode's ONE render entry: a validated declarative document becomes a
    // page through the composer, which owns the h1 and the section vocabulary. The route never
    // switches on a section type itself.
    <PageDocumentContent document={page.document} locale={locale} />
  );
}

import {
  DEFAULT_SIDEBAR_CLOSE_ICON,
  DEFAULT_SIDEBAR_OPEN_ICON,
  bottomBarCompositions,
  layoutDataAttributes,
  mobileDisclosureCompositions,
  presentationDataAttributes,
  radiusDataAttribute,
  railCompositions,
  resolveUiConfig,
  type ResolvedUiConfig,
} from "@/core/ui";
import {
  ConnectPageContent,
  CONNECT_PAGE_ROUTE_PATH,
  ContactPageContent,
  StarterHome,
} from "./dedicated-pages";


/** URLs whose chrome is specialised (`./dedicated-pages`). The Connect leaf is named ONCE, there, so the
 * legacy dispatch and the EFS Connect adapter (`./efs-connect`) cannot drift apart. */
const CONNECT_ROUTE_PATH = CONNECT_PAGE_ROUTE_PATH;
const CONTACT_ROUTE_PATH = "contact";

/**
 * Every (site, locale, route) the build discovered, as ONE static-parameter list — the same inventory the
 * sitemap uses, so the two cannot disagree about what exists. Derived from the CONTEXT: its sites, its
 * locale policies, its page bindings and its own authored trees. Multi-Spoke multiplication by runtime
 * segment is deliberately absent — that is later milestone work, and this helper assumes neither Foundation
 * nor a global SiteConfig.
 */
export async function staticParamsForContext(
  composition: SpokeServerComposition,
): Promise<{ segments: string[] }[]> {
  const { siteConfig, routes } = composition;
  const params: { segments: string[] }[] = [];
  const seen = new Set<string>();
  const add = (segments: readonly string[]): void => {
    const key = segments.join("/");
    if (seen.has(key)) return;
    seen.add(key);
    params.push({ segments: [...segments] });
  };

  for (const site of siteConfig.sites) {
    // The site CODE is the URL's first segment, always — there is no hidden default site.
    const scope = [site.code];
    const bindings = bindingsForSite(siteConfig.pageBindings, site.code);

    for (const locale of site.locales.map((entry) => entry.path)) {
      // The locale root is always generated: a site either authored its home page or keeps the
      // generic starter homepage, so that URL exists either way.
      add([...scope, locale]);

      const regionalLandings = regionsForLocale(bindings, locale);
      for (const routePath of await routes.listRoutes(site.code, locale)) {
        const segments = pageRoutePathSegments(routePath);
        if (segments.length === 0) continue;
        const first = segments[0] as string;
        // The home page is served at the locale root, never at `/{locale}/home`.
        if (segments.length === 1 && first === HOME_CONTENT_SLUG) continue;
        // A region's landing and pages are generated below, with their region.
        if (segments.length === 1 && regionalLandings.includes(first)) continue;
        add([...scope, locale, ...segments]);
      }

      for (const region of regionalLandings) add([...scope, locale, region]);
      for (const binding of bindings) {
        if (binding.locale === locale && binding.slug !== null) {
          add([...scope, locale, binding.region, binding.slug]);
        }
      }
    }
  }

  return params;
}

/**
 * The context's Site locales, as an hreflang alternates map for one route path — PUBLISHED targets only.
 *
 * TEMPLATE-PV-A1 — AN ALTERNATE IS AN ADVERTISEMENT, SO IT MAY NOT NAME AN UNLISTED URL. Both of the Site's
 * inputs to the builder are therefore asked about the representation that would actually answer THEM:
 *
 *   · a locale whose own resolved source declares `visibility: "unlisted"` is not offered as an alternate;
 *   · the default locale is offered as `x-default` only while its own target is published, which is what keeps
 *     an unlisted default-language representation out of `x-default`;
 *   · a locale with NO representation of its own, a Markdown representation and a document that declares
 *     nothing are all KEPT, exactly as before: this removes a genuinely unlisted target and nothing else, so
 *     every previously published alternate is byte-identical.
 *
 * Only the locale SET is filtered here. The URL spelling, the canonical tags, the Site prefix and the ordering
 * of the map remain the builder's, so no tagging and no URL construction moved into this file.
 */
async function siteAlternates(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  routePath = "",
): Promise<Record<string, string>> {
  // A locale ROOT's URL carries no route path, but the document that answers it is the RESERVED home document
  // (`pageForContext` resolves `HOME_CONTENT_SLUG` for `""`), so that is the representation every root alternate
  // is asked about — the binding says WHICH document answers a URL, never a URL read back apart.
  const contentRoutePath = routePath === "" ? HOME_CONTENT_SLUG : routePath;
  return buildLanguageAlternates({
    baseUrl: composition.siteConfig.url,
    locales: await publishedLocales(composition, site, site.locales, () => contentRoutePath),
    defaultLocale: await publishedDefaultLocale(composition, site, () => contentRoutePath),
    path: routePath === "" ? "" : `/${routePath}`,
    sitePrefix: sitePrefixPath(site),
  });
}

/**
 * WHETHER ONE LOCALE OFFERS A PUBLISHED TARGET (TEMPLATE-PV-A1)
 * =============================================================
 *
 * The ONE question both alternate builders ask about a locale. A target with NO destination at all (`null` — a
 * regional counterpart this locale does not configure) is not offered, exactly as before; a target whose own
 * resolved source declares `unlisted` is not offered either, because an hreflang alternate is an ADVERTISEMENT
 * and no advertisement may name an unlisted URL. Everything else is offered, so a locale whose representation
 * is missing, Markdown, or silent about visibility keeps the alternate it has always had.
 */
async function offersPublishedTarget(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  localePath: string,
  targetRoutePath: string | null,
): Promise<boolean> {
  if (targetRoutePath === null) return false;
  return !(await composition.routes.isUnlistedRoute(site.code, targetRoutePath, localePath));
}

/** The Site's locales that offer a published target, in configuration order. */
async function publishedLocales(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  locales: readonly LanguageAlternateLocale[],
  routePathOf: (localePath: string) => string | null,
): Promise<readonly LanguageAlternateLocale[]> {
  const kept: LanguageAlternateLocale[] = [];
  for (const entry of locales) {
    if (await offersPublishedTarget(composition, site, entry.path, routePathOf(entry.path))) {
      kept.push(entry);
    }
  }
  return kept;
}

/** The Site's default locale while ITS target is published, else `undefined` — so no `x-default` either. */
async function publishedDefaultLocale(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  routePathOf: (localePath: string) => string | null,
): Promise<string | undefined> {
  const published = await offersPublishedTarget(
    composition,
    site,
    site.defaultLocale,
    routePathOf(site.defaultLocale),
  );
  return published ? site.defaultLocale : undefined;
}

/**
 * THE REGIONAL ALTERNATES, judged by the DESTINATION each locale would be sent to (TEMPLATE-PV-A1)
 * ==============================================================================================
 *
 * Switching language on a regional page preserves the region, so a locale's alternate is the URL the language
 * switcher would actually follow — `resolveLocaleDestination`, the very one the switcher uses. Each locale is
 * therefore judged by ITS OWN destination rather than by the current page's route path, and the SAME builder
 * still spells every URL and tag.
 */
async function regionalAlternates(
  composition: SpokeServerComposition,
  site: ResolvedSite,
  regional: { readonly region: string; readonly slug: string | null },
): Promise<Record<string, string>> {
  const entries = bindingsForSite(composition.siteConfig.pageBindings, site.code);
  const routePathOf = (localePath: string): string | null => {
    const destination = resolveLocaleDestination(entries, localePath, regional.region, regional.slug);
    if (destination === null) return null;
    // A region's namespace is a FOLDER in the authored tree: a landing is `<region>`, a page is `<region>/<slug>`.
    return destination.slug === null ? destination.region : `${destination.region}/${destination.slug}`;
  };

  return buildRegionalLanguageAlternates({
    baseUrl: composition.siteConfig.url,
    locales: await publishedLocales(composition, site, site.locales, routePathOf),
    defaultLocale: await publishedDefaultLocale(composition, site, routePathOf),
    entries,
    region: regional.region,
    slug: regional.slug,
    sitePrefix: sitePrefixPath(site),
  });
}

/**
 * THE ONE ROBOTS RULE FOR A PAGE'S OWN PUBLICATION (TEMPLATE-PV-A1)
 * ================================================================
 *
 * A page its OWN document publishes as `unlisted` is directly reachable at its exact URL and must not be
 * indexed, so ITS OWN response says so — through the same Next metadata surface the platform's not-found page
 * already uses, rendered as `<meta name="robots" content="noindex, nofollow">`.
 *
 * A PUBLIC page — including every page that declares nothing, and every Markdown page, which has no visibility
 * vocabulary at all — gets an EMPTY object: nothing is added and nothing is overridden, so the metadata it has
 * always had is unchanged.
 *
 * The DECISION is read from the RESOLVED page, never from a raw file, so it follows the ONE authority that
 * decided which source answers this request: JSON over Markdown, and the Site's own locale fallback.
 *
 * `robots.txt` is deliberately NOT part of this rule: it cannot express a per-URL decision, and a global
 * `disallow` would have to name the very URL an author asked to keep out of discovery. The crawl rules stay
 * exactly as they are (`./robots-context`), and an unlisted URL is never advertised there either.
 */
function robotsForVisibility(page: ResolvedPage | null): Pick<Metadata, "robots"> {
  return page !== null && page.kind === "json" && isUnlistedPage(page.document)
    ? { robots: { index: false, follow: false } }
    : {};
}

/**
 * The page's metadata, composed from the SUPPLIED context: canonical origin, site name, localized site
 * descriptions, hreflang alternates, OpenGraph/Twitter metadata, the OG-image URL and the regional canonical
 * URL all belong to the context being rendered — never to a module-global configuration. The output for the
 * current production Foundation is unchanged (proved by the existing metadata/route tests plus the
 * production regression).
 */
export async function pageMetadataForContext(
  composition: SpokeServerComposition,
  segments: readonly string[] | undefined,
): Promise<Metadata> {
  const request = requestOf(composition, segments);
  if (request === null) return {};

  const siteConfig = composition.siteConfig;
  const { site, locale: localeTag, localePath: locale, routePath } = request;
  // S1E3 — the generated OG image is served at the SITE + LOCALE segments this page URL carries,
  // so its URL is built by the site path helper (`/<site>/<locale>/opengraph-image`) instead of a
  // locale-only concatenation that would 404.
  const ogImage = resolveOgImageUrl(
    siteConfig.assets?.ogImage,
    siteConfig.url,
    sitePath(site, locale, "opengraph-image") ?? siteLocalePath(site, locale),
  );
  // The OG locale/alternate locales are STANDARDS tags (`fr-CA`), unlike the URL segment.
  const alternateLocales = site.locales
    .filter((entry) => entry.path !== locale)
    .map((entry) => entry.canonical);

  // The locale root: the site's own name and description, whatever answers the page itself.
  if (routePath === "") {
    const canonical = sitePath(site, locale) as string;
    // R1B — the locale's OWN words for this locale's root (else the deployment's
    // `site.description`): no page-level summary speaks for the locale root, so the
    // site speaks for it, in the locale it is being served in.
    const description = siteDescriptionForLocale(siteConfig, locale);
    return {
      // TEMPLATE-PV-A1 — A LOCALE ROOT IS PUBLIC BY CONSTRUCTION. The document that answers it is the RESERVED
      // home document, which is refused outright if it declares `unlisted` (`@/core/page-document`), so this
      // response gains no `robots` property and its metadata is exactly what it was. Each root alternate is still
      // asked about the home document that would answer IT, so no alternate can name an unlisted URL.
      description,
      alternates: { canonical, languages: await siteAlternates(composition, site) },
      openGraph: buildOpenGraphData({
        baseUrl: siteConfig.url,
        siteName: siteConfig.name,
        locale: localeTag,
        title: siteConfig.name,
        fallbackDescription: description,
        url: canonical,
        imageUrl: ogImage,
        alternateLocales,
      }),
      twitter: buildTwitterData({
        title: siteConfig.name,
        fallbackDescription: description,
        imageUrl: ogImage,
      }),
    };
  }

  // A page: its OWN title and (optional) summary decide the metadata.
  const page = await composition.routes.resolve(site.code, routePath, locale);
  if (!page) return {};

  const regional = regionContextOf(composition, site, locale, routePath);
  const canonical = regional
    ? `${siteConfig.url}${regionalPath(locale, regional.region, regional.slug, sitePrefixPath(site))}`
    : `${siteConfig.url}${sitePath(site, locale, routePath) as string}`;
  // TEMPLATE-PV-A1 — both builders are handed only the locales whose target PUBLISHES itself, so an hreflang
  // link can never name an unlisted URL. The URL spelling and the tagging stay theirs.
  const alternates = regional
    ? await regionalAlternates(composition, site, regional)
    : await siteAlternates(composition, site, routePath);

  // R1B — a page without its own summary falls back to the SITE's description IN THIS
  // LOCALE, never to the deployment's default-language sentence.
  const siteDescription = siteDescriptionForLocale(siteConfig, locale);
  return {
    // TEMPLATE-PV-A1 — this page's OWN publication decision, taken from the source that actually answers this
    // request. A public page spreads NOTHING, so its metadata is exactly what it was before.
    ...robotsForVisibility(page),
    title: page.title,
    description: page.description ?? siteDescription,
    alternates: {
      canonical,
      languages: Object.keys(alternates).length > 0 ? alternates : undefined,
    },
    openGraph: buildOpenGraphData({
      baseUrl: siteConfig.url,
      siteName: siteConfig.name,
      locale: localeTag,
      title: page.title,
      fallbackDescription: siteDescription,
      url: canonical,
      imageUrl: ogImage,
      alternateLocales,
    }),
    twitter: buildTwitterData({
      title: page.title,
      fallbackDescription: siteDescription,
      imageUrl: ogImage,
    }),
  };
}

/**
 * THE PAGE, for ONE explicit context. A path that names no site (or a locale that site does not serve) is
 * not a page: the ONE resolver answers `null`, so the request becomes a 404 — never a guess, never another
 * site. Region namespaces, the home page, the two specialised URLs and regional pages behave exactly as they
 * did, on the context's own configuration and its own page tree.
 */
export async function pageForContext(
  composition: SpokeServerComposition,
  segments: readonly string[] | undefined,
): Promise<ReactNode> {
  const routes = composition.routes;
  const siteConfig = composition.siteConfig;
  const request = requestOf(composition, segments);
  if (request === null) notFound();

  const { site, localePath: locale, routePath } = request;

  // A URL inside a region's namespace is either the landing or a configured regional page:
  // anything else must not render a page without its region's identity.
  const regional = regionContextOf(composition, site, locale, routePath);
  if (entersRegionNamespace(composition, site, locale, routePath) && regional === null) notFound();

  // The locale root: an authored home page (either mode) or the generic starter homepage.
  if (routePath === "") {
    const authoredHome = await routes.resolve(site.code, HOME_CONTENT_SLUG, locale);
    return authoredHome ? (
      <Section as="article">{authoredContent(authoredHome, locale)}</Section>
    ) : (
      <StarterHome
        locale={locale}
        siteId={site.code}
        siteConfig={siteConfig}
        dictionaryAccess={composition.dictionaries}
        bookingActions={composition.bookingActions}
      />
    );
  }

  const page = await routes.resolve(site.code, routePath, locale);
  if (!page) notFound();

  // The two URLs with specialised chrome; their SOURCE is an ordinary page.
  if (routePath === CONNECT_ROUTE_PATH)
    return (
      <ConnectPageContent
        locale={locale}
        page={page}
        siteId={site.code}
        siteConfig={siteConfig}
        dictionaryAccess={composition.dictionaries}
        assets={composition.assets}
      />
    );
  if (routePath === CONTACT_ROUTE_PATH)
    return (
      <ContactPageContent
        locale={locale}
        page={page}
        siteId={site.code}
        siteConfig={siteConfig}
        dictionaryAccess={composition.dictionaries}
        assets={composition.assets}
      />
    );

  const regionContext = resolveRegionalPageContext(
    { regions: siteConfig.regions },
    locale,
    regional?.region ?? null,
    regional?.slug ?? null,
  );

  return (
    <Section as="article">
      {authoredContent(page, locale)}

      {regionContext.region && regional ? (
        <>
          <ResolvedRegionBlock
            region={regionContext.region}
            locale={locale}
            siteId={site.code}
            directionLinkResolver={composition.directionLinks}
            dictionary={composition.dictionaries.get(locale, site.code)}
          />
          <RegionStructuredData
            region={regionContext.region}
            canonicalUrl={`${siteConfig.url}${regionalPath(
              locale,
              regional.region,
              regional.slug,
              sitePrefixPath(site),
            )}`}
            socialLinks={siteConfig.socialLinks}
          />
        </>
      ) : null}
    </Section>
  );
}

/**
 * The ROOT LAYOUT's metadata, from the SUPPLIED context: `metadataBase`, the site-name title template and
 * localized description, OpenGraph/Twitter basics, the favicon URL and the site's own hreflang alternates.
 * For the current production Foundation the output is identical to the compatibility layout's.
 */
export async function layoutMetadataForContext(
  composition: SpokeServerComposition,
  segments: readonly string[] | undefined,
): Promise<Metadata> {
  const siteConfig = composition.siteConfig;
  const request = pathContextOr(
    composition.siteSet,
    siteConfig.pageBindings,
    `/${(segments ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteDescriptionForLocale(siteConfig, request.localePath),
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      ...(siteConfig.assets?.ogImage ? { images: [{ url: siteConfig.assets.ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(siteConfig.assets?.ogImage ? { images: [siteConfig.assets.ogImage] } : {}),
    },
    icons: {
      // P6-3B — SINGLE authoritative favicon declaration, resolved through THIS context's asset resolver
      // (so a Spoke's own replaceable favicon is served from that Spoke's namespace) — server-only, and
      // the same answer the compatibility resolver gave for the current build.
      icon: composition.assets.runtimeAssetUrl(siteConfig.assets?.favicon),
    },
    alternates: {
      // S1 — alternates cover THIS site's locales, under the site's own public prefix, so an
      // hreflang link can never point at another site's tree.
      languages: buildLanguageAlternates({
        baseUrl: siteConfig.url,
        locales: request.site.locales,
        defaultLocale: request.site.defaultLocale,
        sitePrefix: sitePrefixPath(request.site),
      }),
    },
  };
}

/**
 * THE DOCUMENT, for ONE explicit context. Every Spoke-specific derived value — the site set, the resolved UI
 * configuration, the configured-icon assertion, the analytics provider, the direction-link resolver, the
 * dictionary, the navigation, the banner/background/status availability and the Site-switch destinations —
 * is derived from the supplied context, so the chrome a visitor sees belongs to exactly one Spoke.
 *
 * `htmlClassName` is the caller's static platform fact (the brand/monospace font variables): static platform
 * values stay module-level in `layout.tsx` and are never turned into request state.
 */
export async function layoutForContext(
  composition: SpokeServerComposition,
  segments: readonly string[] | undefined,
  children: ReactNode,
  htmlClassName: string,
): Promise<ReactNode> {
  const siteConfig = composition.siteConfig;
  const resolvedUi = composition.resolvedUi;
  const assets = composition.assets;
  const directionLinkResolver = composition.directionLinks;

  // The URL decides the site and the locale; an unknown path falls back to the DEFAULT site
  // deterministically (the page below turns it into a 404, so the status page still renders
  // inside the site chrome).
  const request = pathContextOr(
    composition.siteSet,
    siteConfig.pageBindings,
    `/${(segments ?? []).join("/")}`,
    siteConfig.defaultSite.defaultLocale,
  );
  const site = request.site;
  // The chrome works in the locale PATH KEY: it names the content directory (`ca/fr`), the
  // dictionary entry and every URL this layout builds.
  const locale = request.localePath;
  // S1E3 — the shell CTA's DESTINATION belongs to the active site's page tree (a site may point it
  // at its own page), while its presentation stays shared `ui.cta` configuration. An internal
  // destination resolves inside the site+locale exactly like any other navigation href, so a
  // shared `/contact` can never link into another site or 404 on its own site.
  const pageConfig = effectiveSitePageConfig(siteConfig, site.code);
  const ctaHrefSource = pageConfig.ctaHref;
  const ctaHref =
    ctaHrefSource === undefined
      ? undefined
      : siteHref(composition.siteSet, site, locale, ctaHrefSource);

  // S1E2 — the STANDARDS-FACING tag for the same locale (`fr-CA` for `/ca/fr`): the document's
  // `lang` and every hreflang alternate identify the language, while the URL stays lowercase.
  const localeTag = request.locale;
  const dictionary = composition.dictionaries.get(locale, site.code);
  const navLinks = getSiteNavLinks({
    locale,
    siteId: site.code,
    siteConfig,
    dictionary: composition.dictionaries,
    iconUrl: assets.availableIconUrl,
  });

  // S1E2 — the Site selector's destinations, resolved ONCE per request by the application rule
  // (same route when the target serves it, else the target's home), against THIS context's own
  // page availability. A deployment with a single site renders no selector and pays nothing.
  const siteSwitch =
    siteConfig.sites.length > 1
      ? await siteSwitchOptions(
          {
            site,
            localePath: request.localePath,
            // The FULL route path: a region's namespace stays part of the page's path.
            routePath: [request.region, request.routePath].filter(Boolean).join("/"),
          },
          {
            sites: siteConfig.sites,
            bindings: siteConfig.pageBindings,
            availability: composition.availability,
          },
        )
      : undefined;

  /**
   * THE NON-ROUTING PRESENTATION FACTS — resolved by ONE function, shared with the EFS entrypoint
   * (`layoutForEfsContext`), so both surfaces present the same graphics, the same inert presentation
   * tokens, the same sidebar geometry, the same rail bridge and the same analytics integration. None of
   * these facts can name a destination, which is exactly why they are safe to share with a path that
   * resolves no URL at all. Sharing the IMPLEMENTATION (not a copy) is what keeps the two surfaces from
   * drifting; see `shellPresentationFacts` for the per-fact rules (all of which are unchanged).
   */
  const {
    sidebarClosed,
    sidebarCompact,
    usesAside,
    usesBottomBar,
    bannerMap,
    regionIds,
    backgroundMap,
    statusGraphic,
    hasRegions,
    analytics,
    sidebarPreferenceBridge,
    htmlStyle,
    htmlPresentationAttrs,
  } = shellPresentationFacts(composition, siteConfig);

  // NAV1B — the sidebar's navigation LIST is needed wherever a sidebar composition presents it:
  // the rail (≥md) AND that composition's constrained-width disclosure. `usesAside` still gates the
  // RAIL itself (and its pre-paint preference bridge), so `navigation.sidebar.mode: "closed"`
  // continues to mean "no persistent rail — the disclosure is how navigation is reached".
  const sidebarNavContent =
    usesAside || mobileDisclosureCompositions(resolvedUi).length > 0 ? (
      <ContextNavLinks
        locale={locale}
        // P6-3B — every SIDEBAR item gets an expanded/collapsed icon pair (the configured
        // `iconOpen`/`iconClosed`, else the shipped dot/plus defaults), resolved against THIS
        // context's own runtime namespaces.
        links={withSidebarNavIcons(navLinks, assets.availableIconUrl)}
        className={`space-y-2 ${sidebarCompact ? "ui-nav-mode-compact" : ""}`}
        linkClassName="text-sm text-muted-foreground transition-colors hover:text-foreground"
        // P5-5 — the aside rail orders by configured region (top → middle →
        // bottom), stable within each group; labels stay readable.
        sortByRegion
      />
    ) : undefined;

  const bottomNav = usesBottomBar
    ? {
        label: dictionary.navigation.primaryLabel,
        // R1 — the retired "More" rule: the bar carries EVERY configured destination (see
        // `shell-bottom-bar.tsx`), so the composer passes no More label and no drawer control content.
        links: navLinks,
        // P5-5 — the bottom navigation shares the same three-state menu
        // contract (open | compact | closed) as the top/sidebar menus.
        mode: resolvedUi.navigation.bottom.mode,
      }
    : undefined;

  // UI1-A2 / FS-5 / P5-3 / P5-5 / N2 — the rail bridge, the `--background` token override and the inert
  // `data-ui-*` surface are all derived in `shellPresentationFacts` (destructured above), so the EFS
  // document emits the byte-identical `<html>` presentation as this one.

  // R1 — THE SWITCHER THE RENDERING SPOKE RECEIVES, resolved ONCE (Web-1 owner requirement 1; the
  // Hub-scoped reader is FOUNDATION-ID-M3-P3 §8). The OPTIONS come from the build's own routing description —
  // the Flat Installation's authored `spokeSwitcher`, or, in an Installation authored with IDENTIFIED Spoke
  // Hubs, the OWNING Hub's own list, every destination already proved routable to the Spoke it names at
  // build time. The MARKED Spoke is THIS context's identity, which the request boundary decided from the
  // hostname. Nothing here infers an order, a label or a Spoke.
  const authoredSpokeSwitcher = spokeSwitcherForRenderingSpoke(composition.context);
  const spokeSwitch =
    authoredSpokeSwitcher === null
      ? undefined
      : {
          current: composition.context.id,
          // The accessible name is the CURRENT LOCALE's dictionary answer; the build refused a build whose
          // Installation authors a switcher without it for a served locale, so this lookup cannot fail in a
          // valid build — and `requireDictionarySection` makes a bypassed lock a loud internal error rather
          // than an unnamed control.
          label: requiredSection(dictionary, "spokeSwitcher").label,
          options: authoredSpokeSwitcher.options,
        };

  // R1 — THE SITE-WIDE NOTICE, resolved by the ONE pure rule from THIS Spoke's authored configuration, with
  // the current locale's wording. The build's copy lock guarantees both fields for a Spoke that PRESENTS the
  // notice; a Spoke that presents none composes nothing at all.
  const siteNotice = resolveSiteNotice(siteConfig.siteNotice);
  const notice =
    siteNotice === null
      ? undefined
      : <SiteNotice notice={siteNotice} copy={requiredSection(dictionary, "siteNotice")} />;

  return (
    <ShellDocument
      mode="legacy"
      localeTag={localeTag}
      locale={locale}
      htmlClassName={htmlClassName}
      htmlStyle={htmlStyle}
      htmlAttributes={htmlPresentationAttrs}
      sidebarPreferenceBridge={sidebarPreferenceBridge}
      skipToContentLabel={dictionary.a11y.skipToContent}
      errorMessages={dictionary.error}
      bannerMap={bannerMap}
      backgroundMap={backgroundMap}
      statusGraphic={statusGraphic}
      regionIds={regionIds}
      notice={notice}
      resolved={resolvedUi}
      mainId="main"
      mainClassName="flex-1"
      navigationLabel={dictionary.navigation.primaryLabel}
      asideContent={sidebarNavContent}
      sidebarLabels={{
        show: dictionary.navigation.showSidebar,
        hide: dictionary.navigation.hideSidebar,
      }}
      sidebarOpen={{
        icon: assets.resolveIconControlUrl(
          resolvedUi.navigation.sidebar.open.icon,
          DEFAULT_SIDEBAR_OPEN_ICON,
        ),
        text: resolvedUi.navigation.sidebar.open.text,
      }}
      sidebarClose={{
        icon: assets.resolveIconControlUrl(
          resolvedUi.navigation.sidebar.close.icon,
          DEFAULT_SIDEBAR_CLOSE_ICON,
        ),
        text: resolvedUi.navigation.sidebar.close.text,
      }}
      bottomNav={bottomNav}
      // M14 — the ONE client transport for this Spoke's routing projection. It is REQUIRED here and
      // IMPOSSIBLE on the EFS surface (see `ShellDocument`'s discriminated props).
      routing={composition.clientRouting}
      pageBindings={siteConfig.pageBindings}
      siteSet={composition.siteSet}
      ctaLabel={resolvedUi.cta.label}
      ctaHref={ctaHref}
      structuredData={hasRegions ? null : <StructuredData locale={locale} siteConfig={siteConfig} />}
      analytics={analytics}
      header={
            <SiteHeader
              locale={locale}
              resolved={resolvedUi}
              siteId={site.code}
              siteSwitch={siteSwitch}
              spokeSwitch={spokeSwitch}
              siteConfig={siteConfig}
              dictionaryAccess={composition.dictionaries}
              assets={assets}
              // `D40` Decision C — the EFS shell's ONE resolved logo, when the EFS path resolved one.
              {...(composition.brandLogo === undefined ? {} : { resolvedLogoSrc: composition.brandLogo })}
            />
          }
          footer={
            <SiteFooter
              locale={locale}
              siteId={site.code}
              directionLinkResolver={directionLinkResolver}
              siteConfig={siteConfig}
              dictionaryAccess={composition.dictionaries}
              assets={assets}
              routes={composition.routes}
            />
          }
        >
          <ErrorMessagesProvider messages={dictionary.error}>
            <StatusGraphicProvider asset={statusGraphic}>{children}</StatusGraphicProvider>
          </ErrorMessagesProvider>
        </ShellDocument>
  );
}

/**
 * How ONE brand/contact fact is applied to the composed presentation configuration
 * (`D40` Decision C, corrected by `GEO-02-R02` C2).
 *
 *   - `set`   — a public EFS declaration supplies the value;
 *   - `clear` — the fact is not publishable, so it is REMOVED and the configured value is refused
 *               with it. This covers privacy, `null` suppression, and a declaration whose value is
 *               not usable — none of which may be filled from configuration;
 *   - `keep`  — nothing is declared at any level, so the configured value stands.
 */
type FactDecision = { readonly kind: "set"; readonly value: string } | { readonly kind: "clear" } | { readonly kind: "keep" };

/**
 * `D40` DECISION C (`R04-C31`) — THE ONE BRAND-LOGO DECISION FOR AN EFS VIEW
 * =========================================================================
 *
 * `brand.logo` is artwork, so the source question and the URL question are answered separately and in this
 * order. The CASCADE decides whether anything may be published at all (`resolvePublicFacts`, the same
 * mechanism `brand.name` and the contact facts already use); `ownerAssetReference` decides whether the
 * declared bytes are owner-bound artwork at all. Both answers are needed before any consumer acts.
 *
 * | cascade state            | publishable? | fallback to configured art? |
 * | ------------------------ | ------------ | --------------------------- |
 * | declared + public        | EFS artwork  | no                          |
 * | declared but REFUSED     | nothing      | no — a declaration owns the slot |
 * | declared but private     | nothing      | no                          |
 * | declared explicit `null` | nothing      | no                          |
 * | absent at every level    | configured artwork, if any | yes           |
 *
 * The configured Spoke logo is therefore reachable ONLY through `absent`. Nothing in this module publishes
 * a URL; it answers the precedence, and each consumer carries the representation it owns.
 */
interface BrandLogoDecision {
  readonly state: PublicFactState;
  readonly originLevel?: PropertyLevel;
  readonly originId?: string;
  /** The owner-bound reference of a publishable declaration, when the value names artwork at all. */
  readonly reference?: string;
}

function brandLogoDecision(view: EfsView): BrandLogoDecision {
  const fact = resolvePublicFacts(view.properties).get("brand.logo");
  const decision: BrandLogoDecision = {
    state: fact.state,
    ...(fact.originLevel === undefined ? {} : { originLevel: fact.originLevel }),
    ...(fact.originId === undefined ? {} : { originId: fact.originId }),
    ...(fact.state === "declared" && ownerAssetReference(fact.value) !== undefined
      ? { reference: ownerAssetReference(fact.value) }
      : {}),
  };
  return decision;
}

/**
 * The shell's ONE resolved brand-logo address: the binding's own `owner-assets` path for a publishable
 * declaration, and `undefined` whenever nothing may be published.
 *
 * It is NOT routed through the runtime asset catalog: that resolver answers for a Spoke's generated
 * namespaces, and a basename it happens to own must never redirect an EFS owner-assets address to itself
 * (`D40` §3.2). A same-origin path is already the correct HTML representation.
 */
export function efsResolvedBrandLogo(view: EfsView): string | undefined {
  const decision = brandLogoDecision(view);
  return decision.reference === undefined ? undefined : assetUrl(view.binding, decision.reference);
}

/**
 * EFS's shared-shell presentation configuration. It keeps the approved visual/navigation/dictionary
 * chrome but makes the EFS representation the ONLY locale authority: every site locale is explicit and
 * canonicalised from its declared tag, while regions, page-region bindings, required-Location policy and
 * legacy business timezone/locations are removed. No Site code, Facet name, Page name or URL prefix can
 * therefore acquire geographic or language meaning on the EFS path.
 */
/**
 * THE INVALID-PRESENTATION REFUSAL (`GEO-04 R13`)
 * ===============================================
 *
 * A publication MAY declare no presentation Site at all — that is the intentional EFS-only document
 * boundary. It may NOT declare a Site the owning Spoke does not declare (including one that names an
 * unrelated EFS Site, or another Spoke's Site): the shared shell would then have to borrow another
 * owner's label, dictionary, logo or address authority, or silently degrade to a chrome-less 200 page.
 *
 * This error carries the claim for server-side diagnosis only. It is never rendered: the document
 * boundary turns it into the sanctioned public not-found response.
 */
export class EfsPresentationRefusal extends Error {
  constructor(
    readonly presentationSiteCode: string,
    readonly spokeId: string,
  ) {
    super(`EFS presentation Site "${presentationSiteCode}" is not declared by Spoke "${spokeId}".`);
    this.name = "EfsPresentationRefusal";
  }
}

/**
 * THE THREE PRESENTATION DECLARATIONS (`GEO-04 R13`)
 * =================================================
 *
 * The publication's `presentationSiteCode` has exactly three meanings, and they are NOT the same:
 *
 *   - `efs-only`   — no code declared. The publication is a legitimate EFS-only document: it borrows no
 *                    chrome, invents no presentation Site, and promises no shared-shell transition. 200.
 *   - `declared`   — a code the owning Spoke actually declares. The shared shell composes from it. 200.
 *   - `invalid`    — a code the owning Spoke does NOT declare (including an unrelated EFS Site, or another
 *                    Spoke's Site). This may never borrow a Site, owner, default or chrome, and may never
 *                    degrade to a chrome-less 200: it REFUSES.
 *
 * The distinction is decided here, once, from the publication and the owning Spoke's own declarations —
 * never from a route, locale, default or guess.
 */
export type EfsPresentationDeclaration =
  | { readonly kind: "efs-only" }
  | { readonly kind: "declared"; readonly code: string }
  | { readonly kind: "invalid"; readonly code: string };

export function efsPresentationDeclaration(
  source: SiteConfig,
  view: EfsView,
): EfsPresentationDeclaration {
  const presentationSiteCode = view.publication.presentationSiteCode;
  if (presentationSiteCode === undefined) return { kind: "efs-only" };
  const declared = source.sites.some((candidate) => candidate.code === presentationSiteCode);
  return declared
    ? { kind: "declared", code: presentationSiteCode }
    : { kind: "invalid", code: presentationSiteCode };
}

export function efsShellPresentationConfig(
  source: SiteConfig,
  view: EfsView,
): SiteConfig | null {
  const declaration = efsPresentationDeclaration(source, view);
  if (declaration.kind === "efs-only") return null;
  if (declaration.kind === "invalid") {
    // An INVALID DECLARATION refuses. The claim stays server-side; the document boundary turns it into the
    // sanctioned public not-found response, so no Site, owner, locale or address is ever borrowed.
    throw new EfsPresentationRefusal(declaration.code, view.publication.spokeId);
  }
  const sourceSite = source.sites.find((candidate) => candidate.code === declaration.code);
  if (!sourceSite) {
    // Unreachable: `declared` was decided from this same list. Kept as a total-function guard.
    throw new EfsPresentationRefusal(declaration.code, view.publication.spokeId);
  }

  const label = view.properties.get("site.label");
  const site: ResolvedSite = {
    ...sourceSite,
    // The Site's CODE remains the owner's configuration identity (its dictionary/presentation
    // source). Its PUBLIC base is the binding's explicit path segments, so a dedicated root, a
    // single prefix and a multi-segment prefix all keep correct URLs without treating either as
    // a country, locale or name.
    code: sourceSite.code,
    publicPathBase: publicPathBase(view.binding, view.site.id),
    label: label?.public && typeof label.value === "string" ? label.value : view.site.id,
    locales: view.binding.locales.map((locale) => ({
      path: localePathKey(locale),
      canonical: canonicalLocaleTag(locale),
    })),
    defaultLocale: localePathKey(view.binding.defaultLocale),
    fallback: true,
    isDefault: true,
    locationSelection: null,
  };
  const overrides = Object.fromEntries(
    Object.entries(source.sitePageOverrides)
      .filter(([code]) => code === sourceSite.code)
      .map(([, value]) => [site.code, value]),
  );

  /**
   * SOURCE PRECEDENCE (`D40` Decision C, corrected by `GEO-02-R02` C1/C2).
   *
   * This is the ONE place the ordering is applied, and it feeds BOTH surfaces: the shared shell
   * (header, footer, contact block) reads this config, and so does the JSON-LD built from it. One
   * resolution, so a contact value can never be displayed and advertised differently.
   *
   * Each fact resolves to exactly one of three decisions:
   *
   *   - SET   — an effective PUBLIC declaration supplies the value;
   *   - CLEAR — the cascade decided the fact is not publishable (private, `null`, or a declared
   *             value that is not a usable string), so the fact is REMOVED and the configuration
   *             fallback is refused with it;
   *   - KEEP  — nothing is declared at any level, so the configuration value stands as-is.
   *
   * `contact.name` deliberately has NO fallback and no consumer here: it is contact-PERSON identity,
   * and promoting it into the business name would relabel the business.
   */
  const facts = resolvePublicFacts(view.properties, {
    "brand.name": source.name,
    "contact.email": source.business.contact.email ?? source.contact.email,
    "contact.phone": source.business.contact.phone ?? source.contact.phone,
  });

  const decisionFor = (key: (typeof PUBLIC_FACT_KEYS)[number]): FactDecision => {
    const fact = facts.get(key);
    switch (fact.state) {
      case "declared":
        // A declaration occupies the precedence slot even when its value is unusable. Typed
        // validation refuses such a value before serving; clearing here keeps the order total and
        // stops it from silently re-opening the configuration fallback.
        return fact.value === undefined ? { kind: "clear" } : { kind: "set", value: fact.value };
      case "private":
      case "suppressed":
        return { kind: "clear" };
      default:
        return { kind: "keep" };
    }
  };

  const withoutFact = <T extends object>(base: T, key: keyof T): T => {
    const rest: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    delete rest[key as string];
    return rest as T;
  };

  const applyTo = <T extends object>(base: T, key: keyof T, decision: FactDecision): T =>
    decision.kind === "set"
      ? { ...base, [key]: decision.value }
      : decision.kind === "clear"
        ? withoutFact(base, key)
        : base;

  /**
   * The shell's own identity name, from `brand.name` only.
   *
   * SET keeps the declaration; KEEP leaves the configured name untouched; CLEAR refuses both the
   * declaration and the configured name, and the shell falls back to the EFS SiteID — the documented
   * consequence of deny-by-default for a DISPLAY property (`GEO-01-R02` §5, as `site.label` already
   * does above). It is never filled with a contact person's name.
   */
  const brandDecision = decisionFor("brand.name");
  const brandName =
    brandDecision.kind === "set"
      ? brandDecision.value
      : brandDecision.kind === "clear"
        ? view.site.id
        : source.name;

  const businessName =
    brandDecision.kind === "set"
      ? brandDecision.value
      : brandDecision.kind === "clear"
        ? view.site.id
        : source.business.name;

  const businessContact = applyTo(
    applyTo(source.business.contact, "email", decisionFor("contact.email")),
    "phone",
    decisionFor("contact.phone"),
  );
  const siteContact = applyTo(
    applyTo(source.contact, "email", decisionFor("contact.email")),
    "phone",
    decisionFor("contact.phone"),
  );

  /**
   * THE BRAND LOGO, PROJECTED ONCE (`D40` Decision C, `R04-C31`).
   *
   * `absent` is the ONLY state that keeps the configured artwork, so this is the ONE place the Spoke's own
   * logo can survive an EFS view. Every other state owns the slot: the configured primary, its compact
   * alternate and the footer artwork are all artwork of a source that has lost precedence or permission, and
   * the legacy `site.logo` is the same artwork under another name, so all four are cleared together. That is
   * what stops the shell from showing one brand and the metadata advertising another.
   *
   * The published EFS address is ABSOLUTE here because this configuration feeds metadata (JSON-LD `logo`),
   * where a canonical URL is the correct form; the shell's `<img>` uses `efsResolvedBrandLogo()` instead,
   * which is the same decision expressed as a same-origin path.
   */
  const logo = brandLogoDecision(view);
  const configuredLogoKept = logo.state === "absent";
  const ownerAssetsLogo =
    logo.reference === undefined ? undefined : assetUrl(view.binding, logo.reference);
  const origin = new URL(view.canonical).origin;

  return {
    ...source,
    url: origin,
    assets: configuredLogoKept
      ? source.assets
      : {
          ...source.assets,
          // Set explicitly in BOTH the published and the blocked case: a blocked declaration must not let the
          // configured primary survive through the spread, and a published one replaces it outright.
          logo: ownerAssetsLogo === undefined ? undefined : `${origin}${ownerAssetsLogo}`,
          logoCompact: undefined,
          logoFooter: undefined,
        },
    logo: configuredLogoKept ? source.logo : undefined,
    sites: [site],
    defaultSite: site,
    hubs: [],
    defaultLocale: site.defaultLocale,
    // A BINDING LOCALE IS QUALIFIED; A SPOKE DICTIONARY KEY IS A LANGUAGE BASE (GEO-04 C09-R12).
    //
    // `localePathKey` yields the canonical QUALIFIED tag (`en-001`, `de-DE`), while a Spoke declares its
    // locales by LANGUAGE BASE (`en`, `de`) and must own a dictionary for each — the Spoke schema
    // refuses a qualified code outright, so this correspondence cannot be authored away on the test
    // side. Comparing the two strings directly matched NOTHING, so the projection was empty for every
    // EFS Site, `siteConfig.locales.length > 1` was never true, and the shared shell could never offer
    // a Language control: the header's contextual row was unreachable. The comparison is now made on
    // the one relation the two authorities actually share — the documented language base
    // (`languageBaseOf`, `config/i18n/registry.ts`: `fr-ca` → `fr`). No locale is inferred from a Site,
    // a host or a prefix in either direction, and no new locale becomes offerable: the binding's own
    // declared locales are still the only ones projected onto the Site.
    // A BINDING LOCALE AND A SPOKE LOCALE ARE COMPARED ON THEIR LANGUAGE BASE, ON BOTH SIDES
    // (GEO-04 C09-R12, corrected by C09-R13).
    //
    // `localePathKey` yields a canonical qualified tag (`en-001`, `de-de`). A Spoke declares its own locale
    // codes, and BOTH forms are genuinely in service: the generic synthetic fixture declares LANGUAGE BASES
    // (`en`, `de`), while the reference deployment's own Spoke declares QUALIFIED codes (`en-001`, `de-de`).
    // Comparing the binding key's base against the Spoke's RAW code therefore matched the fixture and
    // matched NOTHING in the reference deployment, whose projection was empty — so its shared shell could
    // offer no Language control. That is the same defect this comparison exists to prevent, reintroduced by
    // fixing one caller's shape: four reference-deployment shell tests caught it, green at the parent
    // revision and red on this candidate. Reducing BOTH sides to the documented language base
    // (`languageBaseOf`, `config/i18n/registry.ts`: `fr-ca` -> `fr`) is the one relation the two authorities
    // actually share. No locale is inferred from a Site, a host or a prefix in either direction, and no new
    // locale becomes offerable: the binding's own declared locales remain the only ones projected.
    locales: source.locales.filter((entry) =>
      view.binding.locales.some(
        (locale) =>
          (localePathKey(locale).split("-")[0] ?? localePathKey(locale)) ===
          (entry.code.split("-")[0] ?? entry.code),
      ),
    ),
    sitePageOverrides: overrides,
    name: brandName,
    contact: siteContact,
    business: {
      ...source.business,
      timezone: undefined,
      locations: [],
      name: businessName,
      contact: businessContact,
    },
    regions: {},
    pageBindings: [],
  };
}

/**
 * THE NON-ROUTING PRESENTATION FACTS — ONE implementation, TWO surfaces (FOUNDATION-GEO-04 R10)
 * ============================================================================================
 *
 * Every fact this function returns is a property of the SITE'S PRESENTATION, never of a URL: graphic
 * availability, the resolved UI token set, rail/bottom-bar geometry, the pre-paint rail bridge and the
 * analytics integration. `layoutForContext` (legacy) and `layoutForEfsContext` (EFS) both destructure
 * this result, so the two documents cannot present different banners, different `data-ui-*` tokens,
 * different sidebar geometry or a different analytics integration.
 *
 * It deliberately reads NO request and resolves NO destination: it is not given `segments`, a path
 * context, a `SiteSet` or `pageBindings`, so it is structurally incapable of acquiring geographic or
 * language meaning on either surface. The per-fact rules below are the ones the legacy layout has always
 * applied — moved, not changed.
 */
export function shellPresentationFacts(
  composition: SpokeServerComposition,
  siteConfig: SiteConfig,
) {
  const resolvedUi = composition.resolvedUi;
  const assets = composition.assets;

  // P5-5 — `navigation.sidebar.mode: "closed"` means the persistent aside rail is not composed (the
  // responsive disclosure/`Show navigation` control remains the way navigation is reached). Distinct
  // from `compact` (rail present, icon-only) and `open`.
  const sidebarClosed = resolvedUi.navigation.sidebar.mode === "closed";
  const sidebarCompact = resolvedUi.navigation.sidebar.mode === "compact";
  // NAV1A — "is a rail composed?" and "is a bottom bar composed?" are properties of EVERY composed
  // layout, not of the default one. A site whose visitor may choose the sidebar layout must compose that
  // layout's rail (≥md) and its mobile drawer (<md) even when the configured default is the menu bar —
  // and vice versa for the sticky bar.
  const usesAside =
    !sidebarClosed &&
    (railCompositions(resolvedUi, "desktop").length > 0 ||
      railCompositions(resolvedUi, "tablet").length > 0);
  const usesBottomBar = bottomBarCompositions(resolvedUi).length > 0;

  // P6-3B/P6-3C — the per-page banner map (page slug → composable banner asset). Only entries whose file
  // actually exists under `public/assets/` survive, so a stale/typo'd banner URL renders NO banner (never
  // a placeholder or a 404). The INTRINSIC size is read here (server-only) so the renderer can enforce
  // `displayWidth = min(availableWidth, 1.5 × naturalWidth)` without client measurement.
  const bannerMap = Object.fromEntries(
    Object.entries(siteConfig.assets?.banners ?? {}).flatMap(([page, url]) => {
      const path = assets.availableBannerPath(url);
      if (!path) return [];
      const size = assets.readImageDimensions(path);
      return [[page, { src: path, width: size?.width, height: size?.height }]];
    }),
  );
  const regionIds = configuredRegionIds(siteConfig.regions);
  // P12-BG — the per-page-role background map. Same availability rule as the banner role, so a
  // CONFIGURED-but-missing background is indistinguishable from an ABSENT one (which is what drives the
  // documented `background-<page>` → `background-all` → none fallback). No intrinsic size is read: the
  // layer is a CSS `background-image` with `cover`.
  const backgroundMap = assets.availableBackgroundMap(siteConfig.assets?.backgrounds);

  // P12-SG — the optional decorative STATUS graphic: ONE global role shared by BOTH status surfaces
  // (`error.tsx` and `not-found.tsx`), resolved server-side because the availability read touches
  // `node:fs` and `error.tsx` is a client component that can never import the resolver.
  const statusGraphicPath = assets.availableStatusGraphicPath(siteConfig.assets?.statusGraphic);
  const statusGraphicDimensions = assets.readImageDimensions(statusGraphicPath);
  const statusGraphic = statusGraphicPath
    ? {
        src: statusGraphicPath,
        width: statusGraphicDimensions?.width,
        height: statusGraphicDimensions?.height,
      }
    : undefined;

  // Phase K — when operating regions are configured, the legacy global business block is NOT merged into
  // rendered pages: the layout suppresses the global footer NAP + JSON-LD.
  const hasRegions = Object.keys(siteConfig.regions).length > 0;

  // Composition boundary (the ONLY place providers become concrete): the factories select adapters from
  // THIS context's validated configuration; the renderer below composes the already-built integration.
  const analytics = createAnalyticsProvider(siteConfig.analytics);

  // UI1-A2 — the pre-paint sidebar bridge and the ONE hydration tolerance it needs. Emitted only where a
  // rail is actually composed, so a deployment without one ships no bridge and no tolerance.
  const sidebarPreferenceBridge = usesAside;

  // FS-5 — the configured page colour flows into the EXISTING design-token system as the `--background`
  // override on `<html>`. Absent → the canonical tokens render unchanged.
  const htmlStyle = resolvedUi.theme.background
    ? ({ "--background": resolvedUi.theme.background } as CSSProperties)
    : undefined;

  // P5-3 / P5-5 / N2 — the inert `data-ui-*` presentation surface (generalized vocabulary values, never
  // presentation names; static SSR strings, so no hydration risk).
  const htmlPresentationAttrs = {
    ...presentationDataAttributes(resolvedUi.presentation),
    ...radiusDataAttribute(resolvedUi.theme.radius),
    ...layoutDataAttributes(resolvedUi),
    "data-ui-sidebar-mode": resolvedUi.navigation.sidebar.mode,
    "data-ui-top-mode": resolvedUi.navigation.top.mode,
    "data-ui-bottom-mode": resolvedUi.navigation.bottom.mode,
    "data-ui-cta-state": resolvedUi.cta.state,
  };

  return {
    sidebarClosed,
    sidebarCompact,
    usesAside,
    usesBottomBar,
    bannerMap,
    regionIds,
    backgroundMap,
    statusGraphic,
    hasRegions,
    analytics,
    sidebarPreferenceBridge,
    htmlStyle,
    htmlPresentationAttrs,
  };
}

/**
 * EFS's shared-shell entry. The EFS Page remains the content authority; this adapter supplies a
 * presentation-only configuration with no routing/locale/location inference. `null` means the binding
 * has no compatible shared shell, so the EFS-only document boundary applies.
 */
export async function layoutForEfsContext(
  context: SpokeRuntimeContext,
  view: EfsView,
  segments: readonly string[],
  children: ReactNode,
  htmlClassName: string,
): Promise<ReactNode | null> {
  if (!publicationOwnedBy(view.publication, context)) {
    throw new Error(
      `EFS publication "${view.publication.id}" is owned by Spoke "${view.publication.spokeId}", ` +
        `not the context selected for this request.`,
    );
  }
  const siteConfig = efsShellPresentationConfig(context.siteConfig, view);
  if (!siteConfig) return null;
  const siteSet: SiteSet = { sites: siteConfig.sites, defaultSite: siteConfig.defaultSite };
  const composition = spokeServerComposition(context, {
    siteConfig,
    siteSet,
    // The SAME decision the configuration above projected, expressed as the shell's HTML form.
    ...(efsResolvedBrandLogo(view) === undefined ? {} : { brandLogo: efsResolvedBrandLogo(view) }),
  });

  // ── THE SHARED PRESENTATION FACTS ────────────────────────────────────────────────────────────────────
  // The same function the legacy document uses, so banners, backgrounds, the status graphic, the
  // `data-ui-*` tokens, the rail geometry, the pre-paint bridge and the analytics integration are
  // identical by construction — not by a parallel implementation that must be kept in step.
  const facts = shellPresentationFacts(composition, siteConfig);

  // PUBLIC EFS PAGE IDENTITY is `view`'s answer; the presentation Site is CONFIGURATION identity, used
  // only for labels, icons, dictionary selection and appearance. Neither is derived from the other, and
  // they may legitimately differ.
  const locale = view.localeKey;
  const presentationSiteCode = siteConfig.defaultSite.code;
  const dictionary = composition.dictionaries.get(locale, presentationSiteCode);

  // ── PUBLISHED ADDRESSES (R02) ────────────────────────────────────────────────────────────────────────
  // Every public href below is either an entry of `addresses.navigation` (the publication's OWN published,
  // ordered destinations) or a destination the R04 resolver proved AND this membership test then accepted.
  // Nothing is string-joined onto a base; no unproved prefix, locale root or default-Site Home exists.
  const addresses = shellAddressesForEfsView(view);
  const publishedHrefs = new Set(addresses.navigation.map((item) => item.href));

  // ── OWNER-VERIFIED PRIMARY NAVIGATION (R09) ──────────────────────────────────────────────────────────
  // `null` means the publication declares no presentation Site (the ordinary EFS-only boundary), which is
  // an empty shell list, not a failure. A wrong-Spoke or undeclared presentation Site throws in there.
  const navItems = efsOwnedPrimaryNavigation({
    view,
    dictionaries: composition.dictionaries,
    assets: composition.assets,
  });

  /**
   * Prove ONE authored internal destination against the publication.
   *
   * The resolver answers three ways: `published` with a verified `href`, `external` with none, and
   * `unavailable` with a refusal reason. Only a verified `href` that is ALSO a published navigation
   * destination of this representation is accepted; everything else yields `undefined`, so a configured
   * but unpublished Page leaves its control uncomposed rather than linking somewhere the Site does not serve.
   */
  const provedInternal = (authoredHref: string | undefined): string | undefined => {
    if (authoredHref === undefined) return undefined;
    const resolved = resolveEfsShellInternalDestination({ view, authoredHref });
    return resolved.kind === "published" && publishedHrefs.has(resolved.href)
      ? resolved.href
      : undefined;
  };

  /**
   * The CTA keeps its released EXTERNAL capability.
   *
   * An external CTA is configuration the Site owner authored deliberately, and the resolver has already
   * applied the author-URL safety policy to it (refusing executable/unsupported schemes before this point).
   * Routing it through `provedInternal` would silently DELETE a working CTA, so an `external` answer is
   * carried verbatim while an internal one still needs the published-membership proof.
   */
  const provedCta = (authoredHref: string | undefined): string | undefined => {
    if (authoredHref === undefined) return undefined;
    const resolved = resolveEfsShellInternalDestination({ view, authoredHref });
    if (resolved.kind === "published") {
      return publishedHrefs.has(resolved.href) ? resolved.href : undefined;
    }
    if (resolved.kind !== "external") return undefined;
    // R04's `external` answer is a CLASSIFICATION, not a safe-URL verdict: it says "this is not one of my
    // published internal routes", which an executable or unsupported scheme also satisfies. The approved
    // author-URL policy must therefore decide, and only its decoded href is emitted.
    const verdict = classifyAuthorUrl(authoredHref);
    return verdict.ok ? verdict.href : undefined;
  };

  /**
   * R04 addresses an AUTHORED INTERNAL destination in its leading-slash form (`/connect`), while the route
   * constant is the bare segment (`connect`). The constant is used once, here, with the slash the resolver
   * requires — so a published Connect Page yields a clickable heading instead of being refused as malformed.
   */
  const connectAuthoredHref = `/${CONNECT_ROUTE_PATH}`;

  // The Site OBJECT is what `effectiveSitePageConfig` merges overrides against; passing a code would be a
  // different contract. `presentationSiteCode` is used only for dictionary selection and `siteId`.
  const pageConfig = effectiveSitePageConfig(siteConfig, siteConfig.defaultSite);
  const ctaHref = provedCta(pageConfig.ctaHref);
  const connectHref = provedInternal(connectAuthoredHref);
  // Connect/social methods keep their released contracts: an INTERNAL method is proved exactly like any
  // other destination, while an EXTERNAL one is carried through the resolver's `external` answer under the
  // existing author-URL safety policy — never rewritten into an internal link. The configured inventory is
  // used as configured; it is never replaced with an empty list to satisfy a type.
  const methodItems: EfsResolvedNavItem[] = (pageConfig.connect?.methods ?? []).flatMap((method) => {
    const resolved = resolveEfsShellInternalDestination({ view, authoredHref: method.href });
    if (resolved.kind === "published") {
      return publishedHrefs.has(resolved.href)
        ? [{ key: resolved.pageId, label: method.label, href: resolved.href } satisfies EfsResolvedNavItem]
        : [];
    }
    if (resolved.kind !== "external") return [];
    // Connect/social methods are NOT primary navigation, so the primary-navigation scheme restriction is not
    // imposed on them. The released author-URL policy IS applied, and its allowlist is exactly
    // `http`, `https`, `mailto`, `tel` (`AUTHOR_ALLOWED_SCHEMES`). A method authored with one of those — a
    // website, a social/profile URL, an email or a phone link — is preserved verbatim when the policy accepts
    // it. A method authored with a scheme OUTSIDE that list (`sms:`, `viber:` or any other deep link) is
    // REFUSED here and is not rendered; making such a scheme supported would be a change to the global URL
    // allowlist, which is outside R10's authorized source set and must not be smuggled in as a second policy.
    const verdict = classifyAuthorUrl(method.href);
    return verdict.ok
      ? [
          {
            key: method.href,
            label: method.label,
            href: verdict.href,
            external: true,
          } satisfies EfsResolvedNavItem,
        ]
      : [];
  });

  // Legal documents that are BOTH configured for this Site AND proved published in this representation.
  const legalLinks = (pageConfig.legal ?? []).flatMap((document) => {
    // A legal document is NOT a top-level Page route: its ONE authored contract is `legal/<slug>`
    // (`legalPageRoutePath`), addressed here in R04's leading-slash form (`/legal/privacy`). Using the bare
    // slug would have resolved to an unrelated top-level `/privacy` Page whenever one was published.
    const href = provedInternal(`/${legalPageRoutePath(document.slug)}`);
    return href === undefined
      ? []
      : [{ slug: document.slug, label: document.label, href }];
  });

  // The Language control offers ONLY this Page's published representations, and only when there is a real
  // alternative to offer (a one-option selector would propose the page the visitor is already on).
  const languages =
    addresses.languageAlternates.length > 1
      ? {
          current: view.locale,
          label: dictionary.language.label,
          options: addresses.languageAlternates.map((alternate) => ({
            value: alternate.hreflang,
            label: alternate.hreflang,
            href: alternate.href,
          })),
        }
      : undefined;
  // ── THE EFS DOCUMENT ─────────────────────────────────────────────────────────────────────────────────
  // `mode="efs"` is a COMPILE-TIME guarantee, not a runtime convention: this branch cannot pass `routing`,
  // `pageBindings` or `siteSet`, because the EFS props make them inexpressible. Every control below was
  // given a proved destination, and the shared `ShellDocument` renders the same document tree the legacy
  // surface uses.
  return (
    <ShellDocument
      statusRecoveryHomeHref={addresses.homeHref ?? null}

      mode="efs"
      localeTag={view.locale}
      locale={locale}
      htmlClassName={htmlClassName}
      htmlStyle={facts.htmlStyle}
      htmlAttributes={facts.htmlPresentationAttrs}
      sidebarPreferenceBridge={facts.sidebarPreferenceBridge}
      skipToContentLabel={dictionary.a11y.skipToContent}
      errorMessages={dictionary.error}
      bannerMap={facts.bannerMap}
      backgroundMap={facts.backgroundMap}
      statusGraphic={facts.statusGraphic}
      regionIds={facts.regionIds}
      resolved={composition.resolvedUi}
      mainId="main"
      mainClassName="flex-1"
      navigationLabel={dictionary.navigation.primaryLabel}
      sidebarLabels={{
        show: dictionary.navigation.showSidebar,
        hide: dictionary.navigation.hideSidebar,
      }}
      sidebarOpen={{
        icon: composition.assets.resolveIconControlUrl(
          composition.resolvedUi.navigation.sidebar.open.icon,
          DEFAULT_SIDEBAR_OPEN_ICON,
        ),
        text: composition.resolvedUi.navigation.sidebar.open.text,
      }}
      sidebarClose={{
        icon: composition.assets.resolveIconControlUrl(
          composition.resolvedUi.navigation.sidebar.close.icon,
          DEFAULT_SIDEBAR_CLOSE_ICON,
        ),
        text: composition.resolvedUi.navigation.sidebar.close.text,
      }}
      bottomNavLabel={dictionary.navigation.primaryLabel}
      bottomNavMode={composition.resolvedUi.navigation.bottom.mode}
      efsBottomNavItems={navItems ?? []}
      ctaLabel={composition.resolvedUi.cta.label}
      ctaHref={ctaHref}
      structuredData={facts.hasRegions ? null : <StructuredData locale={locale} siteConfig={siteConfig} />}
      analytics={facts.analytics}
      header={
        <SiteHeader
          locale={locale}
          resolved={composition.resolvedUi}
          siteId={presentationSiteCode}
          siteConfig={siteConfig}
          dictionaryAccess={composition.dictionaries}
          assets={composition.assets}
          efs={{
            navItems: navItems ?? [],
            homeHref: addresses.homeHref,
            ...(languages === undefined ? {} : { languages }),
          }}
        />
      }
      footer={
                    <SiteFooter
                      locale={locale}
                      siteId={presentationSiteCode}
                      directionLinkResolver={composition.directionLinks}
                      siteConfig={siteConfig}
                      dictionaryAccess={composition.dictionaries}
                      assets={composition.assets}
                      routes={composition.routes}
                      efs={{
                        navItems: navItems ?? [],
                        methodItems,
                        legalLinks,
                        ...(connectHref === undefined ? {} : { connectHref }),
                      }}
                    />
                  }
    >
      {children}
    </ShellDocument>
  );
}
