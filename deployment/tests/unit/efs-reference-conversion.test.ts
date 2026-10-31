import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadEfsManifest } from "@/config/efs/manifest";
import { localePathKey } from "@/core/efs/locales";

const DEPLOYMENT = join(process.cwd(), "deployment");
const MANIFEST = join(DEPLOYMENT, "efs", "manifest.json");
const CAPSULE = join(DEPLOYMENT, "efs", "capsule");

/**
 * The authored source among ACTUAL directory entries that answers one Page representation.
 *
 * A representation's locale tag is authored metadata (`de-DE`, canonical case); the physical capsule
 * entry is its lowercase path key (`de-de.json`), and `localePathKey` is that established contract —
 * this comparison derives the key through it rather than restating the rule. Entries are matched as
 * complete names, never resolved through the filesystem, because a case-folding lookup answers
 * "present" for `de-DE.json` on Windows and "absent" on Linux: one declaration would then pass on one
 * host and fail on another. Exact names cannot depend on host case handling.
 *
 * Both authored modes are supported and no dual-format source is forbidden: a `json` sibling is
 * preferred over a `md` sibling, in the same `.json`-then-`.md` order the previous presence check used.
 */
function exactSourceName(entries: Iterable<string>, pathKey: string): string | null {
  const present = new Set(entries);
  for (const extension of ["json", "md"]) {
    const name = `${pathKey}.${extension}`;
    if (present.has(name)) return name;
  }
  return null;
}

