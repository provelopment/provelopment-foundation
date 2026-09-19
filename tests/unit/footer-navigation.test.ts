import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { siteConfigFileSchema } from "@/config/schema";
import { parseSiteConfig } from "@/config/loader";
import { siteConfig } from "@/config";
import { createDirectionLinkResolver } from "@/adapters/maps";

/**
 * The OPTIONAL secondary / footer navigation group (FOUNDATION-WEB-R1C).
 *
 * Why this surface exists: the Foundation profile was using `connect.methods` as
 * a surrogate footer navigation group, which is semantically wrong (those are
 * CONTACT methods) and left the shared Connect gateway heading pointing at the
 * retired `/connect`. This block is a distinct navigation concern with its own
 * contract, and these tests lock that contract from both ends: the validated
 * configuration surface, and the rendered footer.
 */

const root = process.cwd();
const footerSource = readFileSync(
  path.join(root, "src", "components", "site", "site-footer.tsx"),
  "utf8",
);

/** The shipped template configuration, as a raw object we can vary. */
const rawConfig = JSON.parse(
  readFileSync(path.join(root, "site.config.json"), "utf8"),
) as Record<string, unknown>;

const GROUP = {
  heading: "Project",
  items: [
    { label: "Home", href: "/" },
    { label: "Help", href: "/help" },
    { label: "GitHub", href: "https://github.com/provelopment/provelopment-foundation" },
  ],
};

const parseWith = (footerNavigation: unknown) =>
  siteConfigFileSchema.safeParse({ ...rawConfig, footerNavigation });

describe("footerNavigation — the validated configuration surface", () => {
  it("is OPTIONAL: an absent block is valid and changes nothing", () => {
    const result = siteConfigFileSchema.safeParse(rawConfig);
    expect(result.success).toBe(true);
    expect(parseWith(undefined).success).toBe(true);
  });

  it("accepts a heading plus items, and items WITHOUT a heading", () => {
    expect(parseWith(GROUP).success).toBe(true);
    expect(parseWith({ items: GROUP.items }).success).toBe(true);
  });

  it("requires at least one item", () => {
    expect(parseWith({ heading: "Project" }).success).toBe(false);
    expect(parseWith({ heading: "Project", items: [] }).success).toBe(false);
  });

  it("rejects an empty heading rather than rendering a blank group label", () => {
    expect(parseWith({ heading: "", items: GROUP.items }).success).toBe(false);
  });

  it("rejects unknown keys loudly, at both levels", () => {
    expect(parseWith({ ...GROUP, columns: [] }).success).toBe(false);
    expect(parseWith({ items: [{ ...GROUP.items[0], depth: 2 }] }).success).toBe(false);
  });

  it("rejects an item without a label or an href", () => {
    expect(parseWith({ items: [{ href: "/help" }] }).success).toBe(false);
    expect(parseWith({ items: [{ label: "Help" }] }).success).toBe(false);
  });

  it("accepts internal routes and absolute external links alike", () => {
    const result = parseWith(GROUP);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.footerNavigation?.items.map((item) => item.href)).toEqual([
      "/",
      "/help",
      "https://github.com/provelopment/provelopment-foundation",
    ]);
  });

  it("survives the loader unchanged, and NEVER touches the primary navigation", () => {
    const parsed = parseSiteConfig({ ...rawConfig, footerNavigation: GROUP });
    expect(parsed.footerNavigation?.heading).toBe("Project");
    expect(parsed.footerNavigation?.items).toHaveLength(3);
    // The primary navigation is exactly what it was: a footer group is a
    // SEPARATE concern and must never leak into the menu/sidebar/bottom bar.
    expect(parsed.navigation).toEqual(siteConfig.navigation);
    expect(parsed.navigation.map((item) => item.href)).not.toContain("/help");
  });
});

type Resolver = ReturnType<typeof createDirectionLinkResolver>;

/**
 * Renders the REAL `SiteFooter` against a temporarily overridden configuration.
 *
 * `SiteFooter` reads the template's configuration SINGLETON, so the only way to
 * exercise a configured footer group without shipping one in the product is to
 * substitute the module for this test only (`vi.resetModules` + `vi.doMock`),
 * then import the component fresh so it sees the substituted config. Nothing is
 * written to disk and the shipped `site.config.json` is never modified.
 */
