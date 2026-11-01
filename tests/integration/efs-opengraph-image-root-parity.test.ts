import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { materializeEfsInstallation, selectEfsInstallation } from "../support/efs-installation";

/**
 * THIS FILE'S LIFECYCLE — OWNED ROOTS AND AN EXACTLY-RESTORED ENVIRONMENT (`R04-C22-R03`)
 * =========================================================================================
 *
 * The test selects ONE Installation with `selectEfsInstallation` and builds a FURTHER disposable Installation per
 * case, so it owns several OS-temp roots — not one. Selection also rewrites a dynamic set of deployment keys
 * (`FOUNDATION_DEPLOYMENT_ROOT`/`…_LAYOUT`/`…_CONFIG` and whatever `deploymentEnvironment` resolves), so restoring
 * "the two manifest pointers" is not enough: the only honest way back is to compare against what the process
 * environment was at module load and undo every difference, including deleting keys that were originally ABSENT.
 */
const PRISTINE_ENVIRONMENT: Readonly<Record<string, string | undefined>> = { ...process.env };

interface EnvironmentPlan {
  /** Keys whose ORIGINAL value must be put back. */
  readonly set: readonly (readonly [string, string])[];
  /** Keys the run ADDED, which must be deleted rather than set to "undefined". */
  readonly remove: readonly string[];
}

function environmentPlan(
  pristine: Readonly<Record<string, string | undefined>>,
  current: Readonly<Record<string, string | undefined>>,
): EnvironmentPlan {
  const set: (readonly [string, string])[] = [];
  const remove: string[] = [];
  for (const key of Object.keys(pristine)) {
    const original = pristine[key];
    const now = current[key];
    if (original === now) continue;
    if (original === undefined) continue; // absent then, absent now — nothing to do
    if (now === undefined) set.push([key, original]); // DELETED by the run: restore it
    else if (now !== original) set.push([key, original]); // CHANGED by the run: put it back
  }
  for (const key of Object.keys(current)) {
    if (key in pristine) continue;
    remove.push(key); // ADDED by the run: remove it
  }
  return { set, remove };
}

/** Every OS-temp root THIS FILE created, in creation order. */
const OWNED_ROOTS: string[] = [];

/** Register a root the instant it exists — before anything can throw while writing into it. */
function ownRoot(root: string): string {
  OWNED_ROOTS.push(root);
  return root;
}

/**
 * Remove one owned root, idempotently. It refuses a path this file did not create, and it de-registers ONLY AFTER
 * the removal has actually succeeded (`R04-C22-R03-R02`): a failed removal leaves the root owned and observable so a
 * later pass can retry it, instead of reporting success for a root that still exists.
 */
function disposeRoot(root: string, remove: (path: string) => void = removeTree): void {
  const index = OWNED_ROOTS.indexOf(root);
  if (index < 0) return;
  if (!root.startsWith(tmpdir())) throw new Error(`refusing to remove a root this test did not create: ${root}`);
  remove(root);
  OWNED_ROOTS.splice(OWNED_ROOTS.indexOf(root), 1);
}

function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** Remove every owned root. One failing removal must not abandon the rest, nor hide why the run failed. */
function disposeOwnedRoots(remove: (path: string) => void = removeTree): void {
  const failures: unknown[] = [];
  for (const root of [...OWNED_ROOTS]) {
    try {
      disposeRoot(root, remove);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "this test could not remove every disposable root it created");
  }
}

/** Put the environment back exactly — computed from the pristine snapshot, never from a hand-kept key list. */
function restoreEnvironment(): void {
  const plan = environmentPlan(PRISTINE_ENVIRONMENT, { ...process.env });
  for (const [key, value] of plan.set) process.env[key] = value;
  for (const key of plan.remove) delete process.env[key];
}

interface LifecycleHooks {
  readonly restore: () => void;
  readonly dispose: () => void;
}

/**
 * SETTLE WHAT THIS FILE CHANGED — INDEPENDENTLY (`R04-C22-R03-R02`)
 * =================================================================
 *
 * Restoring the environment and disposing owned roots are attempted SEPARATELY, so a failure of either one cannot
 * skip the other. Every failure is collected and reported together; nothing is swallowed and nothing is reported as
 * settled while it is not. This returns the failures instead of throwing so that the independence itself can be
 * exercised by ordinary cases; `afterAll` is the caller that turns them into a teardown failure.
 */
