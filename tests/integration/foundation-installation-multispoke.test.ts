/**
 * THE REAL TWO-SPOKE CAPSULE, ESTABLISHED (FOUNDATION-MULTISITE-M20)
 * ==================================================================
 *
 * M20's first responsibility is that establishment understands the Installation the platform actually
 * ships. Until M20 the establishment core required the authored surfaces at the Installation ROOT — the
 * legacy implicit shape — so the real `deployment/` capsule (an EXPLICIT collection declaring `foundation`
 * and `germany`) was refused by the very check that exists to accept a complete capsule.
 *
 * This is the acceptance case, not a fixture: the seed is a byte-faithful disposable copy of the REAL
 * capsule, established from an immutable synthetic release, and every assertion is made through the
 * accepted authorities — the declaration contract (`@/config/spoke-roots`, the same call the runtime index
 * makes), the configuration loader, and the content composition every page route resolves through.
 *
 * WHAT IT PROVES
 *
 *   §14  the real two-Spoke capsule is ACCEPTED, and the established target declares exactly
 *        `foundation` + `germany`, each declared root carrying its own authored surfaces
 *   §15  each Spoke's OWN configuration and page tree resolve from the target, and neither Spoke can
 *        answer for the other
 *   §16  authored material travelled BYTE-FOR-BYTE: manifest, configurations, dictionaries, pages, artwork
 *   §17  nothing outside the target was written: the seed and the release payload are unchanged
 *   §11  a seed's generated operational state is REFUSED, never silently dropped
 *   §12  a seed's own adoption record is NOT inherited; the target's baseline names the release THIS
 *        establishment wrote
 *   §37  the coupling M20 exists for: what an author can create is what establishment preserves
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// Establishing a REAL capsule copies the repository's authored tree and materialises a release payload,
// so these proofs need more than vitest's default five-second budget. The work is deterministic and
// bounded — this is a budget for real filesystem work, not an allowance for flakiness.
vi.setConfig({ testTimeout: 90_000 });

import { createPageSources } from "@/adapters/content/page-sources";
import { establishInstallationFromDirectories } from "@/adapters/installation/establish";
import { capsuleDirectory } from "@/config/deployment-build.mjs";
import { parseSiteConfig } from "@/config/loader";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { INSTALLATION_ADOPTION_RECORD_FILE_NAME } from "@/core/foundation-installation/establishment";
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";

import {
  constructSyntheticRelease,
  disposableTree,
  snapshotTree,
  SYNTHETIC_RELEASE_IDENTITY,
  targetCapsule,
} from "../support/installation-establishment-fixture";

/**
 * The REAL authored capsule this repository actually deploys — asked of the platform's OWN authority
 * (`@/config/deployment-build.mjs`) rather than composed from a path: a test may not anchor on the
 * repository and spell the capsule itself (`deployment-root-guard.test.ts`).
 */
const REAL_CAPSULE = capsuleDirectory(process.cwd());

/**
 * THIS REPOSITORY'S REFERENCE CAPSULE IS THE SUBJECT (FOUNDATION-MULTISITE-M21).
 *
 * A Foundation release EXCLUDES `deployment/**`, so a materialised release contains no reference capsule
 * at all. These proofs are about THIS repository's own capsule: where it does not exist the subject is
 * absent, so the suite is SKIPPED rather than failed — a release that legitimately ships no deployment
 * must not be unable to prove itself. The generic contracts these proofs build on are covered by the
 * synthetic-deployment suites, which need no capsule whatsoever.
 */
const capsuleSuite = existsSync(REAL_CAPSULE) ? describe : describe.skip;

/** Representative authored paths, capsule-relative, whose bytes must survive establishment untouched. */
const PRESERVED = [
  "spokes.json",
  "spokes/foundation/site.config.json",
  "spokes/germany/site.config.json",
  "spokes/foundation/config/i18n/en.json",
  "spokes/foundation/config/i18n/de.json",
  "spokes/germany/config/i18n/en.json",
  "spokes/germany/config/i18n/de.json",
  "spokes/foundation/content/pages/json/main/en-001/home.json",
  "spokes/foundation/content/pages/markdown/main/en-001/about.md",
  "spokes/germany/content/pages/markdown/main/de-de/about.md",
  "spokes/germany/content/pages/json/main/de-de/home.json",
  "spokes/foundation/content/assets/placeholders/favicon.svg",
  "spokes/germany/content/assets/placeholders/favicon.svg",
] as const;

