import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  pageMetadataForContext,
  spokeServerComposition,
} from "@/app/[[...segments]]/server-composition";
import { sitemapForContext } from "@/app/sitemap-context";
import { robotsForContext } from "@/app/robots-context";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";

/**
 * TEMPLATE-PV-A1 — AN UNLISTED PAGE IS SERVED AND NEVER ADVERTISED, ON EVERY SURFACE
 * =================================================================================
 *
 * THIS SUITE PROVES THE CONTRACT END TO END, on disposable Installations built from the committed synthetic
 * fixture. Nothing here reads the repository's own deployment, and nothing is left behind: every tree is removed
 * in `afterAll`.
 *
 * WHAT IS BEING SEPARATED is the difference between two questions a page's OWN DOCUMENT answers differently:
 *
 *   SERVABILITY    a valid page resolves and is served at its EXACT URL — an unlisted page included;
 *   PUBLICATION    it appears in the automatically generated discovery surfaces — sitemap entries, `hreflang`
 *                  alternates and `x-default` — which an unlisted page does not, while its own response says
 *                  `robots: noindex, nofollow`.
 *
 * EVERY SURFACE ASKS THE SAME COMPOSITION THE SAME QUESTION, so this suite asserts what the sitemap and the
 * metadata actually return: the published inventory, the canonical URL, the language alternates, `x-default`,
 * the per-response robots metadata, and the refusal of an unlisted RESERVED home document — which is what keeps
 * a locale root, a Site's own identity URL, from being hidden.
 *
 * TWO SPOKES, THE SAME COORDINATES. `alpha` and `beta` declare the SAME Sites, the SAME locales and the SAME
 * route paths, and are authored so that one route is PUBLISHED in one Spoke and UNLISTED in the other.
 * Publication is therefore a fact about one Spoke's own authored tree, never about a route name: each Spoke's
 * sitemap and each Spoke's metadata carry only what that Spoke's own documents declare.
 *
 * MARKDOWN IS UNTOUCHED. The Markdown mode has no visibility vocabulary at all, so a Markdown page is public and
 * carries nothing about publication — one fixture below proves it beside the JSON ones.
 */

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

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

/** One valid declarative document, optionally declaring how it publishes itself. */
function json(title: string, visibility?: "public" | "unlisted"): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      title,
      ...(visibility === undefined ? {} : { visibility }),
      sections: [{ type: "prose", body: `${title} body.` }],
    },
    null,
    2,
  )}\n`;
}

/** One Site as `site.config.json` declares it. */
interface SiteFixture {
  readonly code: string;
  readonly label: string;
  readonly locales?: readonly string[];
  readonly defaultLocale?: string;
}

/** One `business.pages` binding: a regional landing, or a configured regional page. */
interface BindingFixture {
  readonly site: string;
  readonly locale: string;
  readonly region: string;
  readonly slug?: string;
}

interface SpokeFixture {
  readonly url: string;
  readonly name: string;
  readonly sites: readonly SiteFixture[];
  readonly bindings: readonly BindingFixture[];
  /** Authored pages, relative to the Spoke's own `content/` root. */
  readonly pages: Readonly<Record<string, string>>;
}

/**
 * ONE DISPOSABLE INSTALLATION declaring ONE Spoke, with its OWN canonical origin, Sites, bindings and pages.
 * Everything else comes from the committed synthetic fixture, so no configuration value is invented here.
 */
function installation(fixture: SpokeFixture): string {
  const root = tempTree("template-pv-a1-");
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
    description: `${fixture.name} description`,
  };
  config.sites = fixture.sites.map((site) => ({ ...site }));
  config.business.pages = fixture.bindings.map((binding) => ({ ...binding }));
  write(path.join(spokeRoot, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  write(path.join(spokeRoot, "content", "README.md"), `# ${fixture.name}\n`);

  for (const locale of ["en", "de"]) {
    write(
      path.join(spokeRoot, "config", "i18n", `${locale}.json`),
      readFileSync(path.join(FIXTURES, "config", "i18n", `${locale}.json`), "utf8"),
    );
  }
  for (const [relative, contents] of Object.entries(fixture.pages)) {
    write(path.join(spokeRoot, "content", relative), contents);
  }

  return root;
}

/** The Spoke's own context, resolved the way the build resolves it. */
function contextOf(root: string): SpokeRuntimeContext {
  const context = runtimeContextForSpoke(installationRuntimeIndex(root), "foundation");
  if (context === null) throw new Error("the fixture Installation must describe its Spoke");
  return context;
}

