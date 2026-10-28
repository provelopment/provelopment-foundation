import type { MetadataRoute } from "next";

import { efsRuntimeDeclared, efsSitemapUrlForCurrentRequest } from "@/app/[[...segments]]/efs-request";
import { legacyTestRuntimeEnabled, missingEfsInstallation } from "@/app/[[...segments]]/legacy-test-runtime";
import { runtimeContextForRequest } from "@/config/spoke-request";

import { robotsForContext } from "./robots-context";

/**
 * `robots.txt` — a thin Next BOUNDARY (M14), now PER HOST (M16)
 * ============================================================
 *
 * The accepted crawl rules are unchanged (`*` may crawl everything). The ONE Spoke-specific fact — the
 * sitemap origin — belongs to the Spoke the request's HOST resolves to, so `alpha.example/robots.txt`
 * advertises `https://alpha.example/sitemap.xml` and Beta's advertises Beta's. A host NO Spoke answers
 * advertises no sitemap at all: refusing is the only honest answer.
 */
/**
 * HOST-DEPENDENT, SO NEVER PRERENDERED (A9-R03) — the same reason as `sitemap.ts`: the advertised origin
 * is the requesting host's Spoke, so a single prerendered file would advertise one Spoke's URL on every
 * other Spoke's hostname.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const rules = { userAgent: "*", allow: "/" } as const;

  const efsSitemap = await efsSitemapUrlForCurrentRequest();
  if (efsSitemap) return { rules, sitemap: efsSitemap };
  if (efsRuntimeDeclared()) return { rules };
  if (!legacyTestRuntimeEnabled()) missingEfsInstallation();

  const context = await runtimeContextForRequest();
  if (context === null) return { rules };

  return robotsForContext(context);
}
