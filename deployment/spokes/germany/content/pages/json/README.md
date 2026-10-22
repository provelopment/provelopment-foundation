> **CURRENT EFS NOTE — LEGACY AUTHORING TREE.** This file describes the retained legacy authored tree used by historical tests and by presentation-shell fixtures. Production EFS Page sources live in `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/<pageId>/<locale>.{md,json}` and must also be declared in `deployment/efs/manifest.json`. A Page is not published merely because a file exists. Visibility is declared per localized JSON representation; `unlisted` is reachable but not advertised, never private. The Markdown/JSON syntax below remains applicable; the legacy folder address does not.

# JSON pages — the advanced authoring mode

**This folder is for an author (or developer) who wants to compose a page from
structured parts instead of plain prose.** One JSON file describes one page: a title, an
optional summary, and an ordered list of sections.

If you have never used JSON, use the Markdown mode instead
([`../markdown/README.md`](../markdown/README.md)) — it needs nothing but a text editor.
A JSON page is a single JSON object, so the syntax you need is: `{ }` around the
document, `"name": value` for each property, `[ ]` for lists, and `,` between items.
Every example below is complete and copyable.

> **JSON pages are data, never code.** They cannot contain JavaScript, expressions,
> imports, event handlers, raw HTML, CSS, class names or component names. Everything a
> document may say is listed in this guide, and anything else is refused loudly when the
> page is read — the site stops building and names the file and the property.

## Where a page goes

**Which folder does my page go in?**

```text
content/pages/json/<site>/<language>/<page-name>.json
```

- **`<site>`** — a recognized lowercase country code (`ca`, `fr`, `ch`…), or `ww` for a
  worldwide/global site. The complete list is
  [`content/COUNTRY-CODES.md`](../../COUNTRY-CODES.md). A folder that is not one of those
  codes defines no site, and pages inside it are never published.
- **`<language>`** — `en`, `fr`, `fr-ca`… (lowercase).
- **`<page-name>`** — one name (`services`) or a folder plus a name
  (`services/web-design`).

For example:

```text
content/pages/json/ww/en/services.json                →   /ww/en/services
content/pages/json/ww/en/services/web-design.json     →   /ww/en/services/web-design
content/pages/json/ww/en/legal/privacy.json           →   /ww/en/legal/privacy
content/pages/json/ww/en/home.json                    →   /en   (the home page)
```

- `<language>` is a language your site is configured to serve (`en`, `de`, …).
- `<page-name>` becomes the end of the web address: lowercase words joined by hyphens.
- **Folders become part of the address** (up to four deep), and each folder name follows
  the same rule as a file name.
- **Another language mirrors the same structure** —
  `content/pages/json/ww/de/services/web-design.json` serves `/ww/de/services/web-design` — and
  a page with no translation in the visitor's language falls back to the default
  language's page.
- **A `README.md` is never a page** (here, or in any folder). Only files whose names are
  ordinary lowercase page names become pages.
- **An empty language folder publishes nothing.** You may prepare a language before you
  have anything to put in it.

## The smallest complete page

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

- **`schemaVersion`** is required and must be `1`. The page format will change in a way
  that needs a new number, and a document naming an unsupported number is refused rather
  than half-understood.
- **`title`** is required. It is the page's name, its search/social title **and the only
  level-1 heading on the page**.
- **`description`** is optional. When you supply one, it is used as the page's summary;
  when you do not, the site's own configured description applies.
- **`sections`** is required and may be empty (a title-only page), up to 40 sections.

### The heading rule

Your page produces exactly **one** `<h1>` — the `title` — and you never set a heading
level yourself:

| Where a heading lives | Level | How you author it |
| --- | --- | --- |
| the page title | 1 | `title` in the envelope |
| a section heading | 2 | `heading` inside a section |
| an item title | 3 | `title`/`question` inside a section's items |

The **Markdown mode follows the same principle**: its page title is the only `<h1>`, and
a heading written in the body is placed below it automatically (`# Services` becomes a
level-2 heading). You never choose a level in either mode — see
[`../markdown/README.md`](../markdown/README.md).

