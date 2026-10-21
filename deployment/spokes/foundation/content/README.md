> **CURRENT EFS NOTE — LEGACY AUTHORING TREE.** This file describes the retained legacy authored tree used by historical tests and by presentation-shell fixtures. Production EFS Page sources live in `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/<pageId>/<locale>.{md,json}` and must also be declared in `deployment/efs/manifest.json`. A Page is not published merely because a file exists. Visibility is declared per localized JSON representation; `unlisted` is reachable but not advertised, never private. The Markdown/JSON syntax below remains applicable; the legacy folder address does not.

# Your website's content — start here

**Everything you write or upload for your website lives in this folder.** If you are
asking *"where do I edit my website?"*, you are in the right place.

Every path written in this folder is relative to **this deployment**: `content/…` means
the deployment's own content folder — in the repository that hosts this reference
deployment that is `deployment/spokes/foundation/content/…`.

```text
content/
├── README.md            ← this file: the map
├── pages/               ← every page of your website
│   ├── markdown/        ←   the simple way: text files
│   │   └── <site>/<language>/<page>.md
│   └── json/            ←   the advanced way: structured data
│       └── <site>/<language>/<page>.json
└── assets/              ← your logo, favicon, images and icons
```

**The rule that makes it simple:** if something has its own web address, it is a
**page** and it goes in `pages/`. If it only ever appears *inside* another page — a
customer quote, a row in a table, a card in a list — you write it in that page. There
are no other places to author website content, and nothing else to learn.

| I want to… | Go to | Read |
| --- | --- | --- |
| Add or edit a **page** in plain Markdown (the usual choice) | `pages/markdown/<site>/<language>/<page>.md` | [`pages/markdown/README.md`](pages/markdown/README.md) |
| Build an **advanced page** from structured data | `pages/json/<site>/<language>/<page>.json` | [`pages/json/README.md`](pages/json/README.md) |
| Add a **logo, favicon, icon or image** | `assets/` | [`assets/README.md`](assets/README.md) |

Both modes give a page exactly **one** top-level heading — its **page title**. A heading you
write inside a page sits below that title automatically (`# Services` becomes the first level
under it, `## …` the second), so you write headings naturally and never set a level yourself.

> **Where do I edit my website?** — the page files above, and your pictures in
> [`assets/`](assets/README.md). Everything else is configuration, not content.

## Pages: two ways to author, one obvious choice

- **Markdown** — ordinary text files. If you can write an email, you can write a
  page. This is what almost everyone should use, and it is safe by design.
- **JSON** — structured data for an experienced author who needs page composition
  Markdown cannot express: a title, a summary and an ordered list of sections from a
  fixed vocabulary (hero, prose, images, cards, features, steps, table, FAQ, and more).
  It is data, never code, and everything it may say is documented in that folder's
  README.

A page becomes a real web address as soon as its file exists in a language folder —
you never have to "register" a page anywhere.

## A page's address comes from its folders

Any page **inside** your site gets its address from where you put the file:

**How an address is built: mode → site → language → page.** **Choose your site, choose its
language, then create the page.** The folders are the address — nothing else needs
configuring.

```text
content/pages/markdown/ww/en/about.md    →   /ww/en/about
content/pages/markdown/ww/de/about.md    →   /ww/de/about
```

- **mode** — which authoring mode the page is written in: `markdown/` (simple, safe) or
  `json/` (advanced). You choose one per page.
- **site** — which Site the page belongs to: the country/global context inside this Spoke,
  written as a recognized two-letter country code (`ca`, `fr`, `ch`…) or `ww` for the
  worldwide/global Site. See
  [`COUNTRY-CODES.md`](COUNTRY-CODES.md) for the complete list.
- **language** — the language, written as a lowercase path key (`en`, `fr`, `fr-ca`).
- **page** — the page's own path: one name (`about`) or a folder plus a name
  (`services/web-design`).

