/**
 * A DISPOSABLE ONE-SITE SEED FOR PAGE-IDENTITY PROOFS (`S3-E3-R07`, reconciled by `GEO-03 R04-C9`)
 * =================================================================================================
 *
 * The repository fixture has two Sites. These proofs need one Site with two locales, two genuinely
 * colliding route spellings, nested content in more than one locale, and control over which locales
 * author a Home. The helper copies the fixture, then writes only that authored test material.
 *
 * THE DECLARATIONS AND THE AUTHORED PATHS ARE ONE OPERATION. `syntheticSeed()` already qualifies the
 * fixture's languages; this helper replaces the Site list AFTER that, so it must restate the same
 * qualified vocabulary or it silently un-qualifies the seed:
 *
 *   - the Site is the accepted DESCRIPTIVE identity `main` — a presentation identity, never a country;
 *   - the declared languages are publication-qualified TAGS (`en-001`, `de-DE`);
 *   - the authored directory keys are the lowercase PATH KEYS (`en-001`, `de-de`).
 *
 * The option API stays the convenient `"en" | "de"` and is mapped explicitly, so a caller never has to
 * know a tag from a path key.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { syntheticSeed } from "./installation-establishment-fixture";

export interface PageIdentitySeedOptions {
  /** The Site's explicit default locale. */
  readonly defaultLocale?: "en" | "de";
  /** Locales that author a Home. An empty list exercises the starter-Home path. */
  readonly homeLocales?: readonly ("en" | "de")[];
}

/** The single Site these proofs author: descriptive, location-independent, one per seed. */
const SITE_CODE = "main";
const SITE_LABEL = "Global";

/** Option value -> the declared tag and the authored path key. The two are deliberately not one string. */
const QUALIFIED: Readonly<Record<"en" | "de", { readonly tag: string; readonly pathKey: string }>> = {
  en: { tag: "en-001", pathKey: "en-001" },
  // The fixture's GLOBAL language list — qualified by `syntheticSeed()` from the same map — spells the
  // German entry `de-de`. A Site may only declare languages its configuration declares globally, and the
  // establishment validator compares them as authored, so this seed must use THAT exact spelling. The
  // canonical `de-DE` capitalisation is applied by publication qualification, which is where the reference
  // deployment gets it; a mismatch here is what made establishment refuse the whole configuration.
  de: { tag: "de-de", pathKey: "de-de" },
};

const pagePath = (locale: "en" | "de", route: string): string =>
  `content/pages/json/${SITE_CODE}/${QUALIFIED[locale].pathKey}/${route}.json`;

const pageDocument = (title: string): string =>
  `${JSON.stringify({ schemaVersion: 1, title, sections: [] }, null, 2)}\n`;

export function pageIdentitySeed(options: PageIdentitySeedOptions = {}): string {
  const seed = syntheticSeed();
  const configPath = path.join(seed, "site.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    sites: unknown[];
    defaultSite?: string;
    business?: unknown;
  };
  config.sites = [
    {
      code: SITE_CODE,
      label: SITE_LABEL,
      locales: [QUALIFIED.en.tag, QUALIFIED.de.tag],
      defaultLocale: QUALIFIED[options.defaultLocale ?? "en"].tag,
    },
  ];
  config.defaultSite = SITE_CODE;
  delete config.business;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  // The fixture's other Sites are now undeclared, so their authored material goes with them: this seed
  // is a ONE-Site proof, and leaving orphaned page trees behind would be authored state nothing owns.
  const pagesRoot = path.join(seed, "content", "pages");
  for (const mode of readdirSync(pagesRoot)) {
    const modeRoot = path.join(pagesRoot, mode);
    if (!statSync(modeRoot).isDirectory()) continue;
    for (const site of readdirSync(modeRoot)) {
      const siteRoot = path.join(modeRoot, site);
      if (site === SITE_CODE) continue;
      if (statSync(siteRoot).isDirectory()) rmSync(siteRoot, { recursive: true, force: true });
    }
  }

  const write = (relative: string, bytes: string): void => {
    const absolute = path.join(seed, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes, "utf8");
  };

  // The collision pair: `company/team` (nested) and `company-team` (flat) stay two distinct Pages.
  write(pagePath("en", "company/team"), pageDocument("Nested Team (EN)"));
  write(pagePath("de", "company/team"), pageDocument("Nested Team (DE)"));
  write(pagePath("en", "company-team"), pageDocument("Flat Company Team (EN)"));

  const homeLocales: readonly ("en" | "de")[] = options.homeLocales ?? ["en"];
  for (const locale of ["en", "de"] as const) {
    if (!homeLocales.includes(locale)) {
      rmSync(path.join(seed, ...pagePath(locale, "home").split("/")), { force: true });
    }
  }
  for (const locale of homeLocales) {
    write(pagePath(locale, "home"), pageDocument(locale === "de" ? "Startseite" : "Home"));
  }

  return seed;
}
