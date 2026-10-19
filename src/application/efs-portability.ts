/**
 * EFS ESTABLISHMENT, CAPSULE PORTABILITY AND COPY-ONCE TEMPLATES (S3-E3-R01)
 * ========================================================================
 *
 * These are explicit, pure authoring operations. They mint a new EntityID only from caller
 * entropy, build the one Page/binding a new website needs, and move an Entity's capsule
 * without ever reusing its identity or admitting another owner's files.
 */
import { mintEntityId, entityIdIssue } from "@/core/efs/identity";
import { validateEfsManifest, type EfsManifest } from "@/config/efs/manifest";
import { normalizePrefix } from "@/core/efs/publication";

export interface EstablishWebsiteInput {
  /** The Spoke that owns this publication. It is an identity, never a hostname or a name match. */
  readonly spokeId: string;
  /** The owning Spoke Hub, when the Installation identifies its Hubs. */
  readonly spokeHubId?: string;
  /** The presentation Site explicitly selected from that Spoke's configuration, if any. */
  readonly presentationSiteCode?: string;
  readonly facetId: string;
  readonly siteId: string;
  readonly host: string;
  readonly prefix?: string | readonly string[];
  readonly locales: readonly string[];
  readonly defaultLocale: string;
  readonly title: string;
  readonly body?: string;
}

export interface CapsuleFile {
  readonly path: string;
  readonly content: Uint8Array;
}

export interface EstablishedWebsite {
  readonly manifest: EfsManifest;
  readonly entityId: string;
  readonly files: readonly CapsuleFile[];
}

export interface CapsuleBundle {
  readonly schema: "efs-capsule/v1";
  readonly entityId: string;
  readonly manifest: EfsManifest;
  readonly files: readonly { readonly path: string; readonly contentBase64: string }[];
  readonly provenance?: {
    readonly templateEntityId: string;
    readonly instantiatedAt: string;
  };
}

const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

