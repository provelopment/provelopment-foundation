import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installationSpokes, resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import { runtimeSegmentForIdentifiedSpokeRef } from "@/config/spoke-runtime-segment.mjs";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";

/**
 * ONE DECLARATION AUTHORITY: THE BUILD SEAM AND S3C1 AGREE BY CONSTRUCTION
 * =======================================================================
 *
 * `src/config/spoke-roots.ts` (the S3C1 configuration authority the domain/composition layer reads) and
 * `src/config/deployment-build.mjs` (the build's selection seam) must answer the SAME question — "which
 * Spokes does this Installation root declare, and where is each one authored?" — and must therefore agree
 * about every manifest: a build that selected a root the configuration/domain layer would refuse could
 * serve material the platform considers invalid.
 *
 * They are not two implementations tested for agreement: the contract lives ONCE, in
 * `src/config/spoke-declarations.mjs`, and both sides consume it (identity semantics come from the pure
 * domain, `src/core/spoke/spoke-id.mjs`). This suite proves that AT THE SEAM: for every refused case the
 * two answers must not merely both fail, they must fail with the SAME message — the strongest available
 * evidence that there is one authority rather than two that happen to match today.
 *
 * The cases cover every property of the accepted declared-Spoke/root contract: manifest shape, identity
 * semantics, locator rules, physical containment and duplicate-root refusal.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/** A disposable Installation root; every tree is removed in `afterAll`. */
function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** A DECLARED Spoke root: a directory carrying the root-level `site.config.json` contract. */
function authoredSpoke(root: string, locator: string): string {
  const directory = path.join(root, ...locator.split("/"));
  write(path.join(directory, "site.config.json"), JSON.stringify({ site: { name: locator } }));
  return directory;
}

/** Writes `spokes.json` (the explicit authored form) with the given entries. */
function declare(root: string, entries: readonly Record<string, unknown>[]): void {
  write(path.join(root, "spokes.json"), JSON.stringify({ spokes: entries }, null, 2));
}

/** The LEGACY authored form: the root's own `site.config.json`, and no manifest. */
function authoredLegacy(root: string): void {
  write(path.join(root, "site.config.json"), "{}");
}

/** The message each side reports, or `null` when it accepts. */
function answers(root: string): { readonly build: string | null; readonly authority: string | null } {
  const capture = (run: () => unknown): string | null => {
    try {
      run();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  return {
    build: capture(() => installationSpokes(root)),
    authority: capture(() => resolveInstallationSpokeRoots(root)),
  };
}

const linkType = (): "junction" | "dir" => (process.platform === "win32" ? "junction" : "dir");

/** One refused declaration shape per property of the accepted contract. */
const REFUSED: readonly { readonly name: string; readonly fixture: (root: string) => void }[] = [
  {
    name: "a blank id",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "   ", root: "spokes/one" }]);
    },
  },
  {
    name: 'the reserved explicit id "implicit"',
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "implicit", root: "spokes/one" }]);
    },
  },
  {
    name: "a PADDED reserved identity (padding cannot launder it)",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: " implicit ", root: "spokes/one" }]);
    },
  },
  {
    name: "duplicate Spoke ids",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      authoredSpoke(root, "spokes/two");
      declare(root, [
        { id: "one", root: "spokes/one" },
        { id: "one", root: "spokes/two" },
      ]);
    },
  },
  {
    name: "an unknown MANIFEST field",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      write(
        path.join(root, "spokes.json"),
        JSON.stringify({ spokes: [{ id: "one", root: "spokes/one" }], label: "One" }),
      );
    },
  },
  {
    name: "an unknown DECLARATION field (membership and location only)",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one", root: "spokes/one", name: "One" }]);
    },
  },
  {
    name: "a non-string id",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: 1, root: "spokes/one" }]);
    },
  },
  {
    name: "a missing root leaf",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one" }]);
    },
  },
  {
    name: "an ABSOLUTE locator",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one", root: path.join(root, "spokes", "one") }]);
    },
  },
  {
    name: "a BACKSLASH locator (POSIX only)",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one", root: "spokes\\one" }]);
    },
  },
  {
    name: 'a ".." locator',
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one", root: "spokes/../escape" }]);
    },
  },
  {
    name: "a locator OUTSIDE the dedicated namespace",
    fixture: (root) => {
      write(path.join(root, "config", "site.config.json"), "{}");
      declare(root, [{ id: "one", root: "config" }]);
    },
  },
  {
    name: "the spokes/ CONTAINER itself",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one", root: "spokes" }]);
    },
  },
  {
    name: "a MISSING declared root",
    fixture: (root) => declare(root, [{ id: "one", root: "spokes/absent" }]),
  },
  {
    name: "a declared root that is a FILE",
    fixture: (root) => {
      write(path.join(root, "spokes", "one"), "not a directory");
      declare(root, [{ id: "one", root: "spokes/one" }]);
    },
  },
  {
    name: "a declared root with no site.config.json",
    fixture: (root) => {
      mkdirSync(path.join(root, "spokes", "one"), { recursive: true });
      declare(root, [{ id: "one", root: "spokes/one" }]);
    },
  },
  {
    name: "two declarations that reach ONE physical root (different spellings)",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declare(root, [
        { id: "one", root: "spokes/one" },
        { id: "two", root: "spokes/one/" },
      ]);
    },
  },
  {
    name: "a link out of spokes/ that leaves the INSTALLATION",
    fixture: (root) => {
      const outside = authoredSpoke(tempTree("foundation-parity-outside-"), "elsewhere/spoke");
      mkdirSync(path.join(root, "spokes"), { recursive: true });
      symlinkSync(outside, path.join(root, "spokes", "escaped"), linkType());
      declare(root, [{ id: "escaped", root: "spokes/escaped" }]);
    },
  },
  {
    name: "a link inside spokes/ that reaches material elsewhere in the Installation",
    fixture: (root) => {
      const elsewhere = authoredSpoke(root, "authoring/site-one");
      mkdirSync(path.join(root, "spokes"), { recursive: true });
      symlinkSync(elsewhere, path.join(root, "spokes", "linked"), linkType());
      declare(root, [{ id: "linked", root: "spokes/linked" }]);
    },
  },
];

