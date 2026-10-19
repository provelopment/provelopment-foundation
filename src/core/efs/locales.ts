/**
 * LEAF-ONLY LOCALIZATION, SETTLED (`D31`, Amendment 06)
 * ====================================================
 *
 * Only a Page's localized representations carry locale. Canonical metadata uses a valid BCP 47
 * tag in conventional case (`fr-CA`); URL path keys are the lowercase spelling (`fr-ca`).
 * `en-001` is a valid regional locale key and not a worldwide Site identity.
 *
 * An explicit valid locale always wins. Locale-less entry uses, in order, a valid explicit
 * visitor cookie, a supported `Accept-Language` preference, then the declared default. No
 * geo-IP, location or Site-name inference exists.
 *
 * A missing translation may use only an explicitly authored representation of the SAME Page.
 * The result is a truthful temporary redirect to the actual representation's URL, or 404 —
 * never a phantom `hreflang`, canonical tag or content language.
 */

/** A BCP 47-shaped tag with language, optional script/region and variants. */
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?(?:-(?:[a-z0-9]{5,8}|\d[a-z0-9]{3}))*$/i;

/** One localized Page representation. */
export interface PageRepresentation {
  readonly locale: string;
  /** The explicitly authored fallback for this Page, as a path key. */
  readonly fallbackLocaleKey?: string;
}

/** One Page and its existing representations. */
export interface LocalizedPage {
  readonly pageId: string;
  readonly representations: readonly PageRepresentation[];
  /** Optional authored same-Page fallback, as a lowercase path key. */
  readonly fallbackLocaleKey?: string;
}

/** The locale chosen for a locale-less entry address. */
export type EntryLocaleResult =
  | {
      readonly kind: "selected";
      readonly locale: string;
      readonly source: "explicit" | "cookie" | "accept-language" | "default";
    }
  | { readonly kind: "rejected"; readonly reason: string };

/** Outcome of requesting one Page representation. */
export type RepresentationResult =
  | { readonly kind: "render"; readonly representation: PageRepresentation }
  | { readonly kind: "redirect"; readonly representation: PageRepresentation }
  | { readonly kind: "not-found"; readonly reason: string };

/** Diagnose a locale tag without repairing it. */
export function localeTagIssue(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "A locale must be a non-empty BCP 47-style language tag.";
  }
  if (!LOCALE_PATTERN.test(value)) {
    return `"${value}" is not a supported BCP 47-style language tag shape.`;
  }
  return null;
}

/**
 * Return the conventional canonical spelling: lower-case language and variants, title-case
 * script, upper-case region. Invalid tags throw; they are never silently normalized into one.
 */
export function canonicalLocaleTag(value: unknown): string {
  const issue = localeTagIssue(value);
  if (issue) throw new Error(issue);
  const parts = (value as string).split("-");
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (/^[a-z]{4}$/i.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
      if (/^([a-z]{2}|\d{3})$/i.test(part)) return part.toUpperCase();
      return part.toLowerCase();
    })
    .join("-");
}

/** The URL path spelling of a locale: canonical tag, lower-cased. */
export function localePathKey(value: unknown): string {
  return canonicalLocaleTag(value).toLowerCase();
}

function supportedIndex(locales: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const locale of locales) {
    const canonical = canonicalLocaleTag(locale);
    const key = canonical.toLowerCase();
    if (index.has(key)) throw new Error(`Duplicate locale path key "${key}".`);
    index.set(key, canonical);
  }
  return index;
}

function findSupported(index: Map<string, string>, candidate: string): string | undefined {
  return index.get(candidate.trim().toLowerCase());
}

/** Parse `Accept-Language` into supported-shaped tags, highest q first, original order on ties. */
export function parseAcceptLanguage(header: string | null | undefined): readonly string[] {
  if (!header) return [];
  const entries = header
    .split(",")
    .map((part, order) => {
      const [rawTag, ...parameters] = part.trim().split(";");
      const tag = rawTag.trim();
      const qParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const q = qParameter ? Number(qParameter.trim().slice(2)) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0, order };
    })
    .filter((entry) => entry.q > 0 && entry.tag !== "*" && localeTagIssue(entry.tag) === null)
    .sort((left, right) => right.q - left.q || left.order - right.order);
  return entries.map((entry) => entry.tag);
}
/** Extract the accepted `NEXT_LOCALE` preference from a raw Cookie header. */
export function cookieLocalePreference(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  if (!cookieHeader.includes("=")) {
    try {
      return decodeURIComponent(cookieHeader.trim());
    } catch {
      return undefined;
    }
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== "NEXT_LOCALE") continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Select the locale for a locale-less binding entry.
 *
 * `explicit` is only supplied when the visitor actually authored a locale segment; it wins and
 * fails closed when unsupported. Cookie and `Accept-Language` are preferences, not assumptions.
 */
export function selectEntryLocale(input: {
  readonly supported: readonly string[];
  readonly defaultLocale: string;
  readonly explicit?: string;
  readonly cookie?: string;
  readonly acceptLanguage?: string | null;
}): EntryLocaleResult {
  const index = supportedIndex(input.supported);
  const fallback = canonicalLocaleTag(input.defaultLocale);
  if (!index.has(fallback.toLowerCase())) {
    throw new Error(`The declared default locale "${input.defaultLocale}" is not supported.`);
  }

  if (input.explicit !== undefined) {
    const selected = findSupported(index, input.explicit);
    return selected
      ? { kind: "selected", locale: selected, source: "explicit" }
      : { kind: "rejected", reason: `Unsupported explicit locale "${input.explicit}".` };
  }

  if (input.cookie !== undefined) {
    const preference = cookieLocalePreference(input.cookie);
    if (preference !== undefined) {
      const selected = findSupported(index, preference);
      if (selected) return { kind: "selected", locale: selected, source: "cookie" };
    }
  }

  for (const preference of parseAcceptLanguage(input.acceptLanguage)) {
    const selected = findSupported(index, preference);
    if (selected) return { kind: "selected", locale: selected, source: "accept-language" };
  }

  return { kind: "selected", locale: fallback, source: "default" };
}

/**
 * Resolve one Page representation. Exact matches render; an authored same-Page fallback is a
 * truthful redirect to that representation's real URL; otherwise the request is refused.
 */
export function resolveRepresentation(
  page: LocalizedPage,
  requestedLocale: string,
  options: { readonly allowFallback: boolean },
): RepresentationResult {
  const requestedKey = localePathKey(requestedLocale);
  const existing = page.representations.find(
    (representation) => localePathKey(representation.locale) === requestedKey,
  );
  if (existing) return { kind: "render", representation: existing };

  if (!options.allowFallback || !page.fallbackLocaleKey) {
    return { kind: "not-found", reason: "No authorized same-Page fallback exists." };
  }

  const fallbackKey = page.fallbackLocaleKey.toLowerCase();
  const fallback = page.representations.find(
    (representation) => localePathKey(representation.locale) === fallbackKey,
  );
  if (!fallback) {
    return { kind: "not-found", reason: "The declared same-Page fallback does not exist." };
  }
  return { kind: "redirect", representation: fallback };
}

/** `hreflang` alternates for representations that actually exist on this Page. */
export function advertisedHreflang(
  page: LocalizedPage,
): readonly { readonly hreflang: string; readonly localeKey: string }[] {
  return page.representations.map((representation) => ({
    hreflang: canonicalLocaleTag(representation.locale),
    localeKey: localePathKey(representation.locale),
  }));
}
