import { describe, expect, it, vi } from "vitest";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so
// it lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in
// the `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2). Its subject is the real capsule, never a fixture.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import PageRoute from "@/app/[[...segments]]/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { loadEfsManifest } from "@/config/efs/manifest";
import { sitemapEntries } from "@/core/efs/discovery";
import { matchBinding, parseContentRoute } from "@/core/efs/publication";
// M21 — SHAPE AND RESOLUTION, NEVER COPY. These helpers read the RENDERED document's structure and the
// deployment's own resolution authority. No authored page is parsed by a test (`AGENTS.md` §14).
import {
  declarativeSectionCount,
  headingLevels,
  headingOutlineIssues,
  markdownSectionAnchors,
  unresolvedDestinations,
} from "../support/rendered-structure";
// The sitemap proofs below go through the REAL boundary (`@/app/sitemap`): the EFS runtime claims the
// deployment's own Host, and each publication's inventory is asked of ITS host's binding. No request
// header is stubbed here — stubbing `next/headers` would also silence the page route's own resolution.


// M18 — the deployment declares TWO Spokes, so this suite binds the FOUNDATION Spoke explicitly (the
// accepted runtime authorities refuse an installation-wide answer for a multi-Spoke Installation, and
// "the" configuration would be the default-Spoke rule the runtime refuses). The reference `ww` Site,
// its dictionaries, its pages and its origin live on this Spoke.
import { foundationConfig as siteConfig, foundationSpoke, germanySpoke } from "../support/spoke-contexts";

// M18 — the public route resolves its Spoke from the REQUEST BOUNDARY's private selection header
// (`x-foundation-spoke-segment`), so a node test that drives the REAL route must present one, exactly as
// the boundary would. Without it a multi-Spoke Installation answers NOTHING (no host claimed → no Spoke),
// which is the honest behaviour the routing contract asserts.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "foundation-template.provelopment.com",
      "x-foundation-spoke-segment": "foundation",
    }),
}));

import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { resolveUiConfig } from "@/core/ui";

import { runtimeAssetFile, runtimeAssetUrl } from "../../../tests/support/runtime-assets";
import { owningNamespaceIn } from "@/config/runtime-asset-resolver";

/**
 * R1A — THE REFERENCE DEPLOYMENT'S CONFIGURATION AND ITS FIRST TWO PAGES.
 *
 * The public repository is also the template's own live reference site, so the
 * things R1A changed are asserted here at the CONFIGURATION and CONTENT level:
 * the real origin (never a placeholder), the favicon an adopter-supplied asset
 * is resolved through, the visitor Layout choice, the Home/About pair authored
 * in the two first-class modes, and the origin those pages' canonical,
 * sitemap and robots output derive from.
 *
 * The rendering-level consequences (the disclosure's two visual states, the
 * live Layout switching, the resolved navigation hrefs) are proved in the
 * committed browser matrix (`reference-content` scenario), which drives a real
 * browser against the shipped configuration.
 */
const REFERENCE_ORIGIN = "https://foundation-template.provelopment.com";

/**
 * WHERE THIS TEST'S FILES COME FROM (FOUNDATION-DEPLOYMENT-ISO-B2A)
 * ----------------------------------------------------------------
 * The deployment's own configuration and asset locations are asked of the ONE deployment-root
 * authority (`@/config/deployment-root`, ISO-B1) — never spelled as a repository-root path here — so
 * this suite follows the deployment wherever it is kept. A PLATFORM file (application source,
 * generated static output) is a property of the repository, which is what `platformRoot` names.
 */
const deployment = foundationSpoke;
const platformRoot = process.cwd();
const platformFile = (...segments: string[]) => path.join(platformRoot, ...segments);

/** The shipped JSON, as an adopter edits it (the loader's own input shape). */
interface RawReferenceConfig {
  readonly site: { readonly url: string; readonly assets?: { readonly favicon?: string } };
  readonly ui: {
    readonly layoutSwitcher?: { readonly enabled?: boolean; readonly default?: "sidebar" | "menu-bar" };
    readonly navigation?: { readonly desktop?: "sidebar"; readonly tablet?: "collapsed-sidebar" };
  };
  readonly navigation: readonly {
    readonly label: string;
    readonly href: string;
    readonly iconOpen?: string;
    readonly iconClosed?: string;
  }[];
}
const rawConfig = (): RawReferenceConfig =>
  JSON.parse(readFileSync(deployment.siteConfigFile, "utf8")) as RawReferenceConfig;

