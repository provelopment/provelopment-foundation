/**
 * THE VALIDATED PUBLICATION PROJECTION (FOUNDATION R08)
 * ====================================================
 *
 * Three questions, each answered by the REAL authorities rather than a restatement of them:
 *
 *   A. May ONE Spoke publish SEVERAL Entities on ONE host? Yes — and that must yield ONE presentation-asset
 *      permission, not a refusal. Whether two BINDINGS conflict is the validator's question; this suite
 *      proves the projection adds no second, stricter rule of its own.
 *   B. What happens when an EFS manifest is EXPLICITLY selected but MISSING? It is a configuration error: the
 *      producer refuses (so a build stops) and the boundary grants nothing — it must NOT be mistaken for an
 *      Installation with no EFS at all, which would restore legacy `site.url` authorization.
 *   C. When is a cached projection still trustworthy? Only while it describes THIS Installation, THIS
 *      manifest selection, THIS manifest content and THIS Spoke hierarchy.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DEPLOYMENT_EFS_PUBLICATIONS_ENV,
  deploymentEnvironment,
  efsManifestDigest,
  efsProjectionPath,
  resolveDeploymentForBuild,
} from "@/config/deployment-build.mjs";

import { producePublicationProjection } from "../../scripts/efs/publication-projection.mjs";
import {
  SHARED_HOST,
  materializeSharedHostInstallation,
} from "../support/shared-host-installation.mjs";

const trees: string[] = [];
const installations: { cleanup: () => void }[] = [];

function scratch(prefix: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  trees.push(root);
  return root;
}

afterAll(() => {
  for (const installation of installations) installation.cleanup();
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

const SPOKES = [
  { id: "alpha", spokeHubId: "group-one" },
  { id: "beta", spokeHubId: "group-one" },
  { id: "gamma", spokeHubId: "group-one" },
  { id: "delta", spokeHubId: "group-two" },
  { id: "epsilon", spokeHubId: "group-two" },
];

/** Materialise the FIVE-Spoke, TWO-Hub Installation (or a custom membership) and own its cleanup. */
function materialize(members?: Parameters<typeof materializeSharedHostInstallation>[0]) {
  const installation = materializeSharedHostInstallation(members);
  installations.push(installation);
  return installation;
}

/** One member publishing SEVERAL Entities, so a many-to-many topology can be expressed. */
function multiPublishingMember(publications: { prefix: string; entityId: string; canonical?: boolean }[]) {
  return {
    members: [
      {
        spokeHubId: "group-one",
        spokeId: "alpha",
        prefix: publications[0].prefix,
        entityId: publications[0].entityId,
        marker: "Alpha",
        publications,
      },
    ],
  };
}

/** Resolve the deployment exactly as the build does, and report what the boundary would be granted. */
function projectedClaims(root: string, manifestPath?: string) {
  const environment: Record<string, string> = { FOUNDATION_DEPLOYMENT_ROOT: root };
  if (manifestPath !== undefined) environment.FOUNDATION_EFS_MANIFEST = manifestPath;
  const resolved = resolveDeploymentForBuild(environment, process.cwd());
  // Read it through the SAME surface the request boundary consumes, not through an internal field.
  return JSON.parse(deploymentEnvironment(resolved)[DEPLOYMENT_EFS_PUBLICATIONS_ENV]);
}

function writeManifest(directory: string, document: unknown): string {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "manifest.json");
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return file;
}

