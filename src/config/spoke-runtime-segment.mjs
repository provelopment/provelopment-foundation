/**
 * THE SPOKE RUNTIME SEGMENT (FOUNDATION-MULTISITE-S3E1C)
 * =====================================================
 *
 * ONE question, answered from ONE input:
 *
 *     runtimeSegmentForSpokeId("foundation")  ->  "foundation"
 *     runtimeSegmentForSpokeId("a/b")         ->  "a~2Fb"
 *
 * THE SEGMENT IS DERIVED FROM THE SPOKE'S IDENTITY, AND FROM NOTHING ELSE
 * ---------------------------------------------------------------------
 * A Spoke owns a runtime namespace (`/spokes/<segment>/assets/**`, `public/spokes/<segment>/assets/**`).
 * That namespace must be a STABLE, COLLISION-FREE function of the Spoke's identity — the `SpokeId` an
 * Installation's `spokes.json` declares — and never of where a Spoke happens to be authored. The
 * authored directory spelling is not identity (`spokes/foundation-web` may hold the Spoke `foundation`
 * and still get `foundation`), and neither a hostname, a Site code nor a filesystem basename may
 * influence it: any of those would make one Spoke's runtime output movable by an unrelated edit, and
 * two Spokes could silently share one namespace.
 *
 * THE ENCODING (frozen by the slice that introduces it)
 * -----------------------------------------------------
 *   ASCII `A-Z a-z 0-9 _ - .`          remain verbatim
 *   a segment that IS "." or ".."      has its dots escaped (never a traversal segment)
 *   `~`                                is ALWAYS escaped as `~7E`
 *   every other UTF-8 byte             becomes `~HH` (UPPERCASE hexadecimal)
 *
 * The result is deterministic, URL-safe, filesystem-safe, case-preserving, stable, never empty and
 * never `.` or `..` — and INJECTIVE: `~` is reserved as the escape introducer, so the encoding is a
 * bijection over UTF-8 byte strings and two different ids can never share a segment (proved in
 * `tests/unit/spoke-runtime-segment.test.ts`, including the boundary pairs the rule was written for).
 *
 * WHY THIS IS PLAIN ESM — ONE MODULE, THREE RUNTIMES
 * --------------------------------------------------
 * The segment is needed by the build/deployment seam (`./deployment-build.mjs`), by the Foundation's
 * own Node tooling (`scripts/sync-runtime-assets.mjs`, which runs under plain `node`) and by
 * TypeScript modules that compose a Spoke's resource record (`./spoke-resources.ts`). Only some of
 * those run through a TypeScript compiler, and a SECOND implementation of an injective encoding is
 * exactly the kind of duplication that drifts. A dependency-free plain ESM module with JSDoc types is
 * therefore the smallest stable boundary — the same reason `./deployment-build.mjs` is one — while
 * `tsc --noEmit` still checks every call site through the JSDoc contract below.
 *
 * No filesystem, no environment, no configuration and no framework: pure string encoding.
 */

/** The one reserved introducer: it may only ever appear as the start of an escape. */
export const RUNTIME_SEGMENT_ESCAPE = "~";

/**
 * The DEDICATED NAMESPACE a Spoke's own runtime artwork is served from, for one segment:
 * `/spokes/<segment>/assets`.
 *
 * Exported HERE so the URL base, the generated directory and the segment itself are spelled ONCE: the
 * runtime path authority (`./deployment-root`), the asset mirror (`scripts/sync-runtime-assets.mjs`)
 * and the Spoke resource record (`./spoke-resources`) all consume these functions rather than composing
 * the namespace for themselves — which is what keeps a Spoke's namespace from being spelled three ways.
 *
 * @param {string} segment a segment produced by {@link runtimeSegmentForSpokeId}
 * @returns {string} the same-origin URL base of that Spoke's runtime assets
 */
export function spokeRuntimeAssetUrlBase(segment) {
  return `/spokes/${segment}/assets`;
}

/**
 * The ONE generated directory beneath which every Spoke namespace lives (`<runtime base>/spokes`), and
 * which therefore also holds a namespace that a manifest no longer declares. Exported so the installer
 * can converge that container without spelling `spokes` a second time.
 */
