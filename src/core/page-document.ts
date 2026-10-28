/**
 * THE DECLARATIVE PAGE DOCUMENT (FOUNDATION-PAGES-A2)
 * ==================================================
 *
 * The second first-class authoring mode's contract: a JSON page describes a page as
 * DATA — an explicit envelope and an ordered list of sections — and nothing else. It
 * is not a back door into the application runtime:
 *
 *   · no JavaScript, no executable expressions, no imports, no JSX;
 *   · no author-supplied component names, no `eval`, no event handlers;
 *   · no raw HTML, no `style`, no class names, no pixel values;
 *   · no URLs this platform has not classified (`@/core/safe-url`).
 *
 * Everything a document may say is declared HERE, as data and as one Zod schema, so
 * documentation tooling can read the vocabulary and tests can assert it. A property
 * that is not declared is REFUSED rather than ignored: a typo must fail the build
 * naming the file, never silently produce a page missing what the author wrote.
 *
 * WHY IT LIVES IN `@/core`
 * ------------------------
 * The document model is a domain contract (what a page may BE), and it is
 * framework-free: Zod is the platform's established validation technology and the
 * only import beyond core itself (`@/core/contact-inquiry` is the precedent). The
 * filesystem, the locale and the React presentation are all somebody else's job —
 * this module validates, it does not read, resolve or render.
 *
 * NESTING IS BOUNDED ON PURPOSE
 * -----------------------------
 * A page has sections; a section has ITEMS. There is no section inside a section and
 * no arbitrary recursive component tree, because unbounded nesting makes schema
 * validation, the heading outline and the accessibility contract unpredictable. The
 * one place a section carries structured "inner" content (`columns`) is bounded to
 * side-by-side text blocks with a mandatory title, which is a layout decision and not
 * a second document.
 *
 * THE PAGE TITLE IS THE ONLY H1
 * -----------------------------
 * `title` is required and renders as the page's `<h1>` — one page-level heading,
 * always, exactly as the Markdown mode's page title does. Section `heading`s are
 * level 2 and item titles are level 3, so the outline can never be ambiguous or
 * multiple-H1. A section may not declare its own heading level: the level is a
 * property of where the heading lives, never of author taste.
 */
import { z } from "zod";

import { HOME_CONTENT_SLUG, isContentSlug } from "./page-content";
import { isPageRoutePath } from "./page-route-path";
import { classifyAuthorUrl } from "./safe-url";

/** The ONE supported envelope version. A document naming another one is refused. */
export const PAGE_DOCUMENT_SCHEMA_VERSION = 1;

/**
 * THE PAGE-VISIBILITY VOCABULARY (TEMPLATE-PV-A1)
 * ===============================================
 *
 * Whether a page is ADVERTISED is a publication fact, and the document that describes the page is the only
 * place it is declared — never a global Site setting and never a per-Spoke switch:
 *
 *   `public`    the ordinary page: served at its URL, published in the sitemap and offered as an `hreflang`
 *               alternate exactly as it always was. This is the DEFAULT, so a document that declares nothing
 *               is public: every page authored before this property existed keeps the behaviour it had, and
 *               the envelope version stays `1` (the property is ADDITIVE and OPTIONAL).
 *   `unlisted`  a page that is DIRECTLY REACHABLE at its exact URL and otherwise undiscoverable: it is
 *               excluded from the published sitemap inventory, it is never offered as a language alternate,
 *               and its own response carries `robots: noindex, nofollow`. No alias, no alternate, no
 *               navigation entry and no `robots.txt` line may name it.
 *
 * TWO QUESTIONS ARE DELIBERATELY SEPARATE, and this vocabulary never merges them:
 *
 *   SERVABILITY    does a valid page resolve and render at its exact URL? An `unlisted` page does.
 *   PUBLICATION    should that page appear in automatically generated discovery output? An `unlisted` page
 *                  does not — while its own URL keeps working for anyone who knows it.
 *
 * AN UNLISTED URL IS A DISCOVERY CONVENIENCE, NEVER A SECURITY BOUNDARY. It authenticates nobody, restricts
 * nothing and must never be asked to carry secrets; authentication and authorization are a different
 * capability, deliberately not modelled here. A value outside this vocabulary is REFUSED rather than guessed
 * at (see `pageDocumentSchema`), so a page is never accidentally made undiscoverable — or discoverable — by a
 * word the platform did not understand.
 */
export const PAGE_VISIBILITIES = ["public", "unlisted"] as const;

export type PageVisibility = (typeof PAGE_VISIBILITIES)[number];

/** The visibility a document has when it declares none. Every page ever authored is public. */
export const PAGE_DEFAULT_VISIBILITY: PageVisibility = "public";

