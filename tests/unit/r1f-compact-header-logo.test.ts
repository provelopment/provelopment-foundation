/**
 * FOUNDATION-UI-R1F — THE COMPACT HEADER LOGO (`site.assets.logoCompact`)
 * =======================================================================
 *
 * THE CAPABILITY. A deployment may configure ONE optional compact alternative to its primary header artwork.
 * Below 600 CSS pixels the header shows the compact artwork; at and above that width the primary logo; with no
 * compact artwork configured the primary logo at every width; with no logo at all the established text brand.
 * The selection is NATIVE — one `<picture>`, one optional `<source>` and one `<img>` — so it is decided by the
 * browser's own source-selection step: no client state, no resize listener, no hydration-dependent switching and
 * no CSS-hidden duplicate image.
 *
 * THE FOUR THINGS THIS FILE PINS, each because it fails differently:
 *
 *   1. THE CONTRACT. The leaf is optional, absolute, and valid ONLY beside a primary logo — a compact artwork is
 *      an alternative to an identity, never an identity of its own, so the schema refuses it alone with an
 *      actionable message (and every existing asset shape stays valid: no forced migration).
 *   2. THE HEADER. ONE picture, ONE optional source, ONE image; the boundary is a literal CSS media query (the
 *      same answer for every Spoke, Site, locale and shell layout — it is not a function of any of them); both
 *      sources resolve through the context's OWN asset resolver; the accessible name, the one alternate text and
 *      the brand link are untouched; and nothing in the component can switch artwork in JavaScript.
 *   3. THE BUILD-TIME RULE. A configured compact asset the context cannot serve fails the build, naming the leaf
 *      and the file — and because the question is asked of THAT context's resolver, a Spoke can never be served
 *      another Spoke's private artwork, even when that file physically exists on disk.
 *   4. THE BUILD PATH ITSELF. `spokeServerComposition` — the entry point the route (and therefore every build
 *      render) goes through — consults the rule, so the refusal is a build failure rather than a broken
 *      responsive image at runtime.
 *
 * Fixtures are DISPOSABLE copies of the accepted synthetic deployment, and every synthetic runtime namespace
 * lives in OS temp: nothing here reads or writes a real deployment, and nothing here writes generated output.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { spokeServerComposition } from "@/app/[[...segments]]/server-composition";
import { assertConfiguredCompactLogoAvailableFor } from "@/config/assets";
import type { RuntimeAssetNamespace } from "@/config/deployment-root";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import { parseSiteConfig } from "@/config/loader";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import { siteAssetsSchema } from "@/config/schema";

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");
/** How many times `needle` occurs in `haystack` (a COUNT, not a presence check: duplicates are the defect). */
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const HEADER = read(path.join("src", "components", "site", "site-header.tsx"));
const STYLESHEET = read(path.join("src", "app", "globals.css"));

/** A compact SQUARE mark — small in both dimensions, the shape a compact alternative really has. */
const SQUARE_ARTWORK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" role="presentation"><circle cx="24" cy="24" r="20" fill="#0f172a"/></svg>\n';

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/**
 * A synthetic runtime namespace — the COMPATIBILITY case the resolver still supports: a real directory holding
 * real artwork, addressed by the URL base the runtime would serve it from. Nothing in the repository is touched,
 * which is also why a namespace a context does not declare is genuinely invisible to its resolver.
 */
function namespace(urlBase: string, files: readonly string[]): RuntimeAssetNamespace {
  const directory = mkdtempSync(path.join(tmpdir(), "r1f-namespace-"));
  trees.push(directory);
  for (const file of files) {
    writeFileSync(path.join(directory, file), SQUARE_ARTWORK, "utf8");
  }
  return { directory, urlBase };
}

/** The accepted synthetic fixture — the SHAPE every disposable copy keeps. */
const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/** The fixture OWN origin, read from its configuration rather than restated here. */
const FIXTURE_ORIGIN = new URL(
  (
    JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8")) as {
      site: { url: string };
    }
  ).site.url,
).origin;

