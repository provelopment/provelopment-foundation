import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sitemapEntries } from "@/core/efs/discovery";
import {
  assetUrl,
  bindingIssues,
  canonicalUrl,
  contentSegments,
  entryRedirectPath,
  matchBinding,
  parseContentRoute,
  type EfsBinding,
} from "@/core/efs/publication";
import { loadEfsManifest } from "@/config/efs/manifest";

const fixture = join(process.cwd(), "tests", "fixtures", "efs", "manifest.json");

function loadedBindings(): EfsBinding[] {
  const result = loadEfsManifest(fixture);
  expect(result.issues).toEqual([]);
  return result.manifest!.publications.flatMap((publication) => publication.bindings);
}

describe("EFS publication and routing (D31 / O-4, O-5)", () => {
  it("validates the synthetic two-publication manifest", () => {
    const result = loadEfsManifest(fixture);
    expect(result.ok).toBe(true);
    expect(result.manifest?.publications).toHaveLength(3);
  });

  it("selects a whole-segment managed prefix and parses Site-open routing", () => {
    const matched = matchBinding(
      "my.provelopment.com",
      "/acme-co/jakarta/en-001/about",
      loadedBindings(),
    );
    expect(matched).not.toBeNull();
    expect(matched?.remaining).toEqual(["jakarta", "en-001", "about"]);
    const route = parseContentRoute(matched!.binding, matched!.remaining);
    expect(route).toEqual({
      kind: "route",
      route: { siteId: "jakarta", locale: "en-001", localeKey: "en-001", pageRoute: ["about"] },
    });
  });

  it("parses a dedicated-root Site-closed route with the same identities", () => {
    const matched = matchBinding("www.acme-co.com", "/en-001/about", loadedBindings());
    expect(matched).not.toBeNull();
    const route = parseContentRoute(matched!.binding, matched!.remaining);
    expect(route.kind).toBe("route");
    if (route.kind === "route") {
      expect(route.route.siteId).toBe("jakarta");
      expect(route.route.pageRoute).toEqual(["about"]);
    }
  });

  it("builds canonical URLs only from the effective binding base", () => {
    const bindings = loadedBindings();
    const managed = bindings.find((binding) => binding.id === "managed-acme")!;
    const dedicated = bindings.find((binding) => binding.id === "dedicated-acme")!;
    const managedRoute = {
      siteId: "jakarta",
      locale: "en-001",
      localeKey: "en-001",
      pageRoute: ["about"],
    };
    const dedicatedRoute = { ...managedRoute, siteId: "jakarta" };
    expect(managed.entityId).toBe(dedicated.entityId);
    expect(managed.facetId).toBe(dedicated.facetId);
    expect(canonicalUrl(managed, managedRoute)).toBe(
      "https://my.provelopment.com/acme-co/jakarta/en-001/about",
    );
    expect(canonicalUrl(dedicated, dedicatedRoute)).toBe("https://www.acme-co.com/en-001/about");
    expect(contentSegments(managed, managedRoute)).toEqual(["acme-co", "jakarta", "en-001", "about"]);
  });

  it("redirects an entry address to the explicit default Site and selected locale", () => {
    const managed = loadedBindings().find((binding) => binding.id === "managed-acme")!;
    expect(entryRedirectPath(managed, { cookie: "fr" })).toBe("/acme-co/jakarta/fr/");
    expect(entryRedirectPath(managed, { acceptLanguage: "de" })).toBe("/acme-co/jakarta/en-001/");
  });

  it("keeps two Entities on one Spoke isolated by explicit prefix", () => {
    const beta = matchBinding("my.provelopment.com", "/beta-co/en-001/home", loadedBindings());
    expect(beta).not.toBeNull();
    expect(beta?.binding.entityId).toBe("e_00000000000000000000000001");
    const route = parseContentRoute(beta!.binding, beta!.remaining);
    expect(route.kind).toBe("route");
    if (route.kind === "route") {
      expect(route.route.siteId).toBe("main");
      expect(canonicalUrl(beta!.canonicalBinding, route.route)).toBe(
        "https://my.provelopment.com/beta-co/en-001/home",
      );
    }
  });

  it("preserves nested Page routes in the canonical URL", () => {
    const matched = matchBinding(
      "my.provelopment.com",
      "/acme-co/jakarta/en-001/products/detail",
      loadedBindings(),
    )!;
    const route = parseContentRoute(matched.binding, matched.remaining);
    expect(route.kind).toBe("route");
    if (route.kind === "route") {
      expect(route.route.pageRoute).toEqual(["products", "detail"]);
      expect(canonicalUrl(matched.canonicalBinding, route.route)).toBe(
        "https://my.provelopment.com/acme-co/jakarta/en-001/products/detail",
      );
    }
  });

  it("advertises only public Pages and existing representations", () => {
    const managed = loadedBindings().find((binding) => binding.id === "managed-acme")!;
    const entries = sitemapEntries(managed, [
      {
        pageId: "home",
        siteId: "jakarta",
        route: ["home"],
        visibility: "public",
        representations: [{ locale: "en-001" }, { locale: "fr" }],
      },
      {
        pageId: "detail",
        siteId: "jakarta",
        route: ["products", "detail"],
        visibility: "unlisted",
        representations: [{ locale: "en-001" }],
      },
    ]);
    expect(entries.map((entry) => entry.loc)).toEqual([
      "https://my.provelopment.com/acme-co/jakarta/en-001/home",
      "https://my.provelopment.com/acme-co/jakarta/fr/home",
    ]);
  });

  it("derives owner asset URLs without exposing an EntityID or source path", () => {
    const managed = loadedBindings().find((binding) => binding.id === "managed-acme")!;
    expect(assetUrl(managed, "brand/logo.svg")).toBe(
      "https://my.provelopment.com/acme-co/assets/brand/logo.svg",
    );
  });

  it("fails closed for unclaimed hosts, unknown prefixes and unsupported locales", () => {
    const bindings = loadedBindings();
    expect(matchBinding("unknown.example", "/acme-co/jakarta/en-001/", bindings)).toBeNull();
    expect(matchBinding("my.provelopment.com", "/other/jakarta/en-001/", bindings)).toBeNull();
    const matched = matchBinding("my.provelopment.com", "/acme-co/jakarta/de/", bindings)!;
    expect(parseContentRoute(matched.binding, matched.remaining)).toEqual({
      kind: "rejected",
      reason: 'Unsupported locale "de".',
    });
  });

  it("refuses duplicate prefixes and root/prefix mixtures", () => {
    const base: EfsBinding = {
      id: "a",
      host: "example.com",
      prefix: ["acme"],
      entityId: "e_00000000000000000000000000",
      facetId: "acme",
      siteIds: ["jakarta"],
      siteMode: "closed",
      defaultSiteId: "jakarta",
      locales: ["en-001"],
      defaultLocale: "en-001",
    };
    expect(bindingIssues([base, { ...base, id: "b" }])).toEqual(
      expect.arrayContaining(['Host "example.com" has duplicate prefix "acme" on "a" and "b".']),
    );
    expect(bindingIssues([{ ...base, prefix: [] }, { ...base, id: "c", prefix: ["other"] }])).toEqual(
      expect.arrayContaining(['Host "example.com" mixes a dedicated-root binding with prefix-scoped bindings.']),
    );
  });
});
