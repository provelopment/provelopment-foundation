import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { EfsPublicationDeclaration } from "@/config/efs/manifest";
import { publicationOwnerInInstallation } from "@/config/efs/owner";
import { installationRuntimeIndex } from "@/config/installation-runtime";

import { materializeEfsInstallation, type DisposableEfsInstallation } from "../support/efs-installation";

const owned: DisposableEfsInstallation[] = [];
afterEach(() => {
  for (const installation of owned.splice(0)) installation.cleanup();
});

function install(spec: Parameters<typeof materializeEfsInstallation>[0]) {
  const installation = materializeEfsInstallation(spec);
  owned.push(installation);
  return installationRuntimeIndex(installation.root);
}

function publication(
  id: string,
  spokeId: string,
  spokeHubId?: string,
): EfsPublicationDeclaration {
  return {
    id,
    spokeId,
    ...(spokeHubId === undefined ? {} : { spokeHubId }),
    entityId: "e_00000000000000000000000000",
    facetId: "acme",
    bindings: [],
  };
}

describe("EFS publication owner against a real declared Spoke hierarchy (R05)", () => {
  it("resolves a declared Spoke, including a Spoke no host-routing entry names", () => {
    const index = install({ mode: "flat", spokes: ["declared-spoke", "other-spoke"] });
    const resolved = publicationOwnerInInstallation(index, publication("p", "declared-spoke"));
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind === "resolved") {
      expect(resolved.context.id).toBe("declared-spoke");
      expect(resolved.context.spokeHubId).toBeUndefined();
    }
  });

  it("refuses a reserved implicit owner and any undeclared Spoke", () => {
    const index = install({ mode: "flat", spokes: ["declared-spoke"] });
    for (const owner of ["implicit", "absent-spoke"]) {
      const resolved = publicationOwnerInInstallation(index, publication("p", owner));
      expect(resolved.kind, owner).toBe("refused");
      if (resolved.kind === "refused") {
        expect(resolved.reason).toBe("publication-names-an-undeclared-spoke");
      }
    }
  });

  it("keeps two Hubs' identical local Spoke ids isolated by composite identity", () => {
    const index = install({
      mode: "hubs",
      hubs: [
        { id: "hub-one", spokes: ["docs"] },
        { id: "hub-two", spokes: ["docs"] },
      ],
    });

    const one = publicationOwnerInInstallation(index, publication("one", "docs", "hub-one"));
    const two = publicationOwnerInInstallation(index, publication("two", "docs", "hub-two"));
    expect(one.kind).toBe("resolved");
    expect(two.kind).toBe("resolved");
    if (one.kind === "resolved" && two.kind === "resolved") {
      expect(one.context.spokeHubId).toBe("hub-one");
      expect(two.context.spokeHubId).toBe("hub-two");
      expect(one.context.runtimeSegment).not.toBe(two.context.runtimeSegment);
    }

    const missingHub = publicationOwnerInInstallation(index, publication("none", "docs"));
    expect(missingHub.kind).toBe("refused");
    if (missingHub.kind === "refused") {
      expect(missingHub.reason).toBe("publication-names-the-wrong-spoke-hub");
    }

    const wrongHub = publicationOwnerInInstallation(
      index,
      publication("wrong", "docs", "hub-three"),
    );
    expect(wrongHub.kind).toBe("refused");
  });

  it("refuses every publication when the Installation declares no explicit hierarchy", () => {
    const installation = materializeEfsInstallation({ mode: "flat", spokes: ["declared-spoke"] });
    owned.push(installation);
    // Convert the explicit copy back to the legacy shape: root configuration + root content.
    const spokeRoot = join(installation.root, "spokes", "declared-spoke");
    cpSync(join(spokeRoot, "site.config.json"), join(installation.root, "site.config.json"));
    cpSync(join(spokeRoot, "config"), join(installation.root, "config"), { recursive: true });
    cpSync(join(spokeRoot, "content"), join(installation.root, "content"), { recursive: true });
    rmSync(join(installation.root, "spokes.json"));
    const legacy = installationRuntimeIndex(installation.root);
    expect(legacy.mode).toBe("legacy");
    const resolved = publicationOwnerInInstallation(legacy, publication("p", "declared-spoke"));
    expect(resolved.kind).toBe("refused");
    if (resolved.kind === "refused") {
      expect(resolved.reason).toBe("installation-has-no-explicit-spoke-hierarchy");
    }
  });
});