function safeRelativePath(path: string): string | null {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

/**
 * Establish one ordinary website: one Entity, one Facet, one closed Site, one Home Page and
 * one localized representation per declared locale. No host, name or geography mints identity.
 */
export function establishWebsite(input: EstablishWebsiteInput, entropy: Uint8Array): EstablishedWebsite {
  const entityId = mintEntityId(entropy);
  const prefix = normalizePrefix(input.prefix ?? []);
  if (input.locales.length === 0) throw new Error("A website needs at least one locale.");
  if (!input.locales.includes(input.defaultLocale)) {
    throw new Error("The default locale must be one of the declared locales.");
  }

  const manifest: EfsManifest = {
    entities: [
      {
        id: entityId,
        facets: [
          {
            id: input.facetId,
            sites: [
              {
                id: input.siteId,
                pages: [
                  {
                    id: "home",
                    route: ["home"],
                    visibility: "public",
                    representations: input.locales.map((locale) => ({ locale })),
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
        id: `${input.facetId}-${input.siteId}`,
        spokeId: input.spokeId,
        spokeHubId: input.spokeHubId,
        presentationSiteCode: input.presentationSiteCode,
        entityId,
        facetId: input.facetId,
        bindings: [
          {
            id: `${input.siteId}-web`,
            host: input.host,
            prefix,
            entityId,
            facetId: input.facetId,
            siteIds: [input.siteId],
            siteMode: "closed",
            defaultSiteId: input.siteId,
            locales: input.locales,
            defaultLocale: input.defaultLocale,
            canonical: true,
          },
        ],
      },
    ],
  };

  const validation = validateEfsManifest(manifest);
  if (!validation.ok) throw new Error(`Established website is invalid: ${validation.issues.join(" ")}`);

  const files: CapsuleFile[] = [];
  for (const locale of input.locales) {
    files.push({
      path: `${entityId}/${input.facetId}/${input.siteId}/pages/home/${locale.toLowerCase()}.json`,
      content: bytes(JSON.stringify({ title: input.title, body: input.body ?? "" }, null, 2) + "\n"),
    });
  }
  return { manifest, entityId, files };
}

/** Export exactly one Entity's manifest slice and capsule files, preserving its identity. */
export function exportEntityCapsule(
  manifest: EfsManifest,
  entityId: string,
  files: readonly CapsuleFile[],
): CapsuleBundle {
  const issue = entityIdIssue(entityId);
  if (issue) throw new Error(issue);
  const entity = manifest.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error(`No Entity "${entityId}" exists to export.`);
  const publications = manifest.publications.filter((publication) => publication.entityId === entityId);
  const slice: EfsManifest = { entities: [entity], publications };
  const validation = validateEfsManifest(slice);
  if (!validation.ok) throw new Error(`Entity capsule is invalid: ${validation.issues.join(" ")}`);

  const owned: CapsuleBundle["files"][number][] = [];
  for (const file of files) {
    const path = safeRelativePath(file.path);
    if (!path || !path.startsWith(`${entityId}/`)) {
      throw new Error(`Capsule file "${file.path}" escapes the exporting Entity.`);
    }
    owned.push({ path, contentBase64: Buffer.from(file.content).toString("base64") });
  }
  return { schema: "efs-capsule/v1", entityId, manifest: slice, files: owned };
}

export interface CapsuleImportResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly bundle?: CapsuleBundle;
}

/** Parse and validate an exported capsule without trusting its paths or identity. */
export function importEntityCapsule(text: string): CapsuleImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [`Capsule is not valid JSON: ${String(error)}`] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, issues: ["Capsule must be an object."] };
  }
  const candidate = parsed as Partial<CapsuleBundle>;
  const issues: string[] = [];
  if (candidate.schema !== "efs-capsule/v1") issues.push("Capsule schema must be efs-capsule/v1.");
  if (typeof candidate.entityId !== "string") {
    issues.push("Capsule entityId must be a string.");
  } else {
    const idIssue = entityIdIssue(candidate.entityId);
    if (idIssue) issues.push(idIssue);
  }
  const manifest = candidate.manifest;
  if (!manifest || typeof manifest !== "object") {
    issues.push("Capsule manifest must be an object.");
  } else {
    const validation = validateEfsManifest(manifest);
    issues.push(...validation.issues);
    if (candidate.entityId && validation.manifest) {
      if (
        validation.manifest.entities.length !== 1 ||
        validation.manifest.entities[0].id !== candidate.entityId
      ) {
        issues.push("Capsule manifest must contain exactly its declared Entity.");
      }
    }
  }
  if (!Array.isArray(candidate.files)) {
    issues.push("Capsule files must be an array.");
  } else {
    for (const [index, file] of candidate.files.entries()) {
      if (!file || typeof file.path !== "string" || typeof file.contentBase64 !== "string") {
        issues.push(`files[${index}] must carry path and contentBase64.`);
        continue;
      }
      const path = safeRelativePath(file.path);
      if (!path || (candidate.entityId && !path.startsWith(`${candidate.entityId}/`))) {
        issues.push(`files[${index}] escapes the capsule Entity.`);
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, issues: [], bundle: parsed as CapsuleBundle };
}

/**
 * Copy a capsule once into a new Entity. The source identity is never retained as the target's
 * identity; provenance records only the template EntityID it came from.
 */
export function instantiateTemplate(
  bundle: CapsuleBundle,
  entropy: Uint8Array,
  instantiatedAt: string,
): CapsuleBundle {
  const newEntityId = mintEntityId(entropy);
  const oldEntityId = bundle.entityId;
  if (oldEntityId === newEntityId) throw new Error("A copied template must receive a new EntityID.");
  const manifest: EfsManifest = {
    entities: bundle.manifest.entities.map((entity) => ({ ...entity, id: newEntityId })),
    publications: bundle.manifest.publications.map((publication) => ({
      ...publication,
      entityId: newEntityId,
      bindings: publication.bindings.map((binding) => ({ ...binding, entityId: newEntityId })),
    })),
  };
  const validation = validateEfsManifest(manifest);
  if (!validation.ok) throw new Error(`Copied template is invalid: ${validation.issues.join(" ")}`);
  return {
    schema: "efs-capsule/v1",
    entityId: newEntityId,
    manifest,
    files: bundle.files.map((file) => ({
      ...file,
      path: `${newEntityId}/${file.path.slice(oldEntityId.length + 1)}`,
    })),
    provenance: { templateEntityId: oldEntityId, instantiatedAt },
  };
}


/**
 * Owner-scoped coherence diagnostics: every declared representation needs exactly one source
 * (JSON or Markdown), no file may belong to another Entity, and no duplicate path is allowed.
 */
export function diagnoseCapsule(bundle: CapsuleBundle): readonly string[] {
  const issues: string[] = [];
  const validation = validateEfsManifest(bundle.manifest);
  issues.push(...validation.issues);
  if (bundle.provenance) {
    const issue = entityIdIssue(bundle.provenance.templateEntityId);
    if (issue) issues.push(`provenance.templateEntityId: ${issue}`);
  }
  const paths = new Set<string>();
  for (const file of bundle.files) {
    const path = safeRelativePath(file.path);
    if (!path || !path.startsWith(`${bundle.entityId}/`)) {
      issues.push(`Capsule file "${file.path}" is outside its Entity.`);
      continue;
    }
    if (paths.has(path)) issues.push(`Capsule file "${path}" is duplicated.`);
    paths.add(path);
    try {
      if (Buffer.from(file.contentBase64, "base64").length === 0) {
        issues.push(`Capsule file "${path}" is empty.`);
      }
    } catch {
      issues.push(`Capsule file "${path}" is not valid base64.`);
    }
  }
  for (const entity of bundle.manifest.entities) {
    for (const facet of entity.facets) {
      for (const site of facet.sites) {
        for (const page of site.pages) {
          for (const representation of page.representations) {
            const base = `${entity.id}/${facet.id}/${site.id}/pages/${page.id}/${representation.locale.toLowerCase()}`;
            if (!paths.has(`${base}.json`) && !paths.has(`${base}.md`)) {
              issues.push(`Page "${page.id}" has no source for "${representation.locale}".`);
            }
          }
        }
      }
    }
  }
  return issues;
}
