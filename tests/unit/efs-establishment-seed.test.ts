import { describe, expect, it } from "vitest";

import { readContentFiles } from "@/adapters/installation/node-content-files";
import { validateEfsManifest } from "@/config/efs/manifest";
import { explicitSingleWebsiteEfsSeed } from "@/core/foundation-installation/efs-seed";

import { SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT } from "../support/synthetic-deployment-root";

const decoder = new TextDecoder();

describe("ordinary one-website establishment becomes an explicit EFS Installation (R05)", () => {
  it("declares one real Spoke, explicit publications and an owner-scoped capsule", async () => {


    const source = await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT);
    const prepared = explicitSingleWebsiteEfsSeed(source);

    expect(prepared.topology).toEqual({
      mode: "explicit",
      spokes: [{ id: "main", locator: "spokes/main" }],
    });
    const paths = prepared.files.map((file) => file.path);
    expect(paths).toContain("spokes.json");
    expect(paths).toContain("spokes/main/site.config.json");
    expect(paths).toContain("spokes/main/config/i18n/en.json");
    expect(paths).toContain("spokes/main/content/pages/markdown/ww/en/about.md");
    expect(paths).toContain("efs/manifest.json");
    expect(paths).toContain("efs/capsule/e_00000000000000000000000001/main/ww/pages/about/en.md");

    const manifestFile = prepared.files.find((file) => file.path === "efs/manifest.json");
    const validated = validateEfsManifest(JSON.parse(decoder.decode(manifestFile?.bytes)));
    expect(validated.ok).toBe(true);
    if (!validated.ok || !validated.manifest) return;
    for (const publication of validated.manifest.publications) {
      expect(publication.spokeId).toBe("main");
      expect(publication.spokeHubId).toBeUndefined();
      expect(publication.presentationSiteCode).toBeDefined();
    }
  });

  it("leaves a seed that already declares EFS exactly as authored", async () => {
    const source = await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT);
    const authored = [
      ...source,
      {
        path: "efs/manifest.json",
        bytes: new TextEncoder().encode('{"entities":[],"publications":[]}\n'),
      },
      {
        path: "spokes.json",
        bytes: new TextEncoder().encode('{"spokes":[{"id":"main","root":"spokes/main"}]}\n'),
      },
    ];
    const prepared = explicitSingleWebsiteEfsSeed(authored);
    expect(prepared.files).toEqual(authored);
    expect(prepared.topology.mode).toBe("explicit");
  });
});
