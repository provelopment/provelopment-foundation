/**
 * THE SITE-CODE CONTRACT (FOUNDATION-S1)
 * =====================================
 *
 * A SITE is identified by a two-letter code, and this module is the ONE authority for which
 * codes exist. A site is normally a COUNTRY — `ca`, `fr`, `ch`, `id`, `jp` — and Foundation
 * additionally reserves `ww` for a WORLDWIDE / GLOBAL site, which is deliberately not a country
 * and may not be presented as one.
 *
 * WHY A CLOSED SET. The site code is simultaneously a content directory name, a URL segment and
 * (later, optionally) a hostname mapping key, so it must be predictable and machine-checkable:
 * arbitrary prose (`canada`, `main`, `my-office`) is refused, and the reference list below is the
 * single place the accepted codes are declared — never restated in a schema, a route or a
 * component.
 *
 * CASE. Directories and URLs are LOWERCASE (`ca`, `ww`); a configuration may write `CA` and is
 * normalised here, so `CA` and `ca` can never mean two different sites. (Locale path keys follow
 * the same rule — see `@/core/locale`.)
 *
 * Framework-neutral: pure data + types only. No React, Next.js, filesystem or configuration.
 */

/** The reserved code for a Worldwide / Global site: not a country. */
export const WORLDWIDE_SITE_CODE = "ww";

/**
 * A SITE CODE — a recognized two-letter country code (`ca`, `fr`) or the reserved `ww`.
 *
 * The alias exists so the site-scoped contracts (`@/core/page-source`, the page composition)
 * can name their site dimension in the SAME vocabulary as this authority, instead of spelling
 * an anonymous `string` that could hold anything.
 */
export type SiteCode = string;

/**
 * The recognized ISO 3166-1 alpha-2 country codes (lowercase), Foundation's maintained reference
 * list. A code that is not here is refused: typos and invented codes fail loudly at build time
 * rather than publishing a site nobody can find.
 */
export const COUNTRY_SITE_CODES: readonly string[] = [
  "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at", "au", "aw", "ax", "az",
  "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bl", "bm", "bn", "bo", "bq", "br", "bs",
  "bt", "bv", "bw", "by", "bz", "ca", "cc", "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn",
  "co", "cr", "cu", "cv", "cw", "cx", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec", "ee",
  "eg", "eh", "er", "es", "et", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gb", "gd", "ge", "gf",
  "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy", "hk", "hm",
  "hn", "hr", "ht", "hu", "id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it", "je", "jm",
  "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz", "la", "lb", "lc",
  "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md", "me", "mf", "mg", "mh", "mk",
  "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my", "mz", "na",
  "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe", "pf", "pg",
  "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py", "qa", "re", "ro", "rs", "ru", "rw",
  "sa", "sb", "sc", "sd", "se", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so", "sr", "ss",
  "st", "sv", "sx", "sy", "sz", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to",
  "tr", "tt", "tv", "tw", "tz", "ua", "ug", "um", "us", "uy", "uz", "va", "vc", "ve", "vg", "vi",
  "vn", "vu", "wf", "ws", "ye", "yt", "za", "zm", "zw",
];

/** Every site code Foundation accepts: the country codes plus the reserved `ww`. */
export const SITE_CODES: readonly string[] = [...COUNTRY_SITE_CODES, WORLDWIDE_SITE_CODE];

const SITE_CODE_SET = new Set(SITE_CODES);

/** Normalises any configuration spelling to the canonical lowercase path form. */
export function normalizeSiteCode(value: string): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True when `value` is a recognized site code (`ca`, `fr`, `ww`, …), case-insensitively. */
export function isSiteCode(value: string): boolean {
  return SITE_CODE_SET.has(normalizeSiteCode(value));
}

/** True when the code names the Worldwide / Global site (never an ordinary country). */
export function isWorldwideSiteCode(value: string): boolean {
  return normalizeSiteCode(value) === WORLDWIDE_SITE_CODE;
}

/** True when the code is recognized AND already written in the canonical lowercase spelling. */
export function isCanonicalSiteCode(value: string): boolean {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value === value.toLowerCase() &&
    SITE_CODE_SET.has(value)
  );
}

/**
 * The ONE actionable diagnosis for a configured site code, or `null` when it is usable.
 *
 * A configured code is NOT silently normalised: the code is simultaneously the content folder and
 * the URL segment, so `CA` must be reported as a lowercase mistake rather than accepted and quietly
 * turned into `ca` — the author would otherwise believe a directory named `CA` works.
 */
export function siteCodeIssue(value: string): string | null {
  if (isCanonicalSiteCode(value)) return null;
  const normalized = normalizeSiteCode(value);
  if (SITE_CODE_SET.has(normalized)) {
    return (
      `site code "${value}" must be lowercase — write it as "${normalized}" ` +
      "(the code is also the content folder and the URL segment)"
    );
  }
  return (
    `site code "${value}" must be a recognized two-letter country code or the reserved ` +
    `"${WORLDWIDE_SITE_CODE}" (arbitrary names are not site codes)`
  );
}

/**
 * The default display label for a site code.
 *
 * `Worldwide` for the reserved `ww`, the upper-case country code for a country (`de` → `DE`), and —
 * since `GEO-03` R04 made a Spoke Site code a descriptive presentation identity — the code ITSELF for
 * any other well-formed key (`main` → `main`). Upper-casing a descriptive key would shout a word the
 * author wrote as a word.
 */
export function defaultSiteLabel(code: string): string {
  const normalized = normalizeSiteCode(code);
  if (isWorldwideSiteCode(normalized)) return "Worldwide";
  return COUNTRY_SITE_CODES.includes(normalized) ? normalized.toUpperCase() : normalized;
}
