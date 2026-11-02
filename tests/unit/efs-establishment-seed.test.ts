import { describe, expect, it } from "vitest";

import { readContentFiles } from "@/adapters/installation/node-content-files";
import { validateEfsManifest } from "@/config/efs/manifest";
import { explicitSingleWebsiteEfsSeed, type EfsSeedFile } from "@/core/foundation-installation/efs-seed";

import { syntheticSeed } from "../support/installation-establishment-fixture";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const entropy = () => Uint8Array.from({ length: 16 }, (_, index) => index + 1);

/**
 * THE QUALIFIED DISPOSABLE SOURCE (GEO-03 R04-C10).
 *
 * The committed fixture keeps its historical authoring for other contracts, and the converter's accepted
 * input is a QUALIFIED seed. `syntheticSeed()` copies the fixture and qualifies its languages, so ordinary
 * conversion cases start there. The committed fixture itself is never modified.
 */
const qualifiedSource = () => readContentFiles(syntheticSeed());

/** Rewrite the disposable seed's `site.config.json` only; every other file keeps its exact bytes. */
function withConfiguration(
  files: readonly EfsSeedFile[],
  mutate: (config: Record<string, unknown>) => void,
): readonly EfsSeedFile[] {
  return files.map((file) => {
    if (file.path !== "site.config.json") return file;
    const config = JSON.parse(decoder.decode(file.bytes)) as Record<string, unknown>;
    mutate(config);
    return { path: file.path, bytes: encoder.encode(`${JSON.stringify(config, null, 2)}\n`) };
  });
}

interface GeneratedManifest {
  entities: {
    id: string;
    facets: {
      id: string;
      sites: { id: string; pages: { id: string; route: string[] }[] }[];
    }[];
  }[];
  publications: {
    presentationSiteCode?: string;
    bindings: {
      siteIds: string[];
      defaultSiteId?: string;
      prefix: string[];
      host: string;
      siteMode: string;
    }[];
  }[];
}

function manifestOf(files: readonly EfsSeedFile[]): GeneratedManifest {
  const file = files.find((candidate) => candidate.path === "efs/manifest.json");
  if (file === undefined) throw new Error("no generated efs/manifest.json");
  return JSON.parse(decoder.decode(file.bytes)) as GeneratedManifest;
}

