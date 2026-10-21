import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// These suites SPAWN GIT AND REAL NODE PROCESSES — synthetic repositories, release construction, an
// establishment through the command line — and a loaded CI runner is an order of magnitude slower than a
// developer machine. The budget is raised here, measured rather than guessed; nothing in the platform waits,
// retries or inflates anything.
vi.setConfig({ testTimeout: 60_000 });

import {
  establishFoundationInstallation,
  type FoundationEstablishmentOutcome,
} from "@/application/establish-foundation-installation";
import type {
  FoundationContentFile,
  FoundationInstallationTarget,
} from "@/application/foundation-establishment-ports";
import { DirectorySeedSource } from "@/adapters/installation/directory-seed-source";
import {
  establishInstallationFromDirectories,
} from "@/adapters/installation/establish";
import { LocalReleaseSource } from "@/adapters/installation/local-release-source";
import { sha256Hex } from "@/adapters/installation/node-content-files";
import { NodeInstallationTarget } from "@/adapters/installation/node-installation-target";
import { NodeOperationalStateStore } from "@/adapters/installation/node-operational-state-store";
import {
  INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
  INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION,
  installationActivationState,
  installationHealthOf,
  parseInstallationOperationalState,
  recordInstallationHealth,
  INSTALLATION_ACTIVATION,
  INSTALLATION_HEALTH,
} from "@/core/foundation-installation/index";
import {
  installationIsEstablishedFrom,
  INSTALLATION_ADOPTION_RECORD_FILE_NAME,
} from "@/core/foundation-installation/establishment";
import { RELEASE_MANIFEST_FILE_NAME } from "@/core/foundation-release/manifest.mjs";

import { constructRelease, constructReleaseFromWorkTree } from "../../scripts/release/release-construction.mjs";
import {
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  constructSyntheticRelease,
  disposableTree,
  operationalStateFileOf,
  snapshotTree,
  SYNTHETIC_ESTABLISHMENT_MOMENT,
  SYNTHETIC_RELEASE_IDENTITY,
  SYNTHETIC_SOURCE_RELEASE,
  syntheticSeed,
  syntheticSeedFromExistingInstallation,
  syntheticSourceAdoptionRecordText,
  targetCapsule,
} from "../support/installation-establishment-fixture";

/**
 * ESTABLISHING ONE COMPLETE FOUNDATION INSTALLATION (FOUNDATION-B4B)
 * ==================================================================
 *
 * The capability proved here is the whole point of B4B: ONE autonomous Foundation installation can be
 * created, deterministically, inside a target root that is given to it explicitly — from an immutable
 * release plus authored material — and the result is complete, checkable and independent of everything it
 * was created from.
 *
 * EVERY TREE IS DISPOSABLE AND TASK-OWNED (`tests/support/installation-establishment-fixture.ts`): a
 * synthetic platform committed to a throwaway Git repository, a release the platform's own tooling
 * constructs, a seed copied from the platform's committed fixture, and empty target roots under OS temp.
 * The assertions about the SOURCE side are made by snapshotting the whole disposable workspace before and
 * after: establishment may change the TARGET and nothing else.
 */
const INSTALLATION = {
  name: "b4b proof installation",
  repository: "https://example.invalid/b4b-proof",
};

/** The dependencies for one establishment, with a FIXED clock so a record is reproducible. */
function dependenciesFor(options: {
  payloadDirectory: string;
  seedDirectory: string;
  targetRoot: string;
  moment?: Date;
}) {
  const payload = new LocalReleaseSource({ payloadDirectory: options.payloadDirectory });
  const moment = options.moment ?? SYNTHETIC_ESTABLISHMENT_MOMENT;
  return {
    clock: { now: () => new Date(moment) },
    acquisition: payload,
    payload,
    seed: new DirectorySeedSource({ seedDirectory: options.seedDirectory }),
    target: new NodeInstallationTarget({
      root: options.targetRoot,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      protectedRoots: [options.payloadDirectory, options.seedDirectory],
    }),
    store: new NodeOperationalStateStore({
      root: options.targetRoot,
      file: operationalStateFileOf(options.targetRoot),
    }),
    hasher: { sha256Hex },
    // Determinism is asserted GIVEN the same injected entropy. Production establishment supplies
    // secure bytes; independent establishments therefore mint independent identities.
    entropy: { randomBytes: (byteLength: number) => Uint8Array.from({ length: byteLength }, (_, index) => index + 1) },
  };
}

