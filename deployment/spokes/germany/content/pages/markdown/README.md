> **CURRENT EFS NOTE — LEGACY AUTHORING TREE.** This file describes the retained legacy authored tree used by historical tests and by presentation-shell fixtures. Production EFS Page sources live in `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/<pageId>/<locale>.{md,json}` and must also be declared in `deployment/efs/manifest.json`. A Page is not published merely because a file exists. Visibility is declared per localized JSON representation; `unlisted` is reachable but not advertised, never private. The Markdown/JSON syntax below remains applicable; the legacy folder address does not.

# Pages — Markdown (the simple, safe way to write a page)

**Who this is for:** anyone who can edit a text file. You do not need to understand
programming, components, layouts or the Foundation code. If you can write an email,
you can write a page here — and you cannot break the website by typing something
unusual.

**Markdown** is plain text with a few simple conventions. You write normal words,
and add a small symbol here and there to say what they are:

```markdown
# Opening hours

We are open **Monday to Friday**, 9am to 5pm.

- Saturday: 10am to 2pm
- Sunday: closed
```

Those symbols produce a heading, bold words and a bullet list. That is the whole
idea: plain text in, a real web page out.

## Where a page file goes

**Which folder does my page go in?**

```text
content/pages/markdown/<site>/<language>/<page-name>.md
```

- **`<site>`** — a recognized lowercase country code (`ca`, `fr`, `ch`…), or `ww` for a
  worldwide/global site. The complete list is
  [`content/COUNTRY-CODES.md`](../../COUNTRY-CODES.md). A folder that is not one of those
  codes defines no site, and pages inside it are never published.
- **`<language>`** is a folder named with the language code you publish in — `en`
  for English, `de` for German. Use the codes your site is configured with.
- **`<page-name>`** is the file name and becomes the end of the web address. Use
  lowercase words joined by hyphens: `opening-hours.md` becomes
  `/en/opening-hours`.

So this file:

```text
content/pages/markdown/ww/en/opening-hours.md
```

is served at `/en/opening-hours`. You do not register the page anywhere else, you do
not add it to a list, and you do not change any configuration: the file existing
*is* the page, and it appears in the site's sitemap automatically.

### Pages inside a section (folders)

Put a page in a folder and the folder becomes part of its address — that is how you
build a section:

```text
content/pages/markdown/ww/en/services.md                 →  /ww/en/services
content/pages/markdown/ww/en/services/web-design.md      →  /ww/en/services/web-design
content/pages/markdown/ww/en/services/hosting.md         →  /ww/en/services/hosting
content/pages/markdown/ww/en/blog/choosing-a-domain.md   →  /ww/en/blog/choosing-a-domain
```

The section's own page and its pages live side by side: `services.md` is the
overview, the `services/` folder holds the rest. Folders may be up to four deep, and
every folder name follows the same rule as a file name (lowercase words joined by
hyphens), so a URL is always readable and always predictable.

## The smallest complete page

This is a whole page. Nothing else is required:

```markdown
# Opening hours

We are open Monday to Friday, 9am to 5pm.
```

If you write no heading, the page is named after the file (`opening-hours` becomes
"opening hours"). If you write a heading, that becomes the page's title.

## Optional extras

If you want to be explicit about the page's name, or give it a short summary for
search results and link previews, begin the file with a small block between two rows
of `---`:

```markdown
---
title: Opening hours
description: When we are open, including public holidays.
---

We are open Monday to Friday, 9am to 5pm.
```

`title` and `description` are the only two settings, and **neither is required**. A
misspelled setting is reported as an error when the site is built, so a typo can never
be silently ignored.

## Headings, and the page's own title

The page's title is the page's **biggest heading**. Everything you write inside the page
sits underneath it, so you never have to think about heading levels — the site places
them for you:

| You write | The page shows |
| --- | --- |
| the page title (from `title:`, or your first `#` line) | the page's one top-level heading |
| `# Services` | a heading one level down |
| `## Website design` | a heading two levels down |
| `### Card layouts` | a heading three levels down |
| `##### Fine print` | the smallest heading there is |

So `#` is still how you write your main sections and `##` the parts inside them — exactly
as you would anywhere else. Nothing is removed and nothing is rejected: `# Services`
simply appears one step below the page title, which is why a page can never end up with
two equally important top-level headings.

## What you can write

Everything below is supported and tested. Nothing in this list is aspirational.

| To write… | Type this |
| --- | --- |
| A heading | `# Heading` (`##`, `###` … for smaller ones). See *Headings, and the page's own title* above — your headings sit under the page title automatically |
| A paragraph | Just write, with a blank line between paragraphs |
| **Bold** | `**bold**` |
| *Italic* | `*italic*` |
| ~~Strikethrough~~ | `~~strikethrough~~` |
| A bullet list | `- item` (one per line) |
| A numbered list | `1. item` |
| A list inside a list | Indent the inner item by two spaces |
| A quotation | `> quoted text` |
| A link | `[the words people click](/contact)` |
| A link to another website | `[label](https://example.com)` |
| An image | `![describe the image](/assets/photo.png)` |
| `inline code` | `` `inline code` `` |
| A code block | Three backticks on their own line, the code, then three backticks |
| A horizontal rule | `---` on its own line |
| A table | Header row, then `| --- | --- |`, then the rows |
| A link added automatically | Type the address on its own: `https://example.com` |

