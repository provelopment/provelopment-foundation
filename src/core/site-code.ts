/**
 * THE SITE-CODE CONTRACT (FOUNDATION-S1; GEOGRAPHIC AUTHORITY RETIRED BY `GEO-04` STAGE C-A)
 * ========================================================================================
 *
 * A configuration Site code was once a CLOSED set of ISO 3166-1 alpha-2 country codes plus a reserved
 * `ww`. That made a Site a country: it decided which codes could exist, and a language inside a Site
 * inherited the country's own variant (`ca` + `en` → `en-CA`).
 *
 * A Site is NOT a country (`GEO-04` R13/D28, `GEO-03` R04 presentation identity). A Site code is a
 * **descriptive configuration key** — `main`, `workshop`, `corporate`, `chickens`, `product-support` —
 * and, where an author really does run one Site per country, a country-shaped word is simply one such
 * key. It is not a country, a locale, a location, an EFS SiteID or a public URL selector.
 *
 * THE GRAMMAR HAS ONE AUTHORITY: `@/core/site-identity`
 * ----------------------------------------------------
 * This module no longer restates an accepted set. It delegates the grammar to `siteIdIssue`/`isSiteId`,
 * which owns the content-slug family (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) and its single refinement (a
 * Site ID begins with a letter). `.`, `..`, `/`, `\`, `%`, `_`, `~` and spaces are therefore not
 * representable at all — no path separator, no traversal, no Windows path.
 *
 * Two authorities disagreeing was this module's worst property: `resolveSites` already accepted any
 * well-formed descriptive key while `isSiteCode` refused it, so `pageResolutionCandidates` returned no
 * candidates for a perfectly authored Site named `main`. One grammar now answers both.
 *
 * RESERVATION IS A DIFFERENT QUESTION, IN A DIFFERENT MODULE
 * ---------------------------------------------------------
 * `ww` is a RETIRED Site identity (`@/core/site-identity` `RESERVED_SITE_ID_GROUPS.retired`): it may not
 * be an EFS SiteID or a public prefix. It survives here only as the historical *label* `Worldwide`, so a
 * converted deployment's presentation label does not change meaning under its own feet.
 *
 * CASE. Directories and URLs are LOWERCASE; a configuration may write `CA` and is reported as a lowercase
 * mistake rather than silently normalised, because the code is also a directory name.
 *
 * Framework-neutral: pure data + types only. No React, Next.js, filesystem or configuration.
 */
import { isSiteId, siteIdIssue } from "./site-identity";

/** The retired worldwide token, kept ONLY as the historical label `Worldwide` (never an EFS SiteID). */
export const WORLDWIDE_SITE_CODE = "ww";

/**
 * A SITE CODE — a descriptive configuration key (`main`, `workshop`, `corporate`, `ca`).
 *
 * The alias exists so the site-scoped contracts (`@/core/page-source`, the page composition)
 * can name their site dimension in the SAME vocabulary as this authority, instead of spelling
 * an anonymous `string` that could hold anything. It is a CONFIGURATION identity, not a country.
 */
export type SiteCode = string;

/** Normalises any configuration spelling to the canonical lowercase path form. */
export function normalizeSiteCode(value: string): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * True when `value` is a well-formed Site code, case-insensitively.
 *
 * The grammar is `@/core/site-identity`'s — one authority for Site syntax. A country-shaped key
 * (`ca`) and a descriptive key (`chickens`) are the same kind of thing, because neither is a country.
 */
export function isSiteCode(value: string): boolean {
  return isSiteId(normalizeSiteCode(value));
}

/** True when the code names the Worldwide / Global site (never an ordinary country). */
export function isWorldwideSiteCode(value: string): boolean {
  return normalizeSiteCode(value) === WORLDWIDE_SITE_CODE;
}

/**
 * True when the code is well-formed AND already written in the canonical lowercase spelling.
 *
 * A configured code is NOT silently normalised (below), so this answers "may this exact string be used
 * as a directory name and configuration key as written?".
 */
export function isCanonicalSiteCode(value: string): boolean {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value === value.toLowerCase() &&
    isSiteId(value)
  );
}

/**
 * The ONE actionable diagnosis for a configured Site code, or `null` when it is usable.
 *
 * A configured code is NOT silently normalised: the code is simultaneously the content folder and the
 * URL segment, so `CA` must be reported as a lowercase mistake rather than accepted and quietly turned
 * into `ca` — the author would otherwise believe a directory named `CA` works.
 *
 * There is no accepted-word list to fail: `chickens`, `corporate` and `ca` are all ordinary keys. What
 * remains is the grammar (`@/core/site-identity`) plus its lowercase requirement.
 */
export function siteCodeIssue(value: string): string | null {
  if (isCanonicalSiteCode(value)) return null;
  const normalized = normalizeSiteCode(value);
  if (isSiteId(normalized)) {
    return (
      `site code "${value}" must be lowercase — write it as "${normalized}" ` +
      "(the code is also the content folder and the URL segment)"
    );
  }
  return siteIdIssue(value)?.replace(/^site id/i, "site code") ?? `site code "${value}" is not valid`;
}

/**
 * The default display label for a Site code.
 *
 * `Worldwide` for the retired worldwide token, so a converted deployment's label keeps its meaning. Every
 * other key is labelled AS AUTHORED (`main` → `main`, `ca` → `ca`): upper-casing a key was the country
 * presentation, and a Site is not a country, so the platform no longer shouts one.
 */
export function defaultSiteLabel(code: string): string {
  const normalized = normalizeSiteCode(code);
  if (isWorldwideSiteCode(normalized)) return "Worldwide";
  return normalized;
}
