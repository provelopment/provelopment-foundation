import { describe, expect, it } from "vitest";

import {
  BUSINESS_ID_ALPHABET,
  BUSINESS_ID_BITS_PER_CHARACTER,
  BUSINESS_ID_ENTROPY_BITS,
  BUSINESS_ID_ENTROPY_BYTES,
  BUSINESS_ID_EXCLUDED_LETTERS,
  BUSINESS_ID_FIRST_CHARACTERS,
  BUSINESS_ID_LENGTH,
  BUSINESS_ID_PADDING_BITS,
  BUSINESS_ID_PAYLOAD_LENGTH,
  BUSINESS_ID_PREFIX,
  businessIdIssue,
  isBusinessId,
  mintBusinessId,
  normalizeBusinessId,
  type BusinessIdEntropySource,
} from "@/core/business-identity";

/**
 * THE BUSINESS-ID CONTRACT (FOUNDATION-ID-M1)
 * ===========================================
 *
 * A Business ID is an opaque, self-minted token: `b_` plus 26 Crockford Base32 characters carrying
 * an unsigned 128-bit value. These assertions exercise the authority itself — its constants, its
 * encoding, its entropy contract and its diagnosis — so the arithmetic that makes the first
 * character `0`-`7`, the refusal of a non-canonical spelling, and the fact that minting reads
 * nothing but the bytes it is handed are all PROVED rather than assumed.
 *
 * The module is unwired at this milestone: nothing here touches a deployment, a Site, a route, a
 * configuration file or the running platform.
 */

/** 16 zero bytes — the lowest value a 128-bit payload can carry. */
const ALL_ZERO_BYTES = new Uint8Array(BUSINESS_ID_ENTROPY_BYTES);

/** Exactly one payload of bytes from a list, so a vector reads as a single value. */
function bytesOf(values: readonly number[]): Uint8Array {
  expect(values.length, "a vector must be exactly one payload").toBe(BUSINESS_ID_ENTROPY_BYTES);
  return new Uint8Array(values);
}

/** An entropy source answering the same byte every time. */
function constantSource(byte: number): BusinessIdEntropySource {
  return (byteLength) => new Uint8Array(byteLength).fill(byte);
}

/**
 * A DETERMINISTIC entropy source — a seeded LCG, deliberately not a cryptographic one. Minting must
 * be a pure function of the bytes it is given, so a test may supply anything it likes and needs no
 * real entropy.
 */
function seededSource(seed: number): BusinessIdEntropySource {
  let state = seed >>> 0;
  return (byteLength) => {
    const bytes = new Uint8Array(byteLength);
    for (let index = 0; index < byteLength; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      bytes[index] = (state >>> 24) & 0xff;
    }
    return bytes;
  };
}

/** An ID built from a payload, so a vector reads as one token. */
function idOf(payload: string): string {
  return `${BUSINESS_ID_PREFIX}${payload}`;
}

/**
 * THE FOUR DOCUMENTED VECTORS. The last three are what proves the padding: the top bit of the value
 * lands in the FIRST character (which is why it can only be `0`-`7`), and the bottom bit lands in
 * the LAST one.
 */
const VECTORS: readonly { readonly name: string; readonly bytes: Uint8Array; readonly payload: string }[] = [
  { name: "all zero bytes", bytes: ALL_ZERO_BYTES, payload: "0".repeat(BUSINESS_ID_PAYLOAD_LENGTH) },
  {
    name: "all 0xFF",
    bytes: constantSource(0xff)(BUSINESS_ID_ENTROPY_BYTES),
    // The largest value a 128-bit payload can carry: the two padding bits plus three significant
    // one-bits give the FIRST character 0b00111 = `7` — the maximum of `0`-`7`.
    payload: `7${"z".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 1)}`,
  },
  {
    name: "only the top bit set",
    bytes: bytesOf([0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    payload: `4${"0".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 1)}`,
  },
  {
    name: "only the bottom bit set",
    bytes: bytesOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01]),
    payload: `${"0".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 1)}1`,
  },
];