/** Structural bounds. Every one of them is enforced by the schema below. */
export const PAGE_MAX_SECTIONS = 40;
export const PAGE_MAX_ITEMS = 24;
export const PAGE_MAX_ACTIONS = 3;
export const PAGE_MAX_HEADING = 160;
export const PAGE_MAX_LABEL = 120;
export const PAGE_MAX_TEXT = 4000;
export const PAGE_MAX_CELL = 400;
export const PAGE_MAX_CAPTION = 400;
export const PAGE_MAX_COLUMNS = 4;
export const PAGE_MAX_TABLE_ROWS = 60;
export const PAGE_MAX_STATS = 6;

/** Every section type the vocabulary supports. This list IS the vocabulary. */
export const PAGE_SECTION_TYPES = [
  "hero",
  "prose",
  "media",
  "gallery",
  "actions",
  "callout",
  "cards",
  "features",
  "columns",
  "steps",
  "stats",
  "quote",
  "table",
  "faq",
  "list",
  "divider",
] as const;

export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

/** Finite presentation vocabularies. A value outside one of these is refused. */
export const PAGE_SECTION_SURFACES = ["plain", "muted", "bordered"] as const;
export const PAGE_ALIGNMENTS = ["start", "center"] as const;
export const PAGE_ITEM_COLUMNS = [2, 3, 4] as const;
export const PAGE_ACTION_VARIANTS = ["primary", "secondary", "link"] as const;
export const PAGE_CALLOUT_TONES = ["note", "info", "warning"] as const;
export const PAGE_MEDIA_POSITIONS = ["start", "end"] as const;

export type PageSectionSurface = (typeof PAGE_SECTION_SURFACES)[number];
export type PageAlignment = (typeof PAGE_ALIGNMENTS)[number];
export type PageActionVariant = (typeof PAGE_ACTION_VARIANTS)[number];
export type PageCalloutTone = (typeof PAGE_CALLOUT_TONES)[number];
export type PageMediaPosition = (typeof PAGE_MEDIA_POSITIONS)[number];

/**
 * THE APPLICATION-LINK REFERENCE VOCABULARY (WEB1-CONNECT-WWW-PUBLIC-MAILTO-A8 PHASE F)
 * ====================================================================================
 *
 * A page sometimes has to name a link FOUNDATION CANNOT KNOW: an address a host application owns and
 * may change, a destination the application decides is currently offered. Foundation must not learn
 * what that link MEANS — no address, no scheme, no mailbox, no lifecycle, no authorization, no
 * provider vocabulary — so it supplies the smallest thing that lets an author name one:
 *
 *   a document DECLARES an id → a generic reference
 *   the host APPLICATION resolves that reference at render time → an href, or nothing
 *
 * The chain, where only the last step can produce a destination:
 *
 * ```text
 * document link id   "quotation-email"          authored once, in this document's `links`
 *      ↓ `key` (OPAQUE here: Foundation validates its SHAPE, never its meaning)
 * application key    "public-contact-email"     the host's namespace, the host's decision
 *      ↓ a resolver supplied per render (an argument, never module state)
 * href               "mailto:…" | "https://…"   the host produces it, the platform classifies it
 * ```
 *
 * WHY THE KIND IS A CLOSED SET, AND WHY THAT IS A SECURITY DECISION
 * ----------------------------------------------------------------
 * The only thing that varies between "a link the application resolves" cases is WHICH link, and that
 * is what `key` expresses. A second KIND would be justified only if resolution needed a different
 * AUTHORITY (content, configuration, a Module under another trust rule), because a kind is *who may
 * authorize this href* — not a cosmetic label. So the enum is closed, an unknown `reference` is
 * REFUSED at read time, and adding a kind is an explicit contract change (its own PR, review and
 * release), never a downstream string. A product that needs its own word for a link belongs in its
 * own `key` namespace, not in this list.
 */
export const PAGE_LINK_REFERENCE_KINDS = ["applicationLink"] as const;

export type PageLinkReferenceKind = (typeof PAGE_LINK_REFERENCE_KINDS)[number];

/** Bounds, so a document cannot become a registry. */
export const PAGE_MAX_LINKS = 32;
export const PAGE_MAX_LINK_ID = 64;
export const PAGE_MAX_LINK_KEY = 96;

/**
 * The grammar of a link DECLARATION id, and of the reserved Markdown marker's id — the PLATFORM'S ONE slug
 * rule (`isContentSlug`, `@/core/page-content`) plus a length bound, never a second opinion about names.
 *
 * The marker is written inside Markdown (`[label](#link:<id>)`) and appears in a URL fragment, so the id
 * must be a slug: exactly what the page-slug authority already guarantees, and re-spelling the pattern
 * here would let the two drift. The declaration id and the marker id are the same string checked by the
 * same function, so a marker can never name an id the schema would refuse.
 *
 * An application KEY is a different thing: an OPAQUE identifier whose shape Foundation can check and
 * whose meaning it never interprets. Dots and hyphens are allowed because applications namespace keys
 * that way; nothing about the words themselves is Foundation's business.
 */
