/**
 * THE SITE-ID, RESERVED-IDENTIFIER AND SITE-IDENTITY CONTRACT (FOUNDATION-ID-M1)
 * ============================================================================
 *
 * THREE questions, one file, because they are one contract — what a Site may be CALLED, what it
 * may NOT be called, and what a Site IS:
 *
 *   · the Site-ID GRAMMAR (`siteIdIssue`, `isSiteId`) — syntax only;
 *   · the RESERVED Site-ID vocabulary (`reservedSiteIdIssue`) — semantics only, and deliberately a
 *     SEPARATE authority, because a reserved word is normally a perfectly well-formed Site ID;
 *   · the composite SITE IDENTITY `(businessId, siteId)` a Site is permanently identified by —
 *     together with the ONE deterministic, collision-free key built from it.
 *
 * A SITE ID IS DESCRIPTIVE, NOT GEOGRAPHIC
 * ----------------------------------------
 * A Site ID is a human-readable, lower-case, hyphen-separated word: `home-office`, `workshop`,
 * `main-website`, `product-support`. It is BUSINESS-SCOPED: unique within its Business and nowhere
 * else, so two independent Businesses may each own a `home-office`. It is never a country code, a
 * locale, a hostname, a domain, a Spoke, a Hub, a Site Hub or a geographic region, and it is never
 * globally unique on its own — which is exactly why a Site's identity is the PAIR (see below).
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
 * A Site is identified by `(businessId, siteId)` and by nothing else. There is deliberately no
 * second, generated Site identifier: a UID would be an identity nothing else can name, and the pair
 * already is the site's permanent identity.
 *
 * RESERVED IS NOT THE SAME AS ILL-FORMED
 * --------------------------------------
 * `api`, `assets`, `spokes`, `admin`, `default`, `preview` … are all VALID Site IDs syntactically.
 * They are refused because they are RESERVED (see `RESERVED_SITE_ID_GROUPS`), and the two answers
 * must stay two answers: a grammar that refused them would also have to refuse whatever the next
 * milestone reserves, and a caller that checked only the grammar could author a Site ID that
 * silently shadows a platform path. `siteIdentityIssue` applies BOTH rules; nothing else does.
 *
 * SITE OWNERSHIP IS IMMUTABLE
 * ---------------------------
 * A Site's composite identity is permanent and never transferred. When a website is sold or
 * acquired, its content is migrated into a NEW Site belonging to the acquiring Business: the
 * acquirer's Business ID is never written over the original one, and the original Site keeps its
 * own identity. Nothing in this module performs, models or records such a migration — it defines
 * the identity that makes the rule meaningful.
 *
 * Framework-neutral: pure data and pure functions. It imports ONE sibling DOMAIN module — the
 * Business-ID authority, so a composite can never develop a second Business-ID rule — and nothing
 * else: no React, Next.js, filesystem, environment, clock, network or crypto dependency.
 */
import { businessIdIssue, type BusinessId } from "./business-identity";

/** The milestone that introduced this contract, named in every thrown message. */
const CONTRACT = "FOUNDATION-ID-M1";

/** How a rejected value is named in a message — `null` and an array are worth distinguishing. */
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * A SITE ID — the descriptive, Business-scoped name of one website.
 *
 * The alias exists so a composite identity can name its Site dimension in the SAME vocabulary as
 * this authority, instead of spelling an anonymous `string` that could hold anything.
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
 * `isSiteId` says so. A caller deciding what may be AUTHORED asks `reservedSiteIdIssue` as well (or
 * `siteIdentityIssue`, which applies both rules).
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
 * Three neighbouring categories are NOT in this vocabulary, for two different reasons:
 *
 *   · Framework-owned paths (`_next`, the retired `/~spoke` namespace) and public resource filenames
 *     (`robots.txt`, `sitemap.xml`, `favicon.ico`) cannot be expressed as a Site ID at all: the
 *     former begin with a character the grammar forbids, the latter carry a dot. No reservation is
 *     needed to keep them out, so none is taken.
 *   · The page-route names (`home`, `connect`, `contact`, `opengraph-image`) ARE syntactically valid
 *     Site IDs — ordinary lowercase words, so `siteIdIssue` accepts every one of them. They are
 *     nevertheless NOT among the thirteen globally reserved identifiers, because what they collide
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
 * It names the word, its group and the reason, and it never reports a syntax fault: a caller that
 * must apply both rules asks `siteIdentityIssue`, which does exactly that and in that order.
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
/**
 * A SITE'S PERMANENT IDENTITY: the Business that owns it, and the Site ID within that Business.
 *
 * The pair IS the whole identity. It carries no Spoke, no Spoke Hub, no Site Hub, no hostname, no
 * domain, no locale and no location: hosting is a SEPARATE relationship that may change, and folding
 * it into identity is exactly what would make a Site's identity depend on where it is served today.
 *
 * Because both components are explicit, two independent Businesses may own a Site called
 * `home-office` — and those are two Sites, in different composites, even when one Spoke serves both.
 *
 * STRUCTURAL TYPING, DELIBERATELY: only `businessId` and `siteId` participate. A caller holding a
 * richer resolved object (with a Spoke, a Site Hub or a hostname on it) may pass it as it is; those
 * properties are ignored — never required, and never part of the key. That is what makes "identity
 * does not depend on hosting" checkable rather than asserted.
 */
