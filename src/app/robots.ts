import type { MetadataRoute } from "next";

import { efsRuntimeDeclared, efsSitemapUrlForCurrentRequest } from "@/app/[[...segments]]/efs-request";
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
export default async function robots(): Promise<MetadataRoute.Robots> {
  const rules = { userAgent: "*", allow: "/" } as const;

  const efsSitemap = await efsSitemapUrlForCurrentRequest();
  if (efsSitemap) return { rules, sitemap: efsSitemap };
  if (efsRuntimeDeclared()) return { rules };

  const context = await runtimeContextForRequest();
  if (context === null) return { rules };

  return robotsForContext(context);
}
