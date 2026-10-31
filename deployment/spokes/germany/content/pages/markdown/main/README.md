# Site `de` — Germany, in Markdown mode

This folder holds **one Site's** Markdown pages: the German website `de` (**Germany**). The
folder name `de` is the Site's own code, and it is the first segment of every route below.

## How a file becomes a route

```text
markdown/de/de/<page>.md            →  /de/de/<page>
markdown/de/en/<page>.md            →  /de/en/<page>
markdown/de/de/berlin.md            →  /de/de/berlin
```

- **`de`** is this Site (Germany). Its languages are the ones `site.config.json` configures
  for it — currently `de` (its default) and `en`.
- **The locale folder is the second segment.** One file per locale is one localized
  representation of a Page Hub.
- **The same name in two locales is ONE Page Hub**, conceptually: `de/about.md` and
  `en/about.md` are the German and English representations of the same About page.
- **A page's `title` in the front matter is the page's only level-1 heading**, and the file
  name (not the title) decides its route.
- **Locations reuse these pages.** Berlin and Frankfurt are locations of this Site, not
  separate page trees.

## What this folder guarantees

- **A `README.md` is never a page** — documentation, at any level of the tree.
- **An empty locale folder publishes nothing.** Preparing a language folder before writing
  its first page is valid and harmless.
- **A file name that is not a valid page name is ignored**, never published under a guessed
  route.
- **Markdown yields to JSON for the same route:** when both `markdown/de/de/berlin.md` and
  `json/de/de/berlin.json` exist, this Site serves the JSON representation — one route, one
  page.

## Where to go next

- **The full Markdown authoring guide:** [`../README.md`](../README.md)
- **The JSON counterpart:** [`../../json/de/README.md`](../../json/de/README.md)
- **What a page may say:** [`../../README.md`](../../README.md)
- **The model (Site → Page Hub → localization):** [`../../pages/README.md`](../../pages/README.md)
