/**
 * LEAF-ONLY LOCALIZATION, SETTLED (`D31`, Amendment 06)
 * ====================================================
 *
 * Only a Page's localized representations carry locale. Canonical metadata uses a valid BCP 47
 * tag in conventional case (`fr-CA`); URL path keys are the lowercase spelling (`fr-ca`).
 * `en-001` is a valid regional locale key and not a worldwide Site identity.
 *
 * An explicit valid locale always wins, exact-only. Locale-less entry uses, in order, a valid
 * explicit visitor cookie, a supported `Accept-Language` preference, then the declared default. A
 * preference resolves exactly first, and otherwise selects a sole authored representation whose
 * whole subtag sequence extends it (`GEO-03` R03). No geo-IP, location or Site-name inference
 * exists, and no published locale is ever synthesized, extended, truncated or inferred.
 *
 * Publication qualification is a SEPARATE concern from syntax: `de` is a valid language tag and
 * still unfit to name a published representation, because it does not say which authored
 * representation is meant. `publicationLocaleIssue` reports that distinction; syntax acceptance
 * does not imply it, and this module never repairs a tag into qualification.
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
  /**
   * The visible publication fact of the SOURCE that answers this representation. Absent means
   * `public`, exactly as the declarative Page-document contract defines. There is deliberately no
   * Page-level default: two representations of one Page may publish independently.
   */
  readonly visibility?: "public" | "unlisted";
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

/**
 * The complete subtag sequence of a locale tag, canonical-cased. Used only after `localeTagIssue`
 * has accepted the value; a malformed tag is never decomposed.
 */
function localeSubtags(value: unknown): readonly string[] {
  return canonicalLocaleTag(value).split("-");
}

/**
 * Authored representations for which the preference's COMPLETE subtag sequence is a proper prefix
 * (`GEO-01` R02 §3.7, corrected by R03 §3.4).
 *
 * Comparison is subtag by subtag and never a character-string prefix: `de` must not select `den`,
 * and `en-0` must not select `en-001`. Only a whole trailing subtag may be added by the authored
 * representation — nothing is synthesized, extended, truncated or inferred. Iteration is in the
 * authored `supported` order, so equal-scoring candidates resolve identically on every call.
 */
function qualifiedCandidates(index: Map<string, string>, preference: string): readonly string[] {
  const preferenceSubtags = localeSubtags(preference).map((subtag) => subtag.toLowerCase());
  const matches: string[] = [];
  for (const canonical of index.values()) {
    const candidateSubtags = canonical.toLowerCase().split("-");
    if (candidateSubtags.length <= preferenceSubtags.length) continue;
    if (preferenceSubtags.every((subtag, position) => candidateSubtags[position] === subtag)) {
      matches.push(canonical);
    }
  }
  return matches;
}

/**
 * Resolve ONE preference: exact authored match first, then a sole qualifying representation, then
 * the declared default only when it is itself a qualifying candidate (§3.3–§3.7). `undefined` means
 * "this preference does not resolve" and the caller continues with the next preference.
 */
function resolvePreference(
  index: Map<string, string>,
  defaultLocale: string,
  preference: string,
): string | undefined {
  // A malformed preference must never reach decomposition, and must never fail the request.
  if (localeTagIssue(preference.trim()) !== null) return undefined;
  const exact = findSupported(index, preference);
  if (exact) return exact;
  const candidates = qualifiedCandidates(index, preference.trim());
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return undefined;
  const declaredDefault = candidates.find(
    (candidate) => candidate.toLowerCase() === defaultLocale.toLowerCase(),
  );
  return declaredDefault ?? undefined;
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
 * `explicit` is only supplied when the visitor actually authored a locale segment; it wins, is
 * exact-only, and fails closed when unsupported — an address is never silently re-pointed.
 *
 * Cookie and `Accept-Language` are preferences, not assumptions. Each preference is tried exactly
 * first and then against authored representations it is a complete-subtag prefix of (`GEO-01` R02
 * §3.7). A sole qualifying candidate is selected; when several qualify, only the declared default
 * may be chosen, and it must be one of them; otherwise the next preference is tried.
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
      const selected = resolvePreference(index, fallback, preference);
      if (selected) return { kind: "selected", locale: selected, source: "cookie" };
    }
  }

  for (const preference of parseAcceptLanguage(input.acceptLanguage)) {
    const selected = resolvePreference(index, fallback, preference);
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
  if (fallback.visibility === "unlisted") {
    return {
      kind: "not-found",
      reason: "The declared same-Page fallback is unlisted and cannot be promoted by a redirect.",
    };
  }
  return { kind: "redirect", representation: fallback };
}

/**
 * `hreflang` alternates for PUBLIC representations that actually exist on this Page.
 *
 * An alternate is an advertisement. An unlisted representation is directly reachable but is never
 * promoted by another representation or by itself, so it is filtered here — the one place every
 * EFS alternate is built.
 */
export function advertisedHreflang(
  page: LocalizedPage,
): readonly { readonly hreflang: string; readonly localeKey: string }[] {
  return page.representations
    .filter((representation) => representation.visibility !== "unlisted")
    .map((representation) => ({
      hreflang: canonicalLocaleTag(representation.locale),
      localeKey: localePathKey(representation.locale),
    }));
}

/**
 * Why a tag may not identify a PUBLISHED representation (`GEO-01` R02 §3.2, `GEO-03` R03 §4).
 *
 * Two distinct failures, deliberately not collapsed into one boolean: a value can be a perfectly
 * valid language tag and still be unfit to publish as a representation, because a bare language —
 * or a language with variants and nothing else — does not say WHICH authored representation is
 * meant. `de` is a language, not a publication address; `de-DE` and `zh-Hans` are.
 */
export type PublicationLocaleIssue =
  | { readonly kind: "malformed"; readonly reason: string }
  | { readonly kind: "unqualified"; readonly reason: string };

/**
 * Diagnose publication qualification without repairing the tag.
 *
 * Qualification is the presence of an explicitly authored SCRIPT or REGION subtag:
 * `en-001`, `de-DE`, `zh-Hans` and `de-DE-1996` qualify; `de`, `de-1996` and `sl-rozaj-biske` do
 * not. Variants qualify nothing on their own, and nothing here synthesizes, defaults, extends,
 * truncates or geographically infers a subtag — an unqualified tag is reported, never completed.
 *
 * This predicate is NOT yet wired into manifest loading: the reference Installation still declares
 * unqualified tags, and stricter publication validation belongs to the atomic R04 re-tag so that a
 * reference that is valid today cannot be invalidated before its replacements exist.
 */
export function publicationLocaleIssue(value: unknown): PublicationLocaleIssue | null {
  const malformed = localeTagIssue(value);
  if (malformed) return { kind: "malformed", reason: malformed };
  const qualifiers = localeSubtags(value).slice(1);
  const qualified = qualifiers.some(
    (subtag) => /^[a-z]{4}$/i.test(subtag) || /^([a-z]{2}|\d{3})$/i.test(subtag),
  );
  if (qualified) return null;
  return {
    kind: "unqualified",
    reason: `"${String(value)}" is a valid language tag but declares no script or region, so it cannot identify a published representation.`,
  };
}

/** True only for a syntactically valid tag that also carries an authored script or region. */
export function isPublicationQualifiedLocale(value: unknown): boolean {
  return publicationLocaleIssue(value) === null;
}
