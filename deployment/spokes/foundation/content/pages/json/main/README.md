# Site `ww` — Global, in JSON mode

This folder holds **one Site's** JSON pages: the country-wide website `ww` (**Global**).
The folder name `ww` is the Site's own code, and it is the first segment of every route
below.

## How a file becomes a route

```text
json/ww/en/<page>.json            →  /ww/en/<page>
json/ww/de/<page>.json            →  /ww/de/<page>
json/ww/en/<section>/<page>.json  →  /ww/en/<section>/<page>
json/ww/en/home.json              →  /ww/en       (the Home Page Hub)
```

- **`ww`** is this Site (Global). Its languages are the ones `site.config.json` configures
  for it.
- **The locale folder is the second segment** (`en`, `de`, …). One file per locale is one
  localized representation of a Page Hub.
- **The same name in two locales is ONE Page Hub**, conceptually: `en/about.json` and
  `de/about.json` are the English and German representations of the same About page.
- **`home.json`** is the Home Page Hub of this Site.

## What this folder guarantees

- **A `README.md` is never a page** — documentation, at any level of the tree.
- **An empty locale folder publishes nothing.** Preparing a language folder before
  writing its first page is valid and harmless.
- **A file name that is not a valid page name is ignored**, never published under a
  guessed route.
- **JSON wins over Markdown for the same route:** when both
  `json/ww/en/services.json` and `markdown/ww/en/services.md` exist, this Site serves the
  JSON representation.

## Where to go next

- **The full JSON authoring guide:** [`../README.md`](../README.md)
- **The Markdown counterpart:** [`../../markdown/ww/README.md`](../../markdown/ww/README.md)
- **What a page may say:** [`../../README.md`](../../README.md)
- **The model (Site → Page Hub → localization):** [`../../pages/README.md`](../../pages/README.md)
