> **CURRENT EFS NOTE — LEGACY AUTHORING TREE.** This file describes the retained legacy authored tree used by historical tests and by presentation-shell fixtures. Production EFS Page sources live in `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/<pageId>/<locale>.{md,json}` and must also be declared in `deployment/efs/manifest.json`. A Page is not published merely because a file exists. Visibility is declared per localized JSON representation; `unlisted` is reachable but not advertised, never private. The Markdown/JSON syntax below remains applicable; the legacy folder address does not.

# Pages — where the Germany website's content lives

**Nothing in this folder is a page, and it is documentation's own front door.** Below it,
a file is a page only when it sits in a complete Site / locale / page coordinate.

## The hierarchy this folder expresses

```text
Foundation Installation
  → this Spoke (germany)             its own site.config.json, dictionaries and content
    → Site  de  (Germany)            the country context inside that website
      → Page Hub  berlin             ONE page concept, addressed by ONE route
        → localized representation   one file per language (de, en, …)
```

- **Site → Page Hub → localized representation**, in that order. A Page Hub is the page
  *concept* — its route and its identity — never a folder that merely exists: only a valid
  page source file creates one.
- **The same route in two languages is ONE Page Hub**, conceptually: `de/de/berlin.md` and
  `de/en/berlin.md` are the German and English representations of the same Berlin page.
- **A Location is not a Site and not a Page Hub.** Berlin and Frankfurt are *locations*
  inside this Site: choosing one keeps the site and the language and reuses these same
  pages, which is exactly what makes them locations rather than further Sites.
- **Page Hub is never shortened to "Hub"** here: a *Spoke Hub* is the group of Spokes an
  Installation declares, which is a different thing entirely.

## The two authoring modes

| Mode | Folder | One file per | Best for |
| --- | --- | --- | --- |
| Markdown | `markdown/<site>/<locale>/…` | page | ordinary prose pages |
| JSON | `json/<site>/<locale>/…` | page | structured pages built from sections |

Both modes are equal authoring surfaces. **For the SAME route, the JSON representation
wins:** `json/de/de/berlin.json` would be served for `/de/de/berlin` even when
`markdown/de/de/berlin.md` also exists.

## What is a page, and what is not

- A file with a valid page name **is** the page; it is registered nowhere else.
- `README.md` — and documentation like it — is **documentation**: never a page, never a
  route, never a sitemap entry, at any level of this tree.
- A folder that is not a configured Site, or not a configured locale of that Site,
  publishes nothing.
- An **empty** locale folder publishes nothing and is not an error: a language may be
  prepared before anything is written in it.
- A nested folder publishes nothing until a valid page file exists inside it.

## Where to go next

- **The modes:** [`json/README.md`](json/README.md), [`markdown/README.md`](markdown/README.md)
- **This Site's own pages:** [`json/de/README.md`](json/de/README.md), [`markdown/de/README.md`](markdown/de/README.md)
- **Everything an author can create:** [`../README.md`](../README.md)
- **Your logo, favicon, images and icons:** [`../assets/README.md`](../assets/README.md)
