/**
 * SPOKE HUB IDENTITY (FOUNDATION-ID-M3-P1) — the PURE RULES
 * =========================================================
 *
 * The PURE half of "an Installation declares which Spoke Hubs it owns": the reserved id of the implicit
 * compatibility Spoke Hub, and the identity rules an authored Spoke Hub collection must satisfy.
 *
 * WHY THIS IS PLAIN ESM. It is the same reason `./spoke-id.mjs` is: the TypeScript domain surface
 * (`./spoke-hub-id.ts`, re-exported through `@/core/spoke`) and the CONFIGURATION/declaration seam
 * (`src/config/spoke-declarations.mjs`, plain ESM because the build's selection seam consumes it where
 * TypeScript cannot be executed) must answer the SAME question. Two implementations of "is this Spoke Hub
 * id acceptable?" would drift, and a build could then compose a Hub the domain refuses — so the rules live
 * in exactly ONE place, with the TypeScript module a thin typed re-export of this one.
 *
 * WHERE A SPOKE HUB IS AUTHORED IS NOT THIS MODULE'S BUSINESS
 * -----------------------------------------------------------
 * This module knows ids and nothing else. `spokes.json`, the `spokes/` directory, filesystem paths, roots,
 * `node:fs` and `process.cwd()` all belong to the configuration/build authority (`src/config/**`), which is
 * the layer that turns authored files into these ids. A `SpokeHubId` is an opaque identity: it is never a
 * path, never a hostname, never a public URL segment and never a resource directory (nothing may be
 * INFERRED from it), and an authored id is carried VERBATIM (no slugging, no case folding, no trimming of
 * an ordinary id).
 *
 * A SPOKE HUB IS NOT A BUSINESS, A TENANT OR COMMERCIAL OWNERSHIP
 * ---------------------------------------------------------------
 * A Spoke Hub is an ORGANISATIONAL coordinator of Spokes inside ONE Installation. Its identity says which
 * container this is, and nothing about who owns the websites in it — `(BusinessId, SiteId)` remains a
 * Site's permanent intrinsic identity, entirely independent of where a Site is hosted.
 *
 * THE RESERVED ID IS NOT AUTHORABLE
 * ---------------------------------
 * `IMPLICIT_SPOKE_HUB_ID` is the marker for "this Installation declares no Spoke Hub identity": the ONE
 * Spoke Hub the current runtime composes carries it. An explicit collection may therefore NEVER declare
 * it — otherwise an authored Spoke Hub would be indistinguishable from the compatibility marker. Exactly
 * as `IMPLICIT_SPOKE_ID` and `IMPLICIT_HUB_ID` do for their own layers, the reserved id is compared on the
 * TRIMMED spelling, so padding it cannot launder a reserved word into an authored identity. Case is NOT
 * normalized: `IMPLICIT` is an ordinary id.
 *
 * THREE MARKERS, THREE DECLARATIONS. The Spoke-Hub marker is INDEPENDENT of the implicit Spoke marker
 * (`./spoke-id.mjs`) and of the implicit Site Hub marker (`./hub-membership.ts`) even though all three are
 * spelled `implicit` today: each belongs to its own layer, each is declared by its own module, and each is
 * refused by its own rule set. One spelling is a coincidence of vocabulary, never an alias.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no configuration, no schema.
 */

/**
 * The reserved Spoke Hub id used when an Installation declares NO Spoke Hub identity: the ONE Spoke Hub
 * the runtime coordinates, whose Spokes are the Installation's declared collection.
 *
 * It is deterministic, internal, non-public and never authored — nothing derives it from a directory, a
 * manifest order, a hostname or content. It is declared HERE, as its own literal, so it stays independent
 * of the implicit Spoke marker and the implicit Site Hub marker.
 *
 * @type {string}
 */
export const IMPLICIT_SPOKE_HUB_ID = "implicit";

/**
 * Every reason this authored Spoke Hub-id list cannot be a coherent collection, in reading order — empty
 * when it is valid. Nothing throws here: a caller that must not proceed on a doubt asks for the issues and
 * decides for itself (the configuration layer reports them at build time).
 *
 * The rules are the IDENTITY ones, and only those:
 *
 *   - an explicit collection needs at least one Spoke Hub (there is no such thing as an authored, empty
 *     collection; "no collection" is the single implicit Spoke Hub, not an authored collection);
 *   - every id is non-blank;
 *   - no id is the reserved `IMPLICIT_SPOKE_HUB_ID` (compared on the trimmed spelling);
 *   - ids are unique, compared EXACTLY (so `IMPLICIT` and `one` vs `one ` are different ids).
 *
 * Where a Spoke Hub's Spokes are authored, which physical roots they name and whether those exist are NOT
 * identity questions: they belong to the configuration layer that resolves roots, so this function never
 * touches a filesystem. Whether a LOCAL Spoke id repeats in ANOTHER Spoke Hub is likewise not an issue
 * here — a Spoke id is unique WITHIN its owning Spoke Hub and may repeat in another.
 *
 * @param {readonly string[]} ids the authored Spoke Hub ids, in manifest order
 * @returns {string[]} the issues, empty when the collection is coherent
 */
export function spokeHubCollectionIssues(ids) {
  /** @type {string[]} */
  const issues = [];

  if (ids.length === 0) {
    issues.push("an explicit Spoke Hub collection needs at least one Spoke Hub");
  }

  /** @type {Map<string, number>} */
  const declaredBy = new Map();

  ids.forEach((id, index) => {
    const where = `Spoke Hub #${index + 1}`;

    if (id.trim() === "") {
      issues.push(`${where} has a blank id`);
      return;
    }

    if (id.trim() === IMPLICIT_SPOKE_HUB_ID) {
      issues.push(
        `${where}: id "${IMPLICIT_SPOKE_HUB_ID}" is reserved for the implicit Spoke Hub and ` +
          "cannot be declared explicitly",
      );
    }

    const previous = declaredBy.get(id);
    if (previous !== undefined) {
      issues.push(`${where} repeats id "${id}", already declared by Spoke Hub #${previous}`);
      return;
    }

    declaredBy.set(id, index + 1);
  });

  return issues;
}
