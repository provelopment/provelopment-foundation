import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  pageMetadataForContext,
  spokeServerComposition,
} from "@/app/[[...segments]]/server-composition";
import { openGraphImageModelForContext } from "@/app/[site]/[locale]/opengraph-model";
import { robotsForContext } from "@/app/robots-context";
import { sitemapForContext } from "@/app/sitemap-context";
import { buildClientRoutingContext } from "@/components/site/client-routing";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import { siteSetOf } from "@/core/site";

/**
 * M14 — EVERY SURFACE THIS MILESTONE CONVERTED ISOLATES TWO SPOKES IN ONE PROCESS
 * ==============================================================================
 *
 * M13 proved the page/layout render graph; this suite proves the surfaces M14 converted, with the same
 * fixture discipline: two disposable Installations sharing the SAME logical coordinates (`ww` / `en` /
 * About) while differing in configuration, dictionary wording, page text and canonical origin.
 *
 * For each surface the sequence the browser test will run — A, B, A, B — must give `A1 == A2`, `B1 == B2`
 * and `A != B` for every deliberately distinct authored value, with no mutable global reset:
 *
 *   client routing projection   the four controls' server-supplied routing data;
 *   OpenGraph image model       the pure model the image route renders from;
 *   sitemap                     origin + inventory;
 *   robots                      the advertised sitemap origin.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

interface SpokeFixture {
  readonly name: string;
  readonly url: string;
  readonly tagline: string;
  readonly marker: string;
  readonly aboutTitle: string;
  /** The site codes this Spoke declares (the fixture configuration's sites, filtered in order). */
  readonly sites?: readonly string[];
  /** Extra authored route this Spoke alone publishes — the inventory difference the sitemap must show. */
  readonly extraRoute?: string;
  /**
   * TEMPLATE-PV-A1 — authored routes whose publication is the DIFFERENCE this suite proves: `publicRoutes` are
   * ordinary declarative documents, `unlistedRoutes` declare `visibility: "unlisted"`. Both are authored at the
   * same coordinates on every Spoke, so only the Spoke's OWN tree can explain the difference.
   */
  readonly publicRoutes?: readonly string[];
  readonly unlistedRoutes?: readonly string[];
}

/** One disposable Installation declaring exactly ONE Spoke, with its own config, words and pages. */
function installation(fixture: SpokeFixture): string {
  const root = tempTree("m14-spoke-");
  const spokeRoot = path.join(root, "spokes", "foundation");

  write(
    path.join(root, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "foundation", root: "spokes/foundation" }] }, null, 2)}\n`,
  );

  const config = JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8"));
  config.site = {
    ...config.site,
    url: fixture.url,
    name: fixture.name,
    tagline: fixture.tagline,
    description: `${fixture.name} description`,
  };
  if (fixture.sites !== undefined) {
    // The two fixtures deliberately declare DIFFERENT site sets, so every projected inventory differs. Every
    // configuration block that NAMES a site is filtered with the same predicate, so the fixture stays valid.
    const declared = fixture.sites;
    config.sites = config.sites.filter((site: { code: string }) => declared.includes(site.code));
    config.business.pages = config.business.pages.filter((binding: { site?: string }) =>
      binding.site === undefined ? false : declared.includes(binding.site),
    );
  }
  write(path.join(spokeRoot, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  const dictionary = JSON.parse(
    readFileSync(path.join(FIXTURES, "config", "i18n", "en.json"), "utf8"),
  );
  dictionary.home = { ...dictionary.home, tagline: fixture.marker };
  write(
    path.join(spokeRoot, "config", "i18n", "en.json"),
    `${JSON.stringify(dictionary, null, 2)}\n`,
  );
  write(
    path.join(spokeRoot, "config", "i18n", "de.json"),
    readFileSync(path.join(FIXTURES, "config", "i18n", "de.json"), "utf8"),
  );

  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", "about.md"),
    `# ${fixture.aboutTitle}\n\nBody copy.\n`,
  );
  if (fixture.extraRoute !== undefined) {
    write(
      path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", `${fixture.extraRoute}.md`),
      `# ${fixture.extraRoute}\n\nOnly this Spoke has it.\n`,
    );
  }
  // TEMPLATE-PV-A1 — declarative documents at the SAME coordinates on both Spokes, declaring the publication
  // state that differs between them.
  for (const route of fixture.publicRoutes ?? []) {
    write(
      path.join(spokeRoot, "content", "pages", "json", "ww", "en", `${route}.json`),
      `${JSON.stringify({ schemaVersion: 1, title: `${route} (public)`, sections: [] }, null, 2)}\n`,
    );
  }
  for (const route of fixture.unlistedRoutes ?? []) {
    write(
      path.join(spokeRoot, "content", "pages", "json", "ww", "en", `${route}.json`),
      `${JSON.stringify(
        { schemaVersion: 1, title: `${route} (unlisted)`, visibility: "unlisted", sections: [] },
        null,
        2,
      )}\n`,
    );
  }

  return root;
}

