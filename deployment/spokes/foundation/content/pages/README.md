> **CURRENT EFS NOTE — LEGACY AUTHORING TREE.** This file describes the retained legacy authored tree used by historical tests and by presentation-shell fixtures. Production EFS Page sources live in `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/<pageId>/<locale>.{md,json}` and must also be declared in `deployment/efs/manifest.json`. A Page is not published merely because a file exists. Visibility is declared per localized JSON representation; `unlisted` is reachable but not advertised, never private. The Markdown/JSON syntax below remains applicable; the legacy folder address does not.

# Pages — where this website's content lives

**Nothing in this folder is a page, and it is documentation's own front door.** Below it,
a file is a page only when it sits in a complete Site / locale / page coordinate.

## The hierarchy this folder expresses

```text
Foundation Installation
  → this Spoke (foundation)          its own site.config.json, dictionaries and content
    → Site  ww  (Global)             the country/global context inside that website
      → Page Hub  about              ONE page concept, addressed by ONE route
        → localized representation   one file per language (en, de, …)
```

- **Site → Page Hub → localized representation**, in that order. A Page Hub is the page
  *concept* — its route and its identity — never a folder that merely exists: only a valid
  page source file creates one.
- **The same route in two languages is ONE Page Hub**, conceptually: `ww/en/about.md` and
  `ww/de/about.md` are the English and German representations of the same About page.
- **Page Hub is never shortened to "Hub"** here: a *Spoke Hub* is the group of Spokes an
  Installation declares, which is a different thing entirely.

## The two authoring modes

| Mode | Folder | One file per | Best for |
| --- | --- | --- | --- |
| Markdown | `markdown/<site>/<locale>/…` | page | ordinary prose pages |
| JSON | `json/<site>/<locale>/…` | page | structured pages built from sections |

Both modes are equal authoring surfaces. **For the SAME route, the JSON representation
wins:** `json/ww/en/services.json` is served for `/ww/en/services` even when
`markdown/ww/en/services.md` also exists.

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
- **This Site's own pages:** [`json/ww/README.md`](json/ww/README.md), [`markdown/ww/README.md`](markdown/ww/README.md)
- **Everything an author can create:** [`../README.md`](../README.md)
- **Your logo, favicon, images and icons:** [`../assets/README.md`](../assets/README.md)
