import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { validateEfsManifest } from "@/config/efs/manifest";
import { isEntityId } from "@/core/efs/identity";
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";
import { selectEfsInstallation } from "../support/efs-installation";
import { pageIdentitySeed } from "../support/efs-page-identity-seed";
import {
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  SYNTHETIC_RELEASE_IDENTITY,
  constructSyntheticRelease,
  disposableTree,
  targetCapsule,
} from "../support/installation-establishment-fixture";

interface EstablishedManifest {
  entities: {
    id: string;
    facets: {
      sites: {
        id: string;
        pages: { id: string; route: string[]; fallbackLocaleKey?: string }[];
      }[];
    }[];
  }[];
}

afterEach(() => state.headers.clear());

describe("Page identity and established EFS integrity (R07)", () => {
  beforeEach(() => state.headers.set("host", "synthetic.example.test"));

  it("allocates collision-free PageIDs, preserves routes/sources, resolves requests and refuses a collision", async () => {
    const release = constructSyntheticRelease();
    const seed = pageIdentitySeed({ defaultLocale: "en", homeLocales: ["en"] });
    const first = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot: disposableTree("foundation-r07-page-target-"),
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      installationName: "R07 page identity",
      installationRepository: "https://example.invalid/r07-page-identity",
      establishedBy: "FOUNDATION-EFS-S3E3-R07",
    });
    expect(first.ok, first.ok ? "" : first.failure.message).toBe(true);
    if (!first.ok) return;

    const capsule = targetCapsule(first.result.targetRoot);
    const manifestText = readFileSync(path.join(capsule, "efs", "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestText) as EstablishedManifest;
    const pages = manifest.entities[0].facets[0].sites[0].pages;
    const byRoute = new Map(pages.map((page) => [page.route.join("/"), page]));
    const nested = byRoute.get("company/team");
    const flat = byRoute.get("company-team");

    expect(isEntityId(manifest.entities[0].id)).toBe(true);
    expect(nested).toBeDefined();
    expect(flat).toBeDefined();
    expect(nested?.id).not.toBe(flat?.id);
    expect(nested?.id).toBe("company-team-2");
    expect(flat?.id).toBe("company-team");
    expect(new Set(pages.map((page) => page.id)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.route.join("/"))).size).toBe(pages.length);
    expect(validateEfsManifest(JSON.parse(manifestText)).ok).toBe(true);

    for (const [route, title] of [
      ["company/team", "Nested Team (EN)"],
      ["company-team", "Flat Company Team (EN)"],
    ] as const) {
      const pageId = byRoute.get(route)?.id ?? "";
      const source = JSON.parse(
        readFileSync(
          path.join(
            capsule,
            "efs",
            "capsule",
            manifest.entities[0].id,
            "main",
            "ww",
            "pages",
            pageId,
            "en.json",
          ),
          "utf8",
        ),
      ) as { title: string };
      expect(source.title).toBe(title);
    }

    selectEfsInstallation(capsule);
    vi.resetModules();
    const efs = await import("@/app/[[...segments]]/efs-request");
    const nestedView = await efs.efsViewForCurrentRequest(["ww", "en", "company", "team"]);
    const flatView = await efs.efsViewForCurrentRequest(["ww", "en", "company-team"]);
    expect(nestedView?.page.id).toBe(nested?.id);
    expect(flatView?.page.id).toBe(flat?.id);
    expect(nestedView === null ? "" : efs.efsTitle(nestedView)).toBe("Nested Team (EN)");
    expect(flatView === null ? "" : efs.efsTitle(flatView)).toBe("Flat Company Team (EN)");

    const nestedGerman = await efs.efsViewForCurrentRequest(["ww", "de", "company", "team"]);
    expect(nestedGerman?.page.id).toBe(nested?.id);
    expect(nestedGerman === null ? "" : efs.efsTitle(nestedGerman)).toBe("Nested Team (DE)");

    const home = byRoute.get("home");
    expect(home?.fallbackLocaleKey).toBe("en");
    const homeView = await efs.efsViewForCurrentRequest(["ww", "en"]);
    expect(homeView?.page.id).toBe(home?.id);
    expect(homeView?.alternates.map((alternate) => alternate.hreflang)).toEqual(["en"]);
    await expect(efs.efsViewForCurrentRequest(["ww", "de"])).rejects.toThrow("REDIRECT:/ww/en/");

    const second = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot: disposableTree("foundation-r07-repeat-target-"),
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      installationName: "R07 page identity repeat",
      installationRepository: "https://example.invalid/r07-page-identity-repeat",
      establishedBy: "FOUNDATION-EFS-S3E3-R07",
    });
    expect(second.ok, second.ok ? "" : second.failure.message).toBe(true);
    if (second.ok) {
      const repeated = JSON.parse(
        readFileSync(
          path.join(targetCapsule(second.result.targetRoot), "efs", "manifest.json"),
          "utf8",
        ),
      ) as EstablishedManifest;
      expect(
        repeated.entities[0].facets[0].sites[0].pages.map((page) => [page.id, page.route]),
      ).toEqual(pages.map((page) => [page.id, page.route]));
    }

    const malformed = disposableTree("foundation-r07-malformed-");
    cpSync(capsule, malformed, {
      recursive: true,
      filter: (entry) => path.basename(entry) !== INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
    });
    const malformedManifestPath = path.join(malformed, "efs", "manifest.json");
    const malformedManifest = JSON.parse(
      readFileSync(malformedManifestPath, "utf8"),
    ) as EstablishedManifest;
    const malformedPages = malformedManifest.entities[0].facets[0].sites[0].pages;
    malformedPages[1].id = malformedPages[0].id;
    writeFileSync(
      malformedManifestPath,
      `${JSON.stringify(malformedManifest, null, 2)}\n`,
      "utf8",
    );

    const target = disposableTree("foundation-r07-refused-target-");
    const refused = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory: release.payloadDirectory,
      seedDirectory: malformed,
      targetRoot: target,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      installationName: "R07 malformed",
      installationRepository: "https://example.invalid/r07-malformed",
      establishedBy: "FOUNDATION-EFS-S3E3-R07",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusals.join(" | ")).toContain("duplicates Page");
    }
    expect(existsSync(path.join(target, INSTALLATION_CAPSULE_RELATIVE_PATH))).toBe(false);

    // A valid manifest whose Page has no authored source must be refused by the inventory check.
    const missingSource = disposableTree("foundation-r07-missing-source-");
    cpSync(capsule, missingSource, {
      recursive: true,
      filter: (entry) => path.basename(entry) !== INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
    });
    rmSync(
      path.join(
        missingSource,
        "efs",
        "capsule",
        manifest.entities[0].id,
        "main",
        "ww",
        "pages",
        flat?.id ?? "",
        "en.json",
      ),
      { force: true },
    );
    const missingTarget = disposableTree("foundation-r07-missing-target-");
    const missing = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory: release.payloadDirectory,
      seedDirectory: missingSource,
      targetRoot: missingTarget,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      installationName: "R07 missing source",
      installationRepository: "https://example.invalid/r07-missing-source",
      establishedBy: "FOUNDATION-EFS-S3E3-R07",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.refusals.join(" | ")).toContain("has neither");
    }
    expect(existsSync(path.join(missingTarget, INSTALLATION_CAPSULE_RELATIVE_PATH))).toBe(false);

    // Two distinct PageIDs may not claim one route. The declaration schema alone does not decide
    // this cross-Page fact, so the establishment integrity gate must.
    const duplicateRoute = disposableTree("foundation-r07-route-source-");
    cpSync(capsule, duplicateRoute, {
      recursive: true,
      filter: (entry) => path.basename(entry) !== INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
    });
    const duplicateRouteManifestPath = path.join(duplicateRoute, "efs", "manifest.json");
    const duplicateRouteManifest = JSON.parse(
      readFileSync(duplicateRouteManifestPath, "utf8"),
    ) as EstablishedManifest;
    const duplicateRoutePages = duplicateRouteManifest.entities[0].facets[0].sites[0].pages;
    duplicateRoutePages[1].route = [...duplicateRoutePages[0].route];
    writeFileSync(
      duplicateRouteManifestPath,
      `${JSON.stringify(duplicateRouteManifest, null, 2)}\n`,
      "utf8",
    );
    const duplicateRouteTarget = disposableTree("foundation-r07-route-target-");
    const duplicate = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory: release.payloadDirectory,
      seedDirectory: duplicateRoute,
      targetRoot: duplicateRouteTarget,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      installationName: "R07 duplicate route",
      installationRepository: "https://example.invalid/r07-duplicate-route",
      establishedBy: "FOUNDATION-EFS-S3E3-R07",
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.refusals.join(" | ")).toContain("more than once");
    }
    expect(existsSync(path.join(duplicateRouteTarget, INSTALLATION_CAPSULE_RELATIVE_PATH))).toBe(
      false,
    );
  });
});
