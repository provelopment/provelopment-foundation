import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { loadEfsPageSource, type EfsPageSource } from "@/adapters/content/efs-content";
import { efsPublicationOwnerForRequest } from "@/config/efs/owner";
import { legacyTestRuntimeEnabled, missingEfsInstallation } from "./legacy-test-runtime";
import type { SpokeRuntimeContext } from "@/config/installation-runtime";
import {
  canonicalUrl,
  contentSegments,
  entryRedirectPath,
  matchBinding,
  parseContentRoute,
  type EfsContentRoute,
  publicationForBinding,
  type EfsBinding,
} from "@/core/efs/publication";
import {
  advertisedHreflang,
  canonicalLocaleTag,
  localePathKey,
  resolveRepresentation,
  type PageRepresentation,
} from "@/core/efs/locales";
import { resolvePublicFacts } from "@/core/efs/public-facts";
import { resolveProperties, type EffectiveProperties } from "@/core/efs/properties";
import { sitemapEntries, type DiscoveryPage } from "@/core/efs/discovery";
import type { PageVisibility } from "@/core/page-document";
import type { ContactInquiryOrigin } from "@/core/contact-inquiry";
import type { ContactOwnerIdentity } from "@/config/contact-receiver";
import { deploymentPaths } from "@/config/deployment-root";
import { EFS_REQUEST_PATH_HEADER } from "@/config/efs/request-path";
import {
  loadEfsManifest,
  type EfsEntityDeclaration,
  type EfsFacetDeclaration,
  type EfsManifest,
  type EfsPageDeclaration,
  type EfsPublicationDeclaration,
  type EfsSiteDeclaration,
} from "@/config/efs/manifest";
import { openGraphImageForEfs, type EfsOpenGraphImage } from "@/app/efs-opengraph-image-model";
import {
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SEGMENT,
  OPEN_GRAPH_IMAGE_SIZE,
} from "@/config/efs/image-path";

/**
 * THE EFS REQUEST/PRESENTATION BOUNDARY (S3-E3)
 * ============================================
 *
 * This is the actual App Router request branch for an explicit EFS publication. It resolves the request
 * host and path through the binding, then the Entity/Facet/Site/Page/representation chain, loads the
 * localized owner source, resolves the one property cascade and composes canonical/hreflang output.
 *
 * When this deployment DECLARES EFS, a host the manifest does not claim is refused (`notFound`); it never
 * falls through to the legacy Page/locale runtime. Only the absence of an EFS declaration selects the
 * ordinary legacy installation path (UC-01), and an incomplete declaration fails with a controlled
 * diagnostic rather than reviving that path.
 */
const MANIFEST_ENV = "FOUNDATION_EFS_MANIFEST";
const CAPSULE_ENV = "FOUNDATION_EFS_CAPSULE";
const DEPLOYMENT = deploymentPaths();
const DEFAULT_MANIFEST = join(DEPLOYMENT.root, "efs", "manifest.json");
const DEFAULT_CAPSULE = join(DEPLOYMENT.root, "efs", "capsule");

export interface EfsNavigationItem {
  readonly pageId: string;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

export interface EfsView {
  readonly publication: EfsPublicationDeclaration;
  readonly binding: EfsBinding;
  /** The VERIFIED owner context: the publication's declared Spoke, resolved in this Installation. */
  readonly context: SpokeRuntimeContext;
  readonly entity: EfsEntityDeclaration;
  readonly facet: EfsFacetDeclaration;
  readonly site: EfsSiteDeclaration;
  readonly page: EfsPageDeclaration;
  readonly representation: PageRepresentation;
  readonly locale: string;
  readonly localeKey: string;
  readonly source: EfsPageSource;
  /** The effective representation's ONE publication decision, read from its source document. */
  readonly visibility: PageVisibility;
  readonly properties: EffectiveProperties;
  readonly canonical: string;
  readonly alternates: readonly { readonly hreflang: string; readonly href: string }[];
  /** Truthful `x-default` only while that representation is public. */
  readonly xDefault?: string;
  /** Public Pages whose representation for this locale (or its authored fallback) is public. */
  readonly navigation: readonly EfsNavigationItem[];
  readonly home: boolean;
}

interface LoadedRuntime {
  readonly manifest: EfsManifest;
  readonly capsule: string;
}

/** Request headers, or `null` outside a request scope (build/test callers). */
async function requestHeader(name: string): Promise<string | null> {
  try {
    return (await headers()).get(name);
  } catch {
    return null;
  }
}

/** The Host header without its development port. */
function hostName(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(0, end + 1) : value;
  }
  return value.replace(/:\d+$/, "");
}

