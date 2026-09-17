import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { siteConfig } from "@/config";

describe("Phase S — sitemap & robots contract (deterministic, config/content-derived)", () => {
  it("robots references the configured absolute sitemap URL", () => {
    expect(robots().sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
  });

  it("sitemap leads with the root entry and covers every configured locale", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls[0]).toBe(siteConfig.url);
    for (const { code } of siteConfig.locales) {
      expect(urls, `locale root ${code}`).toContain(`${siteConfig.url}/${code}`);
    }
    expect(entries[0].lastModified).toBeInstanceOf(Date);
  });

  it("every localized URL belongs to a configured locale (no foreign prefixes)", async () => {
    const entries = await sitemap();
    for (const entry of entries.slice(1)) {
      const locale = entry.url.slice(siteConfig.url.length + 1).split("/")[0];
      expect(siteConfig.locales.map((l) => l.code), entry.url).toContain(locale);
    }
  });

  it("never leaks an unconfigured regional combination", async () => {
    const entries = await sitemap();
    const allRegionIds = new Set(Object.keys(siteConfig.regions));

    for (const entry of entries) {
      const segments = entry.url.slice(siteConfig.url.length + 1).split("/").filter(Boolean);
      if (segments.length >= 2 && allRegionIds.has(segments[1])) {
        expect(
          siteConfig.pageBindings.some(
            (binding) => binding.locale === segments[0] && binding.region === segments[1],
          ),
          entry.url,
        ).toBe(true);
      }
    }
  });

  it("emits every canonical offering detail route across all locales when enabled", async () => {
    if (!siteConfig.offeringsFeature) return;

    const urls = (await sitemap()).map((entry) => entry.url);
    for (const { code } of siteConfig.locales) {
      for (const slug of ["starter-package", "consultation"]) {
        expect(urls, `${code}/offerings/${slug}`).toContain(
          `${siteConfig.url}/${code}/offerings/${slug}`,
        );
      }
    }
  });

  it("emits only genuinely configured regional landings and regional pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const binding of siteConfig.pageBindings) {
      const path =
        binding.slug === null
          ? `/${binding.locale}/${binding.region}`
          : `/${binding.locale}/${binding.region}/${binding.slug}`;
      expect(urls, binding.locale + binding.region + (binding.slug ?? "")).toContain(
        `${siteConfig.url}${path}`,
      );
    }
  });
});
describe("Phase T — trust/publishing sitemap contract (derived inventory)", () => {
  it("publishes exactly the config-derived inventory the site actually serves", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    // FS1 — the generic template ships NO content collections, no regions and no
    // legal entries, so the sitemap is exactly the configuration-derived part: the
    // root entry plus one route per configured locale. A clone publishes what it
    // really serves — never phantom routes for content that does not exist.
    expect(urls).toEqual([
      siteConfig.url,
      ...siteConfig.locales.map(({ code }) => `${siteConfig.url}/${code}`),
    ]);
    expect(new Set(urls).size, "no duplicate URLs").toBe(urls.length);
  });

  it("keeps every pre-existing sitemap invariant (robots + locale coverage)", async () => {
    expect(robots().sitemap).toBe(`${siteConfig.url}/sitemap.xml`);
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const { code } of siteConfig.locales) {
      expect(urls).toContain(`${siteConfig.url}/${code}`);
    }
  });
});