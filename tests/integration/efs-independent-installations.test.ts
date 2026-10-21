import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const fixture = join(process.cwd(), "tests", "fixtures", "efs", "canonical");
const previous = { manifest: process.env.FOUNDATION_EFS_MANIFEST, capsule: process.env.FOUNDATION_EFS_CAPSULE };
const roots: string[] = [];

function installation(host: string, spokeId: string) {
  const root = materializeEfsInstallation({ mode: "flat", spokes: [spokeId] });
  roots.push(root.root);
  cpSync(join(fixture, "capsule"), join(root.root, "capsule"), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(fixture, "manifest.json"), "utf8")) as {
    publications: Array<{ spokeId: string; bindings: Array<Record<string, unknown>> }>;
  };
  manifest.publications[0].spokeId = spokeId;
  manifest.publications[0].bindings[0] = {
    ...manifest.publications[0].bindings[0],
    host,
    prefix: [],
  };
  mkdirSync(join(root.root, "efs"), { recursive: true });
  writeFileSync(join(root.root, "efs", "manifest.json"), JSON.stringify(manifest), "utf8");
  return root.root;
}

async function request(root: string, host: string, path: string) {
  selectEfsInstallation(root);
  process.env.FOUNDATION_EFS_MANIFEST = join(root, "efs", "manifest.json");
  process.env.FOUNDATION_EFS_CAPSULE = join(root, "capsule");
  state.headers.set("host", host);
  vi.resetModules();
  const { efsViewForCurrentRequest } = await import("@/app/[[...segments]]/efs-request");
  return efsViewForCurrentRequest(path.split("/").filter(Boolean));
}

afterAll(() => {
  process.env.FOUNDATION_EFS_MANIFEST = previous.manifest;
  process.env.FOUNDATION_EFS_CAPSULE = previous.capsule;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("one Entity functions independently in two on-disk Installations (R05)", () => {
  beforeEach(() => state.headers.clear());

  it("preserves content identity while each Installation owns its route and Spoke", async () => {
    const first = installation("first.example", "first-spoke");
    const second = installation("second.example", "second-spoke");
    const a = await request(first, "first.example", "/en-001/about");
    const b = await request(second, "second.example", "/en-001/about");

    expect(a?.entity.id).toBe(b?.entity.id);
    expect(a?.facet.id).toBe(b?.facet.id);
    expect(a?.site.id).toBe(b?.site.id);
    expect(a?.page.id).toBe(b?.page.id);
    expect(a?.publication.spokeId).toBe("first-spoke");
    expect(b?.publication.spokeId).toBe("second-spoke");
    expect(a?.properties.toRecord()).toEqual(b?.properties.toRecord());
    expect(a?.canonical).toBe("https://first.example/en-001/about");
    expect(b?.canonical).toBe("https://second.example/en-001/about");
    expect(a?.source.format).toBe(b?.source.format);
  });
});