A table looks like this in the file:

```markdown
| Day       | Opens | Closes |
| --------- | ----- | ------ |
| Monday    | 9:00  | 17:00  |
| Saturday  | 10:00 | 14:00  |
```

Task list items (`- [x] done`) are supported too, and are shown as the symbols ☑ and
☐ — they are deliberately **not** clickable boxes, because a page cannot contain
form controls.

## Linking to a section of the same page

You can link to a heading further down your own page, which is how you build a small
table of contents:

```markdown
See [Opening hours](#opening-hours) below.

…

## Opening hours
```

The address after `#` is made from the heading's words, by a fixed rule you can rely
on:

| Heading you write | Link you use |
| --- | --- |
| `## Opening hours` | `#opening-hours` |
| `## Opening Hours` | `#opening-hours` (capitalisation is ignored) |
| `## Café hours` | `#cafe-hours` (accents are ignored) |
| `## Prices (2026)` | `#prices-2026` (punctuation is dropped) |
| `## What we do — and why` | `#what-we-do-and-why` (spaces and dashes become one `-`) |
| `## Notes` twice on one page | `#notes`, then `#notes-2` |
| A heading with no letters or numbers | `#section` |

You never write the `#opening-hours` part yourself: the site creates it from your
heading, which is why it is always predictable. (Typing HTML to create your own
target does not work — HTML shows up as text, see below.)

## What is deliberately not allowed

This mode is safe by design, and that means some things an experienced web
developer might reach for simply do not exist here:

- **HTML you type is shown as text.** `<script>`, `<div>`, `<iframe>`, `<form>`,
  `<style>` and anything like them appear as the words you typed — they never become
  part of the page;
- **unsafe links keep their words and lose their destination.** Site paths
  (`/contact`), section links (`#opening-hours`), relative paths (`./photo.png`) and
  `https:`, `http:`, `mailto:` and `tel:` work; anything else is not linked;
- **no scripts, no event handlers, no embedded documents, no forms, no frames**, and
  no way to add one;
- **no shortcodes, no components and no programming**. If a page needs the site's
  own building blocks rather than prose, that is the [advanced JSON
  mode](../json/README.md) — not a richer Markdown.

If something you wrote is not doing what you expect, the usual cause is that it fell
into one of the categories above and was shown as text on purpose.

## How your page reaches the website

A page is part of the site's source, so it is published the same way any file is:
**edit → save → commit → push**. There is no separate publishing step.

```text
# 1. see what you changed
git status

# 2. stage the file you edited
git add content/pages/markdown/ww/en/opening-hours.md

# 3. record the change
git commit -m "Update Opening hours page"

# 4. send it
git push
```

The site is then built and checked automatically. Saving the file alone is not
enough: an unstaged, uncommitted or unpushed change is invisible to the live site.

## Languages

- **One folder per language**: `content/pages/markdown/ww/en/…`, `…/de/…`.
- The folder name must be a language code your site is configured to serve
  (`site.config.json`). A folder for an unconfigured language publishes nothing.
- **Another language mirrors the same structure**, so a translated section keeps the
  same URLs under its own language:

  ```text
  content/pages/markdown/ww/en/services/web-design.md   →  /ww/en/services/web-design
  content/pages/markdown/ww/de/services/web-design.md   →  /ww/de/services/web-design
  ```

- **You may create an empty language folder** before you have anything to put in it.
  An empty folder is not a page, creates no address and adds nothing to the sitemap.
- **A missing translation falls back**: if a visitor asks for a page in German and
  you have not written it, the site's default language answers instead of showing an
  error — for a nested page exactly as for a top-level one.

## Two things that are deliberate, not mistakes

- **A `README.md` is never a page** — at the top level *or* beside your pages inside a
  folder. Only files whose names are ordinary lowercase page names can become pages,
  so documentation cannot end up on your website by accident.
- **Adding a page does not change your menu.** Put a link to the page wherever you
  want it, or add an entry to `navigation` in `site.config.json` if it belongs in the
  menu. The page itself is live either way.

## Where to go next

- **Logo, favicon, images and icons:** [`../../assets/README.md`](../../assets/README.md)
- **Everything you can author, in one map:** [`../../README.md`](../../README.md)
- **The advanced, structured page format:** [`../json/README.md`](../json/README.md)
- **Your website's settings** (name, contact details, languages, menu):
  `site.config.json` at the top of this deployment — the folder that contains the
  `content/` tree these pages live in — and `CUSTOMIZING.md`, the Foundation's
  configuration reference, at the repository root.