const PAGE_LINK_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/**
 * THE RESERVED MARKDOWN MARKER, spelled once.
 *
 * `#link:<id>` is a FRAGMENT — a destination Markdown already supports — so the marker adds no
 * scheme, no allowlist entry and no sanitiser protocol: `AUTHOR_ALLOWED_SCHEMES`,
 * `MARKDOWN_ALLOWED_SCHEMES` and the allowlist are untouched. It is reserved because it is
 * MEANINGLESS without a declaration and USELESS without a resolver: every path that meets it either
 * resolves it to an href the classifier accepted, or shows the author's words and no anchor. It can
 * never reach an `href` unresolved.
 */
export const PAGE_LINK_MARKER_PREFIX = "#link:";

/** True when `value` may be a link declaration id (the same slug rule, and the same length bound). */
export function isPageLinkId(value: string): boolean {
  return value.length > 0 && value.length <= PAGE_MAX_LINK_ID && isContentSlug(value);
}

/**
 * The declaration id a destination names, or `null` when it is an ordinary destination.
 *
 * This is the ONE reading of the reserved marker: the schema uses it to REFUSE a reserved `href`, the
 * renderer uses it to decide whether it may emit an anchor, and the Markdown adapter uses it to find
 * markers in its own token stream. A destination that merely starts with `#link` — `#link`, `#link:`,
 * `#LINK:x`, `#link:a_b`, `#link:a--b`, or an id longer than the bound — is NOT a marker and is
 * handled exactly as it always was (an ordinary fragment).
 */
export function parsePageLinkMarker(destination: string): string | null {
  if (!destination.startsWith(PAGE_LINK_MARKER_PREFIX)) return null;
  const id = destination.slice(PAGE_LINK_MARKER_PREFIX.length);
  return isPageLinkId(id) ? id : null;
}

/* `PageLinkReference` is DERIVED from its schema (`pageLinkReferenceSchema`, below), so the type and
 * the refusal for a document that names anything else cannot drift apart. */

/** A document's declarations: link id → reference. */
export type PageLinks = Readonly<Record<string, PageLinkReference>>;

/**
 * The host's answer for one reference, supplied as an ARGUMENT to a render.
 *
 * It returns an href the platform will classify, or `null` for “not offered to this caller” — the
 * only two answers this contract has. Absent, disabled, revoked, unauthorized and malformed are all
 * `null`: there is no third state, and no fallback destination exists anywhere.
 */
export type PageLinkResolver = (reference: PageLinkReference) => string | null;

/**
 * The RENDERER-FACING half of the same contract: an id → a destination, or `null`.
 *
 * The composition binds the two halves once per render (`resolvePageLink` + the declarations), and the
 * Markdown renderer and the action renderer consume THIS shape. It lives in `@/core` rather than in the
 * renderer so presentation code can name the contract without importing an adapter — the boundary the
 * architecture guards enforce.
 */
export type PageLinkIdResolver = (linkId: string) => string | null;

/**
 * Resolve one declared link for THIS render, or `null`.
 *
 * `null` covers every refusal for one reason: no declaration for `linkId`, no resolver (no host
 * wiring), a resolver that throws, a resolver that answers nothing, an answer that is itself a
 * reserved marker (no chained resolution), or an answer the existing classifier refuses. A caller
 * cannot tell those apart, and must not: an unauthorized destination simply does not exist.
 *
 * This is a PURE LOOKUP. It builds no URL, performs no authorization, reads no filesystem and
 * imports no adapter, so it cannot invent a destination — it only decides whether the host's answer
 * may be shown.
 */
export function resolvePageLink(
  links: PageLinks | undefined,
  linkId: string,
  resolve: PageLinkResolver | undefined,
): string | null {
  if (links === undefined || resolve === undefined) return null;
  if (!Object.prototype.hasOwnProperty.call(links, linkId)) return null;
  const reference = links[linkId];
  if (reference === undefined) return null;

  let answer: string | null;
  try {
    answer = resolve(reference);
  } catch {
    // A host resolver that fails is a host that offers nothing — never an exception into a page render.
    return null;
  }
  if (typeof answer !== "string" || answer.length === 0) return null;
  // NO CHAINED RESOLUTION: a resolver may not answer with another marker.
  if (parsePageLinkMarker(answer) !== null) return null;

  const verdict = classifyAuthorUrl(answer);
  return verdict.ok ? verdict.href : null;
}