/** Establish into a fresh target and require success, returning everything a caller may assert on. */
async function establish(options: {
  payloadDirectory: string;
  seedDirectory: string;
  targetRoot: string;
  moment?: Date;
}) {
  const outcome = await establishFoundationInstallation(
    {
      release: SYNTHETIC_RELEASE_IDENTITY,
      targetRoot: options.targetRoot,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      establishedBy: "FOUNDATION-B4B test",
      installation: INSTALLATION,
    },
    dependenciesFor(options),
  );
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
  if (!outcome.ok) throw new Error("unreachable");
  return outcome.result;
}

/** Establish and expect a refusal, returning it. */
async function refusalFor(options: {
  payloadDirectory: string;
  seedDirectory: string;
  targetRoot: string;
  release?: string;
}): Promise<FoundationEstablishmentOutcome> {
  const outcome = await establishFoundationInstallation(
    {
      release: options.release ?? SYNTHETIC_RELEASE_IDENTITY,
      targetRoot: options.targetRoot,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      establishedBy: "FOUNDATION-B4B test",
      installation: INSTALLATION,
    },
    dependenciesFor(options),
  );
  expect(outcome.ok, "establishment must have been refused").toBe(false);
  return outcome;
}

function readRecord(targetRoot: string): ReturnType<typeof parseInstallationOperationalState> {
  return parseInstallationOperationalState(
    JSON.parse(readFileSync(operationalStateFileOf(targetRoot), "utf8")) as unknown,
  );
}