export const SPOKE_RUNTIME_CONTAINER = "spokes";

/**
 * The GENERATED directory that URL base is served from, RELATIVE to the generated runtime base
 * (`public/`): `spokes/<segment>/assets`. The platform namespace is `assets`, deliberately NOT a parent
 * of a Spoke's — neither is nested in the other, so one Spoke's artwork can never collide with another's
 * or with a platform asset.
 *
 * @param {string} segment a segment produced by {@link runtimeSegmentForSpokeId}
 * @returns {string} the runtime-base-relative generated directory
 */
export function spokeRuntimeAssetNamespacePath(segment) {
  return `${SPOKE_RUNTIME_CONTAINER}/${segment}/assets`;
}

/** The uppercase hexadecimal alphabet the escape uses — frozen so two runs cannot disagree. */
const HEX = "0123456789ABCDEF";

/**
 * The exact ASCII bytes that remain VERBATIM: letters, digits, `_`, `-` and `.`.
 * Every other byte (including every non-ASCII UTF-8 byte) is escaped.
 */
function isVerbatimByte(byte) {
  return (
    (byte >= 0x30 && byte <= 0x39) || // 0-9
    (byte >= 0x41 && byte <= 0x5a) || // A-Z
    (byte >= 0x61 && byte <= 0x7a) || // a-z
    byte === 0x5f || // _
    byte === 0x2d || // -
    byte === 0x2e //   .
  );
}

/** `~HH` for one byte, using uppercase hexadecimal. */
function escapeByte(byte) {
  return `${RUNTIME_SEGMENT_ESCAPE}${HEX[(byte >> 4) & 0xf]}${HEX[byte & 0xf]}`;
}

/**
 * The RUNTIME SEGMENT of one `SpokeId`: the directory/URL token a Spoke's own runtime namespace is
 * built from.
 *
 * @param {string} spokeId the Spoke's identity, exactly as the Installation manifest declares it
 * @returns {string} a non-empty, traversal-free, ASCII-safe segment
 */
export function runtimeSegmentForSpokeId(spokeId) {
  if (typeof spokeId !== "string") {
    throw new Error(
      "FOUNDATION-MULTISITE-S3E1C: a runtime segment is derived from a Spoke id, so the id must be a " +
        `string (received ${typeof spokeId}).`,
    );
  }

  if (spokeId === "") {
    // The Spoke-id domain refuses a blank id, and an empty segment could not name a namespace at all:
    // failing here makes "the segment is never empty" a property of the encoder rather than a hope.
    throw new Error(
      "FOUNDATION-MULTISITE-S3E1C: a blank Spoke id has no runtime segment — an id must be non-empty.",
    );
  }

  // A segment that IS "." or ".." would be a traversal name in every filesystem and URL context, so
  // its dots are escaped. The rule is deliberately about the WHOLE segment: "a." and "..." are
  // ordinary names and stay verbatim.
  const traversal = spokeId === "." || spokeId === "..";

  let segment = "";
  for (const byte of new TextEncoder().encode(spokeId)) {
    if (byte === 0x7e) {
      // `~` is the escape introducer and is therefore ALWAYS escaped, whatever it neighbours.
      segment += escapeByte(byte);
      continue;
    }
    if (isVerbatimByte(byte) && !(traversal && byte === 0x2e)) {
      segment += String.fromCharCode(byte);
      continue;
    }
    segment += escapeByte(byte);
  }

  return segment;
}