A language you did not name is simply not offered in that Site, and pages belonging to one Site are
never served as pages of another. Both Sites would still belong to the **same Spoke** — the Spoke is
the complete website (its own `site.config.json`, dictionaries, pages and artwork), and a Site is the
country or global context inside it.

A Site can also use an **explicit** language when the exact dialect matters:

```text
content/pages/markdown/ww/en-gb/about.md   →   /ww/en-gb/about
```

### A section is a folder

Its own page and the pages inside it live side by side, and both are addresses:

```text
content/pages/markdown/ww/en/services.md                 →  /ww/en/services
content/pages/markdown/ww/en/services/web-design.md      →  /ww/en/services/web-design
content/pages/markdown/ww/en/blog/choosing-a-domain.md   →  /ww/en/blog/choosing-a-domain
```

So a section with its own pages is just a folder. Nothing needs configuring, and the
section's own page (`services.md`) and its pages (`services/web-design.md`) live
happily side by side.

## Languages

Pages are organised by language: the folder name is a language code such as `en`
(English) or `de` (German). Another language mirrors the same structure exactly:

```text
content/pages/markdown/ww/en/services.md                  →  /ww/en/services
content/pages/markdown/ww/en/services/web-design.md       →  /ww/en/services/web-design

content/pages/markdown/ww/de/services.md                  →  /ww/de/services
content/pages/markdown/ww/de/services/web-design.md       →  /ww/de/services/web-design
```

The languages your site serves are configured in `site.config.json`; a language
folder you create but have not configured yet simply publishes nothing. If a page has
no translation in the visitor's language, the default language's page answers instead.

## Content versus configuration

- **`content/` = what you write.** Words, images, documents — the material of the
  website.
- **`site.config.json`, `config/` = how the site behaves.** Your business name,
  phone number, colours, menu entries, which optional features are switched on.

You change your text and images in `content/`. You change settings — including which
language is the default, and what appears in the navigation — in
`site.config.json`.

## Sites and locations

A **Site** is the country or global context inside a Spoke: its own pages, its own languages, its
own locations. The folder directly under `pages/<mode>/` is the Site code, so this Spoke's Site is
`ww` (Global). A Site is not an independent website of its own — it belongs to the Spoke that owns
it, and pages of one Site are never served as pages of another.

A **location** is a physical or service place *inside* one Site. It shares that Site's page tree:
its landing page is authored exactly like any other page, with the location's name as the file
name and folder. The Germany Spoke's Site ships two locations as the reference example:

```text
content/pages/markdown/de/de/berlin.md          →  /de/de/berlin
content/pages/markdown/de/de/frankfurt.md       →  /de/de/frankfurt
content/pages/markdown/de/en/berlin.md          →  /de/en/berlin
```

The locations themselves (their name, time zone, address) are configured in `site.config.json`
under `business.regions`, and which site + language each one is reachable in is declared under
`business.pages`. A location does **not** get its own languages: languages belong to the site, so
every location in a site is readable in every language that site offers.

The reference deployment's Germany site, its Berlin and Frankfurt locations and their placeholder
addresses are **demonstration data** for you to replace with your own.

## Saving is not publishing

Editing a file on your own computer does not change the live website. A change
becomes part of the site when it is **committed and pushed**:

```text
edit the file
→ save it
→ review what changed   (git status)
→ stage it              (git add <file>)
→ commit it             (git commit -m "Update About page")
→ push it               (git push)
→ automated checks build the site
```

Each folder's README shows the exact commands for its files. If you have never used
Git, follow that sequence literally: it is the whole workflow, and it works the same
way for every file in this folder.

## Two things that are deliberate, not mistakes

- **A `README.md` is never a page.** Documentation is safe to keep beside your
  content — at the top level or inside any folder — because only files whose names are
  ordinary lowercase page names can become pages.
- **An empty folder publishes nothing.** You can prepare a language or a section
  before you have anything to put in it; it creates no page and no address.
