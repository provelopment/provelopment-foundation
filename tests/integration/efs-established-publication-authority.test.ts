import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (entry: string) => {
    throw new Error(`REDIRECT:${entry}`);
  },
}));

import { establishInstallationFromDirectories } from "@/adapters/installation/establish";
import { assetUrl } from "@/core/efs/publication";
import { selectEfsInstallation } from "../support/efs-installation";
import {
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  SYNTHETIC_RELEASE_IDENTITY,
  constructSyntheticRelease,
  disposableTree,
  syntheticSeed,
  targetCapsule,
} from "../support/installation-establishment-fixture";

const release = constructSyntheticRelease();

/** One Site whose information URL disagrees with the only authorized publication host. */
function seed(): string {
  const directory = syntheticSeed();
  const file = path.join(directory, "site.config.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as {
    site: { url?: string; tagline?: string; description?: string };
    sites: unknown[];
    defaultSite?: string;
    business?: unknown;
    publication: { host: string };
  };
  delete config.site.url;
  delete config.site.tagline;
  delete config.site.description;
  config.publication = { host: "published.example.test" };
  config.sites = [{ code: "ww", label: "Global", locales: ["en"], defaultLocale: "en" }];
  config.defaultSite = "ww";
  delete config.business;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return directory;
}

const established = await establishInstallationFromDirectories({
  release: SYNTHETIC_RELEASE_IDENTITY,
  payloadDirectory: release.payloadDirectory,
  seedDirectory: seed(),
  targetRoot: disposableTree("foundation-r06-authority-target-"),
  capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
  installationName: "R06 publication authority",
  installationRepository: "https://example.invalid/r06-authority",
  establishedBy: "FOUNDATION-EFS-S3E3-R06",
});

const capsule = established.ok ? targetCapsule(established.result.targetRoot) : "";
if (established.ok) selectEfsInstallation(capsule);
vi.resetModules();
const efs = established.ok ? await import("@/app/[[...segments]]/efs-request") : null;

describe("publication authority is explicit and site.url is informational (R06)", () => {
  beforeEach(() => state.headers.set("host", "published.example.test"));

  it("derives canonical, asset, redirect and sitemap from the publication binding", async () => {
    expect(established.ok, established.ok ? "" : established.failure.message).toBe(true);
    if (!established.ok || efs === null) return;

    const view = await efs.efsViewForCurrentRequest(["ww", "en", "about"]);
    expect(view).not.toBeNull();
    if (view === null) return;
    expect(view.binding.host).toBe("published.example.test");
    expect(view.canonical).toBe("https://published.example.test/ww/en/about");
    expect(assetUrl(view.binding, ["brand", "logo.svg"])).toBe("/ww/owner-assets/brand/logo.svg");

    await expect(efs.efsViewForCurrentRequest([])).rejects.toThrow("REDIRECT:/ww/en");
    const sitemap = await efs.efsSitemapForCurrentRequest();
    expect(sitemap).not.toBeNull();
    expect(sitemap?.every((entry) => entry.url.startsWith("https://published.example.test/ww/"))).toBe(
      true,
    );
    expect(sitemap?.some((entry) => entry.url.includes("information.invalid"))).toBe(false);
  });
});
