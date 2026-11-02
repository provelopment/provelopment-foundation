import type { Metadata } from "next";

import { EfsPageView } from "@/components/efs/efs-page";
import {
  efsDescription,
  efsLanguageAlternates,
  efsOpenGraphImage,
  efsRobots,
  efsTitle,
  efsTwitterCard,
  efsViewForCurrentRequest,
} from "./efs-request";
import { efsConnectAuthoredPage, efsConnectPresentation } from "./efs-connect";
import { efsScheduleStatusLabels } from "./efs-status-labels";
import { missingEfsInstallation } from "./efs-refusal";

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
    const robots = efsRobots(efs);
    // R04-C21 — the owner-scoped social card the reserved endpoint serves for this site/locale root. It is
    // `undefined` exactly when that endpoint would refuse, so the HTML never advertises an image that 404s.
    // R04-C21-R02 — it is resolved from the ROOT card itself, not from this Page's own cascade, so the URL,
    // the alt and the refusal condition are the root's on every Page (F2), and the released Twitter card
    // carries the SAME image (F4).
    const image = await efsOpenGraphImage(efs);
    return {
      title: efsTitle(efs),
      description: efsDescription(efs),
      ...(robots === undefined ? {} : { robots }),
      alternates: {
        canonical: efs.canonical,
        languages: efsLanguageAlternates(efs),
      },
      openGraph: {
        title: efsTitle(efs),
        description: efsDescription(efs),
        url: efs.canonical,
        locale: efs.locale,
        ...(image === undefined ? {} : { images: [image] }),
      },
      ...(image === undefined ? {} : { twitter: efsTwitterCard(efs, image.url) }),
    };
  }
  return missingEfsInstallation();
}


export default async function PageRoute({ params }: PageRouteProps) {
  const segments = (await params).segments ?? [];
  const efs = await efsViewForCurrentRequest(segments);
  if (efs) {
    // GEO-04 C09-R08 — THE SPECIALISED CONNECT COMPOSITION, WHEN THE PAGE DECLARES IT. A Page whose
    // validated declared route is the `connect` leaf renders through the SAME approved composition the
    // legacy route uses (dictionary heading, authored body, ONE grid of configured methods, screened
    // icons, text fallbacks, authoritative destinations) under THIS request's owning Spoke. Every other
    // Page — and every Spoke with no compatible presentation — keeps the generic EFS view below, so
    // behavior changes only where a real declared Connect Page exists.
    const connectPage = efsConnectAuthoredPage(efs);
    if (connectPage) {
      const presentation = efsConnectPresentation(efs, connectPage);
      if (presentation) return presentation;
    }
    return (
      <EfsPageView
        view={efs}
        withShell={efs.publication.presentationSiteCode !== undefined}
        statusLabels={efsScheduleStatusLabels(efs)}
      />
    );
  }
  return missingEfsInstallation();
}
