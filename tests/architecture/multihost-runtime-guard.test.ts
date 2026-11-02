import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE MULTI-HOST RUNTIME GUARD (FOUNDATION-MULTISITE-M16/M17)
 * ==========================================================
 *
 * The multi-Spoke runtime is only safe while a small number of STRUCTURAL facts hold, and each of them is a
 * fact about WHERE a decision is made rather than about a value one test happened to observe:
 *
 *   · the request boundary holds NO configuration authority;
 *   · hostname dispatch is the accepted exact-claim decision, never a wildcard or a suffix rule;
 *   · no "first"/"default" Spoke can be selected anywhere;
 *   · the multi-host public boundaries never select a Spoke through the one-Spoke compatibility seam;
 *   · the PUBLIC route is the page identity, and it consumes the request-selected context and renders through
 *     the SHARED composition;
 *   · the Spoke reaches that route on a PRIVATE upstream header the boundary alone writes;
 *   · the retired `/~spoke` page tree does not exist, and nothing renders under it;
 *   · a Spoke's own asset namespace is bound to the host that owns it;
 *   · sitemap, robots and OpenGraph read the REQUEST-selected context;
 *   · the runtime index composes every declared Spoke while the compatibility seam still refuses two.
 */
const ROOT = process.cwd();
const read = (relative: string) => readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");

const PROXY = "src/proxy.ts";
const ROUTING = "src/config/spoke-routing.ts";
const REQUEST = "src/config/spoke-request.ts";
const SELECTION = "src/config/spoke-selection.ts";
const COMPOSITION = "src/app/[[...segments]]/server-composition.tsx";
const PAGE = "src/app/[[...segments]]/page.tsx";
const LAYOUT = "src/app/[[...segments]]/layout.tsx";
const INTERNAL_IMAGE = "src/app/[site]/[locale]/opengraph-image.tsx";

describe("M16/M17 — the render path", () => {
  it("the multi-host public boundaries select the REQUEST's Spoke, never the compatibility seam", () => {
    for (const file of ["src/app/sitemap.ts", "src/app/robots.ts", PAGE, LAYOUT, REQUEST]) {
      expect(read(file), file).not.toContain("currentBuildRuntimeContext");
    }
    expect(read("src/app/sitemap.ts")).toContain("efsSitemapForCurrentRequest");
    expect(read("src/app/robots.ts")).toContain("efsSitemapUrlForCurrentRequest");
    expect(read(INTERNAL_IMAGE)).toContain("runtimeContextForCurrentRequest");
    expect(read(REQUEST)).toContain("runtimeContextForCurrentRequest");
    expect(read(REQUEST)).toContain("SPOKE_SELECTION_HEADER");
  });

  it("the PUBLIC route consumes the request-selected EFS binding and reuses the shared renderer", () => {
    for (const file of [PAGE, LAYOUT]) {
      const source = read(file);
      // C07-R02 — the request boundary resolves the request's own binding and declared Page. There is no
      // second resolver and no non-production switch: a request either resolves here or is refused.
      expect(source, file).toContain("efsViewForCurrentRequest");
      expect(source, file).toContain("./efs-refusal");
      expect(source, file).not.toContain("legacyTestRuntimeEnabled");
      // No hostname resolution and no global configuration in the App Router code.
      expect(source, file).not.toContain("hostRoutingForBuild");
      expect(source, file).not.toContain("normalizeHostname");
      expect(source, file).not.toContain("siteConfig");
    }
    // ONE presentation path: the shared EFS page view, and the shell from the shared composition.
    expect(read(PAGE)).toContain("EfsPageView");
    expect(read(LAYOUT)).toContain("./server-composition");
    // ONE renderer: the shared composition is the only page/layout/metadata composition.
    expect(read(COMPOSITION)).toContain("export async function pageForContext");
    expect(read(COMPOSITION)).toContain("export async function layoutForContext");
    // The internal page tree is RETIRED: no App Router page identity may live under `/~spoke`.
    expect(() => read("src/app/~spoke/[segment]/[[...segments]]/page.tsx")).toThrow();
    expect(() => read("src/app/~spoke/[segment]/[[...segments]]/layout.tsx")).toThrow();
  });

  it("retires the internal namespace and keeps its spelling in ONE place", () => {
    expect(read(SELECTION)).toContain('"/~spoke"');
    expect(read(SELECTION)).toContain("SPOKE_SELECTION_HEADER");
    // The shared composition — and therefore every rendered document — never mentions it…
    expect(read(COMPOSITION)).not.toContain("~spoke");
    // …nor does the client-safe routing projection the visitor's controls resolve URLs from, nor the
    // context-bound sitemap/robots helpers.
    for (const file of [
      "src/components/site/client-routing.ts",
      "src/app/sitemap-context.ts",
      "src/app/robots-context.ts",
      "src/app/[site]/[locale]/opengraph-model.ts",
    ]) {
      expect(read(file), file).not.toContain("~spoke");
    }
  });
});