/** Resolve a representation source from the directory that owns it, read-only. */
function representationSource(directory: string, pathKey: string): string | null {
  try {
    return exactSourceName(readdirSync(directory), pathKey);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

describe("controlled reference Installation conversion (R02)", () => {
  const loaded = loadEfsManifest(MANIFEST);

  it("is a valid explicit manifest with two Entities and their Spokes", () => {
    expect(loaded.ok, loaded.issues.join(" ")).toBe(true);
    expect(loaded.manifest?.entities.map((entity) => entity.id)).toEqual([
      "e_00000000000000000000000001",
      "e_00000000000000000000000002",
    ]);
    expect(loaded.manifest?.publications.flatMap((publication) => publication.bindings)).toHaveLength(3);
    expect(
      loaded.manifest?.publications.map((publication) => [
        publication.spokeId,
        publication.presentationSiteCode,
      ]),
    ).toEqual([
      ["foundation", "main"],
      ["germany", "main"],
    ]);
  });

  it("preserves the released URL grammar through explicit bindings", () => {
    const bindings = loaded.manifest?.publications.flatMap((publication) => publication.bindings) ?? [];
    // GEO-03 — the released grammar is preserved by DECLARING it, not by inheriting it from geography:
    // every binding serves at the publication root (no geographic prefix survives), and each declares
    // the two PUBLICATION-QUALIFIED locales in its own preference order. Locale tags are stored in
    // their canonical lowercase form, which is what the qualification contract compares against.
    expect(
      bindings.map((binding) => [binding.host, binding.prefix.length, binding.locales.join(",")]),
    ).toEqual([
      ["foundation-template.provelopment.com", 0, "en-001,de-DE"],
      ["provelopment-foundation.vercel.app", 0, "en-001,de-DE"],
      ["foundation-template-germany.provelopment.com", 0, "de-DE,en-001"],
    ]);
    // No binding may reintroduce a geographic prefix.
    for (const binding of bindings) {
      expect(binding.prefix, `${binding.host} serves at the root`).toEqual([]);
    }
  });

  it("has one source for every declared representation and no geographic scheduling", () => {
    const resolved: string[] = [];
    for (const entity of loaded.manifest?.entities ?? []) {
      for (const facet of entity.facets) {
        for (const site of facet.sites) {
          for (const page of site.pages) {
            for (const representation of page.representations) {
              const directory = join(CAPSULE, entity.id, facet.id, site.id, "pages", page.id);
              // The authored tag stays authored (`de-DE`); the entry on disk is its path key (`de-de`).
              const pathKey = localePathKey(representation.locale);
              const source = representationSource(directory, pathKey);
              expect(
                source,
                `${page.id}/${representation.locale} expects an exact ${pathKey}.json or ${pathKey}.md`,
              ).not.toBeNull();
              resolved.push(`${entity.id}/${site.id}/${page.id}/${pathKey}/${source}`);
            }
          }
        }
      }
    }
    // One source per declared representation, every entry matched by its exact name. The identity
    // includes the Entity and Site, because two Entities legitimately author a Page of the same slug.
    expect(resolved).toHaveLength(14);
    expect(new Set(resolved).size).toBe(14);
    expect(resolved).toContain("e_00000000000000000000000001/main/home/de-de/de-de.json");
    const raw = JSON.stringify(loaded.manifest);
    expect(raw).not.toMatch(/timezone|regions|Europe\/Berlin/);
  });

  it("matches a representation source by its exact lowercase path key, never by case folding", () => {
    const entity = "e_00000000000000000000000001";
    const home = join(CAPSULE, entity, "foundation", "main", "pages", "home");
    const about = join(CAPSULE, entity, "foundation", "main", "pages", "about");

    // The directory really carries these exact names; the casing below is the filesystem's, not ours.
    expect(readdirSync(home).sort()).toEqual(["de-de.json", "en-001.json"]);

    // Positive: the derived path key names the entry that exists, in both authored modes.
    expect(localePathKey("de-DE")).toBe("de-de");
    expect(representationSource(home, localePathKey("de-DE"))).toBe("de-de.json");
    expect(representationSource(about, localePathKey("de-DE"))).toBe("de-de.md");

    // Adversarial, against the REAL entries: the authored tag is metadata, never a filename. A
    // case-folding lookup answers `de-DE.json` here on Windows and misses on Linux; matching complete
    // names answers identically on every host, so this proof does not rely on filesystem case rules.
    expect(representationSource(home, "de-DE")).toBeNull();
    expect(representationSource(home, "DE-DE")).toBeNull();
    expect(exactSourceName(["de-DE.json"], "de-de")).toBeNull();
    expect(exactSourceName(["De-DE.MD"], "de-de")).toBeNull();

    // Both authored modes stay supported, and a genuine dual-format source is not forbidden.
    expect(exactSourceName(["en-001.md"], "en-001")).toBe("en-001.md");
    expect(["en-001.json", "en-001.md"]).toContain(exactSourceName(["en-001.json", "en-001.md"], "en-001"));

    // An absent page directory is a missing source, not a thrown error.
    expect(representationSource(join(home, "absent"), "de-de")).toBeNull();
  });

  it("declares exactly the released authored Pages and representations", () => {
    const authored: string[] = [];
    for (const [spoke, site] of [
      ["foundation", "main"],
      ["germany", "main"],
    ] as const) {
      for (const mode of ["json", "markdown"]) {
        const root = join(DEPLOYMENT, "spokes", spoke, "content", "pages", mode, site);
        if (!existsSync(root)) continue;
        for (const relative of readdirSync(root, { recursive: true }) as string[]) {
          const match = /^([^\\/]+)[\\/]([^\\/]+)\.(json|md)$/.exec(relative.replace(/\\/g, "/"));
          if (!match) continue;
          authored.push(`${spoke}/${match[1]}/${match[2]}`);
        }
      }
    }

    const declared: string[] = [];
    for (const [entityIndex, entity] of (loaded.manifest?.entities ?? []).entries()) {
      const spoke = entityIndex === 0 ? "foundation" : "germany";
      for (const facet of entity.facets) {
        for (const site of facet.sites) {
          for (const page of site.pages) {
            for (const representation of page.representations) {
              declared.push(`${spoke}/${representation.locale.toLowerCase()}/${page.id}`);
            }
          }
        }
      }
    }

    expect(declared.sort()).toEqual(authored.sort());
    expect(loaded.manifest?.entities.flatMap((entity) => entity.facets.flatMap((facet) => facet.sites.flatMap((site) => site.pages)))).toHaveLength(7);
    expect(declared).toHaveLength(14);
  });

  it("keeps the reference brand assets inside each owning Entity capsule", () => {
    for (const entity of loaded.manifest?.entities ?? []) {
      const facet = entity.facets[0];
      expect(existsSync(join(CAPSULE, entity.id, facet.id, "assets", "brand", "logo.svg"))).toBe(true);
      expect(existsSync(join(CAPSULE, entity.id, facet.id, "assets", "brand", "favicon.svg"))).toBe(true);
    }
  });
});