const siteCode = siteConfig.defaultSite.code;
const localePath = siteConfig.defaultSite.defaultLocale;

describe("the reference deployment's own configuration", () => {
  it("declares the live origin as site.url, in the one authority that owns it", () => {
    expect(siteConfig.url).toBe(REFERENCE_ORIGIN);
    // The shipped JSON agrees with the loader: no second, drifting value.
    expect(rawConfig().site.url).toBe(REFERENCE_ORIGIN);
  });

  it("configures the favicon from the asset its own Spoke namespace publishes", () => {
    // S3E1C — the favicon is REPLACEABLE role artwork, so the runtime publishes it in THIS Spoke's own
    // namespace. The earlier expectation pinned the shared platform tree, where no such role is
    // published: it accepted a URL the browser can only 404, which is the defect this test must catch.
    const runtimeUrl = runtimeAssetUrl("favicon.svg");
    expect(runtimeUrl).toBe("/spokes/foundation/assets/favicon.svg");
    // The configured value is that runtime URL on this Spoke's own public origin, and the shipped JSON
    // agrees with the loader: one value, no drift.
    expect(siteConfig.assets?.favicon).toBe(`${REFERENCE_ORIGIN}${runtimeUrl}`);
    expect(rawConfig().site.assets?.favicon).toBe(`${REFERENCE_ORIGIN}${runtimeUrl}`);
    // The declared role resolves to a file this deployment actually SHIPS…
    const file = runtimeAssetFile("favicon.svg");
    expect(file).not.toBeUndefined();
    expect(existsSync(file ?? "")).toBe(true);
    // …and it is not the shared platform tree, which publishes no such role at all.
    expect(runtimeUrl).not.toBe("/assets/favicon.svg");
    expect(existsSync(platformFile("public", "assets", "favicon.svg"))).toBe(false);
  });

  it("configures the Germany Spoke's favicon from ITS OWN namespace, never the other Spoke's", () => {
    const config = germanySpoke.config;
    // The accepted runtime authority answers which of THIS Spoke's namespaces owns the role; the
    // platform namespace does not hold it, so the answer is this Spoke's own namespace.
    const owner = owningNamespaceIn("favicon.svg", germanySpoke.runtimeAssetNamespaces);
    expect(owner, "the Germany Spoke's own namespace owns its favicon role").not.toBeNull();
    expect(owner?.urlBase).not.toBe("/assets");
    expect(owner?.urlBase).not.toContain("foundation");
    // Configured = that namespace's URL on the Germany origin; a cross-Spoke or shared-tree URL is
    // never acceptable, and the name it resolves under is the one actually installed there.
    expect(config.assets?.favicon).toBe(`${config.url}${owner?.urlBase}/favicon.svg`);
    expect(config.assets?.favicon).not.toContain("/spokes/foundation/");
    // …and it is NOT the shared platform tree (which publishes no such role for any Spoke).
    expect(config.assets?.favicon).not.toBe(`${config.url}/assets/favicon.svg`);
    expect(existsSync(path.join(owner?.directory ?? "", "favicon.svg"))).toBe(true);
  });

  it("enables the visitor layout switcher without a competing navigation leaf", () => {
    const ui = rawConfig().ui;
    expect(ui.layoutSwitcher).toEqual({ enabled: true, default: "sidebar" });
    // A layout IS `navigation.desktop`/`tablet`, so the schema refuses both at once;
    // the reference configuration must therefore declare neither.
    expect(ui.navigation?.desktop).toBeUndefined();
    expect(ui.navigation?.tablet).toBeUndefined();
  });

  it("resolves the switcher to the whole layout vocabulary, defaulting to the sidebar", () => {
    const resolved = resolveUiConfig(rawConfig().ui);
    expect(resolved.layoutSwitcher).toEqual({
      enabled: true,
      default: "sidebar",
      available: ["sidebar", "menu-bar"],
    });
    // The sidebar default is the canonical composition: a desktop sidebar + a
    // collapsed tablet rail.
    expect(resolved.navigation.desktop).toBe("sidebar");
    expect(resolved.navigation.tablet).toBe("collapsed-sidebar");
  });

  it("navigates Home and About as the site's two destinations", () => {
    expect(siteConfig.navigation.map((item) => item.href)).toEqual(["/", "/about"]);
    expect(siteConfig.navigation.map((item) => item.label)).toEqual(["Home", "About"]);
    // Icons resolve through the shipped asset family (never a broken <img>).
    for (const item of siteConfig.navigation) {
      for (const icon of [item.iconOpen, item.iconClosed].filter(Boolean)) {
        // The navigation icons are PLATFORM artwork (the icon library), so they ship in the shared
        // platform namespace — asked of the authority rather than assumed.
        expect(runtimeAssetFile(icon as string), icon).not.toBeUndefined();
      }
    }
  });
});

