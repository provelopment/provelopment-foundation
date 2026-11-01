import { pageRoutePath, pageRoutePathSegments } from "./page-route-path";
import {
  locationSelectionIssue,
  locationSelectionPolicyFrom,
  type AuthoredLocationSelection,
  type LocationSelectionPolicy,
} from "./location-selection";
import { isRegionBoundToLocale } from "./regional-pages";
import type { PageRegionBinding } from "./region";
import {
  defaultSiteLabel,
  isSiteCode,
  normalizeSiteCode,
  WORLDWIDE_SITE_CODE,
} from "./site-code";
import { siteIdIssue } from "./site-identity";
import {
  isLocalePathKey,
  resolveSiteLocale,
  type ResolvedSiteLocale,
  type SiteLocaleInput,
} from "./site-locale";

/**
 * THE SITE-CONTEXT CONTRACT (FOUNDATION-S1)
 * ========================================
 *
 * Language and site identity are INDEPENDENT, and a page is identified by
 *
 *     site + locale + route
 *
 * A SITE is an independent page/configuration context, normally a COUNTRY (`ca`, `fr`, `ch`, `id`,
 * `jp`) or Foundation's reserved WORLDWIDE site `ww` (`@/core/site-code`). A site owns its own
 * authored pages (`content/pages/<mode>/<site>/<locale>/…`), its own supported locales, its own
 * default locale and its own locale-fallback policy.
 *
 *   LOCALE    the language version WITHIN one site. The same path key in two sites is two
 *             independent page trees: `ca/fr/about` and `fr/fr/about` never answer each other.
 *   LOCATION  physical/business-place metadata (a region) INSIDE a site, for offices that SHARE
 *             one page tree. A site is never a physical location.
 *
 * THE PUBLIC URL IS THE CONTENT PATH
 * ---------------------------------
 * The site code is the FIRST URL segment, always — no hidden default segment, no second "path
 * prefix" concept:
 *
 *     content/pages/markdown/ca/en/about.md  → /ca/en/about
 *     content/pages/markdown/fr/fr/about.md  → /fr/fr/about
 *
 * `/` and a bare site path (`/ca`) belong to the redirect/negotiation layer (`src/proxy.ts`),
 * which resolves them to `<site>/<locale>`. Keeping the mapping this literal is what lets a later
 * HOST-based adapter choose a site without touching a single content path.
 *
 * NO CROSS-SITE FALLBACK — THE HARD RULE
 * -------------------------------------
 * Resolution may fall between locales ONLY inside the SAME site, and only when that site permits
 * it. A request names exactly one site, the page-source providers are bound to that site's tree,
 * and the request's default locale is the SITE's — so a cross-site answer is unrepresentable
 * rather than merely forbidden.
 *
 * Framework-neutral: pure data + types only.
 */

/**
 * The site a deployment gets when it declares none: the Worldwide / Global site.
 *
 * `GEO-03` R04 deliberately leaves this alone. The presentation identity has no implicit default — an
 * absent `presentationSiteCode` means no shared shell, and a declared one must name a Site its owning
 * Spoke really declares — but THIS is the legacy single-site resolver ('Foundation-S1'), which a
 * deployment may still use without declaring a `sites` block. Retiring the worldwide site identity
 * from the geographic runtime is `GEO-04`'s work, not the reference migration's.
 */
export const IMPLICIT_SITE_CODE = WORLDWIDE_SITE_CODE;

/** One site as an adopter declares it; everything except `code` has a documented default. */
export interface SiteInput {
  /** The two-letter country code (or `ww`), case-insensitive; stored lowercase. */
  readonly code: string;
  /** Visitor-facing name. Absent → the country code, or `Worldwide` for `ww`. */
  readonly label?: string;
  /** The locale path keys this site serves (simple or full). Absent → every declared locale. */
  readonly locales?: readonly (string | SiteLocaleInput)[];
  /** The site's default locale PATH KEY. Absent → the deployment's default locale path key. */
  readonly defaultLocale?: string;
  /** Whether the site's default locale may answer its other locales. Absent → `true`. */
  readonly fallback?: boolean;
  /**
   * LOC1 — this Site's OPTIONAL Location-selection policy (`locationSelection`), exactly as authored.
   *
   * Absent → the established optional behaviour (an unspecified Location state exists). The resolver
   * copies the policy through the ONE shape rule and never infers one; the cross-reference rules (does
   * the default Location exist, belong to THIS Site and have a usable landing?) belong to
   * `@/core/location-selection` and are applied at configuration/build time.
   */
  readonly locationSelection?: AuthoredLocationSelection | undefined;
}

