import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Locale } from "@/core/locale";
import { LOCALE_PATTERN } from "@/core/locale";

import {
  dictionaryOverrideSchema,
  dictionarySchema,
  mergeDictionaryOverride,
  type Dictionary,
  type DictionaryOverride,
} from "./dictionary";

/**
 * Well-formed locale code — the ONE contract (`@/core/locale`), imported rather than
 * restated so dictionary discovery can never accept a locale the rest of the platform
 * refuses (`en`, `pt-BR`, `zh-Hans`, `en-CA`).
 */
const localeNamePattern = LOCALE_PATTERN;

export interface DictionaryRegistry {
  /**
   * Returns the EFFECTIVE dictionary for a locale — the shared dictionary for that locale, with
   * S1E2 site+locale overrides applied when a `siteCode` is given and that site has an override.
   * Falls back to the default locale's shared dictionary for a locale that is not configured.
   */
  get(locale: Locale, siteCode?: string): Dictionary;
  /**
   * Whether `get` would return a dictionary that APPLIES to this locale — the site's own override,
   * the exact shared dictionary, or its LANGUAGE BASE — rather than the last-resort default-locale
   * fallback.
   *
   * `get` deliberately never fails: a locale the context does not configure is served the deployment
   * default's dictionary, which is the right answer for chrome that must always render something.
   * A consumer that PUBLISHES a fact in the representation's own language cannot accept that
   * substitution — labels in an unrelated language are worse than no labels — so it asks this first.
   *
   * The two accepted cases are exactly the first two branches of `get`, evaluated with the same
   * private helpers, so this predicate cannot drift from what `get` would actually return. `get`
   * itself is unchanged for every existing consumer.
   */
  applicable(locale: Locale, siteCode?: string): boolean;
  /** Returns every loaded SHARED dictionary keyed by locale code (no overrides, no fallback). */
  all(): ReadonlyMap<string, Dictionary>;
  /** Returns every effective site+locale override, keyed `"<site>/<locale>"` (S1E2). */
  overrides(): ReadonlyMap<string, Dictionary>;
}

/** S1E2 — one site whose locale overrides may exist: its code, and the locales it serves. */
export interface DictionarySiteScope {
  readonly code: string;
  /** The site's locale PATH KEYS — an override outside this set is refused. */
  readonly locales: readonly string[];
}

export interface LoadDictionaryRegistryOptions {
  /** Directory containing one `<locale>.json` dictionary per supported locale. */
  readonly directory: string;
  /**
   * S1E2 — directory containing the OPTIONAL `<site>/<locale>.json` overrides. Absent → no
   * overrides are loaded at all (the deployment has no `sites/` folder to declare any).
   */
  readonly overrideDirectory?: string | undefined;
  /** Every locale enabled in `site.config.json`; each must have a dictionary file. */
  readonly declaredLocales: readonly string[];
  /** Default locale used when a requested locale has no dictionary. */
  readonly defaultLocale: string;
  /**
   * The deployment's sites, so an override can be checked against a real site and locale.
   * Absent → an override folder would be refused (no site could own it) rather than ignored.
   */
  readonly sites?: readonly DictionarySiteScope[] | undefined;
}

interface FileProblem {
  readonly file: string;
  readonly reason: string;
}

/** S1E3 — the LANGUAGE BASE of a locale path key: its primary subtag (`fr-ca` → `fr`). */
export function languageBaseOf(localePath: string): string {
  return localePath.split("-")[0] ?? localePath;
}

/**
 * S1E3 — THE SHARED BASE OF A LOCALE PATH KEY: its exact dictionary when one exists, otherwise the
 * dictionary of its LANGUAGE BASE.
 *
 * This is the ONE documented fallback Foundation adds, and it exists so that alternative authoring
 * spellings of the same language do not require copied dictionaries:
 *
 *     config/i18n/fr.json  serves  fr, fr-ca, fr-fr, …   (and `ca/fr`, `ca/fr-ca`, `fr/fr-fr`, …)
 *
 * A more specific `config/i18n/<locale>.json` REPLACES that base for its own key (it is a complete
 * validated dictionary in its own right — refinement is an authoring decision, not a merge). There
 * is deliberately NO script/region/variant hierarchy: `zh-hant-tw` falls back to `zh`, never to
 * `zh-hant`, because inventing intermediate steps is how a dictionary silently comes from the
 * wrong place.
 */
function sharedBaseOf(
  byLocale: ReadonlyMap<string, Dictionary>,
  localePath: string,
): Dictionary | undefined {
  return byLocale.get(localePath) ?? byLocale.get(languageBaseOf(localePath));
}
function formatProblems(problems: readonly FileProblem[]): string {
  return problems.map((problem) => `  - ${problem.file}: ${problem.reason}`).join("\n");
}

