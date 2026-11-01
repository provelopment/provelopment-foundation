import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { materializeEfsInstallation, selectEfsInstallation } from "../support/efs-installation";

const installation = materializeEfsInstallation({ mode: "flat", spokes: ["acme-spoke"] });
selectEfsInstallation(installation.root);
vi.resetModules();
const {
  efsDescription,
  efsOpenGraphImage,
  efsOpenGraphImageForCurrentRequest,
  efsTitle,
  efsTwitterCard,
  efsViewForCurrentRequest,
} = await import("@/app/[[...segments]]/efs-request");

afterAll(() => installation.cleanup());

const FIXTURE = join(process.cwd(), "tests", "fixtures", "efs", "canonical");

beforeEach(() => {
  state.headers.clear();
  process.env.FOUNDATION_EFS_MANIFEST = join(FIXTURE, "manifest.json");
  process.env.FOUNDATION_EFS_CAPSULE = join(FIXTURE, "capsule");
});

function image(host: string, path: string) {
  state.headers.set("host", host);
  return efsOpenGraphImageForCurrentRequest(path.split("/").filter(Boolean));
}

/**
 * THE EFS-NATIVE OPEN GRAPH IMAGE ENDPOINT (`GEO-03` R04-C21)
 * ==========================================================
 *
 * Every assertion here is about OWNERSHIP or LOCALIZATION, because the image is a public artefact of one
 * publication: the URL must be that publication's, in that locale, at the site/locale root — and every
 * request that cannot prove all three must be refused rather than answered from a neighbour.
 */
describe("the EFS Open Graph image endpoint", () => {
  it("serves the site-closed root on the managed host, at the reserved suffix", async () => {
    const served = await image("my.provelopment.com", "/acme-co/en-001");
    expect(served?.url).toBe("https://my.provelopment.com/acme-co/en-001/opengraph-image");
    expect(served?.canonicalRoot).toBe("https://my.provelopment.com/acme-co/en-001");
    // The card carries the resolved PUBLIC brand and the root's own sentence — not a dictionary entry.
    expect(served?.content.siteName.length).toBeGreaterThan(0);
    expect(served?.content.tagline.length).toBeGreaterThan(0);
  });

  it("keeps two hosts of one publication owner-scoped: each advertises its OWN origin", async () => {
    const managed = await image("my.provelopment.com", "/acme-co/en-001");
    const dedicated = await image("www.acme-co.com", "/en-001");
    expect(dedicated?.url).toBe("https://www.acme-co.com/en-001/opengraph-image");
    expect(dedicated?.url).not.toBe(managed?.url);
    expect(dedicated?.canonicalRoot.startsWith("https://www.acme-co.com/")).toBe(true);
  });

  it("honours the site-OPEN shape `/<prefix>/<site>/<locale>/opengraph-image`", async () => {
    const served = await image("my.provelopment.com", "/acme-open/main/fr-fr");
    expect(served?.url).toBe("https://my.provelopment.com/acme-open/main/fr-fr/opengraph-image");
  });

  it("is NOT a per-Page endpoint: a Page suffix before the reserved name is refused", async () => {
    expect(await image("my.provelopment.com", "/acme-co/en-001/about")).toBeNull();
    // The reserved suffix itself is stripped by the caller, so a path that still carries it names a Page.
    expect(await image("www.acme-co.com", "/en-001/opengraph-image")).toBeNull();
  });

  it("refuses an undeclared locale instead of falling back or redirecting", async () => {
    expect(await image("my.provelopment.com", "/acme-co/de-de")).toBeNull();
    // A declared locale whose representation does NOT exist on the root Page is equally refused.
    expect(await image("my.provelopment.com", "/acme-co/fr-ca")).toBeNull();
  });

  it("refuses an unclaimed host, a wrong prefix and a prefix-less path", async () => {
    expect(await image("unclaimed.example", "/acme-co/en-001")).toBeNull();
    // A prefix belongs to the host that declares it: the same prefix on another host names nothing.
    expect(await image("www.acme-co.com", "/acme-co/en-001")).toBeNull();
    // `my.provelopment.com` declares no prefix-less binding, so a bare locale cannot be resolved there.
    expect(await image("my.provelopment.com", "/en-001")).toBeNull();
  });

  it("cannot be reached with an empty path: the root alone is not an image identity", async () => {
    expect(await image("www.acme-co.com", "/")).toBeNull();
  });

  it("advertises, on EVERY page of the site/locale, the SAME root card the endpoint serves", async () => {
    state.headers.set("host", "my.provelopment.com");
    const home = await efsViewForCurrentRequest(["acme-co", "en-001"]);
    const about = await efsViewForCurrentRequest(["acme-co", "en-001", "about"]);
    const homeImage = await efsOpenGraphImage(home!);
    const aboutImage = await efsOpenGraphImage(about!);
    expect(homeImage?.url).toBe("https://my.provelopment.com/acme-co/en-001/opengraph-image");
    expect(aboutImage?.url).toBe(homeImage?.url);
    // R04-C21-R02 (F2) — the ALT too is the root card's brand, not this Page's cascade.
    expect(aboutImage?.alt).toBe(homeImage?.alt);
    expect(aboutImage).toMatchObject({ width: 1200, height: 630, type: "image/png" });
    expect((aboutImage?.alt ?? "").length).toBeGreaterThan(0);
  });

  it("ties the Twitter card to the SAME root image, with the page's own text (R04-C21-R02 F4)", async () => {
    state.headers.set("host", "my.provelopment.com");
    const about = await efsViewForCurrentRequest(["acme-co", "en-001", "about"]);
    const image = await efsOpenGraphImage(about!);
    const card = efsTwitterCard(about!, image!.url);
    expect(card.card).toBe("summary_large_image");
    expect(card.images).toEqual([image!.url]);
    expect(card.title).toBe(efsTitle(about!));
    // The card's text is the page's OWN Open Graph text — the same helper, so the two can never disagree;
    // the IMAGE is the root card's, which is what ties the Twitter card to a reachable owner-scoped URL.
    expect(card.description).toBe(efsDescription(about!) ?? "");
  });
});
