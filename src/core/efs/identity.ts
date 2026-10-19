/**
 * THE INTEGRATED EFS IDENTITY CONTRACT (`D31`, Amendment 06)
 * =======================================================
 *
 * An EntityID is the opaque, self-minted identity of one Entity. `D31` resolves the only
 * remaining identifier question: the literal prefix is `e_`, followed by the 26-character
 * lowercase Crockford Base32 encoding of a 128-bit value. The released 128-bit algorithm is
 * retained; the retired `b_`/`BusinessId` spelling is not.
 *
 * What an EntityID is NOT: a name, host, URL, SiteID, locale, address or account identifier.
 * It is never derived from any of those, and minting requires no registry or network call.
 *
 * This module is pure: the caller supplies cryptographically secure entropy. It reads no
 * clock, environment or filesystem, so the same contract is usable by a build tool and a test.
 */

/** The literal EntityID prefix accepted by the target contract. */
export const ENTITY_ID_PREFIX = "e_";

/** Crockford Base32: `i`, `l`, `o` and `u` are deliberately absent. */
const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** 128 bits encoded in 26 Base32 symbols (two leading padding bits). */
const ENTITY_ID_PAYLOAD_LENGTH = 26;

const BIG_FIVE = BigInt(5);
const BIG_EIGHT = BigInt(8);
const BIG_THIRTY_ONE = BigInt(31);

/** The canonical EntityID shape, including the `0`–`7` first-character padding rule. */
export const ENTITY_ID_PATTERN = /^e_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

/** A validated EntityID. The alias is intentionally a string so JSON remains plain. */
export type EntityId = string;

/** Describe a rejected value without throwing or coercing it into a valid-looking id. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * Diagnose an EntityID. Returns `null` for a valid canonical id, otherwise a sentence that
 * names the contract. Uppercase, hyphens and `i/l/o/u` spellings are REFUSED, never repaired.
 */
export function entityIdIssue(value: unknown): string | null {
  if (typeof value !== "string") return `An EntityID must be a string, received ${describe(value)}.`;
  if (value.length === 0) return "An EntityID must not be empty.";
  if (!value.startsWith(ENTITY_ID_PREFIX)) {
    return `An EntityID must begin with "${ENTITY_ID_PREFIX}"; the retired "b_" prefix is not accepted.`;
  }
  if (!ENTITY_ID_PATTERN.test(value)) {
    return 'An EntityID must be "e_" plus 26 lowercase Crockford Base32 characters, with a first payload character in 0-7.';
  }
  return null;
}

/** Whether `value` is a valid canonical EntityID. */
export function isEntityId(value: unknown): value is EntityId {
  return entityIdIssue(value) === null;
}

/**
 * Mint one EntityID from exactly 16 bytes of caller-supplied entropy.
 *
 * The encoding is the released 128-bit Crockford scheme: zero-extend to 130 bits, then emit
 * 26 five-bit symbols from most significant to least. That yields a first character in `0`–`7`,
 * which `ENTITY_ID_PATTERN` enforces on every later read.
 */
export function mintEntityId(entropy: Uint8Array): EntityId {
  if (entropy.length !== 16) {
    throw new Error(`EntityID entropy must be exactly 16 bytes, received ${entropy.length}.`);
  }

  let value = BigInt(0);
  for (const byte of entropy) {
    value = (value << BIG_EIGHT) | BigInt(byte);
  }

  let encoded = "";
  for (let index = 0; index < ENTITY_ID_PAYLOAD_LENGTH; index += 1) {
    encoded = CROCKFORD_ALPHABET[Number(value & BIG_THIRTY_ONE)] + encoded;
    value >>= BIG_FIVE;
  }

  const id = `${ENTITY_ID_PREFIX}${encoded}`;
  const issue = entityIdIssue(id);
  if (issue) throw new Error(issue);
  return id;
}

/**
 * A deterministic test double. Production callers inject secure entropy; no caller may treat
 * this helper as a production minting API.
 */
export function mintEntityIdForTest(seed: number): EntityId {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("The test seed must be a non-negative safe integer.");
  }
  const entropy = new Uint8Array(16);
  let remaining = seed;
  for (let index = 15; index >= 0; index -= 1) {
    entropy[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  return mintEntityId(entropy);
}