describe("the format constants describe one token", () => {
  it("names the prefix, the widths, and the arithmetic that bounds the first character", () => {
    expect(BUSINESS_ID_PREFIX).toBe("b_");
    expect(BUSINESS_ID_PAYLOAD_LENGTH).toBe(26);
    expect(BUSINESS_ID_LENGTH).toBe(28);
    expect(BUSINESS_ID_ENTROPY_BITS).toBe(128);
    expect(BUSINESS_ID_ENTROPY_BYTES).toBe(16);
    expect(BUSINESS_ID_BITS_PER_CHARACTER).toBe(5);
    expect(BUSINESS_ID_PADDING_BITS).toBe(2);
    expect(BUSINESS_ID_LENGTH).toBe(BUSINESS_ID_PREFIX.length + BUSINESS_ID_PAYLOAD_LENGTH);

    // 26 × 5 = 130 bits for a 128-bit value: the two spare bits are the most significant bits of
    // the first character, which is exactly what bounds that character to `0`-`7`.
    expect(
      BUSINESS_ID_PAYLOAD_LENGTH * BUSINESS_ID_BITS_PER_CHARACTER - BUSINESS_ID_PADDING_BITS,
    ).toBe(BUSINESS_ID_ENTROPY_BITS);
    expect(BUSINESS_ID_FIRST_CHARACTERS).toBe("01234567");
  });

  it("uses the Crockford alphabet, lower-cased, with I, L, O and U excluded", () => {
    expect(BUSINESS_ID_ALPHABET).toHaveLength(32);
    expect(new Set(BUSINESS_ID_ALPHABET).size).toBe(32);
    expect(BUSINESS_ID_ALPHABET).toBe(BUSINESS_ID_ALPHABET.toLowerCase());
    expect(BUSINESS_ID_EXCLUDED_LETTERS).toBe("ilou");

    for (const letter of BUSINESS_ID_EXCLUDED_LETTERS) {
      expect(BUSINESS_ID_ALPHABET, letter).not.toContain(letter);
    }
    for (const character of BUSINESS_ID_FIRST_CHARACTERS) {
      expect(BUSINESS_ID_ALPHABET, character).toContain(character);
    }
  });
});

