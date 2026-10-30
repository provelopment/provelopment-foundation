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
import { publicPathBase, publicationOwnedBy } from "@/core/efs/publication";
import { PUBLIC_FACT_KEYS, resolvePublicFacts } from "@/core/efs/public-facts";
import { siteDescriptionForLocale } from "@/config/site-metadata";
import { spokeSwitcherForRenderingSpoke } from "@/config/spoke-routing";
import { buildLanguageAlternates, type LanguageAlternateLocale } from "@/core/locale";
import { resolveSiteNotice } from "@/core/notice";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { isUnlistedPage } from "@/core/page-document";
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
  presentation?: { readonly siteConfig?: SiteConfig; readonly siteSet?: SiteSet },
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
import { ConnectPageContent, ContactPageContent, StarterHome } from "./dedicated-pages";


/** URLs whose chrome is specialised (`./dedicated-pages`). */
const CONNECT_ROUTE_PATH = "connect";
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
  const ctaHref = ctaHrefSource === undefined ? undefined : siteHref(site, locale, ctaHrefSource);

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

  // P5-5 — `navigation.sidebar.mode: "closed"` means the persistent aside rail
  // is not composed (the responsive disclosure/`Show navigation` control remains
  // the way navigation is reached). Distinct from `compact` (rail present,
  // icon-only) and `open`.
  const sidebarClosed = resolvedUi.navigation.sidebar.mode === "closed";
  const sidebarCompact = resolvedUi.navigation.sidebar.mode === "compact";
  // NAV1A — "is a rail composed?" and "is a bottom bar composed?" are properties of EVERY
  // composed layout, not of the default one. A site whose visitor may choose the sidebar
  // layout must compose that layout's rail (≥md) and its mobile drawer (<md) even when the
  // configured default is the menu bar — and vice versa for the sticky bar. The rail/bar
  // structure is then exposed by the stylesheet for the ACTIVE layout only, so exactly one
  // navigation is ever present.
  const usesAside =
    !sidebarClosed &&
    (railCompositions(resolvedUi, "desktop").length > 0 ||
      railCompositions(resolvedUi, "tablet").length > 0);
  const usesBottomBar = bottomBarCompositions(resolvedUi).length > 0;
  // P6-3B/P6-3C — the per-page banner map (page slug → composable banner asset).
  // Only entries whose file actually exists under `public/assets/` survive, so a
  // stale/typo'd banner URL renders NO banner (never a placeholder or a 404).
  // P6-3C — the graphic's INTRINSIC size is read here (server-only) so the
  // renderer can enforce `displayWidth = min(availableWidth, 1.5 × naturalWidth)`
  // without client measurement, upscaling flash, or layout shift.
  const bannerMap = Object.fromEntries(
    Object.entries(siteConfig.assets?.banners ?? {}).flatMap(([page, url]) => {
      const path = assets.availableBannerPath(url);
      if (!path) return [];
      const size = assets.readImageDimensions(path);
      return [[page, { src: path, width: size?.width, height: size?.height }]];
    }),
  );
  const regionIds = configuredRegionIds(siteConfig.regions);
  // P12-BG — the per-page-role background map (page role → resolved decorative
  // graphic). Same availability rule as the banner role: only entries whose file
  // actually exists under `public/assets/` survive, so a CONFIGURED-but-missing
  // background is indistinguishable from an ABSENT one. That is exactly what
  // drives the documented `background-<page>` → `background-all` → none
  // fallback at render time (a missing page-specific graphic falls through to
  // the global one; a missing global one renders no graphic at all). The `all`
  // key is the reserved GLOBAL role.
  // No intrinsic size is read here: the layer is a CSS `background-image` with
  // `cover`, so — unlike a page banner — it needs no dimension/upscale contract.
  const backgroundMap = assets.availableBackgroundMap(siteConfig.assets?.backgrounds);

  // P12-SG — the optional decorative STATUS graphic (`site.assets.statusGraphic`,
  // the `status-graphic` role): ONE global role shared by BOTH status surfaces
  // (`error.tsx` and `not-found.tsx`). Resolved here (server-only) for the same
  // reason the banner map is: the availability read touches `node:fs`, and
  // `error.tsx` is a CLIENT component that can never import the resolver. The
  // value is handed to both surfaces through `StatusGraphicProvider`, the same
  // transport the error copy uses. Same availability rule as every other graphic
  // role, so a CONFIGURED-but-missing status graphic is indistinguishable from an
  // ABSENT one.
  const statusGraphicPath = assets.availableStatusGraphicPath(siteConfig.assets?.statusGraphic);
  const statusGraphicDimensions = assets.readImageDimensions(statusGraphicPath);
  const statusGraphic = statusGraphicPath
    ? {
        src: statusGraphicPath,
        width: statusGraphicDimensions?.width,
        height: statusGraphicDimensions?.height,
      }
    : undefined;

  // Phase K: when operating regions are configured, the legacy global business
  // block is NOT merged into rendered pages. The layout suppresses the global
  // footer NAP + JSON-LD; regional pages render their own region's identity.
  const hasRegions = Object.keys(siteConfig.regions).length > 0;

  // Composition boundary (the ONLY place providers become concrete): the factories
  // select adapters from THIS context's validated configuration; the layout below
  // renders the already-composed integrations without any provider-specific
  // conditional.
  const analytics = createAnalyticsProvider(siteConfig.analytics);

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

  // UI1-A2 — THE PRE-PAINT SIDEBAR BRIDGE, and the ONE hydration tolerance it needs. The rail's
  // open/closed state is the visitor's browser-local preference, so a STATICALLY GENERATED document
  // cannot know it: the server renders the canonical CLOSED rail (which is exactly what keeps every
  // page prerendered — no cookie, session, request-time rendering or middleware enters this), and the
  // browser applies the visitor's OPEN preference BEFORE that canonical geometry is painted. The script
  // is the FIRST element of `<body>`, and `suppressHydrationWarning` is emitted ONLY where a rail is
  // actually composed — so a deployment without one ships no bridge and no tolerance.
  const sidebarPreferenceBridge = usesAside;

  // FS-5 — the configured page/background color flows into the EXISTING
  // design-token system: when `ui.theme.background` is set, we override the
  // `--background` CSS variable on `<html>` (components consume the token via
  // `bg-background`/token utilities; no inline component styles). Absent → the
  // canonical `:root`/dark `--background` tokens render unchanged.
  const htmlStyle = resolvedUi.theme.background
    ? ({ "--background": resolvedUi.theme.background } as CSSProperties)
    : undefined;

  // P5-3 — the RESOLVED presentation intent flows into the shared renderer as
  // inert `data-ui-*` attributes on `<html>` (see globals.css — P5-3
  // presentation tokens). These are generalized vocabulary values (never
  // presentation names), so the CSS token layer implements presentation without
  // any identity coupling. Static SSR strings; no hydration risk.
  // P5-5 — the resolved control/menu modes join the same `data-ui-*` surface
  // for the same reason (single observability + test hook, no presentation CSS).
  const htmlPresentationAttrs = {
    ...presentationDataAttributes(resolvedUi.presentation),
    ...radiusDataAttribute(resolvedUi.theme.radius),
    // N2 — the ACTIVE shell layout presentation. Emitted ONLY when the adopter enables
    // the switcher, so a site without it produces byte-identical markup; the client
    // control changes this one attribute (see globals.css — shell layout presentation).
    ...layoutDataAttributes(resolvedUi),
    "data-ui-sidebar-mode": resolvedUi.navigation.sidebar.mode,
    "data-ui-top-mode": resolvedUi.navigation.top.mode,
    "data-ui-bottom-mode": resolvedUi.navigation.bottom.mode,
    "data-ui-cta-state": resolvedUi.cta.state,
  };

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
    <html
      lang={localeTag}
      className={htmlClassName}
      style={htmlStyle}
      suppressHydrationWarning={sidebarPreferenceBridge}
      {...htmlPresentationAttrs}
    >
      <body className="min-h-full flex flex-col">
        {/* M14 — the ONE client transport for this Spoke's routing projection: every routing control below
            (header, footer, sidebar, switchers, the error/404 surfaces) reads THIS document's context. */}
        <ClientRoutingProvider routing={composition.clientRouting}>
        {sidebarPreferenceBridge ? <SidebarPreferenceBoot /> : null}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
        >
          {dictionary.a11y.skipToContent}
        </a>
        <PageBackground backgrounds={backgroundMap} regionIds={regionIds} />
        <PageBanner banners={bannerMap} regionIds={regionIds} />
        <ShellEngine
          resolved={resolvedUi}
          notice={notice}
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
            />
          }
          main={
            <ErrorMessagesProvider messages={dictionary.error}>
              <StatusGraphicProvider asset={statusGraphic}>{children}</StatusGraphicProvider>
            </ErrorMessagesProvider>
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
          mainId="main"
          mainClassName="flex-1"
          navigationLabel={dictionary.navigation.primaryLabel}
          // P6-1 — the rail disclosure uses the ONE Show/Hide navigation vocabulary
          // (same as the mobile trigger/close); represented by the localized
          // labels + the configured open/close control content (icon screened
          // against the runtime namespaces by the framework layer below).
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
          asideContent={sidebarNavContent}
          bottomNav={bottomNav}
          locale={locale}
          pageBindings={siteConfig.pageBindings}
          siteSet={composition.siteSet}
          ctaLabel={resolvedUi.cta.label}
          ctaHref={ctaHref}
        />
        {hasRegions ? null : <StructuredData locale={locale} siteConfig={siteConfig} />}
        {analytics}
        </ClientRoutingProvider>
      </body>
    </html>
  );
}

