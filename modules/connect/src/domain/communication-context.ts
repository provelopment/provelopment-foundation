import type { InternalCode } from './error-codes.js';
import {
  identifier,
  MAX_IDENTIFIER_LENGTH,
  type AuthorizationId,
  type DeploymentId,
  type FormId,
  type OwnerId,
  type PageId,
  type PublisherId,
  type SiteId,
} from './identifiers.js';
import { isPurpose, type Purpose } from './purpose.js';
import { err, isRecord, ok, type Result } from './result.js';

/**
 * Where the form is placed (M3 portability §4).
 *
 * A page-mounted form carries a **verified** Page binding. A deliberately Site-wide form says so
 * explicitly: a missing Page is never inferred to mean "Site-wide", and a Page binding is never
 * inferred from a path, query string or hidden input.
 */
export type FormPlacement =
  { readonly kind: 'page'; readonly pageRef: PageId } | { readonly kind: 'site-wide' };

/**
 * Trusted communication target — the generic replacement for the Foundation-specific publication
 * context (M3 portability §4). Semantics, not names, are the contract:
 *
 * - `deploymentId` — the policy namespace the consumer owns;
 * - `publisherRef` — the publishing context in which the Site is presented;
 * - `ownerRef` — the business owner the Site and its recipient policy belong to;
 * - `siteRef` — a Site identifier that is unique **within** `(deploymentId, ownerRef)`;
 * - `placement` — the verified Page binding, or an explicit Site-wide scope;
 * - `formRef` — the authored form/binding under that Site;
 * - `purpose` — what the visitor is asking for;
 * - `authorizationRef` — the verified publication-authorization reference, kept for audit.
 *
 * Every value is supplied by a trusted adapter after ITS OWN validation. This Module validates shape
 * and consistency only; it cannot prove an association exists, and an opaque identifier is never
 * authority by itself.
 */
export interface CommunicationContext {
  readonly deploymentId: DeploymentId;
  readonly publisherRef: PublisherId;
  readonly ownerRef: OwnerId;
  readonly siteRef: SiteId;
  readonly placement: FormPlacement;
  readonly formRef: FormId;
  readonly purpose: Purpose;
  readonly authorizationRef: AuthorizationId;
  /** Presentation only. Never authority, never part of Site identity. */
  readonly locale?: string;
}

/** Internal diagnostic for a rejected context. Never surfaced to a visitor. */
export interface ContextProblem {
  readonly code: InternalCode;
  readonly reason: string;
}

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'deploymentId',
  'publisherRef',
  'ownerRef',
  'siteRef',
  'placement',
  'formRef',
  'purpose',
  'authorizationRef',
  'locale',
]);

const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function readIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH) return undefined;
  if (value.trim() !== value) return undefined;
  if (CONTROL_CHARACTER_PATTERN.test(value)) return undefined;
  return value;
}

function readPlacement(value: unknown): FormPlacement | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);

  if (value['kind'] === 'site-wide') {
    return keys.length === 1 ? { kind: 'site-wide' } : undefined;
  }

  if (value['kind'] === 'page') {
    if (keys.length !== 2) return undefined;
    const pageRef = readIdentifier(value['pageRef']);
    if (pageRef === undefined) return undefined;
    return { kind: 'page', pageRef: identifier.page(pageRef) };
  }

  return undefined;
}

function fail(reason: string): Result<never, ContextProblem> {
  return err({ code: 'CTX-001', reason });
}

/**
 * Structural validation of the communication context: **shape and completeness only**.
 *
 * It can never prove that `(publisher, owner, site, placement, form, authorization)` is a real,
 * authorized association. Authority comes from the destination-policy adapter (M1 §B.3), which may
 * additionally answer `CTX-002`, `CTX-003` or `CTX-004`.
 */