/**
 * A byte-faithful disposable copy of the REAL capsule.
 *
 * Generated operational state is EXCLUDED from the copy rather than the copy being edited afterwards: a
 * seed may not contain it (§11), and the real capsule holds one only on a machine that is running it.
 * Everything else — including the capsule's own `.gitignore` and its adoption record — is copied verbatim,
 * because that is exactly what an operator hands to `pnpm installation:establish --seed deployment`.
 */
function realCapsuleSeed(): string {
  const seed = disposableTree("foundation-m20-real-capsule-");
  cpSync(REAL_CAPSULE, seed, {
    recursive: true,
    filter: (source) => !source.endsWith(`${path.sep}${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}`),
  });
  return seed;
}


async function establishRealCapsule(seed: string) {
  const release = constructSyntheticRelease(SYNTHETIC_RELEASE_IDENTITY);
  const target = path.join(disposableTree("foundation-m20-real-target-"), "installation");
  const outcome = await establishInstallationFromDirectories({
    release: SYNTHETIC_RELEASE_IDENTITY,
    payloadDirectory: release.payloadDirectory,
    seedDirectory: seed,
    targetRoot: target,
    capsuleDirectory: "deployment",
    installationName: "M20 real-capsule installation",
    installationRepository: "https://github.com/example/m20-real-capsule",
    establishedBy: "FOUNDATION-MULTISITE-M20 integration proof",
  });
  return { outcome, release, target, capsule: targetCapsule(target) };
}

capsuleSuite("§14 — establishment accepts the REAL two-Spoke capsule", () => {
  it("declares exactly foundation + germany in the target, through the declaration authority", async () => {
    const seed = realCapsuleSeed();
    const { outcome, capsule } = await establishRealCapsule(seed);
    if (!outcome.ok) {
      throw new Error(`establishment refused the real capsule: ${outcome.refusals.join(" | ")}`);
    }

    // The authored input was understood as a Spoke COLLECTION, not as one implicit Spoke.
    expect(outcome.result.seedMode).toBe("explicit");
    expect([...outcome.result.seedSpokes]).toEqual(["foundation", "germany"]);

    // …and the TARGET says the same thing, through the same authority the runtime index calls.
    const roots = resolveInstallationSpokeRoots(capsule);
    expect(roots.mode).toBe("explicit");
    expect(roots.descriptors.map((descriptor) => descriptor.id)).toEqual(["foundation", "germany"]);
    for (const descriptor of roots.descriptors) {
      expect(existsSync(path.join(descriptor.root, "site.config.json")), descriptor.id).toBe(true);
      expect(existsSync(path.join(descriptor.root, "config", "i18n")), descriptor.id).toBe(true);
      expect(existsSync(path.join(descriptor.root, "content", "pages")), descriptor.id).toBe(true);
      expect(existsSync(path.join(descriptor.root, "content", "assets")), descriptor.id).toBe(true);
      expect(descriptor.root.startsWith(capsule)).toBe(true);
    }
  });

  it("refuses a declared Spoke root missing its own surfaces, naming that Spoke", async () => {
    const seed = realCapsuleSeed();
    // Remove ONE Spoke's configuration: the capsule is now an INCOMPLETE explicit collection, and the
    // refusal must name that Spoke's own root rather than a root-level file the explicit shape never has.
    rmSync(path.join(seed, "spokes", "germany", "site.config.json"), { force: true });

    const { outcome, target } = await establishRealCapsule(seed);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    // The DECLARATION authority refuses it first — an explicit Spoke root must carry its configuration —
    // and its refusal names the Spoke and the file, which is what an operator needs.
    expect(outcome.failure.category).toBe("installation-validation");
    expect(outcome.failure.message).toMatch(/germany/);
    expect(outcome.failure.message).toMatch(/site\.config\.json/);
    // Nothing durable was written: the refusal came before materialisation.
    expect(existsSync(target)).toBe(false);
  });
});

