import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deploymentPaths } from "@/config/deployment-root";
import {
  INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
  installationOperationalStateIssues,
} from "@/core/foundation-installation";
import { foundationReleaseReferenceIssues } from "@/core/foundation-release/reference";

import { operationalState } from "../support/foundation-installation-fixture";

/**
 * THE FOUNDATION INSTALLATION CONTRACT'S ARCHITECTURAL BOUNDARY (FOUNDATION-B4A / B4A-A2)
 * ====================================================================================
 *
 * B4A-A2 corrected three things that no amount of prose can keep true on its own, so they are asserted
 * against the SOURCE and the TYPES:
 *
 *   1. THE SUBJECT. The lifecycle is ONE COMPLETE FOUNDATION INSTALLATION's — not a spoke's, not a Site's
 *      — and it knows nothing about any other installation. There is no clone, parent, child, sibling,
 *      source, registry, fleet or cross-installation concept anywhere in it.
 *   2. THE DEPENDENCY DIRECTION. `src/core/**` must never depend on the procedural tooling in
 *      `scripts/**`; the pure Foundation-release contract is what both sides consume.
 *   3. THE PORTS. They stay contracts (clock, operational-state store, release ACQUISITION source), no
 *      adapter implements them yet, and a release's identity carries nothing about how it was acquired.
 *
 * Import and type boundaries prove most of this cleanly; only NAMING needs a scan, and that scan reads
 * CODE (comments are stripped), because the documentation legitimately names the concepts it forbids.
 */
const ROOT = process.cwd();
const INSTALLATION_DIRECTORY = path.join(ROOT, "src", "core", "foundation-installation");
const RELEASE_DIRECTORY = path.join(ROOT, "src", "core", "foundation-release");
const PORTS = path.join(ROOT, "src", "application", "foundation-installation-ports.ts");
const PATH_AUTHORITY = path.join(ROOT, "src", "config", "deployment-root.ts");
const TOOLING_DIRECTORY = path.join(ROOT, "scripts", "release");

/** Every `.ts`/`.tsx` file beneath a directory. */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** Every `.ts`/`.mjs` file beneath a directory, for the surfaces that are plain ESM. */
function codeFiles(directory: string): string[] {
  return readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((full) => statSync(full).isFile() && (full.endsWith(".ts") || full.endsWith(".mjs")));
}

/** The import specifiers of a source file, in order. */
function importsOf(file: string): string[] {
  const pattern = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;
  return [...readFileSync(file, "utf8").matchAll(pattern)].map((match) => match[1]);
}

/** A file's CODE, with comments removed: prose about a concept is not the concept. */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => line.trim().length > 0);
}

const relative = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");

describe("the lifecycle is ONE installation's, and there is no other installation anywhere in it", () => {
  const files = sourceFiles(INSTALLATION_DIRECTORY);

  it("is the contract's own module set, and nothing else", () => {
    expect(files.map((file) => path.basename(file)).sort()).toEqual(
      ["efs-seed.ts", "establishment.ts", "failures.ts", "index.ts", "model.ts", "state.ts", "transitions.ts"].sort(),
    );
  });

  it("imports nothing outside itself except the pure Foundation-release contract", () => {
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(
          specifier.startsWith("./") || specifier.startsWith("@/core/foundation-release/"),
          `${relative(file)} imports "${specifier}"`,
        ).toBe(true);
      }
    }
  });

  it("never names another installation, a clone, a parent, a sibling, an upstream or a registry", () => {
    // CODE, not prose: the README and the docblocks must be free to say these concepts do not exist.
    const forbidden = [
      /\bclone/i,
      /\bparent/i,
      /\bsibling/i,
      /\bupstream/i,
      /\bpeer/i,
      /\bregistry\b/i,
      /\bfleet\b/i,
      /\bsourceInstallation/i,
      /\botherInstallation/i,
    ];
    for (const file of files) {
      const code = codeLines(file).join("\n");
      for (const pattern of forbidden) {
        expect(pattern.test(code), `${relative(file)} contains ${String(pattern)} in code`).toBe(false);
      }
    }
  });

  it("keeps the subject vocabulary unambiguous: no bare `deployment` subject in code", () => {
    // The installation root and its path authority are named `deployment-*` by the reviewed ISO-B1
    // contract, and those spellings live in `src/config/deployment-root.ts` — not here. The lifecycle's own
    // code names the INSTALLATION.
    for (const file of files) {
      const code = codeLines(file).join("\n");
      expect(/deployment/i.test(code), `${relative(file)} names a deployment in code`).toBe(false);
    }
  });

  it("refuses a spoke- or Site-level field in the installation's record", () => {
    const record = operationalState() as unknown as { current: Record<string, unknown> };
    const current = record.current;

    expect(Object.keys(current).sort()).toEqual([
      "health",
      "healthEvaluatedAt",
      "installationIdentity",
      "lastAttempt",
      "live",
    ]);

    // A spoke-level or Site-level field is REFUSED by the exact key set, never tolerated as an extra:
    // one ambiguous record serving two levels is exactly what the contract exists to prevent.
    for (const extra of ["spokes", "sites", "locales"]) {
      const withExtra = structuredClone(record) as unknown as { current: Record<string, unknown> };
      withExtra.current[extra] = ["example"];
      expect(
        installationOperationalStateIssues(withExtra).join("\n"),
        `${extra} must not be accepted in the installation's snapshot`,
      ).toMatch(/current has keys/);
    }
  });
});