/** A site, fully resolved: every leaf determined, nothing left to infer. */
export interface ResolvedSite {
  /** The lowercase site code: the content directory AND the first URL segment. */
  readonly code: string;
  readonly label: string;
  /** The locales this site serves, in configuration order, with canonical tags resolved. */
  readonly locales: readonly ResolvedSiteLocale[];
  /** The PATH KEY of the locale that answers when none of the site's locales is requested. */
  readonly defaultLocale: string;
  /** Whether the site's default locale may stand in for its other locales. */
  readonly fallback: boolean;
  /** True for the ONE configured default site (the site `/` negotiates to). */
  readonly isDefault: boolean;
  /**
   * EFS — the EXPLICIT public path segments this Site occupies, when they are not its `code`.
   *
   * A legacy Site's public base is exactly `/<code>`. An EFS presentation Site is composed for a
   * publication binding, whose public base may be a dedicated root (`[]`), one prefix segment
   * (`["ww"]`) or several (`["us","west"]`), and may include a Site-open selector. The value is
   * supplied by the publication context — it is never derived from a name, a hostname or a locale.
   * When absent, `sitePrefixPath()` retains the released `/<code>` behaviour byte-for-byte.
   */
  readonly publicPathBase?: readonly string[];
  /**
   * LOC1 — this Site's Location-selection policy, or `null`/absent for the established optional
   * behaviour.
   *
   * `required` means the Site has NO visitor-facing unspecified Location state: its non-regional public
   * paths are completed into the configured default Location (`@/core/location-selection`), and its
   * Location selector offers no unspecified option. It travels WITH the Site, so it is scoped by Site by
   * construction — a policy can only ever be read for the Site that declares it.
   */
  readonly locationSelection?: LocationSelectionPolicy | null;
}

/** Every site of a deployment, plus the one `/` resolves to. */
export interface SiteSet {
  readonly sites: readonly ResolvedSite[];
  readonly defaultSite: ResolvedSite;
}

/** A configuration that cannot describe a coherent set of sites. */
export class SiteConfigurationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid site configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "SiteConfigurationError";
    this.issues = issues;
  }
}

export interface ResolveSitesOptions {
  /** The declared sites. Absent/empty → ONE implicit site (`ww`) — the shipped case. */
  readonly input?: readonly SiteInput[] | undefined;
  /** The configured default site code. Absent → the first declared site. */
  readonly defaultSite?: string | undefined;
  /** The deployment's default locale PATH KEY (used by a site that declares none). */
  readonly defaultLocale: string;
  /** Every locale path key the deployment knows (the i18n registry). */
  readonly locales: readonly string[];
}

/**
 * Resolves the declared sites into a complete, deterministic `SiteSet`. Every rule is loud: a
 * configuration that cannot be honoured is refused, never guessed.
 *
 * Refused here (and therefore by the schema too, which calls this same function):
 *  - a code outside the recognized set (`canada`, `main`, `europe` are not site codes);
 *  - a duplicate site, or a locale the deployment does not declare;
 *  - a site default locale that is not one of that site's own path keys;
 *  - TWO locales of one site that resolve to the SAME canonical tag (`en` + `en-ca` in `ca` would
 *    both be `en-CA`): the author must choose the simple form or the explicit one;
 *  - a `defaultSite` that is not declared.
 */
