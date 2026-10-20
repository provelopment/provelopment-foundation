/**
 * ORDINARY ONE-WEBSITE ESTABLISHMENT BECOMES AN EXPLICIT EFS INSTALLATION (`S3-E3-R06`)
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
 * already carries `efs/manifest.json` is left exactly as authored, including every Entity identity
 * and publication.
 *
 * TWO AUTHORITIES ARE NOT INFERRED
 * -------------------------------
 *   · The EntityID is minted ONCE from the 16 bytes the caller supplies through the establishment
 *     entropy port. It is never derived from a name, host, Site, repository, path, clock or label,
 *     and an already-explicit seed is never re-minted.
 *   · The publication host is authored in `site.config.json` as `publication.host`. `site.url` is
 *     ordinary authored information and is NEVER read here: a content property cannot create a
 *     public claim or change a canonical address.
 *
 * The generated Spoke id (`main`) is an authoring-time default recorded in `spokes.json`, not a
 * hidden runtime exemption: from that moment every request resolves it from the declaration like any
 * other Spoke. The conversion never runs at request time.
 */
import { mintEntityId } from "@/core/efs/identity";
import { normalizeBindingHost, normalizePrefix } from "@/core/efs/publication";

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

/** The one authority that mints an Entity identity; it answers exactly 16 secure bytes. */
export type EntityIdEntropySource = () => Uint8Array;

const SPOKE_ID = "main";
const FACET_ID = "main";
const SPOKE_ROOT = `spokes/${SPOKE_ID}`;

interface RawSite {
  readonly code?: unknown;
  readonly label?: unknown;
  readonly locales?: unknown;
  readonly defaultLocale?: unknown;
}

/**
 * The explicit publication authority. A host is required; a prefix is optional and, when absent,
 * defaults to this Site's code (the ordinary authoring default). A content URL is deliberately not
 * part of this shape.
 */
interface RawPublication {
  readonly host?: unknown;
  readonly prefix?: unknown;
}

interface RawConfiguration {
  readonly site?: {
    /** Ordinary authored information. Never a binding, canonical origin or publication authority. */
    readonly url?: unknown;
    readonly name?: unknown;
    readonly tagline?: unknown;
    readonly description?: unknown;
  };
  readonly publication?: RawPublication;
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

/** The one explicit host/prefix authority, or an actionable refusal. */
function publicationAuthority(
  config: RawConfiguration,
  siteCode: string,
  siteCount: number,
): { host: string; prefix: readonly string[] } {
  const host = text(config.publication?.host);
  if (host === undefined) {
    throw new Error(
      "The authored site.config.json declares no publication host. Add " +
        '`"publication": { "host": "<public hostname>" }`; `site.url` is informational and never ' +
        "creates a publication claim.",
    );
  }

  let normalizedHost: string;
  try {
    normalizedHost = normalizeBindingHost(host);
  } catch (error) {
    throw new Error(
      `The authored publication.host is not a usable hostname: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const rawPrefix = config.publication?.prefix;
  if (rawPrefix !== undefined && siteCount > 1) {
    throw new Error(
      "publication.prefix is ambiguous for an Installation with more than one Site. Declare one " +
        "publication per Site; the ordinary single-website default remains the Site code.",
    );
  }
  const prefix =
    rawPrefix === undefined
      ? [safeSegment(siteCode)]
      : normalizePrefix(
          Array.isArray(rawPrefix)
            ? rawPrefix.flatMap((segment) => (text(segment) ? [text(segment) as string] : []))
            : text(rawPrefix) ?? "",
        );

  return { host: normalizedHost, prefix };
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
 *
 * `entityEntropy` is invoked ONLY when the seed is not already explicit. That is what prevents a
 * later establishment, import or move from re-minting an identity the authored Installation already
 * carries.
 */
export function explicitSingleWebsiteEfsSeed(
  files: readonly EfsSeedFile[],
  entityEntropy: EntityIdEntropySource,
): ExplicitEfsSeed {
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

  // THE IDENTITY IS MINTED ONCE, FROM INJECTED SECURE ENTROPY. No authored value is consulted: a
  // name, URL, Site, repository, path or label can never decide it.
  const entityId = mintEntityId(entityEntropy());

  const globalLocales = (config.i18n?.locales ?? [])
    .map((locale) => text(locale.code))
    .filter((locale): locale is string => locale !== undefined);
  const globalDefault = text(config.i18n?.defaultLocale) ?? globalLocales[0];
  const sites = configuredSites(config);
  const brandName = text(config.site?.name) ?? "Website";
  const moved: EfsSeedFile[] = files
    .filter((file) => file.path !== ".gitignore")
    .map((file) => ({ path: `${SPOKE_ROOT}/${file.path}`, bytes: file.bytes }));

  const declaredSites = sites.map((site) => {
    const locales = [
      ...new Set((site.locales && site.locales.length > 0 ? site.locales : globalLocales).filter(Boolean)),
    ];
    const authority = publicationAuthority(config, site.code, sites.length);
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
          path: `efs/capsule/${entityId}/${FACET_ID}/${safeSegment(site.code)}/pages/${pageId}/${safeSegment(
            locale,
          )}${source.path.endsWith(".json") ? ".json" : ".md"}`,
          bytes: source.bytes,
        });
      }
    }

    // AN ORDINARY WEBSITE MAY NOT HAVE AUTHORED A HOME PAGE. The reserved `home` route is the
    // Site's root representation, so leaving it absent would turn establishment into a guaranteed
    // runtime 404. Supply the smallest valid explicit starter document instead of inventing a route
    // at request time. An authored Home — in any locale — is never changed.
    const hasAuthoredHome = [...pages.values()].some(
      (page) => page.route.length === 1 && page.route[0] === "home",
    );
    if (!hasAuthoredHome && locales.length > 0) {
      const home = { id: "home", route: ["home"], representations: [] as { locale: string }[] };
      for (const locale of locales) {
        home.representations.push({ locale });
        pageFiles.push({
          path: `efs/capsule/${entityId}/${FACET_ID}/${safeSegment(
            site.code,
          )}/pages/home/${safeSegment(locale)}.json`,
          bytes: encoder.encode(
            `${JSON.stringify({ schemaVersion: 1, title: brandName, sections: [] }, null, 2)}\n`,
          ),
        });
      }
      pages.set("home", home);
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
        entityId,
        facetId: FACET_ID,
        bindings: [
          {
            id: `${SPOKE_ID}-${safeSegment(site.code)}-web`,
            host: authority.host,
            prefix: authority.prefix,
            entityId,
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
    "brand.name": { value: brandName, public: true },
  };
  const tagline = text(config.site?.tagline);
  if (tagline !== undefined) properties["brand.tagline"] = { value: tagline, public: true };
  const description = text(config.site?.description);
  if (description !== undefined) {
    properties["brand.description"] = { value: description, public: true };
  }
  const email = text(config.contact?.email);
  if (email !== undefined) properties["contact.email"] = { value: email, public: true };

  const manifest = {
    entities: [
      {
        id: entityId,
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