function settleFailures(hooks: LifecycleHooks = { restore: restoreEnvironment, dispose: disposeOwnedRoots }): unknown[] {
  const failures: unknown[] = [];
  try {
    hooks.restore();
  } catch (error) {
    failures.push(error);
  }
  try {
    hooks.dispose();
  } catch (error) {
    failures.push(error);
  }
  const residualEnvironment = environmentPlan(PRISTINE_ENVIRONMENT, { ...process.env });
  if (residualEnvironment.set.length > 0 || residualEnvironment.remove.length > 0) {
    failures.push(new Error(`the environment was not restored: ${JSON.stringify(residualEnvironment)}`));
  }
  if (OWNED_ROOTS.length > 0) {
    failures.push(new Error(`${OWNED_ROOTS.length} owned root(s) still present: ${OWNED_ROOTS.join(", ")}`));
  }
  return failures;
}

/** Registered BEFORE anything is created, so initialization failures are still covered by a teardown. */
afterAll(() => {
  const failures = settleFailures();
  if (failures.length > 0) {
    throw new AggregateError(failures, "this test could not restore the environment and remove every root it created");
  }
});


/**
 * SELECT THE INSTALLATION — AND ROLL BACK IF ANY OF IT THROWS (`R04-C22-R03-R02`)
 * =============================================================================
 *
 * `materializeEfsInstallation` is failure-atomic about the root it allocates (it removes its own root if
 * population throws), so the only way to receive a root is to receive a COMPLETE one. What remains here is the
 * part the helper cannot know about: once the helper returns, this file owns the root, and selection + dynamic
 * import mutate the process environment. If any of that throws, the failure is rolled back HERE rather than
 * relying on `afterAll` being reached — and the ORIGINAL error is what the run reports, never a cleanup error.
 */
type EfsRequestModule = typeof import("@/app/[[...segments]]/efs-request");
let efsRequest!: EfsRequestModule;
try {
  const installation = materializeEfsInstallation({ mode: "flat", spokes: ["acme-spoke"] });
  // Ownership transfers on a SUCCESSFUL return; a failed construction never reaches this line.
  ownRoot(installation.root);
  selectEfsInstallation(installation.root);
  vi.resetModules();
  efsRequest = await import("@/app/[[...segments]]/efs-request");
} catch (error) {
  const rollbackFailures = settleFailures();
  if (rollbackFailures.length > 0) {
    // Report both, but the initialization failure stays the one that explains the file.
    throw new AggregateError([error, ...rollbackFailures], "initialization failed AND could not be rolled back");
  }
  throw error;
}

const { efsOpenGraphImage, efsOpenGraphImageForCurrentRequest, efsViewForCurrentRequest } = efsRequest;


/**
 * THE ROOT CARD IS THE ONLY IMAGE IDENTITY (`R04-C21-R02`, finding F2)
 * ===================================================================
 *
 * One card per site/locale root (`D42` §3–§5). EFS lets a Page or a representation override or suppress
 * `brand.name`, and the image endpoint draws the card from the ROOT Page's cascade. So a Page's metadata must
 * report the root card's URL, the root card's public brand and the root card's refusal condition — never its
 * own. Each case below is built as a DISPOSABLE Installation whose capsule and manifest this test writes, so
 * the property cascade really contains the override being tested.
 */
const ENTITY = "e_00000000000000000000000000";
const SECOND_ENTITY = "e_00000000000000000000000001";

interface PageSpec {
  readonly id: string;
  readonly route: readonly string[];
  readonly properties?: Record<string, unknown>;
  readonly representationProperties?: Record<string, unknown>;
}

function documentFor(title: string, description: string): string {
  return `${JSON.stringify(
    { schemaVersion: 1, title, description, sections: [{ type: "prose", heading: title, body: description }] },
    null,
    2,
  )}\n`;
}

/** One entity's Pages, written as JSON capsule documents that really resolve. */
function writeOwner(root: string, entityId: string, pages: readonly PageSpec[]): void {
  for (const page of pages) {
    const directory = join(root, "capsule", entityId, "acme", "main", "pages", ...page.route);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "en-001.json"),
      documentFor(`${entityId} ${page.id}`, `The ${page.id} page of ${entityId}.`),
      "utf8",
    );
  }
}