/**
 * WHICH FIELDS ARE MARKDOWN — declared once, as data, so the guide, the schema and the
 * renderer cannot disagree. Every field named here is rendered by the SAME safe
 * Markdown renderer the Markdown authoring mode uses (`@/adapters/markdown/safe-markdown`
 * through `SafeMarkdownContent`): raw HTML in a JSON page is inert for exactly the same
 * reason it is inert in a Markdown page, and unsafe destinations fail closed by the
 * same policy (`@/core/safe-url`). No second renderer, no second policy.
 */
export const PAGE_MARKDOWN_FIELDS: readonly string[] = [
  "prose.body",
  "callout.body",
  "cards.items[].body",
  "features.items[].body",
  "columns.items[].body",
  "steps.items[].body",
  "faq.items[].answer",
  "list.items[].detail",
  "quote.body",
  "hero.lede",
  "hero.support",
  "media.caption",
  "gallery.items[].caption",
  "table.caption",
  "section.lede",
];

/**
 * THE HEADING OUTLINE — one unambiguous contract, declared as data.
 *
 * A page has exactly ONE level-1 heading: its `title`, rendered by the page renderer
 * (exactly as the Markdown mode's page title is). A section heading is level 2 and an
 * item title is level 3. No field selects a level, so no document can produce a second
 * h1, a skipped level or an unordered outline.
 */
export const PAGE_HEADING_LEVELS = {
  page: 1,
  section: 2,
  item: 3,
} as const;

const enumMessage = (values: readonly (string | number)[]): string =>
  `must be one of: ${values.join(", ")}`;

/** A Markdown field: rendered by the safe Markdown renderer, never as raw HTML. */
const markdownTextSchema = z.string().trim().min(1).max(PAGE_MAX_TEXT);

const headingSchema = z.string().trim().min(1).max(PAGE_MAX_HEADING);
const labelSchema = z.string().trim().min(1).max(PAGE_MAX_LABEL);
const captionSchema = z.string().trim().min(1).max(PAGE_MAX_CAPTION);
/** A table cell stays PLAIN TEXT: it is emitted into `<td>`/`<th>`, never parsed. */
const cellSchema = z.string().trim().min(1).max(PAGE_MAX_CELL);

const headingFields = {
  heading: headingSchema.optional(),
  lede: markdownTextSchema.optional(),
};

const surfaceField = {
  surface: z.enum(PAGE_SECTION_SURFACES, { message: enumMessage(PAGE_SECTION_SURFACES) }).optional(),
};

const alignField = {
  align: z.enum(PAGE_ALIGNMENTS, { message: enumMessage(PAGE_ALIGNMENTS) }).optional(),
};

const itemColumnsField = {
  columns: z
    .union([z.literal(2), z.literal(3), z.literal(4)], { message: enumMessage(PAGE_ITEM_COLUMNS) })
    .optional(),
};

/**
 * A destination this platform has classified (`@/core/safe-url`): a same-site path, a
 * fragment, a relative reference, or http/https/mailto/tel. Everything else — and every
 * executable scheme — is refused while the file is being read, so a page can never
 * publish a destination an author did not intend.
 */
const destinationSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => classifyAuthorUrl(value).ok, {
    message:
      "must be a same-site path (e.g. /contact), a fragment, or an http, https, mailto or tel destination",
  })
  /**
   * THE RESERVED MARKER IS NOT A DESTINATION (A8 Phase F, condition 3).
   *
   * `#link:<id>` is a fragment, so the classifier above ACCEPTS it — which is exactly why it must be
   * refused here: a resolved href may only ever come from the declaration → resolver path, never from
   * an author writing the marker into a field that is emitted straight into an `href`. This is the ONE
   * place the refusal is stated, so every destination position (an action's `href`, a list item's
   * `href`) inherits it and none can bypass resolution.
   */
  .refine((value) => parsePageLinkMarker(value) === null, {
    message:
      'must not use the reserved "#link:" marker as a destination: declare the link under "links" and refer to it with "link"',
  });

/** Another page OF THIS SITE, named by its route path (locale is added when rendered). */
const routeTargetSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isPageRoutePath, {
    message: 'must be a page route path, e.g. "services" or "services/web-design"',
  });

/**
 * An asset reference: a same-site path (the platform convention is `/assets/<file>`,
 * which is what the site owner edits and what `pnpm assets:sync` mirrors) or an
 * absolute http(s) URL. There is no second asset subsystem for JSON pages.
 */
const assetReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => {
      const verdict = classifyAuthorUrl(value);
      if (!verdict.ok) return false;
      return verdict.href.startsWith("/") || /^https?:\/\//i.test(verdict.href);
    },
    {
      message:
        "must be a same-site asset path (e.g. /assets/photo.png) or an absolute http(s) URL",
    },
  );

/**
 * An image. Accessibility is not optional and not a matter of memory: an image either
 * DESCRIBES something (`alt`) or declares itself decorative (`"decorative": true`) —
 * and the two are mutually exclusive, so an author cannot satisfy the schema while
 * leaving a screen-reader user with an unnamed picture.
 */