function runtime(): LoadedRuntime | null {
  const rawOverride = process.env[MANIFEST_ENV];
  // Next's build environment can materialise an absent variable as the literal string "undefined";
  // that is ABSENT, not a path. A genuinely empty value remains authoring failure below.
  const override =
    rawOverride === undefined || rawOverride === "undefined" || rawOverride === "null"
      ? undefined
      : rawOverride;
  // An EMPTY manifest override is authoring failure, never a switch that revives the retired
  // Page/locale runtime. The production request path has ONE runtime: explicit EFS.
  if (override !== undefined && override.trim() === "") {
    throw new Error(
      `EFS manifest path is empty; ${MANIFEST_ENV} must name a manifest or be left unset.`,
    );
  }
  const manifestPath = override ?? DEFAULT_MANIFEST;
  const rawCapsule = process.env[CAPSULE_ENV];
  const capsulePath =
    rawCapsule === undefined || rawCapsule === "undefined" || rawCapsule === "null"
      ? DEFAULT_CAPSULE
      : rawCapsule;
  if (!existsSync(manifestPath)) {
    // An explicitly configured manifest, an existing capsule, or an existing EFS directory means this
    // deployment DECLARED EFS. A missing manifest is then authoring failure, never a fallback switch.
    if (override !== undefined || existsSync(capsulePath) || existsSync(dirname(manifestPath))) {
      throw new Error(`EFS manifest is missing at ${manifestPath}; the capsule cannot be served.`);
    }
    // No EFS configuration at all. Only the isolated, non-production test utility may answer; a
    // real installation receives a controlled setup diagnostic instead of an alternate runtime.
    if (legacyTestRuntimeEnabled()) return null;
    missingEfsInstallation();
  }
  if (!existsSync(capsulePath)) {
    throw new Error(`EFS capsule is missing at ${capsulePath}; the publication cannot be served.`);
  }
  const result = loadEfsManifest(manifestPath);
  if (!result.ok || !result.manifest) {
    throw new Error(`EFS manifest is invalid: ${result.issues.join(" ")}`);
  }
  return {
    manifest: result.manifest,
    capsule: capsulePath,
  };
}

function findSite(manifest: EfsManifest, entityId: string, facetId: string, siteId: string) {
  for (const entity of manifest.entities) {
    if (entity.id !== entityId) continue;
    const facet = entity.facets.find((candidate) => candidate.id === facetId);
    const site = facet?.sites.find((candidate) => candidate.id === siteId);
    if (facet && site) return { entity, facet, site };
  }
  return null;
}

/**
 * The reserved authored Home Page's INTERNAL Page identity. It is never a public Page route (`GEO-03` R04-C23): the
 * Page is addressed by its binding's locale root, i.e. by the EMPTY Page-route suffix.
 */
const RESERVED_HOME_ROUTE = "home";

/**
 * The declared Page addressed by an incoming Page-route suffix.
 *
 * The empty suffix addresses the reserved authored Home Page; the literal suffix `home` does NOT, because it names
 * that document's internal identity rather than a public address. The refusal lives HERE — at the one shared boundary
 * that Page rendering and contact-form hosting both use — so no caller (a GET, a POST, or an alternate request shape)
 * can recover the reserved document through its private name. Only the EXACT suffix is reserved: an ordinary authored
 * route that merely contains the word is untouched.
 */
function pageForRoute(site: EfsSiteDeclaration, route: readonly string[]): EfsPageDeclaration | undefined {
  if (route.length === 1 && route[0] === RESERVED_HOME_ROUTE) return undefined;
  const wanted = route.length === 0 ? [RESERVED_HOME_ROUTE] : route;
  return site.pages.find(
    (page) =>
      page.route.length === wanted.length && page.route.every((segment, index) => segment === wanted[index]),
  );
}

function publicRoute(page: EfsPageDeclaration): readonly string[] {
  return page.route.length === 1 && page.route[0] === RESERVED_HOME_ROUTE ? [] : page.route;
}