describe("the encoding from injected bytes", () => {
  it("produces the documented vectors, including the two padding bits", () => {
    for (const vector of VECTORS) {
      const id = mintBusinessId(() => vector.bytes);
      expect(id, vector.name).toBe(idOf(vector.payload));
      expect(isBusinessId(id), vector.name).toBe(true);
      expect(businessIdIssue(id), vector.name).toBeNull();
    }
  });

  it("is deterministic given the source, and distinct across sources", () => {
    expect(mintBusinessId(seededSource(7))).toBe(mintBusinessId(seededSource(7)));
    expect(mintBusinessId(seededSource(7))).not.toBe(mintBusinessId(seededSource(8)));

    // …and independent of call ORDER: nothing but the injected bytes is read.
    const first = mintBusinessId(seededSource(7));
    mintBusinessId(seededSource(3));
    expect(mintBusinessId(seededSource(7))).toBe(first);
  });

  it("keeps every first payload character within 0-7, for many values", () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const id = mintBusinessId(seededSource(seed));
      const label = `seed ${seed}`;
      expect(id, label).toHaveLength(BUSINESS_ID_LENGTH);
      expect(id.startsWith(BUSINESS_ID_PREFIX), label).toBe(true);
      expect(BUSINESS_ID_FIRST_CHARACTERS, label).toContain(id.charAt(BUSINESS_ID_PREFIX.length));
      expect(businessIdIssue(id), label).toBeNull();
    }
  });
});
describe("the entropy contract", () => {
  it("requests exactly 16 bytes, once", () => {
    const requested: number[] = [];
    const id = mintBusinessId((byteLength) => {
      requested.push(byteLength);
      return new Uint8Array(byteLength);
    });

    expect(requested).toEqual([BUSINESS_ID_ENTROPY_BYTES]);
    expect(isBusinessId(id)).toBe(true);
  });

  it("refuses a source that answers the wrong NUMBER of bytes", () => {
    for (const byteLength of [0, 1, 15, 17, 32]) {
      const source: BusinessIdEntropySource = () => new Uint8Array(byteLength);
      expect(() => mintBusinessId(source), `source answering ${byteLength} bytes`).toThrowError(
        /FOUNDATION-ID-M1/,
      );
    }
  });

  it("refuses a source that answers anything but a Uint8Array", () => {
    const sources: readonly { readonly name: string; readonly source: BusinessIdEntropySource }[] = [
      { name: "a plain array", source: (() => [0, 1, 2]) as unknown as BusinessIdEntropySource },
      { name: "a string", source: (() => "0123456789abcdef") as unknown as BusinessIdEntropySource },
      { name: "a number", source: (() => 16) as unknown as BusinessIdEntropySource },
      { name: "null", source: (() => null) as unknown as BusinessIdEntropySource },
      { name: "undefined", source: (() => undefined) as unknown as BusinessIdEntropySource },
      {
        name: "an ArrayBuffer",
        source: (() => new ArrayBuffer(BUSINESS_ID_ENTROPY_BYTES)) as unknown as BusinessIdEntropySource,
      },
    ];

    for (const { name, source } of sources) {
      expect(() => mintBusinessId(source), name).toThrowError(/must answer a Uint8Array/);
    }
  });

  it("refuses a source that is not a function at all", () => {
    for (const value of [undefined, null, 16, "random", {}]) {
      expect(
        () => mintBusinessId(value as unknown as BusinessIdEntropySource),
        String(value),
      ).toThrowError(/needs an entropy source/);
    }
  });
});

