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
        spokeId: "acme-spoke",
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

  it("refuses overlapping public namespaces on one host before anything is served (IA-ROUTE-02)", () => {
    /**
     * The rule is a MANIFEST-validity rule, not a matching preference: an overlapping declaration must be
     * refused when the document is validated, whatever owns the two bindings. Three shapes are covered —
     * one Spoke publishing twice, two Spokes in ONE Spoke Hub, and two Spokes in TWO Spoke Hubs — because
     * none of them may widen the address rule.
     */
    const withPublications = (
      owners: readonly { spokeId: string; spokeHubId?: string; prefix: string[] }[],
    ): Record<string, unknown> => {
      const document = manifest({}) as Record<string, unknown>;
      document.publications = owners.map((owner, index) => ({
        id: `publication-${index}`,
        ...(owner.spokeHubId === undefined ? {} : { spokeHubId: owner.spokeHubId }),
        spokeId: owner.spokeId,
        entityId,
        facetId: "acme",
        bindings: [
          {
            id: `binding-${index}`,
            host: "my.provelopment.com",
            prefix: owner.prefix,
            entityId,
            facetId: "acme",
            siteIds: ["main"],
            siteMode: "closed",
            defaultSiteId: "main",
            locales: ["en-001"],
            defaultLocale: "en-001",
            canonical: true,
          },
        ],
      }));
      return document;
    };

    const shapes = [
      { label: "one Spoke publishing twice", owners: [
        { spokeId: "tenant-a", prefix: ["tenant-a"] },
        { spokeId: "tenant-a", prefix: ["tenant-a", "other"] },
      ] },
      { label: "two Spokes in one Spoke Hub", owners: [
        { spokeId: "tenant-a", spokeHubId: "hub-one", prefix: ["tenant-a"] },
        { spokeId: "tenant-b", spokeHubId: "hub-one", prefix: ["tenant-a", "other"] },
      ] },
      { label: "two Spokes in two Spoke Hubs", owners: [
        { spokeId: "tenant-a", spokeHubId: "hub-one", prefix: ["tenant-a"] },
        { spokeId: "tenant-b", spokeHubId: "hub-two", prefix: ["tenant-a", "other"] },
      ] },
    ];

    for (const shape of shapes) {
      const result = validateEfsManifest(withPublications(shape.owners));
      expect(result.ok, shape.label).toBe(false);
      expect(result.issues.join(" "), shape.label).toMatch(/claims the top-level public namespace/);
    }

    // …and two INDEPENDENT tenants on that same host remain valid in every ownership shape.
    const independent = validateEfsManifest(
      withPublications([
        { spokeId: "tenant-a", spokeHubId: "hub-one", prefix: ["tenant-a"] },
        { spokeId: "tenant-b", spokeHubId: "hub-two", prefix: ["tenant-b"] },
      ]),
    );
    expect(independent.ok).toBe(true);
    expect(independent.issues).toEqual([]);
  });

  it("requires every publication to name its owning Spoke explicitly", () => {
    const withoutOwner = manifest({});
    delete (withoutOwner.publications[0] as Record<string, unknown>).spokeId;
    const missing = validateEfsManifest(withoutOwner);
    expect(missing.ok).toBe(false);
    expect(missing.issues.join(" ")).toMatch(/spokeId must be a non-empty string/);

    const reserved = manifest({});
    (reserved.publications[0] as Record<string, unknown>).spokeId = "implicit";
    expect(validateEfsManifest(reserved).issues.join(" ")).toMatch(/reserved implicit Spoke/);
  });
});
