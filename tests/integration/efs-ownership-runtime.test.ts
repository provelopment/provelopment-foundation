import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ headers: state.headers, get: (key: string) => state.headers.get(key) ?? null }),
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

const fixture = join(process.cwd(), "tests", "fixtures", "efs", "canonical");
const installation = materializeEfsInstallation({
  mode: "flat",
  spokes: ["shared-spoke", "other-spoke"],
});
selectEfsInstallation(installation.root);
cpSync(join(fixture, "capsule"), join(installation.root, "capsule"), { recursive: true });

const manifest = JSON.parse(readFileSync(join(fixture, "manifest.json"), "utf8")) as {
  publications: Array<{
    id: string;
    spokeId: string;
    entityId: string;
    facetId: string;
    bindings: Array<Record<string, unknown>>;
  }>;
};
manifest.publications[0].spokeId = "shared-spoke";
const firstBinding = manifest.publications[0].bindings[0];
manifest.publications[0].bindings = [
  {
    ...firstBinding,
    id: "introduced-host-binding",
    host: "introduced-host.example",
    prefix: ["acme-co"],
  },
];
manifest.publications.push({
  id: "conflicting-host",
  spokeId: "shared-spoke",
  entityId: manifest.publications[0].entityId,
  facetId: manifest.publications[0].facetId,
  bindings: [
    {
      ...manifest.publications[0].bindings[0],
      id: "conflicting-host-binding",
      host: "other-spoke.fixture.test",
      prefix: ["conflict"],
    },
  ],
});
manifest.publications.push({
  id: "undeclared-owner",
  spokeId: "absent-spoke",
  entityId: manifest.publications[0].entityId,
  facetId: manifest.publications[0].facetId,
  bindings: [
    {
      ...manifest.publications[0].bindings[0],
      id: "undeclared-owner-binding",
      host: "undeclared.example",
      prefix: [],
    },
  ],
});
mkdirSync(join(installation.root, "efs"), { recursive: true });
writeFileSync(
  join(installation.root, "efs", "manifest.json"),
  JSON.stringify(manifest),
  "utf8",
);
process.env.FOUNDATION_EFS_MANIFEST = join(installation.root, "efs", "manifest.json");
process.env.FOUNDATION_EFS_CAPSULE = join(installation.root, "capsule");
vi.resetModules();

const efs = await import("@/app/[[...segments]]/efs-request");
const page = await import("@/app/[[...segments]]/page");
const sitemap = (await import("@/app/sitemap")).default;
const robots = (await import("@/app/robots")).default;
const { serveOwnerAsset } = await import("@/app/efs-asset-response");

afterAll(() => installation.cleanup());

function at(host: string): void {
  state.headers.set("host", host);
}

const segments = ["acme-co", "en-001", "about"];

describe("one EFS ownership rule across every public surface (R05)", () => {
  it("serves a valid publication on a host introduced only by the binding", async () => {
    at("introduced-host.example");
    const view = await efs.efsViewForCurrentRequest(segments);
    expect(view?.context.id).toBe("shared-spoke");
    expect(view?.publication.spokeId).toBe("shared-spoke");
  });

  it("agrees on Page, metadata, sitemap and robots for that host", async () => {
    at("introduced-host.example");
    const metadata = await page.generateMetadata({ params: Promise.resolve({ segments }) });
    expect(metadata.alternates?.canonical).toBe("https://introduced-host.example/acme-co/en-001/about");
    const entries = await sitemap();
    expect(entries.some((entry) => String(entry.url).includes("/acme-co/en-001"))).toBe(true);
    expect((await robots()).sitemap).toBe("https://introduced-host.example/sitemap.xml");
    const asset = await serveOwnerAsset(["acme-co"], ["brand", "acme-main.svg"]);
    expect(asset.status).toBe(200);
  });

  it("refuses Page, asset and discovery when the publication names no declared Spoke", async () => {
    at("undeclared.example");
    await expect(efs.efsViewForCurrentRequest(segments)).rejects.toThrow("NOT_FOUND");
    expect(await serveOwnerAsset(["acme-co"], ["brand", "acme-main.svg"])).toHaveProperty("status", 404);
    expect(await sitemap()).toEqual([]);
    expect((await robots()).sitemap).toBeUndefined();
  });

  it("serves a binding on a host another Spoke's informational site.url also names (R02)", async () => {
    // The host is claimed by `other-spoke` through its INFORMATIONAL `site.url`. The publication names its
    // own owner explicitly, and D31 makes the binding the authority for the public address, so `site.url`
    // cannot veto it. This replaces the superseded expectation that such a host was refused.
    at("other-spoke.fixture.test");
    const view = await efs.efsViewForCurrentRequest(["conflict", "en-001", "about"]);
    expect(view?.context.id).toBe("shared-spoke");
    expect(view?.publication.spokeId).toBe("shared-spoke");
    // Discovery follows the same owner, and the host advertises the publication it really serves.
    expect((await sitemap()).some((entry) => String(entry.url).includes("/conflict/en-001"))).toBe(true);
    expect((await robots()).sitemap).toBe("https://other-spoke.fixture.test/sitemap.xml");
  });
});