/** Load and strictly validate ONE declared representation, or fail with its actionable reason. */
function loadRepresentationSource(input: {
  readonly capsule: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly siteId: string;
  readonly page: EfsPageDeclaration;
  readonly locale: string;
}): EfsPageSource {
  const result = loadEfsPageSource({
    root: input.capsule,
    entityId: input.entityId,
    facetId: input.facetId,
    siteId: input.siteId,
    pageId: input.page.id,
    routePath: input.page.route.join("/"),
    localeKey: localePathKey(input.locale),
  });
  if (result.kind === "rejected") {
    throw new Error(
      `EFS Page "${input.page.id}" representation "${input.locale}" is refused: ${result.reason}`,
    );
  }
  return result.value;
}

/** Every declared representation with the publication decision of the source that answers it. */
function loadedRepresentations(input: {
  readonly capsule: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly siteId: string;
  readonly page: EfsPageDeclaration;
}): readonly (PageRepresentation & { readonly source: EfsPageSource })[] {
  return input.page.representations.map((representation) => {
    const source = loadRepresentationSource({ ...input, locale: representation.locale });
    return { ...representation, visibility: source.visibility, source };
  });
}

/** Public navigation for this Site and locale, asked of each destination's own source. */
function navigationFor(input: {
  readonly capsule: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly site: EfsSiteDeclaration;
  readonly page: EfsPageDeclaration;
  readonly binding: EfsBinding;
  readonly localeKey: string;
}): readonly EfsNavigationItem[] {
  const items: EfsNavigationItem[] = [];
  for (const candidate of input.site.pages) {
    const representation =
      candidate.representations.find(
        (entry) => localePathKey(entry.locale) === input.localeKey,
      ) ??
      candidate.representations.find(
        (entry) =>
          candidate.fallbackLocaleKey !== undefined &&
          localePathKey(entry.locale) === localePathKey(candidate.fallbackLocaleKey),
      );
    if (!representation) continue;
    const result = loadEfsPageSource({
      root: input.capsule,
      entityId: input.entityId,
      facetId: input.facetId,
      siteId: input.site.id,
      pageId: candidate.id,
      routePath: candidate.route.join("/"),
      localeKey: localePathKey(representation.locale),
    });
    // A missing destination is not advertised (the released navigation rule). A malformed one
    // is still refused at its own URL; it must not break an unrelated page's navigation.
    if (result.kind === "rejected" || result.value.visibility !== "public") continue;
    const label = candidate.properties?.["nav.label"];
    items.push({
      pageId: candidate.id,
      label: label?.public === true && typeof label.value === "string" ? label.value : candidate.id,
      href: `/${contentSegments(input.binding, {
        siteId: input.site.id,
        locale: representation.locale,
        localeKey: localePathKey(representation.locale),
        pageRoute: publicRoute(candidate),
      }).join("/")}`,
      current: candidate.id === input.page.id,
    });
  }
  return items;
}

function localizedHref(
  binding: EfsBinding,
  siteId: string,
  locale: string,
  route: readonly string[],
): string {
  return canonicalUrl(binding, {
    siteId,
    locale,
    localeKey: localePathKey(locale),
    pageRoute: route,
  });
}

function contentTitle(source: EfsPageSource, page: EfsPageDeclaration): string {
  const title = source.data.title;
  return typeof title === "string" && title.trim().length > 0 ? title : page.id;
}

function contentDescription(source: EfsPageSource): string | undefined {
  const description = source.data.description;
  return typeof description === "string" && description.trim().length > 0 ? description : undefined;
}

/** Whether this deployment declares EFS (validating the declaration). */
export function efsRuntimeDeclared(): boolean {
  return runtime() !== null;
}

/**
 * The verified owner context and trusted origin of the CURRENT EFS request.
 *
 * The contact Server Action is invoked by a POST whose path is the Page that hosted the form. The
 * edge proxy stamps that real pathname into a private upstream header and overwrites any client
 * value. We match the FULL binding (host + longest prefix) and resolve the publication's declared
 * owner from the Installation hierarchy. Consequently:
 *
 *   - different Spokes may own disjoint prefixes on one host, and each POST resolves its own owner;
 *   - a host/prefix no binding claims has no destination;
 *   - no client form field, header or EntityID selects a publication.
 *
 * A missing trusted path is fail-closed rather than guessed from the host alone.
 */
