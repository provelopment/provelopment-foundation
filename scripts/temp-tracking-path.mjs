/**
 * THE `.temp` PATH RULE (GIT-TEMP-G1) — the ONE pure implementation
 * =================================================================
 *
 * THE POLICY. A directory named `.temp`, anywhere in a project hierarchy, is NEVER tracked by its
 * containing Git repository. It is where the OWNER hands material to and from a workspace — recovery
 * sets, patches, inventories, scratch copies, handoffs — never source, authored content,
 * configuration, build output or deployment state.
 *
 * TWO ARTEFACTS ENFORCE IT, AND THIS MODULE IS THE RULE THEY SHARE:
 *
 *   `./check-temp-tracking.mjs`  the GUARD: it asks this module about every path the Git INDEX
 *                               records (`git ls-files -z`), so a forced `git add -f` — which no
 *                               `.gitignore` can prevent — is caught anyway;
 *   `tests/unit/temp-tracking-guard.test.ts`  the CONTRACT SUITE: it feeds invented path lists
 *                               straight into these functions, so the rule is proved without
 *                               creating, reading or touching any real `.temp` material.
 *
 * Two implementations of "is this a `.temp` directory?" would drift, and the drift would be invisible
 * exactly where it matters (a guard that accepts what the policy refuses), so the rule lives HERE and
 * the guard is a thin caller of it.
 *
 * WHY THE RULE IS A COMPONENT RULE AND NOT A SUBSTRING ONE
 * -------------------------------------------------------
 * `.temp` is a DIRECTORY NAME, so only a COMPLETE slash-delimited component of a path can be it.
 *
 *   `deployment/spokes/foundation/.temp/recovery.patch`   IS one — refused, at any depth;
 *   `.temp.md`, `x.temp`, `.tempcache`, `data/.temp-notes/y`  are ordinary names that merely CONTAIN
 *                                                          the four characters — permitted, because
 *                                                          refusing them would force an author to rename
 *                                                          legitimate files.
 *
 * CASE IS NOT DISTINGUISHED. On a case-insensitive filesystem (Windows, macOS) `.TEMP` and `.temp` are
 * the SAME directory, so a repository may not track either spelling.
 *
 * A BACKSLASH IS NOT A SEPARATOR. A Git index path is ALWAYS slash-delimited — that is the storage
 * format on every platform — while a backslash is an ordinary character in a POSIX filename. Splitting
 * on it would refuse a legitimate file named `a\.temp\b`, so `/` is the only separator here.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO. It knows paths and nothing else: no filesystem, no
 * `node:fs`, no `process`, no Git, no globbing. It never inspects, stats or opens a `.temp` directory
 * — it reasons about the NAMES a repository records, which is what makes it safe to run against the
 * owner's material: the material is never read.
 */

/** The one directory name the policy covers. */
export const TEMP_DIRECTORY_NAME = ".temp";

/**
 * The `.gitignore` rule forms that cover the name at EVERY depth.
 *
 * The DOUBLE-STAR path-prefix form states the depth requirement explicitly, naming the directory at ANY
 * level. `.temp/` on its own is the same rule in Git's own semantics (a pattern with no separator other
 * than the trailing one matches a directory of that name at every level). Both are accepted. An ANCHORED
 * An ANCHORED form (`/.temp/`) is deliberately NOT accepted: it covers one directory level only,
 * which is the exact gap that leaves a nested `.temp` directory untracked-but-stageable.
 */
export const DEPTH_COVERING_TEMP_RULES = Object.freeze(["**/.temp/", ".temp/"]);


/**
 * Every `.temp` component of one path, with its position — the raw material of the diagnostic.
 *
 * The position is 1-based and counts COMPONENTS (not characters), so a reader can see exactly which
 * directory the path descends through, and the SPELLING is reported as found (`".TEMP"` stays
 * `".TEMP"`), so the diagnostic names what the index actually records.
 *
 * @param {string} indexPath a path as a Git index records it
 * @returns {{ index: number, spell: string }[]} one entry per offending component, in order
 */
export function tempDirectoryComponents(indexPath) {
  const components = pathComponents(indexPath);
  /** @type {{ index: number, spell: string }[]} */
  const found = [];

  components.forEach((component, position) => {
    if (isTempDirectoryComponent(component)) found.push({ index: position + 1, spell: component });
  });

  return found;
}

/**
 * THE DETERMINISTIC DIAGNOSIS for one path, or `null` when it is acceptable.
 *
 * Deterministic on purpose: the same path always produces the same sentence (no timestamps, no
 * absolute paths, no runner state), so a CI log and a local run are comparable and the contract suite
 * can assert the exact message. It names the path, the offending component's position, the spelling
 * found and the rule that refuses it.
 *
 * @param {string} indexPath a path as a Git index records it
 * @returns {string|null} the issue, or `null` when the path carries no `.temp` component
 */
