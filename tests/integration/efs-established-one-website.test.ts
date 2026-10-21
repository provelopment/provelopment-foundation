import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { establishInstallationFromDirectories } from "@/adapters/installation/establish";
import { isEntityId } from "@/core/efs/identity";
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

/** An ordinary seed whose information URL deliberately disagrees with its publication authority. */
function publicationAuthoritySeed(): string {
  const seed = syntheticSeed();
  const configPath = path.join(seed, "site.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    site: { url: string };
    publication: { host: string };
    sites: unknown[];
    defaultSite?: string;
    business?: unknown;
  };
  config.site.url = "https://information.invalid";
  config.publication = { host: "synthetic.example.test" };
  config.sites = [{ code: "ww", label: "Global" }];
  config.defaultSite = "ww";
  delete config.business;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return seed;
}

const established = await establishInstallationFromDirectories({
  release: SYNTHETIC_RELEASE_IDENTITY,
  payloadDirectory: release.payloadDirectory,
  seedDirectory: publicationAuthoritySeed(),
  targetRoot: disposableTree("foundation-r05-target-"),
  capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
  installationName: "R05 one-website EFS installation",
  installationRepository: "https://example.invalid/r05",
  establishedBy: "FOUNDATION-EFS-S3E3-R05",
});

const targetRoot = established.ok ? established.result.targetRoot : "";
const capsule = targetRoot === "" ? "" : targetCapsule(targetRoot);
if (established.ok) selectEfsInstallation(capsule);
vi.resetModules();
const efs =
  established.ok
    ? await import("@/app/[[...segments]]/efs-request")
    : null;

afterEach(() => state.headers.clear());

describe("an established one-website Installation serves through the one EFS runtime (R05)", () => {
  beforeEach(() => state.headers.clear());

  it("is explicit and immediately resolves its generated publication", async () => {
    expect(established.ok, established.ok ? "" : established.failure.message).toBe(true);
    if (!established.ok || efs === null) return;
    expect(established.result.seedMode).toBe("explicit");
    expect(established.result.seedSpokes).toEqual(["main"]);

    state.headers.set("host", "synthetic.example.test");
    const view = await efs.efsViewForCurrentRequest(["ww", "en", "about"]);
    expect(view?.publication.spokeId).toBe("main");
    expect(view?.context.id).toBe("main");
    expect(view?.site.id).toBe("ww");
    expect(view?.page.id).toBe("about");
    expect(view?.canonical).toBe("https://synthetic.example.test/ww/en/about");

    const manifest = JSON.parse(readFileSync(path.join(capsule, "efs", "manifest.json"), "utf8")) as {
      entities: { id: string }[];
    };
    expect(isEntityId(manifest.entities[0].id)).toBe(true);
    expect(manifest.entities[0].id).not.toBe("e_00000000000000000000000001");
  });
});
