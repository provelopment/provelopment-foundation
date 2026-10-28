import type {
  AuthorizationId,
  DeploymentId,
  FormId,
  OwnerId,
  PageId,
  PolicyId,
  PolicyRevision,
  PublisherId,
  SiteId,
} from './identifiers.js';
import type { CommunicationContext, FormPlacement } from './communication-context.js';
import { FIELD_LIMITS } from './content.js';
import { isBareMailbox } from './mailbox.js';
import type { Purpose } from './purpose.js';

/**
 * How a policy binds to a placement (M3 portability §5).
 *
 * `page` binds one specific Page under the Site; `site-wide` is an expressly configured binding that
 * may be reused across pages. A Site-wide binding is never a fallback for an undeclared Page: the
 * context must say `site-wide` explicitly, and a page-mounted context only matches a Site-wide policy
 * through the documented specificity rule in `policyBindingSpecificity`.
 */
export type PolicyBinding =
  { readonly kind: 'page'; readonly pageRef: PageId } | { readonly kind: 'site-wide' };

export interface PolicyApplicability {
  /** Sites this policy serves, scoped by the policy's own owner. A bare slug alone is not enough. */
  readonly siteRefs: readonly SiteId[];
  readonly bindings: readonly PolicyBinding[];
  /** Optional: omit to accept any authored form under a matching Site. */
  readonly forms?: readonly FormId[];
  /** Optional: omit to accept any publishing context the adapter has already verified. */
  readonly publisherRefs?: readonly PublisherId[];
  /**
   * Verified authorization references this policy accepts. An empty list authorizes nothing: the
   * association proof always comes from the consumer's authority (M1 §A.3, `P-02`).
   */
  readonly authorizationRefs: readonly AuthorizationId[];
}

export type RecipientKind = 'to' | 'cc';

export interface PolicyRecipient {
  readonly address: string;
  readonly kind: RecipientKind;
}

export interface SenderIdentity {
  readonly fromAddress: string;
  readonly fromDisplayName: string;
  /** `visitor` means reply-to is the validated visitor address; `fixed` means `replyToAddress`. */
  readonly replyToMode: 'visitor' | 'fixed';
  readonly replyToAddress?: string;
}

export interface TemplateReference {
  readonly templateId: string;
  readonly version: string;
  readonly localeFallbacks: readonly string[];
}

export interface AcknowledgementPolicy {
  readonly enabled: boolean;
  readonly templateId?: string;
}

/**
 * Owner-authored numeric limits (M5 §3). Two **separate** budgets exist and must never be conflated:
 *
 * - `perOwnerHour` / `perSiteHour` — **accepted-enquiry** capacity: committed, durable enquiries only.
 *   Replays and failed commits must not consume it.
 * - `attemptPerOwnerHour` / `attemptPerSiteHour` — **request-attempt** capacity: every attempt that reaches
 *   the protective check, including replays. This is the hostile-traffic knob.
 *
 * Absent values mean "no limit of this kind here"; the Module ships no defaults.
 */
export interface QuotaLimits {
  /** Accepted enquiries per owner per hour (committed only). */
  readonly perOwnerHour?: number;
  /** Accepted enquiries per Site per hour (committed only). */
  readonly perSiteHour?: number;
  /** Request attempts per owner per hour, including replays. */
  readonly attemptPerOwnerHour?: number;
  /** Request attempts per Site per hour, including replays. */
  readonly attemptPerSiteHour?: number;
}

/**
 * True when the owner configured an accepted-enquiry quota. Such a policy **requires** a capacity adapter:
 * acceptance fails closed rather than silently bypassing the configured limit (0.1.0 release gate, §3A).
 */
export function requiresAcceptedEnquiryQuota(quotas: QuotaLimits): boolean {
  return quotas.perOwnerHour !== undefined || quotas.perSiteHour !== undefined;
}

export interface PolicyValidity {
  readonly enabled: boolean;
  readonly fromEpochMs?: number;
  readonly untilEpochMs?: number;
}

/**
 * The **authorization surface both delivery modes share** (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`).
 *
 * A policy is configuration input: the Module validates it and fails closed, it never derives a
 * recipient from visitor input and never guesses a default owner. Two contracts are built on this
 * core — the durable one (`DestinationPolicy`, which adds the fields a *stored* job needs) and the
 * direct-send one (`DirectSendPolicy`, which adds nothing at all) — so there is exactly **one**
 * authorization algorithm (`policyBindingSpecificity`), one recipient validator and one set of
 * configuration rules for both modes.
 *
 * What is deliberately absent is what only a durable job needs: the frozen policy identity
 * (`policyId`/`policyRevision`, which detect substitution *between acceptance and dispatch*), the
 * accepted-enquiry quotas, retention, the durable abuse profile, the deferred acknowledgement and the
 * `service-enquiry` interest list. A direct send has no such interval and no such record, so requiring
 * them would force an owner to invent values.
 */