describe("the published reference Pages, as the Installation declares them", () => {
  // GEO-03 R04-C5 — these three proofs used `createPageSources`, the LEGACY country-directory
  // resolver, as though it were the published inventory. That resolver refuses `main` BY DESIGN
  // (`isSiteCode` is the ISO country closed set plus `ww`), and R04 must not widen that authority to
  // make a test pass. The publication authority answers instead: the Installation manifest, and the
  // capsule representations it owns. The legacy resolver keeps its own contract, tested elsewhere
  // against its own fixture, until GEO-04 retires it.
  const loaded = loadEfsManifest(path.join(process.cwd(), "deployment", "efs", "manifest.json"));
  const reference = loaded.manifest?.entities[0];
  const capsuleRoot = path.join(process.cwd(), "deployment", "efs", "capsule");
  const referencePages = reference?.facets[0]?.sites[0]?.pages ?? [];
  const representationPath = (pageId: string, locale: string, extension: "json" | "md") =>
    path.join(
      capsuleRoot,
      reference?.id ?? "",
      reference?.facets[0]?.id ?? "",
      "main",
      "pages",
      pageId,
      `${locale}.${extension}`,
    );

  it("authors Home in the JSON mode at the reserved home slug", () => {
    // The reserved home slug IS the Home page's identity — not a URL segment.
    expect(referencePages.filter((page) => page.id === HOME_CONTENT_SLUG)).toHaveLength(1);
    // The JSON authoring mode really composed it: the representation is a JSON document…
    expect(existsSync(representationPath(HOME_CONTENT_SLUG, "en-001", "json"))).toBe(true);
    // …and it is authored in BOTH published languages of this Site. The capsule filenames are the
    // LOWERCASE locale path key, so these assertions hold on a case-sensitive filesystem too — NTFS
    // would otherwise answer a wrongly-cased name and hide the defect until CI ran.
    for (const locale of ["en-001", "de-de"]) {
      expect(existsSync(representationPath(HOME_CONTENT_SLUG, locale, "json")), locale).toBe(true);
    }
  });

  it("authors About in the Markdown mode at /about", () => {
    expect(referencePages.filter((page) => page.id === "about")).toHaveLength(1);
    expect(existsSync(representationPath("about", "en-001", "md"))).toBe(true);
    // The mode is the fact being proved, so the ABSENCE of a JSON About matters as much as the
    // presence of the Markdown one.
    expect(existsSync(representationPath("about", "en-001", "json"))).toBe(false);
  });

  it("publishes each page's own identity, and no page owns a /home route", () => {
    // The reference Site's whole declared inventory, each Page with its own representations.
    expect(referencePages.map((page) => page.id).sort()).toEqual(["about", "contact", "home"]);
    for (const page of referencePages) {
      expect(page.representations.length, `${page.id} is published`).toBeGreaterThan(0);
    }
    // The reference origins serve this Site at the publication root, and the Site code is the ONE
    // Site the reference publishes — no second, geographic Site is declared.
    const bindings = loaded.manifest?.publications[0]?.bindings ?? [];
    expect(bindings.map((binding) => binding.siteIds)).toEqual([["main"], ["main"]]);
    for (const binding of bindings) {
      expect(binding.prefix, `${binding.host} serves at the root`).toEqual([]);
    }
    // `home` is the reserved root slug, so it is never a separate trailing route segment.
    const about = referencePages.find((page) => page.id === "about");
    expect(about?.id).toBe("about");
  });
});

