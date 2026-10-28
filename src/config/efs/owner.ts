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
 * legitimately introduce a host that the older Spoke-host routing table does not know — the publication
 * owner is then the authority — and, because `D31` makes the BINDING the authority for a public address, a
 * hostname may legitimately be SHARED by several Spokes publishing different path prefixes of it. A
 * hostname may not veto an explicitly owned publication either: `site.url` is INFORMATIONAL, so ONE
 * Spoke's informational hostname is not a claim of exclusive ownership that another Spoke's declared
 * binding has to satisfy. Ownership is decided by declarations only, and the explicit publication
 * collision checks (`bindingIssues`) are what refuse a genuine conflict.
 *
 * There is no `null` context and no reserved implicit Spoke. An Installation that declares no Spoke
 * hierarchy cannot own an EFS publication at all: it is a setup diagnostic, not a permissive mode.
 */
import { normalizeHostname } from "@/core/spoke";

import type { EfsPublicationDeclaration } from "@/config/efs/manifest";
import {
  runtimeContextForSpoke,
  type InstallationRuntimeIndex,
  type InstallationRuntimeSpoke,
  type SpokeRuntimeContext,
} from "@/config/installation-runtime";
import { installationRuntimeIndexForBuild } from "@/config/spoke-request";
import { publicationOwnedBy, type EfsBinding } from "@/core/efs/publication";

/** The exact reason an ownership declaration cannot authorize a request. */
export type EfsOwnerRefusal =
  | "installation-has-no-explicit-spoke-hierarchy"
  | "publication-names-an-undeclared-spoke"
  | "publication-names-the-wrong-spoke-hub"
  | "publication-owner-is-ambiguous";

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
 * The publication must name a real Spoke, composed from this Installation. That is the whole rule.
 *
 * The hostname is deliberately NOT an ownership input. `D31` makes the explicit publication binding the
 * authority for a public address, and `site.url` is informational: a Spoke that authors
 * `url: https://a.example` is describing the origin it is *served from*, not asserting an exclusive
 * property that may veto another Spoke's explicitly declared publication on a prefix of that origin.
 *
 * This replaces an earlier rule that refused whenever exactly ONE other Spoke's informational hostname
 * matched the binding's host. That rule preserved the original architectural contradiction in a narrower
 * shape, and it made the accepted topology impossible:
 *
 *     Spoke A  site.url = https://shared.example.test   publication = shared.example.test/alpha
 *     Spoke B  site.url = https://other.example.test    publication = shared.example.test/beta
 *
 * Spoke B's binding named its own owner explicitly; A's `site.url` is informational; refusing B served no
 * isolation purpose, because the binding had already decided the address and the owner.
 *
 * WHAT STILL REFUSES, and must keep refusing:
 *
 *   · a publication naming a Spoke this Installation does not declare (or the wrong Spoke Hub);
 *   · an ambiguous owner declaration;
 *   · an Installation with no explicit Spoke hierarchy (a flat/legacy one cannot own an EFS publication);
 *   · two publications claiming the SAME host and prefix — `bindingIssues` in `@/config/efs/manifest`, the
 *     explicit publication collision check, which is untouched by this rule.
 *
 * LEGACY HOST-ONLY BEHAVIOUR IS UNCHANGED. A host that no binding matches is still answered by the
 * released hostname routing, exactly as before; this rule governs EFS publications only.
 *
 * `host` is accepted because every caller is asking about a concrete request and the refusal diagnostic is
 * more useful naming it. It never decides the answer.
 */
export function efsPublicationOwnerForRequest(
  publication: EfsPublicationDeclaration,
  host: string,
): EfsOwnerResolution {
  const index = installationRuntimeIndexForBuild();
  const resolved = publicationOwnerInInstallation(index, publication);
  if (resolved.kind === "refused") {
    return { ...resolved, detail: `${resolved.detail} (evaluated for host "${host}")` };
  }
  return resolved;
}

/**
 * The declared Spokes claiming `host` through their informational `site.url` — the classification the
 * REQUEST BOUNDARY needs.
 *
 * `0` is a host the routing table does not know (a binding may introduce it), `1` is a claim by that Spoke,
 * and `2+` is a SHARED host that no hostname rule may answer. Normalization is the ONE pure step
 * (`@/core/spoke`), so a caller cannot compare a raw `Host` header against a claim by accident.
 *
 * This answers "who may the HOST select?" for legacy host-only routing. It is deliberately NOT an
 * ownership input for an EFS publication: `D31` makes the binding the authority, and `site.url` may not
 * veto one (see `efsPublicationOwnerForRequest`).
 */
export function hostClaimantsInInstallation(
  index: InstallationRuntimeIndex,
  host: string,
): readonly InstallationRuntimeSpoke[] {
  const normalized = normalizeHostname(host);
  if (normalized === null) return [];
  return index.spokes.filter((spoke) => spoke.hostnameClaims.includes(normalized));
}

/** A binding's publication owner, with the binding's own host as the conflict check. */
export function efsBindingOwner(
  publication: EfsPublicationDeclaration,
  binding: EfsBinding,
): EfsOwnerResolution {
  return efsPublicationOwnerForRequest(publication, binding.host);
}
