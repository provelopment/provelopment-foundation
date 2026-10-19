import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

import { serveOwnerAsset } from "@/app/efs-asset-response";
import { GET as GET_NESTED } from "@/app/[site]/[locale]/owner-assets/[...path]/route";

describe("EFS owner-scoped asset delivery (S3-E3-R01)", () => {
  beforeEach(() => {
    state.headers.clear();
    state.headers.set("host", "my.provelopment.com");
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

  it("serves the owning capsule's bytes with the correct MIME type", async () => {
    const response = await serveOwnerAsset(["acme-co"], ["brand", "acme-main.svg"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(await response.text()).toContain("<svg");
  });

  it("serves the dedicated-root binding from the same owner capsule", async () => {
    state.headers.set("host", "www.acme-co.com");
    const response = await serveOwnerAsset([], ["brand", "acme-main.svg"]);
    expect(response.status).toBe(200);
  });

  it("refuses traversal, unknown owners and a foreign binding path", async () => {
    for (const [prefix, asset] of [
      [["acme-co"], ["..", "secret.svg"]],
      [["acme-co"], ["brand", "absent.svg"]],
      [["other"], ["brand", "acme-main.svg"]],
    ] as const) {
      const response = await serveOwnerAsset(prefix, asset);
      expect(response.status, `${prefix.join("/")}/${asset.join("/")}`).toBe(404);
    }
  });

  it("serves a nested publication prefix through its own route", async () => {
    const response = await GET_NESTED({} as Request, {
      params: Promise.resolve({ site: "acme", locale: "nested", path: ["brand", "acme-main.svg"] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("refuses a malformed path and a missing binding", async () => {
    expect((await serveOwnerAsset(["acme-co"], [])).status).toBe(404);
    state.headers.set("host", "unclaimed.example");
    expect((await serveOwnerAsset(["acme-co"], ["brand", "acme-main.svg"])).status).toBe(404);
  });
});
