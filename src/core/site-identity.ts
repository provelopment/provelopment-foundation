/**
 * THE SITE-ID AND RESERVED-IDENTIFIER CONTRACT (FOUNDATION-ID-M1)
 * ==============================================================
 *
 * TWO questions, one file, because they are one contract — what a Site may be CALLED, and what it may
 * NOT be called:
 *
 *   · the Site-ID GRAMMAR (`siteIdIssue`, `isSiteId`) — syntax only;
 *   · the RESERVED Site-ID vocabulary (`reservedSiteIdIssue`) — semantics only, and deliberately a
 *     SEPARATE authority, because a reserved word is normally a perfectly well-formed Site ID.
 *
 * A Site is no longer identified here: `GEO-04` C02 retired the Business-scoped composite identity,
 * so this module owns the vocabulary a Site ID is authored in and nothing about ownership.
 *
 * A SITE ID IS DESCRIPTIVE, NOT GEOGRAPHIC
 * ----------------------------------------
 * A Site ID is a human-readable, lower-case, hyphen-separated word: `home-office`, `workshop`,
 * `main-website`, `product-support`. Its uniqueness is a DECLARATION's business — the EFS manifest
 * declares Sites per Facet — so nothing here implies a global namespace. It is never a country code,
 * a locale, a hostname, a domain, a Spoke, a Hub, a Site Hub or a geographic region.
 *
 * A SITE ID IS DELIBERATELY NOT "NOT-A-LOCALE"
 * -------------------------------------------
 * This grammar admits `hr`, `it`, `web`, `app` and `art`, even though a locale path key may be
 * spelled the same way. A token is a locale only when a Site DECLARES it as one, and the two are
 * told apart by the explicit identity and address context a later milestone owns — never by bending
 * the Site-ID grammar, which would refuse ordinary, useful business words for no benefit.
 *
 * THE GRAMMAR IS THE CONTENT-SLUG FAMILY, REFINED ONCE
 * ---------------------------------------------------
 *   Site ID        ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$   the content-slug family with ONE refinement:
 *                                                    a Site ID must BEGIN with a letter — a Site ID
 *                                                    names a website, and a numeric-only id ("419")
 *                                                    is not a name.
 *
 * The slug rule ITSELF is declared once and lives in `@/core/page-content`; this module deliberately
 * does not restate it. The contract test asserts that every valid Site ID is also a valid content
 * slug, which is what keeps the two from drifting apart.
 *
 * The rest comes free from the family: `.`, `..`, `/`, `\`, `%`, `_`, `~`, a space and every other
 * punctuation character are simply not representable, so no path separator, no URL-encoded
 * traversal and no Windows-style path can be smuggled through a Site ID.
 *
 * NO GENERATED SITE UID EXISTS
 * ----------------------------
 * There is deliberately no generated Site identifier in this vocabulary: an ID a Site is authored
 * under is a descriptive word, and a UID would be an identity nothing else can name.
 *
 * RESERVED IS NOT THE SAME AS ILL-FORMED
 * --------------------------------------
 * `api`, `assets`, `spokes`, `admin`, `default`, `preview` … are all VALID Site IDs syntactically.
 * They are refused because they are RESERVED (see `RESERVED_SITE_ID_GROUPS`), and the two answers
 * must stay two answers: a grammar that refused them would also have to refuse whatever the next
 * milestone reserves, and a caller that checked only the grammar could author a Site ID that
 * silently shadows a platform path. An AUTHORING boundary applies BOTH rules, in that order — the
 * grammar first, so a spelling fault is never misreported as a reservation.
 *
 * Framework-neutral: pure data and pure functions. It imports NOTHING — no React, Next.js,
 * filesystem, environment, clock, network or crypto dependency, and no sibling contract either: a
 * reservation list reachable from another authority could change what a Site ID may be from outside
 * this file.
 */

/** How a rejected value is named in a message — `null` and an array are worth distinguishing. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * A SITE ID — the descriptive name of one website.
 *
 * The alias exists so a value in this vocabulary can be named in this vocabulary, instead of
 * spelling an anonymous `string` that could hold anything.
 */
export type SiteId = string;

/**
 * The shortest Site ID. One character is not a name, and a two-character id is genuinely useful
 * (`hr`, `it`, `qa`) — see `SITE_ID_PATTERN` for the shape it must have.
 */
export const SITE_ID_MIN_LENGTH = 2;

/**
 * The longest Site ID. A Site ID is a URL segment and a directory name, so 40 characters leaves
 * room for the locale and route that follow it, stays inside the DNS label limit (63) a later
 * milestone's per-Business hostname would need, and covers realistic descriptive ids
 * (`ashcombe-landscapes-north-devon-office` is 37).
 */
export const SITE_ID_MAX_LENGTH = 40;

