import { NextResponse, type NextRequest } from "next/server";

import {
  hostRoutingForBuild,
  isSharedHostInRouting,
  publishedRuntimeSegmentsForHost,
  routingEntryForSelection,
  spokeSelectionForHost,
  type SpokeHostRoutingEntry,
} from "@/config/spoke-routing";
import { SPOKE_SELECTION_HEADER, isInternalSpokePath } from "@/config/spoke-selection";
import { EFS_REQUEST_PATH_HEADER } from "@/config/efs/request-path";

/**
 * THE REQUEST BOUNDARY: HOSTNAME DISPATCH (FOUNDATION-MULTISITE-M16/M17)
 * =====================================================================
 *
 * ONE decision order, and no global Spoke authority anywhere in it:
 *
 *     raw request host
 *         ↓ normalizeHostname + exact claim match   (`@/core/spoke`, via `@/config/spoke-routing`)
 *     ONE Spoke — or NOTHING
 *         ↓
 *     the PUBLIC pathname, unchanged, plus a PRIVATE upstream header naming that Spoke's runtime segment
 *         ↓
 *     the public catch-all App Router route resolves that context and calls the shared composition
 *
 * WHY THE PATH IS NOT REWRITTEN (M17 supersedes M16). The public path IS the page identity: the App Router
 * can only commit a client-side transition for a path it knows, and a rewritten flight response for a
 * DIFFERENT route tree cannot be applied to the requested public route. M16 measured both consequences — a
 * stuck soft navigation while a public page tree still existed and a full document reload once it did not —
 * so the Spoke now travels out of band on a private request header and the pathname is never touched.
 *
 * WHAT THIS FILE STILL DOES NOT DO: it reads no `siteConfig`, holds no Site or locale inventory, and completes
 * no locale. Site/locale completion is decided inside the selected Spoke — by the route boundary that already
 * holds that Spoke's fully resolved configuration — so the boundary never needs a configuration to answer a
 * routing question, and the browser-visible URL is never anything but the public one.
 *
 * THE TWO INSTALLATION SHAPES
 * ---------------------------
 *   multi   2+ declared Spokes: the host decides. An UNCLAIMED hostname answers NOTHING (404) — it is never
 *           redirected to another Spoke, never given "the first" Spoke and never given a default.
 *   single  exactly ONE declared Spoke: that Spoke answers every host, which is the accepted one-Spoke
 *           behaviour (development, preview and test hosts included) — stated as "the sole entry the build
 *           published", never as "the first".
 *
 * FAIL-CLOSED EXTRAS
 * ------------------
 *   · a DIRECT external request to the retired internal namespace (`/~spoke/**`) is refused: no page renders
 *     there, and a visitor never receives a surface that implies the namespace exists;
 *   · a Spoke's own asset namespace (`/spokes/<segment>/assets/**`) is HOST-BOUND: a host may fetch its own
 *     Spoke's artwork and never another's, even though both are generated in the same `public/` tree. The
 *     matcher below therefore also matches static (dotted) Spoke paths, while `/_next/**` and the shared
 *     `/assets/**` platform namespace stay untouched.
 */
const SPOKE_ASSET_PREFIX = "/spokes/";

/** Nothing answers this request: no Spoke, never another Spoke's content. */
function refuse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * The runtime segment named by a Spoke asset path, or `null` if the path does not name exactly one.
 *
 * A namespace name is a SINGLE path segment, so this refuses anything that could address a different
 * namespace by construction: an empty segment, `.`/`..` (including the `%2e%2e` spelling, which decodes to
 * `..`), an encoded separator that would widen the segment, and embedded NUL. The proxy authorizes a
 * namespace; it must never authorize a PATH through one.
 */
function assetSegment(pathname: string): string | null {
  const raw = pathname.split("/").filter(Boolean)[1] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not a namespace name.
    return null;
  }
  if (decoded === "" || decoded === "." || decoded === "..") return null;
  if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("\u0000")) return null;
  return decoded;
}

/**
 * Continue WITHOUT the boundary's private headers.
 *
 * `SPOKE_SELECTION_HEADER` and `EFS_REQUEST_PATH_HEADER` are the boundary's own channel upstream. A path the
 * boundary does not resolve (a static asset namespace) must not carry a client-supplied value under those
 * names, so both are DELETED rather than forwarded: a request cannot forge the Spoke or the binding that a
 * later surface would read.
 */
function passThrough(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.delete(SPOKE_SELECTION_HEADER);
  headers.delete(EFS_REQUEST_PATH_HEADER);
  return NextResponse.next({ request: { headers } });
}