function contextOf(installationRoot: string): SpokeRuntimeContext {
  const context = runtimeContextForSpoke(installationRuntimeIndex(installationRoot), "foundation");
  if (context === null) throw new Error("the fixture Installation must describe its Spoke");
  return context;
}

const ALPHA: SpokeFixture = {
  name: "Alpha Spoke",
  url: "https://alpha.example",
  tagline: "Alpha tagline",
  marker: "ALPHA_WORDING",
  aboutTitle: "Alpha About",
  publicRoutes: ["quiet"],
};

const BETA: SpokeFixture = {
  name: "Beta Spoke",
  url: "https://beta.example",
  tagline: "Beta tagline",
  marker: "BETA_WORDING",
  aboutTitle: "Beta About",
  sites: ["ww"],
  extraRoute: "beta-only",
  unlistedRoutes: ["quiet"],
};

const compositionA = contextOf(installation(ALPHA));
const compositionB = contextOf(installation(BETA));

/** The client-safe routing projection of one context — built the way the server builds it. */
function routingOf(context: SpokeRuntimeContext) {
  return buildClientRoutingContext(
    context.siteConfig,
    siteSetOf(context.siteConfig.sites, context.siteConfig.defaultSite),
  );
}

describe("M14 — the client routing projection is Spoke-local", () => {
  it("proves A/B/A/B stability and cross-Spoke difference with no global reset", () => {
    const a1 = routingOf(compositionA);
    const b1 = routingOf(compositionB);
    const a2 = routingOf(compositionA);
    const b2 = routingOf(compositionB);

    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);
  });

  it("carries only its OWN site, bindings and locale facts", () => {
    const a = routingOf(compositionA);
    const b = routingOf(compositionB);

    // Alpha declares the fixture's two sites; Beta deliberately declares ONE — and each projection carries
    // exactly what ITS Spoke declares, so a client can only resolve against the Spoke its server composed it
    // for.
    expect(a.siteSet.sites.map((site) => site.code)).toEqual(["ww", "ca"]);
    expect(b.siteSet.sites.map((site) => site.code)).toEqual(["ww"]);
    expect(a.siteSet).not.toEqual(b.siteSet);
    expect(JSON.stringify(a.pageBindings)).not.toBe(JSON.stringify(b.pageBindings));
  });
});

describe("M14 — the OpenGraph image model is context-bound", () => {
  it("proves A/B/A/B stability and cross-Spoke difference", () => {
    const a1 = openGraphImageModelForContext(compositionA, "ww", "en");
    const b1 = openGraphImageModelForContext(compositionB, "ww", "en");
    const a2 = openGraphImageModelForContext(compositionA, "ww", "en");
    const b2 = openGraphImageModelForContext(compositionB, "ww", "en");

    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);
  });

  it("draws this context's identity, its localized words and its canonical origin", () => {
    const a = openGraphImageModelForContext(compositionA, "ww", "en");
    const b = openGraphImageModelForContext(compositionB, "ww", "en");

    expect(a.siteName).toBe(ALPHA.name);
    expect(b.siteName).toBe(BETA.name);
    expect(a.tagline).toBe(ALPHA.marker);
    expect(b.tagline).toBe(BETA.marker);
    expect(a.imageUrl).toBe("https://alpha.example/ww/en");
    expect(b.imageUrl).toBe("https://beta.example/ww/en");
  });

  it("keeps the accepted fallbacks INSIDE the context it was handed", () => {
    // An unrecognized site falls back to THIS context's default site; a locale the site does not serve falls
    // back to that site's default locale — never to another Spoke's configuration.
    const unknownSite = openGraphImageModelForContext(compositionA, "de", "en");
    expect(unknownSite.siteCode).toBe("ww");
    expect(unknownSite.imageUrl.startsWith("https://alpha.example")).toBe(true);

    const unsupportedLocale = openGraphImageModelForContext(compositionA, "ww", "zz");
    expect(unsupportedLocale.localePath).toBe("en");
  });
});

