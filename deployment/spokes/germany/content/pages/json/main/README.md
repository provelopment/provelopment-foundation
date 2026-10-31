# Site `de` — Germany, in JSON mode

This folder holds **one Site's** JSON pages: the German website `de` (**Germany**). The
folder name `de` is the Site's own code, and it is the first segment of every route below.

## How a file becomes a route

```text
json/de/de/<page>.json            →  /de/de/<page>
json/de/en/<page>.json            →  /de/en/<page>
json/de/de/home.json              →  /de/de      (the Home Page Hub)
```

- **`de`** is this Site (Germany). Its languages are the ones `site.config.json` configures
  for it — currently `de` (its default) and `en`.
- **The locale folder is the second segment.** One file per locale is one localized
  representation of a Page Hub.
- **The same name in two locales is ONE Page Hub**, conceptually: `de/home.json` and
  `en/home.json` are the German and English representations of the Home page.
- **Locations reuse these pages.** Berlin and Frankfurt are locations of this Site, not
  separate page trees; a page is authored once per language and read in every location.

## What this folder guarantees

- **A `README.md` is never a page** — documentation, at any level of the tree.
- **An empty locale folder publishes nothing.** Preparing a language folder before writing
  its first page is valid and harmless.
- **A file name that is not a valid page name is ignored**, never published under a guessed
  route.
- **JSON wins over Markdown for the same route:** when both `json/de/de/berlin.json` and
  `markdown/de/de/berlin.md` exist, this Site serves the JSON representation.

## Where to go next

- **The full JSON authoring guide:** [`../README.md`](../README.md)
- **The Markdown counterpart:** [`../../markdown/de/README.md`](../../markdown/de/README.md)
- **What a page may say:** [`../../README.md`](../../README.md)
- **The model (Site → Page Hub → localization):** [`../../pages/README.md`](../../pages/README.md)
