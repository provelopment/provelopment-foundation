import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "@/app/[locale]/page";
import { createFileSystemPageContentRepository } from "@/adapters/content/fs-page-content-repository";
import { buildSitemapRoutes } from "@/application/route-discovery";
import { siteConfig } from "@/config";
import { HOME_CONTENT_SLUG } from "@/core/page-content";

/**
 * The OPTIONAL content-authored home page (FOUNDATION-WEB-R1C).
 *
 * A site may author `content/pages/<locale>/home.md` and have the locale-root
 * route render it through the NORMAL content repository. A site that authors no
 * `home.md` keeps the generic configuration-driven starter homepage — so this
 * capability is purely additive and changes no existing adopter's site.
 *
 * The capability's three coupled consequences must agree, which is why the slug
 * is declared ONCE (`@/core/page-content`) and imported rather than re-typed:
 * the home route looks it up, `/{locale}/home` is never generated, and it never
 * enters the sitemap.
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

const homeRouteSource = read("src", "app", "[locale]", "page.tsx");
const itemRouteSource = read("src", "app", "[locale]", "[item]", "page.tsx");
const sitemapSource = read("src", "app", "sitemap.ts");

const EMPTY_FEATURES = {
  offeringsEnabled: false,
  canonicalOfferings: [],
  testimonialsEnabled: false,
  portfolioEnabled: false,
  canonicalPortfolio: [],
  blogEnabled: false,
  publishedBlogSlugs: [],
} as const;

describe("the reserved home slug has ONE authority", () => {
  it("is declared once, in the content model", () => {
    expect(HOME_CONTENT_SLUG).toBe("home");
    const core = read("src", "core", "page-content.ts");
    // Exactly one declaration in the whole content model — no shadow copy.
    expect((core.match(/HOME_CONTENT_SLUG/g) ?? []).length).toBe(1);
  });

  it("is imported everywhere it is needed, never re-typed as a literal", () => {
    for (const [name, source] of [
      ["the home route", homeRouteSource],
      ["the [item] route", itemRouteSource],
      ["route discovery", read("src", "application", "route-discovery.ts")],
    ] as const) {
      expect(source, name).toContain("HOME_CONTENT_SLUG");
      // No file may re-introduce the slug as a bare URL literal.
      expect(source, name).not.toContain('"/home"');
      expect(source, name).not.toContain("'/home'");
    }
  });
});

describe("/home is never a route and never a sitemap entry", () => {
  it("excludes the reserved slug from the derived route set", () => {
    const routes = buildSitemapRoutes({
      ...EMPTY_FEATURES,
      pages: ["about", HOME_CONTENT_SLUG, "resources"],
    });

    expect(routes).toEqual(["", "/about", "/resources"]);
    expect(routes).not.toContain("/home");
    expect(routes.filter((route) => route === "")).toHaveLength(1);
  });

  it("keeps every other content slug, including one that merely starts with 'home'", () => {
    const routes = buildSitemapRoutes({
      ...EMPTY_FEATURES,
      pages: [HOME_CONTENT_SLUG, "home-maintenance", "about"],
    });

    expect(routes).toEqual(["", "/home-maintenance", "/about"]);
  });

  it("applies per locale, so no locale can publish /home", () => {
    // Route discovery is locale-agnostic by design (the caller supplies that
    // locale's page inventory), so the exclusion must hold for ANY inventory.
    for (const locale of siteConfig.locales) {
      const routes = buildSitemapRoutes({
        ...EMPTY_FEATURES,
        pages: [HOME_CONTENT_SLUG],
      });
      for (const route of routes) {
        expect(`${locale.code}${route}`).not.toBe(`${locale.code}/home`);
      }
      expect(routes).toEqual([""]);
    }
  });

  it("reserves the slug on the [item] route so it can never double-route", () => {
    expect(itemRouteSource).toMatch(/STATIC_ROUTE_SLUGS[\s\S]*HOME_CONTENT_SLUG/);
  });

  it("is not filtered ad hoc in the sitemap route itself", () => {
    // The rule belongs to route discovery alone: a second, independent filter in
    // the sitemap route would be a rule with two homes.
    expect(sitemapSource).not.toContain("HOME_CONTENT_SLUG");
  });
});

describe("a site that authors no home.md keeps the generic starter homepage", () => {
  it("finds no authored home content in the shipped template", async () => {
    const repository = createFileSystemPageContentRepository({
      defaultLocale: siteConfig.defaultLocale,
    });
    // The template ships NO content, so the very lookup the home route performs
    // resolves to nothing — which is what makes the fallback the live path here.
    expect(
      await repository.findBySlug(HOME_CONTENT_SLUG, siteConfig.defaultLocale),
    ).toBeNull();
  });

  it("renders the generic configuration-driven homepage at the locale root", async () => {
    const html = renderToStaticMarkup(
      await HomePage({ params: Promise.resolve({ locale: siteConfig.defaultLocale }) }),
    );

    // The generic starter homepage's own markers, exactly as before.
    expect(html).toContain("home-hero");
    expect(html).toContain("home-hero-copy");
    expect(html).toContain("home-card");
    // …driven by the dictionary/configuration, not by authored content.
    expect(html).toContain(siteConfig.name);
  });

  it("renders a homepage for every configured locale", async () => {
    for (const locale of siteConfig.locales) {
      const html = renderToStaticMarkup(
        await HomePage({ params: Promise.resolve({ locale: locale.code }) }),
      );
      expect(html.length, locale.code).toBeGreaterThan(0);
      expect(html, locale.code).toContain("home-hero");
    }
  });

  it("is CONTENT-FIRST: the authored lookup precedes the generic starter render", () => {
    // If the generic return came first, an authored home page would be silently
    // ignored — the exact failure this ordering guards.
    const lookupAt = homeRouteSource.indexOf("findBySlug(HOME_CONTENT_SLUG");
    const starterAt = homeRouteSource.indexOf("home-hero");
    expect(lookupAt).toBeGreaterThan(-1);
    expect(starterAt).toBeGreaterThan(lookupAt);
    // …and it renders through the shared Markdown trust boundary, not a bespoke path.
    expect(homeRouteSource).toContain("MarkdownContent");
  });
});