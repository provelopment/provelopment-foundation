import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// These suites SPAWN GIT AND REAL NODE PROCESSES — synthetic repositories, release construction, an
// establishment through the command line — and a loaded CI runner is an order of magnitude slower than a
// developer machine. The budget is raised here, measured rather than guessed; nothing in the platform waits,
// retries or inflates anything.
vi.setConfig({ testTimeout: 60_000 });

import { establishFoundationInstallation } from "@/application/establish-foundation-installation";
import { DirectorySeedSource } from "@/adapters/installation/directory-seed-source";
import { LocalReleaseSource } from "@/adapters/installation/local-release-source";
import { sha256Hex } from "@/adapters/installation/node-content-files";
import { NodeInstallationTarget } from "@/adapters/installation/node-installation-target";
import { NodeOperationalStateStore } from "@/adapters/installation/node-operational-state-store";
import {
  installationActivationState,
  INSTALLATION_ACTIVATION,
  INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION,
  parseInstallationOperationalState,
} from "@/core/foundation-installation/index";
// The record's file name is asked of the platform's own authority, exactly as the establishment fixture does.
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";

import { classifyReleasePath } from "../../scripts/release/release-content-policy.mjs";
import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../support/production-state-manifest";
import {
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  constructSyntheticRelease,
  disposableTree,
  operationalStateFileOf,
  snapshotTree,
  SYNTHETIC_ESTABLISHMENT_MOMENT,
  SYNTHETIC_RELEASE_IDENTITY,
  syntheticSeed,
  targetCapsule,
} from "../support/installation-establishment-fixture";

/**
 * THE OPERATIONAL RECORD IS GENERATED STATE, AND PROVED SO (FOUNDATION-B4B)
 * =======================================================================
 *
 * B4B writes `operational-state.json` for the first time, and B4A's acceptance requirement is that a
 * generated operational record must NEVER become authored, version-controlled source state. That is proved
 * here mechanically, four different ways, because prose is not a proof:
 *
 *   1. the release content policy classifies the record's path as EXCLUDED — no release can carry one;
 *   2. version control IGNORES it inside an established installation, so writing or changing it cannot dirty
 *      authored state, and a health evaluation can never become a commit;
 *   3. the authored-state manifest (the same one both Vitest projects run against the real deployment) does
 *      NOT drift when the record is written;
 *   4. the record is INSTALLATION-LOCAL: the store refuses a location outside the installation root, and
 *      establishing one installation writes a record ONLY into the target it establishes — the release
 *      payload and the seed it read stay byte-identical, each carrying no record of its own. The runner's
 *      own directory is NOT an establishment source, and the contract is asserted in BOTH a source checkout
 *      and an established installation, so the answer cannot depend on ambient context (FOUNDATION-B4B-A3).
 *
 * A fifth proof lives in `tests/architecture/write-ownership-guard.test.ts`: `src/**` now contains exactly
 * two writers, this store being one, each with the ONE domain it owns.
 */
const INSTALLATION = { name: "b4b operational proof", repository: "https://example.invalid/b4b-operational" };

/**
 * Establish into a fresh disposable target with a fixed clock, and return the ACTUAL sources the act read —
 * each snapshotted BEFORE the act, so "unchanged" is proved against what those sources really were rather
 * than against a re-reading that could hide a mutation.
 */
async function establishedTarget(): Promise<{
  targetRoot: string;
  payloadDirectory: string;
  seed: string;
  payloadBefore: Map<string, string>;
  seedBefore: Map<string, string>;
}> {
  const release = constructSyntheticRelease();
  const seed = syntheticSeed();
  const payloadBefore = snapshotTree(release.payloadDirectory);
  const seedBefore = snapshotTree(seed);
  const targetRoot = path.join(disposableTree("foundation-b4b-record-"), "target");
  const payload = new LocalReleaseSource({ payloadDirectory: release.payloadDirectory });
  const outcome = await establishFoundationInstallation(
    {
      release: SYNTHETIC_RELEASE_IDENTITY,
      targetRoot,
      capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
      establishedBy: "FOUNDATION-B4B test",
      installation: INSTALLATION,
    },
    {
      clock: { now: () => new Date(SYNTHETIC_ESTABLISHMENT_MOMENT) },
      acquisition: payload,
      payload,
      seed: new DirectorySeedSource({ seedDirectory: seed }),
      target: new NodeInstallationTarget({
        root: targetRoot,
        capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
        protectedRoots: [release.payloadDirectory, seed],
      }),
      store: new NodeOperationalStateStore({
        root: targetRoot,
        file: operationalStateFileOf(targetRoot),
      }),
      hasher: { sha256Hex },
      entropy: { randomBytes: (byteLength: number) => Uint8Array.from({ length: byteLength }, (_, index) => index + 1) },
    },
  );
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
  return { targetRoot, payloadDirectory: release.payloadDirectory, seed, payloadBefore, seedBefore };
}

