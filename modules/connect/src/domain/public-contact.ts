/**
 * Public email contact projection (`CONNECT-EMAIL-CONTACT-READINESS-A1`, deliverable A).
 *
 * A business may expose **public** contact addresses (the address a site publishes so a visitor can
 * write to it), which is a different concern from the **private** recipient policy that decides where a
 * submitted enquiry is delivered (`DestinationPolicy.recipients`). Those two must never be derived from
 * one another: nothing here reads a destination policy, a transport, a form or a store, and no private
 * inbox can appear in the output by accident.
 *
 * The only thing this contract produces is a deterministic, native, click-to-write link —
 * `mailto:<address>` — or an explicit `absent` / `unavailable` projection. It never invents a redirect,
 * HTTP route, client script, `to` policy, subject/body/header query string or dispatcher, and it never
 * opens a mail client itself: the consumer renders the returned href as a link and the visitor's own
 * mail client decides what happens next. A `mailto:` link transmits nothing from a server and proves no
 * delivery.
 *
 * Authority: the consumer supplies the *already verified* owner/Site/publication association
 * (`PublicContactAuthority`); this Module validates only that the supplied configuration is internally
 * consistent with it and fails closed when it is not. A branded identifier, a host, a route, a locale,
 * a visitor value or a self-claimed URL never becomes authority here.
 *
 * Design boundary: this is deliberately a pure function over consumer-supplied records, not a port or a
 * channel registry. There is one supported public method kind — `email` — and it is a literal, not an
 * extensible set. Adding another channel is an owner decision that does not begin here.
 */
import {
  identifier,
  MAX_IDENTIFIER_LENGTH,
  type AuthorizationId,
  type DeploymentId,
  type OwnerId,
  type PublicContactMethodId,
  type PublisherId,
  type SiteId,
} from './identifiers.js';
import { ok, err, isRecord, type Result } from './result.js';

/** Lifecycle of one consumer-authored public contact configuration. Only `enabled` may be projected. */
export const PUBLIC_CONTACT_CONFIGURATION_STATUSES = ['enabled', 'disabled', 'revoked'] as const;

export type PublicContactConfigurationStatus =
  (typeof PUBLIC_CONTACT_CONFIGURATION_STATUSES)[number];

/** Lifecycle of one configured public method. */
export const PUBLIC_CONTACT_METHOD_STATUSES = ['enabled', 'disabled', 'revoked'] as const;

export type PublicContactMethodStatus = (typeof PUBLIC_CONTACT_METHOD_STATUSES)[number];

/**
 * Why a projection produced no link. Closed set, returned instead of throwing so a consumer can render
 * nothing at all and still tell its own operators what to fix.
 *
 * `absent` reasons describe a legitimate "this Site publishes no public contact method":
 * `not-configured`, `configuration-disabled`, `configuration-revoked`, `no-available-method`.
 * `unavailable` reasons describe a configuration the Module refuses to use:
 * `configuration-malformed`, `scope-mismatch`, `publication-mismatch`, `unauthorized`.
 */
export const PUBLIC_CONTACT_REFUSALS = [
  'not-configured',
  'configuration-disabled',
  'configuration-revoked',
  'no-available-method',
  'configuration-malformed',
  'scope-mismatch',
  'publication-mismatch',
  'unauthorized',
] as const;

export type PublicContactRefusal = (typeof PUBLIC_CONTACT_REFUSALS)[number];

/**
 * Why one configured method was left out of an otherwise usable projection. A single unusable entry
 * never suppresses the others and never exposes an address.
 */
export const PUBLIC_CONTACT_OMISSIONS = [
  'method-malformed',
  'method-disabled',
  'method-revoked',
  'duplicate-method-ref',
  'unsupported-kind',
  'invalid-method-ref',
  'invalid-label',
  'unsafe-address',
] as const;

export type PublicContactOmission = (typeof PUBLIC_CONTACT_OMISSIONS)[number];

/** The only supported public method kind. A literal on purpose: no generic channel registry exists. */
export const PUBLIC_EMAIL_METHOD_KIND = 'email';
/** The only scheme this contract may produce. */
export const PUBLIC_EMAIL_SCHEME = 'mailto:';

export const MAX_PUBLIC_METHODS = 20;
export const MAX_PUBLIC_METHOD_REF_LENGTH = 64;
export const MAX_PUBLIC_METHOD_LABEL_LENGTH = 64;
export const MAX_PUBLIC_EMAIL_ADDRESS_LENGTH = 254;