describe("the lifecycle domain is pure, framework-free and deterministic", () => {
  const files = sourceFiles(INSTALLATION_DIRECTORY);

  it("never reads a clock, the environment, a timer or the network", () => {
    for (const file of files) {
      const code = codeLines(file).join("\n");
      const display = relative(file);
      for (const forbidden of [
        "Date.now(",
        "new Date()",
        "process.env",
        "process.cwd(",
        "setTimeout",
        "setInterval",
        "fetch(",
        "node:http",
        "node:https",
        "node:net",
        "octokit",
        "simple-git",
        "child_process",
      ]) {
        expect(code.includes(forbidden), `${display} must not use ${forbidden}`).toBe(false);
      }
    }
  });

  it("performs no filesystem or process effect", () => {
    for (const file of files) {
      const code = codeLines(file).join("\n");
      const display = relative(file);
      for (const forbidden of ["readFileSync", "writeFileSync", "mkdirSync", "rmSync", "execFileSync"]) {
        expect(code.includes(forbidden), `${display} must not use ${forbidden}`).toBe(false);
      }
    }
  });
});

describe("the ports are contracts, and nothing implements them yet", () => {
  it("declares exactly three ports, plus the acquired-release value — types only, no behaviour", () => {
    const code = codeLines(PORTS).join("\n");

    for (const port of [
      "export interface InstallationClock",
      "export interface InstallationOperationalStateStore",
      "export interface FoundationReleaseAcquisitionSource",
      "export interface AcquiredFoundationRelease",
    ]) {
      expect(code, `${port} must be declared`).toContain(port);
    }
    expect((code.match(/export interface /g) ?? []).length).toBe(4);
    for (const runtime of ["export const", "export function", "export class", "export default"]) {
      expect(code.includes(runtime), `the ports must declare no runtime code (${runtime})`).toBe(false);
    }
  });

  it("declares no port for another installation, a registry or a peer", () => {
    const code = codeLines(PORTS).join("\n");
    for (const forbidden of [/clone/i, /parent/i, /sibling/i, /upstream/i, /registry/i, /fleet/i, /anotherInstallation/i]) {
      expect(forbidden.test(code), `the ports must not declare ${String(forbidden)}`).toBe(false);
    }
  });

  it("is implemented by NO adapter yet, because B4B–B4G own the mechanics", () => {
    const adapters = sourceFiles(path.join(ROOT, "src", "adapters"));
    const importers = adapters.filter((file) =>
      importsOf(file).some((specifier) => specifier.includes("foundation-installation-ports")),
    );

    // FOUNDATION-B4B: the port is now implemented by exactly the installation adapters that establish an
    // installation (a release directory, an authored capsule, a guarded target root, the operational record)
    // — and by nothing else. No materialiser, validator, staging deployer, promoter, rollback executor or
    // health probe exists yet, and no adapter reaches for a network.
    expect(importers.map(relative)).toEqual([
      "src/adapters/installation/establish.ts",
      "src/adapters/installation/local-release-source.ts",
      "src/adapters/installation/node-operational-state-store.ts",
    ]);

    // …and the establishment PORTS B4B declared are implemented by exactly the adapters that read the
    // material an installation is made of: the release directory, the authored seed and the target root.
    const establishmentImporters = adapters.filter((file) =>
      importsOf(file).some((specifier) => specifier.includes("foundation-establishment-ports")),
    );
    expect(establishmentImporters.map(relative)).toEqual([
      "src/adapters/installation/directory-seed-source.ts",
      "src/adapters/installation/local-release-source.ts",
      "src/adapters/installation/node-content-files.ts",
      "src/adapters/installation/node-installation-target.ts",
    ]);
  });

  it("reaches no network, and knows no other installation, from the adapters that establish one", () => {
    // A Foundation installation must be able to operate with NO network at all, and establishment must not
    // acquire a relationship it would have to keep: the only mechanism B4B implements reads a local
    // directory, and nothing here may open a socket, poll, or name another installation.
    const adapters = sourceFiles(path.join(ROOT, "src", "adapters", "installation"));
    expect(adapters.length).toBeGreaterThan(4);
    for (const file of adapters) {
      const code = codeLines(file).join("\n");
      for (const forbidden of [
        /node:https?/,
        /node:net/,
        /node:dgram/,
        /\bfetch\s*\(/,
        /XMLHttpRequest/,
        /octokit/i,
        /api\.github\.com/,
        /clone/i,
        /parent/i,
        /sibling/i,
        /peer/i,
        /registry/i,
        /fleet/i,
        /polling/i,
        /latest-version/i,
      ]) {
        expect(forbidden.test(code), `${relative(file)} must not contain ${String(forbidden)}`).toBe(false);
      }
    }
  });
});


describe("one pure release contract, consumed by BOTH sides", () => {
  it("is the domain's own module, and the release tooling imports it rather than owning it", () => {
    const contract = codeFiles(RELEASE_DIRECTORY).map((file) => path.basename(file)).sort();
    expect(contract).toEqual(["content-digest.mjs", "identity.mjs", "manifest.mjs", "reference.ts"]);

    const toolingImporters = codeFiles(TOOLING_DIRECTORY).filter((file) =>
      importsOf(file).some((specifier) => specifier.includes("core/foundation-release/")),
    );
    expect(toolingImporters.map((file) => path.basename(file)).sort()).toEqual([
      "release-content-policy.mjs",
      "release-digest.mjs",
      "release-identity.mjs",
      "release-manifest.mjs",
    ]);

    const domainImporters = sourceFiles(INSTALLATION_DIRECTORY).filter((file) =>
      importsOf(file).some((specifier) => specifier.includes("core/foundation-release/")),
    );
    expect(domainImporters.map((file) => path.basename(file)).sort()).toEqual([
      "establishment.ts",
      "model.ts",
      "state.ts",
      "transitions.ts",
    ]);
  });

  it("spells the canonical release identity in exactly ONE place", () => {
    const surfaces = codeFiles(RELEASE_DIRECTORY)
      .concat(codeFiles(TOOLING_DIRECTORY))
      .concat(sourceFiles(INSTALLATION_DIRECTORY))
      .concat(sourceFiles(path.join(ROOT, "src", "application")));
    const spellers = surfaces
      .filter((file) => codeLines(file).some((line) => line.includes('"provelopment-foundation-v"')))
      .map(relative)
      .sort();

    expect(spellers).toEqual(["src/core/foundation-release/identity.mjs"]);
  });

  it("keeps a release's identity free of anything about how it was acquired", () => {
    // Proven by the STRUCTURE a consumer validates, not by a keyword: a reference that also claimed where
    // its bytes came from is refused, so acquisition can never become part of a release's identity.
    const reference = operationalState().current.live?.release as unknown as Record<string, unknown>;
    expect(Object.keys(reference).sort()).toEqual(["commit", "content", "manifestFormat", "repository", "tag", "tree"]);

    const withAcquisition = { ...reference, acquiredFrom: "a local directory" };
    expect(foundationReleaseReferenceIssues(withAcquisition).join("\n")).toMatch(/release reference has keys/);
  });
});

describe("the installation owns WHERE the record lives, the contract owns what it is", () => {
  it("resolves the record inside the installation root, under the contract's own file name", () => {
    const paths = deploymentPaths();

    expect(paths.operationalStateFile).toBe(`${paths.root}/${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}`);
  });

  it("spells the file name ONCE in application source — the contract, not a second literal", () => {
    const spellers = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => codeLines(file).some((line) => line.includes(`"${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}"`)))
      .map(relative)
      .sort();

    expect(spellers).toEqual(["src/core/foundation-installation/model.ts"]);
    expect(readFileSync(PATH_AUTHORITY, "utf8")).toContain("INSTALLATION_OPERATIONAL_STATE_FILE_NAME");
  });
});
