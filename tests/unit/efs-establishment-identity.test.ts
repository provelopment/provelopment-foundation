import { describe, expect, it, vi } from "vitest";

import { readContentFiles } from "@/adapters/installation/node-content-files";
import { validateEfsManifest } from "@/config/efs/manifest";
import { isEntityId } from "@/core/efs/identity";
import {
  explicitSingleWebsiteEfsSeed,
  type EfsSeedFile,
} from "@/core/foundation-installation/efs-seed";

import { SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT } from "../support/synthetic-deployment-root";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function entropy(seed: number): () => Uint8Array {
  return () => Uint8Array.from({ length: 16 }, (_, index) => (seed + index) % 256);
}

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

function manifestOf(files: readonly EfsSeedFile[]) {
  const file = files.find((entry) => entry.path === "efs/manifest.json");
  expect(file).toBeDefined();
  return JSON.parse(decoder.decode(file?.bytes)) as {
    entities: {
      id: string;
      properties: Record<string, { value: unknown; public: boolean }>;
      facets: {
        sites: {
          id: string;
          pages: { id: string; route: string[]; representations: { locale: string }[] }[];
        }[];
      }[];
    }[];
    publications: { entityId: string; bindings: { host: string; prefix: string[] }[] }[];
  };
}

describe("permanent Entity identity and explicit publication authority (R06)", () => {
  it("mints a different valid identity for every independent establishment", async () => {
    const source = await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT);
    const first = manifestOf(explicitSingleWebsiteEfsSeed(source, entropy(10)).files);
    const second = manifestOf(explicitSingleWebsiteEfsSeed(source, entropy(200)).files);
    const firstId = first.entities[0].id;
    const secondId = second.entities[0].id;

    expect(isEntityId(firstId)).toBe(true);
    expect(isEntityId(secondId)).toBe(true);
    expect(firstId).not.toBe(secondId);
    expect(first.publications.every((publication) => publication.entityId === firstId)).toBe(true);
    expect(second.publications.every((publication) => publication.entityId === secondId)).toBe(true);
  });

  it("never re-mints an already-explicit identity", async () => {
    const source = await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT);
    const authored = [
      ...source,
      { path: "efs/manifest.json", bytes: encoder.encode('{"entities":[],"publications":[]}\n') },
      { path: "spokes.json", bytes: encoder.encode('{"spokes":[]}\n') },
    ];
    const mint = vi.fn(entropy(1));

    expect(explicitSingleWebsiteEfsSeed(authored, mint).files).toEqual(authored);
    expect(mint).not.toHaveBeenCalled();
  });

  it("uses publication.host whether site.url differs or is absent", async () => {
    const source = await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT);
    const different = withConfiguration(source, (config) => {
      (config.site as Record<string, unknown>).url = "https://information.invalid";
      config.publication = { host: "published.example.test" };
    });
    const absent = withConfiguration(source, (config) => {
      delete (config.site as Record<string, unknown>).url;
      config.publication = { host: "published.example.test" };
    });

    for (const files of [different, absent]) {
      const manifest = manifestOf(explicitSingleWebsiteEfsSeed(files, entropy(2)).files);
      expect(manifest.publications.map((publication) => publication.bindings[0].host)).toEqual([
        "published.example.test",
        "published.example.test",
      ]);
    }
  });

  it("refuses to invent a claim from site.url and omits absent optional properties", async () => {
    const source = await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT);
    const noAuthority = withConfiguration(source, (config) => {
      delete config.publication;
    });
    let refusal = "";
    try {
      explicitSingleWebsiteEfsSeed(noAuthority, entropy(3));
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    expect(refusal).toContain("declares no publication host");
    expect(refusal).toContain("`site.url` is informational");

    const noOptional = withConfiguration(source, (config) => {
      delete (config.site as Record<string, unknown>).tagline;
      delete (config.site as Record<string, unknown>).description;
    });
    const prepared = explicitSingleWebsiteEfsSeed(noOptional, entropy(4));
    const properties = manifestOf(prepared.files).entities[0].properties;
    expect(properties).not.toHaveProperty("brand.tagline");
    expect(properties).not.toHaveProperty("brand.description");
    expect(
      validateEfsManifest(
        JSON.parse(
          decoder.decode(prepared.files.find((file) => file.path === "efs/manifest.json")?.bytes),
        ),
      ).ok,
    ).toBe(true);
  });

  it("honours an explicit publication prefix for a one-Site website", async () => {
    const source = withConfiguration(
      await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT),
      (config) => {
        config.sites = [{ code: "ww", label: "Global", locales: ["en"], defaultLocale: "en" }];
        config.defaultSite = "ww";
        config.publication = { host: "published.example.test", prefix: ["global"] };
      },
    );
    const manifest = manifestOf(explicitSingleWebsiteEfsSeed(source, entropy(20)).files);
    expect(manifest.publications[0].bindings[0]).toMatchObject({
      host: "published.example.test",
      prefix: ["global"],
    });
  });

  it("supplies an explicit valid Home when none was authored, without changing nested Pages", async () => {
    const source = withConfiguration(
      (await readContentFiles(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT)).filter(
        (file) => !/\/home\.(json|md)$/.test(file.path),
      ),
      (config) => {
        config.sites = [{ code: "ww", label: "Global", locales: ["en"], defaultLocale: "en" }];
        config.defaultSite = "ww";
      },
    );
    const nested: EfsSeedFile = {
      path: "content/pages/markdown/ww/en/company/team.md",
      bytes: encoder.encode("---\ntitle: Team\n---\n\nNested page.\n"),
    };
    const prepared = explicitSingleWebsiteEfsSeed([...source, nested], entropy(5));
    const manifest = manifestOf(prepared.files);
    const pages = manifest.entities[0].facets[0].sites[0].pages;
    const home = pages.find((page) => page.route.join("/") === "home");
    const team = pages.find((page) => page.route.join("/") === "company/team");

    expect(home?.representations).toEqual([{ locale: "en" }]);
    expect(team?.route).toEqual(["company", "team"]);
    expect(
      prepared.files.some(
        (file) => file.path === `efs/capsule/${manifest.entities[0].id}/main/ww/pages/home/en.json`,
      ),
    ).toBe(true);
    expect(
      validateEfsManifest(
        JSON.parse(
          decoder.decode(prepared.files.find((file) => file.path === "efs/manifest.json")?.bytes),
        ),
      ).ok,
    ).toBe(true);
  });
});
