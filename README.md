# Provelopment Foundation

An **open-source**, re-brandable web platform template for small businesses: a
**configuration-first** site foundation that turns JSON, Markdown and assets into a
complete, accessible, multilingual website. Starts frontend-only, architected to
grow into full-stack without a rewrite.

This repository is the **reusable product**. It ships **no brand of its own** — a
starter page, neutral placeholder graphics, one default language and a complete,
reusable architecture. You make it yours by editing **configuration, content and
assets only**; platform code does not need to change.

## Why it exists

Most small-business sites are rebuilt from scratch. The Foundation provides the
proven parts once — routing, a content system, localization, a configurable shell,
theme tokens, asset roles, accessibility, SEO metadata, validation and deployment —
so a new site starts from a working baseline instead of an empty folder.

## Quick start

Tested from a fresh clone (Node.js 22+, pnpm):

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you are redirected to the
default locale. The starter renders immediately: no content or artwork has to be
deleted first.

Before production, **replace the placeholder values**: `site.url`, `site.name`,
`site.tagline` and `site.description` in `site.config.json`, the starter copy in
`config/i18n/en.json`, and the graphics in `assets/placeholders/`.

## Repository structure

```
src/app         # Next.js App Router routes under src/app/[locale], layouts, globals.css tokens
src/components  # Presentation components (site, shell, shared ui primitives)
src/core        # Framework-independent domain concepts and the UI engine
src/application # Use-case ports and services
src/adapters    # Concrete integrations (filesystem content, analytics, booking, maps)
src/config      # Site configuration schema and loaders
config/i18n     # Localized JSON dictionaries (one shipped locale: en)
content         # Markdown collections — EMPTY by default (pages, legal, offerings, posts, testimonials, portfolio)
assets          # SOURCE asset tree: placeholders/ (neutral defaults) · icon-library/ · platform-marks/  (edit here)
public/assets   # RUNTIME mirror of assets/** — written by scripts/sync-runtime-assets.mjs
scripts         # Deterministic asset mirror (assets:sync / assets:check)
tests           # Architecture-boundary, unit and CDP browser-matrix tests
```

The Foundation ships **one authored page** (the configuration-driven landing page)
and **no content files**: every collection is empty until you add Markdown. Technical
routes (`/sitemap.xml`, `/robots.txt`) and generated metadata are not content pages.

## Customize identity

1. **Configuration** — `site.config.json` is validated at build time (a bad edit
   fails with an actionable message). It drives the site name, tagline,
   description, contact details, social links, navigation, an optional secondary
   footer navigation group, enabled capabilities and the resolved UI.
2. **Text and colour** — the visible landing-page copy lives in
   `config/i18n/en.json`; the single theme accent is one value in
   `src/app/globals.css` (`--ui-foundation-accent`). Change it and the whole site
   re-colours; keep it dark enough to meet the WCAG AA contrast gate.
3. **Graphics** — replace the neutral files in `assets/placeholders/`
   (`logo-header.svg` serves the header **and** footer logo role, `favicon.svg`,
   `header-graphic.svg`, `footer-graphic.svg`, `sidebar-*.svg`), then run
   `pnpm assets:sync`. You may equally point `site.assets.*` at your own absolute
   URLs. [`BRAND_ASSETS.md`](BRAND_ASSETS.md) is the complete role contract
   (filename, format, dimensions, config key, replacement and disable procedure).

The template ships **no** `assets/branding/` tree and no example artwork: identity
is yours to supply. Artwork-only roles (page banners, page background, status
graphic, social-preview image) ship nothing and stay off until configured.

## Add content

Create `content/<collection>/<locale>/<slug>.md` with `title` frontmatter — e.g.
`content/pages/en/about.md` creates `/en/about`. The collections are `pages`,
`legal`, `offerings`, `posts`, `testimonials` and `portfolio`; a page whose file is
absent returns a proper 404 rather than an empty shell. Navigation entries are
configuration (`navigation[]`), and their labels come from
`config/i18n/en.json` → `navigation.items`.

### Author your home page (optional)

The locale root is configuration-driven by default. To author it as **content**
instead, add `content/pages/<locale>/home.md` — the locale-root route then renders it
through the same content repository as every other page (same Markdown treatment, same
per-locale fallback). A site that authors no `home.md` keeps the generic starter
homepage, so this is purely additive.

The slug is reserved: `/home` is never generated as a public route and never listed in
the sitemap, because the home page's real URL is the locale root.

## Enable capabilities