const imageSchema = z
  .strictObject({
    src: assetReferenceSchema,
    alt: captionSchema.optional(),
    decorative: z.boolean().optional(),
  })
  .refine((image) => image.decorative === true || (image.alt !== undefined && image.alt.length > 0), {
    message:
      'needs "alt" text describing the image, or "decorative": true when the image conveys nothing',
    path: ["alt"],
  })
  .refine((image) => image.decorative !== true || image.alt === undefined || image.alt.length === 0, {
    message: '"decorative": true means the image conveys nothing, so it cannot also carry alt text',
    path: ["alt"],
  });

/**
 * A LINK DECLARATION id: the key an action's `link` and a Markdown marker name, checked by the SAME
 * grammar the marker parses (`isPageLinkId`), so the two can never disagree.
 */
const linkIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_MAX_LINK_ID)
  .refine(isPageLinkId, {
    message:
      'must be lowercase words joined by single hyphens (e.g. "quotation-email"), at most 64 characters',
  });

/**
 * ONE DECLARED REFERENCE (A8 Phase F). A closed `reference` kind and an OPAQUE `key`.
 *
 * `strictObject` refuses an unknown property, and the enum refuses a kind this platform does not
 * declare — so a document cannot invent a resolution AUTHORITY by naming one. The `key` is shape-only
 * checked: Foundation does not know, and must not learn, what an application does with it.
 */
export const pageLinkReferenceSchema = z.strictObject({
  reference: z.enum(PAGE_LINK_REFERENCE_KINDS, {
    message: enumMessage(PAGE_LINK_REFERENCE_KINDS),
  }),
  key: z
    .string()
    .trim()
    .min(1)
    .max(PAGE_MAX_LINK_KEY)
    .refine((value) => PAGE_LINK_KEY_PATTERN.test(value), {
      message:
        'must be an opaque application key: lowercase words separated by "." or "-" (e.g. "public-contact-email"), at most 96 characters',
    }),
});

export type PageLinkReference = z.infer<typeof pageLinkReferenceSchema>;

/**
 * A DOCUMENT'S DECLARATIONS: link id → reference. Optional and additive, which is why the envelope
 * version does not move: a document that declares no `links` behaves exactly as it did before the
 * capability existed.
 */
const linksSchema = z
  .record(linkIdSchema, pageLinkReferenceSchema)
  .refine((value) => Object.keys(value).length <= PAGE_MAX_LINKS, {
    message: `may declare at most ${PAGE_MAX_LINKS} links`,
  });

/**
 * AN ACTION — a label and a destination, and nothing else. There is no event handler,
 * no callback and no author-supplied behaviour: a link is a link. Exactly ONE
 * destination form is set: `href` (classified by `@/core/safe-url`), `route` (another
 * page of this site, resolved against the visitor's locale when rendered), or `link`
 * (a declaration resolved by the host application — A8 Phase F). The three are mutually
 * exclusive, so an action can never carry two competing answers about where it goes.
 */
const actionSchema = z
  .strictObject({
    label: labelSchema,
    href: destinationSchema.optional(),
    route: routeTargetSchema.optional(),
    link: linkIdSchema.optional(),
    variant: z
      .enum(PAGE_ACTION_VARIANTS, { message: enumMessage(PAGE_ACTION_VARIANTS) })
      .optional(),
  })
  .refine(
    (action) =>
      [action.href, action.route, action.link].filter((form) => form !== undefined).length === 1,
    {
      message:
        'must set exactly one of "href" (a destination), "route" (another page of this site) or "link" (a declared application link)',
    },
  );

const actionsSchema = z.array(actionSchema).min(1).max(PAGE_MAX_ACTIONS);

/** A list entry: a plain label, or a label with detail text and an optional destination. */
const listItemSchema = z
  .strictObject({
    label: labelSchema,
    detail: markdownTextSchema.optional(),
    href: destinationSchema.optional(),
    route: routeTargetSchema.optional(),
  })
  .refine((item) => item.href === undefined || item.route === undefined, {
    message: 'may set "href" or "route", not both',
  });

const listItemsSchema = z
  .array(z.union([labelSchema, listItemSchema]))
  .min(1)
  .max(PAGE_MAX_ITEMS);

/** A card: title, optional Markdown body, optional image, optional short meta line. */
const cardItemSchema = z.strictObject({
  title: headingSchema,
  body: markdownTextSchema.optional(),
  image: imageSchema.optional(),
  meta: labelSchema.optional(),
  action: actionSchema.optional(),
});

/** A feature: the same as a card minus media/meta, with an optional decorative icon. */
const featureItemSchema = z.strictObject({
  title: headingSchema,
  body: markdownTextSchema.optional(),
  icon: assetReferenceSchema.optional(),
});