/**
 * EFS's shared-shell presentation configuration. It keeps the approved visual/navigation/dictionary
 * chrome but makes the EFS representation the ONLY locale authority: every site locale is explicit and
 * canonicalised from its declared tag, while regions, page-region bindings, required-Location policy and
 * legacy business timezone/locations are removed. No Site code, Facet name, Page name or URL prefix can
 * therefore acquire geographic or language meaning on the EFS path.
 */
export function efsShellPresentationConfig(
  source: SiteConfig,
  view: EfsView,
): SiteConfig | null {
  const presentationSiteCode = view.publication.presentationSiteCode;
  if (presentationSiteCode === undefined) return null;
  const sourceSite = source.sites.find((candidate) => candidate.code === presentationSiteCode);
  if (!sourceSite) {
    throw new Error(
      `EFS presentation Site "${presentationSiteCode}" is not declared by the owning Spoke ` +
        `"${view.publication.spokeId}"; the shared shell cannot be composed.`,
    );
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
   * SOURCE PRECEDENCE (`D40` Decision C).
   *
   * This is the ONE place the ordering is applied, and it feeds BOTH surfaces: the shared shell
   * (header, footer, contact block) reads this config, and so does the JSON-LD built from it. One
   * resolution, so a contact value can never be displayed and advertised differently.
   *
   * The fallback values are the Spoke's own presentation configuration — exactly what renders
   * today when the capsule declares nothing — so absent declarations change nothing. A private or
   * `null`-suppressed declaration blocks both EFS output AND these fallbacks; that is decided in
   * `resolvePublicFacts` by the CASCADE state, never by the public output.
   */
  const facts = resolvePublicFacts(view.properties, {
    "brand.name": source.business.name ?? source.name,
    "contact.name": source.business.name ?? source.name,
    "contact.email": source.business.contact.email ?? source.contact.email,
    "contact.phone": source.business.contact.phone ?? source.contact.phone,
  });

  /**
   * A blocked declaration (`private` or explicit `null`) removes the fact from the public output
   * AND refuses the configuration fallback. It is removed rather than overwritten with
   * `undefined`, so the property is genuinely absent from the composed configuration.
   */
  const blocked = (key: (typeof PUBLIC_FACT_KEYS)[number]) => {
    const state = facts.get(key).state;
    return state === "private" || state === "suppressed";
  };
  const withoutFact = <T extends object>(base: T, key: keyof T): T => {
    const rest: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    delete rest[key as string];
    return rest as T;
  };

  /**
   * The shell's own identity name.
   *
   * A denied BRAND NAME does not render — and, per `GEO-01-R02` §5, the shell then falls back to
   * the EFS SiteID, exactly as a denied `site.label` already does (line above). That is the
   * documented consequence of deny-by-default for a DISPLAY property, not an invented value.
   */
  const brandName =
    facts.get("brand.name").state === "declared"
      ? facts.get("brand.name").value
      : blocked("brand.name")
        ? view.site.id
        : undefined;
  const contactName =
    facts.get("contact.name").state === "declared" ? facts.get("contact.name").value : undefined;

  const businessContact = (() => {
    let contact = { ...source.business.contact };
    for (const key of ["contact.email", "contact.phone"] as const) {
      const field = key === "contact.email" ? "email" : "phone";
      const fact = facts.get(key);
      if (fact.state === "declared" && fact.value !== undefined) contact[field] = fact.value;
      else if (blocked(key)) contact = withoutFact(contact, field);
    }
    return contact;
  })();

  const siteContact = (() => {
    let contact = { ...source.contact };
    for (const key of ["contact.email", "contact.phone"] as const) {
      const field = key === "contact.email" ? "email" : "phone";
      const fact = facts.get(key);
      if (fact.state === "declared" && fact.value !== undefined) contact[field] = fact.value;
      // A blocked fact is withheld from the deployment-level contact too, so it cannot be reached
      // through a second path.
      else if (blocked(key)) contact = withoutFact(contact, field);
    }
    return contact;
  })();

  return {
    ...source,
    url: new URL(view.canonical).origin,
    sites: [site],
    defaultSite: site,
    hubs: [],
    defaultLocale: site.defaultLocale,
    locales: source.locales.filter((entry) =>
      view.binding.locales.some((locale) => localePathKey(locale) === entry.code),
    ),
    sitePageOverrides: overrides,
    name: brandName ?? source.name,
    contact: siteContact,
    business: {
      ...source.business,
      timezone: undefined,
      locations: [],
      ...(brandName === undefined && contactName === undefined
        ? {}
        : { name: brandName ?? contactName }),
      contact: businessContact,
    },
    regions: {},
    pageBindings: [],
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
  return layoutForContext(
    spokeServerComposition(context, { siteConfig, siteSet }),
    segments,
    children,
    htmlClassName,
  );
}
