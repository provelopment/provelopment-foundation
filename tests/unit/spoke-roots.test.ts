import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { DEPLOYMENT_CONFIG_FILE_NAME } from "@/config/deployment-root";
import { installationSpokeHubCollectionSchema } from "@/config/spoke-declarations.mjs";
import {
  INSTALLATION_SPOKE_COLLECTION_FILE_NAME,
  SPOKE_ROOTS_DIRECTORY_NAME,
  installationSpokeCollectionSchema,
  resolveInstallationSpokeRoots,
} from "@/config/spoke-roots";
import { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "@/core/spoke";

/**
 * THE INSTALLATION'S SPOKE COLLECTION (FOUNDATION-MULTISITE-S3C1)
 * ==============================================================
 *
 * `spokes.json` is the MEMBERSHIP AUTHORITY: it declares which Spokes an Installation owns, their
 * internal ids and where each is authored. Legacy is the ABSENCE of that manifest; a directory under
 * `spokes/` is inert; a manifest ENTRY is an assertion.
 *
 * Every proof below runs on a SYNTHETIC Installation root in OS temp — created and removed by this
 * file — so the canonical deployment and the committed repository authoring are never involved. The
 * slice is deliberately UNWIRED, so these tests are its only consumers.
 */

const trees: string[] = [];

/** A disposable synthetic tree (OS temp), removed when this file finishes. */
function syntheticTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/**
 * The `spokes/<id>` authoring CONVENTION, spelled with the one exported constant.
 *
 * A LOCATOR is POSIX-style authored data, so it is joined with "/" — never with `path.join`, which
 * would emit the HOST's separator and (correctly) be refused by the resolver.
 */
const spokeDir = (...parts: string[]): string => [SPOKE_ROOTS_DIRECTORY_NAME, ...parts].join("/");

/** Absolute path under a tree, from a POSIX-style locator (fixtures only). */
const at = (root: string, locator: string): string => path.join(root, ...locator.split("/"));

/** An authored Spoke root: the ONE surface S3C1 asserts at root level. */
function authoredSpokeRoot(directory: string): string {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, DEPLOYMENT_CONFIG_FILE_NAME), "{}\n", "utf8");
  return directory;
}

function writeManifest(root: string, manifest: unknown): string {
  const file = path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return file;
}

/** A LEGACY installation: the website material sits at the Installation root itself. */
function legacyInstallation(): string {
  const root = syntheticTree("foundation-legacy-");
  writeFileSync(path.join(root, DEPLOYMENT_CONFIG_FILE_NAME), "{}\n", "utf8");
  return root;
}

/** An EXPLICIT installation: a manifest at the root, plus whichever Spoke roots it declares. */
function explicitInstallation(
  spokes: readonly { readonly id: string; readonly root: string }[],
  options: { readonly manifest?: unknown; readonly strayDirectories?: readonly string[] } = {},
): string {
  const root = syntheticTree("foundation-explicit-");
  for (const stray of options.strayDirectories ?? []) authoredSpokeRoot(at(root, stray));
  for (const spoke of spokes) authoredSpokeRoot(at(root, spoke.root));
  writeManifest(root, options.manifest ?? { spokes: [...spokes] });
  return root;
}

describe("legacy implicit mode — an Installation that declares no collection", () => {
  it("yields ONE descriptor: the reserved id, rooted at the Installation root", () => {
    const root = legacyInstallation();
    const resolved = resolveInstallationSpokeRoots(root);

    expect(resolved.mode).toBe("legacy");
    expect(resolved.manifestFile).toBeNull();
    expect(resolved.installationRoot).toBe(root);
    expect(resolved.descriptors).toEqual([{ id: IMPLICIT_SPOKE_ID, root }]);
  });

  it("keeps the reserved id's literal value stable", () => {
    expect(IMPLICIT_SPOKE_ID).toBe("implicit");
  });

  it("is unchanged by an empty `spokes/` directory (directory presence is inert)", () => {
    const root = legacyInstallation();
    mkdirSync(path.join(root, SPOKE_ROOTS_DIRECTORY_NAME));

    const resolved = resolveInstallationSpokeRoots(root);
    expect(resolved.mode).toBe("legacy");
    expect(resolved.descriptors.map((descriptor) => descriptor.id)).toEqual([IMPLICIT_SPOKE_ID]);
  });

  it("ignores an unlisted directory under `spokes/` (it creates no Spoke)", () => {
    const root = legacyInstallation();
    authoredSpokeRoot(at(root, spokeDir("stray")));

    const resolved = resolveInstallationSpokeRoots(root);
    expect(resolved.mode).toBe("legacy");
    expect(resolved.descriptors).toHaveLength(1);
  });

  it("refuses an Installation root authored NEITHER way", () => {
    expect(() => resolveInstallationSpokeRoots(syntheticTree("foundation-empty-"))).toThrow(
      /authored NEITHER way/,
    );
  });

  it("refuses a root that does not exist", () => {
    expect(() => resolveInstallationSpokeRoots(path.join(tmpdir(), "foundation-absent-s3c1"))).toThrow(
      /is not an existing directory/,
    );
  });
});