/**
 * A column: EITHER a Markdown body OR a short plain list, never both and never a nested
 * section — the explicit boundary that keeps this vocabulary a page, not a component
 * tree.
 */
const columnItemSchema = z
  .strictObject({
    title: headingSchema,
    body: markdownTextSchema.optional(),
    items: z.array(labelSchema).min(1).max(PAGE_MAX_ITEMS).optional(),
  })
  .refine((column) => (column.body === undefined) !== (column.items === undefined), {
    message:
      'must set exactly one of "body" (Markdown) or "items" (a short list); a column holds no nested sections',
  });

const stepItemSchema = z.strictObject({
  title: headingSchema,
  body: markdownTextSchema.optional(),
});

const statItemSchema = z.strictObject({
  value: labelSchema,
  label: labelSchema,
  detail: markdownTextSchema.optional(),
});

const faqItemSchema = z.strictObject({
  question: headingSchema,
  answer: markdownTextSchema,
});

const galleryItemSchema = z.strictObject({
  image: imageSchema,
  caption: markdownTextSchema.optional(),
});

const itemsOf = <T extends z.ZodTypeAny>(item: T, max = PAGE_MAX_ITEMS) =>
  z.array(item).min(1).max(max);

/** A table row must fill the declared columns exactly — a ragged row fails loudly. */
const tableRowsSchema = z
  .array(z.array(cellSchema).min(1).max(PAGE_MAX_COLUMNS))
  .min(1)
  .max(PAGE_MAX_TABLE_ROWS);

export type PageAction = z.infer<typeof actionSchema>;
export type PageImage = z.infer<typeof imageSchema>;

/**
 * THE SECTION VOCABULARY. Each member declares its `type` as a literal, so the union
 * below is discriminated on it and a validation error can name the exact section and
 * property that is wrong. Every member is STRICT: an undeclared property is refused.
 */
const heroSectionSchema = z.strictObject({
  type: z.literal("hero"),
  eyebrow: labelSchema.optional(),
  lede: markdownTextSchema.optional(),
  actions: actionsSchema.optional(),
  support: markdownTextSchema.optional(),
  ...alignField,
  ...surfaceField,
});

const proseSectionSchema = z.strictObject({
  type: z.literal("prose"),
  ...headingFields,
  body: markdownTextSchema,
  ...alignField,
  ...surfaceField,
});

const mediaSectionSchema = z.strictObject({
  type: z.literal("media"),
  ...headingFields,
  image: imageSchema,
  caption: markdownTextSchema.optional(),
  position: z
    .enum(PAGE_MEDIA_POSITIONS, { message: enumMessage(PAGE_MEDIA_POSITIONS) })
    .optional(),
  ...surfaceField,
});

const gallerySectionSchema = z.strictObject({
  type: z.literal("gallery"),
  ...headingFields,
  items: itemsOf(galleryItemSchema),
  ...itemColumnsField,
  ...surfaceField,
});

const actionsSectionSchema = z.strictObject({
  type: z.literal("actions"),
  ...headingFields,
  actions: actionsSchema,
  ...alignField,
  ...surfaceField,
});

const calloutSectionSchema = z.strictObject({
  type: z.literal("callout"),
  ...headingFields,
  body: markdownTextSchema,
  tone: z.enum(PAGE_CALLOUT_TONES, { message: enumMessage(PAGE_CALLOUT_TONES) }).optional(),
  ...alignField,
  ...surfaceField,
});

const cardsSectionSchema = z.strictObject({
  type: z.literal("cards"),
  ...headingFields,
  items: itemsOf(cardItemSchema),
  ...itemColumnsField,
  ...surfaceField,
});

const featuresSectionSchema = z.strictObject({
  type: z.literal("features"),
  ...headingFields,
  items: itemsOf(featureItemSchema),
  ...itemColumnsField,
  ...surfaceField,
});

const columnsSectionSchema = z.strictObject({
  type: z.literal("columns"),
  ...headingFields,
  items: z.array(columnItemSchema).min(2).max(3),
  ratio: z
    .enum(["equal", "start-wide", "end-wide"], {
      message: enumMessage(["equal", "start-wide", "end-wide"]),
    })
    .optional(),
  ...surfaceField,
});

const stepsSectionSchema = z.strictObject({
  type: z.literal("steps"),
  ...headingFields,
  items: itemsOf(stepItemSchema, 12),
  ...surfaceField,
});

const statsSectionSchema = z.strictObject({
  type: z.literal("stats"),
  ...headingFields,
  items: itemsOf(statItemSchema, PAGE_MAX_STATS),
  ...surfaceField,
});