export function resolveSites(options: ResolveSitesOptions): SiteSet {
  const { defaultLocale, locales } = options;
  const issues: string[] = [];

  if (!isLocalePathKey(defaultLocale) || !locales.includes(defaultLocale)) {
    issues.push(
      `the deployment default locale "${defaultLocale}" must be one of the declared locale path keys`,
    );
  }
  for (const locale of locales) {
    if (!isLocalePathKey(locale)) {
      issues.push(
        `declared locale "${locale}" must be a lowercase path key such as "en" or "fr-ca"`,
      );
    }
  }

  const declared: readonly SiteInput[] =
    options.input === undefined || options.input.length === 0
      ? [{ code: IMPLICIT_SITE_CODE }]
      : options.input;

  const seenCodes = new Set<string>();
  const sites = declared.map((raw) => {
    const codeIssue = siteIdIssue(raw.code);
    if (codeIssue !== null) issues.push(codeIssue);
    const code = normalizeSiteCode(raw.code);
    if (seenCodes.has(code)) issues.push(`duplicate site "${code}"`);
    seenCodes.add(code);

    // LOC1/LOC2 — THE SITE'S OWN LOCATION-SELECTION POLICY, projected through the ONE authority
    // (`@/core/location-selection` — the very predicate the configuration schema applies, so a LOC2
    // `localeDefaults` refinement can never be dropped on the way to the runtime). A block that is
    // present but unusable is REPORTED, never silently dropped: a policy that reads as if it did
    // something while doing nothing is exactly the outcome worth a loud failure.
    const authoredLocationSelection = raw.locationSelection;
    const locationSelection: LocationSelectionPolicy | null =
      locationSelectionPolicyFrom(authoredLocationSelection);
    if (authoredLocationSelection !== undefined && locationSelection === null) {
      issues.push(`site "${code}": ${locationSelectionIssue(authoredLocationSelection)}`);
    }

    const localeInputs: readonly (string | SiteLocaleInput)[] = raw.locales ?? locales;
    if (localeInputs.length === 0) issues.push(`site "${code}" must list at least one locale`);

    const resolvedLocales: ResolvedSiteLocale[] = [];
    const seenPaths = new Set<string>();
    const seenCanonicals = new Map<string, string>();

    for (const entry of localeInputs) {
      const path = (typeof entry === "string" ? entry : entry.path).trim().toLowerCase();
      if (!isLocalePathKey(path)) {
        issues.push(`site "${code}": locale "${path}" must be a lowercase path key`);
        continue;
      }
      if (!locales.includes(path)) {
        issues.push(
          `site "${code}": locale "${path}" is not declared in i18n.locales ` +
            "(add it there and give it a dictionary)",
        );
      }
      if (seenPaths.has(path)) {
        issues.push(`site "${code}": duplicate locale path key "${path}"`);
        continue;
      }
      seenPaths.add(path);

      const resolved = resolveSiteLocale(code, entry);
      const canonicalKey = resolved.canonical.toLowerCase();
      const previous = seenCanonicals.get(canonicalKey);
      if (previous !== undefined) {
        issues.push(
          `Site "${code}" maps both "${previous}" and "${resolved.path}" to canonical locale ` +
            `"${resolved.canonical}". Keep one locale path and remove the other.`,
        );
        continue;
      }
      seenCanonicals.set(canonicalKey, resolved.path);
      resolvedLocales.push(resolved);
    }

    const siteDefaultLocale = (raw.defaultLocale ?? defaultLocale).trim().toLowerCase();
    if (!seenPaths.has(siteDefaultLocale)) {
      issues.push(
        `site "${code}": defaultLocale "${siteDefaultLocale}" must be one of its locale path keys`,
      );
    }

    return {
      code,
      label: raw.label ?? defaultSiteLabel(code),
      locales: resolvedLocales,
      defaultLocale: siteDefaultLocale,
      fallback: raw.fallback ?? true,
      isDefault: false,
      // LOC1 — the Site's Location-selection policy travels WITH the Site, never beside it: it is a fact
      // about this ONE Site, so it can never be read for, or leak into, another. An absent block is
      // `null` — the established optional behaviour — and the resolver NEVER infers a policy.
      locationSelection,
    };
  });

  const wantedDefault = normalizeSiteCode(options.defaultSite ?? "");
  if (wantedDefault !== "" && !seenCodes.has(wantedDefault)) {
    issues.push(`defaultSite "${options.defaultSite}" is not a declared site`);
  }
  const defaultCode = wantedDefault === "" ? (sites[0]?.code as string) : wantedDefault;
  if (sites.length === 0) issues.push("at least one site must be declared");

  if (issues.length > 0) throw new SiteConfigurationError(issues);

  const resolved = sites.map((site) => ({ ...site, isDefault: site.code === defaultCode }));
  return { sites: resolved, defaultSite: resolved.find((site) => site.isDefault) as ResolvedSite };
}

/** One request's site context: exactly ONE site, one locale, one route path. */
export interface SiteRequest {
  readonly site: ResolvedSite;
  /** The locale PATH KEY the URL names (the content directory and URL segment). */
  readonly localePath: string;
  /** The canonical standards-facing tag for that path key (metadata, hreflang, `lang`). */
  readonly locale: string;
  /** The page's route path inside its site+locale directory (`""` = the locale root). */
  readonly routePath: string;
  /** The URL's first segment: the site code. */
  readonly scope: string;
}

/** The site with this code, or `undefined` — an undeclared site serves nothing. */
export function siteByCode(set: SiteSet, code: string): ResolvedSite | undefined {
  const wanted = normalizeSiteCode(code);
  return set.sites.find((site) => site.code === wanted);
}

