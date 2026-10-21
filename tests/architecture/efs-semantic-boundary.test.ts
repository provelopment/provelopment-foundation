import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(file: string): string {
  return readFileSync(join(ROOT, "src", file), "utf8");
}

function functionBody(text: string, name: string): string {
  const start = text.indexOf(`export async function ${name}`);
  const fallback = text.indexOf(`export function ${name}`);
  const from = start >= 0 ? start : fallback;
  expect(from, `${name} exists`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n}", from);
  return text.slice(from, end >= 0 ? end : undefined);
}

describe("EFS semantic boundary (R03)", () => {
  it("does not reach legacy completion, site-locale inference or Location routing from the EFS shell", () => {
    const composition = source("app/[[...segments]]/server-composition.tsx");
    const layout = functionBody(composition, "layoutForEfsContext");
    expect(layout).not.toContain("completePublicPath");
    expect(layout).not.toContain("requestPublicDestination");
    expect(layout).not.toContain("resolveSiteLocale");
    expect(layout).not.toContain("requiredLocationDestination");
    expect(layout).not.toContain("locationSelection");
    expect(layout).not.toContain("siteConfig.regions");
  });

  it("builds the shell with explicit locales and no geography-bearing legacy state", () => {
    const composition = source("app/[[...segments]]/server-composition.tsx");
    const build = functionBody(composition, "efsShellPresentationConfig");
    expect(build).toContain("canonicalLocaleTag(locale)");
    expect(build).toContain("locationSelection: null");
    expect(build).toContain("regions: {}");
    expect(build).toContain("pageBindings: []");
    expect(build).toContain("timezone: undefined");
    expect(build).toContain("locations: []");
    expect(build).toContain("view.publication.presentationSiteCode");
    expect(build).toContain("publicPathBase(view.binding, view.site.id)");
    expect(build).not.toContain("view.binding.prefix");
    expect(build).not.toContain("prefix[0]");
    expect(build).not.toContain("resolveSiteLocale");
    expect(build).not.toContain("defaultSiteLabel");
  });

  it("resolves publication ownership from declarations, never from a host or prefix match", () => {
    const request = source("app/[[...segments]]/efs-request.ts");
    expect(request).toContain("publicationForBinding(manifest.publications, matched.binding)");
    expect(request).toContain("efsPublicationOwnerForRequest(publication, host)");
    expect(request).not.toContain("publicationOwnedBy(publication, context)");
    expect(request).not.toContain("runtimeContextForCurrentRequest");
    expect(request).not.toContain("publication.spokeId === matched.binding.prefix");
    expect(request).not.toContain("binding.host === publication.spokeId");
  });

  it("has no null-context or reserved-implicit owner bypass on any EFS surface", () => {
    for (const file of [
      "config/efs/owner.ts",
      "app/[[...segments]]/efs-request.ts",
      "app/[[...segments]]/layout.tsx",
      "app/[[...segments]]/page.tsx",
      "app/[[...segments]]/server-composition.tsx",
      "app/efs-asset-response.ts",
      "app/sitemap.ts",
      "app/robots.ts",
    ]) {
      const text = source(file);
      expect(text, file).not.toContain("IMPLICIT_SPOKE_ID");
      expect(text, file).not.toContain("context.id ===");
      expect(text, file).not.toContain("context === null ||");
    }
    const owner = source("config/efs/owner.ts");
    expect(owner).toContain("publicationOwnedBy(publication, runtimeIdentity(spoke))");
    expect(owner).toContain("installationRuntimeIndexForBuild()");
    expect(owner).toContain("host-is-claimed-by-another-spoke");
  });

  it("allows the retired resolver only through the non-production test utility", () => {
    const utility = source("app/[[...segments]]/legacy-test-runtime.ts");
    expect(utility).toContain('process.env.NODE_ENV !== "production"');
    expect(utility).toContain("FOUNDATION_ENABLE_LEGACY_TEST_RUNTIME");
    const request = source("app/[[...segments]]/efs-request.ts");
    expect(request).toContain("if (legacyTestRuntimeEnabled()) return null;");
    expect(request).toContain("missingEfsInstallation();");
  });

  it("keeps the EFS resolver and locale authority free of Site/country inference", () => {
    for (const file of ["app/[[...segments]]/efs-request.ts", "core/efs/locales.ts", "core/efs/publication.ts"]) {
      const text = source(file);
      expect(text, file).not.toContain("site-locale");
      expect(text, file).not.toContain("resolveSiteLocale");
      expect(text, file).not.toContain("isWorldwideSiteCode");
      expect(text, file).not.toContain("COUNTRY_SITE_CODES");
      expect(text, file).not.toMatch(/\bEurope\//);
    }
  });

  it("does not derive a locale from a country code inside EFS canonicalization", () => {
    const locales = source("core/efs/locales.ts");
    expect(locales).not.toMatch(/`\$\{[^}]+\}-\$\{[^}]+\}`/);
    expect(locales).toContain("canonicalLocaleTag");
  });
});
