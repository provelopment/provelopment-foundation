import { describe, expect, it, vi } from "vitest";

import { cpSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.setConfig({ testTimeout: 60_000 });

import { establishInstallationFromDirectories } from "@/adapters/installation/establish";
import { isEntityId } from "@/core/efs/identity";
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";
import {
  INSTALLATION_CAPSULE_RELATIVE_PATH,
  SYNTHETIC_RELEASE_IDENTITY,
  constructSyntheticRelease,
  disposableTree,
  syntheticSeed,
  targetCapsule,
} from "../support/installation-establishment-fixture";

const release = () => constructSyntheticRelease();

async function establish(seedDirectory: string, name: string) {
  const payload = release();
  const outcome = await establishInstallationFromDirectories({
    release: SYNTHETIC_RELEASE_IDENTITY,
    payloadDirectory: payload.payloadDirectory,
    seedDirectory,
    targetRoot: disposableTree("foundation-r06-identity-target-"),
    capsuleDirectory: INSTALLATION_CAPSULE_RELATIVE_PATH,
    installationName: name,
    installationRepository: `https://example.invalid/${name}`,
    establishedBy: "FOUNDATION-EFS-S3E3-R06",
  });
  expect(
    outcome.ok,
    outcome.ok ? "" : [outcome.failure.message, ...outcome.refusals].join(" | "),
  ).toBe(true);
  if (!outcome.ok) throw new Error("unreachable");
  const capsule = targetCapsule(outcome.result.targetRoot);
  const manifestText = readFileSync(path.join(capsule, "efs", "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as { entities: { id: string }[] };
  return { capsule, manifestText, entityId: manifest.entities[0].id };
}

describe("ordinary establishment mints permanent, independent Entity identities (R06)", () => {
  it("mints distinct valid identities for two independent websites", async () => {
    const first = await establish(syntheticSeed(), "r06-first");
    const second = await establish(syntheticSeed(), "r06-second");

    expect(isEntityId(first.entityId)).toBe(true);
    expect(isEntityId(second.entityId)).toBe(true);
    expect(first.entityId).not.toBe(second.entityId);
    expect(first.manifestText).toContain(first.entityId);
    expect(second.manifestText).toContain(second.entityId);
  });

  it("preserves the identity and declarations when the Entity moves to another Installation", async () => {
    const source = await establish(syntheticSeed(), "r06-source");
    const portable = disposableTree("foundation-r06-portable-");
    cpSync(source.capsule, portable, {
      recursive: true,
      filter: (entry) => path.basename(entry) !== INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
    });
    const moved = await establish(portable, "r06-moved");

    expect(moved.entityId).toBe(source.entityId);
    expect(moved.manifestText).toBe(source.manifestText);
    expect(moved.capsule).not.toBe(source.capsule);
  });
});