describe("establishing an installation in a disposable target root", () => {
  it("creates a COMPLETE installation: the release's platform, the authored capsule, and both records", async () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();
    const workspace = disposableTree("foundation-b4b-workspace-");
    const targetRoot = path.join(workspace, "target");
    expect(snapshotTree(workspace).size).toBe(0);

    const result = await establish({ payloadDirectory: release.payloadDirectory, seedDirectory: seed, targetRoot });

    // THE PLATFORM, from the release: every payload file present at the installation root, byte-identical.
    // (The release's own manifest describes the content set rather than belonging to it, so establishment
    // deliberately does not copy it — the installation's records of what it runs are its own.)
    for (const entry of readdirSync(release.payloadDirectory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name !== RELEASE_MANIFEST_FILE_NAME) {
        expect(
          readFileSync(path.join(targetRoot, entry.name)),
          entry.name,
        ).toEqual(readFileSync(path.join(release.payloadDirectory, entry.name)));
      }
    }
    expect(existsSync(path.join(targetRoot, "src", "config", "deployment-root.ts"))).toBe(true);

    // THE AUTHORED MATERIAL, from the seed: verbatim inside the DECLARED Spoke root, which is the
    // establishment-time conversion from an ordinary one-website seed to an explicit EFS Installation.
    const capsule = targetCapsule(targetRoot);
    expect(readFileSync(path.join(capsule, "spokes", "main", "site.config.json"), "utf8")).toBe(
      readFileSync(path.join(seed, "site.config.json"), "utf8"),
    );
    expect(existsSync(path.join(capsule, "spokes", "main", "content", "pages", "markdown"))).toBe(true);
    const declarations = JSON.parse(readFileSync(path.join(capsule, "spokes.json"), "utf8")) as {
      spokes: { id: string; root: string }[];
    };
    expect(declarations.spokes).toEqual([{ id: "main", root: "spokes/main" }]);
    const efsManifest = JSON.parse(
      readFileSync(path.join(capsule, "efs", "manifest.json"), "utf8"),
    ) as { publications: { spokeId: string; spokeHubId?: string }[] };
    expect(efsManifest.publications.length).toBeGreaterThan(0);
    for (const publication of efsManifest.publications) {
      expect(publication.spokeId).toBe("main");
      expect(publication.spokeHubId).toBeUndefined();
    }

    // THE ADOPTION RECORD: this installation's own adoption of the release it runs, in the record's shape.
    const adoption = JSON.parse(readFileSync(path.join(capsule, "foundation-baseline.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(adoption).sort()).toEqual(["adoptedAt", "establishedBy", "release"]);
    expect(adoption.release).toEqual(result.release);
    expect(adoption.establishedBy).toBe("FOUNDATION-B4B test");

    // THE OPERATIONAL RECORD: the completion marker, describing an installation established from exactly
    // this release and this candidate.
    const record = readRecord(targetRoot);
    expect(record.schemaVersion).toBe(INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION);
    expect(installationActivationState(record)).toBe(INSTALLATION_ACTIVATION.ACTIVE);
    expect(installationIsEstablishedFrom(record, { release: result.release, candidate: result.candidate })).toBe(
      true,
    );
    expect(record.current.installationIdentity).toEqual(INSTALLATION);
    expect(record.current.lastAttempt?.kind).toBe("install");
    expect(record.current.lastAttempt?.outcome).toBe("succeeded");

    // ACTIVATION IS NOT HEALTH (FOUNDATION-B4B-A1): establishing files proves nothing about serving, so the
    // record says exactly what happened — the installation IS active (above), is NOT proven to be serving,
    // and has never been evaluated — and no `health-online` event was invented to say otherwise.
    expect(installationHealthOf(record)).toBe(INSTALLATION_HEALTH.OFFLINE);
    expect(record.current.healthEvaluatedAt).toBeNull();
    expect(record.history.map((event) => event.type)).not.toContain("health-online");

    // ONLY a real health evaluation — someone actually observing the established installation, later — can
    // make it ONLINE. Establishment itself never can, and never does.
    const evaluated = recordInstallationHealth(record, {
      health: INSTALLATION_HEALTH.ONLINE,
      at: "2099-01-02T00:00:00Z",
      detail: "the established installation answered a real request",
    });
    expect(installationHealthOf(evaluated)).toBe(INSTALLATION_HEALTH.ONLINE);
    expect(evaluated.current.healthEvaluatedAt).toBe("2099-01-02T00:00:00Z");
    expect(evaluated.history.map((event) => event.type)).toContain("health-online");
    // …and the record establishment wrote is untouched by that later evaluation: activation is what it
    // recorded, and the completion marker never claimed more.
    expect(installationHealthOf(record)).toBe(INSTALLATION_HEALTH.OFFLINE);

    // EVERY WRITTEN PATH addresses the installation root, relative and downward only.
    for (const file of result.writtenFiles) {
      expect(path.isAbsolute(file), file).toBe(false);
      expect(file.split("/"), file).not.toContain("..");
      expect(existsSync(path.join(targetRoot, ...file.split("/"))), file).toBe(true);
    }

    // NOTHING ELSE MOVED: the release directory, the seed and every sibling are byte-identical, because
    // the whole disposable workspace was empty before establishment and only the target changed.
    const after = snapshotTree(workspace);
    expect([...after.keys()].filter((key) => !key.startsWith("target/"))).toEqual([]);
  });

  it("is DETERMINISTIC: the same release and authored input produce the same identity and the same records", async () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();
    const workspace = disposableTree("foundation-b4b-determinism-");
    const firstRoot = path.join(workspace, "first");
    const secondRoot = path.join(workspace, "second");

    const first = await establish({ payloadDirectory: release.payloadDirectory, seedDirectory: seed, targetRoot: firstRoot });
    const second = await establish({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot: secondRoot,
    });

    expect(second.candidate).toEqual(first.candidate);
    expect(second.writtenFiles).toEqual(first.writtenFiles);

    // Byte-identical records: the clock is fixed, the encoding is fixed, and nothing else can vary.
    for (const relative of ["foundation-baseline.json", INSTALLATION_OPERATIONAL_STATE_FILE_NAME]) {
      expect(
        readFileSync(path.join(targetCapsule(secondRoot), relative), "utf8"),
        relative,
      ).toBe(readFileSync(path.join(targetCapsule(firstRoot), relative), "utf8"));
    }
  });

  it("refuses an unsafe target root, in every shape the rule has, before writing anything", async () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();

    // A target that already holds somebody's files.
    const occupied = disposableTree("foundation-b4b-occupied-");
    writeFileSync(path.join(occupied, "somebodys-notes.txt"), "not mine\n", "utf8");
    const cases: { label: string; targetRoot: string; expected: RegExp }[] = [
      { label: "occupied", targetRoot: occupied, expected: /not empty/ },
      {
        label: "the release directory",
        targetRoot: release.payloadDirectory,
        expected: /source establishment is reading/,
      },
      {
        label: "inside the seed",
        targetRoot: path.join(seed, "target"),
        expected: /inside the source establishment is reading/,
      },
      { label: "a filesystem root", targetRoot: path.parse(process.cwd()).root, expected: /filesystem root/ },
    ];

    for (const entry of cases) {
      const outcome = await refusalFor({
        payloadDirectory: release.payloadDirectory,
        seedDirectory: seed,
        targetRoot: entry.targetRoot,
      });
      if (outcome.ok) throw new Error("unreachable");
      expect(outcome.failure.category, entry.label).toBe("materialization");
      expect(outcome.refusals.join("\n"), entry.label).toMatch(entry.expected);
    }

    // …and an installation that already exists is never re-established, repaired or overwritten.
    const established = path.join(disposableTree("foundation-b4b-existing-"), "target");
    await establish({ payloadDirectory: release.payloadDirectory, seedDirectory: seed, targetRoot: established });
    const again = await refusalFor({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot: established,
    });
    if (again.ok) throw new Error("unreachable");
    expect(again.failure.category).toBe("materialization");
    expect(again.refusals.join("\n")).toMatch(/already holds an established Foundation installation/);
  });

  it("refuses a seed that cannot become a complete installation, and leaves the target untouched", async () => {
    const release = constructSyntheticRelease();
    const workspace = disposableTree("foundation-b4b-bad-seeds-");

    // A seed authored NEITHER way: it carries neither a root `site.config.json` (legacy implicit) nor a
    // `spokes.json` manifest (explicit). Since M20 that contradiction is refused by the ONE declaration
    // authority before any authored surface is looked for — there is no precedence rule and no implicit
    // Spoke to fall back to.
    const noConfig = syntheticSeed();
    rmSync(path.join(noConfig, "site.config.json"), { force: true });
    // A seed carrying GENERATED state, which would give the new installation a history it never had.
    const withRecord = syntheticSeed({ [INSTALLATION_OPERATIONAL_STATE_FILE_NAME]: '{ "schemaVersion": 1 }\n' });
    // A seed whose capsule does not keep the operational record out of version control.
    const noIgnore = syntheticSeed();
    rmSync(path.join(noIgnore, ".gitignore"), { force: true });
    // A configuration that is not a Foundation configuration.
    const invalidConfig = syntheticSeed();
    writeFileSync(path.join(invalidConfig, "site.config.json"), '{ "site": { "name": 42 } }\n', "utf8");
    // An EXPLICIT Installation that declares no EFS publication: it would establish with no production
    // runtime, so establishment refuses it instead of leaving an apparently complete but unusable target.
    const explicitNoEfs = syntheticSeed();
    const explicitRoot = path.join(explicitNoEfs, "spokes", "main");
    mkdirSync(explicitRoot, { recursive: true });
    for (const entry of ["site.config.json", "config", "content"]) {
      renameSync(path.join(explicitNoEfs, entry), path.join(explicitRoot, entry));
    }
    writeFileSync(
      path.join(explicitNoEfs, "spokes.json"),
      '{"spokes":[{"id":"main","root":"spokes/main"}]}\n',
      "utf8",
    );

    const cases: { label: string; seed: string; expected: RegExp }[] = [
      { label: "authored neither way", seed: noConfig, expected: /authored NEITHER way/ },
      { label: "carrying generated state", seed: withRecord, expected: /the seed contains operational-state\.json/ },
      { label: "no generated-state ignore rule", seed: noIgnore, expected: /does not ignore operational-state\.json/ },
      { label: "an invalid configuration", seed: invalidConfig, expected: /not a valid Foundation configuration/ },
      { label: "an explicit Installation without EFS", seed: explicitNoEfs, expected: /declares no efs\/manifest\.json/ },
    ];

    for (const [index, entry] of cases.entries()) {
      const targetRoot = path.join(workspace, `target-${index}`);
      const outcome = await refusalFor({
        payloadDirectory: release.payloadDirectory,
        seedDirectory: entry.seed,
        targetRoot,
      });
      if (outcome.ok) throw new Error("unreachable");
      expect(outcome.failure.category, entry.label).toBe("installation-validation");
      expect(
        `${outcome.failure.message}\n${outcome.refusals.join("\n")}`,
        entry.label,
      ).toMatch(entry.expected);
      // NOTHING WAS WRITTEN: the refusal came before materialisation, so no target and no record exist.
      expect(existsSync(targetRoot), entry.label).toBe(false);
    }
  });

  it("refuses bytes that are not the release they claim, and a release nobody asked for", async () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();

    // A payload whose bytes no longer match the manifest that describes it.
    writeFileSync(path.join(release.payloadDirectory, "README.md"), "tampered after construction\n", "utf8");
    const tampered = await refusalFor({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot: path.join(disposableTree("foundation-b4b-tampered-"), "target"),
    });
    if (tampered.ok) throw new Error("unreachable");
    expect(tampered.failure.category).toBe("release-resolution");
    expect(tampered.failure.message).toMatch(/does not hold the content/);

    // A directory holding a DIFFERENT release than the one requested: an acquisition source never
    // substitutes what it happens to have.
    const other = constructSyntheticRelease("provelopment-foundation-v20990102.0000");
    const wrong = await refusalFor({
      payloadDirectory: other.payloadDirectory,
      seedDirectory: seed,
      targetRoot: path.join(disposableTree("foundation-b4b-wrong-release-"), "target"),
    });
    if (wrong.ok) throw new Error("unreachable");
    expect(wrong.failure.category).toBe("release-resolution");
    expect(wrong.failure.message).toMatch(/holds .* not the requested/);
  });

  it("never claims success: a failure during materialisation leaves NO record and an unusable target", async () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeed();
    const workspace = disposableTree("foundation-b4b-partial-");
    const targetRoot = path.join(workspace, "target");

    // A materialisation that fails part-way, with one file already on disk.
    const halfWritten: FoundationInstallationTarget = {
      description: "a target that fails part-way",
      inspect: async () => [],
      write: async (files: readonly FoundationContentFile[]) => {
        const first = files[0];
        if (first === undefined) return;
        const absolute = path.join(targetRoot, ...first.path.split("/"));
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, first.bytes);
        throw new Error("the materialisation failed part-way through");
      },
    };

    const outcome = await establishFoundationInstallation(
      {
        release: SYNTHETIC_RELEASE_IDENTITY,
        targetRoot,
        capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
        establishedBy: "FOUNDATION-B4B test",
        installation: INSTALLATION,
      },
      {
        ...dependenciesFor({ payloadDirectory: release.payloadDirectory, seedDirectory: seed, targetRoot }),
        target: halfWritten,
      },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.failure.category).toBe("materialization");
    // The completion marker was never written, so the target cannot be mistaken for a successful
    // installation…
    expect(existsSync(operationalStateFileOf(targetRoot))).toBe(false);
    // …and establishment refuses to run again over it, rather than repairing or overwriting it.
    const again = await refusalFor({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot,
    });
    if (again.ok) throw new Error("unreachable");
    expect(again.refusals.join("\n")).toMatch(/not empty/);
  });

  it("is SELF-CONTAINED: an installation of the REAL platform runs its own tooling and names no source", async () => {
    const repositoryRoot = process.cwd();
    const payloadDirectory = path.join(disposableTree("foundation-b4b-real-release-"), "payload");

    // TWO CONTEXTS, ONE SUBJECT (M22 §6.5). This work tree is either a SOURCE checkout — where the
    // accepted revision is HEAD and a release is cut from it — or a MATERIALISED RELEASE, created with
    // `git init && git add -A` (the documented consumer recipe), which has an index but NO commit. The
    // release proves itself there without inventing history: its own manifest names the source commit and
    // tree its content came from, so the release is re-constructed FROM ITS INDEX and its content must
    // still match the digest the manifest states. A release that carries no manifest is refused loudly by
    // that call rather than silently falling back to a commit that does not exist.
    if (existsSync(path.join(repositoryRoot, RELEASE_MANIFEST_FILE_NAME))) {
      constructReleaseFromWorkTree({
        sourceRepository: repositoryRoot,
        release: SYNTHETIC_RELEASE_IDENTITY,
        destination: payloadDirectory,
      });
    } else {
      const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
      constructRelease({
        sourceRepository: repositoryRoot,
        revision: commit,
        release: SYNTHETIC_RELEASE_IDENTITY,
        destination: payloadDirectory,
      });
    }
    const seed = syntheticSeed();
    const workspace = disposableTree("foundation-b4b-real-");
    const targetRoot = path.join(workspace, "target");
    const sources = snapshotTree(payloadDirectory);

    const outcome = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory,
      seedDirectory: seed,
      targetRoot,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      installationName: "b4b self-contained proof",
      installationRepository: "https://example.invalid/b4b-self-contained",
      establishedBy: "FOUNDATION-B4B test",
    });
    expect(outcome.ok, JSON.stringify(outcome)).toBe(true);

    // NOTHING IN IT NAMES WHERE IT CAME FROM: not the platform it was built from, not the release it was
    // acquired from, not the authored capsule it was seeded with.
    const needles = [repositoryRoot, payloadDirectory, seed].map((entry) => path.resolve(entry));
    const offenders: string[] = [];
    for (const [relative, base64] of snapshotTree(targetRoot)) {
      const text = Buffer.from(base64, "base64").toString("utf8");
      for (const needle of needles) {
        if (text.includes(needle)) offenders.push(`${relative} names ${needle}`);
      }
    }
    expect(offenders).toEqual([]);

    // IT RUNS THE PLATFORM'S OWN TOOLING FROM ITS OWN ROOT: the runtime asset mirror is generated inside
    // the installation, from the installation's own capsule, and verified byte-identical — with no
    // dependency on the source installation, which is not even referenced in this command.
    const run = (args: readonly string[]): string =>
      execFileSync(process.execPath, [...args], { cwd: targetRoot, encoding: "utf8" });
    run(["scripts/sync-runtime-assets.mjs"]);
    expect(run(["scripts/sync-runtime-assets.mjs", "--check"])).toMatch(/runtime asset mirror OK/);
    expect(existsSync(path.join(targetRoot, "public", "assets"))).toBe(true);

    // The sources establishment READ are byte-identical: it wrote the target and nothing else.
    expect(snapshotTree(payloadDirectory)).toEqual(sources);
  });
});

