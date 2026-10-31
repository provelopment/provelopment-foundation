import { describe, expect, it, vi } from "vitest";

// R04-C7 §4 — THE ACTUAL BOUNDARY.
//
// `sitemap()` returns `efsSitemapForCurrentRequest()` when that function claims the request Host, and
// that function returns `null` the moment there is no Host header. So a Host matrix is only honest if the
// Host really reaches the boundary. It is mocked HERE, in a file that imports the sitemap boundary ALONE
// (never the page route), which is why this seam is safe: nothing else in this file resolves a request.
const requested = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => requested.get(key) ?? null }),
}));

import path from "node:path";

import sitemap from "@/app/sitemap";
import { loadEfsManifest } from "@/config/efs/manifest";

const loaded = loadEfsManifest(path.join(process.cwd(), "deployment", "efs", "manifest.json"));
/** Each publication's canonical Host — one publication per Entity, whatever hosts it publishes. */
const publications = loaded.manifest?.publications ?? [];
const canonicalHostOf = (index: number) =>
  publications[index].bindings.filter((binding) => binding.canonical !== false).map((binding) => binding.host);
const [foundationHosts, germanyHosts] = [canonicalHostOf(0), canonicalHostOf(1)];
const foundationHost = foundationHosts[0];
const germanyHost = germanyHosts[0];
const originOf = (host: string) => `https://${host}`;

async function urlsFor(host: string): Promise<string[]> {
  requested.set("host", host);
  return (await sitemap()).map((entry) => entry.url);
}

describe("the sitemap boundary answers each authored Host with ITS OWN inventory", () => {
  it("publishes two Entities on distinct origins, and answers EVERY one of their Hosts", () => {
    expect(publications).toHaveLength(2);
    expect(publications[0].entityId).not.toBe(publications[1].entityId);
    expect(foundationHosts.length).toBeGreaterThan(0);
    expect(germanyHosts.length).toBeGreaterThan(0);
    // No Host is claimed twice: an owner's inventory can never be shadowed by another publication.
    const all = [...foundationHosts, ...germanyHosts];
    expect(new Set(all).size).toBe(all.length);
    expect(foundationHosts.some((host) => germanyHosts.includes(host))).toBe(false);
  });

  it("gives EVERY Foundation Host the same reference inventory", async () => {
    for (const host of foundationHosts) {
      const origin = originOf(host);
      const urls = await urlsFor(host);
      expect(urls, host).toHaveLength(6);
      expect(urls, host).toContain(`${origin}/en-001/about`);
      expect(urls.every((url) => url.startsWith(origin)), host).toBe(true);
    }
  });

  it("gives the Germany Host its own Pages, and none of the reference's", async () => {
    const origin = originOf(germanyHost);
    const urls = await urlsFor(germanyHost);
    // Four Pages (Home, About, Berlin, Frankfurt) in two published languages.
    expect(urls).toHaveLength(8);
    expect(urls).toContain(`${origin}/de-de`);
    expect(urls).toContain(`${origin}/de-de/berlin`);
    expect(urls).toContain(`${origin}/en-001/frankfurt`);
    expect(urls.every((url) => url.startsWith(origin))).toBe(true);
    // CROSS-OWNER ISOLATION: `contact` is authored only by the reference Entity, so it can never
    // appear on the Germany Host — and the two inventories never share a URL.
    expect(urls.some((url) => /\/contact$/.test(url))).toBe(false);
    const foundationUrls = await urlsFor(foundationHost);
    expect(urls.filter((url) => foundationUrls.includes(url))).toEqual([]);
  });

  it("advertises nothing for a Host no publication claims", async () => {
    expect(await urlsFor("unclaimed.example")).toEqual([]);
    expect(await urlsFor("foundation-template.example")).toEqual([]);
  });
});
