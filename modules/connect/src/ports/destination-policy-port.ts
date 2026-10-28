import type { DestinationPolicy } from '../domain/destination-policy.js';
import type { CommunicationContext } from '../domain/communication-context.js';

/**
 * The destination-policy adapter is the **only** source of delivery authority (M1 §B.3, generic in M3
 * portability §5). It owns publication-association proof, Site and form ownership, Page binding
 * verification and sender verification; the Module never derives any of that itself.
 *
 * The Module is intentionally ignorant of how a consumer represents these concepts: an adapter may
 * translate Foundation's `Installation + Spoke + Entity + Facet + Site + Page` (see the reference
 * mapping in `tests/support/foundation/`) or any other application's model.
 */
export type PolicyContextProblem =
  | 'siteNotOwnedByOwner'
  | 'formNotBoundToSite'
  | 'placementNotAuthorized'
  | 'publisherNotAuthorized';

export type PolicyResolution =
  | { readonly kind: 'resolved'; readonly policy: DestinationPolicy }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'scopeMismatch' }
  | { readonly kind: 'purposeNotPermitted' }
  | { readonly kind: 'senderUnverified' }
  | { readonly kind: 'contextInvalid'; readonly reason: PolicyContextProblem }
  | { readonly kind: 'associationUnauthorized' }
  | { readonly kind: 'ambiguous' };

export interface DestinationPolicyPort {
  /**
   * Resolve the single applicable policy for the supplied context.
   *
   * Contract obligations:
   * - never return a policy whose `deploymentRef`/`ownerRef` differ from the context's;
   * - never resolve a Site across owners: a local Site slug is unique only inside its owner, so the
   *   lookup key must be `(deploymentId, ownerRef, siteRef)`;
   * - verify that the Page (or explicit site-wide scope) and the form genuinely belong to that Site;
   * - verify the publication association and answer `associationUnauthorized` when it is absent;
   * - apply deterministic specificity (`PAGE_BINDING_SPECIFICITY` over
   *   `SITE_WIDE_BINDING_SPECIFICITY`) and answer `ambiguous` rather than guessing on a tie;
   * - never invent a default owner, wildcard recipient or first-match destination;
   * - throw only for genuine adapter failure (the Module maps a throw to `INF-002`).
   */
  resolve(request: { readonly context: CommunicationContext }): Promise<PolicyResolution>;
}
