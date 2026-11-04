/**
 * LOCALE PATH KEYS AND CANONICAL LANGUAGE TAGS (FOUNDATION-S1)
 * ==========================================================
 *
 * A locale has TWO spellings, and they are deliberately different concerns:
 *
 *   PATH KEY          lowercase, used for the content directory and the URL segment:
 *                     `en`, `fr`, `de`, `en-ca`, `fr-ca`, `fr-fr`
 *   CANONICAL TAG     the standards-facing language tag used in metadata/hreflang:
 *                     `en`, `en-CA`, `fr-CA`, `fr-FR`, `zh-Hans`
 *
 * A path key may be SIMPLE (a bare language, `fr`) or FULL (language + region, `fr-ca`). The
 * simple form keeps ordinary authoring easy and means EXACTLY the bare language, in every Site:
 *
 *   site `ca` + `en`        → en        (a Site is not a country: no `en-CA` is invented)
 *   site `corporate` + `fr` → fr
 *   site `ca` + `fr-ca`     → fr-CA     (a FULL key names its own locale and is never reinterpreted)
 *   site `ca` + explicit `canonical: en-CA` → en-CA
 *
 * RESOLUTION ORDER (ONE authority, no scattered magic):
 *   1. the entry's explicit `canonical` (the adopter's declaration: `en` → `en-US`, `en` → `en-CA`);
 *   2. a FULL path key resolves to itself in canonical casing (`fr-ca` → `fr-CA`);
 *   3. a SIMPLE path key is the bare language (`fr`), because a Site is a configuration key and not a
 *      country — the `GEO-04` Stage C retirement of Site-derived language inference.
 *
 * Framework-neutral: pure data + types only.
 */

/**
 * A locale PATH KEY: `en`, `fr`, `fr-ca`, `en-ca`, `zh-hans`, `zh-hant-tw`, `sr-latn`.
 *
 * The supported grammar is deliberately bounded and documented here, in ONE place:
 *
 *     language           2–3 lowercase letters            en, fr, id, zh, sr
 *     [-script]          4 lowercase letters              hans, hant, latn
 *     [-region]          2 lowercase letters, or 3 digits ca, tw, 419
 *
 * BCP 47 extensions, variants and private-use subtags are NOT supported (nothing here consumes
 * them), and the key is always lowercase because it is a directory name AND a URL segment.
 */
export const LOCALE_PATH_KEY_PATTERN = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-[a-z]{2}|-[0-9]{3})?$/;

/** True when a value may be a locale path key (lowercase, no spaces, no traversal). */
export function isLocalePathKey(value: string): boolean {
  return typeof value === "string" && LOCALE_PATH_KEY_PATTERN.test(value);
}

/**
 * The canonical (standards-facing) language tag for a path key — language lowercase, script
 * title-case, region uppercase:
 *
 *     en-ca      → en-CA
 *     fr-ca      → fr-CA
 *     zh-hant    → zh-Hant
 *     zh-hant-tw → zh-Hant-TW
 *     sr-latn    → sr-Latn
 *
 * The path key and the canonical tag are the SAME locale in two spellings; the mapping is total
 * and deterministic, never a lookup table.
 */
export function canonicalTagForPathKey(pathKey: string): string {
  const [language, ...subtags] = pathKey.split("-");
  if (language === undefined || language === "") return pathKey;
  return [
    language,
    ...subtags.map((subtag) => {
      if (subtag.length === 4) return subtag.charAt(0).toUpperCase() + subtag.slice(1);
      if (subtag.length === 2) return subtag.toUpperCase();
      return subtag;
    }),
  ].join("-");
}


/** One locale as an adopter declares it for a site. */
export interface SiteLocaleInput {
  /** The lowercase path key: the content directory and the URL segment. */
  readonly path: string;
  /** An explicit standards-facing tag. Absent → the resolution order above decides. */
  readonly canonical?: string;
  /** Optional per-site display label; absent → the deployment locale registry's label. */
  readonly label?: string;
}

/** One locale, fully resolved for one site. */
export interface ResolvedSiteLocale {
  /** The lowercase path key (directory + URL segment). */
  readonly path: string;
  /** The standards-facing language tag (metadata, hreflang). */
  readonly canonical: string;
  /** Optional per-site display label override. */
  readonly label?: string;
}

/** Whether a path key is SIMPLE (bare language) or FULL (language + region). */
export function isSimpleLocalePathKey(pathKey: string): boolean {
  return isLocalePathKey(pathKey) && !pathKey.includes("-");
}

/**
 * Resolves one declared locale for ONE site (the single authority for the path-key ↔ canonical
 * relationship; the schema and the runtime both call it, so validation cannot disagree).
 */
export function resolveSiteLocale(
  siteCode: string,
  input: SiteLocaleInput | string,
): ResolvedSiteLocale {
  const entry: SiteLocaleInput = typeof input === "string" ? { path: input } : input;
  const key = entry.path.trim().toLowerCase();

  if (entry.canonical !== undefined && entry.canonical.trim() !== "") {
    return {
      path: key,
      canonical: entry.canonical.trim(),
      ...(entry.label === undefined ? {} : { label: entry.label }),
    };
  }

  const canonical = (() => {
    // A FULL key already names its own locale: `fr-ca` → `fr-CA`, `zh-hant-tw` → `zh-Hant-TW`.
    if (!isSimpleLocalePathKey(key)) return canonicalTagForPathKey(key);
    // `GEO-04` STAGE C — A SIMPLE KEY IS THE BARE LANGUAGE, IN EVERY SITE.
    //
    // This used to derive a country variant from the Site code (`ca` + `en` → `en-CA`, `br` + `pt` →
    // `pt-BR`), which made a Site a country and manufactured a locale nobody authored. A Site is a
    // descriptive configuration key, so `en` means `en` — and an author who wants `en-CA` writes the FULL
    // key (`en-ca`) or declares `canonical` explicitly. Both remain authoritative and unchanged above.
    return key;
  })();

  return { path: key, canonical, ...(entry.label === undefined ? {} : { label: entry.label }) };
}

/** The path key that carries a canonical tag inside one site, or `undefined`. */
export function pathKeyForCanonical(
  locales: readonly ResolvedSiteLocale[],
  canonical: string,
): string | undefined {
  const wanted = canonical.toLowerCase();
  return locales.find((locale) => locale.canonical.toLowerCase() === wanted)?.path;
}