describe("explicit mode — an authored Spoke collection", () => {
  it("supports ONE declared Spoke (explicit is not legacy)", () => {
    const root = explicitInstallation([{ id: "foundation", root: spokeDir("foundation") }]);
    const resolved = resolveInstallationSpokeRoots(root);

    expect(resolved.mode).toBe("explicit");
    expect(resolved.manifestFile).toBe(path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME));
    expect(resolved.descriptors).toEqual([
      { id: "foundation", root: at(root, spokeDir("foundation")) },
    ]);
  });

  it("preserves AUTHORED manifest order (never sorted, never filesystem order)", () => {
    const root = explicitInstallation([
      { id: "zeta", root: spokeDir("zeta") },
      { id: "alpha", root: spokeDir("alpha") },
    ]);

    expect(resolveInstallationSpokeRoots(root).descriptors.map((entry) => entry.id)).toEqual([
      "zeta",
      "alpha",
    ]);
  });

  it("keeps identity and directory spelling INDEPENDENT (the id need not name the directory)", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("site-one") }]);

    expect(resolveInstallationSpokeRoots(root).descriptors).toEqual([
      { id: "one", root: at(root, spokeDir("site-one")) },
    ]);
  });

  it("accepts a Spoke root NESTED deeper inside the namespace", () => {
    const root = explicitInstallation([{ id: "europe", root: spokeDir("region", "europe") }]);

    expect(resolveInstallationSpokeRoots(root).descriptors).toEqual([
      { id: "europe", root: at(root, spokeDir("region", "europe")) },
    ]);
  });

  it("keeps ordinary ids VERBATIM: case is not normalized and padding is not trimmed", () => {
    const root = explicitInstallation([
      { id: "IMPLICIT", root: spokeDir("upper") },
      { id: " one ", root: spokeDir("padded") },
    ]);

    expect(resolveInstallationSpokeRoots(root).descriptors.map((entry) => entry.id)).toEqual([
      "IMPLICIT",
      " one ",
    ]);
  });

  it("ignores an unlisted directory under `spokes/`", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      strayDirectories: [spokeDir("unlisted")],
    });

    expect(resolveInstallationSpokeRoots(root).descriptors.map((entry) => entry.id)).toEqual(["one"]);
  });
});

describe("authored-state refusals", () => {
  it("refuses legacy + explicit authored SIMULTANEOUSLY (no precedence, no migration)", () => {
    const root = legacyInstallation();
    authoredSpokeRoot(at(root, spokeDir("one")));
    writeManifest(root, { spokes: [{ id: "one", root: spokeDir("one") }] });

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/authored SIMULTANEOUSLY/);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/No precedence rule exists/);
  });

  it("refuses an empty collection", () => {
    const root = explicitInstallation([], { manifest: { spokes: [] } });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/needs at least one Spoke/);
  });

  it("refuses duplicate ids", () => {
    const root = explicitInstallation([
      { id: "one", root: spokeDir("one") },
      { id: "one", root: spokeDir("one-b") },
    ]);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/repeats id "one"/);
  });

  it("refuses the reserved implicit id", () => {
    const root = explicitInstallation([{ id: IMPLICIT_SPOKE_ID, root: spokeDir("legacy-ish") }]);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/is reserved for the legacy/);
  });

  it("refuses a PADDED reserved id (padding cannot launder it)", () => {
    const root = explicitInstallation([{ id: ` ${IMPLICIT_SPOKE_ID} `, root: spokeDir("padded") }]);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/is reserved for the legacy/);
  });

  it("refuses a blank id", () => {
    const root = explicitInstallation([{ id: "   ", root: spokeDir("blank") }]);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/has a blank id/);
  });
});