capsuleSuite("§15 — each Spoke's own model and tree resolve from the TARGET", () => {
  it("resolves each Spoke's OWN sites and pages, and never the other Spoke's", async () => {
    const seed = realCapsuleSeed();
    const { outcome, capsule } = await establishRealCapsule(seed);
    if (!outcome.ok) throw new Error(outcome.refusals.join(" | "));

    const roots = resolveInstallationSpokeRoots(capsule);
    const byId = new Map(roots.descriptors.map((descriptor) => [descriptor.id, descriptor.root]));
    const configOf = (id: string) =>
      parseSiteConfig(JSON.parse(readFileSync(path.join(byId.get(id) ?? "", "site.config.json"), "utf8")));
    const pagesOf = (id: string) =>
      createPageSources({
        sites: configOf(id).sites,
        roots: {
          markdownPagesRoot: path.join(byId.get(id) ?? "", "content", "pages", "markdown"),
          jsonPagesRoot: path.join(byId.get(id) ?? "", "content", "pages", "json"),
        },
      });

    const foundation = configOf("foundation");
    const germany = configOf("germany");
    // Each Spoke's OWN inventory: exactly one Site, with the origin that Spoke claims.
    expect(foundation.sites.map((site) => site.code)).toEqual(["main"]);
    expect(germany.sites.map((site) => site.code)).toEqual(["main"]);
    expect(foundation.url).toBe("https://foundation-template.provelopment.com");
    expect(germany.url).toBe("https://foundation-template-germany.provelopment.com");

    // The Foundation Spoke serves its OWN English material — including the canonical English pages M20
    // installed — and the Germany Spoke serves its OWN German material. GEO-03 R04-C5 — asked of the
    // CAPSULE the establishment actually wrote, because the legacy country-directory resolver refuses
    // the generic Site code `main` by design, and R04 must not widen that authority to make a test pass.
    const homeOf = (id: string, locale: string) =>
      path.join(byId.get(id) ?? "", "content", "pages", "json", "main", locale, `${HOME_CONTENT_SLUG}.json`);
    expect(existsSync(homeOf("foundation", "en-001")), "foundation authors its own English Home").toBe(true);
    expect(existsSync(homeOf("germany", "de-de")), "germany authors its own German Home").toBe(true);
    // The material is genuinely each Spoke's own: the German Home is German.
    expect(readFileSync(homeOf("germany", "de-de"), "utf8")).toMatch(/Deutschland/);

    // NEITHER CAN ANSWER FOR THE OTHER: the other Spoke's Site code is not even declared here.
    expect(await pagesOf("foundation").resolve("main", HOME_CONTENT_SLUG, "de-de")).toBeNull();
    expect(await pagesOf("germany").resolve("main", HOME_CONTENT_SLUG, "en-001")).toBeNull();
  });
});

/** Establish the real capsule into a disposable target, from a disposable immutable release. */

