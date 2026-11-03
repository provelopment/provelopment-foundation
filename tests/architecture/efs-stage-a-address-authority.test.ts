import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(file: string): string {
  return readFileSync(join(ROOT, "src", file), "utf8");
}

/**
 * STAGE A OF THE GEOGRAPHIC RETIREMENT (`FOUNDATION-GEO-04-GEOGRAPHIC-RETIREMENT-STAGE-A-R01`)
 * ==========================================================================================
 *
 * Stage A moves bounded APPLICATION address consumers off the legacy geographic Site/region
 * construction and onto the ONE accepted authority. These assertions are the structural half of
 * that proof; the behavioural half stays in the EFS request suites and in the served-route checks.
 *
 * The authority is `src/core/efs/publication.ts` (`D31` §3): explicit binding-owned host/prefix
 * claims, `publicPathBase`, `contentSegments`, `canonicalUrl`, `assetUrl`. `spoke-navigation.ts`
 * still carries `completePublicPath` for its own historical unit suite, but once the orphaned
 * `request-context.ts` entrypoint is retired no APPLICATION module may reach it — otherwise a
 * second completion path could answer an EFS host, which is exactly the duplicate authority the
 * retirement exists to remove.
 */
describe("Stage A — one EFS address authority at the application boundary", () => {
  it("keeps the orphaned legacy public-destination entrypoint retired", () => {
    expect(
      existsSync(join(ROOT, "src", "app", "[[...segments]]", "request-context.ts")),
      "the legacy request-context entrypoint must stay retired",
    ).toBe(false);
  });

  it("leaves no application consumer of the legacy path completion", () => {
    const applicationFiles = [
      "app/[[...segments]]/page.tsx",
      "app/[[...segments]]/layout.tsx",
      "app/[[...segments]]/not-found.tsx",
      "app/[[...segments]]/error.tsx",
      "app/[[...segments]]/efs-connect.tsx",
      "app/sitemap.ts",
      "app/robots.ts",
    ];
    for (const file of applicationFiles) {
      const text = source(file);
      expect(text, `${file} must not complete a public path`).not.toContain("completePublicPath");
      expect(text, `${file} must not resolve a legacy destination`).not.toContain(
        "requestPublicDestination",
      );
      expect(text, `${file} must not select a Spoke itself`).not.toContain("requestSpokeContext");
    }
  });

  it("serves sitemap and robots from the EFS request boundary, never the legacy context module", () => {
    for (const file of ["app/sitemap.ts", "app/robots.ts"]) {
      const text = source(file);
      expect(text, `${file} must ask the EFS boundary`).toContain("efs-request");
      expect(text, `${file} must not import the legacy sitemap context`).not.toContain(
        'from "@/app/sitemap-context"',
      );
    }
  });

  it("keeps the D31 address authority in exactly one module", () => {
    const publication = source("core/efs/publication.ts");
    for (const symbol of [
      "matchBinding",
      "parseContentRoute",
      "publicPathBase",
      "contentSegments",
      "canonicalUrl",
      "assetUrl",
    ]) {
      expect(publication, `publication.ts must export ${symbol}`).toContain(
        `export function ${symbol}`,
      );
    }
  });
});
