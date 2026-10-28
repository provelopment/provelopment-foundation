import type { DeliveryJob } from './delivery.js';
import { assertHeaderSafe } from './escaping.js';
import { MAX_IDENTIFIER_LENGTH, type DeliveryJobId, type TransmissionRef } from './identifiers.js';

/**
 * The immutable outbound message (resend-readiness §5 CW-01 Problem A).
 *
 * A delivery job is retried against a provider that deduplicates a repeated idempotency key only when
 * the request payload matches. A message rendered **at attempt time** breaks that guarantee: a template
 * or renderer change between two attempts would keep the logical key and change the bytes, which a
 * provider may reject or, worse, treat as a different message.
 *
 * Therefore the fully rendered message is established **once**, durably, before the first provider
 * request, and every retry re-sends those exact bytes. `subject`, `textBody` and `htmlBody` are
 * deliberately absent from the drift check below: they are the rendered content, and their drift is the
 * reason the snapshot exists.
 */
export interface OutboundMessageSnapshot {
  readonly jobId: DeliveryJobId;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly from: { readonly address: string; readonly displayName: string };
  readonly replyTo?: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody?: string;
  /** Derived, never chosen: see `providerIdempotencyKeyFor`. */
  readonly providerIdempotencyKey: string;
  readonly submissionReference: string;
  /** When the snapshot was committed, so an operator can see how long a key has been in play. */
  readonly establishedAtEpochMs: number;
  /**
   * Digest of the committed payload (see `messagePayloadDigest`). A stored record is re-validated against
   * it before every provider call, so a store that silently rewrites a committed message is caught
   * instead of being sent.
   */
  readonly payloadDigest: string;
}

/** A snapshot before its digest is computed. This is what the renderer/dispatcher produces. */
export type OutboundMessageCandidate = Omit<OutboundMessageSnapshot, 'payloadDigest'>;

/**
 * A conservative universal bound rather than an adapter option: every provider this Module targets
 * documents at most 256 characters, and an adapter must not be able to widen the limit by accident.
 */
export const MAX_PROVIDER_IDEMPOTENCY_KEY_LENGTH = 256;

/**
 * Maximum accepted provider-idempotency **namespace** length.
 *
 * Derived, not chosen: the key is `coms-web:` (9) + namespace + `:` (1) + job id, a job id may be up to
 * `MAX_IDENTIFIER_LENGTH` (200) characters, and the key must stay within 256 — so a namespace may be at
 * most 46. 40 leaves headroom while keeping the worst case (250) inside the bound with no truncation.
 */
export const MAX_IDEMPOTENCY_NAMESPACE_LENGTH = 40;

/** Namespace shape: lower-case, no separators that would make two namespaces render identically. */
const IDEMPOTENCY_NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Is this a usable idempotency namespace?
 *
 * A namespace identifies the **provider account context** — one installation and environment pair — so
 * two independent consumers sharing a Resend account cannot derive the same key for their own job 7.
 */
export function isIdempotencyNamespace(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= MAX_IDEMPOTENCY_NAMESPACE_LENGTH &&
    IDEMPOTENCY_NAMESPACE_PATTERN.test(value)
  );
}

/**
 * The **durable** provider-key prefix.
 *
 * Frozen. Every already-queued ADVANCED job was authorized under a key of exactly this shape, a stored snapshot
 * is re-derived and compared against it before every retry (`findSnapshotAuthorityDrift`), and changing it
 * would re-mint the key of in-flight work — the one thing that could deliver a second copy of a message the
 * provider has already accepted.
 */
const DELIVERY_JOB_KEY_PREFIX = 'coms-web:';

/**
 * The **direct-send** prefix (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1-R02`, correction R02-03).
 *
 * Its tenth character is `~`, and that single character is the whole disjointness proof:
 *
 * - a durable key is `coms-web:` + namespace + `:` + job id, so its tenth character is the **first character
 *   of the namespace**, which `isIdempotencyNamespace` restricts to `[a-z0-9]` (and both `DispatchDelivery`
 *   and `SendDirectEnquiry` validate at construction);
 * - a direct-send key's tenth character is always `~`, which is outside `[a-z0-9]`.
 *
 * Therefore **no** durable key can equal **any** direct-send key, for every possible namespace and every
 * possible identifier — not merely for identifiers a consumer promises to prefix. Nothing here assumes how a
 * future id generator names its ids; the discriminating character sits where the two derivations are already
 * constrained, not in the opaque part.
 *
 * Length stays inside the provider bound by construction: 10 + 40 (namespace) + 1 + 200 (identifier) = 251.
 */
const DIRECT_SEND_KEY_PREFIX = 'coms-web:~';

/** The longest key `directSendIdempotencyKeyFor` can produce: 251 characters, five inside the provider bound. */
export const MAX_DIRECT_SEND_IDEMPOTENCY_KEY_LENGTH =
  DIRECT_SEND_KEY_PREFIX.length + MAX_IDEMPOTENCY_NAMESPACE_LENGTH + 1 + MAX_IDENTIFIER_LENGTH;