/** A disposable root prepared by `fixture`, with both answers about it. */
function on(
  prefix: string,
  fixture: (root: string) => void,
): {
  readonly root: string;
  readonly build: string | null;
  readonly authority: string | null;
} {
  const root = tempTree(prefix);
  fixture(root);
  return { root, ...answers(root) };
}

describe("build selection and S3C1 refuse the SAME declarations, in the SAME words", () => {
  for (const testCase of REFUSED) {
    it(`refuses ${testCase.name}`, () => {
      const { build, authority } = on("foundation-parity-refuse-", testCase.fixture);

      expect(build, "the build selection seam must refuse").not.toBeNull();
      expect(authority, "the S3C1 authority must refuse").not.toBeNull();
      // ONE implementation, so the refusal is literally the same sentence: there is no drift to detect, and
      // no build can select a declared root the configuration/domain layer would reject.
      expect(build).toBe(authority);
    });
  }

  it("refuses an Installation root authored NEITHER way, and one authored BOTH ways", () => {
    const neither = on("foundation-parity-neither-", () => {
      // An existing, empty Installation root: it carries neither authored form.
    });
    expect(neither.build).not.toBeNull();
    expect(neither.build).toBe(neither.authority);
    expect(neither.build).toMatch(/authored NEITHER way/);

    const both = on("foundation-parity-both-", (root) => {
      authoredLegacy(root);
      authoredSpoke(root, "spokes/one");
      declare(root, [{ id: "one", root: "spokes/one" }]);
    });
    expect(both.build).not.toBeNull();
    expect(both.build).toBe(both.authority);
    expect(both.build).toMatch(/authored SIMULTANEOUSLY/);
  });
});

