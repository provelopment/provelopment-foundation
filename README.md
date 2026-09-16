# Provelopment Foundation

An open-source, re-brandable web platform template that helps small
businesses establish and maintain a web presence. Starts frontend-only,
architected to grow into full-stack without a rewrite.

Clone it, make it yours by editing **configuration, content, and assets
only**, then deploy — [`CUSTOMIZING.md`](CUSTOMIZING.md) walks you through
the whole process.

## One canonical presentation, one Foundation

The Foundation ships **ONE canonical presentation** — the site you get from the
shipped configuration. There is **no preset selector and no preset switching**:
the presentation is resolved by the shared UI engine (typography, rhythm, surface,
header, hero + density/content-width/radius) onto the renderer via `data-ui-*`
attributes — no per-presentation CSS, no per-presentation forks. See
`CUSTOMIZING.md` → *The `ui.presentation` block* for the full matrix.

> The former five-preset comparison feature (a header dropdown linking five
> externally hosted presentations) was **retired in 2026-09**; those sibling
> deployments are not part of the Foundation product.

## Tech Stack

- [Next.js](https://nextjs.org) 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4
- Vitest
- pnpm package manager
- Multi-lingual by design (`[locale]` routing, dictionaries, per-locale
  content)

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected
to the default locale.

## Making It Yours

1. Edit `site.config.json` — site name, tagline, contact, social links,
   navigation, enabled features. Every field is validated at build time.
2. Replace the Markdown pages in `content/pages/<locale>/` with your own.
3. Swap the assets — the source tree is `assets/` (`branding/`, `icon-library/`,
   `placeholders/`, `platform-marks/`) and `public/assets/` is its byte-identical
   runtime mirror (`pnpm assets:sync`). For your own graphics, replace
   `assets/branding/...` (e.g. `identity/favicon.svg`, `logos/lockup-horizontal.svg`
   → `logo-header.svg` **and** `logo-footer.svg` — both logo roles share that one
   coloured source) and re-run `pnpm assets:sync`; adopters may equally
   overwrite `public/assets/*` in place. The decorative header/footer graphics ship
   **blank by default** (a transparent placeholder) — the branded masters are
   retained at `assets/branding/page-graphics/`. The page banners are ordinary
   source assets too (`assets/branding/banners/`), never a runtime-only exception.
   [`BRAND_ASSETS.md`](BRAND_ASSETS.md) is the authoritative, complete
   **brand-asset swap contract** for every replaceable graphic role (filename,
   format, dimensions, transparency, crop behaviour, config key, disable
   procedure). The social-preview image needs no file: it is generated per locale
   by default, and `site.assets.ogImage` points it at your own 1200 × 630
   PNG/JPEG when you have one.
4. **Change the appearance without touching source:** side-bar/top/bottom menu
   presentation modes, sidebar disclosure icons/text (`ui.navigation.sidebar`),
   navigation icons/regions, and the primary CTA's icon/state
   (`ui.cta.*`) are all configuration. The primary CTA renders **once** in the
   shell's top region (below the header, above the content) at every width —
   never inside the sidebar, the bottom bar, or a mobile menu (P6-3C). Sidebar
   page icons render at **16 × 16** and come from the reusable icon library
   (`assets/icon-library/`) unless you configure your own; the sidebar open/close
   **control** renders at **24 × 24** and is left-aligned with the same ≈5px inset
   the shell CTA uses. The Foundation's brand colour is ONE value
   (`--ui-brand-accent` in `src/app/globals.css`) that drives both the wordmark and
   every theme-driven highlight. Replace any icon in
   `public/assets/`
   (in place or via `"icon": "my-icon.svg"`) — see
   `CUSTOMIZING.md` → *Configurable controls, assets & presentation modes (P5-5)*.
5. Add locales, deploy to Vercel, and keep up to date with upstream —
   all documented in [`CUSTOMIZING.md`](CUSTOMIZING.md).

## Operating manuals

This repository ships a complete **instruction-manuals/** package — the operational
knowledge required to adopt, configure, customize, upgrade, validate and deploy a
Foundation-derived site.

> **Start with [`instruction-manuals/README.md`](instruction-manuals/README.md).**

The manuals are **distributed artifacts** of a master source retained in the
Provelopment root project. Do not edit them here; changes are made upstream and
propagated (the index documents the propagation and parity procedure).

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit and architecture-boundary tests |
| `pnpm exec tsc --noEmit` | Typecheck |

## Project Layout

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the authoritative description
of the hexagonal (ports and adapters) boundaries:

```
src/app         # Next.js routes under src/app/[locale], layouts, globals.css tokens
src/components  # Presentation components (site, shell, and shared ui primitives)
src/core        # Framework-independent domain concepts and UI preset engine
src/application # Use-case ports and services
src/adapters    # Concrete integrations (filesystem content, analytics, booking, maps)
src/config      # Site configuration schema and loaders
config/i18n     # Localized JSON dictionaries (9 supported locales)
content         # Markdown collections (pages, legal, offerings, posts, testimonials, portfolio)
assets           # SOURCE asset tree: branding/ (banners·identity·logos·page-graphics) · icon-library/ · placeholders/ · platform-marks/ (edit here)
public/assets    # RUNTIME mirror of assets/** (logo-header.svg, logo-footer.svg, favicon.svg, banner-*.png, icon-*.svg, sidebar-*.svg) — written by scripts/sync-runtime-assets.mjs
tests           # Architecture boundary, unit, and CDP browser matrix tests
```

## Documentation

- [`BRAND_ASSETS.md`](BRAND_ASSETS.md) — **the authoritative brand-asset swap
  contract**: every replaceable graphic role, its exact filename/type/dimension
  contract, its config key, its fallback, and how to replace, swap or disable it
  without touching code
- [`instruction-manuals/README.md`](instruction-manuals/README.md) — **operating
  manuals**: adoption, upgrade, customization, branding/assets, content,
  validation, deployment, agent rules, troubleshooting
- [`CUSTOMIZING.md`](CUSTOMIZING.md) — downstream user guide: what to edit,
  adding locales, deploying, syncing with upstream
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — boundaries, dependency direction,
  internationalization blueprint
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — launch runbook (Vercel, domains,
  verification checklist)
- [`AGENTS.md`](AGENTS.md) — operating contract for AI coding agents

## Deployment

Your site deploys to Vercel directly from your own repository. See
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the complete runbook.