/** Every operational record found beneath a tree, by root-relative POSIX path — where it was written, and where not. */
function operationalRecordsIn(root: string): string[] {
  return [...snapshotTree(root).keys()].filter(
    (relative) =>
      relative === INSTALLATION_OPERATIONAL_STATE_FILE_NAME ||
      relative.endsWith(`/${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}`),
  );
}

/**
 * THE ESTABLISHMENT OWNERSHIP CONTRACT (FOUNDATION-B4B-A3), asserted identically in EVERY runner context.
 *
 * The act's sources are explicit — a release payload, a seed and a target — and its ownership is exactly
 * that: operational state is created and managed ONLY inside the target installation it establishes, while
 * the payload and the seed it read stay byte-identical and carry no record of their own. The directory the
 * test runner happens to sit in is NOT a source and is not part of this contract, which is why nothing here
 * reads `process.cwd()`: an existing installation may legitimately own its own operational record.
 */
async function assertEstablishmentOwnsOnlyItsTarget(): Promise<string> {
  const { targetRoot, payloadDirectory, seed, payloadBefore, seedBefore } = await establishedTarget();

  // The record exists EXACTLY ONCE, inside the installation it describes …
  expect(operationalRecordsIn(targetRoot)).toEqual([
    `${INSTALLATION_CAPSULE_RELATIVE_PATH}/${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}`,
  ]);
  // … it exists in NEITHER of the sources the act read …
  expect(operationalRecordsIn(payloadDirectory)).toEqual([]);
  expect(operationalRecordsIn(seed)).toEqual([]);
  // … and both sources are byte-identical to what they were BEFORE the act.
  expect(snapshotTree(payloadDirectory)).toEqual(payloadBefore);
  expect(snapshotTree(seed)).toEqual(seedBefore);
  return targetRoot;
}

