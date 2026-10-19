import type { Metadata } from "next";

import { EfsPageView } from "@/components/efs/efs-page";
import { runtimeContextForCurrentRequest } from "@/config/spoke-request";
import { efsDescription, efsTitle, efsViewForCurrentRequest } from "./efs-request";
import { pageForContext, pageMetadataForContext, spokeServerComposition } from "./server-composition";
import { requestPublicDestination } from "./request-context";

/**
 * THE ONE PUBLIC PAGE ROUTE — the request-selected caller of the shared server composition (M13/M16/M17)
 * ========================================================================================================
 *
 * A page's identity is `site + locale + routePath`, and its PUBLIC URL is the content path itself — the site
 * CODE first, then the locale path key:
 *
 *   content/pages/markdown/ca/en/about.md  → /ca/en/about
 *   content/pages/markdown/fr/fr/about.md  → /fr/fr/about
 *
 * ONE route serves every page of every site: the URL is resolved to exactly ONE site context — the one the
 * REQUEST selected — and the page composition is then asked for that site alone. There is no route per site,
 * no route per language and no second inventory: an offering, an article, a policy document, an "About" page
 * and a regional (location) page are all PAGES, resolved by the SAME composition in the SAME declared order
 * with the SAME JSON-over-Markdown precedence.
 *
 * WHICH SPOKE (M17). This file resolves no hostname and holds no global configuration. The request boundary
 * matched the exact hostname claim and declared its Spoke on a private upstream header; `./request-context`
 * turns that declaration into an explicit `SpokeRuntimeContext`, or refuses. There is no default Spoke, no
 * first Spoke and no fallback to a neighbour.
 *
 * WHY THERE ARE NO STATIC PARAMETERS (M17). Two hosts may legitimately serve the SAME public pathname from
 * different Spokes, so a per-pathname build artifact would be a lie: this route is deliberately request-time
 * and generates nothing. The discovered per-context inventory is still the domain authority (`./server-composition`),
 * and the sitemap still publishes it — it is simply no longer claimed as a static App Router identity.
 *
 * WHERE THE RULES LIVE. This file chooses the context from the REQUEST and hands it to `./server-composition`,
 * which composes the page, its metadata and its discovered parameters from that context's OWN configuration,
 * dictionary access, asset resolver and authored trees. The rendering rules did not move into this file.
 */

interface PageRouteProps {
  readonly params: Promise<{ readonly segments?: string[] }>;
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  const segments = (await params).segments ?? [];
  const efs = await efsViewForCurrentRequest(segments);
  if (efs) {
    return {
      title: efsTitle(efs),
      description: efsDescription(efs),
      alternates: {
        canonical: efs.canonical,
        languages: Object.fromEntries(efs.alternates.map((alternate) => [alternate.hreflang, alternate.href])),
      },
      openGraph: {
        title: efsTitle(efs),
        description: efsDescription(efs),
        url: efs.canonical,
        locale: efs.locale,
      },
    };
  }
  const { context, destination } = await requestPublicDestination(segments);
  return pageMetadataForContext(
    spokeServerComposition(context),
    destination.segments as string[],
  );
}

export default async function PageRoute({ params }: PageRouteProps) {
  const segments = (await params).segments ?? [];
  const efs = await efsViewForCurrentRequest(segments);
  if (efs) {
    return <EfsPageView view={efs} withShell={Boolean(await runtimeContextForCurrentRequest())} />;
  }
  const { context, destination } = await requestPublicDestination(segments);
  return pageForContext(spokeServerComposition(context), destination.segments as string[]);
}