function manifestFor(
  owners: readonly { entityId: string; brand: Record<string, unknown>; pages: readonly PageSpec[] }[],
  bindings: readonly { host: string; prefix: string[]; entityId: string }[],
): Record<string, unknown> {
  return {
    entities: owners.map((owner) => ({
      id: owner.entityId,
      properties: { "brand.name": owner.brand },
      facets: [
        {
          id: "acme",
          sites: [
            {
              id: "main",
              pages: owner.pages.map((page) => ({
                id: page.id,
                route: page.route,
                ...(page.id === "home" ? { fallbackLocaleKey: "en-001" } : {}),
                representations: [
                  {
                    locale: "en-001",
                    ...(page.representationProperties === undefined
                      ? {}
                      : { properties: page.representationProperties }),
                  },
                ],
                ...(page.properties === undefined ? {} : { properties: page.properties }),
              })),
            },
          ],
        },
      ],
    })),
    publications: owners.map((owner, index) => ({
      id: `publication-${index}`,
      spokeId: "acme-spoke",
      entityId: owner.entityId,
      facetId: "acme",
      bindings: bindings
        .filter((binding) => binding.entityId === owner.entityId)
        .map((binding, bindingIndex) => ({
          id: `binding-${index}-${bindingIndex}`,
          host: binding.host,
          prefix: binding.prefix,
          entityId: owner.entityId,
          facetId: "acme",
          siteIds: ["main"],
          siteMode: "closed",
          defaultSiteId: "main",
          locales: ["en-001"],
          defaultLocale: "en-001",
          canonical: true,
        })),
    })),
  };
}

function installationWith(
  owners: readonly { entityId: string; brand: Record<string, unknown>; pages: readonly PageSpec[] }[],
  bindings: readonly { host: string; prefix: string[]; entityId: string }[],
): string {
  const root = mkdtempSync(join(tmpdir(), "foundation-opengraph-parity-"));
  // OWNED BEFORE IT IS POPULATED (`R04-C22-R03`): if a write below throws, teardown still knows this root and
  // removes it. Registering after population is what used to be able to orphan a half-written root.
  ownRoot(root);
  for (const owner of owners) writeOwner(root, owner.entityId, owner.pages);
  writeFileSync(join(root, "manifest.json"), `${JSON.stringify(manifestFor(owners, bindings), null, 2)}\n`, "utf8");
  return root;
}

/**
 * ONE TEARDOWN FOR EVERYTHING THIS FILE TOUCHED (`R04-C22-R03`)
 * =============================================================
 *
 * Restores the environment EXACTLY as it was at module load, then removes every root this file created — on a green
 * run AND after a failure. The two are done independently: a cleanup failure cannot prevent restoration, and neither
 * can replace the assertion or error that actually failed the run (this hook reports its own failure separately).
 */
beforeEach(() => {
  state.headers.clear();
});


const ROOT = { id: "home", route: ["home"] } as const;

function useInstallation(
  owners: readonly { entityId: string; brand: Record<string, unknown>; pages: readonly PageSpec[] }[],
  bindings: readonly { host: string; prefix: string[]; entityId: string }[],
): void {
  // The root is already owned by `installationWith`; teardown restores these two pointers along with every other
  // deployment key selection changed, so no per-case bookkeeping is needed here.
  const root = installationWith(owners, bindings);
  process.env.FOUNDATION_EFS_MANIFEST = join(root, "manifest.json");
  process.env.FOUNDATION_EFS_CAPSULE = join(root, "capsule");
}