/**
 * Verified association facts for the surface being rendered.
 *
 * Every value comes from the consumer's own authority after ITS verification of
 * owner/Site/publication association. `authorizationRef` is that verified publication-authorization
 * reference, exactly as `CommunicationContext.authorizationRef` is for a submitted enquiry.
 */
export interface PublicContactAuthority {
  readonly deploymentId: DeploymentId;
  readonly ownerId: OwnerId;
  readonly siteId: SiteId;
  /** The verified publication-authorization reference the configuration must accept. */
  readonly authorizationRef: AuthorizationId;
  /** Optional verified publishing context. Present when rendering inside a specific publisher. */
  readonly publisherRef?: PublisherId;
}

/** One projected public method, already reduced to what a native link needs. */
export interface PublicEmailMethod {
  /** The configured key, shaped to be usable directly as `connect.methods[].id`. */
  readonly methodRef: PublicContactMethodId;
  /** The consumer's own label, unmodified (presentation text; the consumer escapes as it renders). */
  readonly label: string;
  readonly kind: typeof PUBLIC_EMAIL_METHOD_KIND;
  /** Deterministic `mailto:<address>`: no query string, no header, no script. */
  readonly href: string;
}

/** A configured method the projection declined to use. Carries no address. */
export interface PublicContactOmissionRecord {
  /** The configured key, or `#<index>` when the entry itself was unreadable. Never a raw address. */
  readonly methodRef: string;
  readonly reason: PublicContactOmission;
}

/**
 * Projection result.
 *
 * - `available` — one or more public email methods, in the order the consumer authored them.
 * - `absent` — nothing public is configured or nothing configured is usable: render no public method.
 * - `unavailable` — the supplied configuration cannot be trusted for this authority: fail closed.
 *
 * `omitted` is present on `available`/`absent` only; an `unavailable` projection reveals nothing about
 * the configuration it refused.
 */
export type PublicContactProjection =
  | {
      readonly kind: 'available';
      readonly methods: readonly PublicEmailMethod[];
      readonly omitted: readonly PublicContactOmissionRecord[];
    }
  | {
      readonly kind: 'absent';
      readonly reason: PublicContactRefusal;
      readonly omitted: readonly PublicContactOmissionRecord[];
    }
  | { readonly kind: 'unavailable'; readonly reason: PublicContactRefusal };

export interface PublicContactProjectionInput {
  /** Consumer-verified association facts. */
  readonly authority: PublicContactAuthority;
  /** Consumer-authored public contact configuration. Absent means "no public contact method". */
  readonly configuration?: unknown;
}

/** `true` when the refusal is a legitimate "nothing to render" rather than a refusal to trust input. */
export function isAbsentReason(reason: PublicContactRefusal): boolean {
  return (
    reason === 'not-configured' ||
    reason === 'configuration-disabled' ||
    reason === 'configuration-revoked' ||
    reason === 'no-available-method'
  );
}

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
/** Method keys are lowercase slugs so a consumer can use them unchanged as `connect.methods[].id`. */
const METHOD_REF_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Conservative ASCII address grammar. Deliberately narrower than RFC 5322: quoted local parts, comments
 * and anything that could start a `mailto:` query (`?`, `&`, `=`, `#`, `%`) or a header are refused, so
 * the produced href is exactly `mailto:` + the address and nothing else. No percent-encoding is applied
 * or needed, which keeps the link byte-for-byte deterministic.
 */
