import { existsSync } from "node:fs";
import { join } from "node:path";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { loadEfsPageSource, type EfsPageSource } from "@/adapters/content/efs-content";
import {
  canonicalUrl,
  contentSegments,
  entryRedirectPath,
  matchBinding,
  parseContentRoute,
  type EfsBinding,
} from "@/core/efs/publication";
import {
  advertisedHreflang,
  canonicalLocaleTag,
  localePathKey,
  resolveRepresentation,
  type PageRepresentation,
} from "@/core/efs/locales";
import { resolveProperties, type EffectiveProperties } from "@/core/efs/properties";
import { sitemapEntries, type DiscoveryPage } from "@/core/efs/discovery";
import { deploymentPaths } from "@/config/deployment-root";
import {
  loadEfsManifest,
  type EfsEntityDeclaration,
  type EfsFacetDeclaration,
  type EfsManifest,
  type EfsPageDeclaration,
  type EfsSiteDeclaration,
} from "@/config/efs/manifest";

/**
 * THE EFS REQUEST/PRESENTATION BOUNDARY (S3-E3)
 * ============================================
 *
 * This is the actual App Router request branch for an explicit EFS publication. It resolves the request
 * host and path through the binding, then the Entity/Facet/Site/Page/representation chain, loads the
 * localized owner source, resolves the one property cascade and composes canonical/hreflang output.
 *
 * Hosts not claimed by the manifest return `null` so the existing reference deployment remains reachable
 * while controlled fixture conversion is completed; that transition is reported, never hidden.
 */
const MANIFEST_ENV = "FOUNDATION_EFS_MANIFEST";
const CAPSULE_ENV = "FOUNDATION_EFS_CAPSULE";
const DEPLOYMENT = deploymentPaths();
const DEFAULT_MANIFEST = join(DEPLOYMENT.root, "efs", "manifest.json");
const DEFAULT_CAPSULE = join(DEPLOYMENT.root, "efs", "capsule");

export interface EfsView {
  readonly binding: EfsBinding;
  readonly entity: EfsEntityDeclaration;
  readonly facet: EfsFacetDeclaration;
  readonly site: EfsSiteDeclaration;
  readonly page: EfsPageDeclaration;
  readonly representation: PageRepresentation;
  readonly locale: string;
  readonly localeKey: string;
  readonly source: EfsPageSource;
  readonly properties: EffectiveProperties;
  readonly canonical: string;
  readonly alternates: readonly { readonly hreflang: string; readonly href: string }[];
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
  // An explicit test/deployment override of the empty string is the only supported way to exercise a
  // legacy installation in tests. An unset override selects the deployment's EFS authority.
  const override = process.env[MANIFEST_ENV];
  if (override === "") return null;
  const manifestPath = override ?? DEFAULT_MANIFEST;
  const capsulePath = process.env[CAPSULE_ENV] ?? DEFAULT_CAPSULE;
  if (!existsSync(manifestPath)) {
    // A deployment that HAS a capsule but no manifest is a broken EFS installation: it must not fall
    // back to the older page/locale runtime and revive retired geographic behaviour.
    if (existsSync(capsulePath)) {
      throw new Error(`EFS manifest is missing at ${manifestPath}; the capsule cannot be served.`);
    }
    return null;
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

function pageForRoute(site: EfsSiteDeclaration, route: readonly string[]): EfsPageDeclaration | undefined {
  const wanted = route.length === 0 ? ["home"] : route;
  return site.pages.find(
    (page) =>
      page.route.length === wanted.length && page.route.every((segment, index) => segment === wanted[index]),
  );
}

function publicRoute(page: EfsPageDeclaration): readonly string[] {
  return page.route.length === 1 && page.route[0] === "home" ? [] : page.route;
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

  const representation = resolveRepresentation(
    { pageId: page.id, fallbackLocaleKey: page.fallbackLocaleKey, representations: page.representations },
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
  const source = loadEfsPageSource({
    root: capsule,
    entityId: entity.id,
    facetId: facet.id,
    siteId: site.id,
    pageId: page.id,
    localeKey: localePathKey(actual.locale),
  });
  if (source.kind === "rejected") notFound();

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

  const localizedPage = {
    pageId: page.id,
    fallbackLocaleKey: page.fallbackLocaleKey,
    representations: page.representations,
  };
  return {
    binding: matched.canonicalBinding,
    entity,
    facet,
    site,
    page,
    representation: actual,
    locale: canonicalLocaleTag(actual.locale),
    localeKey: localePathKey(actual.locale),
    source: source.value,
    properties,
    canonical: localizedHref(matched.canonicalBinding, site.id, actual.locale, publicRoute(page)),
    alternates: advertisedHreflang(localizedPage).map((alternate) => ({
      hreflang: alternate.hreflang,
      href: localizedHref(matched.canonicalBinding, site.id, alternate.hreflang, publicRoute(page)),
    })),
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


/** EFS sitemap entries for the request host, or `null` when EFS does not claim it. */
export async function efsSitemapForCurrentRequest(): Promise<
  { readonly url: string; readonly lastModified: Date }[] | null
> {
  const runtimeValue = runtime();
  if (!runtimeValue) return null;
  const host = hostName((await requestHeader("host")) ?? (await requestHeader("x-forwarded-host")));
  if (!host) return null;
  const claimed = runtimeValue.manifest.publications
    .flatMap((publication) => publication.bindings)
    .filter((binding) => binding.canonical !== false && binding.host.toLowerCase() === host.toLowerCase());
  if (claimed.length === 0) return null;

  const lastModified = new Date();
  const urls = new Set<string>();
  for (const binding of claimed) {
    const entity = runtimeValue.manifest.entities.find((candidate) => candidate.id === binding.entityId);
    const facet = entity?.facets.find((candidate) => candidate.id === binding.facetId);
    if (!facet) continue;
    const pages: DiscoveryPage[] = [];
    for (const site of facet.sites) {
      if (!binding.siteIds.includes(site.id)) continue;
      for (const page of site.pages) {
        pages.push({
          pageId: page.id,
          siteId: site.id,
          route: page.route,
          visibility: page.visibility ?? "public",
          representations: page.representations,
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
  const binding = runtimeValue.manifest.publications
    .flatMap((publication) => publication.bindings)
    .find((candidate) => candidate.canonical !== false && candidate.host.toLowerCase() === host.toLowerCase());
  return binding ? `https://${binding.host}/sitemap.xml` : null;
}