/** ONE disposable Installation whose only Spoke carries the requested `site.assets` block. */
function fixture(assets: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), "r1f-installation-"));
  trees.push(root);
  const spokeRoot = path.join(root, "spokes", "foundation");
  cpSync(FIXTURES, spokeRoot, { recursive: true });
  writeFileSync(
    path.join(root, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "foundation", root: "spokes/foundation" }] }, null, 2)}\n`,
    "utf8",
  );
  const file = path.join(spokeRoot, "site.config.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.site.assets = { ...(config.site.assets ?? {}), ...assets };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return root;
}

/** The ONE Spoke of a fixture Installation, through the accepted runtime authority. */
function contextOf(installationRoot: string): SpokeRuntimeContext {
  const context = runtimeContextForSpoke(installationRuntimeIndex(installationRoot), "foundation");
  if (context === null) throw new Error("the fixture Installation must describe its Spoke");
  return context;
}

/**
 * The artwork THIS installation really publishes in its platform namespace, DERIVED rather than listed
 * (M21 §10): the rule under test is about ownership, so which basenames exist must never be an expectation.
 */
function publishedPlatformArtwork(): string[] {
  const directory = path.join(process.cwd(), "public", "assets");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".svg"))
    .sort();
}

describe("R1F CASE 1 - the configuration contract", () => {
  const PRIMARY = `${FIXTURE_ORIGIN}/assets/logo-header.svg`;
  const COMPACT = `${FIXTURE_ORIGIN}/assets/logo-compact.svg`;

  it("accepts a compact alternative beside a primary logo, and stays OPTIONAL", () => {
    expect(siteAssetsSchema.safeParse({ logo: PRIMARY, logoCompact: COMPACT }).success).toBe(true);
    expect(siteAssetsSchema.safeParse({ logo: PRIMARY }).success).toBe(true);
    expect(siteAssetsSchema.safeParse({}).success).toBe(true);
  });

  it("refuses a compact logo WITHOUT a primary logo, naming the leaf and the fix", () => {
    const parsed = siteAssetsSchema.safeParse({ logoCompact: COMPACT });
    expect(parsed.success, "a compact logo alone is not an identity").toBe(false);
    const issues = parsed.error?.issues ?? [];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].path).toEqual(["logoCompact"]);
    expect(issues[0].message).toContain("site.assets.logoCompact");
    expect(issues[0].message).toContain("site.assets.logo");
  });

  it("keeps every leaf it already had valid (no forced migration, no new requirement)", () => {
    expect(
      siteAssetsSchema.safeParse({
        logo: PRIMARY,
        logoFooter: `${FIXTURE_ORIGIN}/assets/logo-footer.svg`,
        favicon: `${FIXTURE_ORIGIN}/assets/favicon.svg`,
        ogImage: `${FIXTURE_ORIGIN}/assets/og-image.png`,
        headerGraphic: `${FIXTURE_ORIGIN}/assets/header-graphic.svg`,
        footerGraphic: `${FIXTURE_ORIGIN}/assets/footer-graphic.png`,
        statusGraphic: `${FIXTURE_ORIGIN}/assets/status-graphic.svg`,
        banners: { home: `${FIXTURE_ORIGIN}/assets/banner-home.png` },
        backgrounds: { all: `${FIXTURE_ORIGIN}/assets/background-all.svg` },
      }).success,
    ).toBe(true);
    // ...and the compact value SHAPE is validated like every other role: an absolute URL, never a path.
    expect(
      siteAssetsSchema.safeParse({ logo: PRIMARY, logoCompact: "/assets/logo-compact.svg" }).success,
    ).toBe(false);
  });

  it("carries the leaf through the ONE configuration loader, without becoming a second identity", () => {
    const raw = JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8"));
    raw.site.assets = { ...(raw.site.assets ?? {}), logo: PRIMARY, logoCompact: COMPACT };
    const config = parseSiteConfig(raw);
    expect(config.assets?.logo).toBe(PRIMARY);
    expect(config.assets?.logoCompact).toBe(COMPACT);
  });

  it("stays absent by default: the accepted synthetic capsule configures none", () => {
    const raw = JSON.parse(readFileSync(path.join(FIXTURES, "site.config.json"), "utf8"));
    expect(parseSiteConfig(raw).assets?.logoCompact).toBeUndefined();
  });
});

describe("R1F CASE 2 - the header native art direction", () => {
  it("composes ONE picture, ONE optional source and ONE image", () => {
    expect(HEADER).toContain("<picture className=\"ui-site-header-logo-frame\">");
    expect(occurrences(HEADER, "<picture className=")).toBe(1);
    expect(occurrences(HEADER, "<source\n")).toBe(1);
    expect(occurrences(HEADER, "className=\"ui-site-header-logo\"")).toBe(1);
    // ONE accessible image: the alternate text is stated exactly once, and the wrapper adds no second one.
    expect(occurrences(HEADER, "alt={siteConfig.name}")).toBe(1);
  });

  it("states the boundary as ONE literal CSS media query, never as a function of context", () => {
    expect(HEADER).toContain("const COMPACT_LOGO_MEDIA_QUERY = \"(max-width: 599.98px)\"");
    expect(HEADER).toContain("media={COMPACT_LOGO_MEDIA_QUERY}");
    expect(occurrences(HEADER, "COMPACT_LOGO_MEDIA_QUERY")).toBe(2);
    // `599.98` is what makes "below 600 CSS pixels" exact for a fractional viewport; `599` would not be.
    expect(HEADER).not.toContain("\"(max-width: 599px)\"");
    const mediaQuery = /const COMPACT_LOGO_MEDIA_QUERY = ([^;]+);/.exec(HEADER)?.[1] ?? "";
    for (const forbidden of ["locale", "siteId", "spoke", "resolved", "siteConfig"]) {
      expect(mediaQuery, `the boundary must not depend on ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("resolves BOTH sources through this context own asset resolver", () => {
    expect(HEADER).toContain("assets.runtimeAssetUrl(siteConfig.assets?.logo)");
    expect(HEADER).toContain("assets.runtimeAssetUrl(siteConfig.assets?.logoCompact)");
    // The <source> is rendered only when a compact artwork resolved: an installation that configures none is
    // handed ONE source, exactly as before this milestone.
    expect(HEADER).toContain("headerCompactLogoSrc === undefined ? null : (");
  });

  it("keeps one home link, the accessible name and the text fallback untouched", () => {
    expect(HEADER).toContain("aria-label={siteConfig.name}");
    expect(HEADER).toContain("href={`/${locale}`}");
    expect(HEADER).toContain("\"ui-site-header-identity ui-site-header-identity--graphic\"");
    // No logo at all -> the text brand, which a compact leaf alone can never become.
    expect(HEADER).toContain("ui-site-header-identity break-words");
  });

  it("switches nothing in JavaScript: no client state, no listener, no viewport read", () => {
    for (const forbidden of ["useState", "useEffect", "matchMedia(", "addEventListener(", "window.innerWidth"]) {
      expect(HEADER, `the header must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("wraps the pair in a box-less frame, leaving BOTH display limits in force", () => {
    expect(STYLESHEET).toContain(".ui-site-header-logo-frame {");
    expect(STYLESHEET).toContain("display: contents;");
    // The accepted R1E display contract is unchanged, and applies to whichever artwork the browser selected.
    expect(STYLESHEET).toContain("max-inline-size: min(var(--ui-site-header-logo-max-inline-size), 100%);");
    expect(STYLESHEET).toContain("max-block-size: var(--ui-logo-display-size);");
    expect(STYLESHEET).toContain("inline-size: auto;");
    expect(STYLESHEET).toContain("block-size: auto;");
  });

  it("leaves the FOOTER mark contract alone", () => {
    const footer = read(path.join("src", "components", "site", "site-footer.tsx"));
    expect(footer).toContain("siteConfig.assets?.logoFooter");
    expect(footer).toContain("assets.runtimeAssetUrl(siteConfig.assets.logoFooter)");
    expect(footer).not.toContain("logoCompact");
  });
});

describe("R1F CASE 3 - the compact logo must be SERVABLE (build-time rule)", () => {
  const ALPHA_COMPACT = "alpha-compact.svg";
  const BETA_ONLY_COMPACT = "beta-only-compact.svg";
  const platform = namespace("/assets", ["shared-compact.svg"]);
  const alpha = namespace("/spokes/alpha/assets", [ALPHA_COMPACT]);
  const beta = namespace("/spokes/beta/assets", [BETA_ONLY_COMPACT]);
  const forAlpha = createRuntimeAssetOwnershipResolver([platform, alpha]);
  const forBeta = createRuntimeAssetOwnershipResolver([platform, beta]);
  const url = "https://alpha.example.test";
  const at = (urlBase: string, file: string) => `https://alpha.example.test${urlBase}/${file}`;
  const primary = at("/assets", "shared-full.svg");

  it("accepts a compact asset the context OWN namespace holds", () => {
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: at(alpha.urlBase, ALPHA_COMPACT) },
      }),
    ).not.toThrow();
  });

  it("accepts a compact asset from the SHARED platform namespace", () => {
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: at("/assets", "shared-compact.svg") },
      }),
    ).not.toThrow();
  });

  it("REFUSES a configured compact asset nothing holds, naming the leaf and the file", () => {
    const attempt = () =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: at(alpha.urlBase, "never-installed.svg") },
      });
    expect(attempt).toThrow(/never-installed\.svg/);
    expect(attempt).toThrow(/site\.assets\.logoCompact/);
  });

  it("REFUSES another Spoke private compact artwork - even though the file EXISTS on disk", () => {
    // The file is physically present in beta namespace, and alpha resolver still does not own its basename:
    // ownership is asked of the CONTEXT namespaces, never of what happens to be generated on disk.
    expect(existsSync(path.join(beta.directory, BETA_ONLY_COMPACT))).toBe(true);
    expect(forAlpha.iconAssetAvailable(BETA_ONLY_COMPACT)).toBe(false);
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: at(beta.urlBase, BETA_ONLY_COMPACT) },
      }),
    ).toThrow(/beta-only-compact\.svg/);
    // ...and the SAME reference is perfectly valid for the Spoke that DOES own it: the rule is scoping, not
    // prohibition.
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forBeta, {
        url: "https://beta.example.test",
        assets: {
          logo: primary,
          logoCompact: `https://beta.example.test${beta.urlBase}/${BETA_ONLY_COMPACT}`,
        },
      }),
    ).not.toThrow();
  });

  it("REFUSES a compact value on another ORIGIN: delivery is always this deployment's own (R1G)", () => {
    // THE FIRST DISCREPANCY R1G CLOSED: a value on a foreign origin used to be accepted while the render
    // delivered its PATHNAME from THIS origin — a request for artwork hosted elsewhere, which can never appear.
    for (const external of [
      "https://cdn.example.com/brand/logo-compact.svg",
      "https://another-site.example.test/assets/logo-compact.svg",
    ]) {
      const attempt = () =>
        assertConfiguredCompactLogoAvailableFor(forAlpha, {
          url,
          assets: { logo: primary, logoCompact: external },
        });
      expect(attempt, `${external} must be refused`).toThrow(/site\.assets\.logoCompact/);
      expect(attempt, `${external} must be refused`).toThrow(/origin/);
    }
  });

  it("REFUSES a foreign-origin path a LOCAL file of the same basename would silently have answered (R1G)", () => {
    // The worst form of the first discrepancy: the value names beta's namespace on BETA'S ORIGIN, while alpha's
    // own namespace holds a file with that very basename — so the render would have served LOCAL artwork for a
    // value that names something else entirely.
    expect(forAlpha.iconAssetAvailable(BETA_ONLY_COMPACT), "alpha does NOT hold it").toBe(false);
    expect(alpha, "the basename under test is one alpha really ships").toBeDefined();
    const foreignNamingALocallyHeldBasename = `https://beta.example.test${beta.urlBase}/${ALPHA_COMPACT}`;
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: foreignNamingALocallyHeldBasename },
      }),
    ).toThrow(/origin/);
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: "//cdn.example.com/logo-compact.svg" },
      }),
    ).toThrow(/site\.assets\.logoCompact/);
    // ...while a same-origin path OUTSIDE the generated namespace space keeps the latitude every role has: the
    // engine does not generate it and cannot know whether the deployment serves it.
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url,
        assets: { logo: primary, logoCompact: `${url}/uploads/logo-compact.svg` },
      }),
    ).not.toThrow();
  });

  it("proves nothing for an absent or deliberately empty leaf", () => {
    for (const assets of [{}, { logo: primary }, { logo: primary, logoCompact: "" }]) {
      expect(() => assertConfiguredCompactLogoAvailableFor(forAlpha, { url, assets })).not.toThrow();
    }
  });

  it("judges a partial configuration honestly: paths by address space, absolute URLs by a comparable origin", () => {
    // A same-origin PATH carries no origin to compare, so a partial projection (no `site.url`) still works — and
    // the generated address space it names is still proved, exactly as before.
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        assets: { logo: primary, logoCompact: `${alpha.urlBase}/${ALPHA_COMPACT}` },
      }),
    ).not.toThrow();
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        assets: { logo: primary, logoCompact: `${alpha.urlBase}/never-installed.svg` },
      }),
    ).toThrow(/never-installed\.svg/);
    // ...but an ABSOLUTE URL can only be deliverable when its origin IS this deployment's, and with no `site.url`
    // that can never be confirmed — so it is refused rather than rendered as a same-origin request (R1G).
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        assets: { logo: primary, logoCompact: "https://cdn.example.com/logo.svg" },
      }),
    ).toThrow(/site\.url/);
  });
});

