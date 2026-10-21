import { beforeEach, describe, expect, it, vi } from "vitest";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.setConfig({ testTimeout: 60_000 });

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
import { selectEfsInstallation } from "../support/efs-installation";
import { pageIdentitySeed } from "../support/efs-page-identity-seed";
import {
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  SYNTHETIC_RELEASE_IDENTITY,
  constructSyntheticRelease,
  disposableTree,
  targetCapsule,
} from "../support/installation-establishment-fixture";

const release = constructSyntheticRelease();
const established = await establishInstallationFromDirectories({
  release: SYNTHETIC_RELEASE_IDENTITY,
  payloadDirectory: release.payloadDirectory,
  seedDirectory: pageIdentitySeed({ defaultLocale: "de", homeLocales: ["en"] }),
  targetRoot: disposableTree("foundation-r07-home-target-"),
  capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
  installationName: "R07 partial Home default absent",
  installationRepository: "https://example.invalid/r07-home-default-absent",
  establishedBy: "FOUNDATION-EFS-S3E3-R07",
});

const capsule = established.ok ? targetCapsule(established.result.targetRoot) : "";
if (established.ok) selectEfsInstallation(capsule);
vi.resetModules();
const efs = established.ok ? await import("@/app/[[...segments]]/efs-request") : null;

describe("a partially localized Home whose default locale is absent (R07)", () => {
  beforeEach(() => state.headers.set("host", "synthetic.example.test"));

  it("uses the same-Page fallback without inventing or advertising a translation", async () => {
    expect(established.ok, established.ok ? "" : established.failure.message).toBe(true);
    if (!established.ok || efs === null) return;

    const manifest = JSON.parse(
      readFileSync(path.join(capsule, "efs", "manifest.json"), "utf8"),
    ) as {
      entities: {
        id: string;
        facets: {
          sites: {
            pages: { id: string; route: string[]; fallbackLocaleKey?: string; representations: { locale: string }[] }[];
          }[];
        }[];
      }[];
    };
    const home = manifest.entities[0].facets[0].sites[0].pages.find(
      (page) => page.route.join("/") === "home",
    );
    expect(home?.representations).toEqual([{ locale: "en" }]);
    expect(home?.fallbackLocaleKey).toBe("en");

    const homeSource = path.join(
      capsule,
      "efs",
      "capsule",
      manifest.entities[0].id,
      "main",
      "ww",
      "pages",
      home?.id ?? "",
    );
    expect(existsSync(path.join(homeSource, "en.json"))).toBe(true);
    expect(existsSync(path.join(homeSource, "de.json"))).toBe(false);

    await expect(efs.efsViewForCurrentRequest(["ww", "de"])).rejects.toThrow("REDIRECT:/ww/en/");
    const english = await efs.efsViewForCurrentRequest(["ww", "en"]);
    expect(english?.home).toBe(true);
    expect(english?.alternates.map((alternate) => alternate.hreflang)).toEqual(["en"]);
  });
});
