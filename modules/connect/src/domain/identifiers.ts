/**
 * Branded identifier types for the **generic** communication contract (M3 portability, §4).
 *
 * Brands stop a `SiteId` being passed where a `PageId` is expected and stop a raw visitor string from
 * silently becoming identity. They grant **no authority**: construction happens in
 * `parseCommunicationContext` (structure only) or in a consumer adapter that has verified the value
 * against its own authority (for example a Foundation adapter).
 *
 * No identifier here names a Foundation concept. A consumer maps its own `Installation`, `Spoke`,
 * `Entity`, `Facet`, `Site`, `Page` and publication association onto these opaque values.
 */

declare const identifierBrand: unique symbol;

export type Branded<TBase, TBrand extends string> = TBase & {
  readonly [identifierBrand]: TBrand;
};

/** Policy/deployment namespace: the consumer's own partition (one installation, environment…). */
export type DeploymentId = Branded<string, 'DeploymentId'>;
/** Publishing context: where a Site is published (a host application, channel, or Spoke). */
export type PublisherId = Branded<string, 'PublisherId'>;
/** The business owner the Site and its recipient policy belong to. */
export type OwnerId = Branded<string, 'OwnerId'>;
/** Site identifier. Unique only within `(deploymentId, ownerId)`. */
export type SiteId = Branded<string, 'SiteId'>;
/** Page identifier, scoped under its Site. */
export type PageId = Branded<string, 'PageId'>;
/** Authored form/binding identifier, scoped under its Site. */
export type FormId = Branded<string, 'FormId'>;
/** Verified publication-authorization reference — the association proof, recorded for audit. */
export type AuthorizationId = Branded<string, 'AuthorizationId'>;
export type PolicyId = Branded<string, 'PolicyId'>;
export type PolicyRevision = Branded<string, 'PolicyRevision'>;
export type SubmissionRef = Branded<string, 'SubmissionRef'>;
/**
 * Consumer-authored public contact-method key (a configured *label slot*, never a principal).
 *
 * It names one entry of an owner's **public** contact configuration so that a projected link can be
 * addressed stably (`connect.methods[].id`). It carries no authority and never identifies an inbox:
 * public contact addresses are configuration, strictly separate from the private recipient policy.
 */
export type PublicContactMethodId = Branded<string, 'PublicContactMethodId'>;
export type DeliveryJobId = Branded<string, 'DeliveryJobId'>;
export type DeliveryAttemptId = Branded<string, 'DeliveryAttemptId'>;
/**
 * Identity of **one direct send** (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1`).
 *
 * A non-durable send has no job and no attempt record, so it needs its own identity for two things only:
 * the provider idempotency key it hands to the transport, and the `submissionReference` its rendered message
 * carries. It is unique per execution inside the configured idempotency namespace and proves nothing about
 * delivery — the strongest honest claim remains "the provider took it".
 */
export type TransmissionRef = Branded<string, 'TransmissionRef'>;

/** Maximum accepted identifier length. Guards against unbounded context material. */
export const MAX_IDENTIFIER_LENGTH = 200;

/**
 * Branding helpers. They perform **no** validation: they exist for the validation layer and for
 * adapters that translate authoritative records. Never call them with visitor input.
 */
export const identifier = {
  deployment: (value: string): DeploymentId => value as DeploymentId,
  publisher: (value: string): PublisherId => value as PublisherId,
  owner: (value: string): OwnerId => value as OwnerId,
  site: (value: string): SiteId => value as SiteId,
  page: (value: string): PageId => value as PageId,
  form: (value: string): FormId => value as FormId,
  authorization: (value: string): AuthorizationId => value as AuthorizationId,
  policy: (value: string): PolicyId => value as PolicyId,
  policyRevision: (value: string): PolicyRevision => value as PolicyRevision,
  submission: (value: string): SubmissionRef => value as SubmissionRef,
  publicContactMethod: (value: string): PublicContactMethodId => value as PublicContactMethodId,
  deliveryJob: (value: string): DeliveryJobId => value as DeliveryJobId,
  deliveryAttempt: (value: string): DeliveryAttemptId => value as DeliveryAttemptId,
  transmission: (value: string): TransmissionRef => value as TransmissionRef,
} as const;