describe("R1F CASE 4 - the BUILD PATH consults the rule", () => {
  const published = publishedPlatformArtwork();
  const primary = published[0];
  const compact = published[1];

  it("has platform artwork to work with (the asset mirror installed it)", () => {
    expect(published.length, "the platform namespace publishes artwork").toBeGreaterThan(1);
    expect(primary).toBeDefined();
    expect(compact).toBeDefined();
  });

  it("composes a context whose compact logo the installation serves", () => {
    const root = fixture({
      logo: `${FIXTURE_ORIGIN}/assets/${primary}`,
      logoCompact: `${FIXTURE_ORIGIN}/assets/${compact}`,
    });
    const composition = spokeServerComposition(contextOf(root));
    expect(composition.siteConfig.assets?.logoCompact).toBe(`${FIXTURE_ORIGIN}/assets/${compact}`);
    // ...and the artifact the header renders from is resolvable in THAT context (never a broken image).
    expect(composition.assets.runtimeAssetUrl(composition.siteConfig.assets?.logoCompact)).toBeDefined();
  });

  it("FAILS the build for a configured compact asset no namespace holds", () => {
    const root = fixture({
      logo: `${FIXTURE_ORIGIN}/assets/${primary}`,
      logoCompact: `${FIXTURE_ORIGIN}/spokes/foundation/assets/r1f-never-installed.svg`,
    });
    expect(() => spokeServerComposition(contextOf(root))).toThrow(/r1f-never-installed\.svg/);
  });

  it("FAILS the build for a compact logo addressing another Spoke namespace", () => {
    const root = fixture({
      logo: `${FIXTURE_ORIGIN}/assets/${primary}`,
      logoCompact: `${FIXTURE_ORIGIN}/spokes/another-spoke/assets/r1f-another-spoke-compact.svg`,
    });
    expect(() => spokeServerComposition(contextOf(root))).toThrow(/another-spoke/);
  });

  it("leaves a primary-only installation exactly as it was: nothing is asked, nothing fails", () => {
    const root = fixture({ logo: `${FIXTURE_ORIGIN}/assets/${primary}` });
    const composition = spokeServerComposition(contextOf(root));
    expect(composition.siteConfig.assets?.logoCompact).toBeUndefined();
    expect(composition.assets.runtimeAssetUrl(composition.siteConfig.assets?.logo)).toBeDefined();
  });

  it("leaves the absence of BOTH leaves valid (the text brand)", () => {
    const root = fixture({});
    const composition = spokeServerComposition(contextOf(root));
    expect(composition.siteConfig.assets?.logo).toBeUndefined();
    expect(composition.siteConfig.assets?.logoCompact).toBeUndefined();
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * FOUNDATION-UI-R1G — THE COMPACT LOGO'S RESOLUTION CONTRACT (ORIGIN + NAMESPACE)
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The two discrepancies independent review found in the R1F rule, and what now pins each one shut:
 *
 *   1. ORIGIN. The value was accepted on ANY origin, while the render delivers its PATHNAME from THIS
 *      deployment's origin — the configured origin is canonical SOURCE identity, never a delivery instruction
 *      (BRAND_ASSETS.md §3). A CDN value therefore became a same-origin request for a path the deployment does
 *      not serve, and where a local namespace held the same basename it could even be answered by that file. It
 *      is now REFUSED, naming both origins and the fix.
 *   2. NAMESPACE. The rule judged the BASENAME alone, so a path that explicitly named ANOTHER Spoke's namespace
 *      passed whenever this context held a file with that basename — and then served THIS context's file for a
 *      path naming a different namespace. The path must now name a namespace THIS context may serve, address one
 *      of that namespace's files FLAT exactly as the mirror installs them, and the file must be held by the
 *      namespace the path NAMES. The SHARED platform namespace keeps its established ownership rule.
 */
describe("R1G CASE 5 - the resolution contract: origin and namespace", () => {
  const PLATFORM_COMPACT = "r1g-platform-compact.svg";
  const OWN_COMPACT = "r1g-own-compact.svg";
  const SHARED_BASENAME = "r1g-shared-name.svg";
  const platform = namespace("/assets", [PLATFORM_COMPACT, SHARED_BASENAME]);
  const own = namespace("/spokes/alpha/assets", [OWN_COMPACT]);
  const other = namespace("/spokes/beta/assets", [SHARED_BASENAME]);
  const forAlpha = createRuntimeAssetOwnershipResolver([platform, own]);
  const ORIGIN = "https://alpha.example.test";
  const primary = `${ORIGIN}/assets/${PLATFORM_COMPACT}`;
  const configuredAs = (logoCompact: string) => ({ url: ORIGIN, assets: { logo: primary, logoCompact } });
  const rule = (logoCompact: string) => () =>
    assertConfiguredCompactLogoAvailableFor(forAlpha, configuredAs(logoCompact));

  it("1. RESOLVES a compact asset THIS Spoke's own namespace holds (and a real URL to load)", () => {
    expect(rule(`${ORIGIN}${own.urlBase}/${OWN_COMPACT}`)).not.toThrow();
    expect(forAlpha.runtimeAssetUrl(`${ORIGIN}${own.urlBase}/${OWN_COMPACT}`)).toBe(
      `${own.urlBase}/${OWN_COMPACT}`,
    );
  });

  it("2. RESOLVES a compact asset from the SHARED platform namespace", () => {
    expect(rule(`${ORIGIN}/assets/${PLATFORM_COMPACT}`)).not.toThrow();
    expect(forAlpha.runtimeAssetUrl(`${ORIGIN}/assets/${PLATFORM_COMPACT}`)).toBe(
      `/assets/${PLATFORM_COMPACT}`,
    );
  });

  it("3. REFUSES a generated asset that does not exist", () => {
    expect(rule(`${ORIGIN}/assets/r1g-never-installed.svg`)).toThrow(/r1g-never-installed\.svg/);
    expect(rule(`${ORIGIN}${own.urlBase}/r1g-never-installed.svg`)).toThrow(/r1g-never-installed\.svg/);
    // A path into the generated container that names no namespace base at all can never be served either.
    expect(rule(`${ORIGIN}/spokes/alpha/secret/r1g-never-installed.svg`)).toThrow(/r1g-never-installed\.svg/);
  });

  it("4. REFUSES another Spoke's namespace EVEN WHEN this Spoke holds the same basename", () => {
    // THE EXACT HOLE: beta's path, a basename alpha ALSO holds. The basename used to decide, so alpha's own file
    // was served for a path that named beta's namespace.
    expect(forAlpha.iconAssetAvailable(SHARED_BASENAME), "alpha DOES hold that basename").toBe(true);
    expect(rule(`${ORIGIN}${other.urlBase}/${SHARED_BASENAME}`)).toThrow(/r1g-shared-name\.svg/);
    expect(rule(`${ORIGIN}${other.urlBase}/${SHARED_BASENAME}`)).toThrow(/spokes\/beta\/assets/);
    // ...and it is refused because that NAMESPACE is not this context's, not because the file is missing: the very
    // same reference is valid through a resolver that declares beta's namespace (the Hub's own view).
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(
        createRuntimeAssetOwnershipResolver([platform, other]),
        configuredAs(`${ORIGIN}${other.urlBase}/${SHARED_BASENAME}`),
      ),
    ).not.toThrow();
  });

  it("4b. REFUSES a named namespace that does not hold the file (no substitution, no nested path)", () => {
    // alpha's OWN namespace is named, but the file lives in the platform namespace: the render keeps that very
    // pathname, so nothing would be served there — and the platform's file must not silently stand in for it.
    expect(rule(`${ORIGIN}${own.urlBase}/${PLATFORM_COMPACT}`)).toThrow(/DIFFERENT namespace/);
    // The mirror publishes every role FLAT, so a nested path inside a declared namespace is unservable too.
    expect(rule(`${ORIGIN}${own.urlBase}/nested/${OWN_COMPACT}`)).toThrow(/FLAT/);
  });

  it("5. follows the DOCUMENTED policy for an EXTERNAL URL: refused, because delivery is this origin", () => {
    for (const external of [
      "https://cdn.example.com/content/assets/r1g-platform-compact.svg",
      `https://beta.example.test${other.urlBase}/${SHARED_BASENAME}`,
    ]) {
      expect(rule(external), `${external} must be refused`).toThrow(/site\.assets\.logoCompact/);
      expect(rule(external), `${external} must be refused`).toThrow(/origin/);
    }
    // NO OTHER ROLE CHANGES: the primary logo keeps the accepted latitude (its origin is source identity and the
    // render reduces a value to its pathname), and the compact refusal never touches it.
    expect(forAlpha.runtimeAssetUrl("https://cdn.example.com/content/assets/logo.svg")).toBe(
      "/content/assets/logo.svg",
    );
    expect(() =>
      assertConfiguredCompactLogoAvailableFor(forAlpha, {
        url: ORIGIN,
        assets: { logo: "https://cdn.example.com/content/assets/logo.svg" },
      }),
    ).not.toThrow();
  });

  it("6. leaves a PRIMARY-ONLY installation of every shape exactly as it was", () => {
    for (const assets of [{}, { logo: primary }, { logo: primary, logoCompact: "" }]) {
      expect(() =>
        assertConfiguredCompactLogoAvailableFor(forAlpha, { url: ORIGIN, assets }),
      ).not.toThrow();
    }
  });

  it("7. resolves BOTH sides of the 599/600 switch to real, same-origin, fetchable URLs", () => {
    // The header composes the pair from ONE configured value each, through THIS context's resolver: these are the
    // two URLs the browser requests either side of the boundary (the scenario measures the browser itself).
    const configured = configuredAs(`${ORIGIN}${own.urlBase}/${OWN_COMPACT}`);
    expect(forAlpha.runtimeAssetUrl(configured.assets.logo)).toBe(`/assets/${PLATFORM_COMPACT}`);
    expect(forAlpha.runtimeAssetUrl(configured.assets.logoCompact)).toBe(`${own.urlBase}/${OWN_COMPACT}`);
    for (const delivered of [
      forAlpha.runtimeAssetUrl(configured.assets.logo),
      forAlpha.runtimeAssetUrl(configured.assets.logoCompact),
    ]) {
      expect(delivered, `${delivered} must be a generated namespace path`).toMatch(
        /^\/(assets|spokes\/[^/]+\/assets)\//,
      );
    }
  });
});
