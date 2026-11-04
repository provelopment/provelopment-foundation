import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M14 GUARD — THE CLIENT AND METADATA SURFACES HOLD NO GLOBAL SPOKE AUTHORITY
 * ==========================================================================
 *
 * After Milestone 14 there is no request/render/metadata surface left that needs a module-global Spoke
 * configuration to answer a Spoke-specific question:
 *
 *   client controls   read the SERVER's narrow, serializable `ClientRoutingContext` through the ONE client
 *                     transport, and can reach no server-only capability at all;
 *   OpenGraph image   selects the current build's context and asks the context-bound image model;
 *   sitemap / robots  select the current build's context and delegate to `sitemapForContext` /
 *                     `robotsForContext`, which take the origin and the page roots from THAT context.
 *
 * These are SOURCE facts (comments stripped), so a future edit cannot quietly reintroduce a global lookup, a
 * second client transport, or another Spoke's data on a client boundary. Compatibility modules may still
 * exist as APIs for later lifecycle tooling; what is forbidden is a SURFACE depending on them for authority.
 */

const APP = path.join(process.cwd(), "src", "app");
const COMPONENTS = path.join(process.cwd(), "src", "components");

function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    });
}

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(full)) found.push(full);
  }
  return found;
}

const code = (file: string): string => codeLines(file).join("\n");
const relative = (file: string): string =>
  path.relative(process.cwd(), file).split(path.sep).join("/");

const OG_IMAGE = path.join(APP, "[site]", "[locale]", "opengraph-image.tsx");
const OG_MODEL = path.join(APP, "[site]", "[locale]", "opengraph-model.ts");
const SITEMAP = path.join(APP, "sitemap.ts");
const SITEMAP_CONTEXT = path.join(APP, "sitemap-context.ts");
const ROBOTS = path.join(APP, "robots.ts");
const ROBOTS_CONTEXT = path.join(APP, "robots-context.ts");

const ROUTING_CONTROLS = [
  "src/components/site/context-connect-heading.tsx",
  "src/components/site/context-nav-links.tsx",
  "src/components/site/language-switcher.tsx",
  "src/components/site/location-switcher.tsx",
];

describe("M14 — client routing projection guard", () => {
  it("removed the global configuration from all four routing controls", () => {
    for (const control of ROUTING_CONTROLS) {
      const source = code(path.join(process.cwd(), control));
      expect(source, control).not.toContain('from "@/config"');
      expect(source, control).not.toContain("siteConfig");
      // …and each reads the ONE client transport instead.
      expect(source, control).toContain("useClientRouting()");
    }
  });

  it("lets no CLIENT file reach server-only capability", () => {
    for (const file of sourceFiles(COMPONENTS)) {
      if (!readFileSync(file, "utf8").includes('"use client"')) continue;
      const source = code(file);
      for (const forbidden of [
        "installation-runtime",
        "runtime-asset-resolver",
        "runtime-dictionaries",
        "node:fs",
        "node:path",
        "SpokeRuntimeContext",
      ]) {
        expect(source, `${relative(file)} must not use ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("keeps the client transport singular and server-supplied", () => {
    // ONE provider definition, and the SERVER composes it: the document composition plus the two chrome
    // components that compose routing controls directly (so their own tests need no wrapper).
    const providerFiles = sourceFiles(path.join(process.cwd(), "src")).filter((file) =>
      code(file).includes("ClientRoutingProvider"),
    );
    expect(providerFiles.map(relative).sort()).toEqual([
      "src/app/[[...segments]]/efs-shell.tsx",
      "src/app/[[...segments]]/server-composition.tsx",
      "src/components/site/client-routing-context.tsx",
      "src/components/site/site-footer.tsx",
      "src/components/site/site-header.tsx",
    ]);
    // R10 — `efs-shell.tsx` is the SHARED document: it composes the client transport for the LEGACY
    // presentation only, and the EFS presentation is composed without it. The transport therefore
    // stays singular and server-supplied; it is never created by a client or by a second authority.
  });

  it("keeps the routing projection narrow, serializable and Spoke-local", () => {
    const projection = code(path.join(process.cwd(), "src/components/site/client-routing.ts"));
    // The projection is built from ONE configuration and precomputes every derived answer.
    expect(projection).toContain("buildClientRoutingContext");
    expect(projection).toContain("siteSet");
    expect(projection).toContain("pageBindings");
    expect(projection).toContain("localeLabels");
    expect(projection).toContain("regionSortLabels");
    expect(projection).toContain("regionDefaultLocales");
    // It may not carry anything server-only or another Spoke's authority.
    for (const forbidden of ["node:fs", "node:path", "runtime-dictionaries", "installation-runtime"]) {
      expect(projection, forbidden).not.toContain(forbidden);
    }
  });
});

describe("M14 — metadata surfaces guard", () => {
  it("keeps the OpenGraph route context-bound", () => {
    const route = code(OG_IMAGE);
    expect(route).not.toContain('from "@/config"');
    expect(route).not.toContain("getDictionary(");
    expect(route).not.toContain("siteConfig");
    expect(route).toContain("runtimeContextForCurrentRequest");
    expect(route).toContain("openGraphImageModelForContext");

    const model = code(OG_MODEL);
    expect(model).not.toContain('from "@/config"');
    expect(model).not.toContain("getDictionary(");
    expect(model).toContain("dictionaryAccessForRuntimeContext(context)");
  });

  it("keeps sitemap and robots EFS-declaration-bound", () => {
    for (const [route, contextFile, efsToken] of [
      [SITEMAP, SITEMAP_CONTEXT, "efsSitemapForCurrentRequest"],
      [ROBOTS, ROBOTS_CONTEXT, "efsSitemapUrlForCurrentRequest"],
    ] as const) {
      const source = code(route);
      expect(source, relative(route)).not.toContain('from "@/config"');
      expect(source, relative(route)).not.toContain("siteConfig");
      // C07-R02 — discovery answers the request's own EFS binding. The compatibility context seam is no
      // longer reachable from an App Router route in any environment.
      expect(source, relative(route)).toContain(efsToken);
      expect(source, relative(route)).not.toContain("runtimeContextForRequest()");

      const composition = code(contextFile);
      expect(composition, relative(contextFile)).not.toContain('from "@/config"');
      expect(composition, relative(contextFile)).not.toContain("deploymentPaths");
      expect(composition, relative(contextFile)).toContain("context.siteConfig");
    }

    // The sitemap's inventory comes from the CONTEXT's own authored roots; the robots origin too.
    expect(code(SITEMAP_CONTEXT)).toContain("roots: context.resources");
    expect(code(ROBOTS_CONTEXT)).toContain("context.siteConfig.url");
  });
});
