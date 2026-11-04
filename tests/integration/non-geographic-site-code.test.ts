import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { resolveSites } from "@/core/site";

/**
 * A NON-GEOGRAPHIC SITE CODE, FROM AN ACTUAL AUTHORING ROOT (`GEO-04` Stage C-A)
 * ==========================================================================
 *
 * The retired ISO allowlist is not merely absent from a helper: a deployment may configure a Site called
 * `workshop` or `chickens`, author that directory, and have it resolved through the real page-source
 * composition. Nothing here is a geographic selector, and an undeclared or ill-formed Site still refuses.
 */
const root = mkdtempSync(path.join(tmpdir(), "r02-site-code-"));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function author(site: string, locale: string, title: string) {
  const directory = path.join(root, "content", "pages", "json", site, locale);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "home.json"),
    JSON.stringify({
      schemaVersion: 1,
      title,
      description: "A descriptive Site authored from a real content root.",
      sections: [{ type: "prose", heading: "Authored", body: `This page belongs to ${site}.` }],
    }),
  );
}

const sites = resolveSites({
  input: [
    { code: "workshop", locales: ["en"], defaultLocale: "en" },
    { code: "chickens", locales: ["en"], defaultLocale: "en" },
  ],
  defaultLocale: "en",
  locales: ["en", "de"],
}).sites;

const pages = createPageSources({
  sites,
  roots: {
    markdownPagesRoot: path.join(root, "content", "pages", "markdown"),
    jsonPagesRoot: path.join(root, "content", "pages", "json"),
  },
});

describe("a configured descriptive Site resolves from its authored directory", () => {
  author("workshop", "en", "The workshop Home");
  author("chickens", "en", "The chickens Home");

  it("resolves both non-geographic Sites from their own folders", async () => {
    const workshop = await pages.resolve("workshop", "home", "en");
    expect(workshop).not.toBeNull();
    expect(workshop?.fallback).toBe(false);
    expect(JSON.stringify(workshop)).toContain("The workshop Home");

    const chickens = await pages.resolve("chickens", "home", "en");
    expect(JSON.stringify(chickens)).toContain("The chickens Home");
  });

  it("refuses an undeclared Site, an ill-formed Site, an unsupported locale and a missing page", async () => {
    expect(await pages.resolve("main", "home", "en")).toBeNull();
    expect(await pages.resolve("..", "home", "en")).toBeNull();
    expect(await pages.resolve("workshop", "home", "de")).toBeNull();
    expect(await pages.resolve("workshop", "no-such-page", "en")).toBeNull();
  });
});