export interface PolicyAuthorizationCore {
  readonly deploymentRef: DeploymentId;
  readonly ownerRef: OwnerId;
  readonly purpose: Purpose;
  readonly applicability: PolicyApplicability;
  readonly recipients: readonly PolicyRecipient[];
  readonly sender: SenderIdentity;
  readonly template: TemplateReference;
  readonly validity: PolicyValidity;
  /**
   * Owner-authored numeric limits (M5 §3). The **request-attempt** values apply to both modes; the
   * accepted-enquiry values apply only where a durable commit can consume them. Absent values mean
   * "no limit of this class here"; the Module ships no defaults.
   */
  readonly quotas?: QuotaLimits;
  /**
   * Minimum accepted message length in **code points**. Absent preserves the released minimum
   * (`FIELD_LIMITS.message.min`, 10), so every existing policy keeps exactly today's behaviour; a
   * consumer that publishes a one-character form states `1` here. It is an owner's quality choice, not
   * a security ceiling, which is why it lives on the policy and not in `FIELD_LIMITS`.
   */
  readonly messageMinLength?: number;
}

/**
 * Server-owned destination authority (M1 §B.2, generic in M3 portability §5) — the **durable** contract:
 * the shared authorization core plus everything a stored job needs. Its released shape and behaviour are
 * unchanged.
 */
export interface DestinationPolicy extends PolicyAuthorizationCore {
  readonly policyId: PolicyId;
  readonly policyRevision: PolicyRevision;
  readonly acknowledgement: AcknowledgementPolicy;
  readonly quotas: QuotaLimits;
  readonly retention: string;
  readonly abuseProfile: string;
  /** Permitted `serviceInterest` values for `service-enquiry`; must come from the policy. */
  readonly serviceInterests?: readonly string[];
}

/** A page-specific binding outranks a Site-wide binding. Deterministic, documented, non-arbitrary. */
export const PAGE_BINDING_SPECIFICITY = 2;
export const SITE_WIDE_BINDING_SPECIFICITY = 1;

function placementSpecificity(
  bindings: readonly PolicyBinding[],
  placement: FormPlacement,
): number | undefined {
  if (placement.kind === 'site-wide') {
    return bindings.some((binding) => binding.kind === 'site-wide')
      ? SITE_WIDE_BINDING_SPECIFICITY
      : undefined;
  }

  const pageMatched = bindings.some(
    (binding) => binding.kind === 'page' && binding.pageRef === placement.pageRef,
  );
  if (pageMatched) return PAGE_BINDING_SPECIFICITY;

  return bindings.some((binding) => binding.kind === 'site-wide')
    ? SITE_WIDE_BINDING_SPECIFICITY
    : undefined;
}

/**
 * How specifically a policy authorizes a context, or `undefined` when it does not authorize it.
 *
 * Every condition is mandatory. Anything the policy does not explicitly authorize stays unauthorized:
 * there is no wildcard recipient, no implicit default owner and no "first match wins".
 *
 * Typed over `PolicyAuthorizationCore`, so the **same** function decides coverage for a durable policy
 * and for a direct-send policy: a `DestinationPolicy` is assignable to it by ordinary structural typing,
 * which is what keeps one authorization algorithm instead of two.
 */
export function policyBindingSpecificity(
  policy: PolicyAuthorizationCore,
  context: CommunicationContext,
): number | undefined {
  if (policy.deploymentRef !== context.deploymentId) return undefined;
  if (policy.ownerRef !== context.ownerRef) return undefined;
  if (policy.purpose !== context.purpose) return undefined;
  if (!policy.applicability.siteRefs.includes(context.siteRef)) return undefined;
  if (!policy.applicability.authorizationRefs.includes(context.authorizationRef)) return undefined;

  const publishers = policy.applicability.publisherRefs;
  if (publishers !== undefined && !publishers.includes(context.publisherRef)) return undefined;

  const forms = policy.applicability.forms;
  if (forms !== undefined && !forms.includes(context.formRef)) return undefined;

  return placementSpecificity(policy.applicability.bindings, context.placement);
}

/** True when the policy authorizes this exact context (site + placement + form + authorization). */
export function policyCoversContext(
  policy: PolicyAuthorizationCore,
  context: CommunicationContext,
): boolean {
  return policyBindingSpecificity(policy, context) !== undefined;
}