const LOCAL_PART_PATTERN = /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*$/;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const FORBIDDEN_ADDRESS_CHARACTERS = /[\s<>()[\],;:"\\?#&=%]/;

/**
 * Validate a **bare** public address and return it unchanged.
 *
 * Refusals are deliberate and never echo the value: the caller learns only that the address is unsafe.
 * A consumer that wants to publish `mailto:someone@example.com` supplies `someone@example.com`; a
 * supplied scheme, header, query or markup is refused rather than normalised.
 */
export function parsePublicEmailAddress(value: unknown): Result<string, PublicContactOmission> {
  if (typeof value !== 'string') return err('unsafe-address');
  if (value.length < 3 || value.length > MAX_PUBLIC_EMAIL_ADDRESS_LENGTH)
    return err('unsafe-address');
  if (value.trim() !== value) return err('unsafe-address');
  if (CONTROL_CHARACTER_PATTERN.test(value)) return err('unsafe-address');
  if (FORBIDDEN_ADDRESS_CHARACTERS.test(value)) return err('unsafe-address');

  const parts = value.split('@');
  if (parts.length !== 2) return err('unsafe-address');
  const [localPart, domain] = parts as [string, string];
  if (localPart.length === 0 || localPart.length > 64) return err('unsafe-address');
  if (!LOCAL_PART_PATTERN.test(localPart)) return err('unsafe-address');

  const labels = domain.split('.');
  // A public contact address must be a real, dotted domain: a bare host is not publishable, and the
  // Module never guesses a domain.
  if (labels.length < 2) return err('unsafe-address');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return err('unsafe-address');
    if (!DOMAIN_LABEL_PATTERN.test(label)) return err('unsafe-address');
  }
  const topLevel = labels[labels.length - 1] ?? '';
  if (topLevel.length < 2 || !/^[A-Za-z]{2,}$/.test(topLevel)) return err('unsafe-address');

  return ok(value);
}

/** The native link for a validated public address. Deterministic: no query, header or encoding. */
export function publicEmailHref(address: unknown): Result<string, PublicContactOmission> {
  const parsed = parsePublicEmailAddress(address);
  if (!parsed.ok) return parsed;
  return ok(`${PUBLIC_EMAIL_SCHEME}${parsed.value}`);
}

/** Read one configured method key. Slugs only, so the consumer can reuse it as a link id. */
function readMethodRef(value: unknown): PublicContactMethodId | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_PUBLIC_METHOD_REF_LENGTH) return undefined;
  if (!METHOD_REF_PATTERN.test(value)) return undefined;
  return identifier.publicContactMethod(value);
}

/**
 * Read one consumer-authored label. Single-line display text: control characters, line breaks and
 * markup delimiters are refused, and the value is otherwise returned verbatim (no case folding, no
 * translation, no truncation) so a native link keeps exactly the label the owner wrote.
 */
function readLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_PUBLIC_METHOD_LABEL_LENGTH) return undefined;
  if (value.trim().length === 0) return undefined;
  if (CONTROL_CHARACTER_PATTERN.test(value)) return undefined;
  if (/[<>]/.test(value)) return undefined;
  return value;
}

function readStatus(value: unknown): PublicContactMethodStatus | undefined {
  return (PUBLIC_CONTACT_METHOD_STATUSES as readonly unknown[]).includes(value)
    ? (value as PublicContactMethodStatus)
    : undefined;
}

function readIdentifierValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return undefined;
  if (value.trim() !== value) return undefined;
  if (CONTROL_CHARACTER_PATTERN.test(value)) return undefined;
  return value;
}

function readStringList(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const item of value) {
    const parsed = readIdentifierValue(item);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return items;
}

function unavailable(reason: PublicContactRefusal): PublicContactProjection {
  return { kind: 'unavailable', reason };
}

function malformed(): PublicContactProjection {
  return unavailable('configuration-malformed');
}

/** One configured method, already reduced to a projected link or an omission. */
function readPublicMethod(
  entry: unknown,
  index: number,
  seen: Set<string>,
): { readonly method?: PublicEmailMethod; readonly omitted?: PublicContactOmissionRecord } {
  const fallback = `#${index}`;
  if (!isRecord(entry)) return { omitted: { methodRef: fallback, reason: 'method-malformed' } };

  const methodRef = readMethodRef(entry['methodRef']);
  if (methodRef === undefined) {
    return { omitted: { methodRef: fallback, reason: 'invalid-method-ref' } };
  }
  // First entry with a key wins: a later duplicate is omitted whether or not the first was usable.
  if (seen.has(methodRef)) return { omitted: { methodRef, reason: 'duplicate-method-ref' } };
  seen.add(methodRef);

  if (entry['kind'] !== PUBLIC_EMAIL_METHOD_KIND) {
    return { omitted: { methodRef, reason: 'unsupported-kind' } };
  }
  const status = readStatus(entry['status']);
  if (status === undefined) return { omitted: { methodRef, reason: 'method-malformed' } };
  if (status === 'disabled') return { omitted: { methodRef, reason: 'method-disabled' } };
  if (status === 'revoked') return { omitted: { methodRef, reason: 'method-revoked' } };

  const label = readLabel(entry['label']);
  if (label === undefined) return { omitted: { methodRef, reason: 'invalid-label' } };

  const href = publicEmailHref(entry['address']);
  if (!href.ok) return { omitted: { methodRef, reason: 'unsafe-address' } };

  return { method: { methodRef, label, kind: PUBLIC_EMAIL_METHOD_KIND, href: href.value } };
}

