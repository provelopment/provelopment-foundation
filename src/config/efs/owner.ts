/**
 * EFS PUBLICATION OWNERSHIP AT RUNTIME (`S3-E3-R05`)
 * ==================================================
 *
 * ONE question, asked by every EFS surface:
 *
 *     is this publication owned by a Spoke that this Installation really declares,
 *     and is the request host free to be served by that Spoke?
 *
 * The answer is resolved from TWO explicit declarations only:
 *
 *   · the publication's own `spokeId` / `spokeHubId` (`config/efs/manifest`);
 *   · the Installation's runtime hierarchy (`spokes.json`, resolved once per build).
 *
 * A hostname, URL prefix, Site, Facet or Entity name never establishes ownership. A binding may
 * legitimately introduce a host that the older Spoke-host routing table does not know — the
 * publication owner is then the authority — but a host that the routing table DOES claim may only
 * be served by the Spoke it claims. That is a conflict, and it fails closed.
 *
 * There is no `null` context and no reserved implicit Spoke. An Installation that declares no Spoke
 * hierarchy cannot own an EFS publication at all: it is a setup diagnostic, not a permissive mode.
 */
import type { EfsPublicationDeclaration } from "@/config/efs/manifest";
import {
  runtimeContextForSpoke,
  type InstallationRuntimeIndex,
  type InstallationRuntimeSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import {
  installationRuntimeIndexForBuild,
  runtimeContextForRequestHost,
} from "@/config/spoke-request";
import { publicationOwnedBy, type EfsBinding } from "@/core/efs/publication";

/** The exact reason an ownership declaration cannot authorize a request. */
export type EfsOwnerRefusal =
  | "installation-has-no-explicit-spoke-hierarchy"
  | "publication-names-an-undeclared-spoke"
  | "publication-names-the-wrong-spoke-hub"
  | "publication-owner-is-ambiguous"
  | "host-is-claimed-by-another-spoke";

/** A resolved owner, or the reason ownership could not be established. */
export type EfsOwnerResolution =
  | { readonly kind: "resolved"; readonly context: SpokeRuntimeContext }
  | { readonly kind: "refused"; readonly reason: EfsOwnerRefusal; readonly detail: string };

/** The runtime identity a declared Spoke exposes to the ownership rule. */
function runtimeIdentity(spoke: InstallationRuntimeSpoke): {
  readonly id: string;
  readonly spokeHubId?: string;
} {
  return { id: spoke.id, spokeHubId: spoke.spokeHubId };
}

/**
 * Resolve a publication's owner INSIDE an already validated Installation hierarchy.
 *
 * Composite identity is exact in both directions: an identified Installation requires both halves,
 * and a flat Installation forbids a Hub half. Two Hubs may declare the same local id; only the
 * matching Hub resolves, so neither can borrow the other's publication.
 */
export function publicationOwnerInInstallation(
  index: InstallationRuntimeIndex,
  publication: EfsPublicationDeclaration,
): EfsOwnerResolution {
  if (index.mode === "legacy") {
    return {
      kind: "refused",
      reason: "installation-has-no-explicit-spoke-hierarchy",
      detail:
        `EFS publication "${publication.id}" cannot be owned by the reserved implicit Spoke. ` +
        "The Installation must declare its Spokes in spokes.json.",
    };
  }

  const matches = index.spokes.filter((spoke) => publicationOwnedBy(publication, runtimeIdentity(spoke)));
  if (matches.length === 0) {
    const hub = publication.spokeHubId === undefined ? "" : ` in Spoke Hub "${publication.spokeHubId}"`;
    return {
      kind: "refused",
      reason:
        publication.spokeHubId === undefined && index.mode === "hubs"
          ? "publication-names-the-wrong-spoke-hub"
          : "publication-names-an-undeclared-spoke",
      detail:
        `EFS publication "${publication.id}" names Spoke "${publication.spokeId}"${hub}, which this ` +
        "Installation does not declare.",
    };
  }
  if (matches.length > 1) {
    return {
      kind: "refused",
      reason: "publication-owner-is-ambiguous",
      detail:
        `EFS publication "${publication.id}" matches more than one declared Spoke. Composite ` +
        "identity must name exactly one record.",
    };
  }

  const spoke = matches[0];
  const context = runtimeContextForSpoke(index, spoke.runtimeSegment);
  if (!context || context.id !== spoke.id || context.spokeHubId !== spoke.spokeHubId) {
    return {
      kind: "refused",
      reason: "publication-names-an-undeclared-spoke",
      detail:
        `The declared Spoke "${spoke.id}" could not be composed from this Installation, so ` +
        "the publication has no usable owner.",
    };
  }
  return { kind: "resolved", context };
}

/**
 * Resolve the owner of `publication` for `host`, checking BOTH declarations.
 *
 * The publication must name a real Spoke. If the host-routing table claims the host for another
 * Spoke, the request is a conflict and is refused. An unclaimed host is not an error: an explicit
 * EFS binding is allowed to introduce one for the publication's declared owner.
 */
export function efsPublicationOwnerForRequest(
  publication: EfsPublicationDeclaration,
  host: string,
): EfsOwnerResolution {
  const resolved = publicationOwnerInInstallation(installationRuntimeIndexForBuild(), publication);
  if (resolved.kind === "refused") return resolved;

  const hostContext = runtimeContextForRequestHost(host);
  if (
    hostContext !== null &&
    (hostContext.id !== resolved.context.id ||
      hostContext.spokeHubId !== resolved.context.spokeHubId)
  ) {
    return {
      kind: "refused",
      reason: "host-is-claimed-by-another-spoke",
      detail:
        `Host "${host}" is claimed by Spoke "${hostContext.id}"` +
        `${hostContext.spokeHubId === undefined ? "" : ` in Hub "${hostContext.spokeHubId}"`}, ` +
        `but the publication is owned by "${publication.spokeId}"` +
        `${publication.spokeHubId === undefined ? "" : ` in Hub "${publication.spokeHubId}"`}.`,
    };
  }
  return resolved;
}

/** A binding's publication owner, with the binding's own host as the conflict check. */
export function efsBindingOwner(
  publication: EfsPublicationDeclaration,
  binding: EfsBinding,
): EfsOwnerResolution {
  return efsPublicationOwnerForRequest(publication, binding.host);
}