const quoteSectionSchema = z.strictObject({
  type: z.literal("quote"),
  body: markdownTextSchema,
  attribution: labelSchema.optional(),
  role: labelSchema.optional(),
  ...alignField,
  ...surfaceField,
});

const tableSectionSchema = z
  .strictObject({
    type: z.literal("table"),
    ...headingFields,
    columns: z.array(labelSchema).min(1).max(PAGE_MAX_COLUMNS),
    rows: tableRowsSchema,
    caption: markdownTextSchema.optional(),
    ...surfaceField,
  })
  .refine((table) => table.rows.every((row) => row.length === table.columns.length), {
    message: "every row must have exactly one cell per declared column",
    path: ["rows"],
  });

const faqSectionSchema = z.strictObject({
  type: z.literal("faq"),
  ...headingFields,
  items: itemsOf(faqItemSchema),
  ...surfaceField,
});

const listSectionSchema = z.strictObject({
  type: z.literal("list"),
  ...headingFields,
  items: listItemsSchema,
  ordered: z.boolean().optional(),
  ...surfaceField,
});

/** A divider is a pure structural break: it carries nothing but its own type. */
const dividerSectionSchema = z.strictObject({ type: z.literal("divider") });

export const pageSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  proseSectionSchema,
  mediaSectionSchema,
  gallerySectionSchema,
  actionsSectionSchema,
  calloutSectionSchema,
  cardsSectionSchema,
  featuresSectionSchema,
  columnsSectionSchema,
  stepsSectionSchema,
  statsSectionSchema,
  quoteSectionSchema,
  tableSectionSchema,
  faqSectionSchema,
  listSectionSchema,
  dividerSectionSchema,
]);

export type PageSection = z.infer<typeof pageSectionSchema>;

/**
 * THE PAGE ENVELOPE. `schemaVersion` is explicit and singular: a document naming
 * another version is refused rather than reinterpreted, so a future document can never
 * be half-understood today. `title` is required (it is the page's identity, its
 * metadata title and its ONE h1) and `description` is the optional summary the page's
 * metadata uses when the author supplies one.
 */
export const pageDocumentSchema = z.strictObject({
  schemaVersion: z.literal(PAGE_DOCUMENT_SCHEMA_VERSION, {
    message: `must be the supported schema version ${PAGE_DOCUMENT_SCHEMA_VERSION}`,
  }),
  title: headingSchema,
  description: z.string().trim().min(1).max(PAGE_MAX_TEXT).optional(),
  /**
   * HOW THIS PAGE IS PUBLISHED (TEMPLATE-PV-A1). Absent → `public` (`PAGE_DEFAULT_VISIBILITY`), which is
   * every document authored before this property existed — the reason the envelope version does not move.
   * A value outside the vocabulary is REFUSED, and the refusal names the words this platform understands
   * rather than guessing at the author's intent.
   */
  visibility: z
    .enum(PAGE_VISIBILITIES, { message: enumMessage(PAGE_VISIBILITIES) })
    .optional(),
  /**
   * THE DOCUMENT'S APPLICATION-LINK DECLARATIONS (A8 Phase F). Absent → the document declares no
   * application links, which is every document authored before this capability existed: the property is
   * ADDITIVE and OPTIONAL, which is why the envelope version does not move.
   *
   * A declaration is only ever a REFERENCE. It names no address, no scheme and no provider, so the same
   * document serves every host: the application supplies the destination at render time, and when it
   * supplies none the author's words are shown without an anchor.
   */
  links: linksSchema.optional(),
  sections: z.array(pageSectionSchema).max(PAGE_MAX_SECTIONS),
});

export type PageDocument = z.infer<typeof pageDocumentSchema>;

/**
 * The visibility a VALIDATED document declares, or the default when it declares none. The ONE reading of the
 * property: consumers ask this rather than re-spelling `document.visibility ?? …`, so "no marker means public"
 * is decided in exactly one place.
 */
export function pageVisibilityOf(document: PageDocument): PageVisibility {
  return document.visibility ?? PAGE_DEFAULT_VISIBILITY;
}

/**
 * True when a document publishes itself as `unlisted`: reachable at its exact URL, absent from ordinary
 * discovery. Consumers ask THIS question rather than comparing the value themselves, so the vocabulary and the
 * comparison cannot drift apart.
 */
export function isUnlistedPage(document: PageDocument): boolean {
  return pageVisibilityOf(document) === "unlisted";
}

/** One Markdown field of a validated document: where it is, and the text an author wrote there. */
export interface PageMarkdownField {
  /** A precise, greppable path — `sections[2].items[0].body` — the same form an issue uses. */
  readonly path: string;
  /** The section type the field belongs to, so a caller can say what KIND of field it is. */
  readonly type: PageSectionType;
  /** Exactly the authored Markdown. */
  readonly text: string;
}