/**
 * The **single** derivation point for a durable job's provider idempotency key.
 *
 * `coms-web:<namespace>:<jobId>` is stable across attempts by construction (the same namespace and job id
 * always produce the same key, so a retry deduplicates at the provider), and it is **not** globally derived
 * from the job id alone: local job ids are only unique inside a namespace, so the namespace is what prevents
 * a collision between two deployments that both call their first job `job-1`.
 *
 * It is computed here — not in the dispatcher, not in an adapter — so two components cannot drift into
 * different keys for one logical job, and it is never recomputed with a new value to dodge a provider
 * conflict. Its output is byte-identical to every key this Module has ever issued for a stored job.
 */
export function providerIdempotencyKeyFor(namespace: string, jobId: DeliveryJobId): string {
  return `${DELIVERY_JOB_KEY_PREFIX}${namespace}:${jobId}`;
}

/**
 * The **single** derivation point for a direct send's provider idempotency key: the same authority as the
 * durable one, in a space that provably cannot intersect it (see `DIRECT_SEND_KEY_PREFIX`).
 *
 * Deterministic for its logical transmission: one execution mints one `TransmissionRef`, and that reference
 * yields the same key for as long as that message exists. A new direct send is a new transmission and
 * therefore a new key — which is correct, because it is a different message.
 */
export function directSendIdempotencyKeyFor(
  namespace: string,
  transmissionRef: TransmissionRef,
): string {
  return `${DIRECT_SEND_KEY_PREFIX}${namespace}:${transmissionRef}`;
}

function isHeaderSafe(value: string): boolean {
  return assertHeaderSafe(value).ok;
}

/** Hex characters in a `payloadDigest` (FNV-1a, 64-bit). */
export const MESSAGE_DIGEST_LENGTH = 16;

/**
 * The exact bytes the digest covers: every field that can change what the provider receives.
 *
 * An **array**, not an object: object key order cannot change the result, and `JSON.stringify` quoting
 * keeps adjacent string fields unambiguous (`["ab","c"]` cannot collide with `["a","bc"]`).
 */
function canonicalMessagePayload(message: OutboundMessageCandidate): string {
  return JSON.stringify([
    message.jobId,
    message.to,
    message.cc,
    message.from.address,
    message.from.displayName,
    message.replyTo ?? null,
    message.subject,
    message.textBody,
    message.htmlBody ?? null,
    message.providerIdempotencyKey,
    message.submissionReference,
    message.establishedAtEpochMs,
  ]);
}

/**
 * A stable, dependency-free digest of the committed message.
 *
 * FNV-1a (64-bit) is deliberately **not** cryptographic and is not presented as one. It detects
 * corruption and naive mutation of a stored payload — a truncated file, a store that "normalises" the
 * message, a field edited without re-deriving the record. It cannot stop someone who can write to the
 * store *and* recompute the digest; that case is covered by `findSnapshotAuthorityDrift`, which compares
 * the stored message against the job's frozen authority. Together they cover the realistic failures: a
 * damaged record and a re-targeted one.
 */
export function messagePayloadDigest(message: OutboundMessageCandidate): string {
  const input = canonicalMessagePayload(message);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(MESSAGE_DIGEST_LENGTH, '0');
}

/** Seal a candidate with its digest. The only way a snapshot is produced. */
export function createOutboundMessageSnapshot(
  candidate: OutboundMessageCandidate,
): OutboundMessageSnapshot {
  return { ...candidate, payloadDigest: messagePayloadDigest(candidate) };
}

/**
 * Structural defects in a candidate snapshot. A message that fails these checks is never sent: it is a
 * Module or renderer defect, not a visitor error, so it fails permanently and is reported internally.
 */
export function findOutboundMessageProblems(message: OutboundMessageCandidate): readonly string[] {
  const problems: string[] = [];

  if (message.jobId.trim() === '') problems.push('empty job id');
  if (message.to.length === 0) problems.push('no `to` recipient');
  if (message.from.address.trim() === '') problems.push('empty sender address');
  if (message.subject.trim() === '') problems.push('empty subject');
  if (message.textBody.trim() === '') problems.push('empty text body');
  if (message.providerIdempotencyKey.trim() === '') problems.push('empty idempotency key');
  if (message.providerIdempotencyKey.length > MAX_PROVIDER_IDEMPOTENCY_KEY_LENGTH) {
    problems.push('idempotency key exceeds the universal bound');
  }
  if (message.submissionReference.trim() === '') problems.push('empty submission reference');
  if (
    message.submissionReference.length > MAX_IDENTIFIER_LENGTH ||
    message.jobId.length > MAX_IDENTIFIER_LENGTH
  ) {
    problems.push('identifier exceeds the maximum length');
  }
  if (!Number.isInteger(message.establishedAtEpochMs) || message.establishedAtEpochMs < 0) {
    problems.push('invalid establishment timestamp');
  }

  // An address that is present but blank (or padded) would render an empty header value.
  for (const recipient of [...message.to, ...message.cc]) {
    if (recipient.trim() === '') problems.push('empty recipient address');
  }

  // Header safety applies to every value that becomes a header, on the snapshot as well as inside an
  // adapter: a compromised renderer must not be able to smuggle a line break into a stored message
  // that a later attempt would faithfully re-send.
  for (const recipient of [...message.to, ...message.cc]) {
    if (!isHeaderSafe(recipient)) problems.push('unsafe recipient header value');
  }
  if (!isHeaderSafe(message.from.address)) problems.push('unsafe sender address');
  if (!isHeaderSafe(message.from.displayName)) problems.push('unsafe sender display name');
  if (message.replyTo !== undefined && !isHeaderSafe(message.replyTo)) {
    problems.push('unsafe reply-to header value');
  }
  if (!isHeaderSafe(message.subject)) problems.push('unsafe subject header value');
  if (!isHeaderSafe(message.providerIdempotencyKey)) problems.push('unsafe idempotency key');
  if (!isHeaderSafe(message.submissionReference)) problems.push('unsafe submission reference');

  // Bodies are not headers, so CR/LF is legitimate there; a NUL never is, in either encoding.
  if (message.textBody.includes('\u0000')) problems.push('unsafe text body');
  if (message.htmlBody !== undefined && message.htmlBody.includes('\u0000')) {
    problems.push('unsafe html body');
  }

  return problems;
}