capsuleSuite("§16/§17 — authored bytes travel intact, and nothing outside the target moves", () => {
  it("preserves the manifest, configurations, dictionaries, pages and artwork byte-for-byte", async () => {
    const seed = realCapsuleSeed();
    const before = snapshotTree(seed);
    const { outcome, capsule } = await establishRealCapsule(seed);
    if (!outcome.ok) throw new Error(outcome.refusals.join(" | "));

    const after = snapshotTree(capsule);
    for (const relative of PRESERVED) {
      expect(before.get(relative), `${relative} exists in the seed`).toBeDefined();
      expect(after.get(relative), `${relative} reached the target unchanged`).toBe(before.get(relative));
    }

    // EVERY authored page file of the Foundation Spoke's English tree travelled unchanged, byte for byte.
    const canonical = [...after.keys()].filter((p) =>
      p.startsWith("spokes/foundation/content/pages/") && p.includes("/main/en-001/"),
    );
    expect(canonical.length).toBeGreaterThanOrEqual(2);
    for (const relative of canonical) {
      expect(after.get(relative), relative).toBe(before.get(relative));
    }
    // The authoring documentation every intermediate root now carries travels too.
    for (const relative of [
      "spokes/foundation/content/pages/README.md",
      "spokes/foundation/content/pages/json/ww/README.md",
      "spokes/foundation/content/pages/markdown/ww/README.md",
      "spokes/germany/content/pages/README.md",
      "spokes/germany/content/pages/json/de/README.md",
      "spokes/germany/content/pages/markdown/de/README.md",
    ]) {
      expect(after.get(relative), relative).toBe(before.get(relative));
    }
  });

  it("writes only inside the target: the seed and the release payload are unchanged", async () => {
    const seed = realCapsuleSeed();
    const seedBefore = snapshotTree(seed);
    const release = constructSyntheticRelease(SYNTHETIC_RELEASE_IDENTITY);
    const payloadBefore = snapshotTree(release.payloadDirectory);

    const target = path.join(disposableTree("foundation-m20-only-target-"), "installation");
    const outcome = await establishInstallationFromDirectories({
      release: SYNTHETIC_RELEASE_IDENTITY,
      payloadDirectory: release.payloadDirectory,
      seedDirectory: seed,
      targetRoot: target,
      capsuleDirectory: "deployment",
      installationName: "M20 isolation installation",
      installationRepository: "https://github.com/example/m20-isolation",
      establishedBy: "FOUNDATION-MULTISITE-M20 isolation proof",
    });
    if (!outcome.ok) throw new Error(outcome.refusals.join(" | "));

    // The SOURCES are untouched, file for file.
    expect([...snapshotTree(seed)]).toEqual([...seedBefore]);
    expect([...snapshotTree(release.payloadDirectory)]).toEqual([...payloadBefore]);

    // Every written path is target-relative, cannot escape, and exists in the target. Both halves are
    // covered: the release's platform files, and the authored material inside the installation's capsule.
    const capsule = targetCapsule(target);
    expect(existsSync(capsule)).toBe(true);
    for (const written of outcome.result.writtenFiles) {
      expect(written.startsWith("/"), written).toBe(false);
      expect(written.includes(".."), written).toBe(false);
      expect(existsSync(path.join(target, written)), written).toBe(true);
    }
  });
});

capsuleSuite("§11/§12/§41 — generated state is refused, and the record belongs to THIS establishment", () => {
  it("refuses a seed carrying generated operational state rather than discarding it", async () => {
    const seed = realCapsuleSeed();
    writeFileSync(path.join(seed, INSTALLATION_OPERATIONAL_STATE_FILE_NAME), "{}\n", "utf8");
    const { outcome, target } = await establishRealCapsule(seed);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.refusals.join("\n")).toMatch(/operational-state\.json/);
    expect(existsSync(target)).toBe(false);
  });

  it("does not inherit the seed's adoption record, and writes its own for THIS release", async () => {
    const seed = realCapsuleSeed();
    const seedBaseline = readFileSync(path.join(seed, INSTALLATION_ADOPTION_RECORD_FILE_NAME), "utf8");
    const { outcome, capsule } = await establishRealCapsule(seed);
    if (!outcome.ok) throw new Error(outcome.refusals.join(" | "));

    const targetBaseline = readFileSync(path.join(capsule, INSTALLATION_ADOPTION_RECORD_FILE_NAME), "utf8");
    expect(targetBaseline).not.toBe(seedBaseline);
    expect(JSON.parse(targetBaseline).release.tag).toBe(SYNTHETIC_RELEASE_IDENTITY);
    expect([...outcome.result.notInherited]).toContain(`deployment/${INSTALLATION_ADOPTION_RECORD_FILE_NAME}`);

    // The operational record is INSTALLATION-level (one, at the installation root — never one per Spoke)
    // and it was GENERATED here, naming this installation.
    const record = JSON.parse(
      readFileSync(path.join(capsule, INSTALLATION_OPERATIONAL_STATE_FILE_NAME), "utf8"),
    );
    expect(record.current.installationIdentity.name).toBe("M20 real-capsule installation");
    for (const spoke of ["foundation", "germany"]) {
      expect(
        existsSync(path.join(capsule, "spokes", spoke, INSTALLATION_OPERATIONAL_STATE_FILE_NAME)),
        spoke,
      ).toBe(false);
    }
  });
});
