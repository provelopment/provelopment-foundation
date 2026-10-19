import type { MetadataRoute } from "next";

import { efsSitemapForCurrentRequest } from "@/app/[[...segments]]/efs-request";
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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const efs = await efsSitemapForCurrentRequest();
  if (efs) return efs;
  const context = await runtimeContextForRequest();
  if (context === null) return [];
  return sitemapForContext(context);
}