/**
 * THE COMPOSITE RUNTIME SEGMENT (FOUNDATION-ID-M3-P2)
 * ==================================================
 *
 * ONE identity question, for an Installation that IDENTIFIES its Spoke Hubs:
 *
 *     runtimeSegmentForSpokeHubSpoke("one", "docs")  ->  "hub+one+docs"
 *     runtimeSegmentForSpokeHubSpoke("two", "docs")  ->  "hub+two+docs"
 *
 * WHY A SECOND FUNCTION, AND WHY THE FIRST ONE IS UNTOUCHED
 * --------------------------------------------------------
 * A Spoke Hub owns its own membership, so the SAME local Spoke id may be declared in two Hubs: a Spoke's
 * identity is the COMPOSITE `(SpokeHubId, SpokeId)`, and a bare `SpokeId` is not one. `runtimeSegmentForSpokeId`
 * therefore keeps its contract EXACTLY — it answers for a bare Spoke id, and every flat/legacy
 * Installation's namespace, asset URL and generated directory must stay byte-identical, which a re-encode of
 * an existing id could not promise. The composite identity gets its OWN function instead, and the two can
 * never be confused, because their outputs are DISJOINT (proved below).
 *
 * THE COMPOSITE IS THE LEGACY ENCODER, COMPOSED — AND IT IS ONE ATOMIC SEGMENT
 * ---------------------------------------------------------------------------
 *     `hub+`    the reserved PREFIX (marker `hub` + the separator)
 *     `+`       the reserved SEPARATOR between the two encoded halves
 *     each half `runtimeSegmentForSpokeId(...)` — the SAME proven byte encoder, never a second one
 *
 * The result is ONE URL/filesystem segment: no `/`, no `\`, no `..`, no space, `%`, `?` or `#`, and no
 * character the legacy encoder would have escaped. It is therefore never two path segments (`/` is never
 * inserted between the ids) and never a traversal. The namespace helpers above accept it unchanged, so a
 * composite Spoke's artwork lives at `/spokes/hub+one+docs/assets` — exactly one level below the shared
 * container, like every other Spoke's, with the platform namespace still separate and still first.
 *
 * THE SEPARATOR CANNOT OCCUR IN LEGACY OUTPUT — THE PROOF, IN FULL
 * ---------------------------------------------------------------
 * The legacy encoder produces exactly two kinds of output: a VERBATIM byte from `[0-9A-Za-z_.-]`, or an
 * escape of `~` followed by two UPPERCASE hexadecimal digits. `+` (0x2B) is neither: it is not in the
 * verbatim set, and it is not `~`, so the encoder ESCAPES it as `~2B`. Therefore:
 *
 *   · NO legacy segment contains `+` at all. A composite segment always contains it, so the two encoders'
 *     outputs are DISJOINT: a composite Spoke can never take a flat Spoke's namespace, and a flat Spoke can
 *     never take a composite one's;
 *   · an id that literally spells a composite segment (`hub+one+docs`) encodes to `hub~2Bone~2Bdocs`, so it
 *     occupies its own namespace instead of borrowing a composite one.
 *
 * That holds for punctuation, escape sequences, Unicode and the separator characters themselves, because
 * the argument is not about the INPUT at all: it is about the encoder's OUTPUT ALPHABET, which this module's
 * suite checks over ids containing every one of those.
 *
 * INJECTIVITY OVER `(SpokeHubId, SpokeId)`
 * ---------------------------------------
 * The prefix and the separator are absent from every encoded half, so a composite segment splits at its two
 * `+` characters into exactly the two halves that built it — and each half decodes to exactly one id,
 * because the legacy encoder is itself injective (proved by this module's own suite). `compositeSegmentParts`
 * performs that split and decode, so round-tripping is not a claim in a comment: it is a function a test
 * calls, and it re-encodes both halves to be sure a segment is one THIS authority would have produced.
 *
 * CASE-EQUIVALENT KEYS ARE A COLLISION (`runtimeNamespaceCollisions`)
 * ------------------------------------------------------------------
 * Every non-ASCII byte is escaped as UPPERCASE hexadecimal, so the ONLY characters whose case can vary in
 * any segment are ASCII letters: lowercasing a segment is the COMPLETE case-fold for this encoding, which is
 * exactly what a case-insensitive filesystem does to two namespaces it cannot tell apart.
 *
 * Pure string encoding: no filesystem, no environment, no configuration, no framework.
 */

/** The marker that identifies a composite segment, before the separator. */
export const COMPOSITE_SEGMENT_MARKER = "hub";

/** The reserved SEPARATOR — a character the legacy encoder ALWAYS escapes, so it can never occur in it. */
export const COMPOSITE_SEGMENT_SEPARATOR = "+";

/** The reserved PREFIX of every composite segment: `hub+`. */
export const COMPOSITE_SEGMENT_PREFIX = `${COMPOSITE_SEGMENT_MARKER}${COMPOSITE_SEGMENT_SEPARATOR}`;