/**
 * AN EXISTING INSTALLATION'S CAPSULE IS A VALID SEED (FOUNDATION-B4B-A2)
 * ====================================================================
 *
 * The documented procedure seeds an establishment with an established installation's own capsule
 * (`--seed deployment`), and such a capsule carries that installation's adoption record. A fixture without
 * that expected file is what let the duplicate-path failure reach a released amendment, so these proofs use
 * a seed that really contains one: the record must be recognized, excluded from the PORTABLE authored
 * material (from the authored digest and from the target), and replaced by the target's own record, written
 * freshly from the release being established — with the source left exactly as it was.
 */
describe("an existing installation's capsule as a seed", () => {
  it("establishes, writing ONE new adoption record and leaving the source's own untouched", async () => {
    const release = constructSyntheticRelease();
    const seed = syntheticSeedFromExistingInstallation();
    const sourceRecord = readFileSync(path.join(seed, INSTALLATION_ADOPTION_RECORD_FILE_NAME), "utf8");
    const sourcesBefore = snapshotTree(seed);
    const workspace = disposableTree("foundation-b4b-existing-capsule-");
    const targetRoot = path.join(workspace, "target");

    const result = await establish({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot,
    });

    // WHAT DID NOT TRAVEL IS REPORTED, so an operator never has to guess what their seed contributed.
    expect(result.notInherited).toEqual([
      `${INSTALLATION_CAPSULE_RELATIVE_PATH}/${INSTALLATION_ADOPTION_RECORD_FILE_NAME}`,
    ]);

    // EXACTLY ONE adoption record exists in the installation — no duplicate path, no second copy anywhere.
    const records: string[] = [];
    const walk = (directory: string, prefix: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
        else if (entry.name === INSTALLATION_ADOPTION_RECORD_FILE_NAME) records.push(relative);
      }
    };
    walk(targetRoot, "");
    expect(records).toEqual([
      `${INSTALLATION_CAPSULE_RELATIVE_PATH}/${INSTALLATION_ADOPTION_RECORD_FILE_NAME}`,
    ]);

    // …and it describes the release established HERE. The source's release is deliberately a DIFFERENT one,
    // so this cannot pass because two equal records happened to look alike.
    const recordPath = path.join(targetCapsule(targetRoot), INSTALLATION_ADOPTION_RECORD_FILE_NAME);
    const established = JSON.parse(readFileSync(recordPath, "utf8")) as {
      release: { tag: string; commit: string };
    };
    expect(established.release).toEqual(result.release);
    expect(established.release.tag).toBe(SYNTHETIC_RELEASE_IDENTITY);
    expect(established.release.tag).not.toBe(SYNTHETIC_SOURCE_RELEASE.tag);
    expect(readFileSync(recordPath, "utf8")).not.toBe(sourceRecord);

    // NOTHING IN THE INSTALLATION INHERITED THE SOURCE'S ADOPTION: not its release, not its provenance.
    const inherited: string[] = [];
    for (const [relative, base64] of snapshotTree(targetRoot)) {
      const text = Buffer.from(base64, "base64").toString("utf8");
      if (text.includes(SYNTHETIC_SOURCE_RELEASE.tag) || text.includes(SYNTHETIC_SOURCE_RELEASE.commit)) {
        inherited.push(relative);
      }
    }
    expect(inherited).toEqual([]);

    // THE SOURCE IS EXACTLY AS IT WAS: establishment reads it, never modifies it and never deletes it.
    expect(snapshotTree(seed)).toEqual(sourcesBefore);
  });

  it("keeps the source's records out of the candidate identity, and still reflects authored changes", async () => {
    const release = constructSyntheticRelease();
    const targetFor = (suffix: string): string =>
      path.join(disposableTree(`foundation-b4b-portable-${suffix}-`), "target");

    // The SAME capsule, three ways: no record at all, one source record, and a source record with entirely
    // different provenance. Were the source's record part of the authored material, these would differ.
    const withoutRecord = await establish({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: syntheticSeed(),
      targetRoot: targetFor("a"),
    });
    const withRecord = await establish({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: syntheticSeedFromExistingInstallation(),
      targetRoot: targetFor("b"),
    });
    const otherRecord = await establish({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: syntheticSeedFromExistingInstallation({
        record: syntheticSourceAdoptionRecordText({
          tag: "provelopment-foundation-v20990103.0000",
          adoptedAt: "2097-06-01T12:00:00+02:00",
          establishedBy: "a different work order",
        }),
      }),
      targetRoot: targetFor("c"),
    });
    expect(withRecord.candidate.authored).toBe(withoutRecord.candidate.authored);
    expect(otherRecord.candidate.authored).toBe(withoutRecord.candidate.authored);
    expect(withRecord.candidate.materialized).toBe(withoutRecord.candidate.materialized);
    expect(otherRecord.candidate.materialized).toBe(withoutRecord.candidate.materialized);

    // But REAL authored capsule material does move the identity — the exclusion is a rule, not a hole.
    const changed = await establish({
      payloadDirectory: release.payloadDirectory,
      seedDirectory: syntheticSeedFromExistingInstallation({
        extra: { "content/pages/markdown/extra.md": "# Extra\n" },
      }),
      targetRoot: targetFor("d"),
    });
    expect(changed.candidate.authored).not.toBe(withoutRecord.candidate.authored);
    expect(changed.candidate.materialized).not.toBe(withoutRecord.candidate.materialized);
  });
});
