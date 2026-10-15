/**
 * THE BUSINESS-ID CONTRACT (FOUNDATION-ID-M1)
 * ==========================================
 *
 * A BUSINESS owns one or more Sites. Its identity is an OPAQUE, SELF-MINTED token: the prefix `b_`
 * followed by 26 Crockford Base32 characters carrying an unsigned 128-bit value.
 *
 * WHAT A BUSINESS ID IS NOT
 * -------------------------
 * It is never derived from anything a Business can change or that a host can supply: not a name, a
 * country, a region, a locale, an address, a hostname, a domain, a Site, a Site ID, nor any
 * commercial-account identifier (billing, CRM, payment, employment). It is not a commercial record
 * and not an authorisation, and minting one involves no registry, no service and no coordination.
 *
 * WHY THE DOMAIN HOLDS NO ENTROPY OF ITS OWN
 * ------------------------------------------
 * This module is the PURE half: the format, the vocabulary and the ONE diagnosis. It reads no
 * clock, no environment and no filesystem, and it imports nothing at all — a caller INJECTS the
 * entropy (`mintBusinessId`), so the domain never acquires a `node:crypto` dependency and the same
 * function is valid in a build tool, in a test, and in the (later) creation tool that supplies
 * cryptographically secure bytes.
 *
 * DELIBERATELY UNWIRED IN M1. FOUNDATION-ID-M1 introduced the identity contract WITHOUT integrating
 * it into the runtime that was already released, so nothing that was already running changed. Later
 * milestones ARE expected to import and use it, and that adoption is a USE of the contract rather
 * than a change to its boundary. What the permanent architecture tests protect is that BOUNDARY,
 * not the module's continued absence from the runtime:
 * `tests/architecture/reserved-site-identifiers.test.ts` checks that this module imports nothing at
 * all and that the contracts reach nothing outside `src/core/`, so the dependency can only ever run
 * `src/**` → here.
 *
 * THE FORMAT, AND WHY THE FIRST CHARACTER IS `0`-`7`
 * --------------------------------------------------
 * 26 symbols × 5 bits = 130 bits, so a 128-bit value is ZERO-EXTENDED by two leading padding bits:
 *
 *   "If the bit-length of the number to be encoded is not a multiple of 5 bits, then zero-extend
 *    the number to make its bit-length a multiple of 5."
 *                                    — Crockford Base32, https://www.crockford.com/base32.html
 *
 * Those two padding bits are the MOST SIGNIFICANT bits of the FIRST symbol, so the first character
 * carries two padding bits plus three significant bits and can only be `0`-`7` (8 of the 32
 * symbols). ULID — also 128 bits in 26 Crockford characters — has the same `[0-7]` first-character
 * rule for exactly this reason. `BUSINESS_ID_FIRST_CHARACTERS` states it, and a validator that
 * omitted it would accept 26-character payloads decoding to values above 2^128 - 1.
 *
 * WHAT THE SPECIFICATION ALLOWS AND THIS CONTRACT REFUSES
 * -------------------------------------------------------
 *   · the specification ENCODES upper case and DECODES both. Foundation's canonical spelling is
 *     LOWERCASE — every other Foundation identity (a Site code, a locale path key, a content slug)
 *     is lowercase, and one spelling is what stops one identity from having two forms. An
 *     upper-case spelling is REPORTED with the canonical spelling to write, never repaired;
 *   · the specification ignores hyphens on decode, and decodes `i`/`l` as `1` and `o` as `0`. Both
 *     are refused here: a silent "helpful" rewrite is how two spellings of one identity come into
 *     existence, and this token is machine-minted and copied rather than transcribed by hand;
 *   · the optional CHECK SYMBOL (the value modulo 37) is deliberately not used: it would make the
 *     payload 27 characters and introduce symbols that are not URL-safe, for a token nobody
 *     dictates over a telephone;
 *   · the alphabet excludes `I`, `L`, `O` and `U` for the specification's own reasons — confusion
 *     with `1` and `0`, and accidental obscenity.
 *
 * UNIQUENESS, STATED HONESTLY
 * ---------------------------
 * 128 bits of secure entropy makes an accidental collision vanishingly unlikely, and NO
 * independently operating distributed system can guarantee global non-collision without
 * coordination. Foundation therefore requires no central service: generation is offline, and known
 * duplicate or conflicting Business identities are refused when registers or installations are
 * combined (a later milestone owns that check).
 *
 * Framework-neutral: pure data and pure functions. No import statement at all — no React, Next.js,
 * filesystem, environment, clock, network or crypto dependency.
 */

/** The prefix every Business ID carries, so a token's KIND is visible wherever it is read. */
export const BUSINESS_ID_PREFIX = "b_";

/** How many characters the payload carries: 26 symbols × 5 bits = 130 bits, which holds 128. */
export const BUSINESS_ID_PAYLOAD_LENGTH = 26;