/** One actionable line per Zod issue. */
function formatIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/**
 * Loads and validates every `*.json` dictionary in `directory` and verifies
 * that every locale declared in `site.config.json` has a matching file.
 *
 * Locale discovery is **data-driven**: the set of dictionaries comes from the
 * filesystem, never from a hard-coded TypeScript import list. An adopter adds a
 * locale by adding `config/i18n/<code>.json` (and registering it in
 * `site.config.json`) — no `src/` code change is required.
 *
 * Failures are loud and actionable:
 *  - a file that is not valid JSON, or that fails the Zod dictionary schema, is
 *    reported by filename with the exact issues (never silently skipped);
 *  - a configured locale with no dictionary file is reported as a build error.
 * Only locales that are NOT configured fall back to the default locale.
 *
 * S1E2 — after the shared dictionaries are validated, the OPTIONAL site+locale overrides in
 * `<overrideDirectory>/<site>/<locale>.json` are merged over them (see `loadSiteOverlays`). A
 * deployment with no `sites/` directory behaves exactly as before.
 */
export function loadDictionaryRegistry(options: LoadDictionaryRegistryOptions): DictionaryRegistry {
  let entries: string[];
  try {
    entries = readdirSync(options.directory)
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch {
    throw new Error(
      `Unable to read i18n directory "${options.directory}". ` +
        "Expected it to contain one config/i18n/<locale>.json per supported locale.",
    );
  }

  const byLocale = new Map<string, Dictionary>();
  const problems: FileProblem[] = [];

  for (const file of entries) {
    const locale = path.basename(file, ".json");
    if (!localeNamePattern.test(locale)) {
      continue; // not a recognized locale filename; ignore rather than fail
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.join(options.directory, file), "utf8"));
    } catch {
      problems.push({ file, reason: "file is not valid JSON" });
      continue;
    }

    const result = dictionarySchema.safeParse(raw);
    if (!result.success) {
      problems.push({
        file,
        reason: `fails the dictionary schema:\n${formatIssues(result.error.issues)}`,
      });
      continue;
    }

    byLocale.set(locale, result.data);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid i18n dictionary data:\n${formatProblems(problems)}`);
  }

  const missing = options.declaredLocales.filter(
    (locale) => sharedBaseOf(byLocale, locale) === undefined,
  );
  if (missing.length > 0) {
    throw new Error(
      `Configured locale(s) have no dictionary file: ${missing.join(", ")}.\n` +
        `Add a config/i18n/<locale>.json for each, or let it inherit its LANGUAGE BASE ` +
        `(config/i18n/${languageBaseOf(missing[0] as string)}.json) — the language-base dictionary ` +
        "is the only fallback Foundation applies; there is no broader locale hierarchy.",
    );
  }

  if (sharedBaseOf(byLocale, options.defaultLocale) === undefined) {
    throw new Error(
      `Default locale "${options.defaultLocale}" has no dictionary file. ` +
        "A default locale dictionary is required for fallback.",
    );
  }

  const overlays = loadSiteOverlays(options, byLocale);

  return {
    get(locale: Locale, siteCode?: string): Dictionary {
      // The site's OWN effective dictionary first (only that site's files are ever consulted), then
      // the shared base chain: the exact shared dictionary, else its language base, else the
      // deployment default's.
      if (siteCode !== undefined) {
        const overlay = overlays.get(overlayKey(siteCode, locale));
        if (overlay !== undefined) return overlay;
      }
      return sharedBaseOf(byLocale, locale) ?? sharedBaseOf(byLocale, options.defaultLocale)!;
    },
    /**
     * The first two branches of `get`, and nothing else: the site's own override for this exact
     * locale, or a shared dictionary for the locale / its language base. Reached only through the
     * same helpers `get` uses, so the predicate and the answer cannot disagree.
     */
    applicable(locale: Locale, siteCode?: string): boolean {
      if (siteCode !== undefined && overlays.has(overlayKey(siteCode, locale))) return true;
      return sharedBaseOf(byLocale, locale) !== undefined;
    },
    all(): ReadonlyMap<string, Dictionary> {
      return new Map(byLocale);
    },
    overrides(): ReadonlyMap<string, Dictionary> {
      return new Map(overlays);
    },
  };
}

/** The key of one (site, locale) override. */
function overlayKey(siteCode: string, locale: string): string {
  return `${siteCode}/${locale}`;
}

/**
 * S1E2 — THE SITE+LOCALE OVERLAYS
 * ==============================
 *
 * `config/i18n/sites/<site>/<locale>.json` is an OPTIONAL partial override of the shared
 * dictionary for one (site, locale). Every failure is loud and names the file, because a silent
 * override (or a silently ignored one) is how two sites end up convinced they say the same thing:
 *
 *  - a directory that is not a configured site code is refused;
 *  - a file that is not named after one of THAT site's locale path keys is refused;
 *  - an override with no shared dictionary to override is refused;
 *  - a key the dictionary does not define is refused by the override schema;
 *  - the MERGED result must satisfy the complete `dictionarySchema`.
 *
 * A missing `sites/` directory is the ordinary single-dictionary deployment and overrides nothing.
 */
function loadSiteOverlays(
  options: LoadDictionaryRegistryOptions,
  byLocale: ReadonlyMap<string, Dictionary>,
): Map<string, Dictionary> {
  const overlays = new Map<string, Dictionary>();
  if (options.overrideDirectory === undefined) return overlays;

  let siteDirectories: string[];
  try {
    siteDirectories = readdirSync(options.overrideDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return overlays;
  }

  const problems: FileProblem[] = [];
  const declared = new Map((options.sites ?? []).map((site) => [site.code, site]));

  /** The VALIDATED PARTIAL overrides, keyed `<site>/<override key>` — a locale key or its base. */
  const partials = new Map<string, DictionaryOverride>();

  for (const code of siteDirectories) {
    const site = declared.get(code);
    if (site === undefined) {
      problems.push({
        file: code,
        reason:
          `is not a configured site code — declare a "sites" entry for "${code}" in ` +
          "site.config.json, or remove the folder (an override can only belong to a real site)",
      });
      continue;
    }

    const directory = path.join(options.overrideDirectory, code);
    const files = readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const file of files) {
      const relative = `sites/${code}/${file}`;
      const locale = path.basename(file, ".json");

      if (!localeNamePattern.test(locale)) {
        problems.push({ file: relative, reason: "is not named after a locale path key" });
        continue;
      }
      // S1E3 — an override may refine a locale the site serves, OR the LANGUAGE BASE of one of
      // them (`sites/ca/fr.json` covers `ca/fr` and `ca/fr-ca` alike).
      if (!overridesSiteKey(site, locale)) {
        problems.push({
          file: relative,
          reason:
            `is not a locale of site "${code}" ` +
            `(it serves: ${site.locales.join(", ")}), nor the language base of one of them`,
        });
        continue;
      }

      const base = sharedBaseOf(byLocale, locale);
      if (base === undefined) {
        problems.push({
          file: relative,
          reason:
            "has no shared dictionary to override " +
            `(expected config/i18n/${locale}.json or its language base)`,
        });
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path.join(directory, file), "utf8"));
      } catch {
        problems.push({ file: relative, reason: "is not valid JSON" });
        continue;
      }

      const parsed = dictionaryOverrideSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push({
          file: relative,
          reason:
            "fails the site+locale override schema " +
            `(only existing dictionary keys may be overridden):\n${formatIssues(parsed.error.issues)}`,
        });
        continue;
      }

      partials.set(`${code}/${locale}`, parsed.data);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid site+locale dictionary overrides:\n${formatProblems(problems)}`);
  }

  // S1E3 — COMPOSE the EFFECTIVE dictionary of every (site, locale) a site serves:
  //
  //     shared base (exact dictionary, else its language base)
  //        + site LANGUAGE-BASE override   (`sites/ca/fr.json`   — the reusable site wording)
  //        + site EXACT-LOCALE override    (`sites/ca/fr-ca.json` — the finer wording, wins)
  //
  // …and refuse anything that does not satisfy the complete dictionary schema.
  for (const site of options.sites ?? []) {
    for (const locale of site.locales) {
      const keys = [languageBaseOf(locale)];
      if (keys[0] !== locale) keys.push(locale);

      const applied = keys
        .map((key) => partials.get(`${site.code}/${key}`))
        .filter((override): override is DictionaryOverride => override !== undefined);
      if (applied.length === 0) continue;

      const base = sharedBaseOf(byLocale, locale);
      if (base === undefined) continue; // the declared-locale check already refused this config

      let effective = base;
      for (const override of applied) effective = mergeDictionaryOverride(effective, override);

      const complete = dictionarySchema.safeParse(effective);
      if (!complete.success) {
        problems.push({
          file: `sites/${site.code}/${locale}.json`,
          reason: `produced an invalid effective dictionary:\n${formatIssues(complete.error.issues)}`,
        });
        continue;
      }

      overlays.set(overlayKey(site.code, locale), complete.data);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid site+locale dictionary overrides:\n${formatProblems(problems)}`);
  }

  return overlays;
}

/** Whether an override key refines a locale the site serves, or the language base of one. */
function overridesSiteKey(site: DictionarySiteScope, key: string): boolean {
  return site.locales.includes(key) || site.locales.some((locale) => languageBaseOf(locale) === key);
}