describe("structural validation — ONE strict schema, structure only", () => {
  it("refuses a malformed document", () => {
    const root = syntheticTree("foundation-bad-json-");
    writeFileSync(path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME), "{ not json\n", "utf8");
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/is not valid JSON/);
  });

  it("refuses an unknown TOP-LEVEL leaf", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: "one", root: spokeDir("one") }], canonicalHostname: "example.com" },
    });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/Unrecognized key/);
  });

  it("refuses every leaf the collection must NOT author (membership and location only)", () => {
    for (const leaf of [
      "hostname",
      "canonicalHostname",
      "hostnames",
      "aliases",
      "label",
      "site",
      "hub",
      "locales",
      "assets",
      "configuration",
    ]) {
      const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
        manifest: { spokes: [{ id: "one", root: spokeDir("one"), [leaf]: "x" }] },
      });
      expect(() => resolveInstallationSpokeRoots(root), leaf).toThrow(/Unrecognized key/);
    }
  });

  it("refuses a non-string id and a missing root", () => {
    const nonString = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: 7, root: spokeDir("one") }] },
    });
    expect(() => resolveInstallationSpokeRoots(nonString)).toThrow(/spokes\.0\.id/);

    const missingRoot = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: "one" }] },
    });
    expect(() => resolveInstallationSpokeRoots(missingRoot)).toThrow(/spokes\.0\.root/);
  });

  it("restates NO identity semantics: the schema accepts a blank id the pure domain refuses", () => {
    expect(
      installationSpokeCollectionSchema.safeParse({ spokes: [{ id: "   ", root: "x" }] }).success,
    ).toBe(true);
    expect(spokeCollectionIssues(["   "])).toHaveLength(1);
  });
});

describe("root locator refusals", () => {
  it("refuses an absolute locator", () => {
    const root = syntheticTree("foundation-absolute-");
    authoredSpokeRoot(at(root, spokeDir("one")));
    writeManifest(root, { spokes: [{ id: "one", root: at(root, spokeDir("one")) }] });

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/must be root-relative, not absolute/);
  });

  it("refuses a drive-letter locator on every platform", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: "one", root: "C:/outside/one" }] },
    });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/must be root-relative, not absolute/);
  });

  it("refuses a backslash locator (POSIX-style only)", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: "one", root: "spokes\\one" }] },
    });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/must use POSIX/);
  });

  it("refuses a `..` escape", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: "one", root: "../outside" }] },
    });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/must not contain a "\.\." segment/);
  });

  it("refuses a root OUTSIDE the dedicated namespace even when it exists, is a directory and has a config", () => {
    const root = syntheticTree("foundation-outside-namespace-");
    // Perfectly valid-looking authored material — but NOT inside `spokes/`, so it is not a Spoke root.
    authoredSpokeRoot(at(root, "authoring/site-one"));
    writeManifest(root, { spokes: [{ id: "one", root: "authoring/site-one" }] });

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(
      /must live beneath the dedicated "spokes\/" namespace/,
    );
  });

  it("refuses every namespace that is not the dedicated one (no aliases, no misspellings)", () => {
    for (const locator of [
      "authoring/site-one",
      "content/site-one",
      "config/site-one",
      "spoke/one",
      "Spokes/one",
      "./spokes/one",
    ]) {
      const root = explicitInstallation([], { manifest: { spokes: [{ id: "one", root: locator }] } });
      expect(() => resolveInstallationSpokeRoots(root), locator).toThrow(
        /must live beneath the dedicated "spokes\/" namespace/,
      );
    }
  });

  it("refuses the namespace container itself (a Spoke root lives INSIDE it)", () => {
    for (const locator of [SPOKE_ROOTS_DIRECTORY_NAME, `${SPOKE_ROOTS_DIRECTORY_NAME}/`]) {
      const root = explicitInstallation([], { manifest: { spokes: [{ id: "one", root: locator }] } });
      expect(() => resolveInstallationSpokeRoots(root), locator).toThrow(/is not a Spoke root/);
    }
  });

  it("refuses an empty locator", () => {
    const root = explicitInstallation([{ id: "one", root: spokeDir("one") }], {
      manifest: { spokes: [{ id: "one", root: "   " }] },
    });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/root must not be empty/);
  });

  it("refuses a missing Spoke root (an entry is an ASSERTION)", () => {
    const root = explicitInstallation([], {
      manifest: { spokes: [{ id: "one", root: spokeDir("one") }] },
    });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/does not exist/);
  });

  it("refuses a locator that is a file, not a directory", () => {
    const root = syntheticTree("foundation-file-locator-");
    mkdirSync(path.join(root, SPOKE_ROOTS_DIRECTORY_NAME), { recursive: true });
    writeFileSync(at(root, spokeDir("not-a-directory")), "x\n", "utf8");
    writeManifest(root, { spokes: [{ id: "one", root: spokeDir("not-a-directory") }] });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/is not a directory/);
  });

  it("refuses a Spoke root carrying no configuration file", () => {
    const root = syntheticTree("foundation-no-config-");
    mkdirSync(at(root, spokeDir("one")), { recursive: true });
    writeManifest(root, { spokes: [{ id: "one", root: spokeDir("one") }] });
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(
      /carries no "site\.config\.json"/,
    );
  });

  it("refuses two Spokes sharing ONE authored root (identical spelling)", () => {
    const root = explicitInstallation([
      { id: "one", root: spokeDir("shared") },
      { id: "two", root: spokeDir("shared") },
    ]);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/same directory as Spoke #1/);
  });

  it("refuses two Spokes sharing ONE root through DIFFERENT spellings", () => {
    const root = explicitInstallation([
      { id: "one", root: spokeDir("one") },
      { id: "two", root: `${spokeDir("one")}/` },
    ]);
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/same directory as Spoke #1/);
  });
});