/** The Spoke answering the CURRENT host, or `null` (dispatch: exact claims; single: the sole entry). */
function selectedEntry(
  routing: ReturnType<typeof hostRoutingForBuild>,
  host: string | null,
): SpokeHostRoutingEntry | null {
  // DISPATCH — the host decides. `identified` is dispatch too, deliberately (§6): an Installation authored
  // with identified Spoke Hubs never takes the permissive one-Spoke path below, even when it declares one
  // Hub and one Spoke, so an unknown host is refused there rather than answered by that Spoke.
  if (routing.mode !== "single") {
    const selection = spokeSelectionForHost(routing, host);
    if (selection === null) return null;
    // THE SELECTION'S OWN ENTRY, not a search by local id: where Spoke Hubs are identified, two Hubs may
    // each declare that id, and the entry is what carries the composite segment this request must resolve
    // (FOUNDATION-ID-M3-P2). A selection with no entry answers nothing rather than another Spoke's content.
    return routingEntryForSelection(routing, selection);
  }

  // ONE-Spoke compatibility: a LEGACY/FLAT build published exactly one entry, so there is nothing to choose.
  return routing.spokes.length === 1 ? routing.spokes[0] : null;
}

/**
 * Hand the request on with the selected Spoke declared on the PRIVATE upstream header — the pathname is
 * passed through exactly as the visitor requested it (that is the whole point: it stays the page identity).
 *
 * §6 — SPOOF-PROOF: the header is SET, never merely forwarded. Whatever a client sent under that name is
 * discarded and replaced by the boundary's own decision, so a request cannot choose its own Spoke. The
 * header is written into the upstream REQUEST only; it is never added to a response.
 */
function continueWithSelectedSpoke(request: NextRequest, entry: SpokeHostRoutingEntry): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(SPOKE_SELECTION_HEADER, entry.runtimeSegment);
  // The public pathname is preserved, but the edge boundary is its authority. The Server Action
  // reads this private upstream header to resolve the exact EFS publication binding; any value a
  // client sent under the same name is discarded here.
  headers.set(EFS_REQUEST_PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

/**
 * A Spoke's own presentation artwork is served ONLY to a caller authorized to see THAT namespace.
 *
 * `declared` is not `published`. A Spoke declared in `spokes.json` has a namespace in `public/spokes/**`, but
 * that alone must not expose it: the authorization question is *does an explicit EFS publication on THIS host
 * name this Spoke?*, and only the build can answer it (the boundary has no filesystem). `@/config/spoke-routing`
 * carries the build's projection of the manifest's bindings; this function consumes it and decides nothing on
 * its own, so the proxy is not a second publication authority.
 *
 *   EFS-AUTHORIZED host — the host has at least one publication binding. Only Spokes those bindings name may
 *   serve their namespace. An informational `site.url` grants nothing, and a Spoke declared but not published
 *   here is refused even though its directory exists.
 *
 *   NO publication on this host — the released host-only rule applies, unchanged: an exclusive host serves
 *   only its own selected Spoke, a shared host names no owner, and an unclaimed host names nobody.
 */
function spokeAsset(request: NextRequest): NextResponse {
  const routing = hostRoutingForBuild();
  const host = request.headers.get("host");
  const segment = assetSegment(request.nextUrl.pathname);
  // A namespace name is ONE path segment. Anything that could climb out of it is not a Spoke.
  if (segment === null) return refuse();

  const published = publishedRuntimeSegmentsForHost(routing, host);
  if (published.size > 0) {
    return published.has(segment) ? passThrough(request) : refuse();
  }

  const entry = isSharedHostInRouting(routing, host) ? null : selectedEntry(routing, host);
  if (entry === null || entry.runtimeSegment !== segment) return refuse();
  return passThrough(request);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1 — the retired internal namespace is not a page: nothing renders there.
  if (isInternalSpokePath(pathname)) return refuse();

  // 2 — a Spoke's own asset namespace is host-bound (static paths included — see the matcher).
  if (pathname.startsWith(SPOKE_ASSET_PREFIX)) return spokeAsset(request);

  // 3 — which Spoke answers this host: an exact claim, or no selection at all. An unclaimed
  // host is still handed to the App Router: EFS may own it, and otherwise the request context
  // refuses it with the same 404. No second runtime is selected here.
  const routing = hostRoutingForBuild();
  const entry = selectedEntry(routing, request.headers.get("host"));
  if (entry === null) {
    const forwarded = new Headers(request.headers);
    forwarded.delete(SPOKE_SELECTION_HEADER);
    forwarded.set(EFS_REQUEST_PATH_HEADER, pathname);
    return NextResponse.next({ request: { headers: forwarded } });
  }

  // 4 — the PUBLIC request continues unchanged, carrying the boundary's selection privately upstream.
  return continueWithSelectedSpoke(request, entry);
}

export const config = {
  /**
   * `/_next/**` stays entirely outside this boundary, as does every path that looks like a static file —
   * EXCEPT a Spoke's own asset namespace, which must be checked on a dotted path too (M16).
   */
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/spokes/:path*",
  ],
};