describe("M14 — the sitemap is context-bound", () => {
  it("proves A/B/A/B stability and cross-Spoke difference", async () => {
    const a1 = (await sitemapForContext(compositionA)).map((entry) => entry.url);
    const b1 = (await sitemapForContext(compositionB)).map((entry) => entry.url);
    const a2 = (await sitemapForContext(compositionA)).map((entry) => entry.url);
    const b2 = (await sitemapForContext(compositionB)).map((entry) => entry.url);

    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);
  });

  it("publishes only its OWN origin and its OWN inventory", async () => {
    const a = (await sitemapForContext(compositionA)).map((entry) => entry.url);
    const b = (await sitemapForContext(compositionB)).map((entry) => entry.url);

    for (const url of a) expect(url.startsWith("https://alpha.example")).toBe(true);
    for (const url of b) expect(url.startsWith("https://beta.example")).toBe(true);

    // Both contexts serve `ww/en/about` — from their OWN trees — while only Beta authored its extra route.
    expect(a).toContain("https://alpha.example/ww/en/about");
    expect(b).toContain("https://beta.example/ww/en/about");
    expect(b.some((url) => url.includes("beta-only"))).toBe(true);
    expect(a.some((url) => url.includes("beta-only"))).toBe(false);
    // No URL of one context may appear in the other's sitemap.
    expect(a.some((url) => url.includes("beta.example"))).toBe(false);
    expect(b.some((url) => url.includes("alpha.example"))).toBe(false);
  });
});

describe("M14 — robots advertises the context's own sitemap", () => {
  it("proves A/B/A/B stability and cross-Spoke origin isolation", () => {
    const a1 = robotsForContext(compositionA);
    const b1 = robotsForContext(compositionB);
    const a2 = robotsForContext(compositionA);
    const b2 = robotsForContext(compositionB);

    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);

    expect(a1.sitemap).toBe("https://alpha.example/sitemap.xml");
    expect(b1.sitemap).toBe("https://beta.example/sitemap.xml");
    // The accepted crawl rules are untouched.
    expect(a1.rules).toEqual({ userAgent: "*", allow: "/" });
  });
});

/**
 * TEMPLATE-PV-A1 — PUBLICATION IS ONE SPOKE'S OWN FACT, ON THE SAME COORDINATES
 * =============================================================================
 *
 * Both Spokes author `ww/en/quiet`; only Alpha publishes it. Every other describe above proves A/B/A/B stability
 * for facts that come from configuration, dictionaries and pages — and this is the same proof for the publication
 * fact, which must never leak in from the neighbouring Spoke's tree.
 */
describe("TEMPLATE-PV-A1 — an unlisted page is a fact about ONE Spoke's own tree", () => {
  it("publishes the SAME route in one Spoke's sitemap and not in the other's", async () => {
    const a1 = (await sitemapForContext(compositionA)).map((entry) => entry.url);
    const b1 = (await sitemapForContext(compositionB)).map((entry) => entry.url);
    const a2 = (await sitemapForContext(compositionA)).map((entry) => entry.url);

    expect(a1).toContain("https://alpha.example/ww/en/quiet");
    expect(b1).not.toContain("https://beta.example/ww/en/quiet");
    // A/B/A/B: a neighbour's tree cannot change this Spoke's answer, in any order.
    expect(a2).toEqual(a1);
  });

  it("takes the response's robots metadata from the Spoke's OWN page", async () => {
    const a = await pageMetadataForContext(spokeServerComposition(compositionA), ["ww", "en", "quiet"]);
    const b = await pageMetadataForContext(spokeServerComposition(compositionB), ["ww", "en", "quiet"]);

    expect(a.robots).toBeUndefined();
    expect(b.robots).toEqual({ index: false, follow: false });
    // …and each canonical URL is its OWN origin, so neither response describes the other Spoke's page.
    expect(a.alternates?.canonical).toBe("https://alpha.example/ww/en/quiet");
    expect(b.alternates?.canonical).toBe("https://beta.example/ww/en/quiet");
  });
});