/** The full canonical length: the prefix plus the payload (28 characters). */
export const BUSINESS_ID_LENGTH = BUSINESS_ID_PREFIX.length + BUSINESS_ID_PAYLOAD_LENGTH;

/** The width of the value a Business ID carries, in bits. */
export const BUSINESS_ID_ENTROPY_BITS = 128;

/** The bytes `mintBusinessId` requires from its entropy source (16 bytes = 128 bits). */
export const BUSINESS_ID_ENTROPY_BYTES = BUSINESS_ID_ENTROPY_BITS / 8;

/** Bits carried per symbol — the base of the encoding, named so the arithmetic reads. */
export const BUSINESS_ID_BITS_PER_CHARACTER = 5;

/**
 * The zero-extension the fixed-width encoding needs (130 − 128 = 2). These bits are the most
 * significant bits of the first character, which is what bounds that character to `0`-`7`.
 */
export const BUSINESS_ID_PADDING_BITS =
  BUSINESS_ID_PAYLOAD_LENGTH * BUSINESS_ID_BITS_PER_CHARACTER - BUSINESS_ID_ENTROPY_BITS;

/**
 * The payload alphabet: Crockford Base32, LOWER-CASED — 32 symbols, with `I`, `L`, `O` and `U`
 * excluded by the specification.
 */
export const BUSINESS_ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** The characters the FIRST payload character may be: the two padding bits leave three free bits. */
export const BUSINESS_ID_FIRST_CHARACTERS = "01234567";

/** The letters the alphabet excludes, which the diagnosis below names specifically. */
export const BUSINESS_ID_EXCLUDED_LETTERS = "ilou";

/** The milestone that introduced this contract, named in every thrown message. */
const CONTRACT = "FOUNDATION-ID-M1";

/**
 * A BUSINESS ID — the opaque identity of a website's owner.
 *
 * The alias exists so a composite identity contract can name its Business dimension in the SAME
 * vocabulary as this authority, instead of spelling an anonymous `string` that could hold anything.
 */
export type BusinessId = string;

/**
 * The entropy source a caller injects: a function answering exactly `BUSINESS_ID_ENTROPY_BYTES`
 * cryptographically secure random bytes.
 *
 * It is a PARAMETER and never an import, so this module stays pure and whatever owns secure
 * randomness (`node:crypto`, the Web Crypto API, a tooling seam) lives outside the domain.
 */
export type BusinessIdEntropySource = (byteLength: number) => Uint8Array;

/** How a rejected value is named in a message — `null` and an array are worth distinguishing. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * The MATCHING form of any spelling: trimmed and lower-cased, or `""` for a non-string.
 *
 * MATCHING ONLY. A Business ID is minted and copied, so an authored spelling is either canonical or
 * wrong; this function exists so a caller can compare two spellings (a lookup, a duplicate check)
 * without ever pretending that the authored one was accepted. It never makes an invalid ID valid:
 * `isBusinessId(normalizeBusinessId(value))` asks the authority again.
 */
export function normalizeBusinessId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Whether `value` is a usable Business ID, in its canonical spelling.
 *
 * A recognised-but-not-canonical spelling (`B_…`, an upper-case payload, a padded value) answers
 * `false`: the token is an identity, so accepting two spellings of it would be the very defect this
 * contract exists to prevent.
 */
export function isBusinessId(value: unknown): boolean {
  return businessIdIssue(value) === null;
}

/**
 * The ONE actionable diagnosis for an authored or minted Business ID, or `null` when it is usable.
 *
 * Each distinct fault gets its own message, and the message names the value and the repair — the
 * same shape `@/core/site-code` uses for a Site code. Nothing is normalised, trimmed or repaired
 * here: a caller that wants the matching form asks `normalizeBusinessId`.
 *
 * The checks are a SEQUENCE over a fixed-width token rather than one regular expression: the
 * prefix, the length, the alphabet, the case and the first character are separate facts about a
 * value, and a single expression would collapse five diagnoses into one message.
 */