/** The published inventory of one context, as URLs — the sitemap's own answer. */
async function publishedUrls(context: SpokeRuntimeContext): Promise<string[]> {
  return (await sitemapForContext(context)).map((entry) => entry.url);
}

/** The `hreflang` alternates one URL's response offers, or `{}` when it offers none. */
async function alternatesOf(
  context: SpokeRuntimeContext,
  segments: readonly string[],
): Promise<Record<string, string>> {
  const metadata = await pageMetadataForContext(spokeServerComposition(context), segments);
  const offered: Record<string, string> = {};
  for (const [tag, url] of Object.entries(metadata.alternates?.languages ?? {})) {
    // The builder's own shape is a tag → URL string map; anything else is not a value this contract produces, and
    // the assertions below compare exact URLs, so it could never pass as one.
    offered[tag] = typeof url === "string" ? url : String(url);
  }
  return offered;
}

/** One URL's own `robots` metadata, or `undefined` when the response adds none. */
async function robotsOf(
  context: SpokeRuntimeContext,
  segments: readonly string[],
): Promise<unknown> {
  const metadata = await pageMetadataForContext(spokeServerComposition(context), segments);
  return metadata.robots;
}

/**
 * THE TWO SPOKES. Both declare `ww` (the global Site) and `ca` (a Site with Locations), the same locale set and
 * the same authored route paths — and they disagree about ONE route, so publication can only come from the tree
 * each Spoke actually owns.
 */
const ALPHA_SITES: readonly SiteFixture[] = [
  { code: "ww", label: "Global" },
  { code: "ca", label: "Canada", locales: ["en", "de"], defaultLocale: "en" },
];
const ALPHA_BINDINGS: readonly BindingFixture[] = [
  { site: "ca", locale: "en", region: "north" },
  { site: "ca", locale: "de", region: "north" },
  { site: "ca", locale: "en", region: "south" },
  { site: "ca", locale: "en", region: "north", slug: "quote-public" },
  { site: "ca", locale: "de", region: "north", slug: "quote-public" },
  { site: "ca", locale: "en", region: "north", slug: "quote-unlisted" },
  // A configured regional page whose document does NOT exist: the URL is still published today, and this
  // milestone must not quietly turn a configured URL into a missing one.
  { site: "ca", locale: "en", region: "north", slug: "quote-missing" },
];

const ALPHA_URL = "https://alpha.example";
const BETA_URL = "https://beta.example";

const ALPHA_CONTEXT = contextOf(
  installation({
    url: ALPHA_URL,
    name: "Alpha Spoke",
    sites: ALPHA_SITES,
    bindings: ALPHA_BINDINGS,
    pages: {
      // A global Site: an authored root, a public page, a pair that is public in `de` and unlisted in `en`, a
      // page authored in ONE locale only, and one Markdown page (which has no visibility vocabulary).
      "pages/json/ww/en/home.json": json("Alpha home"),
      "pages/json/ww/en/guide.json": json("Alpha guide"),
      "pages/json/ww/en/hidden.json": json("Alpha hidden (en)", "unlisted"),
      "pages/json/ww/de/hidden.json": json("Alpha hidden (de)"),
      "pages/json/ww/en/notes.json": json("Alpha notes (en only)"),
      "pages/markdown/ww/en/plain.md": "# Alpha plain\n\nA Markdown page.\n",
      // A Site with Locations: public landings, one public regional page, one unlisted regional page, and an
      // unlisted LANDING — every regional shape the routing model has.
      "pages/json/ca/en/north.json": json("Alpha north landing"),
      "pages/json/ca/de/north.json": json("Alpha north landing (de)"),
      "pages/json/ca/en/south.json": json("Alpha south landing", "unlisted"),
      "pages/json/ca/en/north/quote-public.json": json("Alpha public quote"),
      "pages/json/ca/de/north/quote-public.json": json("Alpha public quote (de)", "unlisted"),
      "pages/json/ca/en/north/quote-unlisted.json": json("Alpha unlisted quote", "unlisted"),
    },
  }),
);