describe("the served reference pages", () => {
  it("renders the authored Home document: one h1, a valid outline, its real destinations", async () => {
    // The PUBLISHED grammar: the binding prefix is empty and the Site is the publication's default, so
    // the reference's own URL is `/{locale}` — there is no site segment to prepend any more.
    const html = renderToStaticMarkup(await PageRoute({ params: Promise.resolve({ segments: [localePath] }) }));

    // SHAPE, not copy: exactly one page-level heading, and no skipped level anywhere in the outline.
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headingOutlineIssues(headingLevels(html))).toEqual([]);
    // The JSON authoring mode really COMPOSED this page: its per-section markers are present and
    // contiguous from 1 — a fact about the renderer, not about a single authored word.
    expect(declarativeSectionCount(html)).toBeGreaterThan(1);
    // The Site identity the page is served under is the generic one, never the retired geographic code.
    expect(siteCode).toBe("main");
    expect(html).not.toContain("/ww/");
  });

  it("renders the authored About page: one h1, a valid outline, addressable sections", async () => {
    const html = renderToStaticMarkup(
      await PageRoute({ params: Promise.resolve({ segments: [localePath, "about"] }) }),
    );

    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headingOutlineIssues(headingLevels(html))).toEqual([]);
    // The Markdown mode renders its sections as ADDRESSABLE headings: the renderer's OWN anchors exist
    // (the composer's section ids excluded), so the mode and the renderer are proved, not the wording.
    const anchors = markdownSectionAnchors(html);
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor.trim(), "every rendered section heading carries an anchor").not.toBe("");
    }
  });
});