describe("authored spellings the contract refuses", () => {
  /** One canonical token, so every refusal below differs from a valid one in exactly one way. */
  const CANONICAL_PAYLOAD = "0".repeat(BUSINESS_ID_PAYLOAD_LENGTH);
  const CANONICAL = idOf(CANONICAL_PAYLOAD);

  it("accepts the canonical token itself", () => {
    expect(businessIdIssue(CANONICAL)).toBeNull();
    expect(isBusinessId(CANONICAL)).toBe(true);
  });

  it("refuses a wrong length, naming the canonical length", () => {
    for (const payloadLength of [0, 1, 24, 25, 27, 30]) {
      const value = idOf("0".repeat(payloadLength));
      const label = `payload of ${payloadLength}`;
      expect(businessIdIssue(value), label).toContain(`must be ${BUSINESS_ID_LENGTH} characters`);
      expect(isBusinessId(value), label).toBe(false);
    }
  });

  it("refuses a missing or malformed prefix", () => {
    for (const value of [
      CANONICAL_PAYLOAD,
      `B_${CANONICAL_PAYLOAD}`,
      `_b${CANONICAL_PAYLOAD}`,
      `b${CANONICAL_PAYLOAD}`,
      `bb_${CANONICAL_PAYLOAD}`,
      `b-${CANONICAL_PAYLOAD}`,
    ]) {
      expect(businessIdIssue(value), value).toContain("must begin with the lowercase prefix");
      expect(isBusinessId(value), value).toBe(false);
    }
  });

  it("refuses the letters Crockford Base32 excludes, and names them", () => {
    for (const letter of BUSINESS_ID_EXCLUDED_LETTERS) {
      const value = idOf(`${letter}${"0".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 1)}`);
      const issue = businessIdIssue(value);
      expect(issue, letter).toContain(`contains "${letter}"`);
      expect(issue, letter).toContain("Crockford Base32 excludes");
      expect(isBusinessId(value), letter).toBe(false);
    }
  });
});
describe("the non-canonical and unusable spellings the contract refuses", () => {
  const CANONICAL_PAYLOAD = "0".repeat(BUSINESS_ID_PAYLOAD_LENGTH);

  it("refuses an upper-case payload, and names the canonical spelling to write", () => {
    const suggested = idOf(`0${"a".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 1)}`);
    const issue = businessIdIssue(suggested.toUpperCase().replace("B_", "b_"));

    expect(issue).toContain("must be lowercase");
    expect(issue).toContain(suggested);
    expect(isBusinessId(suggested.toUpperCase().replace("B_", "b_"))).toBe(false);
  });

  it("refuses separators, punctuation, spaces and control characters inside the token", () => {
    for (const character of ["-", "_", " ", ".", "/", "\\", "~", "+", "*", "!", "\n"]) {
      const value = idOf(`0${character}${"0".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 2)}`);
      expect(businessIdIssue(value), JSON.stringify(character)).toContain(
        "not in the payload alphabet",
      );
      expect(isBusinessId(value), JSON.stringify(character)).toBe(false);
    }
  });

  it("refuses a first character outside 0-7, naming the padding arithmetic", () => {
    for (const first of ["8", "9", "a", "z"]) {
      const value = idOf(`${first}${"0".repeat(BUSINESS_ID_PAYLOAD_LENGTH - 1)}`);
      const issue = businessIdIssue(value);
      expect(issue, first).toContain("first payload character");
      expect(isBusinessId(value), first).toBe(false);
    }
  });

  it("refuses a value that is not a string at all", () => {
    for (const value of [42, null, undefined, {}, [], true]) {
      expect(businessIdIssue(value), String(value)).toContain("must be a string");
      expect(isBusinessId(value), String(value)).toBe(false);
    }
  });

  it("refuses a padded spelling rather than trimming it into a valid token", () => {
    const canonical = idOf(CANONICAL_PAYLOAD);
    for (const value of [` ${canonical}`, `${canonical} `, `\t${canonical}`]) {
      expect(isBusinessId(value), JSON.stringify(value)).toBe(false);
      expect(businessIdIssue(value), JSON.stringify(value)).not.toBeNull();
    }
  });
});

describe("matching-only normalisation versus strict authored validation", () => {
  const CANONICAL = idOf("0".repeat(BUSINESS_ID_PAYLOAD_LENGTH));

  it("answers the matching form without ever accepting the authored one", () => {
    const authored = `  B_${"0".repeat(BUSINESS_ID_PAYLOAD_LENGTH)}  `;

    // The AUTHORED value is refused — not repaired, and not accepted with a warning.
    expect(isBusinessId(authored)).toBe(false);
    expect(businessIdIssue(authored)).not.toBeNull();

    // …while the matching form exists for a lookup or a duplicate check, and is asked again.
    expect(normalizeBusinessId(authored)).toBe(CANONICAL);
    expect(isBusinessId(normalizeBusinessId(authored))).toBe(true);
    expect(businessIdIssue(normalizeBusinessId(authored))).toBeNull();
  });

  it("never repairs a value that is not recoverable into a valid one", () => {
    for (const value of ["nope", "b_zzz", idOf("i".repeat(BUSINESS_ID_PAYLOAD_LENGTH))]) {
      expect(isBusinessId(normalizeBusinessId(value)), value).toBe(false);
    }
  });

  it("answers an empty string for a value that is not a string", () => {
    for (const value of [42, null, undefined, {}, []]) {
      expect(normalizeBusinessId(value), String(value)).toBe("");
    }
  });

  it("leaves a canonical spelling exactly as it is", () => {
    expect(normalizeBusinessId(CANONICAL)).toBe(CANONICAL);
    expect(normalizeBusinessId(`  ${CANONICAL}  `)).toBe(CANONICAL);
  });
});