/** Whether a site serves a locale path key. Anything else is not a page request. */
export function siteSupportsLocalePath(site: ResolvedSite, localePath: string): boolean {
  return site.locales.some((locale) => locale.path === localePath);
}

/** The site's public prefix as a URL fragment: `/<code>`, or its explicit EFS public base. */
export function sitePrefixPath(site: ResolvedSite): string {
  if (site.publicPathBase === undefined) return `/${site.code}`;
  return site.publicPathBase.length === 0 ? "" : `/${site.publicPathBase.join("/")}`;
}

/** The URL every page of a site+locale hangs from: `/ca/en`. */
export function siteLocalePath(site: ResolvedSite, localePath: string): string {
  return `${sitePrefixPath(site)}/${localePath}`;
}

/**
 * The public URL of one page: the ONE path builder for site-scoped URLs.
 *
 * `routePath` is the page's canonical route path (`""` = the locale root, i.e. the home page). A
 * malformed route path yields `null`, so a caller can never publish a URL it has not validated.
 */
export function sitePath(site: ResolvedSite, localePath: string, routePath = ""): string | null {
  if (routePath === "") return siteLocalePath(site, localePath);
  if (pageRoutePathSegments(routePath).length === 0) return null;
  return `${siteLocalePath(site, localePath)}/${routePath}`;
}

/** A site's home URL (its default locale's root). */
export function siteHomePath(site: ResolvedSite): string {
  return siteLocalePath(site, site.defaultLocale);
}

/**
 * Resolves URL path segments to exactly ONE site context, or `null`.
 *
 * The first segment MUST be a declared site code and the second one of THAT site's locale path
 * keys: a URL never names a site implicitly, so no request can be answered from a site it did not
 * name. A bare site path (`/ca`) resolves to nothing here — completing it is the redirect layer's
 * job, never a rendered page's.
 */
export function resolveSiteRequest(
  set: SiteSet,
  segments: readonly string[],
): SiteRequest | null {
  if (segments.length === 0) return null;

  // EFS — a presentation Site may occupy an EXPLICIT public base that is not its code. The base is
  // matched first; a legacy Site has no base and keeps the released `/<code>` rule below.
  let site: ResolvedSite | undefined;
  let cursor = 0;
  for (const candidate of set.sites) {
    const base = candidate.publicPathBase;
    if (base === undefined) continue;
    if (segments.length < base.length) continue;
    if (base.every((segment, index) => segments[index] === segment)) {
      site = candidate;
      cursor = base.length;
      break;
    }
  }
  if (site === undefined) {
    site = siteByCode(set, segments[0] as string);
    if (site === undefined) return null;
    cursor = 1;
  }

  const localePath = segments[cursor];
  if (localePath === undefined) return null;
  const locale = site.locales.find((entry) => entry.path === localePath);
  if (locale === undefined) return null;

  const routeSegments = segments.slice(cursor + 1);
  const routePath = routeSegments.length === 0 ? "" : pageRoutePath(...routeSegments);
  if (routePath === null) return null;

  return { site, localePath, locale: locale.canonical, routePath, scope: site.code };
}

/** Every site code the deployment serves, in configuration order (the URL's first segments). */
export function siteScopeSegments(set: SiteSet): readonly string[] {
  return set.sites.map((site) => site.code);
}

/** Every (site, locale) pair the deployment serves, in configuration order. */
export function siteLocalePairs(
  set: SiteSet,
): readonly {
  readonly site: ResolvedSite;
  readonly localePath: string;
  readonly locale: ResolvedSiteLocale;
}[] {
  return set.sites.flatMap((site) =>
    site.locales.map((locale) => ({ site, localePath: locale.path, locale })),
  );
}

/**
 * S1E2 — THE LOCALE A VISITOR GETS WHEN THEY SWITCH TO ANOTHER SITE: one rule, no guessing.
 *
 *   1. the SAME locale path key, when the target serves it (`ca/fr` → `fr` site's `fr`);
 *   2. otherwise a target locale with the same canonical LANGUAGE subtag, but ONLY when there is
 *      exactly ONE such candidate: a target serving both `fr-ca` and `fr-fr` is a real choice the
 *      visitor must make, so the switch never invents one of them;
 *   3. otherwise the target site's default locale.
 */
export function siteSwitchLocalePath(target: ResolvedSite, localePath: string): string {
  if (siteSupportsLocalePath(target, localePath)) return localePath;

  const [language] = localePath.split("-");
  if (language !== undefined && language !== "") {
    const sameLanguage = target.locales.filter((locale) => locale.path.split("-")[0] === language);
    if (sameLanguage.length === 1) return (sameLanguage[0] as ResolvedSiteLocale).path;
  }

  return target.defaultLocale;
}

