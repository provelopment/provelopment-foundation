import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";

import { headers } from "next/headers";

import { normalizePrefix, matchBinding } from "@/core/efs/publication";
import { deploymentPaths } from "@/config/deployment-root";
import { loadEfsManifest } from "@/config/efs/manifest";

/**
 * OWNER-SCOPED EFS ASSET DELIVERY (S3-E3-R01)
 * ==========================================
 *
 * A binding-scoped asset is resolved from the Entity/Facet capsule that owns it — never from
 * `public/**`, another owner's tree, or an EntityID-derived path.
 */
const MANIFEST_ENV = "FOUNDATION_EFS_MANIFEST";
const CAPSULE_ENV = "FOUNDATION_EFS_CAPSULE";
const DEPLOYMENT = deploymentPaths();
const DEFAULT_MANIFEST = join(DEPLOYMENT.root, "efs", "manifest.json");
const DEFAULT_CAPSULE = join(DEPLOYMENT.root, "efs", "capsule");

const MIME: Readonly<Record<string, string>> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function assetNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function serveOwnerAsset(
  prefixInput: readonly string[],
  pathInput: readonly string[],
): Promise<Response> {
  const requestHeaders = await headers();
  const rawHost = requestHeaders.get("host") ?? requestHeaders.get("x-forwarded-host");
  const host = rawHost ? rawHost.replace(/:\d+$/, "") : null;
  if (!host) return assetNotFound();

  let prefix: readonly string[];
  let assetSegments: readonly string[];
  try {
    prefix = normalizePrefix(prefixInput);
    assetSegments = normalizePrefix(pathInput);
  } catch {
    return assetNotFound();
  }
  if (assetSegments.length === 0) return assetNotFound();

  const manifestPath = process.env[MANIFEST_ENV] ?? DEFAULT_MANIFEST;
  if (!existsSync(manifestPath)) return assetNotFound();
  const loaded = loadEfsManifest(manifestPath);
  if (!loaded.ok || !loaded.manifest) return assetNotFound();

  const bindings = loaded.manifest.publications.flatMap((publication) => publication.bindings);
  const matched = matchBinding(host, `/${prefix.join("/")}`, bindings);
  if (!matched || matched.binding.prefix.length !== prefix.length) return assetNotFound();
  const binding = matched.binding;
  const entity = loaded.manifest.entities.find((candidate) => candidate.id === binding.entityId);
  const facet = entity?.facets.find((candidate) => candidate.id === binding.facetId);
  if (!entity || !facet) return assetNotFound();

  const capsule = process.env[CAPSULE_ENV] ?? DEFAULT_CAPSULE;
  const ownerRoot = join(capsule, entity.id, facet.id, "assets");
  const candidate = join(ownerRoot, ...assetSegments);
  if (!existsSync(candidate)) return assetNotFound();

  let actual: string;
  let ownerActual: string;
  try {
    ownerActual = realpathSync(ownerRoot);
    actual = realpathSync(candidate);
  } catch {
    return assetNotFound();
  }
  if (actual !== ownerActual && !actual.startsWith(`${ownerActual}${sep}`)) return assetNotFound();
  if (!statSync(actual).isFile()) return assetNotFound();

  const contentType = MIME[extname(actual).toLowerCase()];
  if (!contentType) return assetNotFound();

  return new Response(readFileSync(actual), {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(statSync(actual).size),
      "cache-control": "public, max-age=60, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