/**
 * THE PAGE THAT HOSTS A FORM, RESOLVED FROM THE SAME DECLARATIONS RENDERING USES (A5).
 *
 * Given the ALREADY-VERIFIED route, this answers "which declared Page is this, and which `contactForm` section
 * does its representation author?". It is deliberately built from the manifest and the authored source — never
 * from a form field, a header, a query parameter or a page id parsed out of an arbitrary URL string.
 *
 * `null` means no page hosts a form here, which the Server Action treats as "no Connect form": the released
 * legacy path is then the only contact behaviour this request has.
 */
function pageHostingContactForm(
  runtimeValue: LoadedRuntime,
  binding: EfsBinding,
  route: EfsContentRoute,
): { readonly pageId: string; readonly formRef: string } | null {
  const found = findSite(runtimeValue.manifest, binding.entityId, binding.facetId, route.siteId);
  if (!found) return null;
  const page = pageForRoute(found.site, route.pageRoute);
  if (!page) return null;
  const source = loadRepresentationSource({
    capsule: runtimeValue.capsule,
    entityId: binding.entityId,
    facetId: binding.facetId,
    siteId: route.siteId,
    page,
    locale: route.locale,
  });
  const section = source.document?.sections.find((candidate) => candidate.type === "contactForm");
  if (section === undefined) return null;
  return { pageId: page.id, formRef: section.formRef };
}

export interface EfsContactContext {
  readonly context: SpokeRuntimeContext;
  readonly origin: ContactInquiryOrigin;
  /** Every published owner in this manifest, so receiver-key ambiguity can be detected. */
  readonly owners: readonly ContactOwnerIdentity[];
  /**
   * The verified Page hosting a `contactForm`, and the authored form it declares (A5).
   *
   * Present only when the verified route resolves to a declared Page whose representation authors that
   * section. This is the ONE identity rendering and submission share: the renderer decides whether to draw a
   * form from these same declarations, and the Server Action refuses a submission when they are absent.
   */
  readonly pageId?: string;
  readonly formRef?: string;
}

export async function efsContactContextForCurrentRequest(): Promise<EfsContactContext | null> {
  const runtimeValue = runtime();
  if (!runtimeValue) return null;
  const rawHost = (await requestHeader("host")) ?? (await requestHeader("x-forwarded-host"));
  const host = hostName(rawHost);
  const pathname = await requestHeader(EFS_REQUEST_PATH_HEADER);
  if (!host || !pathname || !pathname.startsWith("/")) return null;

  const allBindings = runtimeValue.manifest.publications.flatMap((publication) => publication.bindings);
  const matched = matchBinding(host, pathname, allBindings);
  if (!matched) return null;
  const publication = publicationForBinding(runtimeValue.manifest.publications, matched.binding);
  if (!publication) return null;
  const owner = efsPublicationOwnerForRequest(publication, host);
  if (owner.kind === "refused") return null;

  const route = parseContentRoute(matched.canonicalBinding, matched.remaining);
  const parsed = route.kind === "route" ? route.route : null;
  const hosting =
    parsed === null ? null : pageHostingContactForm(runtimeValue, matched.canonicalBinding, parsed);
  return {
    context: owner.context,
    origin: {
      publicationId: publication.id,
      bindingId: matched.canonicalBinding.id,
      entityId: matched.canonicalBinding.entityId,
      facetId: matched.canonicalBinding.facetId,
      ...(parsed?.siteId ? { siteId: parsed.siteId } : {}),
      ...(parsed?.locale ? { locale: parsed.locale } : {}),
      host: host.toLowerCase(),
      path: pathname,
    },
    ...(hosting === null ? {} : { pageId: hosting.pageId, formRef: hosting.formRef }),
    owners: runtimeValue.manifest.publications.map((candidate) => ({
      id: candidate.spokeId,
      ...(candidate.spokeHubId === undefined ? {} : { spokeHubId: candidate.spokeHubId }),
    })),
  };
}