describe("the operational record is generated state, never authored state", () => {
  it("is classified OUT of every Foundation release", () => {
    // The record lives at `<capsule>/operational-state.json`; the policy answers for a repository path,
    // which is where it would appear if it were ever tracked.
    const decision = classifyReleasePath(`${INSTALLATION_CAPSULE_RELATIVE_PATH}/operational-state.json`);
    expect(decision.inclusion).toBe("excluded");
  });

  it("is IGNORED by version control inside an established installation", async () => {
    const { targetRoot } = await establishedTarget();
    const record = path.relative(targetRoot, operationalStateFileOf(targetRoot)).split(path.sep).join("/");

    const git = (args: readonly string[]): string =>
      execFileSync("git", [...args], { cwd: targetRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "-q"]);
    git(["add", "-A"]);
    git(["-c", "user.name=owner", "-c", "user.email=owner@example.invalid", "commit", "-q", "-m", "installation"]);

    // The authoritative answer: version control says the record is ignored…
    expect(git(["check-ignore", "-v", record])).toContain("operational-state.json");
    // …it is NOT among the installation's tracked files, while its authored capsule IS.
    const tracked = git(["ls-files"]);
    expect(tracked).not.toContain("operational-state.json");
    expect(tracked).toContain("site.config.json");
  });

  it("does not drift the installation's authored state when it is written", async () => {
    const { targetRoot } = await establishedTarget();
    const capsule = targetCapsule(targetRoot);
    const before = captureProductionStateManifest(capsule);

    // A later lifecycle operation rewrites the record — exactly what a health evaluation will do — and the
    // authored state of the installation does not move.
    const file = operationalStateFileOf(targetRoot);
    const stored = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, `${JSON.stringify({ ...stored, touchedBy: "b4b operational proof" }, null, 2)}\n`, "utf8");

    expect(productionStateDrift(before, captureProductionStateManifest(capsule))).toEqual([]);
  });

  it("is INSTALLATION-LOCAL: the store refuses a location outside the installation root", async () => {
    const { targetRoot } = await establishedTarget();
    const elsewhere = path.join(disposableTree("foundation-b4b-elsewhere-"), "operational-state.json");
    expect(() => new NodeOperationalStateStore({ root: targetRoot, file: elsewhere })).toThrow(
      /INSTALLATION-LOCAL/,
    );
    expect(existsSync(elsewhere)).toBe(false);
  });

  it("describes ONE COMPLETE installation, in schema version 1, and nothing below the installation", async () => {
    const { targetRoot } = await establishedTarget();
    const record = parseInstallationOperationalState(
      JSON.parse(readFileSync(operationalStateFileOf(targetRoot), "utf8")) as unknown,
    );

    expect(record.schemaVersion).toBe(INSTALLATION_OPERATIONAL_STATE_SCHEMA_VERSION);
    expect(installationActivationState(record)).toBe(INSTALLATION_ACTIVATION.ACTIVE);
    expect(record.current.installationIdentity).toEqual(INSTALLATION);
    // The subject is the installation: no spoke, no Site, no locale and no other installation is described.
    expect(JSON.stringify(record)).not.toMatch(/spokes|sibling|parent|clone|fleet|otherInstallation/);

    // It names the release it runs, and the exact revision that became live.
    expect(record.current.live?.release.tag).toBe(SYNTHETIC_RELEASE_IDENTITY);
    expect(record.current.live?.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    // It is written ONCE, carrying the whole establishment in its history — and NOT a health claim: the
    // installation was activated, not evaluated (FOUNDATION-B4B-A1).
    expect(record.history.map((event) => event.type)).toEqual([
      "attempt-started",
      "candidate-prepared",
      "candidate-validated",
      "candidate-staged",
      "candidate-inspected",
      "promoted",
    ]);
    expect(record.current.health).toBe("offline");
    expect(record.current.healthEvaluatedAt).toBeNull();
  });

  it("writes operational state only to the target, and leaves the release and seed sources intact", async () => {
    // A. FOUNDATION SOURCE / RELEASE CONTEXT — the contract as an ordinary checkout or bare release proves it.
    await assertEstablishmentOwnsOnlyItsTarget();
  });

  /**
   * THE RUNNER MAY ITSELF BE AN ESTABLISHED INSTALLATION (FOUNDATION-B4B-A3)
   *
   * This suite ships inside every release, so it is also run FROM an installation — a directory that
   * legitimately owns `deployment/operational-state.json` of its own. That record belongs to the runner
   * installation and has nothing to do with any target being established, so the contract is asserted again
   * with the runner's own established installation as the current directory. The answer must be the one a
   * source checkout gives; it must never depend on ambient context. (The defect this proves against: an
   * assertion that read `process.cwd()` as if it were an establishment source.)
   */
  it("holds the same ownership contract when the runner is itself an established installation", async () => {
    // B. ESTABLISHED INSTALLATION CONTEXT — a disposable installation, so no developer's own state is involved.
    const runner = await establishedTarget();
    const runnerRecord = operationalStateFileOf(runner.targetRoot);
    const recordBefore = readFileSync(runnerRecord, "utf8");

    const previous = process.cwd();
    process.chdir(runner.targetRoot);
    try {
      // The runner's own record is legitimately present in the context this suite now executes in …
      expect(existsSync(operationalStateFileOf(process.cwd()))).toBe(true);
      // … and the establishment contract answers identically here: target-local state, sources untouched.
      await assertEstablishmentOwnsOnlyItsTarget();
      // The runner installation's own record is neither consulted nor rewritten by establishing something else.
      expect(readFileSync(runnerRecord, "utf8")).toBe(recordBefore);
    } finally {
      process.chdir(previous);
    }
  });

  it("cannot be repaired by the store: a corrupt record is returned as stored and refused by the domain", async () => {
    const { targetRoot } = await establishedTarget();
    const file = operationalStateFileOf(targetRoot);
    writeFileSync(file, '{ "schemaVersion": 1, "current": { "health": "online" } }\n', "utf8");

    const store = new NodeOperationalStateStore({ root: targetRoot, file });
    // Validation belongs to the domain, not to storage: the store hands back exactly what is stored …
    expect(await store.read()).toEqual({ schemaVersion: 1, current: { health: "online" } });
    // … and the domain refuses it, so a corrupt record is never mistaken for a running installation.
    expect(() => parseInstallationOperationalState({ schemaVersion: 1, current: { health: "online" } })).toThrow();
  });
});