/**
 * EVERY MARKDOWN FIELD OF A VALIDATED DOCUMENT, in authoring order.
 *
 * Driven by `PAGE_MARKDOWN_FIELDS` — the one declaration of which fields are Markdown — rather than by
 * a second list, so a caller that has to inspect authored Markdown (the JSON reader does, to report a
 * reserved marker declared nowhere) sees exactly the fields the renderer will parse. `section.lede`
 * is the one pseudo-type: it applies to every section that carries a `lede`.
 *
 * It is a pure read of a value the schema already accepted: it validates nothing and resolves nothing.
 */
export function pageMarkdownFields(document: PageDocument): readonly PageMarkdownField[] {
  // Keyed by PATH: `section.lede` is a pseudo-type that matches every section, so a section that also
  // declares its own `lede` field would otherwise be reported twice. One field is one field.
  const found = new Map<string, PageMarkdownField>();

  for (const declaration of PAGE_MARKDOWN_FIELDS) {
    const [typeWord, ...rest] = declaration.split(".");
    const directField = rest.length === 1 ? rest[0] : undefined;
    const itemField = rest.length === 2 && rest[0] === "items[]" ? rest[1] : undefined;
    if (directField === undefined && itemField === undefined) continue;

    document.sections.forEach((section, index) => {
      if (typeWord !== "section" && section.type !== typeWord) return;
      const record = section as unknown as Record<string, unknown>;

      if (directField !== undefined) {
        const value = record[directField];
        if (typeof value === "string" && value.length > 0) {
          const fieldPath = `sections[${index}].${directField}`;
          found.set(fieldPath, { path: fieldPath, type: section.type, text: value });
        }
        return;
      }

      const items = record.items;
      if (!Array.isArray(items)) return;
      items.forEach((item, itemIndex) => {
        if (typeof item !== "object" || item === null) return;
        const value = (item as Record<string, unknown>)[itemField as string];
        if (typeof value === "string" && value.length > 0) {
          const fieldPath = `sections[${index}].items[${itemIndex}].${itemField as string}`;
          found.set(fieldPath, { path: fieldPath, type: section.type, text: value });
        }
      });
    });
  }

  return [...found.values()];
}

/**
 * THE RESERVED ROOT DOCUMENT MAY NOT BE UNLISTED (TEMPLATE-PV-A1)
 * =============================================================
 *
 * `unlisted` means "reachable at this exact URL and advertised nowhere". The RESERVED home document has no URL
 * of its own to be reached at: it is SERVED by the locale ROOT (`/<site>/<locale>`), which is a Site's own
 * identity URL — the URL every sitemap leads with and `robots.txt` points at. So the combination is not a
 * narrower kind of publication, it is a contradiction:
 *
 *   · the root URL cannot be hidden — a sitemap leads with it, and a `noindex` root would tell a crawler to
 *     keep out of the Site it was just sent to while every OTHER URL of that Site stays advertised; and
 *   · silently honouring either half would be a lie about what the author wrote.
 *
 * The document is therefore REFUSED, by name, exactly as any other unhonourable document is:
 * `@/adapters/content/json-page` reports it, so the author is told which file and which property to change
 * rather than being served something they did not write.
 *
 * The rule is deliberately NARROW: it is the reserved `home` route path alone — a page merely NAMED `home`
 * inside a folder (`offerings/home`) has its own URL and may be `unlisted` freely. A Markdown document has no
 * visibility vocabulary at all, so it cannot reach this state.
 *
 * Returns the refusal sentence, or `null` when the document is acceptable for the route it is authored at.
 */
export function reservedHomeVisibilityIssue(
  document: PageDocument,
  routePath: string,
): string | null {
  if (routePath !== HOME_CONTENT_SLUG || !isUnlistedPage(document)) return null;

  return (
    `"visibility": "unlisted" is refused on the reserved "${HOME_CONTENT_SLUG}" document: that document is ` +
    "served at the locale root, which is the Site's own identity URL and is always published, so it cannot be " +
    "hidden from discovery. Leave this document public, or mark an ordinary page (which has its own URL) " +
    'as "unlisted" instead.'
  );
}

/** `sections[2].items[0].alt` — a precise, greppable place for an author to look. */
export function formatPageDocumentIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(document)";
  let rendered = "";
  for (const segment of path) {
    if (typeof segment === "number") rendered += `[${segment}]`;
    else rendered += rendered.length === 0 ? String(segment) : `.${String(segment)}`;
  }
  return rendered;
}

/**
 * Every issue the schema found, one per line, each with its path. The reader
 * (`@/adapters/content/json-page`) adds the file name, so a bad document reports
 * "which file, which property, what was wrong and what was expected".
 */
export function describePageDocumentIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${formatPageDocumentIssuePath(issue.path)}: ${issue.message}`)
    .join("\n");
}