/** Resolve the current request through EFS, or `null` for a host the EFS manifest does not claim. */
export async function efsViewForCurrentRequest(
  segments: readonly string[],
): Promise<EfsView | null> {
  const runtimeValue = runtime();
  if (!runtimeValue) return null;
  const { manifest, capsule } = runtimeValue;
  const host = hostName((await requestHeader("host")) ?? (await requestHeader("x-forwarded-host")));
  if (!host) return null;

  const allBindings = manifest.publications.flatMap((publication) => publication.bindings);
  const matched = matchBinding(host, `/${segments.join("/")}`, allBindings);
  if (!matched) {
    // Preserve the released Spoke's root/locale-shorthand completion for a converted host. It is
    // deterministic only when that host has exactly ONE canonical binding; anything ambiguous is
    // refused rather than guessed.
    const hostBindings = allBindings.filter(
      (binding) => binding.canonical !== false && binding.host.toLowerCase() === host.toLowerCase(),
    );
    if (hostBindings.length === 1) {
      const only = hostBindings[0];
      const onlyPublication = publicationForBinding(manifest.publications, only);
      if (!onlyPublication) notFound();
      const owner = efsPublicationOwnerForRequest(onlyPublication, host);
      if (owner.kind === "refused") notFound();
      if (segments.length === 0) {
        const entry = entryRedirectPath(only, {
          cookie: (await requestHeader("cookie")) ?? undefined,
          acceptLanguage: await requestHeader("accept-language"),
        });
        redirect(entry.length > 1 ? entry.replace(/\/$/, "") : entry);
      }
      const shorthand = only.locales.find(
        (locale) => localePathKey(locale) === segments[0]?.toLowerCase(),
      );
      if (only.siteMode === "closed" && shorthand) {
        redirect(`/${[...only.prefix, ...segments].join("/")}`);
      }
    }
    // When an explicit EFS manifest is present, it is the publication authority: a host it
    // does not claim is not allowed to fall through to another runtime.
    notFound();
  }

  const publication = publicationForBinding(manifest.publications, matched.binding);
  if (!publication) notFound();
  // The publication's explicit owner and the Installation's declared hierarchy are the ONLY
  // sources of ownership. A host or prefix that resembles a Spoke/Entity/Facet name is irrelevant.
  const owner = efsPublicationOwnerForRequest(publication, host);
  if (owner.kind === "refused") notFound();
  const context = owner.context;

  if (matched.remaining.length === 0) {
    redirect(
      entryRedirectPath(matched.canonicalBinding, {
        cookie: (await requestHeader("cookie")) ?? undefined,
        acceptLanguage: await requestHeader("accept-language"),
      }),
    );
  }

  const parsed = parseContentRoute(matched.binding, matched.remaining);
  if (parsed.kind !== "route") notFound();
  const route = parsed.route;
  const located = findSite(manifest, matched.binding.entityId, matched.binding.facetId, route.siteId);
  if (!located) notFound();
  const { entity, facet, site } = located;
  const page = pageForRoute(site, route.pageRoute);
  if (!page) notFound();

  const representations = loadedRepresentations({
    capsule,
    entityId: entity.id,
    facetId: facet.id,
    siteId: site.id,
    page,
  });
  const representation = resolveRepresentation(
    {
      pageId: page.id,
      fallbackLocaleKey: page.fallbackLocaleKey,
      representations,
    },
    route.locale,
    { allowFallback: true },
  );
  if (representation.kind === "not-found") notFound();
  if (representation.kind === "redirect") {
    redirect(
      `/${contentSegments(matched.canonicalBinding, {
        siteId: site.id,
        locale: representation.representation.locale,
        localeKey: localePathKey(representation.representation.locale),
        pageRoute: publicRoute(page),
      }).join("/")}/`,
    );
  }

  const actual = representation.representation;
  const loaded = representations.find(
    (candidate) => localePathKey(candidate.locale) === localePathKey(actual.locale),
  );
  if (!loaded) notFound();
  const source = loaded.source;

  const declaration = page.representations.find(
    (candidate) => localePathKey(candidate.locale) === localePathKey(actual.locale),
  );
  const properties = resolveProperties([
    { level: "entity", id: entity.id, properties: entity.properties },
    { level: "facet", id: facet.id, properties: facet.properties },
    { level: "site", id: site.id, properties: site.properties },
    { level: "page", id: page.id, properties: page.properties },
    { level: "representation", id: actual.locale, properties: declaration?.properties },
  ]);

  const localeKey = localePathKey(actual.locale);
  const defaultRepresentation = representations.find(
    (candidate) => localePathKey(candidate.locale) === localePathKey(matched.canonicalBinding.defaultLocale),
  );
  const xDefault =
    defaultRepresentation?.visibility === "public"
      ? localizedHref(
          matched.canonicalBinding,
          site.id,
          defaultRepresentation.locale,
          publicRoute(page),
        )
      : undefined;
  return {
    publication,
    binding: matched.canonicalBinding,
    context,
    entity,
    facet,
    site,
    page,
    representation: actual,
    locale: canonicalLocaleTag(actual.locale),
    localeKey,
    source,
    visibility: loaded.visibility ?? source.visibility,
    properties,
    canonical: localizedHref(matched.canonicalBinding, site.id, actual.locale, publicRoute(page)),
    alternates: advertisedHreflang({ pageId: page.id, representations }).map((alternate) => ({
      hreflang: alternate.hreflang,
      href: localizedHref(matched.canonicalBinding, site.id, alternate.hreflang, publicRoute(page)),
    })),
    ...(xDefault === undefined ? {} : { xDefault }),
    navigation: navigationFor({
      capsule,
      entityId: entity.id,
      facetId: facet.id,
      site,
      page,
      binding: matched.canonicalBinding,
      localeKey,
    }),
    home: publicRoute(page).length === 0,
  };
}