That is why no section can produce a second page heading, and why the document outline is
always readable.

## The section types

Every section is an object with a `type`, and only the properties listed for that type.
`sections` are rendered in the order you write them.

| `type` | What it is | Required properties | Optional properties |
| --- | --- | --- | --- |
| `hero` | the page's opening statement (eyebrow, lede, actions) | — | `eyebrow`, `lede`, `actions`, `support`, `align`, `surface` |
| `prose` | a block of text | `body` | `heading`, `lede`, `align`, `surface` |
| `media` | one image, optionally beside text | `image` | `heading`, `lede`, `caption`, `position`, `surface` |
| `gallery` | a grid of captioned images | `items` | `heading`, `lede`, `columns`, `surface` |
| `actions` | a group of links | `actions` | `heading`, `lede`, `align`, `surface` |
| `callout` | a note the reader should not miss | `body` | `heading`, `lede`, `tone`, `align`, `surface` |
| `cards` | a grid of cards (listings: services, work, articles) | `items` | `heading`, `lede`, `columns`, `surface` |
| `features` | a grid of titled points (what we do, why us) | `items` | `heading`, `lede`, `columns`, `surface` |
| `columns` | two or three side-by-side blocks | `items` (2–3) | `heading`, `lede`, `ratio`, `surface` |
| `steps` | an ordered sequence | `items` (max 12) | `heading`, `lede`, `surface` |
| `stats` | a few figures with labels | `items` (max 6) | `heading`, `lede`, `surface` |
| `quote` | a quotation with attribution | `body` | `attribution`, `role`, `align`, `surface` |
| `table` | tabular data with column headings | `columns`, `rows` | `heading`, `lede`, `caption`, `surface` |
| `faq` | an expandable question-and-answer group | `items` | `heading`, `lede`, `surface` |
| `list` | labels, optionally with detail and a link | `items` | `heading`, `lede`, `ordered`, `surface` |
| `divider` | a horizontal break | — | — |

### Items, property by property

```jsonc
{ "type": "cards",
  "heading": "Our services",
  "columns": 3,
  "items": [
    { "title": "Website design",
      "body": "Pages people understand.",
      "image": { "src": "/assets/design.png", "alt": "A designed page" },
      "meta": "From 500",
      "action": { "label": "Details", "route": "services/website-design" }
    }
  ] }
```

A card may carry an `image`, a short `meta` line, a Markdown `body` and ONE `action`.

```jsonc
{ "type": "features",
  "heading": "Why work with us",
  "items": [
    { "title": "Clear", "body": "Plain language." },
    { "title": "Fast", "icon": "/assets/icon-bolt.svg" }
  ] }
```

A feature is a card without media or an action, and its `icon` is decorative (the title
carries the meaning).

```jsonc
{ "type": "steps",
  "heading": "How it works",
  "items": [
    { "title": "Tell us what you need", "body": "A short conversation." },
    { "title": "We build it" }
  ] }
```

```jsonc
{ "type": "stats",
  "items": [
    { "value": "120+", "label": "Websites built" },
    { "value": "9", "label": "Years", "detail": "Since 2017." }
  ] }
```

```jsonc
{ "type": "columns",
  "ratio": "start-wide",
  "items": [
    { "title": "What you do", "items": ["Talk to your customers", "Share the domain you want"] },
    { "title": "What we do", "body": "Everything **technical**." }
  ] }
```

```jsonc
{ "type": "faq",
  "heading": "Questions",
  "items": [
    { "question": "How long does it take?", "answer": "Usually **two to four weeks**." }
  ] }
```

```jsonc
{ "type": "list",
  "heading": "What is included",
  "ordered": true,
  "items": [
    "A plain entry",
    { "label": "Support", "detail": "Included for a year.", "route": "contact" }
  ] }
```

```jsonc
{ "type": "quote",
  "body": "They explained everything in plain English.",
  "attribution": "A Customer",
  "role": "Owner" }
```

A `list` item is either a plain string or an object with `label`, optional `detail`
(Markdown) and an optional destination. `columns` items hold **either** a `body`
(Markdown) **or** a short `items` list — never both and never another section.

