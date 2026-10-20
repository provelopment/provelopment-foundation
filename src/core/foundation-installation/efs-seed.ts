/**
 * ORDINARY ONE-WEBSITE ESTABLISHMENT BECOMES AN EXPLICIT EFS INSTALLATION (`S3-E3-R05`)
 * ====================================================================================
 *
 * A new owner supplies one ordinary website: `site.config.json`, dictionaries, authored pages and
 * assets. They do not supply EFS vocabulary, and they must not be served by the retired implicit
 * Page/locale runtime either.
 *
 * This module is the establishment-time bridge. It converts that one legacy-shaped authored seed
 * into ONE explicit Installation:
 *
 *   spokes.json                       one declared Spoke, `main`, at `spokes/main/**`
 *   efs/manifest.json                 Entity -> Facet -> Sites -> Pages -> representations,
 *                                     plus an explicit Spoke-owned publication per Site
 *   efs/capsule/**                    owner-scoped copies of every authored Page source
 *
 * The conversion is DATA IN / DATA OUT: no filesystem, no clock, no framework. Source bytes are
 * copied unchanged; only their owner-scoped paths and the explicit declarations are new. A seed that
 * already carries `efs/manifest.json` is left exactly as authored.
 *
 * The generated Spoke id (`main`) is an authoring-time default recorded in `spokes.json`, not a
 * hidden runtime exemption: from that moment every request resolves it from the declaration like any
 * other Spoke. The conversion never runs at request time.
 */
import type { InstallationSeedTopology } from "./establishment";

/** One authored file, relative to the Installation capsule. */
export interface EfsSeedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ExplicitEfsSeed {
  readonly files: readonly EfsSeedFile[];
  readonly topology: InstallationSeedTopology;
}

const SPOKE_ID = "main";
const FACET_ID = "main";
const ENTITY_ID = "e_00000000000000000000000001";
const SPOKE_ROOT = `spokes/${SPOKE_ID}`;

interface RawSite {
  readonly code?: unknown;
  readonly label?: unknown;
  readonly locales?: unknown;
  readonly defaultLocale?: unknown;
}

interface RawConfiguration {
  readonly site?: {
    readonly url?: unknown;
    readonly name?: unknown;
    readonly tagline?: unknown;
    readonly description?: unknown;
  };
  readonly i18n?: {
    readonly defaultLocale?: unknown;
    readonly locales?: readonly { readonly code?: unknown }[];
  };
  readonly sites?: readonly RawSite[];
  readonly defaultSite?: unknown;
  readonly contact?: { readonly email?: unknown };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function safeSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "page";
}

function configuredSites(
  config: RawConfiguration,
): { code: string; label: string; locales?: readonly string[]; defaultLocale?: string }[] {
  const declared = Array.isArray(config.sites) ? config.sites : [];
  const sites = declared.flatMap((site) => {
    const code = text(site.code);
    if (!code) return [];
    const locales = Array.isArray(site.locales)
      ? site.locales.flatMap((locale: unknown) => (text(locale) ? [text(locale) as string] : []))
      : undefined;
    return [
      {
        code,
        label: text(site.label) ?? code,
        ...(locales ? { locales } : {}),
        defaultLocale: text(site.defaultLocale),
      },
    ];
  });
  if (sites.length > 0) return sites;
  const fallback = text(config.defaultSite) ?? "main";
  return [{ code: fallback, label: fallback }];
}


/** The authored Page sources under one Site/locale, JSON taking precedence over Markdown. */
function pageSources(
  files: readonly EfsSeedFile[],
  site: string,
  locale: string,
): { route: string[]; path: string; bytes: Uint8Array }[] {
  const found = new Map<string, { path: string; bytes: Uint8Array }>();
  for (const format of ["markdown", "json"] as const) {
    const prefix = `content/pages/${format}/${site}/${locale}/`;
    const extension = format === "json" ? ".json" : ".md";
    for (const file of files) {
      if (!file.path.startsWith(prefix) || !file.path.endsWith(extension)) continue;
      const rest = file.path.slice(prefix.length, -extension.length);
      if (rest.length === 0) continue;
      found.set(rest, { path: file.path, bytes: file.bytes });
    }
  }
  return [...found.entries()].map(([route, source]) => ({
    route: route.split("/").filter(Boolean),
    ...source,
  }));
}

/**
 * Convert an ordinary one-website seed. A seed that already carries `efs/manifest.json` is returned
 * unchanged, with the explicit topology its own declaration describes.
 */
