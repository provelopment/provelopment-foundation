/**
 * EXPLICIT PUBLICATION BINDINGS (`D31`, Amendment 06)
 * ==================================================
 *
 * A public URL is built from a binding's authored public base. It is never built from an
 * EntityID, SiteID, inherited website/contact URL, `site.url`, source directory or hostname
 * inference. A binding belongs to one explicit Spoke<->Entity publication and selects one
 * Facet, a declared set of eligible Sites and validated host/path claims.
 *
 * On a host, either one dedicated-root binding or only prefix-scoped bindings are legal, never
 * both. Prefixes match whole path segments, deterministically by longest prefix. Duplicate,
 * ambiguous or unclaimed claims fail closed. The same Entity may be republished under another
 * binding without merging the publications or changing any identity.
 *
 * This module is pure data + functions; DNS and provider work remain outside E1.
 */
import { selectEntryLocale, canonicalLocaleTag, localePathKey } from "./locales";

/** Site-closed: one Site in the suffix. Site-open: a Site selector precedes the locale. */
export type EfsSiteMode = "closed" | "open";

/** One explicit public-address binding. */
export interface EfsBinding {
  readonly id: string;
  readonly host: string;
  /** Whole path segments before the Site/locale suffix. Empty means a dedicated root. */
  readonly prefix: readonly string[];
  readonly entityId: string;
  readonly facetId: string;
  readonly siteIds: readonly string[];
  readonly siteMode: EfsSiteMode;
  readonly defaultSiteId?: string;
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  /** `true` for the one canonical route of this binding; aliases point at it. */
  readonly canonical?: boolean;
  /** An alias's canonical binding id. */
  readonly aliasOf?: string;
}

/** A parsed content route after the binding prefix has been removed. */
export interface EfsContentRoute {
  readonly siteId: string;
  readonly locale: string;
  readonly localeKey: string;
  /** Empty means the explicitly authored Home Page. */
  readonly pageRoute: readonly string[];
}

/** Matched request before content parsing. */
export interface MatchedBinding {
  readonly binding: EfsBinding;
  readonly canonicalBinding: EfsBinding;
  readonly remaining: readonly string[];
}

/** Route parse outcome. */
export type RouteResult =
  | { readonly kind: "route"; readonly route: EfsContentRoute }
  | { readonly kind: "rejected"; readonly reason: string };

/** Normalize a host claim (lowercase, no trailing dot). Reject schemes, ports and paths. */
export function normalizeBindingHost(value: string): string {
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (host.length === 0) throw new Error("A binding host must not be empty.");
  if (/[/:#?\\\s]/.test(host)) {
    throw new Error(`A binding host must be a bare hostname, received "${value}".`);
  }
  return host;
}

/** Normalize prefix input into safe whole segments. */
export function normalizePrefix(value: string | readonly string[]): readonly string[] {
  const raw = typeof value === "string" ? value.split("/") : value;
  const segments = raw.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    if (segment === "." || segment === ".." || /[/\\%]/.test(segment)) {
      throw new Error(`Unsafe binding prefix segment "${segment}".`);
    }
  }
  return segments;
}

function prefixKey(prefix: readonly string[]): string {
  return prefix.join("/");
}

function sameSiteSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((site) => rightSet.has(site));
}
/**
 * Validate the complete binding set. Every issue is returned; the caller must refuse startup or
 * publication when the list is non-empty.
 */