export type PolicySelection =
  | { readonly kind: 'resolved'; readonly policy: DestinationPolicy; readonly specificity: number }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'scopeMismatch' }
  | { readonly kind: 'ambiguous' };

/**
 * Deterministic selection over the candidate policies of one owner (M3 portability §5):
 *
 * 1. a policy must match deployment, owner, purpose, Site, authorization reference, and any declared
 *    publisher/form restriction;
 * 2. the most specific binding wins — a Page binding (2) over a Site-wide binding (1);
 * 3. zero matches is `notFound` (nothing relevant) or `scopeMismatch` (relevant but not authorized);
 * 4. a tie at the highest specificity is `ambiguous` and must fail closed. Guessing is forbidden.
 */
export function selectApplicablePolicy(
  policies: readonly DestinationPolicy[],
  context: CommunicationContext,
): PolicySelection {
  let best: { readonly policy: DestinationPolicy; readonly specificity: number } | undefined;
  let tied = false;
  let relevant = false;

  for (const policy of policies) {
    const specificity = policyBindingSpecificity(policy, context);
    if (specificity === undefined) {
      const sameOwner =
        policy.deploymentRef === context.deploymentId &&
        policy.ownerRef === context.ownerRef &&
        policy.purpose === context.purpose &&
        policy.applicability.siteRefs.includes(context.siteRef);
      if (sameOwner) relevant = true;
      continue;
    }
    if (best === undefined || specificity > best.specificity) {
      best = { policy, specificity };
      tied = false;
    } else if (specificity === best.specificity) {
      tied = true;
    }
  }

  if (best === undefined) return relevant ? { kind: 'scopeMismatch' } : { kind: 'notFound' };
  if (tied) return { kind: 'ambiguous' };
  return { kind: 'resolved', policy: best.policy, specificity: best.specificity };
}

export function isPolicyUsable(policy: PolicyAuthorizationCore, atEpochMs: number): boolean {
  if (!policy.validity.enabled) return false;
  const { fromEpochMs, untilEpochMs } = policy.validity;
  if (fromEpochMs !== undefined && atEpochMs < fromEpochMs) return false;
  if (untilEpochMs !== undefined && atEpochMs > untilEpochMs) return false;
  return true;
}

/**
 * Configuration defects that make the **shared authorization surface** unusable: no destination, a
 * contradictory recipient list, no applicability, no template, an unusable sender, an out-of-range
 * attempt budget or an out-of-range message minimum.
 *
 * Refused as `POL-001` (no usable policy) rather than silently repaired — and shared, so a durable policy
 * and a direct-send policy are held to the same standard by the same code.
 */
export function findCorePolicyConfigurationProblems(
  core: PolicyAuthorizationCore,
): readonly string[] {
  const problems: string[] = [];
  if (core.recipients.length === 0) problems.push('no recipients');
  if (!core.recipients.some((recipient) => recipient.kind === 'to')) {
    problems.push('no primary recipient');
  }
  for (const problem of findPolicyRecipientProblems(core.recipients)) problems.push(problem);
  if (core.applicability.siteRefs.length === 0) problems.push('no Site applicability');
  if (core.applicability.bindings.length === 0) problems.push('no placement binding');
  if (core.applicability.authorizationRefs.length === 0) {
    problems.push('no authorization reference');
  }
  if (core.template.templateId.length === 0) problems.push('template id missing');
  if (core.sender.replyToMode === 'fixed' && core.sender.replyToAddress === undefined) {
    problems.push('fixed reply-to mode without an address');
  }
  // The sender is a principal too: a malformed or multi-address `from` must be refused here, by the same
  // one-mailbox rule that governs recipients — never discovered at the provider.
  if (!isDeliverableAddress(core.sender.fromAddress)) {
    problems.push('sender address malformed');
  }
  const quotas = core.quotas;
  if (quotas !== undefined) {
    for (const value of [
      quotas.perSiteHour,
      quotas.perOwnerHour,
      quotas.attemptPerSiteHour,
      quotas.attemptPerOwnerHour,
    ]) {
      if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
        problems.push('quota limits must be positive integers');
      }
    }
  }
  const messageMinLength = core.messageMinLength;
  if (messageMinLength !== undefined) {
    if (
      !Number.isInteger(messageMinLength) ||
      messageMinLength < 1 ||
      messageMinLength > FIELD_LIMITS.message.max
    ) {
      problems.push('message minimum length must be an integer inside the message bound');
    }
  }
  return problems;
}