Optional capabilities are off in the starter and are enabled purely by
configuration: analytics (`vercel`), maps directions links (`google`), booking
(`external-url`), the contact inquiry provider (`stub` or `webhook`), and the
`offerings` / `testimonials` / `portfolio` / `blog` collections. Their routes,
adapters and components ship with the template — see
[`CUSTOMIZING.md`](CUSTOMIZING.md).

## Validate

These are the repository's real gates (all runnable locally; the first five also
run in CI):

```bash
pnpm assets:check            # runtime mirror is byte-identical to its sources
pnpm exec tsc --noEmit       # types
pnpm lint                    # eslint
pnpm test                    # unit + architecture-boundary tests (vitest)
pnpm build                   # production build
pnpm audit                   # dependency audit
pnpm test:browser            # headless-Chrome CDP browser matrix (needs Chrome)
```

## Deploy

Your site deploys from **your own repository** to Vercel. Follow
[`DEPLOYMENT.md`](DEPLOYMENT.md). No environment variables are required for a default
build.

> This **template repository has no production deployment of its own**: GitHub is
> its distribution and documentation surface, and CI is its gate.

## Upgrade

Keep your clone connected to the template repository and absorb new revisions the
documented way:

```bash
git remote add upstream https://github.com/provelopment/provelopment-foundation.git
git fetch upstream
```

Then follow
[`instruction-manuals/foundation-upgrade.md`](instruction-manuals/foundation-upgrade.md),
which classifies platform-owned vs adopter-owned material and protects your
configuration, content, assets and branding.

## Documentation

- [`CUSTOMIZING.md`](CUSTOMIZING.md) — the downstream user guide: what to edit, adding locales, deploying, staying in sync
- [`BRAND_ASSETS.md`](BRAND_ASSETS.md) — the authoritative **brand-asset swap contract**: every replaceable graphic role
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — the launch runbook
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — boundaries, dependency direction, internationalization blueprint
- [`instruction-manuals/README.md`](instruction-manuals/README.md) — the operating manuals: adoption, upgrade, customization, branding, content, validation, deployment, troubleshooting
- [`AGENTS.md`](AGENTS.md) — the operating contract for AI coding agents

## The live Foundation site

The real-world example is **<https://foundation.provelopment.com>** — the Provelopment
Foundation's own website: real content, its own brand installation, and the capabilities
this template provides.

Its source is **not** in this repository and is **not** part of the public template
distribution. That site is served by the private downstream application
`provelopment/provelopment-web`, where it is one **site profile** among several — a
multi-site application that derives from this template. A previously separate
reference-site repository (`provelopment-foundation-site`) was archived when those sites
were consolidated, and it is **not** the current implementation.

You do not need that site, its application or its content to use this template: this
repository is a complete, standalone starting point.

## Licence

**Provelopment Foundation is licensed under the Apache License, Version 2.0** — see
[`LICENSE`](LICENSE). You may use, modify, distribute and commercially exploit the
Foundation's own code and documentation, including inside your own proprietary website
projects, on the terms that licence sets out.

The licence grants no rights in the **Provelopment name, logos or branding**: Apache-2.0
is a copyright licence and expressly excludes trademark rights. A separate Provelopment
trademark/brand policy is planned and is **not** part of this repository.

### Third-party material is NOT relicensed

Apache-2.0 covers the Foundation's own material. Bundled third-party work keeps its own
licence and attribution, exactly as it was:

- **Tabler Icons** (MIT) — the icon library under `assets/icon-library/`. The upstream
  MIT notice is bundled at
  [`assets/icon-library/licensing/TABLER-ICONS-MIT.txt`](assets/icon-library/licensing/TABLER-ICONS-MIT.txt),
  with per-icon provenance in
  [`icon-provenance.json`](assets/icon-library/licensing/icon-provenance.json).
- **Third-party platform marks** (WhatsApp, Telegram, Facebook, Messenger, Instagram,
  LinkedIn, GitHub) — brand-owner assets governed by each owner's own brand rules, held
  under `assets/platform-marks/` alongside their provenance records.

No `NOTICE` file is included, because the work ships no upstream `NOTICE` text to
reproduce — Apache-2.0 §4(d) only applies when the distributed work already contains one.
The attribution obligations above are recorded next to the material they belong to.

Documentation is covered by the same Apache-2.0 grant as the code for now; a dedicated
documentation-licensing decision may be revisited later. The private `provelopment.com`
application and its content are **not** made open source by this licence.