export function explicitSingleWebsiteEfsSeed(files: readonly EfsSeedFile[]): ExplicitEfsSeed {
  if (files.some((file) => file.path === "efs/manifest.json")) {
    return {
      files,
      topology: { mode: "explicit", spokes: [{ id: SPOKE_ID, locator: SPOKE_ROOT }] },
    };
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const configFile = files.find((file) => file.path === "site.config.json");
  if (!configFile) {
    throw new Error(
      "An ordinary one-website seed must carry site.config.json; there is no website to establish.",
    );
  }
  const config = JSON.parse(decoder.decode(configFile.bytes)) as RawConfiguration;
  const origin = text(config.site?.url);
  if (!origin) {
    throw new Error("The authored site.config.json must declare site.url; an EFS binding needs a host.");
  }
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    throw new Error(`The authored site.url "${origin}" is not an absolute URL.`);
  }

  const globalLocales = (config.i18n?.locales ?? [])
    .map((locale) => text(locale.code))
    .filter((locale): locale is string => locale !== undefined);
  const globalDefault = text(config.i18n?.defaultLocale) ?? globalLocales[0];
  const sites = configuredSites(config);
  const moved: EfsSeedFile[] = files
    .filter((file) => file.path !== ".gitignore")
    .map((file) => ({ path: `${SPOKE_ROOT}/${file.path}`, bytes: file.bytes }));

  const declaredSites = sites.map((site) => {
    const locales = [...new Set((site.locales && site.locales.length > 0 ? site.locales : globalLocales).filter(Boolean))];
    const pages = new Map<
      string,
      { id: string; route: string[]; representations: { locale: string }[] }
    >();
    const pageFiles: EfsSeedFile[] = [];

    for (const locale of locales) {
      for (const source of pageSources(files, site.code, locale)) {
        const key = source.route.join("/");
        const pageId = safeSegment(source.route.join("-"));
        const page = pages.get(key) ?? { id: pageId, route: source.route, representations: [] };
        page.representations.push({ locale });
        pages.set(key, page);
        pageFiles.push({
          path: `efs/capsule/${ENTITY_ID}/${FACET_ID}/${safeSegment(site.code)}/pages/${pageId}/${safeSegment(
            locale,
          )}${source.path.endsWith(".json") ? ".json" : ".md"}`,
          bytes: source.bytes,
        });
      }
    }

    const defaultLocale =
      site.defaultLocale ?? (globalDefault && locales.includes(globalDefault) ? globalDefault : locales[0]);
    return {
      site: {
        id: safeSegment(site.code),
        properties: { "site.label": { value: site.label, public: true } },
        pages: [...pages.values()].sort((a, b) => a.id.localeCompare(b.id)),
      },
      locales,
      defaultLocale,
      pageFiles,
      publication: {
        id: `${SPOKE_ID}-${safeSegment(site.code)}-publication`,
        spokeId: SPOKE_ID,
        presentationSiteCode: site.code,
        entityId: ENTITY_ID,
        facetId: FACET_ID,
        bindings: [
          {
            id: `${SPOKE_ID}-${safeSegment(site.code)}-web`,
            host,
            prefix: [site.code],
            entityId: ENTITY_ID,
            facetId: FACET_ID,
            siteIds: [safeSegment(site.code)],
            siteMode: "closed" as const,
            defaultSiteId: safeSegment(site.code),
            locales,
            defaultLocale,
            canonical: true,
          },
        ],
      },
    };
  });

  const missingLocales = declaredSites.filter((site) => site.locales.length === 0);
  if (missingLocales.length > 0) {
    throw new Error(
      "No authored locale could be declared for at least one Site. An EFS publication needs an explicit locale.",
    );
  }

  const properties: Record<string, { value: unknown; public: boolean }> = {
    "brand.name": { value: text(config.site?.name) ?? "Website", public: true },
    "brand.tagline": { value: text(config.site?.tagline) ?? "", public: true },
    "brand.description": { value: text(config.site?.description) ?? "", public: true },
  };
  if (text(config.contact?.email)) {
    properties["contact.email"] = { value: text(config.contact?.email), public: true };
  }

  const manifest = {
    entities: [
      {
        id: ENTITY_ID,
        properties,
        facets: [
          {
            id: FACET_ID,
            sites: declaredSites.map((site) => site.site),
          },
        ],
      },
    ],
    publications: declaredSites.map((site) => site.publication),
  };

  const generated: EfsSeedFile[] = [
    ...declaredSites.flatMap((site) => site.pageFiles),
    {
      path: "efs/manifest.json",
      bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`),
    },
    {
      path: "spokes.json",
      bytes: encoder.encode(
        `${JSON.stringify({ spokes: [{ id: SPOKE_ID, root: SPOKE_ROOT }] }, null, 2)}\n`,
      ),
    },
  ];

  const gitignore = files.find((file) => file.path === ".gitignore");
  return {
    files: [...moved, ...(gitignore ? [gitignore] : []), ...generated].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    topology: { mode: "explicit", spokes: [{ id: SPOKE_ID, locator: SPOKE_ROOT }] },
  };
}