async function renderFooter(overrides: Record<string, unknown>): Promise<string> {
  vi.resetModules();
  vi.doMock("@/config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/config")>();
    return { ...actual, siteConfig: { ...actual.siteConfig, ...overrides } };
  });

  const { SiteFooter } = await import("@/components/site/site-footer");
  const resolver: Resolver = createDirectionLinkResolver(
    (overrides.mapsFeature ?? siteConfig.mapsFeature) as never,
  );

  return renderToStaticMarkup(
    await SiteFooter({ locale: siteConfig.defaultLocale, directionLinkResolver: resolver }),
  );
}

describe("the rendered footer — secondary navigation group", () => {
  it("renders NO group when none is configured (absent changes nothing)", async () => {
    const html = await renderFooter({});
    expect(html).not.toContain('aria-label="Project"');
    // The existing landmarks are still exactly what they were.
    expect(html).toContain('aria-label="Footer navigation"');
    expect(html).toContain(siteConfig.name);
  });

  it("renders the configured group under its own landmark, with a PLAIN-TEXT heading", async () => {
    const html = await renderFooter({ footerNavigation: GROUP });

    // The heading is real text in an <h2> — deliberately NOT a link, because a
    // group label has no destination and inventing one is the coupling this
    // surface removes.
    expect(html).toMatch(/<h2[^>]*>Project<\/h2>/);
    expect(html).not.toMatch(/<h2[^>]*>\s*<a[\s>]/);

    // It is its own navigation landmark, named by the heading.
    expect(html).toContain('<nav aria-label="Project">');
    // …and the primary footer list is untouched beside it.
    expect(html).toContain('aria-label="Footer navigation"');
  });

  it("resolves internal and external links through the SHARED link contract", async () => {
    const html = await renderFooter({ footerNavigation: GROUP });

    // Internal: locale-prefixed public routes ("/" resolves to the locale root).
    expect(html).toContain(`href="/${siteConfig.defaultLocale}"`);
    expect(html).toContain(`href="/${siteConfig.defaultLocale}/help"`);

    // Attribute order in the emitted anchor is not part of the contract, so the
    // link semantics are asserted on the anchor itself.
    const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
    const external = anchors.find((anchor) => anchor.includes("github.com/provelopment"));
    expect(external, "the external footer link is rendered").toBeDefined();
    // External: new tab + rel=noreferrer, exactly as every other surface renders
    // an outbound link — the group inherits the contract, it does not reimplement it.
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noreferrer"');

    // …and the internal links are plain internal links: no new-tab, no rel.
    const internal = anchors.filter((anchor) =>
      anchor.includes(`href="/${siteConfig.defaultLocale}"`),
    );
    expect(internal.length).toBeGreaterThan(0);
    for (const anchor of internal) {
      expect(anchor).not.toContain("target=");
      expect(anchor).not.toContain('rel="noreferrer"');
    }
  });

  it("does NOT leak the group into the primary navigation", async () => {
    const html = await renderFooter({ footerNavigation: GROUP });
    const primary =
      /<nav aria-label="Footer navigation">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";

    expect(primary.length).toBeGreaterThan(0);
    expect(primary).not.toContain("/help");
    expect(primary).not.toContain("Project");
    // The shipped primary item is still there: the menu/sidebar source is unchanged.
    expect(primary).toContain(`href="/${siteConfig.defaultLocale}"`);
  });
});

describe("the rendered footer — the Connect surface is a CONNECTION surface", () => {
  it("renders no Connect gateway at all when the site configures no methods", async () => {
    const html = await renderFooter({});
    // This is the defect the guard closes: a gateway heading linking `/connect`
    // over an empty group, on a site that serves no Connect page.
    expect(html).not.toContain("/connect");
  });

  it("still renders the gateway WHEN methods are configured (the guard is scoped, not a deletion)", async () => {
    const html = await renderFooter({
      connect: {
        methods: [{ id: "email", label: "Email", href: "mailto:hello@example.com" }],
      },
    });
    // The method itself…
    expect(html).toContain("mailto:hello@example.com");
    // …and its gateway heading, which is (and remains) the Connect-page link.
    expect(html).toContain("/connect");
  });

  it("documents the guard in the component itself", () => {
    expect(footerSource).toContain("hasConnectionMethods");
    expect(footerSource).toContain("hasConnectivity");
  });
});