export function bindingIssues(bindings: readonly EfsBinding[]): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const binding of bindings) {
    if (binding.id.trim().length === 0) issues.push("A binding id must not be empty.");
    if (ids.has(binding.id)) issues.push(`Duplicate binding id "${binding.id}".`);
    ids.add(binding.id);

    try {
      normalizeBindingHost(binding.host);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    if (binding.siteMode === "closed") {
      if (binding.siteIds.length !== 1) {
        issues.push(`Site-closed binding "${binding.id}" must select exactly one Site.`);
      }
    } else if (binding.siteIds.length < 2) {
      issues.push(`Site-open binding "${binding.id}" must select at least two Sites.`);
    }
    if (new Set(binding.siteIds).size !== binding.siteIds.length) {
      issues.push(`Binding "${binding.id}" repeats a Site id.`);
    }
    if (binding.siteMode === "closed" && binding.defaultSiteId !== binding.siteIds[0]) {
      issues.push(`Site-closed binding "${binding.id}" must default to its only Site.`);
    }
    if (binding.siteMode === "open") {
      if (!binding.defaultSiteId || !binding.siteIds.includes(binding.defaultSiteId)) {
        issues.push(`Site-open binding "${binding.id}" needs an explicit eligible default Site.`);
      }
    }
    if (binding.locales.length === 0) issues.push(`Binding "${binding.id}" has no locales.`);
    try {
      const keys = binding.locales.map(localePathKey);
      if (new Set(keys).size !== keys.length) {
        issues.push(`Binding "${binding.id}" repeats a locale path key.`);
      }
      if (!keys.includes(localePathKey(binding.defaultLocale))) {
        issues.push(`Binding "${binding.id}" default locale is not supported.`);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  const byHost = new Map<string, EfsBinding[]>();
  for (const binding of bindings) {
    const host = normalizeBindingHost(binding.host);
    byHost.set(host, [...(byHost.get(host) ?? []), binding]);
  }

  for (const [host, hostBindings] of byHost) {
    const roots = hostBindings.filter((binding) => normalizePrefix(binding.prefix).length === 0);
    if (roots.length > 1) issues.push(`Host "${host}" has more than one dedicated-root binding.`);
    if (roots.length > 0 && hostBindings.length > roots.length) {
      issues.push(`Host "${host}" mixes a dedicated-root binding with prefix-scoped bindings.`);
    }
    const seen = new Map<string, string>();
    for (const binding of hostBindings) {
      const key = prefixKey(normalizePrefix(binding.prefix));
      const previous = seen.get(key);
      if (previous) {
        issues.push(`Host "${host}" has duplicate prefix "${key || "/"}" on "${previous}" and "${binding.id}".`);
      }
      seen.set(key, binding.id);
    }
  }

  for (const binding of bindings) {
    const canonical = binding.canonical !== false;
    if (canonical) {
      if (binding.aliasOf) issues.push(`Canonical binding "${binding.id}" must not name an aliasOf.`);
      continue;
    }
    const target = bindings.find((candidate) => candidate.id === binding.aliasOf);
    if (!target) {
      issues.push(`Alias "${binding.id}" does not name an existing canonical binding.`);
    } else {
      if (target.canonical === false) issues.push(`Alias "${binding.id}" points at another alias.`);
      if (target.entityId !== binding.entityId || target.facetId !== binding.facetId) {
        issues.push(`Alias "${binding.id}" changes Entity or Facet ownership.`);
      }
      if (!sameSiteSet(target.siteIds, binding.siteIds)) {
        issues.push(`Alias "${binding.id}" changes the eligible Site set.`);
      }
    }
  }

  return issues;
}

/** Path segments with empty values removed; an internal empty segment is a client error. */
export function pathSegments(pathname: string): readonly string[] {
  const parts = pathname.split("/");
  if (parts.length > 0 && parts[0] === "") parts.shift();
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  if (parts.some((part) => part.length === 0)) throw new Error("A path must not contain empty segments.");
  return parts;
}


/** Match a host/path to the longest explicit prefix, following aliases to the canonical route. */
export function matchBinding(
  host: string,
  pathname: string,
  bindings: readonly EfsBinding[],
): MatchedBinding | null {
  const normalizedHost = normalizeBindingHost(host);
  const segments = pathSegments(pathname);
  const candidates = bindings.filter((binding) => normalizeBindingHost(binding.host) === normalizedHost);
  let best: { binding: EfsBinding; prefix: readonly string[] } | null = null;

  for (const binding of candidates) {
    const prefix = normalizePrefix(binding.prefix);
    if (prefix.length > segments.length) continue;
    if (!prefix.every((segment, index) => segments[index] === segment)) continue;
    if (!best || prefix.length > best.prefix.length) best = { binding, prefix };
  }
  if (!best) return null;

  const canonicalId = best.binding.canonical === false ? best.binding.aliasOf : best.binding.id;
  const canonicalBinding = bindings.find((binding) => binding.id === canonicalId);
  if (!canonicalBinding) return null;

  return {
    binding: best.binding,
    canonicalBinding,
    remaining: segments.slice(best.prefix.length),
  };
}

/**
 * Parse the suffix after the binding prefix. Closed bindings use `/<locale>/...`; open bindings
 * use `/<site>/<locale>/...`. An unknown Site or locale is refused, never inferred.
 */
export function parseContentRoute(binding: EfsBinding, remaining: readonly string[]): RouteResult {
  let cursor = 0;
  let siteId: string;

  if (binding.siteMode === "closed") {
    siteId = binding.siteIds[0];
  } else {
    const candidate = remaining[cursor];
    if (!candidate) return { kind: "rejected", reason: "Site-open routes require a Site segment." };
    if (!binding.siteIds.includes(candidate)) {
      return { kind: "rejected", reason: `Unknown Site "${candidate}".` };
    }
    siteId = candidate;
    cursor += 1;
  }

  const localeCandidate = remaining[cursor];
  if (!localeCandidate) {
    return { kind: "rejected", reason: "A localized route requires a locale segment." };
  }
  const locale = binding.locales.find(
    (supported) => localePathKey(supported) === localeCandidate.toLowerCase(),
  );
  if (!locale) return { kind: "rejected", reason: `Unsupported locale "${localeCandidate}".` };
  cursor += 1;

  return {
    kind: "route",
    route: {
      siteId,
      locale: canonicalLocaleTag(locale),
      localeKey: localePathKey(locale),
      pageRoute: remaining.slice(cursor),
    },
  };
}

/** Build the canonical content suffix (prefix + Site when open + locale + Page route). */
export function contentSegments(binding: EfsBinding, route: EfsContentRoute): readonly string[] {
  return [
    ...normalizePrefix(binding.prefix),
    ...(binding.siteMode === "open" ? [route.siteId] : []),
    route.localeKey,
    ...route.pageRoute,
  ];
}

/** Absolute canonical URL from the canonical binding's public base only. */
export function canonicalUrl(binding: EfsBinding, route: EfsContentRoute): string {
  return `https://${normalizeBindingHost(binding.host)}/${contentSegments(binding, route).join("/")}`;
}

/**
 * Entry address for a binding root. It redirects to the explicit default Site and a selected
 * default/cookie/negotiated locale. It never guesses a locale from geography or a Site name.
 */
export function entryRedirectPath(
  binding: EfsBinding,
  input: { readonly cookie?: string; readonly acceptLanguage?: string | null },
): string {
  const selected = selectEntryLocale({
    supported: binding.locales,
    defaultLocale: binding.defaultLocale,
    cookie: input.cookie,
    acceptLanguage: input.acceptLanguage,
  });
  if (selected.kind === "rejected") throw new Error(selected.reason);
  const siteId = binding.siteMode === "closed" ? binding.siteIds[0] : binding.defaultSiteId;
  if (!siteId) throw new Error(`Binding "${binding.id}" has no explicit default Site.`);
  const segments = [
    ...normalizePrefix(binding.prefix),
    ...(binding.siteMode === "open" ? [siteId] : []),
    localePathKey(selected.locale),
  ];
  return `/${segments.join("/")}/`;
}

/** Owner-scoped published asset URL; no EntityID or filesystem path is exposed. */
export function assetUrl(binding: EfsBinding, assetPath: string | readonly string[]): string {
  const segments = normalizePrefix(assetPath);
  if (segments.length === 0) throw new Error("An asset path must not be empty.");
  return `https://${normalizeBindingHost(binding.host)}/${[
    ...normalizePrefix(binding.prefix),
    "assets",
    ...segments,
  ].join("/")}`;
}