const BETA_CONTEXT = contextOf(
  installation({
    url: BETA_URL,
    name: "Beta Spoke",
    sites: [
      { code: "ww", label: "Global" },
      { code: "ca", label: "Canada", locales: ["en"], defaultLocale: "en" },
    ],
    bindings: [{ site: "ca", locale: "en", region: "north" }],
    pages: {
      // The SAME coordinates Alpha publishes, declared unlisted here.
      "pages/json/ww/en/home.json": json("Beta home"),
      "pages/json/ww/en/guide.json": json("Beta guide", "unlisted"),
      "pages/json/ca/en/north.json": json("Beta north landing", "unlisted"),
    },
  }),
);

describe("TEMPLATE-PV-A1 — the published inventory is what PUBLISHES, not what exists", () => {
  it("keeps every public page, every page that declares nothing, and every Markdown page", async () => {
    const urls = await publishedUrls(ALPHA_CONTEXT);
    for (const url of [
      `${ALPHA_URL}`, // the context's own origin leads the inventory, exactly as before
      `${ALPHA_URL}/ww/en`,
      `${ALPHA_URL}/ww/de`,
      `${ALPHA_URL}/ww/en/guide`,
      `${ALPHA_URL}/ww/de/hidden`,
      `${ALPHA_URL}/ww/en/notes`,
      `${ALPHA_URL}/ww/en/plain`,
      `${ALPHA_URL}/ca/en`,
      `${ALPHA_URL}/ca/de`,
      `${ALPHA_URL}/ca/en/north`,
      `${ALPHA_URL}/ca/de/north`,
      `${ALPHA_URL}/ca/en/north/quote-public`,
      // A configured URL whose document does not exist is still published — only an UNLISTED document removes one.
      `${ALPHA_URL}/ca/en/north/quote-missing`,
    ]) {
      expect(urls, url).toContain(url);
    }
  });

  it("omits the unlisted documents — one locale's representation at a time", async () => {
    const urls = await publishedUrls(ALPHA_CONTEXT);
    for (const url of [
      `${ALPHA_URL}/ww/en/hidden`, // unlisted in `en`, published in `de`
      `${ALPHA_URL}/ca/en/south`, // an unlisted regional LANDING
      `${ALPHA_URL}/ca/de/north/quote-public`, // a configured regional page, unlisted in THIS locale
      `${ALPHA_URL}/ca/en/north/quote-unlisted`, // a configured regional page, unlisted everywhere
    ]) {
      expect(urls, url).not.toContain(url);
      expect(JSON.stringify(urls), url).not.toContain(url);
    }
    // The published twin of the first one is still there: the SAME route path, another representation.
    expect(urls).toContain(`${ALPHA_URL}/ww/de/hidden`);
  });
});

