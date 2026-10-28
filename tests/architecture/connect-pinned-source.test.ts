/**
 * THE PINNED CONNECT SOURCE, AND THE CONTRACTS THAT KEEP IT HONEST
 * ===============================================================
 * FOUNDATION-CONNECT-MODULE-INTEGRATION-A9
 *
 * Connect reaches Foundation as a **Git-source** Module: a pinned source revision carried
 * byte-for-byte, with no npm package, no registry artifact and no archive. This suite is the evidence
 * that the pin is EXACT, that it survives a checkout, and that Foundation talks to the Module only
 * through its public entry point.
 *
 *   · the provenance record names the released tag object, commit, tree and `src` subtree, plus the
 *     Module's own passing CI run for that commit;
 *   · the carried tree still recomputes to that exact Git tree id (`pnpm connect:verify` runs the same
 *     computation, so a local check and this suite can never disagree);
 *   · `modules/connect/src/**` is stored VERBATIM by committed rule — the proof is worthless if a
 *     `core.autocrlf=true` machine rewrites the bytes on checkout, which is exactly how a naive
 *     vendor step was caught during this integration;
 *   · no Connect package dependency exists anywhere the application installs from, and no private
 *     repository is reachable from the build;
 *   · Foundation imports the Module only through `src/index.ts`, never a deep module path;
 *   · the licence record exists, and the provenance may not claim a grant it cannot name.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyPinnedSource } from "../../scripts/connect/verify-pinned-source.mjs";

const REPOSITORY_ROOT = path.resolve(process.cwd());
const PROVENANCE = JSON.parse(
  readFileSync(path.join(REPOSITORY_ROOT, "modules/connect/connect-release.json"), "utf8"),
) as {
  format: number;
  module: string;
  distribution: string;
  repository: string;
  release: string;
  releaseAuthority: string;
  ci: string;
  source: {
    tagObject: string;
    commit: string;
    tree: string;
    subtreePath: string;
    subtree: string;
    fileCount: number;
  };
  carried: { path: string; verifiedBy: string };
  license: {
    state: string;
    instrument?: string;
    attributionPaths?: readonly string[];
    grantRecorded: boolean;
  };
};

describe("the pinned Connect source", () => {
  it("recomputes to the exact Git tree id the provenance records", () => {
    const result = verifyPinnedSource(REPOSITORY_ROOT);

    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.actual).toBe(PROVENANCE.source.subtree);
    expect(result.fileCount).toBe(PROVENANCE.source.fileCount);
    // The carried bytes are the released bytes: an LF tree, not a converted checkout.
    expect(result.carriageReturnFiles).toBe(0);
  });

  it("records one released identity, in the shape the Module publishes", () => {
    expect(PROVENANCE.format).toBe(1);
    expect(PROVENANCE.module).toBe("connect");
    expect(PROVENANCE.distribution).toBe("git-source");
    expect(PROVENANCE.repository).toBe(
      "https://github.com/provelopment/provelopment-module-connect",
    );
    expect(PROVENANCE.release).toMatch(/^v\d{6}\.\d{4}$/);
    expect(PROVENANCE.source.tagObject).toMatch(/^[0-9a-f]{40}$/);
    expect(PROVENANCE.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(PROVENANCE.source.tree).toMatch(/^[0-9a-f]{40}$/);
    expect(PROVENANCE.source.subtree).toMatch(/^[0-9a-f]{40}$/);
    expect(PROVENANCE.source.subtreePath).toBe("src");
    expect(PROVENANCE.carried.path).toBe("modules/connect/src");
    expect(PROVENANCE.carried.verifiedBy).toBe("scripts/connect/verify-pinned-source.mjs");
    // The Module's own release authority and passing CI, repeated verbatim so they can be compared.
    expect(PROVENANCE.releaseAuthority).toContain("CONNECT-");
    expect(PROVENANCE.ci).toContain("provelopment-module-connect/actions/runs/");
  });

  it("is stored verbatim, because the proof compares bytes", () => {
    const attributes = readFileSync(path.join(REPOSITORY_ROOT, ".gitattributes"), "utf8");
    expect(attributes).toContain("modules/connect/src/** -text");
  });
});


describe("Foundation's use of the Module", () => {
  it("depends on no Connect package and reaches no private repository", () => {
    const manifest = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];

    // A Git-source Module is carried, never installed: an entry here would mean producing a release
    // requires the registry — or a private repository — to be reachable.
    expect(installed.filter((name) => /coms-web|module-connect|provelopment/i.test(name))).toEqual(
      [],
    );
    expect(manifest.dependencies ?? {}).not.toHaveProperty("@provelopment/coms-web");
  });

  it("imports the Module only through its public entry point", () => {
    const sources = collectSourceFiles(path.join(REPOSITORY_ROOT, "src"));
    const deepImports = sources.filter((file) =>
      /modules\/connect\/src\/(?!index)/.test(readFileSync(file, "utf8")),
    );

    // Connect exports domain contracts, use cases and ports from `index.ts`; the reference in-memory
    // adapters are deliberately not exported. A deep import would let Foundation lean on an
    // implementation detail the Module never promised, so it fails here rather than at the next pin.
    expect(deepImports.map((file) => path.relative(REPOSITORY_ROOT, file))).toEqual([]);
  });

  it("keeps a licence record, and never claims a grant it cannot name", () => {
    const record = readFileSync(
      path.join(REPOSITORY_ROOT, "modules/connect/LICENSE-CONNECT.md"),
      "utf8",
    );

    expect(record).toContain(PROVENANCE.release);
    expect(record).toContain(PROVENANCE.source.commit);
    // The record must state the problem, not paper over it: copying files does not relicense them.
    expect(record.toLowerCase()).toContain("unlicensed");

    if (PROVENANCE.license.grantRecorded) {
      // A grant is only claimed with an instrument that names the grantor and the licence granted.
      expect(PROVENANCE.license.state).not.toMatch(/BLOCKED/);
      expect(PROVENANCE.license.instrument).toMatch(/Project Owner/);
      expect(PROVENANCE.license.instrument).toMatch(/Apache.+2\.0/);
      expect(record).toMatch(/grant/i);
    } else {
      expect(PROVENANCE.license.state).toMatch(/BLOCKED/);
    }
  });

  it("points attribution at files that actually exist", () => {
    // A notice that names a file the repository does not have is a dangling claim: it reads as
    // compliance while proving nothing. Every recorded path is a real file, checked here.
    const paths = PROVENANCE.license.attributionPaths ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const relative of paths) {
      expect(existsSync(path.join(REPOSITORY_ROOT, relative)), relative).toBe(true);
    }
  });

  it("documents how to verify the pin, so the proof is not folklore", () => {
    const readme = readFileSync(path.join(REPOSITORY_ROOT, "modules/connect/README.md"), "utf8");
    expect(readme).toContain("pnpm connect:verify");
  });
});

/** Every TypeScript/JavaScript file beneath a directory, recursively. */
function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.(?:ts|tsx|mjs|js)$/.test(entry.name) ? [entryPath] : [];
  });
}