/**
 * THE ONE Site-ID GRAMMAR: lowercase letters and digits in hyphen-separated words, beginning with a
 * lowercase letter (`home-office`, `workshop`, `web`, `app`, `art`).
 *
 * It is the content-slug family with one refinement — the first character must be a letter — and it
 * is declared here as the SINGLE rule a Site ID is checked against: `siteIdIssue` asks this
 * expression first and only explains afterwards which way a value failed it.
 */
export const SITE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Characters that can never appear in a Site ID and always mean a path or an encoded form. */
const SITE_ID_FORBIDDEN_SEGMENT_CHARACTERS = /[/\\.%]/;

/**
 * The MATCHING form of any spelling: trimmed and lower-cased, or `""` for a non-string.
 *
 * MATCHING ONLY — exactly as `@/core/site-code` treats a Site code. A Site ID is authored data, so
 * it is either canonical or wrong; this function exists so a caller can compare two spellings (a
 * lookup, a duplicate check) without ever pretending the authored one was accepted. It never makes
 * an invalid id valid: `isSiteId(normalizeSiteId(value))` asks the authority again.
 */
export function normalizeSiteId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Whether `value` is a well-formed Site ID — a SYNTAX question only.
 *
 * Reservations are NOT answered here: `api` and `assets` are perfectly well-formed Site IDs and
 * `isSiteId` says so. A caller deciding what may be AUTHORED asks `reservedSiteIdIssue` as well —
 * the two questions stay two questions, and each keeps its own answer.
 */
export function isSiteId(value: unknown): boolean {
  return siteIdIssue(value) === null;
}

/**
 * The ONE actionable syntax diagnosis for a Site ID, or `null` when it is well-formed.
 *
 * `SITE_ID_PATTERN` alone decides; every branch after it exists only to say WHICH way a value failed
 * — the same division `@/core/page-content` uses for a content slug, so the accepted vocabulary
 * cannot drift from the messages that describe it.
 *
 * A reserved word gets NO message here: reservation is a separate, semantic authority
 * (`reservedSiteIdIssue`), and collapsing the two would make the grammar itself a moving target.
 */
export function siteIdIssue(value: unknown): string | null {
  if (typeof value !== "string") {
    return `site id must be a string (received ${describeType(value)})`;
  }

  if (value.length < SITE_ID_MIN_LENGTH) {
    return (
      `site id "${value}" is too short: a Site ID is at least ${SITE_ID_MIN_LENGTH} characters ` +
      '(they name a website — "hr", "it", "web", "home-office")'
    );
  }

  if (value.length > SITE_ID_MAX_LENGTH) {
    return (
      `site id "${value}" is ${value.length} characters long, but a Site ID is at most ` +
      `${SITE_ID_MAX_LENGTH}`
    );
  }

  // THE ONE GRAMMAR AUTHORITY. Everything below only explains a refusal it has already made.
  if (SITE_ID_PATTERN.test(value)) return null;

  if (SITE_ID_FORBIDDEN_SEGMENT_CHARACTERS.test(value)) {
    return (
      `site id "${value}" contains a path separator, a dot or a percent-encoded form: a Site ID ` +
      'is ONE lowercase word with optional single hyphens ("home-office"), so no traversal, no ' +
      "separator and no encoded sequence can be expressed"
    );
  }

  if (value.startsWith("-") || value.endsWith("-") || value.includes("--")) {
    return (
      `site id "${value}" has an illegal hyphen: a Site ID must neither begin nor end with one, ` +
      'and never carries two in a row ("home-office", not "-home--office")'
    );
  }

  if (/^[0-9]/.test(value)) {
    return (
      `site id "${value}" must begin with a lowercase letter: a Site ID names a website, and a ` +
      'numeric-only id is not a name (write "unit-12", not "12")'
    );
  }

  if (value !== value.toLowerCase()) {
    return `site id "${value}" must be lowercase — write it as "${value.toLowerCase()}"`;
  }

  return (
    `site id "${value}" must be lowercase letters and digits in hyphen-separated words, beginning ` +
    'with a letter ("home-office", "workshop", "product-support")'
  );
}