/**
 * Configuration defects that exist only because a job is **stored**: a `service-enquiry` policy must
 * declare the interests it may serve, because the value is enumerated later on the visitor's behalf.
 */
export function findDurablePolicyConfigurationProblems(
  policy: DestinationPolicy,
): readonly string[] {
  const problems: string[] = [];
  if (policy.purpose === 'service-enquiry') {
    if (policy.serviceInterests === undefined || policy.serviceInterests.length === 0) {
      problems.push('service-enquiry policy must declare service interests');
    }
  }
  return problems;
}

/**
 * Configuration defects that make a policy unusable. A defective policy is refused as `POL-001`
 * (no usable policy) rather than silently repaired.
 *
 * Composed from the core and durable checks **in the released order**, so every existing caller and
 * fixture observes a byte-identical list; this is a refactor of one function into two, not a
 * re-specification of the rules.
 */
export function findPolicyConfigurationProblems(policy: DestinationPolicy): readonly string[] {
  return [
    ...findCorePolicyConfigurationProblems(policy),
    ...findDurablePolicyConfigurationProblems(policy),
  ];
}

/** Permitted `serviceInterest` values, or an empty list when the policy cannot serve the purpose. */
export function permittedServiceInterests(policy: DestinationPolicy): readonly string[] {
  if (policy.purpose !== 'service-enquiry') return [];
  return policy.serviceInterests ?? [];
}

/**
 * Address normalization for authorization comparison. Domains are case-insensitive; the local part is
 * compared as authored so a policy cannot quietly rewrite a mailbox. Whitespace is not authority.
 */
