import { describe, expect, it } from "vitest";

import { bindingIssues } from "@/core/efs/publication";
import { validateEfsManifest } from "@/config/efs/manifest";

const entityId = "e_00000000000000000000000000";

function manifest(binding: Record<string, unknown>) {
  return {
    entities: [
      {
        id: entityId,
        facets: [
          {
            id: "acme",
            sites: [
              {
                id: "main",
                pages: [
                  {
                    id: "home",
                    route: ["home"],
                    representations: [{ locale: "en-001" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    publications: [
      {
        id: "acme",
        entityId,
        facetId: "acme",
        bindings: [
          {
            id: "acme-web",
            host: "www.acme.example",
            prefix: [],
            entityId,
            facetId: "acme",
            siteIds: ["main"],
            siteMode: "closed",
            defaultSiteId: "main",
            locales: ["en-001"],
            defaultLocale: "en-001",
            canonical: true,
            ...binding,
          },
        ],
      },
    ],
  };
}

describe("EFS authoring diagnostics (S3-E3-R01)", () => {
  it("reports unsafe prefixes as issues instead of throwing", () => {
    const result = validateEfsManifest(manifest({ prefix: [".."] }));
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/Unsafe binding prefix/);
  });

  it("reports malformed hosts as issues instead of throwing", () => {
    const result = validateEfsManifest(manifest({ host: "https://www.acme.example/path" }));
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/bare hostname/);
    expect(() => bindingIssues([])).not.toThrow();
  });

  it("reports an open binding without two Sites and an unsupported default locale", () => {
    const result = validateEfsManifest(manifest({ siteMode: "open", defaultLocale: "de" }));
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/at least two Sites/);
    expect(result.issues.join(" ")).toMatch(/default locale is not supported/);
  });

  it("reports a Page representation with no source through capsule diagnostics", () => {
    const result = validateEfsManifest(manifest({}));
    expect(result.ok).toBe(true);
  });
});