describe("build selection and S3C1 ACCEPT the same declarations", () => {
  it("accepts ONE declared Spoke, and the build can RUN it (S3F1 cardinality)", () => {
    const { root, build, authority } = on("foundation-parity-one-", (installation) => {
      authoredSpoke(installation, "spokes/one");
      declare(installation, [{ id: "one", root: "spokes/one" }]);
    });

    expect(build).toBeNull();
    expect(authority).toBeNull();

    const declared = installationSpokes(root).spokes;
    const descriptors = resolveInstallationSpokeRoots(root).descriptors;
    expect(declared.map((spoke) => spoke.id)).toEqual(["one"]);
    expect(declared.map((spoke) => spoke.root)).toEqual(
      descriptors.map((descriptor) => descriptor.root),
    );
    expect(declared[0].relativeRoot).toBe("spokes/one");
    // The runtime segment is the IDENTITY; the canonical id encodes to itself.
    expect(declared[0].segment).toBe("one");

    const resolved = resolveDeploymentForBuild({}, root);
    expect(resolved.mode).toBe("explicit");
    expect(resolved.resourceRoot).toBe(descriptors[0].root);
  });

  it("accepts MULTIPLE declarations at declaration level — and the RUNTIME serves them (multi)", () => {
    const { root, build, authority } = on("foundation-parity-two-", (installation) => {
      authoredSpoke(installation, "spokes/beta");
      authoredSpoke(installation, "spokes/alpha");
      declare(installation, [
        { id: "beta", root: "spokes/beta" },
        { id: "alpha", root: "spokes/alpha" },
      ]);
    });

    expect(build).toBeNull();
    expect(authority).toBeNull();

    // Authored order is preserved on BOTH sides (never sorted, never filesystem order).
    expect(installationSpokes(root).spokes.map((spoke) => spoke.id)).toEqual(["beta", "alpha"]);
    expect(resolveInstallationSpokeRoots(root).descriptors.map((entry) => entry.id)).toEqual([
      "beta",
      "alpha",
    ]);

    // S3F1: activation is ONE Spoke, so the build refuses the Installation without inventing a default.
    expect(resolveDeploymentForBuild({}, root).mode).toBe("multi");
    expect(resolveDeploymentForBuild({}, root).spoke).toBeNull();
  });

  it("keeps the id INDEPENDENT of the directory spelling on both sides", () => {
    const { root, build, authority } = on("foundation-parity-spelling-", (installation) => {
      authoredSpoke(installation, "spokes/foundation-web");
      declare(installation, [{ id: "foundation", root: "spokes/foundation-web" }]);
    });

    expect(build).toBeNull();
    expect(authority).toBeNull();
    expect(installationSpokes(root).spokes[0].id).toBe("foundation");
    expect(resolveInstallationSpokeRoots(root).descriptors[0].id).toBe("foundation");
    // …while the authored directory stays exactly what it says.
    expect(installationSpokes(root).spokes[0].relativeRoot).toBe("spokes/foundation-web");
  });

  it("agrees that LEGACY mode declares no Spoke — the ONE intended asymmetry", () => {
    const { root, build, authority } = on("foundation-parity-legacy-", authoredLegacy);

    expect(build).toBeNull();
    expect(authority).toBeNull();

    // The selection seam reports "nothing is DECLARED" (the plan tooling has no rows to install), while the
    // authority names the implicit Spoke a legacy Installation already has. Both state the same fact for
    // their own consumer, and the MODE — the answer that decides how a build reads the root — is shared.
    expect(installationSpokes(root)).toEqual({ mode: "legacy", manifestFile: null, spokes: [] });
    expect(resolveInstallationSpokeRoots(root).mode).toBe("legacy");
    expect(installationSpokes(root).mode).toBe(resolveInstallationSpokeRoots(root).mode);
    expect(resolveDeploymentForBuild({}, root).mode).toBe("legacy");
  });

  it("resolves BOTH answers inside the SAME Installation root (no discovery, no environment)", () => {
    const { root } = on("foundation-parity-inside-", (installation) => {
      authoredSpoke(installation, "spokes/one");
      declare(installation, [{ id: "one", root: "spokes/one" }]);
    });

    expect(installationSpokes(root).spokes[0].root).toBe(path.join(root, "spokes", "one"));
    expect(resolveInstallationSpokeRoots(root).descriptors[0].root).toBe(
      path.join(root, "spokes", "one"),
    );
    expect(resolveInstallationSpokeRoots(root).installationRoot).toBe(root);
    expect(resolveInstallationSpokeRoots(root).manifestFile).toBe(path.join(root, "spokes.json"));
  });
});