/**
 * Project an owner's **public** email contact configuration into native links.
 *
 * Checks run in a fixed order, and the first failure decides the result:
 *
 * 1. shape — absent configuration is `absent/not-configured`; an unreadable one is
 *    `unavailable/configuration-malformed`;
 * 2. scope — `(deploymentId, ownerId, siteId)` must equal the verified authority, else
 *    `unavailable/scope-mismatch` (a configuration belonging to another owner is never read any
 *    further, so nothing of it can leak);
 * 3. authorization — the authority's verified reference must appear in the configuration's own
 *    `authorizationRefs`; an empty list authorizes nothing;
 * 4. publication — when the configuration names `publisherRefs`, the authority must name the verified
 *    publisher and it must be listed; an empty list authorizes nothing;
 * 5. lifecycle — a `disabled`/`revoked` configuration yields `absent`, never a link;
 * 6. methods — each entry is validated independently and in authored order; unusable entries are
 *    recorded as omissions and never suppress the usable ones.
 *
 * The output contains only public data: validated method keys, the consumer's own labels and
 * `mailto:` hrefs. It never contains a private recipient address, and nothing in this function reads
 * the destination policy, a transport, a form token, a store or the clock.
 */
export function projectPublicContact(input: PublicContactProjectionInput): PublicContactProjection {
  const { authority, configuration } = input;

  if (configuration === undefined || configuration === null) {
    return { kind: 'absent', reason: 'not-configured', omitted: [] };
  }
  if (!isRecord(configuration)) return malformed();

  const deploymentId = readIdentifierValue(configuration['deploymentId']);
  const ownerId = readIdentifierValue(configuration['ownerId']);
  const siteId = readIdentifierValue(configuration['siteId']);
  if (deploymentId === undefined || ownerId === undefined || siteId === undefined) {
    return malformed();
  }
  if (
    deploymentId !== authority.deploymentId ||
    ownerId !== authority.ownerId ||
    siteId !== authority.siteId
  ) {
    return unavailable('scope-mismatch');
  }

  const authorizationRefs = readStringList(configuration['authorizationRefs']);
  if (authorizationRefs === undefined) return malformed();
  const authorizationRef = readIdentifierValue(authority.authorizationRef);
  if (authorizationRef === undefined) return unavailable('unauthorized');
  if (!authorizationRefs.includes(authorizationRef)) return unavailable('unauthorized');

  const publisherRefs = readStringList(configuration['publisherRefs']);
  if (configuration['publisherRefs'] !== undefined && publisherRefs === undefined) {
    return malformed();
  }
  if (publisherRefs !== undefined) {
    const publisherRef =
      authority.publisherRef === undefined
        ? undefined
        : readIdentifierValue(authority.publisherRef);
    if (publisherRef === undefined) return unavailable('publication-mismatch');
    if (publisherRefs.length === 0 || !publisherRefs.includes(publisherRef)) {
      return unavailable('publication-mismatch');
    }
  }

  const configurationStatus = configuration['status'];
  if (configurationStatus === 'disabled') {
    return { kind: 'absent', reason: 'configuration-disabled', omitted: [] };
  }
  if (configurationStatus === 'revoked') {
    return { kind: 'absent', reason: 'configuration-revoked', omitted: [] };
  }
  if (configurationStatus !== 'enabled') return malformed();

  const rawMethods = configuration['methods'];
  if (rawMethods !== undefined && !Array.isArray(rawMethods)) return malformed();
  const entries: readonly unknown[] = Array.isArray(rawMethods) ? rawMethods : [];
  if (entries.length > MAX_PUBLIC_METHODS) return malformed();

  const methods: PublicEmailMethod[] = [];
  const omitted: PublicContactOmissionRecord[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const outcome = readPublicMethod(entry, index, seen);
    if (outcome.method !== undefined) methods.push(outcome.method);
    if (outcome.omitted !== undefined) omitted.push(outcome.omitted);
  }

  if (methods.length === 0) {
    return { kind: 'absent', reason: 'no-available-method', omitted };
  }
  return { kind: 'available', methods, omitted };
}