export function parseCommunicationContext(
  input: unknown,
): Result<CommunicationContext, ContextProblem> {
  if (!isRecord(input)) return fail('context must be an object');

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) return fail(`unknown context field: ${key}`);
  }

  const deploymentId = readIdentifier(input['deploymentId']);
  if (deploymentId === undefined) return fail('deploymentId missing or malformed');

  const publisherRef = readIdentifier(input['publisherRef']);
  if (publisherRef === undefined) return fail('publisherRef missing or malformed');

  const ownerRef = readIdentifier(input['ownerRef']);
  if (ownerRef === undefined) return fail('ownerRef missing or malformed');

  const siteRef = readIdentifier(input['siteRef']);
  if (siteRef === undefined) return fail('siteRef missing or malformed');

  const placement = readPlacement(input['placement']);
  if (placement === undefined)
    return fail('placement must be a page binding or explicit site-wide');

  const formRef = readIdentifier(input['formRef']);
  if (formRef === undefined) return fail('formRef missing or malformed');

  const authorizationRef = readIdentifier(input['authorizationRef']);
  if (authorizationRef === undefined) return fail('authorizationRef missing or malformed');

  const purpose = input['purpose'];
  if (!isPurpose(purpose)) return fail('purpose is not a supported purpose');

  let locale: string | undefined;
  const rawLocale = input['locale'];
  if (rawLocale !== undefined) {
    if (typeof rawLocale !== 'string' || !LOCALE_PATTERN.test(rawLocale)) {
      return fail('locale is not a BCP-47-shaped tag');
    }
    locale = rawLocale;
  }

  return ok({
    deploymentId: identifier.deployment(deploymentId),
    publisherRef: identifier.publisher(publisherRef),
    ownerRef: identifier.owner(ownerRef),
    siteRef: identifier.site(siteRef),
    placement,
    formRef: identifier.form(formRef),
    purpose,
    authorizationRef: identifier.authorization(authorizationRef),
    ...(locale === undefined ? {} : { locale }),
  });
}

/**
 * Frozen authorization snapshot stored with a delivery job (M3 §7).
 *
 * It carries the generic owner/Site/Page/form binding, so a job can be re-authorized against the
 * *current* policy without re-deriving identity and without ever re-targeting a different inbox.
 */
export interface DeliveryAuthorization {
  readonly deploymentId: DeploymentId;
  readonly publisherRef: PublisherId;
  readonly ownerRef: OwnerId;
  readonly siteRef: SiteId;
  readonly placement: FormPlacement;
  readonly formRef: FormId;
  readonly purpose: Purpose;
  readonly authorizationRef: AuthorizationId;
}

export function authorizationFromContext(context: CommunicationContext): DeliveryAuthorization {
  return {
    deploymentId: context.deploymentId,
    publisherRef: context.publisherRef,
    ownerRef: context.ownerRef,
    siteRef: context.siteRef,
    placement: context.placement,
    formRef: context.formRef,
    purpose: context.purpose,
    authorizationRef: context.authorizationRef,
  };
}

/** Rebuild the context a policy adapter needs. Values come from the durable record, not from input. */
export function contextFromAuthorization(
  authorization: DeliveryAuthorization,
): CommunicationContext {
  return {
    deploymentId: authorization.deploymentId,
    publisherRef: authorization.publisherRef,
    ownerRef: authorization.ownerRef,
    siteRef: authorization.siteRef,
    placement: authorization.placement,
    formRef: authorization.formRef,
    purpose: authorization.purpose,
    authorizationRef: authorization.authorizationRef,
  };
}

/**
 * Site identity key: `(deploymentId, ownerRef, siteRef)`.
 *
 * A local Site slug is unique only inside its owner's namespace, so two unrelated businesses may use
 * the same slug without ever colliding. `publisherRef` is an association dimension, not identity: the
 * same business Site published through two publishers is still the same Site.
 */
export function siteIdentityKey(reference: {
  readonly deploymentId: DeploymentId;
  readonly ownerRef: OwnerId;
  readonly siteRef: SiteId;
}): string {
  return [reference.deploymentId, reference.ownerRef, reference.siteRef].join('\u0000');
}

export function siteIdentityKeyOfContext(context: CommunicationContext): string {
  return siteIdentityKey({
    deploymentId: context.deploymentId,
    ownerRef: context.ownerRef,
    siteRef: context.siteRef,
  });
}

/** Human-readable placement key, used for comparisons and diagnostics. */
export function placementKey(placement: FormPlacement): string {
  return placement.kind === 'page' ? `page:${placement.pageRef}` : 'site-wide';
}