describe("TEMPLATE-PV-A1 — an unlisted page is SERVED at its exact URL, and says so", () => {
  it("serves it from the source that actually answers the route", async () => {
    const composition = spokeServerComposition(ALPHA_CONTEXT);
    for (const [site, locale, routePath, title] of [
      ["ww", "en", "hidden", "Alpha hidden (en)"],
      ["ca", "en", "south", "Alpha south landing"],
      ["ca", "en", "north/quote-unlisted", "Alpha unlisted quote"],
    ] as const) {
      const page = await composition.routes.resolve(site, routePath, locale);
      expect(page, routePath).not.toBeNull();
      if (page === null || page.kind !== "json") throw new Error(`expected the JSON page at ${routePath}`);
      expect(page.document.title, routePath).toBe(title);
      // The RESOLVED page carries the decision, so no consumer has to re-read the file to learn it.
      expect(page.visibility, routePath).toBe("unlisted");
    }
    // …and the route is still part of the inventory of what EXISTS, which is what the route boundary serves.
    expect(await composition.routes.listRoutes("ww", "en")).toContain("hidden");
  });

  it("adds `robots: noindex, nofollow` to an unlisted page and NOTHING to a public one", async () => {
    for (const segments of [
      ["ww", "en", "hidden"], // a flat page
      ["ca", "en", "south"], // a regional LANDING
      ["ca", "en", "north", "quote-unlisted"], // a regional page
    ]) {
      expect(await robotsOf(ALPHA_CONTEXT, segments), segments.join("/")).toEqual({
        index: false,
        follow: false,
      });
    }
    // Every public shape gains no robots property at all — a locale root, a page that declares nothing, a page
    // that says `public`, a page authored in one locale only, a Markdown page, a landing and a regional page.
    for (const segments of [
      ["ww", "en"],
      ["ww", "en", "guide"],
      ["ww", "de", "hidden"],
      ["ww", "en", "notes"],
      ["ww", "en", "plain"],
      ["ca", "en", "north"],
      ["ca", "en", "north", "quote-public"],
    ]) {
      expect(await robotsOf(ALPHA_CONTEXT, segments), segments.join("/")).toBeUndefined();
    }
  });

  it("keeps the canonical URL the page's OWN URL — an unlisted page is not rewritten", async () => {
    const flat = await pageMetadataForContext(spokeServerComposition(ALPHA_CONTEXT), ["ww", "en", "hidden"]);
    expect(flat.alternates?.canonical).toBe(`${ALPHA_URL}/ww/en/hidden`);
    const regional = await pageMetadataForContext(spokeServerComposition(ALPHA_CONTEXT), [
      "ca",
      "en",
      "north",
      "quote-unlisted",
    ]);
    expect(regional.alternates?.canonical).toBe(`${ALPHA_URL}/ca/en/north/quote-unlisted`);
  });

  it("never advertises an unlisted URL through robots.txt", async () => {
    // `robots.txt` cannot express a per-URL decision, and a global `disallow` would have to NAME the very URL an
    // author asked to keep out of discovery. The accepted crawl rules are therefore untouched, and the sitemap
    // it points at is already narrowed.
    const robots = robotsForContext(ALPHA_CONTEXT);
    expect(robots.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(robots.sitemap).toBe(`${ALPHA_URL}/sitemap.xml`);
    expect(JSON.stringify(robots)).not.toContain("/ww/en/hidden");
  });
});

describe("TEMPLATE-PV-A1 — an alternate is an advertisement, so it never names an unlisted URL", () => {
  it("keeps public-to-public alternates, and every missing representation, exactly as they were", async () => {
    // `guide` and `notes` are authored in `en` alone: `de` keeps the alternate it has always had, and the default
    // locale's own target IS published, so `x-default` is present — nothing was removed but an unlisted target.
    expect(await alternatesOf(ALPHA_CONTEXT, ["ww", "en", "guide"])).toEqual({
      en: `${ALPHA_URL}/ww/en/guide`,
      de: `${ALPHA_URL}/ww/de/guide`,
      "x-default": `${ALPHA_URL}/ww/en/guide`,
    });
    expect(await alternatesOf(ALPHA_CONTEXT, ["ww", "en", "notes"])).toEqual({
      en: `${ALPHA_URL}/ww/en/notes`,
      de: `${ALPHA_URL}/ww/de/notes`,
      "x-default": `${ALPHA_URL}/ww/en/notes`,
    });
  });

  it("drops the locale whose OWN representation is unlisted, and keeps the other", async () => {
    // `hidden` is unlisted in `en` and published in `de`. Requesting the UNLISTED representation therefore offers
    // only the published one — and NO `x-default`, because the default locale's own representation is the very one
    // that asked not to be advertised.
    expect(await alternatesOf(ALPHA_CONTEXT, ["ww", "en", "hidden"])).toEqual({
      de: `${ALPHA_URL}/ww/de/hidden`,
    });
    // Requesting the PUBLISHED representation offers no link back to the unlisted one, and no `x-default`.
    const published = await alternatesOf(ALPHA_CONTEXT, ["ww", "de", "hidden"]);
    expect(published).toEqual({ de: `${ALPHA_URL}/ww/de/hidden` });
    expect(JSON.stringify(published)).not.toContain("/ww/en/hidden");
  });

  it("keeps every locale ROOT's alternates — a root is published by construction", async () => {
    // An unlisted home document is refused outright, so a root cannot be hidden and every root alternate stands,
    // `x-default` included.
    expect(await alternatesOf(ALPHA_CONTEXT, ["ww", "en"])).toEqual({
      en: `${ALPHA_URL}/ww/en`,
      de: `${ALPHA_URL}/ww/de`,
      "x-default": `${ALPHA_URL}/ww/en`,
    });
  });

  it("judges a REGIONAL alternate by the destination that locale would be sent to", async () => {
    // Site `ca` advertises canonical BCP-47 tags, so its locales are offered as `en-CA` and `de-CA`: the same
    // region and page in another locale is public in `en` and unlisted in `de`, so only the public one is offered
    // — and the tagging itself moved nowhere.
    expect(await alternatesOf(ALPHA_CONTEXT, ["ca", "en", "north", "quote-public"])).toEqual({
      "en-CA": `${ALPHA_URL}/ca/en/north/quote-public`,
      "x-default": `${ALPHA_URL}/ca/en/north/quote-public`,
    });
    // A regional page that is unlisted in `en` is not advertised at all — and the destination another locale
    // WOULD be sent to is judged on its OWN: switching language here lands on `de`'s own public landing, which
    // stays offered. No alternate names an unlisted URL in either direction, and there is no `x-default` because
    // the default locale's own target is the unlisted one.
    const unlisted = await alternatesOf(ALPHA_CONTEXT, ["ca", "en", "north", "quote-unlisted"]);
    expect(unlisted).toEqual({ "de-CA": `${ALPHA_URL}/ca/de/north` });
    expect(JSON.stringify(unlisted)).not.toContain("quote-unlisted");
    // Public landings keep their public-to-public pair untouched, tags and URLs exactly as before.
    expect(await alternatesOf(ALPHA_CONTEXT, ["ca", "en", "north"])).toEqual({
      "en-CA": `${ALPHA_URL}/ca/en/north`,
      "de-CA": `${ALPHA_URL}/ca/de/north`,
      "x-default": `${ALPHA_URL}/ca/en/north`,
    });
  });
});

describe("TEMPLATE-PV-A1 — publication belongs to ONE Spoke's own authored tree", () => {
  it("publishes the same coordinates in one Spoke, and not in the other", async () => {
    const alpha = await publishedUrls(ALPHA_CONTEXT);
    const beta = await publishedUrls(BETA_CONTEXT);

    // The SAME Site, the SAME locale and the SAME route path: `guide` is published in Alpha and unlisted in Beta,
    // and the `ca`/`en`/`north` landing is published in Alpha and unlisted in Beta.
    expect(alpha).toContain(`${ALPHA_URL}/ww/en/guide`);
    expect(beta).not.toContain(`${BETA_URL}/ww/en/guide`);
    expect(alpha).toContain(`${ALPHA_URL}/ca/en/north`);
    expect(beta).not.toContain(`${BETA_URL}/ca/en/north`);
    // …and each Spoke still publishes its OWN roots, so nothing was removed wholesale.
    expect(beta).toContain(`${BETA_URL}/ww/en`);
    expect(beta).toContain(`${BETA_URL}/ca/en`);

    // No URL of one Spoke can appear in the other's inventory, in either direction.
    expect(alpha.some((url) => url.includes("beta.example"))).toBe(false);
    expect(beta.some((url) => url.includes("alpha.example"))).toBe(false);
  });

  it("answers the metadata of the very same coordinates from the Spoke's OWN tree", async () => {
    expect(await robotsOf(ALPHA_CONTEXT, ["ww", "en", "guide"])).toBeUndefined();
    expect(await robotsOf(BETA_CONTEXT, ["ww", "en", "guide"])).toEqual({ index: false, follow: false });
    expect(await robotsOf(ALPHA_CONTEXT, ["ca", "en", "north"])).toBeUndefined();
    expect(await robotsOf(BETA_CONTEXT, ["ca", "en", "north"])).toEqual({ index: false, follow: false });
  });
});

describe("TEMPLATE-PV-A1 — an unlisted RESERVED home document is refused, so no locale root can be hidden", () => {
  const context = contextOf(
    installation({
      url: "https://refused.example",
      name: "Refused home Spoke",
      sites: [{ code: "ww", label: "Global" }],
      bindings: [{ site: "ww", locale: "en", region: "north" }],
      pages: { "pages/json/ww/en/home.json": json("Refused home", "unlisted") },
    }),
  );

  it("refuses the document when it is READ, naming the file, the property and the reason", async () => {
    const composition = spokeServerComposition(context);
    await expect(composition.routes.resolve("ww", "home", "en")).rejects.toThrow(/visibility/);
    await expect(composition.routes.resolve("ww", "home", "en")).rejects.toThrow(/home\.json/);
    await expect(composition.routes.resolve("ww", "home", "en")).rejects.toThrow(/locale root/);
  });

  it("fails the published inventory loudly instead of publishing a root it cannot honour", async () => {
    await expect(sitemapForContext(context)).rejects.toThrow(/unlisted/);
  });

  it("fails the root's own metadata loudly too — the same document decides both surfaces", async () => {
    await expect(
      pageMetadataForContext(spokeServerComposition(context), ["ww", "en"]),
    ).rejects.toThrow(/unlisted/);
  });
});