/** A minimal VALID manifest, so each case changes exactly one fact. */
function manifestDocument() {
  return {
    entities: [
      {
        id: "e_00000000000000000000000009",
        facets: [
          {
            id: "acme",
            sites: [
              {
                id: "main",
                pages: [
                  { id: "home", route: ["home"], representations: [{ locale: "en-001" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
    publications: [
      {
        id: "group-one-alpha",
        spokeId: "alpha",
        spokeHubId: "group-one",
        entityId: "e_00000000000000000000000009",
        facetId: "acme",
        bindings: [
          {
            id: "alpha-primary",
            host: SHARED_HOST,
            prefix: ["alpha"],
            entityId: "e_00000000000000000000000009",
            facetId: "acme",
            siteIds: ["main"],
            siteMode: "closed",
            defaultSiteId: "main",
            locales: ["en-001"],
            defaultLocale: "en-001",
            canonical: true,
          },
        ],
      },
    ],
  };
}


describe("one Spoke publishing several Entities on one host (R08-A)", () => {
  it("projects ONE presentation-asset permission instead of refusing the Installation", async () => {
    const installation = materialize(
      multiPublishingMember([
        { prefix: "alpha", entityId: "e_00000000000000000000000001" },
        { prefix: "alpha-second", entityId: "e_00000000000000000000000002" },
      ]),
    );

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: installation.efsManifestFile,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    expect(outcome.status, JSON.stringify(outcome)).toBe("projected");
    // Two valid publications, distinct prefixes, distinct Entities — ONE asset permission for that owner.
    expect(outcome.status === "projected" && outcome.claims).toEqual([
      { host: SHARED_HOST, spokeHubId: "group-one", spokeId: "alpha" },
    ]);
    expect(projectedClaims(installation.root, installation.efsManifestFile)).toEqual([
      { host: SHARED_HOST, spokeHubId: "group-one", spokeId: "alpha" },
    ]);
  });

  it("does not treat a canonical and an alias binding as a permission collision", async () => {
    const installation = materialize(
      multiPublishingMember([
        { prefix: "alpha", entityId: "e_00000000000000000000000001" },
        { prefix: "alpha-alias", entityId: "e_00000000000000000000000001", canonical: false },
      ]),
    );

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: installation.efsManifestFile,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    expect(outcome.status, JSON.stringify(outcome)).toBe("projected");
    expect(outcome.status === "projected" && outcome.claims).toHaveLength(1);
  });

  it("still refuses a publication whose composite owner is wrong", async () => {
    const installation = materialize();
    const document = manifestDocument();
    // `alpha` is declared in `group-one`; naming it in `group-two` borrows another Hub's identity.
    document.publications[0].spokeHubId = "group-two";
    const file = writeManifest(path.join(scratch("foundation-r08-owner-"), "efs"), document);

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: file,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" && outcome.issues.join(" ")).toContain("alpha");
    expect(projectedClaims(installation.root, file)).toEqual([]);
  });

  it("leaves the validator's own binding rules in charge, and never grants partially", async () => {
    const installation = materialize();
    const document = manifestDocument();
    // The SAME host and prefix claimed twice inside one publication: the validator's question, not ours.
    const binding = document.publications[0].bindings[0];
    document.publications[0].bindings = [
      { ...binding, id: "first" },
      { ...binding, id: "second" },
    ];
    const file = writeManifest(path.join(scratch("foundation-r08-duplicate-"), "efs"), document);

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: file,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    // Whatever the validator decides, the outcome may never be a partial nor an unexplained grant.
    if (outcome.status === "projected") {
      expect(outcome.claims).toHaveLength(1);
    } else {
      expect(outcome.status).toBe("refused");
      expect(projectedClaims(installation.root, file)).toEqual([]);
    }
  });
});

describe("an explicitly selected EFS manifest is a contract (R08-B)", () => {
  it("refuses an explicitly selected manifest that does not exist", async () => {
    const installation = materialize();
    const missing = path.join(scratch("foundation-r08-missing-"), "efs", "manifest.json");

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: missing,
      explicit: true,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" && outcome.issues.join(" ")).toContain(missing);
  });

  it("grants NOTHING at the request boundary — it never restores legacy authorization", () => {
    const installation = materialize();
    const missing = path.join(scratch("foundation-r08-missing2-"), "efs", "manifest.json");

    // `null` would mean "no EFS here, use `site.url`"; an explicit selection must never say that.
    expect(projectedClaims(installation.root, missing)).toEqual([]);
  });

  it("keeps a genuine non-EFS Installation on the released legacy rule", () => {
    const installation = materialize();
    // The fixture authors EFS; removing the directory constructs the GENUINE non-EFS Installation (nothing
    // authors a manifest, nothing selects one), which is the only state that may use the legacy rule.
    rmSync(path.join(installation.root, "efs"), { recursive: true, force: true });

    expect(projectedClaims(installation.root)).toBeNull();
  });

  it("refuses a malformed manifest and leaves no authorization behind", async () => {
    const installation = materialize();
    const directory = path.join(scratch("foundation-r08-malformed-"), "efs");
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "manifest.json");
    writeFileSync(file, "{ this is not json\n", "utf8");

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: file,
      explicit: true,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    expect(outcome.status).toBe("refused");
    expect(projectedClaims(installation.root, file)).toEqual([]);
  });

  it("treats a valid manifest with no publication as EFS-controlled, not EFS-absent", async () => {
    const installation = materialize();
    const document = manifestDocument();
    document.publications = [];
    const file = writeManifest(path.join(scratch("foundation-r08-empty-"), "efs"), document);

    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: file,
      explicit: true,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });

    expect(outcome.status, JSON.stringify(outcome)).toBe("projected");
    // `[]`, never `null`: EFS owns this deployment and authorizes nobody.
    expect(projectedClaims(installation.root, file)).toEqual([]);
  });
});

describe("a cached projection is trusted only while it is current (R08-C)", () => {
  async function projected() {
    const installation = materialize();
    const outcome = await producePublicationProjection({
      root: installation.root,
      manifestPath: installation.efsManifestFile,
      spokeIdentities: SPOKES,
      repositoryRoot: process.cwd(),
    });
    expect(outcome.status, JSON.stringify(outcome)).toBe("projected");
    return installation;
  }

  it("grants nothing once the manifest's bytes change", async () => {
    const installation = await projected();
    expect(projectedClaims(installation.root, installation.efsManifestFile)).toHaveLength(5);

    const current = JSON.parse(readFileSync(installation.efsManifestFile, "utf8"));
    current.publications.pop();
    writeFileSync(installation.efsManifestFile, `${JSON.stringify(current, null, 2)}\n`, "utf8");

    expect(projectedClaims(installation.root, installation.efsManifestFile)).toEqual([]);
  });

  it("grants nothing when the projection describes another manifest", async () => {
    const installation = await projected();
    const projectionPath = efsProjectionPath(installation.root, process.cwd());
    const recorded = JSON.parse(readFileSync(projectionPath, "utf8"));
    writeFileSync(
      projectionPath,
      `${JSON.stringify({ ...recorded, manifestPath: "elsewhere.json" }, null, 2)}\n`,
      "utf8",
    );

    expect(projectedClaims(installation.root, installation.efsManifestFile)).toEqual([]);
  });

  it("grants nothing when a claim's shape cannot be trusted", async () => {
    const installation = await projected();
    const projectionPath = efsProjectionPath(installation.root, process.cwd());
    writeFileSync(
      projectionPath,
      `${JSON.stringify(
        {
          manifestPath: installation.efsManifestFile,
          manifestDigest: efsManifestDigest(installation.efsManifestFile),
          claims: [{ host: SHARED_HOST, spokeId: 7 }],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    expect(projectedClaims(installation.root, installation.efsManifestFile)).toEqual([]);
  });

  it("never inherits another Installation's permission", async () => {
    const first = await projected();
    const second = materialize();
    // The second Installation authors its own manifest but has no projection yet.
    expect(projectedClaims(second.root, second.efsManifestFile)).toEqual([]);
    expect(projectedClaims(first.root, first.efsManifestFile)).toHaveLength(5);
  });
});