export function normalizeRecipientAddress(address: string): string {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed.toLowerCase();
  return `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}

/**
 * Is this an address an owner may authorize for delivery?
 *
 * One definition, shared with the visitor's `email` field: a recipient or sender is **exactly one bare
 * mailbox** (`domain/mailbox.ts`). That single rule is what refuses, as malformed:
 *
 * - a comma- or semicolon-separated list (`"a@x.test, b@y.test"`), which would otherwise put two businesses
 *   in one header;
 * - two `@` characters (`"a@b@x.test"`);
 * - a display-name form (`"Ada <a@x.test>"`) or a quoted local part, which are not a bare mailbox;
 * - whitespace or any control character, so a header break cannot be smuggled through a policy;
 * - a domain without a dot (`"a@localhost"`), which is an internal alias rather than a deliverable mailbox.
 *
 * The raw authored value is checked, not a trimmed copy: surrounding whitespace in an operator's
 * configuration is a defect to surface, never something to repair silently.
 */
export function isDeliverableAddress(address: string): boolean {
  return isBareMailbox(address);
}

/**
 * Does this policy declare a **request-attempt** budget that something must actually enforce?
 *
 * Mirrors `requiresAcceptedEnquiryQuota`: a configured limit is a promise to the owner, and a use case that
 * cannot enforce it must refuse rather than quietly accept unlimited traffic. The two questions stay
 * separate because the two budgets count different things (`CW-D10`, correction R02-01).
 */
export function requiresAttemptBudget(quotas: QuotaLimits | undefined): boolean {
  if (quotas === undefined) return false;
  return quotas.attemptPerOwnerHour !== undefined || quotas.attemptPerSiteHour !== undefined;
}

/**
 * Configuration defects of the recipient list itself (M4 §2). Duplicate or contradictory entries are
 * refused rather than collapsed: a policy that names the same mailbox twice is not a policy that names
 * it once, and "to + cc" for one mailbox is ambiguous authority.
 */
export function findPolicyRecipientProblems(
  recipients: readonly PolicyRecipient[],
): readonly string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const roles = new Map<string, Set<RecipientKind>>();

  for (const recipient of recipients) {
    const address = normalizeRecipientAddress(recipient.address);
    // The **raw** value is validated (no trim): one bare mailbox, exactly as the owner authored it.
    if (!isDeliverableAddress(recipient.address)) {
      problems.push('recipient address malformed');
      continue;
    }
    const key = `${recipient.kind}\u0000${address}`;
    if (seen.has(key)) problems.push('duplicate recipient');
    seen.add(key);

    const known = roles.get(address) ?? new Set<RecipientKind>();
    known.add(recipient.kind);
    roles.set(address, known);
  }

  for (const [address, kinds] of roles) {
    if (kinds.size > 1) problems.push(`recipient appears as both primary and cc: ${address}`);
  }

  return problems;
}

interface RecipientEntry {
  readonly role: RecipientKind;
  readonly address: string;
}

function recipientEntries(recipients: readonly PolicyRecipient[]): RecipientEntry[] {
  return recipients.map((recipient) => ({
    role: recipient.kind,
    address: normalizeRecipientAddress(recipient.address),
  }));
}

function countEntries(entries: readonly RecipientEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.role}\u0000${entry.address}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Pre-dispatch re-authorization of an already frozen destination (M3 §7, hardened in M4 §2).
 *
 * The stored destination is compared as an exact **multiset of `(role, address)` pairs**, so every
 * difference is refused, including the ones a set comparison would miss:
 *
 * - an address removed from the policy (no longer authorized);
 * - an address added by the policy (the stored job never covered it);
 * - a duplicate-count change (`A, B` → `A, A` must not become "A twice");
 * - a role change (`to` → `cc`) for the same address;
 * - a sender identity change.
 *
 * Ordering is irrelevant, because recipient order carries no authority. A job therefore never sends to
 * an address the current policy does not authorize, and never silently drops one it did.
 */
export function findStoredDestinationProblems(
  policy: DestinationPolicy,
  stored: {
    readonly to: readonly string[];
    readonly cc: readonly string[];
    readonly fromAddress: string;
  },
): readonly string[] {
  const currentEntries = recipientEntries(policy.recipients);
  const storedEntries: RecipientEntry[] = [
    ...stored.to.map((address) => ({
      role: 'to' as const,
      address: normalizeRecipientAddress(address),
    })),
    ...stored.cc.map((address) => ({
      role: 'cc' as const,
      address: normalizeRecipientAddress(address),
    })),
  ];

  const current = countEntries(currentEntries);
  const saved = countEntries(storedEntries);
  const problems = new Set<string>();

  for (const key of new Set([...current.keys(), ...saved.keys()])) {
    const currentCount = current.get(key) ?? 0;
    const savedCount = saved.get(key) ?? 0;
    if (currentCount === savedCount) continue;

    const separator = key.indexOf('\u0000');
    const role = key.slice(0, separator);
    const address = key.slice(separator + 1);

    if (savedCount === 0) problems.add(`recipient added by policy: ${role}:${address}`);
    else if (currentCount === 0) problems.add(`recipient no longer authorized: ${role}:${address}`);
    else {
      problems.add(
        `recipient multiplicity changed: ${role}:${address} (${savedCount} -> ${currentCount})`,
      );
    }
  }

  const addresses = new Set([...currentEntries, ...storedEntries].map((entry) => entry.address));
  for (const address of addresses) {
    const currentRoles = new Set(
      currentEntries.filter((entry) => entry.address === address).map((entry) => entry.role),
    );
    const savedRoles = new Set(
      storedEntries.filter((entry) => entry.address === address).map((entry) => entry.role),
    );
    const removedRoles = [...savedRoles].filter((role) => !currentRoles.has(role));
    const addedRoles = [...currentRoles].filter((role) => !savedRoles.has(role));
    if (removedRoles.length > 0 && addedRoles.length > 0) {
      problems.add(
        `recipient role changed: ${address} (${removedRoles.join('+')} -> ${addedRoles.join('+')})`,
      );
    }
  }

  if (
    normalizeRecipientAddress(policy.sender.fromAddress) !==
    normalizeRecipientAddress(stored.fromAddress)
  ) {
    problems.add('sender identity changed');
  }

  return [...problems];
}

/**
 * Policy identity frozen at acceptance (M4 §3).
 *
 * Acceptance stores `policyId` + `policyRevision`. A **different policy identity** must never silently
 * substitute for the authority that accepted the job, even when it happens to name the same address: a
 * Site-wide policy is not the page policy that was approved.
 *
 * Revision strings are opaque and cannot be ordered. A revision change is therefore only *recognized*
 * as such — never assumed compatible — and the caller must still prove that the authorization surface
 * (binding, recipients, sender) is identical. If anything differs, the job is refused.
 */
export type PolicyIdentityVerdict =
  | { readonly kind: 'same' }
  | { readonly kind: 'revisionChanged' }
  | { readonly kind: 'incompatible'; readonly reason: string };

export function comparePolicyIdentity(
  stored: { readonly policyId: PolicyId; readonly policyRevision: PolicyRevision },
  policy: DestinationPolicy,
): PolicyIdentityVerdict {
  if (stored.policyId !== policy.policyId) {
    return { kind: 'incompatible', reason: 'policy identity changed' };
  }
  if (stored.policyRevision !== policy.policyRevision) return { kind: 'revisionChanged' };
  return { kind: 'same' };
}