describe("physical containment — a link is not an escape hatch", () => {
  const linkType = (): "junction" | "dir" => (process.platform === "win32" ? "junction" : "dir");

  it("refuses a linked root that resolves OUTSIDE the Installation root", () => {
    const outside = authoredSpokeRoot(syntheticTree("foundation-outside-"));
    const root = syntheticTree("foundation-escape-");
    const link = at(root, spokeDir("escaped"));
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(outside, link, linkType());
    writeManifest(root, { spokes: [{ id: "escaped", root: spokeDir("escaped") }] });

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(
      /resolves outside the Installation root/,
    );
  });

  it("refuses a link inside `spokes/` that reaches material elsewhere in the Installation", () => {
    const root = syntheticTree("foundation-namespace-link-");
    const elsewhere = authoredSpokeRoot(at(root, "authoring/site-one"));
    const link = at(root, spokeDir("linked"));
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(elsewhere, link, linkType());
    writeManifest(root, { spokes: [{ id: "linked", root: spokeDir("linked") }] });

    // Lexically beneath `spokes/`, physically not: the CONTAINER is the boundary, not the root.
    expect(() => resolveInstallationSpokeRoots(root)).toThrow(
      /resolves outside the dedicated "spokes\/" namespace/,
    );
  });

  it("accepts a linked root that stays INSIDE the Installation root", () => {
    const root = syntheticTree("foundation-inside-link-");
    const real = authoredSpokeRoot(at(root, spokeDir("real")));
    const link = at(root, spokeDir("alias"));
    symlinkSync(real, link, linkType());
    writeManifest(root, { spokes: [{ id: "alias", root: spokeDir("alias") }] });

    const resolved = resolveInstallationSpokeRoots(root);
    expect(resolved.descriptors.map((entry) => entry.id)).toEqual(["alias"]);
    expect(resolved.descriptors[0].root).toBe(link);
  });

  it("refuses two Spokes that reach ONE root through a link", () => {
    const root = syntheticTree("foundation-link-duplicate-");
    const real = authoredSpokeRoot(at(root, spokeDir("real")));
    symlinkSync(real, at(root, spokeDir("alias")), linkType());
    writeManifest(root, {
      spokes: [
        { id: "real", root: spokeDir("real") },
        { id: "alias", root: spokeDir("alias") },
      ],
    });

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/same directory as Spoke #1/);
  });
});

describe("the pure identity authority — the ONE place the rules live", () => {
  it("reports exactly the identity issues, and nothing about paths or roots", () => {
    expect(spokeCollectionIssues([])).toEqual([
      "an explicit Spoke collection needs at least one Spoke",
    ]);
    expect(spokeCollectionIssues(["one", "two"])).toEqual([]);
    expect(spokeCollectionIssues(["IMPLICIT"])).toEqual([]);
    expect(spokeCollectionIssues(["one", "one"])).toEqual([
      'Spoke #2 repeats id "one", already declared by Spoke #1',
    ]);
    expect(spokeCollectionIssues(["   "])).toEqual(["Spoke #1 has a blank id"]);
    expect(spokeCollectionIssues([IMPLICIT_SPOKE_ID])).toEqual([
      'Spoke #1: id "implicit" is reserved for the legacy compatibility Spoke and cannot be ' +
        "declared explicitly",
    ]);
    expect(spokeCollectionIssues([` ${IMPLICIT_SPOKE_ID} `])).toHaveLength(1);
  });
});

