import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * M13 GUARD — THE SERVER RENDER GRAPH HOLDS NO GLOBAL SPOKE AUTHORITY
 * ===================================================================
 *
 * After the render conversion, the page route and the root layout CHOOSE one context at the application
 * boundary (`currentBuildRuntimeContext()`, the accepted one-Spoke compatibility seam) and hand it to the
 * shared composition, which derives every Spoke-specific answer from it. These are SOURCE facts, so a future
 * edit cannot quietly reintroduce a module-global Spoke authority, a second renderer, or a "current Spoke"
 * of any kind into the shared path.
 *
 * The compatibility modules (`@/config`'s siteConfig, `@/config/i18n`'s getDictionary, `@/config/assets`'
 * projections) remain available to unconverted surfaces — and to the CLIENT components whose cleanup is
 * Milestone 14 — so this guard forbids them ONLY in the shared server composition and its boundary.
 *
 * Comments are stripped before every assertion: prose may name these modules (it must, to be maintained).
 */

const SEGMENT_DIRECTORY = path.join(process.cwd(), "src", "app", "[[...segments]]");
const COMPOSITION = path.join(SEGMENT_DIRECTORY, "server-composition.tsx");
const PAGE = path.join(SEGMENT_DIRECTORY, "page.tsx");
const LAYOUT = path.join(SEGMENT_DIRECTORY, "layout.tsx");

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

describe("M13 — shared server composition guard", () => {
  it("derives every Spoke answer from the context, never from a module-global authority", () => {
    const composition = code(COMPOSITION);

    // The compatibility bindings may not appear in the shared path at all.
    for (const forbidden of [
      "getDictionary(",
      "deploymentPaths",
      'from "@/config"',
      "compatibilityResolver",
      "currentBuildRuntimeContext",
    ]) {
      expect(composition, forbidden).not.toContain(forbidden);
    }

    // Every Spoke fact arrives from the context it was handed.
    expect(composition).toContain("context.siteConfig");
    expect(composition).toContain("context.resources");
    expect(composition).toContain("context.runtimeAssetNamespaces");
    expect(composition).toContain("dictionaryAccessForRuntimeContext(context)");
    expect(composition).toContain(
      "createRuntimeAssetOwnershipResolver(context.runtimeAssetNamespaces)",
    );
    expect(composition).toContain(
      "createPageSources({ sites: siteConfig.sites, roots: context.resources })",
    );
  });

  it("asks the context's OWN resolver for every context-dependent asset answer", () => {
    const composition = code(COMPOSITION);
    // Projections the composition asks FOR ITSELF must come from the context's resolver…
    for (const projection of [
      "availableBannerPath",
      "availableBackgroundMap",
      "availableStatusGraphicPath",
      "availableIconUrl",
      "runtimeAssetUrl",
      "resolveIconControlUrl",
      "readImageDimensions",
    ]) {
      const bare = new RegExp(String.raw`(^|[^.\w])${projection}\(`);
      expect(bare.test(composition), `${projection} must be asked of the context's resolver`).toBe(
        false,
      );
      expect(composition, projection).toContain(`assets.${projection}`);
    }

    // …and the header/footer graphic roles are asked by the CHROME, which receives that same resolver as a
    // prop: the composition may never call the compatibility projection itself.
    for (const projection of ["availableFooterGraphicPath", "availableHeaderGraphicPath"]) {
      const bare = new RegExp(String.raw`(^|[^.\w])${projection}\(`);
      expect(bare.test(composition), `${projection} must not be called by the composition`).toBe(
        false,
      );
      expect(composition).toContain("assets={assets}");
    }
  });

  it("keeps ONE reusable server renderer — no legacy path beside it", () => {
    const callers = sourceFiles(SEGMENT_DIRECTORY).filter((file) =>
      code(file).includes("createPageSources("),
    );
    // The shared composition owns page-source creation for the server graph; the boundary files do not.
    expect(callers.map(relative)).toEqual(["src/app/[[...segments]]/server-composition.tsx"]);
    expect(code(PAGE)).not.toContain("createPageSources");
    expect(code(LAYOUT)).not.toContain("createPageSources");
  });

  it("selects the Spoke from the REQUEST at the application boundary, never from a module-global", () => {
    for (const boundary of [PAGE, LAYOUT]) {
      const source = code(boundary);
      // M17 — the boundary consumes the Spoke the REQUEST selected (the boundary's exact hostname claim,
      // carried on a private upstream header). The one-Spoke compatibility seam is no longer the page
      // authority; it remains available to legitimate compatibility tooling.
      // C07-R02 — the boundary consumes the request's own EFS binding; the compatibility seam is not
      // reachable from a Next entrypoint, and the refusal is the only alternative to a resolved Page.
      expect(source, relative(boundary)).toContain("efsViewForCurrentRequest");
      expect(source, relative(boundary)).toContain("missingEfsInstallation");
      expect(source, relative(boundary)).not.toContain("requestPublicDestination");
      expect(source, relative(boundary)).not.toContain("currentBuildRuntimeContext");
      // The boundary only CHOOSES the context; it renders nothing itself.
      expect(source, relative(boundary)).not.toContain("getDictionary(");
      expect(source, relative(boundary)).not.toContain("createRuntimeAssetOwnershipResolver");
      expect(source, relative(boundary)).not.toContain("createPageSources");
      expect(source, relative(boundary)).not.toContain("resolveUiConfig");
    }
  });

  it("holds no active/current/selected/default Spoke state anywhere in the segment", () => {
    for (const file of sourceFiles(SEGMENT_DIRECTORY)) {
      const source = code(file);
      expect(source.split("\n").filter((line) => /^(?:export )?(?:let|var)\b/.test(line))).toEqual(
        [],
      );
      for (const word of ["activeSpoke", "currentSpoke", "selectedSpoke", "defaultSpoke", "spokes[0]"]) {
        expect(source, `${relative(file)} must not hold ${word}`).not.toContain(word);
      }
    }
  });

  it("records zero remaining client compatibility consumers (Milestone 14 removed all four)", () => {
    // M13 pinned the exact four client consumers of the global configuration; M14 removed them (the four
    // controls now read the server's routing projection), so the list must stay EMPTY — a fifth consumer
    // must never appear as a replacement.
    const clientConsumers = sourceFiles(path.join(process.cwd(), "src", "components"))
      .filter((file) => readFileSync(file, "utf8").includes('"use client"'))
      .filter((file) =>
        /import \{[^}]*siteConfig[^}]*\} from "@\/config"|import \{ siteConfig \} from "@\/config"/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map(relative)
      .sort();

    expect(clientConsumers).toEqual([]);
  });
});
