/**
 * A DISPOSABLE ONE-SITE SEED FOR PAGE-IDENTITY PROOFS (`S3-E3-R07`)
 * =================================================================
 *
 * The repository fixture has two Sites. These proofs need one Site with two locales, two genuinely
 * colliding route spellings, nested content in more than one locale, and control over which locales
 * author a Home. The helper copies the fixture, then writes only that authored test material.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { syntheticSeed } from "./installation-establishment-fixture";

export interface PageIdentitySeedOptions {
  /** The Site's explicit default locale. */
  readonly defaultLocale?: "en" | "de";
  /** Locales that author a Home. An empty list exercises the starter-Home path. */
  readonly homeLocales?: readonly ("en" | "de")[];
}

const HOME_PATH = (locale: string): string =>
  `content/pages/json/ww/${locale}/home.json`;

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
      code: "ww",
      label: "Global",
      locales: ["en", "de"],
      defaultLocale: options.defaultLocale ?? "en",
    },
  ];
  config.defaultSite = "ww";
  delete config.business;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const write = (relative: string, bytes: string): void => {
    const absolute = path.join(seed, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes, "utf8");
  };

  write("content/pages/json/ww/en/company/team.json", pageDocument("Nested Team (EN)"));
  write("content/pages/json/ww/de/company/team.json", pageDocument("Nested Team (DE)"));
  write("content/pages/json/ww/en/company-team.json", pageDocument("Flat Company Team (EN)"));

  const homeLocales = options.homeLocales ?? ["en"];
  for (const locale of ["en", "de"] as const) {
    if (!homeLocales.includes(locale)) {
      rmSync(path.join(seed, ...HOME_PATH(locale).split("/")), { force: true });
    }
  }
  for (const locale of homeLocales) {
    write(HOME_PATH(locale), pageDocument(locale === "de" ? "Startseite" : "Home"));
  }

  return seed;
}