/**
 * The COMPOSITE runtime segment of one SPOKE IDENTITY: the single namespace token of the Spoke that a
 * `(SpokeHubId, SpokeId)` pair names.
 *
 * Both halves go through the SAME proven encoder, so the same local id in two Hubs yields two segments that
 * cannot collide, and an id containing punctuation, escapes, Unicode or the separator itself still occupies
 * exactly one segment of its own. A blank Hub id or a blank Spoke id is refused — the Spoke half by the
 * encoder's own rule, which is not restated here — because neither an unidentified Hub nor a nameless Spoke
 * can own a namespace.
 *
 * @param {string} spokeHubId the owning Spoke Hub's identity, exactly as the manifest declares it
 * @param {string} spokeId the local Spoke identity inside that Hub
 * @returns {string} one non-empty, traversal-free, ASCII-safe COMPOSITE segment
 */
export function runtimeSegmentForSpokeHubSpoke(spokeHubId, spokeId) {
  if (typeof spokeHubId !== "string") {
    throw new Error(
      "FOUNDATION-ID-M3-P2: a composite runtime segment is derived from a Spoke Hub id, so the id must be " +
        `a string (received ${typeof spokeHubId}).`,
    );
  }
  if (spokeHubId === "") {
    throw new Error(
      "FOUNDATION-ID-M3-P2: a blank Spoke Hub id has no runtime segment — an id must be non-empty, because " +
        "an unidentified Hub cannot own a namespace.",
    );
  }

  return (
    `${COMPOSITE_SEGMENT_PREFIX}${runtimeSegmentForSpokeId(spokeHubId)}` +
    `${COMPOSITE_SEGMENT_SEPARATOR}${runtimeSegmentForSpokeId(spokeId)}`
  );
}

/**
 * The COMPOSITE runtime segment of one `IdentifiedSpokeRef` (`@/core/spoke`) — the composite identity in the
 * ONE spelling both sides of the platform share, so a caller holding the domain reference never composes the
 * segment itself.
 *
 * @param {{ readonly spokeHubId: string, readonly spokeId: string }} ref the composite reference
 * @returns {string} the segment of that Spoke
 */
export function runtimeSegmentForIdentifiedSpokeRef(ref) {
  if (ref === null || typeof ref !== "object") {
    throw new Error(
      "FOUNDATION-ID-M3-P2: a composite runtime segment is derived from a (SpokeHubId, SpokeId) reference, " +
        "so the reference must be an object carrying both halves.",
    );
  }
  return runtimeSegmentForSpokeHubSpoke(ref.spokeHubId, ref.spokeId);
}

/**
 * Reverse the LEGACY encoding of ONE segment, or `null` when the value is not an encoding this authority
 * produced.
 *
 * The encoder's rule, read backwards: a character is either a VERBATIM ASCII byte (`[0-9A-Za-z_.-]`) or an
 * escape of `~` plus two UPPERCASE hexadecimal digits, and no `~` may be left over. A lowercase escape, a
 * bare `~`, a percent sign, a non-ASCII character or an over-long/truncated escape is therefore not an
 * encoding of this authority. Bytes are decoded as UTF-8 at the end; a byte sequence that is not valid
 * UTF-8 still decodes to something, so callers that need CANONICALITY re-encode the answer and compare
 * (`compositeSegmentParts` does exactly that).
 *
 * @param {string} segment a candidate legacy segment
 * @returns {string|null} the id it encodes, or `null`
 */
function decodeLegacySegment(segment) {
  /** @type {number[]} */
  const bytes = [];

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (character === RUNTIME_SEGMENT_ESCAPE) {
      const digits = segment.slice(index + 1, index + 3);
      if (!/^[0-9A-F]{2}$/.test(digits)) return null;
      bytes.push(Number.parseInt(digits, 16));
      index += 2;
      continue;
    }
    const code = character.charCodeAt(0);
    // Only the encoder's VERBATIM bytes may appear literally: every other byte — `+`, `/`, `%`, a space,
    // `~` and every non-ASCII byte — is always escaped, so a literal one proves this is not our output.
    if (code > 0x7f || !isVerbatimByte(code)) return null;
    bytes.push(code);
  }

  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Whether a segment is a COMPOSITE one, by its reserved prefix — never by its contents. */
