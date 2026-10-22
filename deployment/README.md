# This deployment

This directory is the **reference Installation capsule**: the authored and operational material
that belongs to this demonstration, kept separate from the Foundation platform that renders it.

It is not an immutable release and not a customer Installation. It demonstrates the current EFS
model on two public hosts.

## Current topology

```text
Foundation Installation
├── Spoke foundation
│   └── publication foundation-publication
│       ├── Entity e_…0001
│       ├── Facet foundation
│       ├── Site main
│       └── binding foundation-template.provelopment.com /ww
└── Spoke germany
    └── publication germany-publication
        ├── Entity e_…0002
        ├── Facet germany
        ├── Site main
        └── binding foundation-template-germany.provelopment.com /de
```

The Sites are both named `main`. `ww` and `de` are **publication path prefixes**, not countries,
Site codes or locale authorities. `de` is also a locale path key where a Page declares German;
the two facts are independent.

## What is in here

| Path | What it is |
| --- | --- |
| `efs/manifest.json` | The publication authority: Entities, Facets, Sites, Pages, representations, optional properties and explicit host/path bindings. |
| `efs/capsule/<entityId>/<facetId>/<siteId>/` | Owner-scoped Page sources, dictionaries and assets. JSON wins over Markdown for the same representation. |
| `spokes.json` | The Installation's explicit Spoke hierarchy and inspection policy. |
| `spokes/foundation/` | The Foundation Spoke's presentation shell: `site.config.json`, `config/i18n/` and `content/assets/`. |
| `spokes/germany/` | The Germany Spoke's independent presentation shell. |
| `tests/` | This deployment's own unit, integration and browser acceptance. |
| `foundation-baseline.json` | The immutable Foundation release this reference Installation adopts. |
| `AGENTS.md` | The working contract for this deployment. |
| `.test/` | Ignored ephemeral workspace; must be empty or removed when work finishes. |

## Page sources

A Page is served from the capsule, not from `spokes/**/content/pages/**`:

```text
efs/capsule/e_00000000000000000000000001/foundation/main/pages/home/en.json
efs/capsule/e_00000000000000000000000001/foundation/main/pages/about/en.md
```

The matching Page declaration in `efs/manifest.json` supplies:

- the language-neutral `id` and `route`;
- the declared locales / representations;
- the optional same-Page fallback;
- optional inherited properties and the public navigation label.

Both declarations are required. A source without a Page declaration is unreachable; a declaration
without a source is refused by the establishment/runtime integrity checks.

## Presentation shells

A publication may name `presentationSiteCode`. This reference does:

- `foundation-publication` → `ww`;
- `germany-publication` → `de`.

That names a Site in the **owning Spoke's** `site.config.json` and supplies the shared dictionary,
navigation, footer, branding, layouts and accessibility chrome. It does not change the EFS Entity,
Facet, Site or Page identities. With no compatible shell, the EFS document boundary renders the
Page alone.

## Visibility

Publication visibility belongs to each localized JSON Page document:

- absent ⇒ public;
- `"visibility": "unlisted"` ⇒ directly reachable, `noindex, nofollow`, absent from sitemap,
  navigation, `hreflang` and `x-default`;
- other representations of the same Page are independent;
- the Home document may not be unlisted;
- Markdown has no visibility vocabulary.

The manifest deliberately has **no Page-level `visibility` field**. Adding one is refused.

## Assets and dictionaries

- Owner content assets: `efs/capsule/<entity>/<facet>/<site>/assets/**`, served through binding-
  derived owner asset URLs.
- Owner dictionaries: `efs/capsule/<entity>/<facet>/<site>/dictionaries/<locale>.json`.
- Presentation-shell artwork: each Spoke's `content/assets/**`, mirrored by `pnpm assets:sync`.

No Entity/Facet/Site path or EntityID is exposed to visitors.

## Validation

```bash
pnpm assets:check
pnpm exec tsc --noEmit
pnpm lint
pnpm test:deployment
pnpm build
pnpm test:browser:deployment
```

The deployment's tests may read this shipped configuration but must not rewrite it. Browser
scenarios run against disposable copies where mutation is required.