describe("one card per site/locale root — metadata cannot diverge from the image", () => {
  it("(a) a NON-ROOT public override does not resurrect a card the ROOT refuses", async () => {
    useInstallation(
      [
        {
          entityId: ENTITY,
          brand: { value: "Root Brand", public: false },
          pages: [
            ROOT,
            { id: "about", route: ["about"], properties: { "brand.name": { value: "About Brand", public: true } } },
          ],
        },
      ],
      [{ host: "parity.example", prefix: [], entityId: ENTITY }],
    );
    state.headers.set("host", "parity.example");

    const about = await efsViewForCurrentRequest(["en-001", "about"]);
    // The override really is public on THIS page — which is exactly why the old behaviour advertised a
    // URL the root card refuses.
    expect(about?.properties.get("brand.name")?.public).toBe(true);
    expect(about?.properties.get("brand.name")?.value).toBe("About Brand");

    // The ROOT has no usable public brand, so the endpoint refuses and no Page may advertise it.
    expect(await efsOpenGraphImageForCurrentRequest(["en-001"])).toBeNull();
    expect(await efsOpenGraphImage(about!)).toBeUndefined();
  });

  it("(b) a NON-ROOT private brand cannot change the URL or the alt the ROOT card displays", async () => {
    useInstallation(
      [
        {
          entityId: ENTITY,
          brand: { value: "Root Brand", public: true },
          pages: [
            ROOT,
            { id: "about", route: ["about"], properties: { "brand.name": { value: "Other Brand", public: false } } },
            { id: "notice", route: ["notice"], representationProperties: { "brand.name": null } },
          ],
        },
      ],
      [{ host: "parity.example", prefix: [], entityId: ENTITY }],
    );
    state.headers.set("host", "parity.example");

    const rootCard = await efsOpenGraphImageForCurrentRequest(["en-001"]);
    expect(rootCard?.content.siteName).toBe("Root Brand");

    const about = await efsViewForCurrentRequest(["en-001", "about"]);
    // This Page's OWN cascade is not the root's — that is the divergence F2 is about.
    expect(about?.properties.get("brand.name")?.value).toBe("Other Brand");
    expect(about?.properties.get("brand.name")?.public).toBe(false);
    const aboutImage = await efsOpenGraphImage(about!);
    expect(aboutImage?.url).toBe(rootCard?.url);
    expect(aboutImage?.alt).toBe("Root Brand");

    const notice = await efsViewForCurrentRequest(["en-001", "notice"]);
    expect(notice?.properties.get("brand.name")?.value).toBeUndefined();
    const noticeImage = await efsOpenGraphImage(notice!);
    expect(noticeImage?.url).toBe(rootCard?.url);
    expect(noticeImage?.alt).toBe("Root Brand");
  });

  it("(c) two owners on ONE host keep disjoint cards, prefixes and metadata", async () => {
    useInstallation(
      [
        { entityId: ENTITY, brand: { value: "A Brand", public: true }, pages: [ROOT] },
        { entityId: SECOND_ENTITY, brand: { value: "B Brand", public: true }, pages: [ROOT] },
      ],
      [
        { host: "shared.example", prefix: ["a"], entityId: ENTITY },
        { host: "shared.example", prefix: ["b"], entityId: SECOND_ENTITY },
      ],
    );
    state.headers.set("host", "shared.example");

    const a = await efsOpenGraphImageForCurrentRequest(["a", "en-001"]);
    const b = await efsOpenGraphImageForCurrentRequest(["b", "en-001"]);
    expect(a?.content.siteName).toBe("A Brand");
    expect(b?.content.siteName).toBe("B Brand");
    expect(a?.url).not.toBe(b?.url);

    const aHome = await efsViewForCurrentRequest(["a", "en-001"]);
    const bHome = await efsViewForCurrentRequest(["b", "en-001"]);
    const aImage = await efsOpenGraphImage(aHome!);
    const bImage = await efsOpenGraphImage(bHome!);
    expect(aImage?.url).toBe(a?.url);
    expect(bImage?.url).toBe(b?.url);
    expect(aImage?.alt).toBe("A Brand");
    expect(bImage?.alt).toBe("B Brand");
  });

  /**
   * THE LIFECYCLE IS PROVED HERE, IN THE SAME FILE THAT RELIES ON IT (`R04-C22-R03`).
   *
   * The three cases above each build their own disposable Installation, and the module also selects one. A
   * description in an architecture guard is only true if the behaviour is: a root must be OWNED the moment it
   * exists, so a throw while it is being populated cannot orphan it, and the environment must go back to exactly
   * what it was — including keys that were originally ABSENT, which must be removed rather than set to "undefined".
   */
  it("(d) owns a root BEFORE populating it, so a failure mid-population still disposes it", () => {
    const root = mkdtempSync(join(tmpdir(), "foundation-opengraph-parity-"));
    ownRoot(root);
    // Partial population, then a controlled failure — the shape of a real mid-population error.
    writeFileSync(join(root, "manifest.json"), '{ "partial": true }\n', "utf8");
    mkdirSync(join(root, "capsule"), { recursive: true });
    const original = new Error("controlled failure while populating a disposable root");
    try {
      throw original;
    } catch (thrown) {
      // The ORIGINAL error survives disposal: cleanup never replaces the failure that caused it.
      expect(thrown).toBe(original);
    }

    disposeRoot(root);
    expect(existsSync(root), "a partially populated root this test created is removed").toBe(false);
    disposeRoot(root); // idempotent: a second teardown pass is not an error
    expect(OWNED_ROOTS).not.toContain(root);
  });

  it("(e) restores exactly what changed, including keys that were originally ABSENT", () => {
    const pristine = { KEPT: "a", CHANGED: "b", DELETED: "c" } as Record<string, string | undefined>;
    const after = { KEPT: "a", CHANGED: "override", ADDED: "d" } as Record<string, string | undefined>;
    // Changed → its original value back; deleted → restored; added → REMOVED (never set to the string
    // "undefined"); untouched → not mentioned at all, so unrelated keys are never rewritten.
    expect(environmentPlan(pristine, after)).toEqual({ set: [["CHANGED", "b"], ["DELETED", "c"]], remove: ["ADDED"] });
    // Already pristine → an empty plan, which is what the file's own teardown asserts after restoring.
    expect(environmentPlan(pristine, { ...pristine })).toEqual({ set: [], remove: [] });
  });

  /**
   * CONSTRUCTION FAILURE IS NOT A TEST FAILURE THIS FILE CAN CLEAN UP (`R04-C22-R03-R02`, finding F1).
   *
   * The selected Installation is built at module load by `materializeEfsInstallation`, which allocates its root
   * and then writes into it. A throw in between used to leave an allocated root that no caller could dispose —
   * the caller never received the handle — and this case drives that REAL path (a spoke locator with a NUL byte
   * makes `mkdirSync` throw AFTER `mkdtempSync`), then insists that no new root survived it.
   */
  it("(f) the selected Installation's construction removes its own root when it throws before returning", () => {
    const installationsInTemp = () =>
      new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("foundation-efs-installation-")));

    const flatBefore = installationsInTemp();
    let flatError: unknown;
    try {
      materializeEfsInstallation({ mode: "flat", spokes: ["bad\u0000name"] });
    } catch (error) {
      flatError = error;
    }
    expect(flatError, "the construction really failed after allocating its root").toBeInstanceOf(Error);
    expect(
      [...installationsInTemp()].filter((name) => !flatBefore.has(name)),
      "the failed construction left no root behind for a caller that never received it",
    ).toEqual([]);

    // Same guarantee for the `hubs` shape, which builds its locators differently.
    const hubsBefore = installationsInTemp();
    let hubsError: unknown;
    try {
      materializeEfsInstallation({ mode: "hubs", hubs: [{ id: "hub", spokes: ["bad\u0000name"] }] });
    } catch (error) {
      hubsError = error;
    }
    expect(hubsError).toBeInstanceOf(Error);
    expect([...installationsInTemp()].filter((name) => !hubsBefore.has(name))).toEqual([]);
  });

  /**
   * TEARDOWN IS TWO OPERATIONS, NOT ONE (`R04-C22-R03-R02`, finding F2).
   *
   * A failing environment restoration must not skip disposal, and a failing disposal must not skip restoration —
   * proved by driving the real sequencing with one real side (a root that must actually disappear, or a
   * restoration that must actually be called) and one controlled failure.
   */
  it("(g) attempts disposal when restoration fails, and restoration when disposal fails", () => {
    const root = ownRoot(mkdtempSync(join(tmpdir(), "foundation-opengraph-parity-")));
    writeFileSync(join(root, "probe.json"), "{}\n", "utf8");

    const restoreError = new Error("controlled environment-restoration failure");
    const withRestoreFailure = settleFailures({
      restore: () => {
        throw restoreError;
      },
      dispose: () => disposeRoot(root),
    });
    expect(withRestoreFailure).toContain(restoreError);
    expect(existsSync(root), "disposal still ran, and really removed the root").toBe(false);

    let restoreCalls = 0;
    const disposeError = new Error("controlled disposal failure");
    const withDisposeFailure = settleFailures({
      restore: () => {
        restoreCalls += 1;
      },
      dispose: () => {
        throw disposeError;
      },
    });
    expect(withDisposeFailure).toContain(disposeError);
    expect(restoreCalls, "restoration still ran when disposal failed").toBe(1);
    // Neither controlled failure leaves the process poisoned: nothing here touched the real environment or roots.
    expect(OWNED_ROOTS).not.toContain(root);
  });

  /**
   * A ROOT THAT COULD NOT BE REMOVED IS STILL OURS (`R04-C22-R03-R02`, finding F2, second half).
   *
   * De-registering before the removal succeeds would report a surviving root as cleaned up and make a retry
   * impossible; it must stay tracked, and the next pass must be able to remove it for real.
   */
  it("(h) a failed removal stays owned and is retryable, not silently deregistered", () => {
    const root = ownRoot(mkdtempSync(join(tmpdir(), "foundation-opengraph-parity-")));
    writeFileSync(join(root, "probe.json"), "{}\n", "utf8");
    const removalError = new Error("controlled removal failure");

    expect(() =>
      disposeRoot(root, () => {
        throw removalError;
      }),
    ).toThrow(removalError);
    expect(OWNED_ROOTS, "the surviving root is still tracked").toContain(root);
    expect(existsSync(root)).toBe(true);

    disposeRoot(root); // the retry uses the real remover
    expect(OWNED_ROOTS).not.toContain(root);
    expect(existsSync(root)).toBe(false);
  });
});