export function isCompositeRuntimeSegment(segment) {
  return typeof segment === "string" && segment.startsWith(COMPOSITE_SEGMENT_PREFIX);
}

/**
 * The SPOKE IDENTITY a composite segment encodes — `{ spokeHubId, spokeId }` — or `null` when the value is
 * not a composite segment THIS authority would have produced.
 *
 * `null` is a RESULT, not an error: a flat/legacy segment lives in a different namespace by construction,
 * and a hand-written spelling of a composite segment (a missing half, a third separator, an escape the
 * encoder would never emit, an invalid UTF-8 byte sequence) must never resolve to an identity nobody
 * declared. Both halves are therefore decoded AND re-encoded, so canonicality is decided by the encoder
 * itself rather than by a second parser.
 *
 * @param {string} segment a candidate composite segment
 * @returns {{ spokeHubId: string, spokeId: string } | null}
 */
export function compositeSegmentParts(segment) {
  if (!isCompositeRuntimeSegment(segment)) return null;

  const remainder = segment.slice(COMPOSITE_SEGMENT_PREFIX.length);
  const split = remainder.indexOf(COMPOSITE_SEGMENT_SEPARATOR);
  // Both halves must be present, and a THIRD separator would mean a half the encoder could not produce.
  if (split <= 0) return null;
  const hubSegment = remainder.slice(0, split);
  const spokeSegment = remainder.slice(split + 1);
  if (spokeSegment.includes(COMPOSITE_SEGMENT_SEPARATOR)) return null;
  // Both halves must be NON-EMPTY: an empty one could not have been encoded (an id always has at least one
  // byte), and the canonical check below would throw rather than answer — a hand-written spelling must be a
  // `null` RESULT, not an error escaping from the encoder.
  if (hubSegment === "" || spokeSegment === "") return null;

  const spokeHubId = decodeLegacySegment(hubSegment);
  const spokeId = decodeLegacySegment(spokeSegment);
  if (spokeHubId === null || spokeId === null) return null;

  if (runtimeSegmentForSpokeId(spokeHubId) !== hubSegment) return null;
  if (runtimeSegmentForSpokeId(spokeId) !== spokeSegment) return null;

  return { spokeHubId, spokeId };
}

/**
 * EVERY collision an Installation's EFFECTIVE runtime keys produce, in reading order — empty when the
 * namespaces are distinct on both a case-sensitive and a case-INsensitive filesystem.
 *
 * Two Spokes must never share one namespace, and on a case-insensitive filesystem `Demo_01` and `demo_01`
 * are one directory: the second is refused rather than silently overwritten. Lowercasing is the COMPLETE
 * case-fold for this encoding (every non-ASCII byte is escaped as uppercase hex — see the module note), so
 * the check is exact, not heuristic.
 *
 * An exact duplicate is reported ONCE, as the duplicate it is, rather than twice.
 *
 * @param {readonly string[]} segments the effective runtime keys, in authored order
 * @returns {string[]} the collisions, empty when every key owns its own namespace
 */
export function runtimeNamespaceCollisions(segments) {
  /** @type {string[]} */
  const collisions = [];
  /** @type {Map<string, number>} */
  const exact = new Map();
  /** @type {Map<string, number>} */
  const folded = new Map();

  segments.forEach((segment, index) => {
    const where = `runtime key #${index + 1} ("${segment}")`;

    const duplicateOf = exact.get(segment);
    if (duplicateOf !== undefined) {
      collisions.push(
        `${where} is the same namespace as #${duplicateOf} — two Spokes cannot share one runtime ` +
          "namespace, because their artwork would overwrite one another",
      );
      return;
    }
    exact.set(segment, index + 1);

    const caseTwin = folded.get(segment.toLowerCase());
    if (caseTwin !== undefined) {
      collisions.push(
        `${where} collides with #${caseTwin} ("${segments[caseTwin - 1]}") on a CASE-INSENSITIVE ` +
          "filesystem, where the two namespaces are one directory — the keys must differ by more than case",
      );
      return;
    }
    folded.set(segment.toLowerCase(), index + 1);
  });

  return collisions;
}