export function tempTrackedPathIssue(indexPath) {
  const found = tempDirectoryComponents(indexPath);
  if (found.length === 0) return null;

  const total = pathComponents(indexPath).length;
  const named = found.map((hit) => `component ${hit.index} of ${total} is "${hit.spell}"`).join("; ");

  return (
    `"${indexPath}": ${named} — a directory named "${TEMP_DIRECTORY_NAME}" is never tracked, at any ` +
    "depth and in any case (owner policy, GIT-TEMP-G1)"
  );
}

/**
 * Every violation in a list of paths, in the order they were supplied — so a caller reports the list it
 * was given, never a sorted or deduplicated one it invented.
 *
 * @param {readonly string[]} indexPaths the paths to check
 * @returns {string[]} the issues, empty when every path is acceptable
 */
export function tempTrackingIssues(indexPaths) {
  /** @type {string[]} */
  const issues = [];

  for (const indexPath of indexPaths) {
    const issue = tempTrackedPathIssue(indexPath);
    if (issue !== null) issues.push(issue);
  }

  return issues;
}

/**
 * The RULE SPELLINGS a `.gitignore` text contains: blanks and comments removed, a trailing CR stripped
 * (the file may be checked out with either ending), surrounding spaces trimmed, and NEGATIONS (`!…`)
 * dropped — a negated line RE-INCLUDES material rather than excluding it, so it can never be the rule
 * this policy needs.
 *
 * @param {string} text the `.gitignore` content
 * @returns {string[]} the rule spellings, in file order
 */
export function gitignoreRules(text) {
  if (typeof text !== "string") return [];

  return text
    .split("\n")
    .map((line) => line.replace(/\r$/, "").trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("!"))
    .map((line) => line.replace(/\s+$/, ""));
}

/**
 * THE `.gitignore` HALF OF THE POLICY: whether the supplied text excludes a directory named `.temp` at
 * EVERY depth, or a deterministic explanation of what is missing.
 *
 * This is reported SEPARATELY from a tracked path, because the two failures are different: a tracked
 * path is material that is already committed (an index-only untracking decision for the owner), while
 * a missing rule is a repository that has never been configured to refuse the material at all. Neither
 * replaces the other — which is exactly why a `.gitignore` rule alone is not sufficient and a guard
 * alone is not either.
 *
 * @param {string} text the `.gitignore` content
 * @returns {string|null} the issue, or `null` when a depth-covering rule is present
 */
export function gitignoreDepthCoveringRuleIssue(text) {
  const rules = gitignoreRules(text);

  if (rules.some((rule) => DEPTH_COVERING_TEMP_RULES.includes(rule))) return null;

  const anchored = rules.some((rule) => rule === "/.temp/" || rule === "/.temp");
  if (anchored) {
    return (
      'the repository .gitignore ignores only "/.temp/" — an ANCHORED rule that covers the repository ' +
      `root and no nested directory. Use "${DEPTH_COVERING_TEMP_RULES[0]}" (or ` +
      `"${DEPTH_COVERING_TEMP_RULES[1]}"), which covers the name at every depth.`
    );
  }

  return (
    `the repository .gitignore carries no rule excluding a directory named "${TEMP_DIRECTORY_NAME}" — ` +
    `add "${DEPTH_COVERING_TEMP_RULES[0]}". The exclusion is the policy's first half and the ` +
    "tracked-path guard is the second; neither is sufficient alone."
  );
}

/**
 * The COMPLETE slash-delimited components of an index path.
 *
 * Empty components are dropped, so a trailing slash (`a/.temp/`) and a doubled separator
 * (`a//.temp/x`) describe the same components as their canonical spelling, and a leading `./` is
 * ignored. A non-string answers an empty list rather than throwing: this rule is asked about data.
 *
 * @param {string} indexPath a path as a Git index records it
 * @returns {string[]} its components, in order
 */
export function pathComponents(indexPath) {
  if (typeof indexPath !== "string") return [];

  const normalized = indexPath.startsWith("./") ? indexPath.slice(2) : indexPath;
  return normalized.split("/").filter((component) => component !== "");
}

/**
 * Whether ONE component names the `.temp` directory — compared case-insensitively, because a
 * case-insensitive filesystem cannot tell the spellings apart.
 *
 * @param {string} component one path component
 * @returns {boolean} true when it is the reserved directory name
 */
export function isTempDirectoryComponent(component) {
  return typeof component === "string" && component.toLowerCase() === TEMP_DIRECTORY_NAME;
}