/** The public path a view would serve, including the binding prefix and Site selector when open. */
export function efsPublicSegments(view: EfsView): readonly string[] {
  return contentSegments(view.binding, {
    siteId: view.site.id,
    locale: view.locale,
    localeKey: view.localeKey,
    pageRoute: publicRoute(view.page),
  });
}

/**
 * THE `og:image` ONE PUBLISHED PAGE ADVERTISES (`GEO-03` R04-C21, corrected by `R04-C21-R02`)
 * =======================================================================================
 *
 * The site/locale root's absolute, owner-scoped image URL, plus the platform facts the SAME shared view
 * renders — so the HTML cannot advertise a size, a type or an origin the endpoint does not serve.
 *
 * WHY IT RESOLVES THE ROOT INSTEAD OF READING THE CURRENT PAGE (the `R04-C21-R02` correction). The endpoint
 * draws the ROOT Page's card from the ROOT Page's cascade. EFS legitimately lets a Page or one representation
 * override or suppress `brand.name`, so deriving the alt or the refusal here from THIS page's properties could
 * advertise an image the root card refuses (a dead URL) or an alt for a brand the card does not display.
 * Matching URL strings would not fix that: the identity must be the SAME OBJECT. This function therefore calls
 * the endpoint's own resolver for the root path and reports what it returns — one identity, one public brand,
 * one refusal condition, for both the image and every Page that advertises it (`D42` §3–§5).
 *
 * `undefined` in exactly the state the endpoint refuses, which is now the only refusal condition (no usable
 * PUBLIC brand on the root).
 */
export interface EfsOpenGraphImageMetadata {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly type: string;
  readonly alt: string;
}

export async function efsOpenGraphImage(view: EfsView): Promise<EfsOpenGraphImageMetadata | undefined> {
  const root = await efsOpenGraphImageForCurrentRequest(
    contentSegments(view.binding, {
      siteId: view.site.id,
      locale: view.locale,
      localeKey: view.localeKey,
      pageRoute: [],
    }),
  );
  if (root === null) return undefined;
  return {
    url: root.url,
    width: OPEN_GRAPH_IMAGE_SIZE.width,
    height: OPEN_GRAPH_IMAGE_SIZE.height,
    type: OPEN_GRAPH_IMAGE_CONTENT_TYPE,
    alt: root.content.siteName,
  };
}

/**
 * THE TWITTER CARD, TIED TO THE SAME ROOT IMAGE (`R04-C21-R02`, finding F4)
 * ======================================================================
 *
 * The released product emits `twitter.card`, `title`, `description` and `images` (`@/core/seo-metadata`
 * `buildTwitterData`), with `summary_large_image` and the page's own title/description. That contract is
 * preserved here for EFS Pages rather than invented: the card type and the text are the page's, while the
 * IMAGE is the very URL the root card answers at — so a Twitter card can never point somewhere the Open Graph
 * card would refuse. Callers emit this only when `efsOpenGraphImage` returned an image, so a refused root
 * advertises no Twitter image either.
 */