describe("S3C1 is UNWIRED — today's build and runtime are untouched", () => {
  /** Every executable source file under `src/**` (the surface a production importer would appear in). */
  function sourceFiles(directory: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
      else if (/\.(ts|tsx|mjs)$/.test(full)) found.push(full);
    }
    return found;
  }

  it("is consumed by the CONFIG layer only — never by the app, the build or the request path", () => {
    // S3C1's pin, re-stated as the config layer grew: S3D1A added the per-Spoke reader and the composition
    // seam, S3E1A the resource-path model — three config modules and nothing else. Every one of them is
    // proved unwired by its own suite, so nothing in `src/app/**`, `src/components/**`, `src/proxy.ts`, the
    // build or the barrel can reach the Spoke-roots resolver, and no application module reads `spokes.json`.
    const importers = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) => /from\s+["'][^"']*spoke-roots["']/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
      .sort();
    expect(importers).toEqual([
      // M20 — THE ESTABLISHMENT BOUNDARY asks the same question of a SEED DIRECTORY: which authoring mode
      // is it authored in, and where are its Spoke roots? The answer is resolved here, at the adapter
      // boundary, and passed into the pure establishment rules as data, so no second parser, locator rule
      // or membership rule exists.
      "src/adapters/installation/directory-seed-source.ts",
      // S3F2A — the Whole-Installation runtime index consumes the SAME resolver the config layer uses,
      // so it describes an Installation (1..* Spokes) without a second manifest authority.
      "src/config/installation-runtime.ts",
      "src/config/spoke-composition.ts",
      "src/config/spoke-config.ts",
      "src/config/spoke-resources.ts",
    ]);
  });

  it("the config barrel does not publish it", () => {
    expect(readFileSync(path.join(process.cwd(), "src", "config", "index.ts"), "utf8")).not.toContain(
      "spoke-roots",
    );
  });

  it("the build-selection seam RESOLVES declared Spoke roots, and the build configs stay ignorant of them", () => {
    // S3F1 SUPERSEDES the S3C1 pin that the selection seam knew nothing about Spoke collections: making an
    // explicit Installation runnable is exactly that slice's act, so the seam now reads the manifest and
    // resolves the Declared Root of each Spoke. What must still hold is the BOUNDARY the pin existed for:
    // the seam RESOLVES ROOTS (selection) and reads the SOLE Spoke's configuration so the build can inline
    // it — while `./spoke-roots`, `./spoke-config` and `./spoke-composition` remain the only authority that
    // COMPOSES Spokes and Hubs, and neither build config (`next.config.ts`, `vitest.config.mts`) knows a
    // Spoke exists: they consume the seam's answer.
    const seam = readFileSync(path.join(process.cwd(), "src", "config", "deployment-build.mjs"), "utf8");
    expect(seam).toMatch(/INSTALLATION_SPOKE_COLLECTION_FILE_NAME/);
    expect(seam).toMatch(/installationSpokes/);
    // The COMPOSITION authority is never reached from the seam (it is TypeScript, and composition is not
    // selection): resolving a root must not quietly become composing a Spoke. Comments may NAME the
    // boundary — only executable lines are checked.
    const seamCode = seam
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join("\n");
    expect(seamCode).not.toMatch(/spoke-composition|spoke-config|readSpokeSiteConfig/);

    for (const file of ["next.config.ts", "vitest.config.mts"]) {
      const source = readFileSync(path.join(process.cwd(), ...file.split("/")), "utf8");
      expect(source, file).not.toMatch(/spokes/i);
    }
  });
});

/**
 * THE NESTED `spokeHubs` FORM (FOUNDATION-ID-M3-P1)
 * ================================================
 *
 * A second authoring form exists — an Installation's IDENTIFIED SPOKE HUB collection — and Phase 1 supports
 * its RECOGNITION and its COMPLETE VALIDATION, and then REFUSES it: multi-Spoke-Hub runtime support is not
 * enabled yet.
 *
 * The proofs below are therefore in two halves, and both matter:
 *
 *   RECOGNITION AND VALIDATION — the form is parsed, its leaves are typed strictly, and every authoring
 *   defect is reported with the Hub and the Spoke it belongs to;
 *   REFUSAL — it never becomes declarations: not for a collection with ONE Hub, not through the flat
 *   schema, and not through the structure recogniser, which resolves nothing and runs nothing.
 */