export function businessIdIssue(value: unknown): string | null {
  if (typeof value !== "string") {
    return `business ID must be a string (received ${describeType(value)})`;
  }

  if (!value.startsWith(BUSINESS_ID_PREFIX)) {
    return (
      `business ID "${value}" must begin with the lowercase prefix "${BUSINESS_ID_PREFIX}": ` +
      `a Business ID is "${BUSINESS_ID_PREFIX}" followed by ${BUSINESS_ID_PAYLOAD_LENGTH} ` +
      "Crockford Base32 characters"
    );
  }

  const payload = value.slice(BUSINESS_ID_PREFIX.length);
  if (payload.length !== BUSINESS_ID_PAYLOAD_LENGTH) {
    return (
      `business ID "${value}" must be ${BUSINESS_ID_LENGTH} characters — "${BUSINESS_ID_PREFIX}" ` +
      `plus ${BUSINESS_ID_PAYLOAD_LENGTH} characters — but its payload is ${payload.length} ` +
      "characters long"
    );
  }

  for (const character of payload) {
    const lower = character.toLowerCase();

    if (BUSINESS_ID_EXCLUDED_LETTERS.includes(lower)) {
      return (
        `business ID "${value}" contains "${character}", which Crockford Base32 excludes ` +
        "(I, L, O and U are left out to avoid confusion with 1 and 0)"
      );
    }

    if (character !== lower) {
      return (
        `business ID "${value}" must be lowercase — write it as ` +
        `"${BUSINESS_ID_PREFIX}${payload.toLowerCase()}" (one identity has one canonical spelling)`
      );
    }

    if (!BUSINESS_ID_ALPHABET.includes(character)) {
      return (
        `business ID "${value}" contains "${character}", which is not in the payload alphabet ` +
        `"${BUSINESS_ID_ALPHABET}" — the canonical form is a fixed-width token with no separator, ` +
        "punctuation or space"
      );
    }
  }

  const first = payload.charAt(0);
  if (!BUSINESS_ID_FIRST_CHARACTERS.includes(first)) {
    return (
      `business ID "${value}" begins with "${first}", but the first payload character must be one ` +
      `of "${BUSINESS_ID_FIRST_CHARACTERS}": ${BUSINESS_ID_PAYLOAD_LENGTH} characters carry ` +
      `${BUSINESS_ID_PAYLOAD_LENGTH * BUSINESS_ID_BITS_PER_CHARACTER} bits for a ` +
      `${BUSINESS_ID_ENTROPY_BITS}-bit value, so the ${BUSINESS_ID_PADDING_BITS} leading padding ` +
      "bits are the most significant bits of the first character"
    );
  }

  return null;
}
/**
 * MINTS a Business ID from injected entropy — the ONLY way a Business identity comes into being.
 *
 * The value is requested as exactly `BUSINESS_ID_ENTROPY_BYTES` bytes and is refused, never
 * repaired, when the source answers anything else: a short read, a re-encoded value or a
 * non-`Uint8Array` would silently reduce the entropy a Business ID is trusted to carry, and
 * padding or truncating it here would hide that.
 *
 * Deterministic GIVEN the source: the same bytes always mint the same ID, and two different
 * sources give different IDs. Nothing else is read — no clock, no environment, no counter.
 */
export function mintBusinessId(randomBytes: BusinessIdEntropySource): BusinessId {
  if (typeof randomBytes !== "function") {
    throw new Error(
      `${CONTRACT}: mintBusinessId needs an entropy source — a function answering ` +
        `${BUSINESS_ID_ENTROPY_BYTES} cryptographically secure random bytes (received ` +
        `${describeType(randomBytes)}).`,
    );
  }

  const bytes = randomBytes(BUSINESS_ID_ENTROPY_BYTES);

  if (!(bytes instanceof Uint8Array)) {
    throw new Error(
      `${CONTRACT}: the entropy source must answer a Uint8Array of exactly ` +
        `${BUSINESS_ID_ENTROPY_BYTES} bytes (received ${describeType(bytes)}). Nothing is ` +
        "repaired here: a re-encoded or partial read would silently reduce the entropy.",
    );
  }

  if (bytes.length !== BUSINESS_ID_ENTROPY_BYTES) {
    throw new Error(
      `${CONTRACT}: the entropy source returned ${bytes.length} bytes, but a Business ID carries ` +
        `exactly ${BUSINESS_ID_ENTROPY_BITS} bits, so ${BUSINESS_ID_ENTROPY_BYTES} bytes are ` +
        "required — the value is refused rather than padded or truncated.",
    );
  }

  return `${BUSINESS_ID_PREFIX}${payloadForBytes(bytes)}`;
}

/**
 * The payload of one 16-byte value: the two zero padding bits, then the bytes BIG-ENDIAN, read five
 * bits at a time (most significant first — the fixed-width reading the specification states).
 */
function payloadForBytes(bytes: Uint8Array): string {
  const bitAt = (index: number): number => {
    // The padding bits are zero, and they are the MOST SIGNIFICANT bits of the first character.
    if (index < BUSINESS_ID_PADDING_BITS) return 0;
    const position = index - BUSINESS_ID_PADDING_BITS;
    const byte = bytes[position >> 3] as number;
    return (byte >> (7 - (position & 7))) & 1;
  };

  let payload = "";
  for (let symbol = 0; symbol < BUSINESS_ID_PAYLOAD_LENGTH; symbol += 1) {
    let value = 0;
    for (let offset = 0; offset < BUSINESS_ID_BITS_PER_CHARACTER; offset += 1) {
      value = (value << 1) | bitAt(symbol * BUSINESS_ID_BITS_PER_CHARACTER + offset);
    }
    payload += BUSINESS_ID_ALPHABET.charAt(value);
  }

  return payload;
}