/**
 * THE NESTED `spokeHubs` FORM (FOUNDATION-ID-M3-P1): BOTH SIDES REFUSE IT, IN THE SAME WORDS
 * ========================================================================================
 *
 * A second authored form exists — an Installation's IDENTIFIED SPOKE HUB collection — and Phase 1 supports
 * its recognition and its complete validation, and then refuses it. That refusal must therefore reach BOTH
 * answers this file exists to keep identical: the build's selection seam and the S3C1 configuration
 * authority. They agree by construction (there is still ONE implementation), and this block proves it AT
 * THE SEAM for the new form exactly as the block above does for every flat rule.
 */

/** Writes the NESTED manifest form. */
function declareHubs(root: string, hubs: readonly unknown[]): void {
  write(path.join(root, "spokes.json"), JSON.stringify({ spokeHubs: hubs }, null, 2));
}

/**
 * A member of an IDENTIFIED collection, with an AUTHORED canonical origin.
 *
 * An identified Installation dispatches by hostname ALWAYS (§6), so a member of one must carry a usable
 * `site.url` — which is why these fixtures write one, while a declaration-level fixture that never reaches
 * the routing authority (`authoredSpoke`) does not need to.
 */
function authoredHubSpoke(root: string, locator: string, url: string): string {
  const directory = path.join(root, ...locator.split("/"));
  write(path.join(directory, "site.config.json"), JSON.stringify({ site: { name: locator, url } }));
  return directory;
}

/** One nested manifest per way it can be unacceptable — every one of them still refused, unchanged. */
const NESTED_REFUSED: readonly { readonly name: string; readonly fixture: (root: string) => void }[] = [
  {
    name: "the nested form with an unknown Hub leaf",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      write(
        path.join(root, "spokes.json"),
        JSON.stringify({
          spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "spokes/one" }], hostname: "x.test" }],
        }),
      );
    },
  },
  {
    name: "the nested form with BOTH the flat and the nested collections",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      write(
        path.join(root, "spokes.json"),
        JSON.stringify({
          spokes: [{ id: "flat", root: "spokes/one" }],
          spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "spokes/one" }] }],
        }),
      );
    },
  },
  {
    name: "the nested form with a Hub that owns no Spoke",
    fixture: (root) => declareHubs(root, [{ id: "one", spokes: [] }]),
  },
  {
    name: "the nested form with a root OUTSIDE the dedicated namespace",
    fixture: (root) => {
      write(path.join(root, "config", "site.config.json"), "{}");
      declareHubs(root, [{ id: "one", spokes: [{ id: "global", root: "config" }] }]);
    },
  },
  {
    name: "the nested form with two Hubs sharing ONE physical root",
    fixture: (root) => {
      authoredSpoke(root, "spokes/one");
      declareHubs(root, [
        { id: "one", spokes: [{ id: "global", root: "spokes/one" }] },
        { id: "two", spokes: [{ id: "global", root: "spokes/one" }] },
      ]);
    },
  },
];

