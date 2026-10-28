/**
 * The **one** mailbox authority in Connect (`CONNECT-DIRECT-SEND-A4-SIMPLE-A1-R02`, correction R02-02).
 *
 * Two very different callers need this rule: the visitor's `email` field (content validation) and an owner's
 * authored policy address (recipient/sender authorization). Keeping two implementations is how a policy can
 * end up authorizing `"a@example.test, b@example.test"` — one header, two business inboxes — while the form
 * refuses the same string. So the grammar lives here, once, and everything else asks this module.
 *
 * It is deliberately **not** RFC 5322 in full: no quoted local parts, no comments, no display names, no
 * address lists. A policy address is one bare mailbox an operator types into a configuration file, and the
 * job of this validator is to admit every reasonable mailbox while refusing anything that could become two
 * mailboxes, a second header, or a different principal than the one authored.
 *
 * Deliberately dependency-free: this is a domain rule, not a provider SDK, and no provider is consulted.
 */

/**
 * A complete address may not exceed 254 characters (RFC 5321 §4.5.3.1.3 path limit, minus the angle brackets).
 *
 * As of correction R03 this is no longer merely a chosen ceiling: it is exactly what the structural limits
 * below can produce — 64 (local) + 1 (`@`) + 63 + 1 + 63 + 1 + 61 (three maximum-ish DNS labels and two
 * separators) = 254.
 */
export const MAX_MAILBOX_LENGTH = 254;

/** A local part may not exceed 64 characters (RFC 5321 §4.5.3.1.1). */
export const MAX_MAILBOX_LOCAL_LENGTH = 64;

/**
 * A DNS domain label may contain 1–63 ASCII octets (RFC 1035 §2.3.4; RFC 5890 §2.3.1 for the LDH subset this
 * validator admits).
 *
 * Correction R03: the previous grammar bounded labels only indirectly, through the 254-character address
 * maximum, so `a@<187 octets>.t` was accepted — a domain no resolver, TLS certificate or provider will ever
 * treat as a name. A policy may not authorize a mailbox that cannot exist.
 */
export const MAX_DNS_LABEL_LENGTH = 63;

/**
 * `atext` plus the dot: the RFC 5321 dot-atom local part. No `,`, `;`, `:`, `<`, `>`, `"`, `(`, `)`, `[`, `]`,
 * `\` or space — which is precisely what stops an address list, a display name or a header break from
 * passing as one mailbox.
 */
const LOCAL_PART_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

/**
 * A dotted lower-case domain with at least one label separator, so `user@localhost` and `user@b` are refused:
 * a policy address must name a resolvable public domain, never an internal host alias. The per-label byte
 * bound (`MAX_DNS_LABEL_LENGTH`) and the label count are checked next to it, because a single regular
 * expression cannot express both cleanly.
 */
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Control characters and whitespace are never part of a bare mailbox, and are the raw material of injection. */
const FORBIDDEN_CHARACTER_PATTERN = /[\u0000-\u001f\u007f\s]/;

/**
 * Is this string exactly **one** bare mailbox?
 *
 * Refused without repair, and never trimmed: an authored value with surrounding whitespace is a
 * configuration defect the operator should see, not something a validator should silently fix.
 */
export function isBareMailbox(value: string): boolean {
  return normalizeBareMailbox(value) !== undefined;
}

/**
 * The normalized form of one bare mailbox — domain lower-cased, local part preserved — or `undefined` when
 * the value is not a single bare mailbox.
 *
 * The local part is **preserved** because it is case-sensitive at the protocol level; only the domain is
 * folded, so two spellings of the same domain compare equal while `Ada@` and `ada@` remain different
 * mailboxes.
 */
export function normalizeBareMailbox(value: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length === 0 || value.length > MAX_MAILBOX_LENGTH) return undefined;
  if (FORBIDDEN_CHARACTER_PATTERN.test(value)) return undefined;

  // Exactly one `@`: `a@b@c` is not a mailbox, it is a mistake (or an attempt at two).
  const parts = value.split('@');
  if (parts.length !== 2) return undefined;
  const [local, domain] = parts as [string, string];

  if (local.length === 0 || local.length > MAX_MAILBOX_LOCAL_LENGTH) return undefined;
  if (!LOCAL_PART_PATTERN.test(local)) return undefined;
  // A leading, trailing or doubled dot is a different mailbox to every provider, so it is refused here
  // rather than left to fail at handoff.
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return undefined;

  const folded = domain.toLowerCase();
  if (folded.length === 0 || folded.length > MAX_MAILBOX_LENGTH) return undefined;

  // A dotted domain, and every label inside DNS bounds. The order is deliberate: count and byte length first
  // (a cheap structural fact), then the character and hyphen rules.
  const labels = folded.split('.');
  if (labels.length < 2) return undefined;
  for (const label of labels) {
    if (label.length === 0 || label.length > MAX_DNS_LABEL_LENGTH) return undefined;
  }
  if (!DOMAIN_PATTERN.test(folded)) return undefined;

  return `${local}@${folded}`;
}