export function efsTwitterCard(
  view: EfsView,
  imageUrl: string,
): {
  readonly card: "summary_large_image";
  readonly title: string;
  readonly description: string;
  readonly images: string[];
} {
  return {
    card: "summary_large_image",
    title: efsTitle(view),
    description: efsDescription(view) ?? "",
    images: [imageUrl],
  };
}



/**
 * THE OPEN GRAPH IMAGE OF THE REQUESTED SITE/LOCALE ROOT (`GEO-03` R04-C21)
 * ======================================================================
 *
 * Resolves a PUBLIC image request through the SAME chain a Page uses — request host → exact binding claim →
 * binding prefix → declared Site → declared locale → the root Page's exact representation → the one property
 * cascade — and hands the authorized facts to the pure model. It returns `null` (→ 404) wherever a Page would
 * refuse, and it never redirects: an image is not a location that can be canonicalized.
 *
 * THREE DELIBERATE DIFFERENCES FROM PAGE RESOLUTION, each one a strictness:
 *
 *   1. EXACT REPRESENTATION ONLY. `allowFallback: false`, so a locale this Site does not declare is refused
 *      instead of being answered by the authored same-Page fallback: a card is not a navigation target, and a
 *      preview labelled with a locale the caller did not ask for would be false with nowhere to redirect to.
 *   2. THE ROOT ONLY. A Page suffix before the reserved segment is refused, so `/<locale>/about/opengraph-image`
 *      is not a second, per-Page identity. The accepted contract is the site/locale card.
 *   3. NO ENTRY COMPLETION. A path with no locale cannot name a locale to draw, and negotiating one from a
 *      cookie or `Accept-Language` would mint an address the caller never asked for.
 */
export async function efsOpenGraphImageForCurrentRequest(
  segments: readonly string[],
): Promise<EfsOpenGraphImage | null> {
  const runtimeValue = runtime();
  if (!runtimeValue) return null;
  const { manifest, capsule } = runtimeValue;
  const host = hostName((await requestHeader("host")) ?? (await requestHeader("x-forwarded-host")));
  if (!host) return null;

  const allBindings = manifest.publications.flatMap((publication) => publication.bindings);
  const matched = matchBinding(host, `/${segments.join("/")}`, allBindings);
  if (!matched) return null;

  const publication = publicationForBinding(manifest.publications, matched.binding);
  if (!publication) return null;
  // The publication's explicit owner and the Installation's declared hierarchy — never a hostname resemblance.
  const owner = efsPublicationOwnerForRequest(publication, host);
  if (owner.kind === "refused") return null;
  const context = owner.context;

  const parsed = parseContentRoute(matched.binding, matched.remaining);
  if (parsed.kind !== "route") return null;
  if (parsed.route.pageRoute.length !== 0) return null;

  const located = findSite(
    manifest,
    matched.binding.entityId,
    matched.binding.facetId,
    parsed.route.siteId,
  );
  if (!located) return null;
  const { entity, facet, site } = located;

  const page = pageForRoute(site, []);
  if (!page) return null;

  const representations = loadedRepresentations({
    capsule,
    entityId: entity.id,
    facetId: facet.id,
    siteId: site.id,
    page,
  });
  const representation = resolveRepresentation(
    { pageId: page.id, fallbackLocaleKey: page.fallbackLocaleKey, representations },
    parsed.route.locale,
    { allowFallback: false },
  );
  if (representation.kind !== "render") return null;
  const actual = representation.representation;
  const loaded = representations.find(
    (candidate) => localePathKey(candidate.locale) === localePathKey(actual.locale),
  );
  if (!loaded) return null;

  const declaration = page.representations.find(
    (candidate) => localePathKey(candidate.locale) === localePathKey(actual.locale),
  );
  const properties = resolveProperties([
    { level: "entity", id: entity.id, properties: entity.properties },
    { level: "facet", id: facet.id, properties: facet.properties },
    { level: "site", id: site.id, properties: site.properties },
    { level: "page", id: page.id, properties: page.properties },
    { level: "representation", id: actual.locale, properties: declaration?.properties },
  ]);

  // `D40`-C: the PUBLIC `brand.name`, else the owner Spoke's configured name — never a private value.
  const brand = resolvePublicFacts(properties, {
    "brand.name": context.siteConfig.name,
  }).get("brand.name");

  return openGraphImageForEfs({
    brandName: brand.value,
    description: contentDescription(loaded.source),
    title: contentTitle(loaded.source, page),
    canonicalRoot: canonicalUrl(matched.canonicalBinding, {
      siteId: site.id,
      locale: canonicalLocaleTag(actual.locale),
      localeKey: localePathKey(actual.locale),
      pageRoute: [],
    }),
  });
}