### Tables

```json
{
  "type": "table",
  "heading": "Plans",
  "caption": "Prices exclude VAT.",
  "columns": ["Plan", "Pages", "From"],
  "rows": [
    ["Starter", "1–3", "500"],
    ["Growth", "4–10", "900"]
  ]
}
```

Every row must have exactly one cell per declared column, and cells are **plain text**
(not Markdown) — a cell is a single table value. `columns` become real column headings, so
a screen reader announces each cell with its column.

### Presentation options

These are the only presentation choices, and each is a fixed value from the Foundation
design system. There is no way to give a section a class, a colour, a size or a style.

| Option | Values | Used by | Meaning |
| --- | --- | --- | --- |
| `surface` | `"plain"` (default), `"muted"`, `"bordered"` | every section except `divider` | the panel behind the section |
| `align` | `"start"` (default), `"center"` | `hero`, `prose`, `callout`, `quote`, `actions` | text alignment |
| `columns` | `2`, `3`, `4` | `gallery`, `cards`, `features` | items per row on a wide screen |
| `position` | `"start"`, `"end"` | `media` | whether the image sits before or after the text |
| `ratio` | `"equal"` (default), `"start-wide"`, `"end-wide"` | `columns` | the width split |
| `ordered` | `true`, `false` (default) | `list` | renders `1. 2. 3.` instead of bullets |
| `variant` | `"primary"` (default), `"secondary"`, `"link"` | each action | how a link is emphasised |
| `tone` | `"note"` (default), `"info"`, `"warning"` | `callout` | how the note is marked up |

## Markdown inside a JSON page

Wherever a field holds **human-readable prose**, it is Markdown — the same Markdown the
Markdown authoring mode uses, with the same safety rules:

| Field | Markdown |
| --- | --- |
| `prose.body` | yes |
| `callout.body` | yes |
| `cards.items[].body`, `features.items[].body` | yes |
| `columns.items[].body` | yes |
| `steps.items[].body` | yes |
| `faq.items[].answer` | yes |
| `list.items[].detail` | yes |
| `quote.body` | yes |
| `hero.lede`, `hero.support` | yes |
| `media.caption`, `gallery.items[].caption`, `table.caption` | yes |
| any section's `lede` | yes |

So `**bold**`, `[links](/contact)`, lists, tables and `## Headings` work as usual — and a
heading you write inside a Markdown field is a **section-level** heading, so always start
at `##` or below. Headings also get a predictable fragment id (`## What we do` →
`#what-we-do`), which you can link to with `[read on](#what-we-do)`.

**Raw HTML inside a Markdown field is shown as text, never executed**, and a link whose
destination is unsafe (for example `javascript:…`) is dropped. This is the same policy the
Markdown authoring mode applies; there is no second, weaker renderer.

## Links and actions

An action is a label plus **exactly one** destination:

```jsonc
{ "label": "Contact us", "href": "/contact" }                       // a path or full URL
{ "label": "Services",   "route": "services" }                      // another page of this site
{ "label": "Read more",  "route": "services/website-design", "variant": "secondary" }
{ "label": "Example",    "href": "https://example.com/", "variant": "link" }
```

- **`href`** is used as written. Allowed: a same-site path (`/contact`), an in-page
  fragment (`#what-we-do`), `https:`/`http:`, `mailto:` and `tel:`. Anything else is
  refused when the page is read.
- **`route`** names another **page of this site** by its route path, without a language
  prefix: `route: "services"` becomes `/ww/en/services`, and `/ww/de/services` for a German
  visitor. Use it to link between your own pages — it can never point at the wrong
  language, and it is validated, so a typo cannot produce a dead link.
- **`variant`** is `"primary"` (default), `"secondary"` or `"link"`.
- You cannot set a `target`, an event handler or any behaviour: a link is a link. An
  external destination gets the platform's own external-link treatment.

## Images and assets

Images use your site's normal asset authority — the same `content/assets/**` folder the
Markdown mode and the branding configuration use. You never import an image into source
code to use it on a JSON page:

```jsonc
{ "src": "/assets/photo.png", "alt": "Our workshop on a busy morning" }   // described
{ "src": "/assets/decor.png", "decorative": true }                        // conveys nothing
{ "src": "https://cdn.example.com/photo.png", "alt": "Product photo" }    // absolute URL
```

- **`src`** must be a same-site path (the convention is `/assets/<file>`, where
  `content/assets/` is mirrored to) or an absolute `http(s)` URL.
- **`alt` is required for an image that conveys something**, and a `decorative: true`
  image must NOT carry alt text. The two are mutually exclusive, so an unnamed content
  image cannot be published by accident.
- Run `pnpm assets:sync` after adding files under `content/assets/` (the README there
  explains it).

## Nested pages

Folders become address segments, so a section with its own pages is a folder:

```text
content/pages/json/ww/en/services.json                    →   /ww/en/services
content/pages/json/ww/en/services/web-design.json         →   /ww/en/services/web-design
content/pages/json/ww/en/blog/choosing-a-domain.json      →   /ww/en/blog/choosing-a-domain
```

Nothing else is needed: there is no index to register and no route to declare. A listing
page links to its items with ordinary actions
(`{ "label": "Web design", "route": "services/web-design" }`), which is why a services
catalogue, a portfolio or a blog is just pages in a folder.

## When something is wrong

A JSON page that cannot be used **stops the build and names the file**. The message tells
you which property to look at, and it distinguishes the kinds of problem:

| What you will see | What it means |
| --- | --- |
| `Invalid JSON in page "…": …` | the file is not valid JSON — usually a missing or trailing comma, or an unquoted property name |
| `… schemaVersion: must be the supported schema version 1` | the document names a format the platform does not support |
| `Unknown section type "offerings" in page "…"` | that `type` is not in the table above; the message lists the supported ones |
| `… sections[2].items[0]: Unrecognized key: "style"` | a property the vocabulary does not declare — typos are never ignored |
| `… sections[1].body: Required` | a required property is missing |
| `… alt: needs "alt" text …` | an image conveys something but has no description |
| `… rows: every row must have exactly one cell per declared column` | a table row does not fill the declared columns |
| `… href: must be a same-site path …` | a destination the platform refuses |

Because a JSON page **wins over a Markdown page for the same language and route**, a
broken JSON file is never quietly skipped in favour of the Markdown one.

## Saving is not publishing

Editing a file on your own computer does not change the live website. A change becomes
part of the site when it is committed and pushed:

```text
edit the file
→ check it is valid JSON (the build will also tell you, by name and property)
→ save it
→ review what changed   (git status)
→ stage it              (git add content/pages/json/ww/en/services.json)
→ commit it             (git commit -m "Add the services page")
→ push it               (git push)
→ automated checks build and publish the site
```

## What a JSON page deliberately cannot do

- **No code.** No JavaScript, expressions, imports, JSX, `eval`, event handlers or
  component names.
- **No raw HTML or Markdown escape hatch.** Prose is Markdown; raw HTML in it stays text.
- **No styling.** No class names, no CSS, no pixel values, no `style` object. Presentation
  choices are the fixed options in the table above.
- **No arbitrary nesting.** A page has sections; a section has items. There are no
  sections inside sections, and a `columns` block holds text or a short list, not another
  composition.
- **No publishing metadata beyond the title and summary.** Article dates, feeds and draft
  states belong to a publishing capability that has not been built; when one is needed it
  will get its own increment rather than being smuggled into the page format.

## Where to go next

- **Everything you can author, in one map:** [`../../README.md`](../../README.md)
- **The simple mode, for ordinary pages:** [`../markdown/README.md`](../markdown/README.md)
- **Your logo, favicon, images and icons:** [`../../assets/README.md`](../../assets/README.md)
- **Your website's settings** (name, contact details, languages, menu): `site.config.json`
  at the top of this deployment — the folder that contains the `content/` tree these pages
  live in — and `CUSTOMIZING.md`, the Foundation's configuration reference, at the
  repository root.
