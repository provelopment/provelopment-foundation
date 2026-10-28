import type { MetadataRoute } from "next";

import { efsRuntimeDeclared, efsSitemapForCurrentRequest } from "@/app/[[...segments]]/efs-request";
import { legacyTestRuntimeEnabled, missingEfsInstallation } from "@/app/[[...segments]]/legacy-test-runtime";
import { runtimeContextForRequest } from "@/config/spoke-request";

import { sitemapForContext } from "./sitemap-context";

/**
 * The deployment's XML sitemap — a thin Next BOUNDARY (M14), now PER HOST (M16)
 * ============================================================================
 *
 * The inventory and the canonical origin belong to ONE explicit Spoke context, and WHICH context depends on
 * the request's HOST: `alpha.example/sitemap.xml` is Alpha's origin and Alpha's inventory, `beta.example/…`
 * is Beta's, and there is never a union of two Spokes. The boundary itself composes nothing — it selects the
 * context the request resolves to (hostname dispatch, or the Installation's ONE Spoke) and returns
 * `sitemapForContext`.
 *
 * A host NO Spoke answers publishes an EMPTY sitemap: refusing is the only honest answer, because the
 * alternative would advertise another Spoke's URLs under a hostname that Spoke does not own.
 */
/**
 * HOST-DEPENDENT, SO NEVER PRERENDERED (A9-R03)
 * =============================================
 *
 * Everything above says this boundary answers PER HOST, and that is exactly what static generation
 * cannot do: a prerendered `/sitemap.xml` is one artefact served to every hostname, so Beta would be
 * handed Alpha's inventory — the precise failure the empty-sitemap rule above exists to prevent. It also
 * cannot be prerendered at all in a multi-Spoke capsule, because the Installation root (and therefore the
 * EFS manifest) is resolved from the request; a build-time render has no request to resolve.
 *
 * Declaring the dependency explicitly makes the rendering mode match the documented contract instead of
 * inheriting whatever the bundler happens to infer.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const efs = await efsSitemapForCurrentRequest();
  if (efs) return efs;
  // When EFS is the declared authority, an unclaimed host has no legacy inventory to fall back to.
  if (efsRuntimeDeclared()) return [];
  if (!legacyTestRuntimeEnabled()) missingEfsInstallation();
  const context = await runtimeContextForRequest();
  if (context === null) return [];
  return sitemapForContext(context);
}