describe("build selection and S3C1 resolve the nested Spoke-Hub form, and refuse the SAME defects in the SAME words", () => {
  // THE ENABLED FORM (FOUNDATION-ID-M3-P3): a COHERENT nested collection is no longer refused — both seams
  // RESOLVE it, and they must agree about what they resolved: the same mode, the same Hubs and the same
  // COMPOSITE segment for every member. Nothing is flattened on either side: the Spokes stay inside their Hub.
  it("resolves a well-authored nested form (ONE Hub) on BOTH sides, and agrees about the composite identity", () => {
    const { root } = on("foundation-parity-hubs-ok-", (installation) => {
      authoredHubSpoke(installation, "spokes/one", "https://one.test");
      declareHubs(installation, [{ id: "one", spokes: [{ id: "global", root: "spokes/one" }] }]);
    });

    const build = installationSpokes(root);
    const authority = resolveInstallationSpokeRoots(root);

    expect(build.mode).toBe("hubs");
    expect(authority.mode).toBe("hubs");
    expect(build.hubIds).toEqual(["one"]);
    expect(authority.hubs.map((hub) => hub.id)).toEqual(["one"]);

    // THE COMPOSITE IDENTITY, both sides, character for character: the segment a namespace, a routing entry
    // and a runtime context are all derived from.
    const segment = runtimeSegmentForIdentifiedSpokeRef({ spokeHubId: "one", spokeId: "global" });
    expect(build.spokes).toEqual([
      {
        id: "global",
        relativeRoot: "spokes/one",
        root: path.join(root, "spokes", "one"),
        segment,
        spokeHubId: "one",
      },
    ]);
    expect(authority.descriptors).toEqual([
      { id: "global", root: path.join(root, "spokes", "one"), spokeHubId: "one" },
    ]);
    expect(segment).toBe("hub+one+global");
  });

  for (const testCase of NESTED_REFUSED) {
    it(`refuses ${testCase.name}`, () => {
      const { build, authority } = on("foundation-parity-hubs-", testCase.fixture);

      expect(build, "the build selection seam must refuse").not.toBeNull();
      expect(authority, "the S3C1 authority must refuse").not.toBeNull();
      expect(build).toBe(authority);
    });
  }

  it("keeps the SAME defect diagnostics it had while the form was gated", () => {
    // THE DEFECTS ARE NOT SOFTENED BY ENABLEMENT (FOUNDATION-ID-M3-P3 §9): every one of them is still
    // reported, in the same words both sides report, so an author sees what is wrong before anything runs.
    const structure = on("foundation-parity-hubs-structure-", (installation) => {
      authoredSpoke(installation, "spokes/one");
      write(
        path.join(installation, "spokes.json"),
        JSON.stringify({
          spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "spokes/one", unknown: true }] }],
        }),
      );
    });
    expect(structure.build).toMatch(/Unrecognized key/);
    expect(structure.authority).toBe(structure.build);

    const noMembers = on("foundation-parity-hubs-empty-", (installation) => {
      declareHubs(installation, [{ id: "one", spokes: [] }]);
    });
    expect(noMembers.build).toMatch(/at least one Spoke/);

    const outside = on("foundation-parity-hubs-outside-", (installation) => {
      write(path.join(installation, "config", "site.config.json"), "{}");
      declareHubs(installation, [{ id: "one", spokes: [{ id: "global", root: "config" }] }]);
    });
    expect(outside.build).toMatch(/spokes\//);
    expect(outside.authority).toBe(outside.build);

    const sharedRoot = on("foundation-parity-hubs-shared-", (installation) => {
      authoredSpoke(installation, "spokes/one");
      declareHubs(installation, [
        { id: "one", spokes: [{ id: "global", root: "spokes/one" }] },
        { id: "two", spokes: [{ id: "docs", root: "spokes/one" }] },
      ]);
    });
    expect(sharedRoot.build).toMatch(/two Spokes cannot share one authored root/);

    const bothForms = on("foundation-parity-hubs-both-", (installation) => {
      authoredSpoke(installation, "spokes/one");
      write(
        path.join(installation, "spokes.json"),
        JSON.stringify({
          spokes: [{ id: "flat", root: "spokes/one" }],
          spokeHubs: [{ id: "one", spokes: [{ id: "global", root: "spokes/one" }] }],
        }),
      );
    });
    expect(bothForms.build).toMatch(/MUTUALLY EXCLUSIVE/);
    expect(bothForms.authority).toBe(bothForms.build);
  });

  it("is RESOLVED by the build into a dispatchable deployment, never a single activated Spoke", () => {
    const { root } = on("foundation-parity-hubs-build-", (installation) => {
      authoredHubSpoke(installation, "spokes/one", "https://one.test");
      declareHubs(installation, [{ id: "one", spokes: [{ id: "global", root: "spokes/one" }] }]);
    });

    // The ONE question the build asks, and the whole-deployment resolution that follows it: an identified
    // collection is a DISPATCHING deployment — no single resource root, no inlined configuration, and the
    // routing description carries the composite identity (§5/§6).
    const authoring = installationSpokes(root);
    expect(authoring.mode).toBe("hubs");

    const deployment = resolveDeploymentForBuild({}, root);
    expect(deployment.mode).toBe("hubs");
    expect(deployment.resourceRoot).toBeNull();
    expect(deployment.config).toBe("");
    expect(deployment.spoke).toBeNull();
    expect(deployment.hostRouting.mode).toBe("identified");
    expect(deployment.hostRouting.spokes.map((spoke) => spoke.segment)).toEqual([
      runtimeSegmentForIdentifiedSpokeRef({ spokeHubId: "one", spokeId: "global" }),
    ]);
  });
});