/**
 * THE APPROVED RESERVED SITE-ID VOCABULARY (FOUNDATION-ID-M1)
 * =========================================================
 *
 * ONE authority, three groups, and the complete collection DERIVED from them — so a word can never
 * be reserved in one place and absent in another.
 *
 * These words are reserved because Foundation itself needs them: they name platform paths, runtime
 * namespaces, administration surfaces and routing/operator surfaces that a Site must never shadow.
 * A reserved word being well-formed is the POINT (see the module note): reservation is a semantic
 * rule over a valid syntax, which is why it is a separate function from `siteIdIssue`.
 *
 * The list is deliberately CLOSED and small. `health` is NOT here: it remains an unapproved
 * candidate, and reserving a word is a breaking change for any configuration already using it, so
 * the vocabulary only grows by an explicit decision.
 *
 * `ww` — the retired worldwide Site word — is NOT here yet, and that is deliberate, not a waiver:
 * the legacy establishment inputs still author it as an EFS Site, so reserving it now would make the
 * platform's own establishment output invalid. Enforcing the prohibition is a MANDATORY open
 * `GEO-04` dependency that lands with, or after, the establishment/legacy-runtime reconciliation, and
 * it is never satisfied by leaving the word unreserved for good.
 *
 * Three neighbouring categories are NOT in this vocabulary, for two different reasons:
 *
 *   · Framework-owned paths (`_next`, the retired `/~spoke` namespace) and public resource filenames
 *     (`robots.txt`, `sitemap.xml`, `favicon.ico`) cannot be expressed as a Site ID at all: the
 *     former begin with a character the grammar forbids, the latter carry a dot. No reservation is
 *     needed to keep them out, so none is taken.
 *   · The page-route names (`home`, `connect`, `contact`, `opengraph-image`) ARE syntactically valid
 *     Site IDs — ordinary lowercase words, so `siteIdIssue` accepts every one of them. They are
 *     nevertheless NOT among the fourteen globally reserved identifiers, because what they collide
 *     with is a PAGE ROUTE rather than a Site: page-route collision and resolution rules are a
 *     SEPARATE concern owned by the routing and page authorities (`HOME_CONTENT_SLUG` in
 *     `@/core/page-content` is the home slug the page route skips), and a page is addressed below
 *     the site segment. Reserving them here would import a routing concern into the identity
 *     vocabulary.
 */
export type ReservedSiteIdGroup = "platform" | "administration" | "routing";

/** Why each group exists, named in the diagnosis so an author learns the rule, not just the fact. */
const RESERVED_SITE_ID_GROUP_REASONS: Readonly<Record<ReservedSiteIdGroup, string>> = {
  platform: "it names a platform-controlled path, namespace or surface",
  administration: "it is reserved for administration surfaces a Site never owns",
  routing: "it is reserved for routing and operator surfaces a Site never owns",
};

/** The approved groups, in the order they are declared — the ONE authority for the vocabulary. */
export const RESERVED_SITE_ID_GROUPS: Readonly<Record<ReservedSiteIdGroup, readonly string[]>> =
  Object.freeze({
    platform: Object.freeze(["api", "assets", "system", "internal", "spokes"]),
    administration: Object.freeze(["admin", "auth", "account"]),
    routing: Object.freeze(["default", "preview", "dashboard", "settings", "status"]),
  });

/**
 * Every reserved Site ID — DERIVED from the three groups, never restated.
 *
 * A word is reserved iff it appears in one of `RESERVED_SITE_ID_GROUPS`; there is no second list to
 * keep in step, and the contract test asserts the derivation rather than a copy of the words.
 */
export const RESERVED_SITE_IDS: readonly string[] = Object.freeze([
  ...RESERVED_SITE_ID_GROUPS.platform,
  ...RESERVED_SITE_ID_GROUPS.administration,
  ...RESERVED_SITE_ID_GROUPS.routing,
]);

/** The reverse index: which group reserved a word, for the diagnosis and for `isReservedSiteId`. */
const RESERVED_SITE_ID_GROUP_BY_ID: ReadonlyMap<string, ReservedSiteIdGroup> = new Map(
  (Object.keys(RESERVED_SITE_ID_GROUPS) as ReservedSiteIdGroup[]).flatMap((group) =>
    RESERVED_SITE_ID_GROUPS[group].map((id) => [id, group] as const),
  ),
);

/**
 * Whether `value` is a reserved word — a SEMANTIC question about an IDENTIFIER, not about spelling.
 *
 * The comparison is made on the MATCHING form (`normalizeSiteId`), exactly as `isSiteCode` compares
 * a Site code: the word `API` is reserved even though `API` is also refused for its case. A
 * non-string is not a reserved word.
 *
 * `isReservedSiteId` says NOTHING about whether the word is well-formed: `api` is both well-formed
 * and reserved, and each fact has its own authority.
 */
export function isReservedSiteId(value: unknown): boolean {
  return RESERVED_SITE_ID_GROUP_BY_ID.has(normalizeSiteId(value));
}

/**
 * The ONE actionable reservation diagnosis, or `null` when the word is not reserved.
 *
 * It self-identifies nothing: a word is reserved or it is not, and an authoring boundary that must
 * apply both rules asks `siteIdIssue` first and then `reservedSiteIdIssue`.
 */
export function reservedSiteIdIssue(value: unknown): string | null {
  const word = normalizeSiteId(value);
  const group = RESERVED_SITE_ID_GROUP_BY_ID.get(word);
  if (group === undefined) return null;

  return (
    `site id "${word}" is a reserved identifier (${group}): ` +
    `${RESERVED_SITE_ID_GROUP_REASONS[group]}, so it may not be authored as a Site ID`
  );
}
