import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE DISCOVERY CONTRACT OF ONE EXPLICIT EFS PUBLICATION (`C07-R02`)
 * ==================================================================
 *
 * `robots.txt` and `sitemap.xml` are answered from an explicit EFS declaration and nothing else: the
 * request's Host selects a claimed binding, the binding selects a declared Site and its declared
 * representations, and only representations that are PUBLIC are advertised.
 *
 * Every expectation here comes from the fixture's OWN authored declaration — never from calling the
 * production sitemap to build its own expected value — so a regression that publishes an unlisted Page,
 * invents a route, leaks another owner's origin or answers an unclaimed host fails here.
 *
 * RETIRED WITH THIS MIGRATION (geography-only rows, itemized):
 *   S-1 "leads with the root entry and covers every configured locale" — `/<site>/<locale>` roots of
 *       `site.config.json` sites are retired by D28: an EFS Page address comes from its binding and its
 *       declared route, never from a Site-code spelling.
 *   S-2 "every published URL belongs to a configured site AND one of that site's locales" — a Site code
 *       is not a URL segment for a closed binding; the surviving invariant (every URL belongs to the
 *       requesting binding's own origin) is asserted instead.
 *   S-3 "never leaks an unconfigured regional combination" + "emits only genuinely configured regional
 *       landings and regional pages" — regional landings and `pageBindings` are retired by D28 with no
 *       EFS equivalent; replaced by the undeclared-source and unlisted exclusions below.
 *   S-4 "emits no collection route" — the collection model is gone; the surviving invariants are that
 *       every published URL is a declared Page address and that no undeclared source can appear.
 *   S-5 "publishes exactly the inventory the site actually serves" — its expectation was built from
 *       `createPageSources`, the retired composition; replaced by explicit declared-address checks.
 *   S-6 "keeps every pre-existing sitemap invariant (robots + locale coverage)" — same retired input.
 * PRESERVED: canonical origin, only-public and only-declared inventory, truthful robots authority, no
 * ghost routes, no cross-owner URL, and an unclaimed host publishing nothing.
 */

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (pathname: string) => {
    throw new Error(`REDIRECT:${pathname}`);
  },
  permanentRedirect: (pathname: string) => {
    throw new Error(`PERMANENT_REDIRECT:${pathname}`);
  },
}));

import {
  materializeRuntimeCutFixture,
  materializeRuntimeCutInstallation,
  RUNTIME_CUT_HOST,
  RUNTIME_CUT_UNCLAIMED_HOST,
  selectRuntimeCutFixture,
} from "../support/efs-runtime-cut";
import { selectEfsInstallation } from "../support/efs-installation";

const installation = materializeRuntimeCutInstallation();
selectEfsInstallation(installation.root);

const fixture = materializeRuntimeCutFixture();
const restoreDeclaration = selectRuntimeCutFixture(fixture);

vi.resetModules();
const { default: robots } = await import("@/app/robots");
const { default: sitemap } = await import("@/app/sitemap");

afterAll(() => {
  restoreDeclaration();
  fixture.cleanup();
  installation.cleanup();
});

function atHost(host: string) {
  state.headers.set("host", host);
}


describe("robots.txt advertises the requesting binding's own sitemap", () => {
  beforeEach(() => state.headers.clear());

  it("names the canonical origin of the claimed binding", async () => {
    atHost(RUNTIME_CUT_HOST);
    const result = await robots();
    expect(result.sitemap).toBe(`https://${RUNTIME_CUT_HOST}/sitemap.xml`);
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("advertises the prefixed binding's own origin, not the root binding's", async () => {
    atHost("managed.runtime-cut.test");
    expect((await robots()).sitemap).toBe("https://managed.runtime-cut.test/sitemap.xml");
  });

  it("advertises no sitemap at all for a host no binding claims", async () => {
    atHost(RUNTIME_CUT_UNCLAIMED_HOST);
    const result = await robots();
    expect(result.sitemap).toBeUndefined();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
  });

  it("never invents a disallow rule for a declared unlisted Page", async () => {
    atHost(RUNTIME_CUT_HOST);
    expect(JSON.stringify(await robots()).toLowerCase()).not.toContain("disallow");
  });
});

describe("sitemap.xml advertises exactly what this binding publishes", () => {
  beforeEach(() => state.headers.clear());

  it("lists every declared, public Page address under the binding's origin", async () => {
    atHost(RUNTIME_CUT_HOST);
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const address of [
      "/en-001",
      "/en-001/about",
      "/en-001/catalogue",
      "/en-001/guide/start",
      "/de-de",
    ]) {
      expect(urls, address).toContain(`https://${RUNTIME_CUT_HOST}${address}`);
    }
    expect(urls.every((url) => url.startsWith(`https://${RUNTIME_CUT_HOST}/`))).toBe(true);
  });

  it("omits the unlisted representation", async () => {
    atHost(RUNTIME_CUT_HOST);
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/preview"))).toBe(false);
  });

  it("omits a source file that exists in the capsule without a declaration", async () => {
    atHost(RUNTIME_CUT_HOST);
    const urls = (await sitemap()).map((entry) => entry.url);
    // `pages/notes/en-001.md` exists on disk and is undeclared: existence is not publication.
    expect(urls.some((url) => url.includes("/notes"))).toBe(false);
  });

  it("invents no regional landing and no Site-code segment", async () => {
    atHost(RUNTIME_CUT_HOST);
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const url of urls) {
      const segments = url.slice(`https://${RUNTIME_CUT_HOST}/`.length).split("/").filter(Boolean);
      // The retired geography produced `/<site>/<locale>/<region>`; an EFS address begins with a
      // declared locale tag and carries neither a region tier nor a Site code.
      expect(["en-001", "de-de"], url).toContain(segments[0]);
      expect(segments.join("/"), url).not.toMatch(/(^|\/)(ww|eu|apac)(\/|$)/);
    }
  });

  it("never advertises the Home Page at a literal /home address", async () => {
    atHost(RUNTIME_CUT_HOST);
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/home"))).toBe(false);
  });

  it("publishes nothing for a host no binding claims", async () => {
    atHost(RUNTIME_CUT_UNCLAIMED_HOST);
    expect(await sitemap()).toEqual([]);
  });

  it("keeps each binding's inventory on its own origin and prefix", async () => {
    atHost(RUNTIME_CUT_HOST);
    const root = (await sitemap()).map((entry) => entry.url);
    atHost("managed.runtime-cut.test");
    const managed = (await sitemap()).map((entry) => entry.url);

    expect(root.some((url) => url.startsWith("https://managed.runtime-cut.test"))).toBe(false);
    expect(managed.some((url) => url.startsWith(`https://${RUNTIME_CUT_HOST}/`))).toBe(false);
    expect(
      managed.every((url) => url.startsWith("https://managed.runtime-cut.test/managed/")),
    ).toBe(true);
  });
});