/**
 * A stored record is `unknown` at runtime, whatever the port's type says. This proves it is at least the
 * right shape before any field is touched, so a corrupt record produces a refusal instead of a throw.
 */
function isStoredSnapshotShaped(value: unknown): value is OutboundMessageSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const from = record['from'];
  const fromOk =
    typeof from === 'object' &&
    from !== null &&
    typeof (from as Record<string, unknown>)['address'] === 'string' &&
    typeof (from as Record<string, unknown>)['displayName'] === 'string';
  const strings = (key: string): boolean => typeof record[key] === 'string';
  const optionalString = (key: string): boolean =>
    record[key] === undefined || typeof record[key] === 'string';
  const addressList = (key: string): boolean =>
    Array.isArray(record[key]) && (record[key] as unknown[]).every((v) => typeof v === 'string');

  return (
    strings('jobId') &&
    addressList('to') &&
    addressList('cc') &&
    fromOk &&
    optionalString('replyTo') &&
    strings('subject') &&
    strings('textBody') &&
    optionalString('htmlBody') &&
    strings('providerIdempotencyKey') &&
    strings('submissionReference') &&
    typeof record['establishedAtEpochMs'] === 'number' &&
    strings('payloadDigest')
  );
}

/**
 * Re-validation of a snapshot **loaded from storage**, before any provider call.
 *
 * A committed message is data from a durable store, and a durable store is not a trust boundary: it can be
 * corrupted, partially written, migrated by a script, or written by something other than this Module. So a
 * loaded snapshot is checked exactly like a freshly rendered one, and additionally against its own digest.
 * Any problem means: do not send, do not repair, do not silently re-render.
 */
export function findStoredSnapshotProblems(snapshot: OutboundMessageSnapshot): readonly string[] {
  if (!isStoredSnapshotShaped(snapshot)) {
    return ['stored record is not a readable message snapshot'];
  }

  const problems = [...findOutboundMessageProblems(snapshot)];
  const digest = snapshot.payloadDigest;

  if (
    typeof digest !== 'string' ||
    digest.length !== MESSAGE_DIGEST_LENGTH ||
    !/^[0-9a-f]+$/.test(digest)
  ) {
    problems.push('missing or malformed message digest');
  } else if (digest !== messagePayloadDigest(snapshot)) {
    problems.push('stored message payload does not match its committed digest');
  }

  return problems;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Authority drift between a committed snapshot and the job that owns it. A snapshot may only be reused
 * while it still names exactly the recipients, sender, reply-to, submission reference and idempotency
 * key that acceptance froze. Subject and body are intentionally excluded.
 *
 * Re-targeting is never a fallback: a drifted snapshot is a refused job, not a message sent to a
 * different inbox.
 */
export function findSnapshotAuthorityDrift(
  snapshot: OutboundMessageSnapshot,
  job: DeliveryJob,
  namespace: string,
): readonly string[] {
  const drift: string[] = [];

  if (snapshot.jobId !== job.jobId) drift.push('snapshot belongs to another job');
  if (!sameList(snapshot.to, job.plan.to)) drift.push('`to` recipients changed');
  if (!sameList(snapshot.cc, job.plan.cc)) drift.push('`cc` recipients changed');
  if (snapshot.from.address !== job.plan.from.address) drift.push('sender address changed');
  if (snapshot.from.displayName !== job.plan.from.displayName) {
    drift.push('sender display name changed');
  }
  if (snapshot.replyTo !== job.plan.replyTo) drift.push('reply-to changed');
  if (snapshot.submissionReference !== job.plan.submissionReference) {
    drift.push('submission reference changed');
  }
  if (snapshot.providerIdempotencyKey !== providerIdempotencyKeyFor(namespace, job.jobId)) {
    drift.push('provider idempotency key is not the derived key for this job');
  }

  return drift;
}