/**
 * Where a visitor lands after switching to another site: keep the current route when the target
 * serves it, otherwise the target's HOME in the chosen locale — so an independent page inventory
 * never produces a meaningless 404, and never another site's page.
 */
export function siteSwitchDestination(options: {
  readonly target: ResolvedSite;
  readonly localePath: string;
  readonly routePath: string;
  /** Whether the target serves this route path (checked by the caller: page tree + regions). */
  readonly routeExists: boolean;
}): string {
  const { target, localePath, routePath, routeExists } = options;
  if (!routeExists) return siteHomePath(target);
  const destination = siteSwitchLocalePath(target, localePath);
  return sitePath(target, destination, routePath) ?? siteHomePath(target);
}

/**
 * S1E2 — A CONFIGURED DESTINATION, RESOLVED INSIDE ONE SITE+LOCALE.
 *
 * A SITE-RELATIVE href (`/`, `/about`, `/legal/privacy`) is a route path in the CURRENT site, so
 * the site+locale prefix is added: `/<site>/<locale>/about`. The site is never guessed from the
 * route string, which is what keeps two independent page trees with the same route names apart.
 *
 * A FULLY SITE-SCOPED href (`/ca/en/about`) already names its site — including another site — and
 * is left exactly as written: linking across sites is a deliberate authoring choice, never an
 * accident of a matching route string. External destinations (`https:`, `mailto:`, `tel:`, a bare
 * fragment) are never rewritten.
 */
export function siteHref(site: ResolvedSite, localePath: string, href: string): string {
  if (!href.startsWith("/")) return href;

  const [first] = href.slice(1).split("/");
  if (first !== undefined && isSiteCode(first)) return href;

  const prefix = siteLocalePath(site, localePath);
  if (href === "/") return prefix === "" ? "/" : prefix;
  return `${prefix}${href}`;
}

/** The `SiteSet` view of a resolved site list and its default site. */
export function siteSetOf(sites: readonly ResolvedSite[], defaultSite: ResolvedSite): SiteSet {
  return { sites, defaultSite };
}


/** One pathname's meaning, as the client components must read it (URL-authoritative). */
export interface PathContext {
  readonly site: ResolvedSite;
  readonly localePath: string;
  readonly locale: string;
  /** A region id bound to the locale when the path is inside a region namespace, else null. */
  readonly region: string | null;
  /** The page route path inside the region (`region` set) or inside the site (`""` = root). */
  readonly routePath: string;
}

/**
 * Parses a client-side pathname into its site context — and, inside a region namespace, its
 * region. The middle segment is only a region when it is actually bound to THAT locale.
 */
export function resolvePathContext(
  set: SiteSet,
  entries: readonly PageRegionBinding[],
  pathname: string,
): PathContext | null {
  const segments = pathname.split("/").filter(Boolean);
  const request = resolveSiteRequest(set, segments);
  if (request === null) return null;

  const region = firstRouteSegment(request.routePath);
  if (region === undefined || !isRegionBoundToLocale(entries, request.localePath, region)) {
    return {
      site: request.site,
      localePath: request.localePath,
      locale: request.locale,
      region: null,
      routePath: request.routePath,
    };
  }

  const slug = request.routePath.slice(region.length + 1);
  return {
    site: request.site,
    localePath: request.localePath,
    locale: request.locale,
    region,
    routePath: slug,
  };
}

/**
 * The pathname's site context, or the DEFAULT site at `fallbackLocalePath` when the pathname does
 * not name a site (an unknown path). Client components use this so their links, selectors and
 * region detection always work from the URL they are on — and never invent a site.
 */
export function pathContextOr(
  set: SiteSet,
  entries: readonly PageRegionBinding[],
  pathname: string,
  fallbackLocalePath: string,
): PathContext {
  const fallback =
    set.defaultSite.locales.find((locale) => locale.path === fallbackLocalePath) ??
    set.defaultSite.locales.find((locale) => locale.path === set.defaultSite.defaultLocale);
  return (
    resolvePathContext(set, entries, pathname) ?? {
      site: set.defaultSite,
      localePath: fallback?.path ?? set.defaultSite.defaultLocale,
      locale: fallback?.canonical ?? set.defaultSite.defaultLocale,
      region: null,
      routePath: "",
    }
  );
}

function firstRouteSegment(routePath: string): string | undefined {
  const [first] = routePath.split("/");
  return first === "" ? undefined : first;
}