/** Presentation-neutral title/description helpers for metadata. */
export function efsTitle(view: EfsView): string {
  return contentTitle(view.source, view.page);
}

export function efsDescription(view: EfsView): string | undefined {
  const localized = view.properties.get(`description.${view.localeKey}`);
  if (localized?.public && typeof localized.value === "string" && localized.value.trim()) {
    return localized.value;
  }
  return contentDescription(view.source);
}

/** The metadata language map: public `hreflang` values plus a truthful optional `x-default`. */
export function efsLanguageAlternates(view: EfsView): Record<string, string> | undefined {
  const languages = Object.fromEntries(
    view.alternates.map((alternate) => [alternate.hreflang, alternate.href]),
  );
  if (view.xDefault !== undefined) languages["x-default"] = view.xDefault;
  return Object.keys(languages).length === 0 ? undefined : languages;
}

/** The explicit discoverability directive for an unlisted effective representation. */
export function efsRobots(
  view: EfsView,
): { readonly index: false; readonly follow: false } | undefined {
  return view.visibility === "unlisted" ? { index: false, follow: false } : undefined;
}


/** EFS sitemap entries for the request host, or `null` when EFS does not claim it. */
export async function efsSitemapForCurrentRequest(): Promise<
  { readonly url: string; readonly lastModified: Date }[] | null
> {
  const runtimeValue = runtime();
  if (!runtimeValue) return null;
  const host = hostName((await requestHeader("host")) ?? (await requestHeader("x-forwarded-host")));
  if (!host) return null;
  const claimed: { publication: EfsPublicationDeclaration; binding: EfsBinding }[] = [];
  for (const publication of runtimeValue.manifest.publications) {
    for (const binding of publication.bindings) {
      if (binding.canonical === false || binding.host.toLowerCase() !== host.toLowerCase()) continue;
      // Discovery uses the SAME owner rule as Page and asset resolution. A binding whose
      // publication has no verified owner contributes nothing — it cannot leak a sitemap entry.
      const owner = efsPublicationOwnerForRequest(publication, host);
      if (owner.kind === "refused") return null;
      claimed.push({ publication, binding });
    }
  }
  if (claimed.length === 0) return null;

  const lastModified = new Date();
  const urls = new Set<string>();
  for (const { binding } of claimed) {
    const entity = runtimeValue.manifest.entities.find((candidate) => candidate.id === binding.entityId);
    const facet = entity?.facets.find((candidate) => candidate.id === binding.facetId);
    if (!facet) continue;
    const pages: DiscoveryPage[] = [];
    for (const site of facet.sites) {
      if (!binding.siteIds.includes(site.id)) continue;
      for (const page of site.pages) {
        const representations = loadedRepresentations({
          capsule: runtimeValue.capsule,
          entityId: binding.entityId,
          facetId: binding.facetId,
          siteId: site.id,
          page,
        }).map((representation) => ({
          locale: representation.locale,
          visibility: representation.visibility ?? representation.source.visibility,
        }));
        pages.push({
          pageId: page.id,
          siteId: site.id,
          route: page.route,
          representations,
        });
      }
    }
    for (const entry of sitemapEntries(binding, pages)) {
      urls.add(entry.loc);
    }
  }
  return [...urls].map((url) => ({ url, lastModified }));
}

/** The canonical sitemap URL for an EFS host, or `null` when EFS does not claim it. */
export async function efsSitemapUrlForCurrentRequest(): Promise<string | null> {
  const runtimeValue = runtime();
  if (!runtimeValue) return null;
  const host = hostName((await requestHeader("host")) ?? (await requestHeader("x-forwarded-host")));
  if (!host) return null;
  for (const publication of runtimeValue.manifest.publications) {
    const binding = publication.bindings.find(
      (candidate) =>
        candidate.canonical !== false && candidate.host.toLowerCase() === host.toLowerCase(),
    );
    if (!binding) continue;
    const owner = efsPublicationOwnerForRequest(publication, host);
    if (owner.kind === "refused") return null;
    return `https://${binding.host}/sitemap.xml`;
  }
  return null;
}
