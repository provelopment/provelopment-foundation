# Content Management — business content ownership

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-10-22.1`
> **Content model described:** the **current EFS installation model** — one immutable Foundation release established into one autonomous Installation that owns its authored capsule and serves explicitly declared Entities, Facets, Sites, Pages and localized representations through publication bindings owned by declared Spokes. Pages are language-neutral; each localized representation is a JSON or Markdown source; JSON visibility is per representation; `unlisted` means reachable but not advertised, never private. Update changes authored material; Upgrade adopts a different immutable release. Legacy country-coded Sites, regional pages, Location routing and computed timezone/DST behavior are historical only.
> **Procedure validation:** the release and establishment procedures retain their 2026-09-30 end-to-end baseline. Revision `2026-10-22.1` reconciles the distributed model to the merged EFS runtime and the A1-R2F receiver-key isolation, reference and hygiene correction, and the A1-R2F-C1 injective identified-Hub receiver-key correction, and is verified by the Foundation unit, integration, architecture, deployment and browser gates recorded in `FOUNDATION-COMPLETE-A1-R2F` (including its C1 correction record); no release tag is claimed by this revision.
> **Adopter baseline:** the installation's own adoption record — `deployment/foundation-baseline.json` inside the installation's capsule. An adopter's own governance record is the adopter's; it is never the Foundation's adoption record.
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed** and byte-identical to the master revision above — SHA-256
> verified at propagation — and is never edited in place: edit the master upstream and
> propagate.

## Ownership

> **Actual business content is adopter-owned.** The platform supplies structure,
> validation and rendering; it never supplies a business's words or pictures.

An ordinary change you make to your own content is an **Update**: the pages and/or assets change, the
Foundation **release does not**. Editing a page is never a Foundation **Upgrade** — that adopts a
different immutable release for the whole Installation (`foundation-upgrade.md`). No page edit can
move the platform, and none of the procedures in this manual changes a release.

Placing platform material must never overwrite adopter content. In an installation,
establishment copies your authored material verbatim and never overwrites or deletes, and a
newer release is obtained as an immutable payload rather than copied over a project's tree.
If your own tooling would overwrite it, that is that tooling's defect (see `troubleshooting.md`).

## CURRENT EFS CONTENT MODEL

This section is authoritative for the merged production runtime. The country-code/Site/Location
material after it describes the retained legacy test runtime and historical releases; it is not an
EFS authoring procedure.

### Ownership tree and source location

```text
Entity → Facet → Site → Page → localized representation
```

Page sources are owner-scoped inside the EFS capsule:

```text
deployment/efs/capsule/<entityId>/<facetId>/<siteId>/
├── pages/<pageId>/<locale>.md
├── pages/<pageId>/<locale>.json
├── dictionaries/<locale>.json
└── assets/**
```

Example:

```text
deployment/efs/capsule/e_00000000000000000000000001/foundation/main/pages/about/en.md
→ https://foundation-template.provelopment.com/ww/en/about
```

The SiteID is `main`; `ww` is the publication binding's path prefix. A prefix is not a country,
a Site, a language or an ownership identity.

### Two declarations are required

A Page is served only when:

1. `deployment/efs/manifest.json` declares the Page, its route, representations, optional fallback
   and optional properties in the correct Entity/Facet/Site; and
2. a validated source exists for every declared representation.

The manifest `id` is language-neutral. The source filename is the locale path key. A declared
representation with no source, an undeclared source, a duplicate Page ID/route or a malformed
document is refused.

JSON is the higher-precedence representation when both `.json` and `.md` exist. JSON is validated
against `src/core/page-document.ts`; invalid JSON stops the request/publication with the source and
property named and is never rendered as generic fallback content.

### Visibility

Visibility is a fact of each localized JSON Page document:

- absent ⇒ public;
- `"visibility": "unlisted"` ⇒ reachable at its exact URL, `noindex, nofollow`, absent from the
  sitemap, generated navigation, `hreflang` and `x-default`;
- public and unlisted representations of one Page are independent;
- missing-translation fallback never redirects to an unlisted representation;
- the reserved Home document may not be unlisted;
- Markdown has no visibility vocabulary — a `visibility` front-matter key is refused;
- **unlisted is not private and is not access control.**

The manifest has no Page-level visibility field. One effective representation has one decision.

### Publication and presentation

`deployment/efs/manifest.json` owns publication: `spokeId`, optional `spokeHubId`, Entity, Facet,
host, prefix, Site set/mode, locales, default locale and canonical/alias role. `deployment/spokes.json`
owns the Spoke hierarchy. Ownership is never inferred from a name or hostname.

Canonical URLs, alternates, Open Graph URLs, assets and sitemap entries come from the effective
canonical binding. `site.url` is optional and informational; a host change is a binding change, not
a new Entity identity.

A publication may name `presentationSiteCode` to use its owning Spoke's approved shell. The EFS
Page remains the content authority.

### Geographic and time boundaries

EFS does not infer geography or language from IDs, names, routes, Spokes or prefixes. It does not
derive timezone or currency, compute “open now”, perform DST scheduling or route by location.
Authored place/address/contact/opening-hours facts are optional properties, not routing or
computation.


> **LEGACY RUNTIME — NOT EFS.** The folder/addressing rules and the country/Site/Location
> vocabulary in this section describe the retained legacy test runtime and historical releases. Do
> not use those paths or selectors to author an EFS Installation. The Markdown/JSON syntax that
> follows the vocabulary remains applicable; only its file location changes to the EFS capsule
> shown above.

## Where website content lives

Everything an author writes or uploads lives in **one content area**:

```text
content/
├── pages/               ← every page of the website
│   ├── markdown/        ←   the simple mode: ordinary text files
│   │   └── <site>/<language>/<page>.md
│   └── json/            ←   the advanced mode: structured, declarative data
│       └── <site>/<language>/<page>.json
└── assets/              ← the artwork the site shows: logo, favicon, images, icons
                            (shared by every site; see branding-and-assets.md)
```

> **If authored content has its own URL, it is a page.**

A page is not registered anywhere, listed anywhere or switched on by a flag: it exists
because its file exists, and it appears in the site's sitemap as soon as it is committed
and pushed.

Content that only ever appears **inside** another page — a customer quote, a card, a
statistics row, an FAQ row — has no URL of its own, so it is written *in* that page.

### Folders are the address

A page's URL is built from the folders it is authored in, and the folders *are* the
model — **authoring mode → site → language → page**:

```text
content/pages/markdown/ca/en/about.md      →  /ca/en/about
content/pages/markdown/ca/fr/about.md      →  /ca/fr/about
content/pages/markdown/fr/fr/about.md      →  /fr/fr/about
```

A page's identity is **site + locale path key + route path**, so the same page name in two
sites is two different pages. A section is a folder, a listing is a page, and the items are
pages inside that folder. Folders may be up to four deep, and every folder and file name
follows the same rule as a page name (lowercase words joined by hyphens), so a URL is always
readable and always predictable.

```text
content/pages/markdown/ca/en/services.md                →  /ca/en/services
content/pages/markdown/ca/en/services/web-design.md     →  /ca/en/services/web-design
content/pages/markdown/ca/en/legal/privacy.md           →  /ca/en/legal/privacy
```

Another language mirrors the structure exactly, so a translated section keeps the same page
names under its own language — and **every site owns its own tree**:

```text
content/pages/markdown/ca/en/services/web-design.md     →  /ca/en/services/web-design
content/pages/markdown/ca/fr/services/web-design.md     →  /ca/fr/services/web-design
content/pages/markdown/fr/fr/services/web-design.md     →  /fr/fr/services/web-design
```

An **empty language folder publishes nothing** — it prepares a language and creates no
route; and a page with no translation in the visitor's language falls back to **that site's**
default language rather than erroring. Fallback never crosses sites.

### Sites: one country/global context each

A **Spoke** is the website/domain context — selected by hostname, owning its own `site.config.json`,
dictionaries, content tree and assets. Inside it, a **Site** is the country/global context with its **own page tree, its own
languages and its own page-facing configuration** (see `site-customization.md`, *Per-site configuration*). A Site folder name is a **recognized
lowercase two-letter country code** (`ca`, `fr`, `ch`, `de`, …). Foundation validates it, and
arbitrary names such as `main`, `canada` or `my-office` are **not** valid site codes.

| Site folder | Meaning |
| --- | --- |
| a country code (`ca`, `fr`, `ch`, …) | that country's site |
| `ww` | **Worldwide / Global** — Foundation-defined, and **not** an ISO country code |

The maintained, validated list of every country code ships with the product:
`content/COUNTRY-CODES.md`. Use that file as the reference — this manual states the concept
and the examples, it does not keep a second list.

> **A missing page in one Site is NEVER satisfied from another Site**, merely because the
> language or the route matches. Canada French and France French belong to different Sites:
> each answers only from its own tree, so one country can never publish another's page.

### Spokes, Sites and Locations are different things

```text
another independent website/domain              →  another SPOKE
another country/global context in that website  →  another SITE
the same page tree, another office/city/region  →  another LOCATION
```

Canada and France may be **Sites inside one Spoke** when one website intentionally exposes both
country contexts — and each is a **Spoke** (or a separate Installation, per lifecycle ownership) when
it is a separately hosted, owned or upgraded website. **Toronto, Montreal and Vancouver are
Locations inside one of those Sites**. Another physical office is not a reason to create a Site: a
Site is another country/global context **inside** the same website, and a Location changes context
*inside* one Site.


### Which page answers a request

Inside one site — and only inside it — the answer is decided in this order:

1. the **exact-language JSON** page;
2. the **exact-language Markdown** page;
3. the **site default-language JSON** page, when that site's configured fallback permits;
4. the **site default-language Markdown** page;
5. **not found** — the site's own 404 page.

Two rules never bend: **JSON wins over Markdown** for the same language and route, and an
**exact language wins over the site default**. Fallback is bounded to the site, so steps 3
and 4 can only ever read that site's own default language.

### The four independent visitor dimensions

| Dimension | What it selects | Changes the Site? |
| --- | --- | --- |
| **Site** | the country/global context **inside the active website/Spoke** (its own pages, languages, locations) | yes — a different Site |
| **Language** | the locale **inside** the current Site | no |
| **Location** | a physical/regional context inside the Site (office, city, region) | no |
| **Layout** | Sidebar or Menu-bar presentation | no — presentation only |

The hostname-selected **Spoke** is not one of these controls: it is the website the visitor reached,
and a Site control appears only when that Spoke itself declares more than one Site.
The four are independent: changing language never changes Site, and changing location or
layout never changes which pages exist. A control a deployment does not need simply **does
not appear** — a single-language, single-location Site shows no language or location
control at all.

### Authoring modes — simple and advanced

Foundation ships exactly **two** page-authoring modes, and both live under
`content/pages/`:

| Mode | For | A page goes in |
| --- | --- | --- |
| **Markdown** — the simple mode | an ordinary, non-technical author; no programming knowledge is needed | `content/pages/markdown/<site>/<language>/<page>.md` |
| **JSON** — the advanced, declarative mode | an advanced author or developer who needs page composition Markdown cannot express | `content/pages/json/<site>/<language>/<page>.json` |

- **Markdown is a complete, ordinary authoring mode.** It supports headings, paragraphs,
  bold and italic, bullet and numbered lists, quotations, links, images, **tables**,
  code and **heading fragment links** (`# Opening hours` gains `#opening-hours`, so an
  author can build a table of contents). Raw HTML you type is shown as text, and an
  unsafe link keeps its words but loses its destination — deliberate safety, not a
  missing feature.
- **The page title is the page's only level-1 heading.** Headings you write inside a page are
  placed underneath it automatically, so `#` is still how you write a section: you never have
  to start at `##`, and no heading is removed or turned into plain text.

The page title — `title:` in the frontmatter, or else your page's first `#` heading, or else
readable words from the file name — is the only main heading, and every heading you write
sits below it:

| You write in Markdown | It is rendered as |
| --- | --- |
| `# Services` | level 2 (`<h2>`) |
| `## Website design` | level 3 (`<h3>`) |
| `### Card layouts` | level 4 (`<h4>`) |
| `#### Details` | level 5 (`<h5>`) |
| `##### Fine print` | level 6 (`<h6>`) |
| `###### Footnotes` | level 6 (`<h6>` — the deepest heading HTML has) |

A fragment link such as `[hours](#opening-hours)` keeps working, because the address is made
from the heading's words and not from its level.
- **JSON is declarative data, never a program.** No scripts, no expressions, no imports,
  no JSX, no component names, no event handlers and no raw HTML; its power comes from a
  **validated vocabulary** of page-building sections the platform itself renders. That
  vocabulary is **delivered** — see *The advanced mode: the delivered JSON vocabulary*
  below, and `content/pages/json/README.md` for every field.

A JSON page takes precedence over a Markdown page for the same language and route, and both
modes resolve in the same order — the requested language first, then **that site's** default
language. The full order is stated under *Which page answers a request* above, and a site
never reads another site's tree.

### The advanced mode: the delivered JSON vocabulary

A JSON page is **one JSON object per page**: an envelope plus an ordered list of sections.
One file describes one page.

```json
{
  "schemaVersion": 1,
  "title": "Opening hours",
  "description": "When we are open, including public holidays.",
  "sections": [
    { "type": "prose", "body": "We are open **Monday to Friday**, 9:00–17:00." }
  ]
}
```

- **`schemaVersion`** is required and names the format version the file is written
  against (currently `1`). An unsupported number is refused rather than half-understood.
- **`title`** is required. It is the page's identity, its metadata title **and the only
  level-1 heading on the page**.
- **`description`** is optional; without one, the site's own configured description
  applies.
- **`sections`** is required, ordered, may be empty (a title-only page), and is bounded
  (40 sections).

- **`links`** is optional and declares a link your **application** supplies when the page renders. Each entry
  maps a declaration id (lowercase words joined by single hyphens) to one reference:
  `{ "reference": "applicationLink", "key": "<opaque name your application understands>" }`. `reference` is a
  closed set - today exactly `applicationLink` - and `key` is opaque to the platform, which validates its shape
  and never its meaning, so a page survives a rename on the application side.

  Use a declared link from Markdown as `[label](#link:<declaration-id>)`, or from an action as
  `"link": "<declaration-id>"`. An action sets **exactly one** destination: `href`, `route` or `link`.

  The destination appears only when the application answers with one the platform accepts. When it answers
  nothing - the link is not offered, was revoked, or no application is wired at all - the label is shown as text
  with no anchor, never as a broken `#...` fragment. A `#link:` marker naming a declaration the page does not
  carry is refused when the page is read, naming the field and the id.

**The delivered section vocabulary.** A section is an object with a `type` and only the
properties that type declares:

| Section `type` | What it is |
| --- | --- |
| `hero` | the page's opening statement (eyebrow, lede, actions) |
| `prose` | a block of text |
| `media` | one image, optionally beside text |
| `gallery` | a grid of captioned images |
| `actions` | a group of links |
| `callout` | a note the reader should not miss |
| `cards` | a grid of cards (listings: services, work, articles) |
| `features` | a grid of titled points (what we do, why us) |
| `columns` | two or three side-by-side blocks |
| `steps` | an ordered sequence |
| `stats` | a few figures with labels |
| `quote` | a quotation with attribution |
| `table` | tabular data with column headings |
| `faq` | an expandable question-and-answer group |
| `list` | labels, optionally with detail and a link |
| `divider` | a horizontal break |
| `contactForm` | an authored contact form the site's own configuration may present (declares `formRef`; rendering and submission are decided by the site) |

**Presentation is a finite vocabulary too.** A section chooses from a small set of named
options — surface, text alignment, items per row, media position, column ratio, ordered
list, action variant, callout tone — each a fixed value from the Foundation design
system. A JSON page cannot carry a class name, a colour, a pixel value or a style.

**Strict by design.** An undeclared section type, property or option is refused, naming
the file and the property path (`sections[2].items[0].title`); malformed JSON, an
unsupported `schemaVersion` and an unknown `type` are reported as distinct problems.
Nothing is silently ignored, and because **JSON wins over Markdown for the same
locale+route**, a broken JSON file is never quietly skipped in favour of the Markdown
one.

**Where a JSON page goes, and how it is addressed.** `content/pages/json/<site>/<language>/<route-path>.json`,
with the same rules as the Markdown mode: the file name and the folders become the URL
(folders up to four deep), another language mirrors the structure exactly, an empty
language folder publishes nothing, and a missing translation falls back to **that site's**
default language. A JSON page works at a **flat** route (`ca/en/services.json` →
`/ca/en/services`) and at a **nested** one (`ca/en/services/web-design.json` →
`/ca/en/services/web-design`) — folders are the address, in both modes.

**Safety: the same policy as Markdown, never a second weaker renderer.** Every
human-readable field is Markdown and goes through the **same safe Markdown path** as the
simple mode — raw HTML is inert text, unsafe destinations fail closed, and a heading
written inside a Markdown field is a section-level heading. An action is a label plus
**exactly one** destination: a same-site path, an in-page fragment, `https:`/`http:`,
`mailto:` or `tel:` — or a `route` naming **another page of this site** by its route path
with no language prefix (`"route": "services"` becomes `/ca/en/services`, and `/ca/de/services`
for a German visitor), which is validated so a typo cannot produce a dead link. There is
no `target`, no handler and no behaviour: a link is a link.

**Accessibility is structural, not remembered.** A document cannot choose a heading
level, so the outline is always predictable: the page `title` is the one `<h1>`, section
headings are level 2 and item titles level 3. An image either carries `alt` text or
declares itself decorative — the two are mutually exclusive, so an unnamed content image
cannot be published. Every action requires a label (its accessible name), every table
requires column headings and each row must fill them exactly, and FAQ answers are
required. A table renders as real tabular markup with column headings, so a screen reader
announces each cell with its column.

**What the mode deliberately cannot do:** no scripts, expressions, imports, JSX, `eval`,
event handlers or component names; no raw HTML or Markdown escape hatch; no styling
(class names, CSS, pixel values, `style`); no unbounded nesting (a section has items,
never sections inside sections); and no publishing metadata beyond the title and summary —
article dates, feeds and draft states are a separate capability that does not exist yet.

> **The field-by-field guide ships with the product.** `content/pages/json/README.md`
> documents every section type, every property, every presentation option, the bounds and
> the exact error messages. This manual states **the capability, the safety model and the
> accessibility contract**; that file is the author's reference — do not duplicate it.

### There is no collection store

Foundation used to ship separate author-facing **collections** —
`content/offerings/`, `content/portfolio/`, `content/testimonials/`, `content/posts/` and
`content/legal/` — each with its own directory, parser, route and feature flag.
`FOUNDATION-PAGES-A1E` removed them, and there are no adopters that need compatibility:
one authoring model is far easier to learn than five, and nothing was lost that a page
cannot express. **If you are following an older copy of this manual or an older
repository, those paths no longer exist** — author that material as pages under
`content/pages/`.

- **Offerings, portfolio projects and case studies, articles and testimonials** are
  pages. A "listing" is a page whose body links to the items — nothing generates it, and
  nothing needs to.
- **A legal document is a page plus one line of configuration.** `legal[]` in
  `site.config.json` decides which policy documents the footer surfaces, in order, and
  configuration decides *exposure* while the page decides *existence* — a configured
  slug with no page is simply never linked:
  `content/pages/markdown/<site>/<language>/legal/privacy.md` → `/<site>/<language>/legal/privacy`.
- **There is no content feature flag.** A deployment hides a page by not linking to it,
  not by switching a capability off.

> **The author-facing guides ship with the product.** `content/README.md` is the map,
> `content/pages/markdown/README.md` lists exactly what you can write,
> `content/pages/json/README.md` is the field-by-field guide to the advanced mode, and
> `content/assets/README.md` covers artwork. This manual is the operating procedure;
> those files are the author's own reference.

## Metadata

Markdown frontmatter is **optional**, and exactly **two** keys are supported — `title`
and `description`. A file that is nothing but prose is a complete page: the title comes
from `title:`, then the page's own first `#` heading, then readable words from the
filename, and a description is never invented.

A **JSON** page has no frontmatter: it declares its own metadata inside the document
(`schemaVersion`, `title`, `description`) — see the advanced-mode section above.

- **A misspelled or unknown key fails the build by name.** There are no secret Markdown
  commands — no shortcodes, directives, embedded JSON or pseudo-components — so anything
  the mode does not support is reported rather than silently ignored.
- Keep imagery references pointing at real files that exist under `content/assets/`.
- Alt text / image semantics matter: meaningful images need meaningful alt text;
  purely decorative images must be marked decorative (empty alt) rather than
  mis-described.

## Locales and dictionaries

### Language folders: the simple form and the explicit form

A language folder is a **locale path key**, and it is always lowercase.

The **simple form** is the bare language. Inside a country site, Foundation derives the
country context from the site itself:

```text
ca/en  →  en-CA        ca/fr  →  fr-CA        ch/de  →  de-CH
```

The **explicit form** — language plus region, or language plus script — is for when the
exact dialect, script or region matters:

```text
ca/fr-fr       tw/zh-hant       tw/zh-hant-tw
```

- URLs and folders stay **lowercase** (`/ca/fr-fr/about`); the **canonical language tag** used
  in standards-facing metadata and hreflang uses the usual casing
  (`fr-FR`, `zh-Hant`, `zh-Hant-TW`).
- A **Worldwide** site (`ww`) makes no country assumption of its own: `ww/fr` may simply be
  canonical `fr`. A deployment that wants a convention states it explicitly — for example
  `ww/en → en-US` — and Foundation then uses that. Do not assume every Worldwide language
  gains a country variant.

> **Two language folders that mean the same locale are a HARD configuration error.**
> `ca/en` and `ca/en-ca` both mean `en-CA`, so a site may configure one of them, never both.
> Foundation refuses the deployment and names the collision: choose one form and use it.

This manual describes the bounded contract authors need. The complete rules of the path keys
and their canonical tags are in the Foundation's `CUSTOMIZING.md`; this is not a language-tag
specification.

### Interface wording: shared dictionaries, optional site overrides

- Interface strings (labels, headings, button text, notices) live in **locale
  dictionaries** — one JSON file per locale.
- Business prose lives in **content**, per locale.
- A dictionary is **reused across sites by language**: `config/i18n/fr.json` can carry the
  common French wording for every site that serves French.
- A site may **optionally refine** that base with a partial override of its own:

```text
config/i18n/fr.json               → the shared French wording
config/i18n/sites/ca/fr.json      → Canadian French wording
config/i18n/sites/fr/fr.json      → France wording
config/i18n/sites/ca/fr-ca.json   → an exact-locale refinement (wins over the entries above)
```

Overrides are **optional** and **partial** — you supply only the keys you want to change. An
**unknown key fails the build by name**, and **another site's override is never consulted**,
so one country's wording can never leak into another's pages. Where a deployment uses an
explicit locale folder, the exact-locale dictionary for it refines the language base in the
same way.
- The **canonical language** is the one the business actually writes in; other
  locales are translations of it. Keep the canonical locale complete and correct
  first.
- **Translation handling:** when adding a locale, supply real translations for the
  dictionary values and the content that matters. Do not machine-translate legal or
  financial statements without review, and never publish a locale that makes claims
  the canonical copy does not.
- **Dictionary keys are structure; values are yours.** Never rename or restructure
  keys to fit a translation — add required keys when a release demands them, and
  otherwise change values only.

## Writing rules for business copy

- Keep contact details, service area and CTA language consistent across every page.
- Prefer claims the business can substantiate. No unsupported awards, certifications,
  guarantees, or legally/financially sensitive statements.
- For demonstration/fictional sites, keep everything clearly fictional and never
  present invented reviews, addresses or people as real.
- Reserve space in your mind for the **long-content case**: a legitimate long email
  address, long navigation label or long business name is a layout test, not an edge
  case. Content must be real input the template handles gracefully.

## Procedure for a content change

**Saving a file does not publish it.** An edited file reaches the live site only when it
is committed and pushed, so every content change follows the whole sequence — the same
one the rest of these manuals use:

```text
edit
→ save
→ review/status   (git status, git diff)
→ stage           (git add <file>)
→ commit          (git commit -m "...")
→ push            (git push)
→ automated checks build the site
```

1. **Edit** the page file(s) — and the dictionary values if interface copy changes. For a
   JSON page, confirm the file is valid JSON first (the build also reports it, by file and
   property). Keep imagery references valid, and add the artwork under `content/assets/`
   when a page needs a new image.
2. **Save** the file.
3. **Review** what changed (`git status`, `git diff`): the diff must be exactly the
   change you intended.
4. **Stage** the files you edited: `git add content/pages/markdown/ca/en/opening-hours.md`
   (or `git add content/` for a batch you have already reviewed).
5. **Commit**: `git commit -m "Update opening hours page"`.
6. **Push**: `git push`.
7. **Let the automated checks run.** The pushed commit is built and checked; a red check
   is yours to fix in the same task — never silence a check to make it pass.
8. **Validate locally where it matters** (`validation.md`): route validation, the build
   and the browser matrix.
9. **Confirm the rendered page**: correct copy, no overflow, correct imagery semantics.
10. **Confirm the live page** after deployment (`deployment.md`): the expected route
    returns 200 and the rendered content is the change you pushed.
11. Update any project documentation that quotes the changed content.

> A saved-but-uncommitted file cannot be pushed, and an unpushed commit cannot reach the
> site. That is the entire workflow — there is no separate publishing step.

## Common mistakes

- Writing a routable page anywhere other than `content/pages/` (or artwork outside
  `content/assets/`).
- Editing `public/assets/` by hand — it is a **generated mirror** of `content/assets/`;
  run `pnpm assets:sync` (see `branding-and-assets.md`).
- Editing a dictionary key structure instead of its values.
- Adding an image reference without adding the file.
- Assuming another language or another site reuses the same files: each language mirrors the folder
  structure inside its own site's tree, so a translated page is authored again under its own
  account (ca/fr/...), and a page of one site is never the page of another.
- Publishing translations that are incomplete or that change claims.
- Inventing a section type, property or presentation option in a JSON page — the
  vocabulary **is** the schema, and anything else stops the build by name.
- Trying to style a JSON page (class names, CSS, pixel values) — presentation is chosen
  from the fixed options, never written.
- Expecting a page that exists in one site to appear in another because the language matches:
  there is **no cross-site fallback** — each site answers only from its own tree.
- Configuring two language folders that mean the same locale (`ca/en` together with
  `ca/en-ca`, both meaning `en-CA`): Foundation refuses it — choose one form.
- Naming a site folder something that is not a recognized lowercase country code, or `ww`:
  `main`, `canada` and `my-office` are not sites, and their pages are never published.
- Creating a **Site** because a business opened another office: an office is a **Location**
  inside the existing Site. A Site is another country/global context inside the *same* website —
  a genuinely separate website is a **Spoke**.
- Treating a content-length failure as a styling problem instead of a real content input.
