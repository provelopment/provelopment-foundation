import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
}));

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

import { efsViewForCurrentRequest } from "@/app/[[...segments]]/efs-request";

function request(host: string, path: string) {
  state.headers.set("host", host);
  return efsViewForCurrentRequest(path.split("/").filter(Boolean));
}

describe("EFS actual App Router request branch (S3-E3)", () => {
  beforeEach(() => {
    state.headers.clear();
    process.env.FOUNDATION_EFS_MANIFEST = join(
      process.cwd(),
      "tests",
      "fixtures",
      "efs",
      "canonical",
      "manifest.json",
    );
    process.env.FOUNDATION_EFS_CAPSULE = join(
      process.cwd(),
      "tests",
      "fixtures",
      "efs",
      "canonical",
      "capsule",
    );
  });

  it("resolves the managed shared-host Page through its explicit binding", async () => {
    const view = await request("my.provelopment.com", "/acme-co/en-001/about");
    expect(view).not.toBeNull();
    expect(view?.entity.id).toBe("e_00000000000000000000000000");
    expect(view?.facet.id).toBe("acme");
    expect(view?.site.id).toBe("main");
    expect(view?.page.id).toBe("about");
    expect(view?.locale).toBe("en-001");
    expect(view?.canonical).toBe("https://my.provelopment.com/acme-co/en-001/about");
    expect(view?.source.format).toBe("markdown");
  });

  it("resolves the dedicated-host Page with the same ownership identities", async () => {
    const managed = await request("my.provelopment.com", "/acme-co/en-001/about");
    const dedicated = await request("www.acme-co.com", "/en-001/about");
    expect(dedicated?.entity.id).toBe(managed?.entity.id);
    expect(dedicated?.facet.id).toBe(managed?.facet.id);
    expect(dedicated?.site.id).toBe(managed?.site.id);
    expect(dedicated?.page.id).toBe(managed?.page.id);
    expect(dedicated?.canonical).toBe("https://www.acme-co.com/en-001/about");
  });

  it("redirects a bare binding entry to a real localized Home Page", async () => {
    await expect(request("my.provelopment.com", "/acme-co")).rejects.toThrow(
      "REDIRECT:/acme-co/en-001/",
    );
    const home = await request("my.provelopment.com", "/acme-co/en-001/");
    expect(home?.page.id).toBe("home");
    expect(home?.canonical).toBe("https://my.provelopment.com/acme-co/en-001");
  });

  it("supports nested routes and Site-open selectors", async () => {
    const nested = await request("my.provelopment.com", "/acme-co/en-001/products/detail");
    expect(nested?.page.id).toBe("detail");
    const open = await request("my.provelopment.com", "/acme-open/outlet/fr/");
    expect(open?.site.id).toBe("outlet");
    expect(open?.page.id).toBe("home");
    expect(open?.canonical).toBe("https://my.provelopment.com/acme-open/outlet/fr");
  });

  it("suppresses an inherited address at the descendant Site", async () => {
    const open = await request("my.provelopment.com", "/acme-open/outlet/fr/");
    expect(open?.properties.get("contact.address")?.state).toBe("suppressed");
    expect(open?.properties.publicEntries().map((entry) => entry.key)).not.toContain("contact.address");
  });

  it("refuses an unclaimed prefix and an unclaimed host when the EFS manifest is authoritative", async () => {
    await expect(request("my.provelopment.com", "/other/en-001/about")).rejects.toThrow("NOT_FOUND");
    await expect(request("unclaimed.example", "/acme-co/en-001/about")).rejects.toThrow("NOT_FOUND");
  });

  it("keeps identity and properties unchanged between prefixed and dedicated bindings", async () => {
    const managed = await request("my.provelopment.com", "/acme-co/en-001/about");
    const dedicated = await request("127.0.0.1", "/en-001/about");
    expect(dedicated?.entity.id).toBe(managed?.entity.id);
    expect(dedicated?.facet.id).toBe(managed?.facet.id);
    expect(dedicated?.site.id).toBe(managed?.site.id);
    expect(dedicated?.page.id).toBe(managed?.page.id);
    expect(dedicated?.locale).toBe(managed?.locale);
    expect(dedicated?.properties.toRecord()).toEqual(managed?.properties.toRecord());
    expect(dedicated?.canonical).not.toBe(managed?.canonical);
  });

  it("refuses an unsupported locale without inferring one from the prefix or Site", async () => {
    await expect(request("my.provelopment.com", "/acme-co/de/about")).rejects.toThrow("NOT_FOUND");
  });

  it("fails closed when a capsule exists without its explicit manifest", async () => {
    const directory = mkdtempSync(join(tmpdir(), "efs-missing-"));
    mkdirSync(join(directory, "capsule"), { recursive: true });
    process.env.FOUNDATION_EFS_MANIFEST = join(directory, "manifest.json");
    process.env.FOUNDATION_EFS_CAPSULE = join(directory, "capsule");
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /EFS manifest is missing/,
    );
  });

  it("fails with a controlled diagnostic instead of falling back when the manifest is invalid", async () => {
    const directory = mkdtempSync(join(tmpdir(), "efs-invalid-"));
    const invalid = join(directory, "manifest.json");
    writeFileSync(invalid, "{ not json", "utf8");
    process.env.FOUNDATION_EFS_MANIFEST = invalid;
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /EFS manifest is invalid/,
    );
  });
});