export interface SiteIdentity {
  readonly businessId: BusinessId;
  readonly siteId: SiteId;
}

/**
 * The separator of a composite key, and the reason ONE separator is enough.
 *
 * It can never occur in either component: a Business ID's alphabet is alphanumeric (its only
 * non-alphanumeric character is the `_` of its prefix), and the Site-ID grammar admits only
 * lowercase letters, digits and hyphens. So the first separator is the ONLY separator, the split is
 * unambiguous for every possible pair, and no escaping is needed to keep the key collision-free.
 *
 * The key is an INTERNAL identity token — never a URL, a filename or a path segment. Rendering a
 * composite for a filesystem or a URL is a different concern with its own authority (the runtime
 * segment encoding), and this constant is deliberately not the place for it.
 */
export const SITE_IDENTITY_SEPARATOR = "/";

/**
 * The ONE diagnosis for a composite Site identity, or `null` — BOTH rules, in a fixed order.
 *
 *   1. the identity must be an object with the two leaves;
 *   2. `businessId` must be a canonical Business ID (the Business-ID authority decides);
 *   3. `siteId` must be a well-formed Site ID (the grammar decides);
 *   4. `siteId` must not be RESERVED (the reservation authority decides).
 *
 * Steps 3 and 4 are separate on purpose: `api` passes the grammar and fails the reservation, and a
 * caller must be able to see both facts rather than a single, ambiguous refusal.
 *
 * Nothing is normalised or repaired here. A missing, non-string or non-canonical Business ID is
 * refused — a composite can never be assembled from an absent or guessed Business.
 */
export function siteIdentityIssue(identity: unknown): string | null {
  if (typeof identity !== "object" || identity === null || Array.isArray(identity)) {
    return (
      'a Site identity must be an object with "businessId" and "siteId" (received ' +
      `${describeType(identity)})`
    );
  }

  const { businessId, siteId } = identity as Record<string, unknown>;

  const businessIssue = businessIdIssue(businessId);
  if (businessIssue !== null) return `businessId: ${businessIssue}`;

  const siteIssue = siteIdIssue(siteId);
  if (siteIssue !== null) return `siteId: ${siteIssue}`;

  const reservedIssue = reservedSiteIdIssue(siteId);
  if (reservedIssue !== null) return `siteId: ${reservedIssue}`;

  return null;
}

/**
 * THE composite key of a Site identity: deterministic, collision-free and stable forever.
 *
 * Two calls with the same pair always answer the same string; two DIFFERENT composites always answer
 * different strings — including two Businesses' `home-office`, which is the whole point of the pair.
 *
 * An invalid identity THROWS rather than producing a key: a key is a name a caller will compare,
 * store or look something up by, so naming an identity the contract refuses would be worse than
 * failing. A caller that wants to test first asks `siteIdentityIssue` and gets no throw.
 */
export function siteIdentityKey(identity: SiteIdentity): string {
  const issue = siteIdentityIssue(identity);
  if (issue !== null) {
    throw new Error(
      `${CONTRACT}: cannot build a Site identity key — a key must never name an identity the ` +
        `contract refuses: ${issue}.`,
    );
  }

  return `${identity.businessId}${SITE_IDENTITY_SEPARATOR}${identity.siteId}`;
}