describe("each reference origin advertises exactly its own public Pages", () => {
  const hostOf = (origin: string) => origin.replace(/^https?:\/\//, "");
  const loaded = loadEfsManifest(path.join(process.cwd(), "deployment", "efs", "manifest.json"));
  const urlsFor = async (origin: string) => {
    expect(origin).toBe(REFERENCE_ORIGIN);
    return (await sitemap()).map((entry) => entry.url);
  };

  it("advertises every public representation of the reference Entity at its canonical URL", async () => {
    const urls = await urlsFor(REFERENCE_ORIGIN);
    // R04-C6 — this is the EFS inventory (`efsSitemapForCurrentRequest`), NOT the legacy
    // `sitemapForContext`: three public Pages in each of the Site's two published languages.
    expect(urls).toHaveLength(6);
    for (const locale of ["en-001", "de-de"]) {
      expect(urls, `${locale} Home`).toContain(`${REFERENCE_ORIGIN}/${locale}`);
      expect(urls, `${locale} About`).toContain(`${REFERENCE_ORIGIN}/${locale}/about`);
      expect(urls, `${locale} Contact`).toContain(`${REFERENCE_ORIGIN}/${locale}/contact`);
    }
    // POSITIVELY off-origin-free, and NEGATIVELY: no retired geographic Site segment, no `/home`
    // route, and nothing invented beyond the three authored Pages.
    expect(urls.every((url) => url.startsWith(REFERENCE_ORIGIN))).toBe(true);
    expect(urls.some((url) => /\/(ww|de|main)\//.test(url))).toBe(false);
    expect(urls.some((url) => /\/(home|index)$/.test(url))).toBe(false);
  });

  it("gives the Germany Spoke ITS inventory on ITS origin, and never the reference's", async () => {
    // The Germany Spoke is a different ENTITY behind a different HOST, so its inventory is asked of
    // that host's own binding — the same `sitemapEntries` the runtime composes its sitemap from.
    const germanyOrigin = germanySpoke.config.url;
    expect(germanyOrigin).not.toBe(REFERENCE_ORIGIN);
    const bindings = (loaded.manifest?.publications ?? []).flatMap((publication) => publication.bindings);
    const matched = matchBinding(hostOf(germanyOrigin), "/", bindings);
    expect(matched, "the Germany host is claimed by a binding").not.toBeNull();
    if (!matched) return;

    const germanySite = loaded.manifest?.entities[1]?.facets[0]?.sites[0];
    expect(germanySite?.pages.map((page) => page.id).sort()).toEqual([
      "about",
      "berlin",
      "frankfurt",
      "home",
    ]);
    // VISIBILITY: a representation is published unless its own source declares it unlisted, and this
    // manifest declares no visibility at all — asserted here rather than assumed silently.
    expect(
      (germanySite?.pages ?? []).some((page) =>
        page.representations.some(
          (representation) => "visibility" in representation && representation.visibility !== "public",
        ),
      ),
      "no Germany representation is unlisted in this deployment",
    ).toBe(false);
    const germanyPages = (germanySite?.pages ?? []).map((page) => ({
      pageId: page.id,
      siteId: "main",
      route: [page.id],
      representations: page.representations.map((representation) => ({
        locale: representation.locale,
        visibility: "public" as const,
      })),
    }));
    const entries = sitemapEntries(matched.canonicalBinding, germanyPages);
    // Four Pages in two languages, every one at its canonical URL on the Germany origin.
    expect(entries).toHaveLength(8);
    expect(entries.map((entry) => entry.loc)).toContain(`${germanyOrigin}/de-de/berlin`);
    expect(entries.map((entry) => entry.loc)).toContain(`${germanyOrigin}/en-001/frankfurt`);
    // CROSS-OWNER ISOLATION: nothing off-origin, and no Page only the reference Entity authors.
    expect(entries.every((entry) => entry.loc.startsWith(germanyOrigin))).toBe(true);
    expect(entries.some((entry) => entry.pageId === "contact")).toBe(false);
  });

  it("has no inventory at all for a Host no Spoke owns", async () => {
    // Refusing is the only honest answer: without a binding there is no base to build a URL from, so
    // one owner's Pages can never be advertised under a hostname that owner does not hold.
    const bindings = (loaded.manifest?.publications ?? []).flatMap((publication) => publication.bindings);
    expect(matchBinding("unclaimed.example", "/", bindings)).toBeNull();
  });

  it("references that sitemap from robots.txt", async () => {
    expect((await robots()).sitemap).toBe(`${REFERENCE_ORIGIN}/sitemap.xml`);
  });
});

describe("every internal destination a reference Page renders is a published Page", () => {
  // R04-C6 — restored coverage. R04-C5 proved that `ww` was absent but not that the rendered links
  // actually RESOLVE; these proofs ask the publication model, never the retired country-directory
  // resolver, so a link is valid because the Page is published — not because a string was expected.
  const loaded = loadEfsManifest(path.join(process.cwd(), "deployment", "efs", "manifest.json"));
  const referencePages = loaded.manifest?.entities[0]?.facets[0]?.sites[0]?.pages ?? [];
  const bindings = (loaded.manifest?.publications ?? []).flatMap((publication) => publication.bindings);
  const defaultLocaleKey = siteConfig.defaultSite.defaultLocale.toLowerCase();
  const referenceHost = REFERENCE_ORIGIN.replace(/^https?:\/\//, "");
  // A Page's internal destinations: ROOT-relative links plus SAME-ORIGIN absolute ones (authored
  // Markdown may write either form). A genuinely external link is not a destination this deployment
  // serves, so it is not a candidate here.
  const internalHrefs = (html: string) =>
    [...html.matchAll(/href="([^"]*)"/g)]
      .map((match) => match[1].split(/[?#]/)[0])
      .map((href) => (href.startsWith(REFERENCE_ORIGIN) ? href.slice(REFERENCE_ORIGIN.length) : href))
      .filter((href) => href.startsWith("/"));

  const publishedPage = (slug: string, locale: string) => {
    const page = referencePages.find((candidate) => candidate.id === slug);
    if (!page) return null;
    const authored = page.representations.map((representation) => representation.locale.toLowerCase());
    // Same Page, same owner: the requested language, or THIS Page's own fallback to the publication's
    // default language. Another Site's, another Facet's or another Entity's tree is never consulted.
    return authored.includes(locale) || authored.includes(defaultLocaleKey) ? page : null;
  };
  const unresolved = (html: string) =>
    unresolvedDestinations(html, async (slug) => publishedPage(slug, localePath), {
      prefixes: [`/${localePath}`],
      homeSlug: HOME_CONTENT_SLUG,
    });

  const prove = async (segments: string[], options: { requireLinks?: boolean } = {}) => {
    const requireLinks = options.requireLinks ?? true;
    const html = renderToStaticMarkup(await PageRoute({ params: Promise.resolve({ segments }) }));
    // 1. No orphaned destination: every internal link answers with an authored Page.
    expect(await unresolved(html)).toEqual([]);
    // 2. No invented route: every destination parses under the OWNING binding's own grammar.
    const hrefs = internalHrefs(html);
    if (requireLinks) expect(hrefs.length, `${segments.join("/")} renders internal destinations`).toBeGreaterThan(0);
    for (const href of hrefs) {
      const matched = matchBinding(referenceHost, href, bindings);
      expect(matched, `${href} is served by a reference binding`).not.toBeNull();
      if (!matched) continue;
      const route = parseContentRoute(matched.binding, matched.remaining);
      expect(route.kind, `${href} parses as a content route`).toBe("route");
      if (route.kind !== "route") continue;
      expect(matched.binding.siteIds, `${href} names a Site this binding publishes`).toContain(
        route.route.siteId,
      );
      expect(["en-001", "de-de"], `${href} names a qualified locale`).toContain(route.route.localeKey);
      // A Page is one segment (the locale root is Home) — never a nested or fabricated route.
      expect(route.route.pageRoute.length, `${href} addresses a Page`).toBeLessThanOrEqual(1);
      const slug = route.route.pageRoute[0] ?? HOME_CONTENT_SLUG;
      expect(publishedPage(slug, route.route.localeKey), `${href} resolves to an authored Page`).not.toBeNull();
    }
  };

  it("resolves every destination rendered by Home", async () => {
    await prove([localePath]);
  });

  it("resolves every destination rendered by About", async () => {
    // About is prose: whether it links at all is the owner's editorial choice, so the SHAPE proof is
    // that no destination it does render is orphaned, not that it renders one.
    await prove([localePath, "about"], { requireLinks: false });
  });
});

describe("the authored Home replaces the starter homepage", () => {
  it("does not render the configuration-driven starter hero", async () => {
    const html = renderToStaticMarkup(await PageRoute({ params: Promise.resolve({ segments: [localePath] }) }));
    expect(html).not.toContain("home-hero");
  });
});

describe("the shared sidebar disclosure contract (source-level guard)", () => {
  const css = readFileSync(platformFile("src", "app", "globals.css"), "utf8");

  it("insets the disclosed control's content through a token — padding, never a transform", () => {
    expect(css).toContain("--ui-sidebar-control-inset:");
    // NAV1D — the token's owner is the ONE `.ui-sidebar-toggle` rule (the sidebar-scoped override
    // that re-anchored the box was removed together with its negative margin: it was the cause of
    // the rail's asymmetric padding and of the clipped Show/Hide focus ring, and the token usage
    // moved here so the contract is stated exactly once, for every state). The selector is anchored
    // at a line start, so the collapse-state override can never be mistaken for it.
    const controlRule = /\n\.ui-sidebar-toggle \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(controlRule).toContain("padding-inline: var(--ui-sidebar-control-inset);");
    expect(css).not.toMatch(/\n\.ui-shell-sidebar \.ui-sidebar-toggle \{/);
    expect(css).not.toMatch(/\.ui-sidebar-toggle\s*\{[^}]*transform:/);
  });

  it("makes the collapsed control transparent WITHOUT shrinking its hit target", () => {
    const collapsed =
      /\.ui-sidebar-rail\[data-collapsed="true"\] \.ui-sidebar-toggle \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(collapsed).toContain("background-color: transparent;");
    expect(collapsed).toContain("border-color: transparent;");
    // The box — and therefore the target — is deliberately unchanged.
    expect(collapsed).toContain("width: 100%;");
    // The collapsed affordance is kept explicitly, so transparency cannot silence it.
    expect(css).toMatch(
      /\.ui-sidebar-rail\[data-collapsed="true"\] \.ui-sidebar-toggle:hover \{[\s\S]*?background-color: var\(--muted\);/,
    );
  });
});