/** The nested form's authoritative refusal, or `""` when (wrongly) accepted. */
function refusalOf(root: string): string {
  try {
    resolveInstallationSpokeRoots(root);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The issue lines of a refusal, without its header. */
function refusalIssues(root: string): string[] {
  return refusalOf(root).split("\n").slice(1);
}

/** A nested Installation: every declared Spoke root is authored under the dedicated `spokes/` namespace. */
function nestedInstallation(
  hubs: readonly {
    readonly id: string;
    readonly spokes: readonly { readonly id: string; readonly root: string }[];
  }[],
): string {
  const root = syntheticTree("foundation-spoke-hubs-");
  for (const hub of hubs) {
    for (const spoke of hub.spokes) authoredSpokeRoot(at(root, spoke.root));
  }
  writeManifest(root, { spokeHubs: hubs });
  return root;
}

/** A nested Installation whose manifest is written BY HAND, for the structural cases. */
function rawNestedInstallation(manifest: unknown): string {
  const root = syntheticTree("foundation-spoke-hubs-raw-");
  writeManifest(root, manifest);
  return root;
}

describe("the nested identified Spoke Hub form", () => {
  it("is RECOGNISED and COMPLETELY VALIDATED — and refused, even with exactly ONE Hub", () => {
    const root = nestedInstallation([{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }] }]);

    const message = refusalOf(root);
    expect(message).toMatch(/Invalid Installation Spoke collection/);
    expect(message).toMatch(/"spokeHubs" declares an IDENTIFIED SPOKE HUB COLLECTION/);
    expect(message).toMatch(/multi-Spoke-Hub runtime support is NOT YET ENABLED/);

    // COMPLETELY VALIDATED means exactly that: this manifest has ONE defect — the activation refusal — and
    // nothing else is reported, because nothing else is wrong with it.
    expect(refusalIssues(root)).toHaveLength(1);
    expect(refusalIssues(root)[0]).toMatch(/spokeHubs: FOUNDATION-ID-M3-P1/);
  });

  it("refuses BOTH forms at once — mutual exclusion, never a precedence rule", () => {
    const root = rawNestedInstallation({
      spokes: [{ id: "flat", root: spokeDir("one") }],
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }] }],
    });

    const issues = refusalIssues(root).join("\n");
    expect(issues).toMatch(/spokeHubs: FOUNDATION-ID-M3-P1/);
    expect(issues).toMatch(/spokes: Invalid input: "spokes" and "spokeHubs" are MUTUALLY EXCLUSIVE/);
  });

  it("refuses duplicate Hub ids, an EMPTY Hub, and a duplicate Spoke id inside ONE Hub", () => {
    const duplicateHub = nestedInstallation([
      { id: "one", spokes: [{ id: "a", root: spokeDir("one") }] },
      { id: "one", spokes: [{ id: "b", root: spokeDir("two") }] },
    ]);
    expect(refusalIssues(duplicateHub).join("\n")).toMatch(
      /Spoke Hub #2 repeats id "one", already declared by Spoke Hub #1/,
    );

    const emptyHub = rawNestedInstallation({ spokeHubs: [{ id: "one", spokes: [] }] });
    expect(refusalIssues(emptyHub).join("\n")).toMatch(
      /Spoke Hub #1 \("one"\): an explicit Spoke collection needs at least one Spoke/,
    );

    const duplicateSpoke = nestedInstallation([
      {
        id: "one",
        spokes: [
          { id: "global", root: spokeDir("one") },
          { id: "global", root: spokeDir("two") },
        ],
      },
    ]);
    expect(refusalIssues(duplicateSpoke).join("\n")).toMatch(
      /Spoke #2 repeats id "global", already declared by Spoke #1/,
    );
  });

  it("ACCEPTS the same local Spoke id in TWO Hubs — and still refuses the Installation", () => {
    const root = nestedInstallation([
      { id: "one", spokes: [{ id: "global", root: spokeDir("one") }] },
      { id: "two", spokes: [{ id: "global", root: spokeDir("two") }] },
    ]);

    // Not a defect: a Hub owns its own membership. The ONLY reason this Installation cannot run is Phase
    // 1's activation gate — which is precisely what makes the refusal a GATE and not a validation failure.
    expect(refusalIssues(root)).toHaveLength(1);
    expect(refusalIssues(root)[0]).toMatch(/multi-Spoke-Hub runtime support is NOT YET ENABLED/);
  });

  it("types every leaf strictly, and refuses unknown ones", () => {
    const unknownEntryLeaf = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("one"), label: "Global" }] }],
    });
    expect(refusalIssues(unknownEntryLeaf).join("\n")).toMatch(
      /spokeHubs\.0\.spokes\.0: Unrecognized key: "label"/,
    );

    const unknownManifestLeaf = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }] }],
      spokeHubId: "one",
    });
    expect(refusalIssues(unknownManifestLeaf).join("\n")).toMatch(/Unrecognized key: "spokeHubId"/);

    const unknownHubLeaf = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }], hostname: "x.test" }],
    });
    expect(refusalIssues(unknownHubLeaf).join("\n")).toMatch(/spokeHubs\.0: Unrecognized key: "hostname"/);

    const mistyped = rawNestedInstallation({ spokeHubs: [{ id: 1, spokes: "one" }] });
    const mistypedIssues = refusalIssues(mistyped).join("\n");
    expect(mistypedIssues).toMatch(/spokeHubs\.0\.id: Invalid input: expected string/);
    expect(mistypedIssues).toMatch(/spokeHubs\.0\.spokes: Invalid input: expected array/);

    // Declaring the form with an unusable collection still fails as THIS form: the flat diagnostics can
    // never appear for a manifest authored nested.
    const declaredButEmpty = rawNestedInstallation({ spokeHubs: null });
    expect(refusalIssues(declaredButEmpty).join("\n")).toMatch(/spokeHubs: Invalid input: expected array/);
  });

  it("keeps every ROOT rule, and refuses ONE physical root shared by two Hubs", () => {
    const outsideNamespace = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "config" }] }],
    });
    expect(refusalIssues(outsideNamespace).join("\n")).toMatch(
      /Spoke Hub #1 \("one"\) > Spoke #1 \("global"\): root "config" must live beneath the dedicated "spokes\/" namespace/,
    );

    // Both lexical rules are asserted with authoring data that means the SAME thing on every platform: a
    // leading slash is absolute everywhere, and a backslash is never a POSIX separator — so neither
    // assertion depends on how the HOST spells a joined path.
    const absolute = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "/spokes/one" }] }],
    });
    expect(refusalIssues(absolute).join("\n")).toMatch(/must be root-relative, not absolute/);

    const backslash = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "spokes\\one" }] }],
    });
    expect(refusalIssues(backslash).join("\n")).toMatch(/must use POSIX/);

    const missingRoot = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("absent") }] }],
    });
    expect(refusalIssues(missingRoot).join("\n")).toMatch(/root "spokes\/absent" does not exist/);

    // A root WITHOUT the root-level contract is not a Spoke root, in either form.
    const noConfig = syntheticTree("foundation-spoke-hubs-noconfig-");
    mkdirSync(at(noConfig, spokeDir("one")), { recursive: true });
    writeManifest(noConfig, {
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }] }],
    });
    expect(refusalIssues(noConfig).join("\n")).toMatch(/carries no "site\.config\.json"/);

    // REUSING one physical Spoke root across two Hub declarations is refused exactly as reusing it twice
    // inside one Hub is, and the message names the Spoke that claimed it — through its HUB, because in this
    // form a `Spoke #1` alone belongs to no Hub in particular.
    const sharedRoot = nestedInstallation([
      { id: "one", spokes: [{ id: "global", root: spokeDir("shared") }] },
      { id: "two", spokes: [{ id: "global", root: spokeDir("shared") }] },
    ]);
    const sharedIssues = refusalIssues(sharedRoot).join("\n");
    expect(sharedIssues).toMatch(
      /Spoke Hub #2 \("two"\) > Spoke #1 \("global"\): root "spokes\/shared" resolves to the same directory as Spoke Hub #1 \("one"\) > Spoke #1/,
    );
    expect(sharedIssues).toMatch(/two Spokes cannot share one authored root/);
  });

  it("validates a HUB-SCOPED switcher against its OWN Hub's members", () => {
    /** The same two Hubs, with `one`'s switcher offering `member` — a Spoke of the OTHER Hub. */
    const crossed = nestedInstallation([
      { id: "one", spokes: [{ id: "global", root: spokeDir("one") }] },
      { id: "two", spokes: [{ id: "member", root: spokeDir("two") }] },
    ]);
    writeManifest(crossed, {
      spokeHubs: [
        {
          id: "one",
          spokes: [{ id: "global", root: spokeDir("one") }],
          spokeSwitcher: {
            options: [{ spokeId: "member", label: "Member", href: "https://member.example.test" }],
          },
        },
        { id: "two", spokes: [{ id: "member", root: spokeDir("two") }] },
      ],
    });
    const crossedIssues = refusalIssues(crossed).join("\n");
    expect(crossedIssues).toMatch(
      /Spoke Hub #1 \("one"\) > spokeSwitcher\.options\[0\]: spokeId "member" is not one of the Spokes this Spoke Hub declares/,
    );
    expect(crossedIssues).toMatch(/A switcher is HUB-SCOPED/);

    // A switcher that offers its OWN member is valid authoring — and the Installation is STILL refused, for
    // the ONE remaining reason: the activation gate.
    const own = nestedInstallation([{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }] }]);
    writeManifest(own, {
      spokeHubs: [
        {
          id: "one",
          spokes: [{ id: "global", root: spokeDir("one") }],
          spokeSwitcher: {
            options: [{ spokeId: "global", label: "Global", href: "https://global.example.test" }],
          },
        },
      ],
    });
    expect(refusalIssues(own)).toHaveLength(1);
    expect(refusalIssues(own)[0]).toMatch(/multi-Spoke-Hub runtime support is NOT YET ENABLED/);
  });

  it("exposes the nested form ONLY as a recogniser: structure yes, declarations never", () => {
    const manifest = {
      spokeHubs: [{ id: "one", spokes: [{ id: "global", root: spokeDir("one") }] }],
    };

    // The STRUCTURE is recognised and typed — the leaves a nested manifest may author, and no others.
    const structural = installationSpokeHubCollectionSchema.safeParse(manifest);
    expect(structural.success).toBe(true);
    if (structural.success) {
      expect(structural.data.hubs).toEqual([
        {
          id: "one",
          spokes: [{ id: "global", root: spokeDir("one"), hostAliases: [] }],
          spokeSwitcher: null,
        },
      ]);
    }

    // …and the parser EVERY consumer uses refuses that same manifest, so the recogniser is not a way in.
    const refused = installationSpokeCollectionSchema.safeParse(manifest);
    expect(refused.success).toBe(false);
    if (!refused.success) {
      expect(refused.error.issues).toHaveLength(1);
      expect(refused.error.issues[0].message).toMatch(/NOT YET ENABLED/);
    }
  });

  it("requires a COMPOSITE inspection nomination, and NAMES a Hub written as a flat Spoke", () => {
    // §8.4 — the nested form's nomination is the COMPOSITE reference, never a bare local id.
    const bareNomination = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "docs", root: spokeDir("one") }] }],
      inspectionSpoke: "docs",
    });
    expect(refusalIssues(bareNomination).join("\n")).toMatch(
      /inspectionSpoke: Invalid input: in the nested form the inspection nomination is the COMPOSITE reference/,
    );

    // A COMPOSITE nomination is structurally valid — and the Installation is still refused, for the ONE
    // remaining reason: the activation gate.
    const nominated = nestedInstallation([{ id: "one", spokes: [{ id: "docs", root: spokeDir("one") }] }]);
    writeManifest(nominated, {
      spokeHubs: [{ id: "one", spokes: [{ id: "docs", root: spokeDir("one") }] }],
      inspectionSpoke: { spokeHubId: "one", spokeId: "docs" },
      inspectionHosts: ["inspect.example.test"],
    });
    expect(refusalIssues(nominated)).toHaveLength(1);
    expect(refusalIssues(nominated)[0]).toMatch(/multi-Spoke-Hub runtime support is NOT YET ENABLED/);

    const malformedNomination = rawNestedInstallation({
      spokeHubs: [{ id: "one", spokes: [{ id: "docs", root: spokeDir("one") }] }],
      inspectionSpoke: { spokeHubId: "one", spokeId: "   " },
    });
    expect(refusalIssues(malformedNomination).join("\n")).toMatch(
      /inspectionSpoke\.spokeId: Invalid input: expected a non-blank identity/,
    );

    // §8.2 — a Hub authored in the FLAT SPOKE shape is NAMED, rather than reported as an anonymous unknown
    // leaf: mixing the two forms inside one object is the mistake this diagnostic exists for.
    const hubAsFlatSpoke = rawNestedInstallation({
      spokeHubs: [{ id: "one", root: spokeDir("one"), spokes: [{ id: "docs", root: spokeDir("one") }] }],
    });
    expect(refusalIssues(hubAsFlatSpoke).join("\n")).toMatch(
      /spokeHubs\.0\.root: Invalid input: a Spoke Hub carries no root of its own/,
    );
  });
});
