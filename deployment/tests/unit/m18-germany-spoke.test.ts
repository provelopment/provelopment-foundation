/**
 * THE REAL TWO-SPOKE DEPLOYMENT, PROVED AGAINST THE REAL DEPLOYMENT (FOUNDATION-MULTISITE-M18)
 * ==============================================================================================
 *
 * Every earlier multi-Spoke proof ran on disposable Alpha/Beta fixtures. THIS one runs on the deployment
 * the repository actually ships — `deployment/spokes.json` declaring `foundation` + `germany` — and it
 * proves the facts that activation depends on, through the accepted runtime authorities alone:
 *
 *   §19  the Installation declares EXACTLY TWO Spokes, with the two canonical origins, and no default
 *   §20  A/B/A/B context isolation: Site sets, origins, content trees and asset namespaces never cross
 *   §21  dictionary-ROOT ownership: each Spoke reads its own dictionary tree (identical wording is fine;
 *        reading the other Spoke's root is not)
 *   §18  the generated runtime catalog publishes THREE namespaces, and each context serves platform-first
 *
 * It resolves contexts from `./support/spoke-contexts` (the deployment-scope binding) and asserts NOTHING
 * about the runtime architecture: it exercises it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import { deploymentPaths } from "@/config/deployment-root";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
} from "@/config/installation-runtime";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import { HOME_CONTENT_SLUG } from "@/core/page-content";
import { foundationSpoke, germanySpoke, type DeploymentSpoke } from "../support/spoke-contexts";

const FOUNDATION_ORIGIN = "https://foundation-template.provelopment.com";
const GERMANY_ORIGIN = "https://foundation-template-germany.provelopment.com";

const SPOKES: readonly DeploymentSpoke[] = [foundationSpoke, germanySpoke];

describe("§19 — the real Installation is genuinely TWO-Spoke", () => {
  it("declares exactly two Spokes, in authored manifest order", () => {
    const resolved = resolveDeploymentForBuild();
    const index = installationRuntimeIndex(deploymentPaths().root);

    // The AUTHORING mode is `explicit` (the manifest declares the Spokes) …
    expect(index.mode).toBe("explicit");
    expect(index.spokes.map((spoke) => spoke.id)).toEqual(["foundation", "germany"]);
    expect(index.spokes).toHaveLength(2);

    // … and the RUNTIME is genuinely multi-Spoke: hostname dispatch, NO inlined single configuration and
    // NO installation-wide resource root — there is no default Spoke to fall back to (§19).
    expect(resolved.mode).toBe("multi");
    expect(resolved.config).toBe("");
    expect(resolved.resourceRoot).toBeNull();
    expect(resolved.hostRouting.mode).toBe("multi");
    expect(resolved.hostRouting.spokes.map((spoke) => [spoke.id, spoke.canonicalOrigin])).toEqual([
      ["foundation", FOUNDATION_ORIGIN],
      ["germany", GERMANY_ORIGIN],
    ]);
  });

  it("claims the two canonical hostnames, one Spoke each", () => {
    expect(foundationSpoke.context.canonicalHostname).toBe("foundation-template.provelopment.com");
    expect(germanySpoke.context.canonicalHostname).toBe("foundation-template-germany.provelopment.com");
    const claims = SPOKES.flatMap((spoke) => [...spoke.context.hostnameClaims]);
    expect(new Set(claims).size).toBe(claims.length);
  });

  it("answers NOTHING for an identity it does not declare — never a default or a first Spoke", () => {
    const index = installationRuntimeIndex(deploymentPaths().root);
    for (const unknown of ["foundation-web", "de", "ww", "", "third"]) {
      expect(runtimeContextForSpoke(index, unknown), unknown).toBeNull();
    }
  });

  it("binds each Spoke to its own canonical origin", () => {
    expect(foundationSpoke.config.url).toBe(FOUNDATION_ORIGIN);
    expect(germanySpoke.config.url).toBe(GERMANY_ORIGIN);
  });
});

describe("§20 — A/B/A/B: the two real contexts never cross", () => {
  it("keeps each Spoke's Site set to its own, and only its own", () => {
    // GEO-03 — both Spokes publish ONE Site, and after the migration that Site carries the generic
    // presentation identity `main` on BOTH sides. The code is no longer what separates them (it never
    // may again); ownership of the authored tree does, which is asserted below and in §21.
    expect(foundationSpoke.config.sites.map((site) => site.code)).toEqual(["main"]);
    expect(germanySpoke.config.sites.map((site) => site.code)).toEqual(["main"]);
    expect(foundationSpoke.config.sites).toHaveLength(1);
    expect(germanySpoke.config.sites).toHaveLength(1);
  });

  it("answers A/B/A/B identically per Spoke, and differently between them", async () => {
    const answer = async (spoke: DeploymentSpoke) => {
      const site = spoke.config.sites[0];
      const locale = site.locales[0].path;
      return {
        origin: spoke.config.url,
        sites: spoke.config.sites.map((candidate) => candidate.code).join(","),
        home: readFileSync(
          path.join(spoke.resources.jsonPagesRoot, "main", locale, `${HOME_CONTENT_SLUG}.json`),
          "utf8",
        ).length,

        namespaces: spoke.context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase).join(","),
      };
    };

    const a1 = await answer(foundationSpoke);
    const b1 = await answer(germanySpoke);
    const a2 = await answer(foundationSpoke);
    const b2 = await answer(germanySpoke);

    expect(a1).toEqual(a2);
    expect(b1).toEqual(b2);
    expect(a1).not.toEqual(b1);
    expect(a1.sites).toBe("main");
    // GEO-03 — BOTH Spokes now declare the same Site code, `main`. The Site code no longer carries
    // geography, so it can no longer be what distinguishes the two contexts; the proof moves to the
    // accepted authority: ownership of the authored tree (asserted below and in §21) and the Spoke's
    // own origin. Two Spokes may legally hold the same site code without colliding.
    expect(b1.sites).toBe("main");

    expect(a1.origin).toBe(FOUNDATION_ORIGIN);
    expect(b1.origin).toBe(GERMANY_ORIGIN);
  });

  it("never answers one Spoke's coordinates from the other Spoke's tree", async () => {
    // Both Spokes declare the SAME Site code, so a cross-Spoke answer cannot be prevented by the CODE:
    // it is prevented by OWNERSHIP of the authored tree. Each Spoke authors its OWN Home representation,
    // in its own root, under its own default locale …
    for (const spoke of SPOKES) {
      const locale = spoke.config.sites[0].defaultLocale;
      const file = path.join(spoke.resources.jsonPagesRoot, "main", locale, `${HOME_CONTENT_SLUG}.json`);
      expect(existsSync(file), `${spoke.id} authors its own Home in ${locale}`).toBe(true);
    }
    // … the two roots are different trees, so one Spoke's Home can never be read from the other's …
    expect(foundationSpoke.resources.jsonPagesRoot).not.toBe(germanySpoke.resources.jsonPagesRoot);
    // … and a Page only ONE Entity authors exists in that Entity's own capsule, and in no other (§29).
    const capsule = path.join(process.cwd(), "deployment", "efs", "capsule");
    expect(
      existsSync(path.join(capsule, "e_00000000000000000000000002", "germany", "main", "pages", "berlin", "de-de.md")),
      "Germany authors its own location landing",
    ).toBe(true);
    expect(
      existsSync(path.join(capsule, "e_00000000000000000000000001", "foundation", "main", "pages", "berlin")),
      "the Foundation Entity authors no Germany landing",
    ).toBe(false);
  });
});

describe("§21 — dictionary ROOT ownership", () => {
  it("gives each Spoke its own dictionary tree, and reads only that one", () => {
    expect(foundationSpoke.resources.dictionaryRoot).not.toBe(germanySpoke.resources.dictionaryRoot);
    expect(foundationSpoke.resources.dictionaryRoot).toContain(path.join("spokes", "foundation"));
    expect(germanySpoke.resources.dictionaryRoot).toContain(path.join("spokes", "germany"));

    // Each access object reads its OWN root. The wording may be identical today (the dictionaries were
    // copied byte-identically at migration, M18 §10) — the proof is OWNERSHIP, not divergence.
    const foundation = dictionaryAccessForRuntimeContext(foundationSpoke.context);
    const germany = dictionaryAccessForRuntimeContext(germanySpoke.context);
    expect(foundation.get("en").language.label).toBe("Language");
    expect(germany.get("de").language.label).toBe("Sprache");
  });
});

describe("§18 — the generated runtime catalog publishes THREE namespaces", () => {
  const catalog = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src", "config", "generated", "runtime-asset-catalog.json"),
      "utf8",
    ),
  ) as { namespaces: Record<string, Record<string, unknown>> };

  it("carries the platform namespace and BOTH Spoke namespaces", () => {
    expect(Object.keys(catalog.namespaces).sort()).toEqual([
      "/assets",
      "/spokes/foundation/assets",
      "/spokes/germany/assets",
    ]);
    expect(Object.keys(catalog.namespaces["/spokes/germany/assets"]).length).toBeGreaterThan(0);
  });

  it("gives each context platform-first namespaces, and never the other Spoke's", () => {
    for (const spoke of SPOKES) {
      const bases = spoke.context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase);
      expect(bases[0], "platform artwork is always first").toBe("/assets");
      expect(bases).toEqual(["/assets", `/spokes/${spoke.id}/assets`]);
      const other = spoke.id === "foundation" ? "germany" : "foundation";
      expect(bases).not.toContain(`/spokes/${other}/assets`);
    }
  });

  it("ships the Spoke-owned role artwork in EACH Spoke's namespace, and platform artwork ONCE", () => {
    const foundation = new Set(Object.keys(catalog.namespaces["/spokes/foundation/assets"]));
    const germany = new Set(Object.keys(catalog.namespaces["/spokes/germany/assets"]));
    const platform = new Set(Object.keys(catalog.namespaces["/assets"]));

    for (const role of [
      "favicon.svg",
      "logo-header.svg",
      "logo-footer.svg",
      "header-graphic.svg",
      "footer-graphic.svg",
      "sidebar-open.svg",
      "sidebar-close.svg",
      "sidebar-default-icon-open.svg",
      "sidebar-default-icon-closed.svg",
    ]) {
      expect(foundation.has(role), `foundation Spoke ships ${role}`).toBe(true);
      expect(germany.has(role), `germany Spoke ships ${role}`).toBe(true);
    }

    // M17 — platform-owned artwork is authored ONCE and shared: it is never duplicated into a Spoke's
    // namespace, so a Spoke can neither shadow it nor drift from it.
    expect(foundation.has("icon-home.svg")).toBe(false);
    expect(germany.has("icon-home.svg")).toBe(false);
    expect(platform.has("icon-home.svg")).toBe(true);
  });
});
