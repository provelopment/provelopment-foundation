/**
 * THE DISPOSABLE RUNTIME-CUT EFS SUBJECT (`C07`)
 * ==============================================
 *
 * The request runtime has ONE authority: an explicit EFS declaration. The suites that used to prove
 * ordinary Page/locale serving through the retired non-production switch now prove the SAME visitor
 * capabilities against this fixture, which is a real declaration — a manifest, an owned capsule and a
 * declared Spoke in an explicit Installation — not a mock and not a second publication authority.
 *
 * What it is:
 *
 *   tests/fixtures/efs/runtime-cut/     the COMMITTED template (read-only in every test)
 *     manifest.json                     Entity → Facet → Sites `main`/`outlet` → declared Pages
 *     capsule/<EntityID>/<FacetID>/…     authored representations, artwork, one UNdeclared source
 *
 * What this module does:
 *
 *   materializeRuntimeCutFixture()      copies the template into OWNED OS temp (failure-atomic)
 *   selectRuntimeCutFixture(fixture)    publishes that copy through the test-only declaration seam
 *   materializeRuntimeCutInstallation() an explicit Installation declaring the fixture's Spoke
 *   runtimeCutHeaders()                 the Host a request must carry to reach a binding
 *
 * The copy exists so a suite may AUTHOR into a disposable capsule (a JSON Page that must take
 * precedence over its Markdown neighbour) without ever writing the committed fixture or the
 * repository's own deployment.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { materializeEfsInstallation, type DisposableEfsInstallation } from "./efs-installation";

/** The Spoke the fixture's publication names; the Installation must declare exactly this. */
export const RUNTIME_CUT_SPOKE = "runtime-cut-spoke";

/** The dedicated-root host of the fixture's canonical binding. */
export const RUNTIME_CUT_HOST = "runtime-cut.test";

/** A host no binding in the fixture claims. */
export const RUNTIME_CUT_UNCLAIMED_HOST = "unclaimed.runtime-cut.test";

const MANIFEST_ENV = "FOUNDATION_EFS_MANIFEST";
const CAPSULE_ENV = "FOUNDATION_EFS_CAPSULE";

/** The committed template, read from the repository rather than copied between tests. */
export function runtimeCutFixtureRoot(): string {
  return path.join(process.cwd(), "tests", "fixtures", "efs", "runtime-cut");
}

export interface DisposableRuntimeCutFixture {
  /** The owned copy of the fixture (`manifest.json` + `capsule/`). */
  readonly root: string;
  readonly manifest: string;
  readonly capsule: string;
  cleanup(): void;
}

/**
 * Copy the committed template into owned OS temp.
 *
 * FAILURE-ATOMIC: a throw while writing removes the allocated root and rethrows the ORIGINAL error, so
 * a failed materialisation never leaves a directory nobody can dispose.
 */
export function materializeRuntimeCutFixture(): DisposableRuntimeCutFixture {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-efs-runtime-cut-"));

  try {
    cpSync(runtimeCutFixtureRoot(), root, { recursive: true });
  } catch (error) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "could not materialise the runtime-cut EFS fixture AND could not remove the partial copy",
      );
    }
    throw error;
  }

  return {
    root,
    manifest: path.join(root, "manifest.json"),
    capsule: path.join(root, "capsule"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Publish the copy through the test-only DECLARATION seam and return an undo.
 *
 * This selects which authored declaration the runtime reads; it does not select a runtime. There is no
 * second request path to switch to, which is the whole point of the cut.
 */
export function selectRuntimeCutFixture(fixture: DisposableRuntimeCutFixture): () => void {
  const previous = { manifest: process.env[MANIFEST_ENV], capsule: process.env[CAPSULE_ENV] };
  process.env[MANIFEST_ENV] = fixture.manifest;
  process.env[CAPSULE_ENV] = fixture.capsule;

  return () => {
    if (previous.manifest === undefined) delete process.env[MANIFEST_ENV];
    else process.env[MANIFEST_ENV] = previous.manifest;
    if (previous.capsule === undefined) delete process.env[CAPSULE_ENV];
    else process.env[CAPSULE_ENV] = previous.capsule;
  };
}

/**
 * Materialise the explicit Installation that OWNS this fixture: `spokes.json` declaring the one Spoke the
 * publication names, so ownership is resolved against a genuine hierarchy.
 */
export function materializeRuntimeCutInstallation(): DisposableEfsInstallation {
  // Its OWN temp prefix: the runtime-cut subject must never appear in another suite's orphan scan
  // (the OpenGraph parity guard enumerates `foundation-efs-installation-*` roots), and a parallel
  // worker must never dispose another's.
  return materializeEfsInstallation({
    mode: "flat",
    spokes: [RUNTIME_CUT_SPOKE],
    prefix: "foundation-efs-runtime-cut-",
  });
}

/**
 * Declare an ADDITIONAL Page inside the disposable copy's manifest.
 *
 * A suite that proves publication must author BOTH halves — the representation in the capsule and the
 * declaration in the manifest. A file alone is never a publication claim, and a declaration alone has no
 * source to load, so the pair is authored together into the owned copy and never into the repository.
 */
export function declareRuntimeCutPage(
  fixture: DisposableRuntimeCutFixture,
  page: {
    readonly id: string;
    readonly route: readonly string[];
    readonly site?: string;
    readonly locales?: readonly string[];
    readonly navLabel?: string;
  },
): void {
  const siteId = page.site ?? "main";
  const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8")) as {
    entities: {
      facets: { sites: { id: string; pages: unknown[] }[] }[];
    }[];
  };
  const sites = manifest.entities[0].facets[0].sites;
  const site = sites.find((candidate) => candidate.id === siteId);
  if (site === undefined) throw new Error(`no such Site in the fixture: ${siteId}`);

  site.pages.push({
    id: page.id,
    route: [...page.route],
    fallbackLocaleKey: (page.locales ?? ["en-001"])[0],
    representations: (page.locales ?? ["en-001"]).map((locale) => ({ locale })),
    properties:
      page.navLabel === undefined
        ? {}
        : { "nav.label": { value: page.navLabel, public: true } },
  });

  writeFileSync(fixture.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/** Give a dynamically authored representation a home inside a disposable capsule. */
export function authorRuntimeCutRepresentation(
  fixture: DisposableRuntimeCutFixture,
  site: string,
  page: string,
  locale: string,
  body: string,
): void {
  const directory = path.join(
    fixture.capsule,
    "e_00000000000000000000000001",
    "runtime",
    site,
    "pages",
    page,
  );
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${locale.toLowerCase()}.json`), body, "utf8");
}
