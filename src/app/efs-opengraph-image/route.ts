import { headers } from "next/headers";
import { ImageResponse } from "next/og";

import { efsOpenGraphImageForCurrentRequest } from "@/app/[[...segments]]/efs-request";
import { openGraphImageElement } from "@/app/[site]/[locale]/opengraph-image-view";
import {
  EFS_IMAGE_PATH_HEADER,
  OPEN_GRAPH_IMAGE_CONTENT_TYPE,
  OPEN_GRAPH_IMAGE_SEGMENT,
  OPEN_GRAPH_IMAGE_SIZE,
} from "@/config/efs/image-path";

/**
 * THE EFS OPEN GRAPH IMAGE ENDPOINT (`GEO-03` R04-C21)
 * ===================================================
 *
 *     GET <prefix>/<locale>/opengraph-image   →  1200 × 630 `image/png`
 *
 * This is the App Router's *internal* handler. The PUBLIC URLs the Owner requires
 * (`/en-001/opengraph-image` on the Foundation reference host, `/de-de/opengraph-image` on the Germany
 * reference host) reach it only through the request boundary, which recognizes the RESERVED suffix,
 * proves the host is EFS-claimed, and rewrites it here carrying the original public path on a private
 * header (`@/config/efs/image-path`). The browser's address bar never changes.
 *
 * WHY NOT A FILE-CONVENTION `opengraph-image.tsx`. Next.js requires a catch-all segment to be the last
 * segment that modifies the path, so a metadata image cannot sit under `[[...segments]]` — the tree does
 * not build. A file-convention route also cannot express this endpoint's authority: its URL carries only
 * segments, while the owner is the request's host and binding prefix.
 *
 * WHAT IT REFUSES. Everything it cannot prove, with the SAME 404 a Page gets:
 *   · no private image-path header (a direct hit on the internal path has no public identity);
 *   · a path that does not end in the reserved suffix, or that carries a Page suffix before it;
 *   · a host no publication claims, a wrong binding prefix, an undeclared Site or locale, a foreign owner;
 *   · no usable PUBLIC brand name (see `@/app/efs-opengraph-image-model`).
 * It never falls back to another publication, never infers ownership from a hostname or a country label,
 * and never redirects: an image is not a location that can be canonicalized.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function refuse(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(): Promise<Response> {
  const publicPath = (await headers()).get(EFS_IMAGE_PATH_HEADER);
  if (publicPath === null) return refuse();

  const segments = publicPath.split("/").filter((segment) => segment.length > 0);
  // `<locale>/opengraph-image` is the minimum a real endpoint can name.
  if (segments.length < 2) return refuse();
  if (segments[segments.length - 1] !== OPEN_GRAPH_IMAGE_SEGMENT) return refuse();

  const image = await efsOpenGraphImageForCurrentRequest(segments.slice(0, -1));
  if (image === null) return refuse();

  return new ImageResponse(openGraphImageElement(image.content), {
    ...OPEN_GRAPH_IMAGE_SIZE,
    headers: {
      "content-type": OPEN_GRAPH_IMAGE_CONTENT_TYPE,
      // The card is content-derived, so it may be cached briefly but never treated as immutable.
      "cache-control": "public, max-age=60, must-revalidate",
    },
  });
}