describe("ordinary one-website establishment becomes an explicit EFS Installation (R05)", () => {
  it("declares one real Spoke, explicit publications and an owner-scoped capsule", async () => {


    const source = await qualifiedSource();
    const prepared = explicitSingleWebsiteEfsSeed(source, entropy);

    expect(prepared.topology).toEqual({
      mode: "explicit",
      spokes: [{ id: "main", locator: "spokes/main" }],
    });
    const paths = prepared.files.map((file) => file.path);
    expect(paths).toContain("spokes.json");
    expect(paths).toContain("spokes/main/site.config.json");
    expect(paths).toContain("spokes/main/config/i18n/en.json");
    expect(paths).toContain("spokes/main/content/pages/markdown/ww/en-001/about.md");
    expect(paths).toContain("efs/manifest.json");

    const manifestFile = prepared.files.find((file) => file.path === "efs/manifest.json");
    const validated = validateEfsManifest(JSON.parse(decoder.decode(manifestFile?.bytes)));
    expect(validated.ok).toBe(true);
    if (!validated.ok || !validated.manifest) return;
    const entityId = validated.manifest.entities[0].id;
    expect(paths).toContain(`efs/capsule/${entityId}/main/main/pages/about/en-001.md`);
    expect(validated.manifest.entities[0].facets[0].sites).toHaveLength(2);
    for (const publication of validated.manifest.publications) {
      expect(publication.spokeId).toBe("main");
      expect(publication.spokeHubId).toBeUndefined();
      expect(publication.presentationSiteCode).toBeDefined();
      expect(publication.bindings[0].host).toBe("synthetic.example.test");
      if (publication.presentationSiteCode === "ww") {
        expect(publication.bindings[0].locales).toEqual(["en-001", "de-de"]);
      }
    }
  });

  it("leaves a seed that already declares EFS exactly as authored", async () => {
    const source = await qualifiedSource();
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
    const prepared = explicitSingleWebsiteEfsSeed(authored, entropy);
    expect(prepared.files).toEqual(authored);
    expect(prepared.topology.mode).toBe("explicit");
  });

  it("returns an already-explicit EFS seed with a descriptive `main` Site byte-for-byte", async () => {
    // `GEO-04` C03: the projection belongs to ORDINARY conversion only. An authored explicit manifest
    // keeps the identity it declares — even one that already owns a `main` Site — and establishment
    // must not remint its Entity, rewrite a declaration, add a binding or synthesise a second Site.
    const source = await qualifiedSource();
    const explicitManifest = [
      "{",
      '  "entities": [',
      "    {",
      '      "id": "e_00000000000000000000000001",',
      '      "properties": { "brand.name": { "value": "Authored", "public": true } },',
      '      "facets": [',
      "        {",
      '          "id": "main",',
      '          "sites": [',
      "            {",
      '              "id": "main",',
      '              "properties": {},',
      '              "pages": [{ "id": "home", "route": ["home"], "representations": [{ "locale": "en-001" }] }]',
      "            }",
      "          ]",
      "        }",
      "      ]",
      "    }",
      "  ],",
      '  "publications": []',
      "}",
      "",
    ].join("\n");
    const authored: readonly EfsSeedFile[] = [
      ...source,
      { path: "efs/manifest.json", bytes: encoder.encode(explicitManifest) },
      {
        path: "spokes.json",
        bytes: encoder.encode('{"spokes":[{"id":"main","root":"spokes/main"}]}\n'),
      },
    ];

    const prepared = explicitSingleWebsiteEfsSeed(authored, entropy);

    expect(prepared.files).toEqual(authored);
    expect(prepared.files.length).toBe(authored.length);
    // No implicit alternative Site and no regenerated declaration: the authored bytes survive intact.
    expect(decoder.decode(prepared.files.find((file) => file.path === "efs/manifest.json")?.bytes)).toBe(
      explicitManifest,
    );
    expect(prepared.files.some((file) => file.path.startsWith("efs/capsule/"))).toBe(false);
  });

/**
 * THE LEGACY WORLDWIDE SITE CODE IS NOT AN EFS SITE IDENTITY (`GEO-04` C03).
 *
 * The converter projects the historical `ww` source Site onto the neutral descriptive EFS Site `main`
 * at every EFS identity output, while the SOURCE code keeps reading the source trees and keeps owning
 * the publication host/prefix and the presentation code — so no public address moves.
 */
describe("ordinary establishment decouples the legacy worldwide Site from EFS Site identity (C03)", () => {
  const oneWorldwideSite = async () =>
    withConfiguration(await qualifiedSource(), (config) => {
      config.sites = [{ code: "ww", label: "Global", locales: ["en-001"], defaultLocale: "en-001" }];
      config.defaultSite = "ww";
    });

  it("declares the EFS Site, the capsule path and the binding as `main`, never `ww`", async () => {
    const source = await oneWorldwideSite();
    const prepared = explicitSingleWebsiteEfsSeed(source, entropy);
    const manifest = manifestOf(prepared.files);
    const [site] = manifest.entities[0].facets[0].sites;

    expect(site.id).toBe("main");
    expect(
      manifest.entities[0].facets[0].sites.map((candidate) => candidate.id),
    ).not.toContain("ww");
    expect(manifest.publications).toHaveLength(1);
    expect(manifest.publications[0].bindings[0]).toMatchObject({
      siteIds: ["main"],
      defaultSiteId: "main",
      siteMode: "closed",
    });

    const capsule = prepared.files
      .map((file) => file.path)
      .filter((path) => path.startsWith("efs/capsule/"));
    expect(capsule.length).toBeGreaterThan(0);
    for (const path of capsule) {
      expect(path).toContain(`/${manifest.entities[0].id}/main/main/pages/`);
    }

    // The projection may not claim a representation the source does not carry.
    expect(site.pages.every((page) => page.route.length > 0)).toBe(true);
    expect(
      validateEfsManifest(JSON.parse(decoder.decode(prepared.files.find((file) => file.path === "efs/manifest.json")?.bytes))).ok,
    ).toBe(true);
  });

  it("keeps the source Spoke configuration, the source Page trees and the public address unchanged", async () => {
    const source = await oneWorldwideSite();
    const prepared = explicitSingleWebsiteEfsSeed(source, entropy);
    const manifest = manifestOf(prepared.files);

    // Every authored byte is still copied, under its Spoke root, with the ORIGINAL legacy source path.
    for (const file of source) {
      if (file.path === ".gitignore") continue;
      const moved = prepared.files.find((candidate) => candidate.path === `spokes/main/${file.path}`);
      expect(moved, file.path).toBeDefined();
      expect(moved?.bytes).toEqual(file.bytes);
    }
    const configSource = source.find((file) => file.path === "site.config.json");
    const configMoved = prepared.files.find((file) => file.path === "spokes/main/site.config.json");
    expect(configMoved?.bytes).toEqual(configSource?.bytes);

    // The public contract is untouched: the legacy code still owns the prefix, the host and the shell.
    // `presentationSiteCode` is a descriptive key into that Spoke's own config, which is copied
    // byte-identically — so it stays `ww` while `ww` is refused as an EFS SITE ID (`C08` row 5).
    const publication = manifest.publications[0];
    expect(publication.presentationSiteCode).toBe("ww");
    expect(publication.bindings[0].prefix).toEqual(["ww"]);
    expect(publication.bindings[0].host).toBe("synthetic.example.test");
  });

  it("keeps every non-worldwide Site and its binding independent, merging nothing", async () => {
    // The committed synthetic seed already declares `ww` plus the country-shaped `ca`; only `ww` moves.
    const source = await qualifiedSource();
    const prepared = explicitSingleWebsiteEfsSeed(source, entropy);
    const manifest = manifestOf(prepared.files);
    const ids = manifest.entities[0].facets[0].sites.map((site) => site.id).sort();

    expect(ids).toEqual(["ca", "main"]);
    expect(ids).not.toContain("ww");

    const bindings = manifest.publications.map((publication) => ({
      presentationSiteCode: publication.presentationSiteCode,
      prefix: publication.bindings[0].prefix,
      siteMode: publication.bindings[0].siteMode,
      siteIds: publication.bindings[0].siteIds,
      defaultSiteId: publication.bindings[0].defaultSiteId,
    }));
    expect(bindings).toEqual([
      {
        presentationSiteCode: "ww",
        prefix: ["ww"],
        siteMode: "closed",
        siteIds: ["main"],
        defaultSiteId: "main",
      },
      {
        presentationSiteCode: "ca",
        prefix: ["ca"],
        siteMode: "closed",
        siteIds: ["ca"],
        defaultSiteId: "ca",
      },
    ]);
    // One publication per source Site: the projection never collapses two publications into one.
    expect(manifest.publications).toHaveLength(2);
  });

  it("refuses to merge `ww` onto an identity another source Site already claims", async () => {
    const source = withConfiguration(await qualifiedSource(), (config) => {
      config.sites = [
        { code: "ww", label: "Global", locales: ["en-001"], defaultLocale: "en-001" },
        { code: "main", label: "Main", locales: ["en-001"], defaultLocale: "en-001" },
      ];
      config.defaultSite = "ww";
    });

    expect(() => explicitSingleWebsiteEfsSeed(source, entropy)).toThrow(
      /Legacy source Sites "ww" and "main" would both become the EFS Site "main"/,
    );
    expect(() => explicitSingleWebsiteEfsSeed(source, entropy)).toThrow(/refuses to merge/);
  });

  it("refuses a seed that declares one Site twice", async () => {
    const source = withConfiguration(await qualifiedSource(), (config) => {
      config.sites = [
        { code: "ww", label: "Global", locales: ["en-001"], defaultLocale: "en-001" },
        { code: "ww", label: "Global again", locales: ["en-001"], defaultLocale: "en-001" },
      ];
      config.defaultSite = "ww";
    });

    expect(() => explicitSingleWebsiteEfsSeed(source, entropy)).toThrow(/more than once/);
  });
});

});
