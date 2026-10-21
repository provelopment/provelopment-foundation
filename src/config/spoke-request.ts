/**
 * THE SPOKE A REQUEST BELONGS TO (FOUNDATION-MULTISITE-M16)
 * ========================================================
 *
 * The SERVER-side seam between the request boundary and the explicit runtime context. THREE questions, all
 * answered from accepted authorities:
 *
 *     installationRuntimeIndexForBuild()   the Installation's Spokes, composed ONCE per process
 *     runtimeContextForSegment(segment)    the CONTEXT an internal route names — and nothing else
 *     runtimeContextForRequestHost(host)   the CONTEXT a public request resolves to, or NOTHING
 *
 * WHAT IT DELIBERATELY IS NOT
 * ---------------------------
 * It is not a second selection rule: which Spoke answers a host is decided by the pure routing table
 * (`./spoke-routing`, which consumes the build's inlined description and the domain's exact-claim match),
 * and what a Spoke IS is decided by the runtime index (`./installation-runtime`). This module only joins
 * the two, and it never guesses:
 *
 *   · MULTI (2+ declared Spokes): the host must claim a Spoke. An unclaimed hostname yields `null`, so its
 *     caller answers NOTHING — there is no default Spoke, no first Spoke and no fallback to a neighbour.
 *   · SINGLE (exactly one declared Spoke): that Spoke answers EVERY host. That is the accepted one-Spoke
 *     behaviour, preserved for development, preview and test hosts — and it is stated as "the Installation
 *     declares exactly one Spoke", never as "the first entry".
 *
 * SERVER/BUILD ONLY: it composes contexts from files, so it must never become reachable from a client chunk.
 */
import { headers } from "next/headers";

import { deploymentPaths } from "./deployment-root";
import {
  installationRuntimeIndex,
  runtimeContextForSpoke,
  type InstallationRuntimeIndex,
  type SpokeRuntimeContext,
} from "./installation-runtime";
import { SPOKE_SELECTION_HEADER } from "./spoke-selection";
import { hostRoutingForBuild, routingEntryForSelection, spokeSelectionForHost } from "./spoke-routing";

let cachedIndex: InstallationRuntimeIndex | null = null;

/**
 * The Installation's runtime index for THIS build, composed once from the Installation root the build
 * selected. Composing it parses and validates every declared Spoke's configuration once, so a request never
 * pays for a manifest read and two requests can never disagree.
 */
export function installationRuntimeIndexForBuild(): InstallationRuntimeIndex {
  if (cachedIndex === null) {
    cachedIndex = installationRuntimeIndex(deploymentPaths().root);
  }
  return cachedIndex;
}

/**
 * THE internal route's ONLY selector: the context of ONE runtime segment (or its Spoke id, which the
 * accepted lookup also accepts), or `null` for a segment this Installation does not declare.
 */
export function runtimeContextForSegment(segment: string): SpokeRuntimeContext | null {
  return runtimeContextForSpoke(installationRuntimeIndexForBuild(), segment);
}

/**
 * The context a PUBLIC request resolves to, or `null` — the fail-closed answer.
 *
 * `null` is a RESULT: it means "no Spoke may answer this request", and every caller turns it into a refusal
 * rather than a guess.
 */
export function runtimeContextForRequestHost(
  host: string | null | undefined,
): SpokeRuntimeContext | null {
  const routing = hostRoutingForBuild();
  const index = installationRuntimeIndexForBuild();

  // DISPATCH — the host decides. `identified` is included deliberately (§6): an Installation authored with
  // identified Spoke Hubs uses EXACT hostname dispatch even when it declares one Hub and one Spoke, so the
  // permissive branch below belongs to the FLAT/legacy single-Spoke case alone.
  if (routing.mode !== "single") {
    const selection = spokeSelectionForHost(routing, host);
    if (selection === null) return null;
    // THE RUNTIME KEY IS THE SELECTED ENTRY'S SEGMENT (FOUNDATION-ID-M3-P2): for an identified Installation
    // that segment is COMPOSITE, so the context resolved here is the one BOTH halves of the identity name —
    // never another Hub's Spoke that happens to share a local id. A selection with no entry answers nothing.
    const entry = routingEntryForSelection(routing, selection);
    if (entry === null) return null;
    return runtimeContextForSpoke(index, entry.runtimeSegment);
  }

  // SINGLE — a LEGACY/FLAT Installation declaring exactly ONE Spoke, so it answers every host. Length is
  // checked rather than assumed: a mode that says "single" while the index disagrees is a defect, not a
  // choice.
  if (index.spokes.length !== 1) return null;
  return runtimeContextForSpoke(index, index.spokes[0].id);
}

/**
 * The `Host` of the CURRENT request, or `null` when there is no request scope at all.
 *
 * A build-time or test-time caller (a metadata route evaluated directly, a unit test, a prerender pass) has
 * no request and therefore no hostname. That is a RESULT, not a failure: in SINGLE mode the Installation's
 * one Spoke still answers (the accepted behaviour, and what a build needs), while in MULTI mode nothing does
 * — a host that was never claimed may not be served another Spoke's content because the hostname is unknown.
 */
async function requestHostname(): Promise<string | null> {
  try {
    const requestHeaders = await headers();
    return requestHeaders.get("host");
  } catch {
    return null;
  }
}

/** The context of the CURRENT public request (its `Host` header), or `null`. */
export async function runtimeContextForRequest(): Promise<SpokeRuntimeContext | null> {
  return runtimeContextForRequestHost(await requestHostname());
}

/**
 * THE App Router tree's ONE selector (M17): the Spoke the REQUEST BOUNDARY selected, read from the private
 * upstream header it wrote — or, when no selection can exist, the Installation's SOLE Spoke.
 *
 * WHY THIS IS NOT A SECOND SELECTION RULE. It performs no hostname resolution at all: the boundary already
 * matched the exact claim, and this function only looks up the context that decision named. A value the
 * boundary wrote is authoritative; a value a CLIENT wrote is impossible, because the boundary overwrites the
 * header on every request it handles.
 *
 * WHAT EACH SHAPE ANSWERS (§7 — fail closed):
 *
 *   selection present + declared   → that Spoke's context
 *   selection present + unknown    → `null` — an unknown segment may not be answered by anyone
 *   no selection, MULTI            → `null` — no claimed host, so no Spoke: never a default or a first
 *   no selection, SINGLE           → the sole declared Spoke (the accepted one-Spoke compatibility rule, for
 *                                    build-time and test-time callers that have no request scope at all)
 */
export async function runtimeContextForCurrentRequest(): Promise<SpokeRuntimeContext | null> {
  let selected: string | null = null;
  try {
    selected = (await headers()).get(SPOKE_SELECTION_HEADER);
  } catch {
    // No request scope (a build-time or test-time caller): the compatibility rule below decides.
    selected = null;
  }

  if (selected !== null && selected !== "") {
    return runtimeContextForSegment(selected);
  }

  // No boundary selection: resolve the CURRENT host. This keeps the App Router's one selector
  // correct when an unclaimed host is forwarded to the explicit EFS resolver.
  return runtimeContextForRequest();
}
