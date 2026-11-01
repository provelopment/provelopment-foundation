# Site `ww` — Global, in Markdown mode

This folder holds **one Site's** Markdown pages: the country-wide website `ww`
(**Global**). The folder name `ww` is the Site's own code, and it is the first segment of
every route below.

## How a file becomes a route

```text
markdown/ww/en/<page>.md            →  /ww/en/<page>
markdown/ww/de/<page>.md            →  /ww/de/<page>
markdown/ww/en/<section>/<page>.md  →  /ww/en/<section>/<page>
```

- **`ww`** is this Site (Global). Its languages are the ones `site.config.json` configures
  for it.
- **The locale folder is the second segment** (`en`, `de`, …). One file per locale is one
  localized representation of a Page Hub.
- **The same name in two locales is ONE Page Hub**, conceptually: `en/about.md` and
  `de/about.md` are the English and German representations of the same About page.
- **A page's `title` in the front matter is the page's only level-1 heading**, and the
  file name (not the title) decides its route.

## What this folder guarantees

- **A `README.md` is never a page** — documentation, at any level of the tree.
- **An empty locale folder publishes nothing.** Preparing a language folder before writing
  its first page is valid and harmless.
- **A file name that is not a valid page name is ignored**, never published under a guessed
  route.
- **Markdown yields to JSON for the same route:** when both
  `markdown/ww/en/services.md` and `json/ww/en/services.json` exist, this Site serves the
  JSON representation — one route, one page.

## Where to go next

- **The full Markdown authoring guide:** [`../README.md`](../README.md)
- **The JSON counterpart:** [`../../json/ww/README.md`](../../json/ww/README.md)
- **What a page may say:** [`../../README.md`](../../README.md)
- **The model (Site → Page Hub → localization):** [`../../pages/README.md`](../../pages/README.md)
