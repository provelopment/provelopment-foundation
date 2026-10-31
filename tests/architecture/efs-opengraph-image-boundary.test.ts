import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EFS_IMAGE_PATH_HEADER, OPEN_GRAPH_IMAGE_SEGMENT } from "@/config/efs/image-path";

/**
 * THE RESERVED OPEN GRAPH IMAGE ENDPOINT (`GEO-03` R04-C21)
 * =======================================================
 *
 * Three properties are structural, so they are asserted on the source rather than by rendering:
 *
 *   1. ONE renderer. The legacy boundary and the EFS boundary compose the SAME view — a second card would drift;
 *   2. ONE entry. Only the request boundary declares the public path, and the image route refuses without it;
 *   3. NO second route. No image route lives under the page catch-all, and no Page may claim the suffix.
 */
const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, ...relative.split("/")), "utf8");
const APP = "src/app";
const IMAGE_ROUTE = `${APP}/efs-opengraph-image/route.ts`;
const LEGACY_ROUTE = `${APP}/[site]/[locale]/opengraph-image.tsx`;
const MODEL = `${APP}/efs-opengraph-image-model.ts`;

describe("the reserved Open Graph image endpoint", () => {
  it("serves through ONE internal route that refuses without the boundary's private path", () => {
    expect(existsSync(join(ROOT, ...IMAGE_ROUTE.split("/")))).toBe(true);
    const route = read(IMAGE_ROUTE);
    expect(route).toContain("EFS_IMAGE_PATH_HEADER");
    expect(route).toContain("OpenGraphImageForCurrentRequest");
    expect(route).toContain("force-dynamic");
    // A direct hit on the internal path carries no public identity, so it is refused, not guessed.
    expect(route).toMatch(/if \(publicPath === null\) return refuse\(\);/);
    // No hostname reasoning and no ownership decision of its own.
    expect(route).not.toMatch(/normalizeHostname|siteConfig|deploymentPaths/);
  });

  it("is drawn by the SAME view the legacy boundary draws — one renderer, no second card", () => {
    const shared = read(`${APP}/[site]/[locale]/opengraph-image-view.tsx`);
    expect(shared).toContain("export function openGraphImageElement");
    expect(shared).toContain("export interface OpenGraphImageContent");
    expect(read(IMAGE_ROUTE)).toContain("openGraphImageElement");
    expect(read(LEGACY_ROUTE)).toContain("openGraphImageElement");
  });

  it("keeps the public path in ONE place: only the request boundary sets the private header", () => {
    const sourceFiles = readdirSync(join(ROOT, "src"), { recursive: true })
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => `src/${entry.split("\\").join("/")}`)
      .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"));
    // `src/proxy.ts` is the only module that DECLARES the original public path; the route only reads it.
    const setters = sourceFiles.filter((file) => read(file).includes(".set(EFS_IMAGE_PATH_HEADER"));
    expect(setters).toEqual(["src/proxy.ts"]);
  });

  it("cannot be re-created as a file-convention route under the page catch-all", () => {
    expect(existsSync(join(ROOT, APP, "[[...segments]]", "opengraph-image.tsx"))).toBe(false);
    expect(
      readdirSync(join(ROOT, APP, "[[...segments]]"), { withFileTypes: true }).filter((entry) =>
        entry.isDirectory(),
      ),
    ).toEqual([]);
  });

  it("keeps the model PURE: no filesystem, no framework, no manifest, no pixels", () => {
    const model = read(MODEL);
    for (const forbidden of ["node:fs", "node:path", "next/", "ImageResponse", "efs/manifest", "deployment"]) {
      expect(model, `${MODEL} must not reach ${forbidden}`).not.toContain(forbidden);
    }
    expect(model).toContain("export function openGraphImageForEfs");
  });

  it("reserves the suffix for the endpoint: no EFS Page may declare it as a route", () => {
    expect(OPEN_GRAPH_IMAGE_SEGMENT).toBe("opengraph-image");
    const manifest = JSON.parse(read("deployment/efs/manifest.json")) as {
      entities: { facets: { sites: { pages: { route: string[] }[] }[] }[] }[];
    };
    const routes = manifest.entities.flatMap((entity) =>
      entity.facets.flatMap((facet) => facet.sites.flatMap((site) => site.pages.flatMap((page) => page.route))),
    );
    expect(routes).not.toContain(OPEN_GRAPH_IMAGE_SEGMENT);
    // And the reserved header name is the one the boundary and the route share.
    expect(EFS_IMAGE_PATH_HEADER).toBe("x-foundation-efs-image-path");
  });
});

describe("the image-path marker is the boundary's, never the client's (R04-C21-R02 F1)", () => {
  it("refuses the INTERNAL route as a public address, before any header is read", () => {
    const proxy = read("src/proxy.ts");
    // The internal route is answered by the boundary itself; a direct caller never reaches the handler.
    expect(proxy).toContain("if (pathname === EFS_OPEN_GRAPH_IMAGE_ROUTE) return refuse();");
    // ...and the rewrite is the ONLY place the marker is produced.
    expect(proxy.match(/\.set\(EFS_IMAGE_PATH_HEADER/g) ?? []).toHaveLength(1);
  });

  it("strips whatever the client sent on EVERY pass-through, so no branch forwards it", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).toContain("function passThroughHeaders(source: Headers): Headers");
    expect(proxy).toContain("headers.delete(EFS_IMAGE_PATH_HEADER);");
    // No pass-through may hand the request headers on unexamined: that was the forgery vector.
    expect(proxy).not.toContain("NextResponse.next({ request: { headers: request.headers } })");
    // The helper is the ONLY place request headers are copied, so every pass-through necessarily strips the
    // marker before the request continues upstream.
    expect(proxy.match(/new Headers\(/g) ?? []).toHaveLength(1);
  });
});