describe("M16/M17 — the runtime index and its authorities", () => {
  it("accepts an Installation declaring SEVERAL Spokes, inlined as its own mode", () => {
    const build = read("src/config/deployment-build.mjs");
    expect(build).not.toMatch(/serves EXACTLY ONE Spoke/);
    expect(build).toContain('mode: "multi"');
    expect(build).toContain("resourceRoot: null");
    expect(build).toContain("hostRoutingForInstallation");
    expect(build).toContain("DEPLOYMENT_HOST_ROUTING_ENV");
  });

  it("keeps the one-Spoke compatibility seam refusing two, and never weakens it", () => {
    const runtime = read("src/config/installation-runtime.ts");
    expect(runtime).toContain("export function currentBuildRuntimeContext");
    expect(runtime).toContain("index.spokes.length !== 1");
    expect(runtime).toContain("there is no default Spoke and no manifest-order rule");
  });

  it("fails loudly rather than guessing for single-Spoke-only locations", () => {
    const root = read("src/config/deployment-root.ts");
    expect(root).toContain("selectedSpokeOnly");
    expect(root).toContain('mode === "multi"');
    expect(root).toContain("get resourceRoot");
  });

  it("keeps the ONE-SPOKE compatibility binding importable without side effects", () => {
    // `parseSiteConfig` must be importable in a multi-Spoke Installation (the per-Spoke reader needs it), so
    // the eager compatibility value lives in its own module and the semantic authority stays side-effect free.
    expect(read("src/config/loader.ts")).not.toMatch(/export const siteConfig/);
    expect(read("src/config/loader.ts")).toContain("export function activeDeploymentSiteConfig");
    expect(read("src/config/active-site-config.ts")).toContain("export const siteConfig");
    expect(read("src/config/spoke-config.ts")).toContain('from "./loader"');
  });
});

describe("M16 — the request boundary", () => {
  it("holds no configuration authority of its own", () => {
    const proxy = read(PROXY);
    expect(proxy).not.toContain('from "@/config"');
    // No USE of a configuration value (the doc comment naming what it does NOT read is fine).
    expect(proxy).not.toMatch(/\bsiteConfig\b\s*[.[]/);
    expect(proxy).not.toContain("negotiateLocale");
    expect(proxy).not.toContain("deploymentPaths");
  });

  it("dispatches through the accepted hostname routing authority", () => {
    const proxy = read(PROXY);
    expect(proxy).toContain("hostRoutingForBuild");
    expect(proxy).toContain("spokeSelectionForHost");
    // The exact-claim decision is the DOMAIN's, not a second algorithm here.
    expect(read(ROUTING)).toContain("resolveSpokeFromHost");
    expect(read(ROUTING)).toContain("hostnameFromOrigin");
    expect(proxy).not.toMatch(/endsWith\(|includes\(host\)|startsWith\(host\)/);
  });

  it("refuses the internal namespace and binds a Spoke's assets to its host", () => {
    const proxy = read(PROXY);
    expect(proxy).toContain("isInternalSpokePath");
    expect(proxy).toContain("SPOKE_ASSET_PREFIX");
    // Static (dotted) Spoke paths must be matched too, while `/_next` stays outside the boundary.
    expect(proxy).toContain('"/spokes/:path*"');
    expect(proxy).toContain("_next");
  });

  it("never invents a default or first Spoke", () => {
    const proxy = read(PROXY);
    // ONE-Spoke compatibility is expressed as "the Installation declares exactly one", length-checked.
    expect(proxy).toContain("routing.spokes.length === 1");
    expect(proxy).not.toMatch(/spokes\[0\]\s*\?\?/);
    expect(read(REQUEST)).not.toMatch(/spokes\[0\]\s*\?\?/);
  });
});
