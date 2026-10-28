# Provelopment Foundation

An **open-source, re-brandable website platform** that turns explicitly declared content,
localized Page documents and owner-scoped assets into accessible, multilingual websites.

Foundation separates five facts that are often conflated:

1. **the product source** — this repository and its platform code;
2. **an immutable release** — a verified payload built from a product source commit;
3. **an Installation** — one adopter's autonomous deployment of one release;
4. **an Entity** — the owner of authored content, identity and assets;
5. **a publication binding** — the exact host and path that serves that Entity.

The repository also contains a **reference Installation** used for demonstration and acceptance.
It is authored data, not part of an immutable platform release.

## Quick start

Tested with Node.js 24.x and pnpm 11.6.0:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The request is redirected to the default public entry of the
reference Installation.

The reference Installation declares two Spokes and two Entities:

| Public host | Spoke | Entity / Facet / Site | Prefix | Locales |
| --- | --- | --- | --- | --- |
| `foundation-template.provelopment.com` | `foundation` | `e_…0001` / `foundation` / `main` | `ww` | `en`, `de` |
| `foundation-template-germany.provelopment.com` | `germany` | `e_…0002` / `germany` / `main` | `de` | `de`, `en` |

The prefixes are **publication path prefixes**, not countries, locales or Site identities.
`/de/en/berlin` is an English Page named `berlin` published under the prefix `de`; it does not
assert that a person or business is located in Germany.

## The current EFS model

The ownership tree is:

```text
Entity → Facet → Site → Page → localized representation
```

- **Entity** owns content and portable identity.
- **Facet** groups related Sites inside one Entity.
- **Site** is a content context. It is **not** geographic, a domain, a locale or a hosting tier.
- **Page** is language-neutral: its ID and route do not change when a translation is added.
- **Representation** is the localized source document that answers one locale.

The operational tree is separate:

```text
Foundation Installation → Spoke Hub → Spoke
```

A Spoke is a complete website/domain operating context. Publication is **explicit and
many-to-many**: one Entity may be published by several Spokes, and one Spoke may publish several
Entities. A publication names its owning `spokeId` (and `spokeHubId` when the Installation uses
identified Hubs), the Entity, the Facet and one or more explicit host/path bindings.

The authority for the reference Installation is
[`deployment/efs/manifest.json`](deployment/efs/manifest.json). The Spoke hierarchy is
[`deployment/spokes.json`](deployment/spokes.json). An EFS host that either file does not claim is
refused; there is no implicit Spoke, default Entity, geographic fallback or second production
runtime.

### Where authored material lives

EFS Page sources are owner-scoped inside the EFS capsule:

```text
deployment/efs/capsule/<entityId>/<facetId>/<siteId>/
├── pages/<pageId>/<locale>.md
├── pages/<pageId>/<locale>.json
├── dictionaries/<locale>.json
└── assets/…
```

For example:

```text
deployment/efs/capsule/e_00000000000000000000000001/foundation/main/pages/about/en.md
→ https://foundation-template.provelopment.com/ww/en/about
```

A Spoke's `site.config.json`, `config/i18n/` and `content/assets/` supply the approved shared
presentation shell (dictionary, navigation, footer, branding and layout) when a publication names
`presentationSiteCode`. The EFS capsule remains the authority for the Page content itself.

### Publishing a Page

A Page becomes public only when **both** declarations exist:

1. the Page, route and representations are declared in `deployment/efs/manifest.json`;
2. a validated source exists for every declared representation in the capsule.

```json
{
  "id": "services",
  "route": ["services"],
  "fallbackLocaleKey": "en",
  "representations": [{ "locale": "en" }, { "locale": "de" }],
  "properties": { "nav.label": { "value": "Services", "public": true } }
}
```

Adding only a file, or only a manifest entry, is refused by the establishment/runtime integrity
checks. There is no folder-derived address and no implicit publication.

JSON wins over Markdown for the same Page and representation. JSON is validated against the one
[Page-document schema](src/core/page-document.ts); malformed JSON is refused with the source and
property named, never rendered as fallback prose.

### A link your application supplies

Sometimes a Page names a destination the platform must not know — an address an application owns and may
change. A JSON Page declares it as a **reference**, and the application answers it when the page renders:

```json
{
  "schemaVersion": 1,
  "title": "Request a quotation",
  "links": { "quotation-email": { "reference": "applicationLink", "key": "public-contact-email" } },
  "sections": [
    { "type": "prose", "body": "Email **[us](#link:quotation-email)** with your requirements." },
    {
      "type": "actions",
      "actions": [
        { "label": "Email us about a quotation", "link": "quotation-email", "variant": "primary" }
      ]
    }
  ]
}
```

- `links` maps a **declaration id** (lowercase words joined by single hyphens) to one reference:
  `reference` is a closed set — today exactly `applicationLink` — and `key` is an **opaque** name your
  application understands. The platform validates their shape and never their meaning, so the same Page
  serves every host and survives a rename on the application side.
- An action sets **exactly one** destination form: `href`, `route` or `link`; two is refused, none is
  refused. A **list item** accepts the same three and may also set none — a plain label — so every
  existing list keeps working.
- In Markdown, `[label](#link:<declaration-id>)` is a reserved marker. The whole `#link:` namespace is
  reserved: a malformed spelling (`#link:`, `#link:a_b`, `#LINK:x`) is never turned into a clickable
  fragment. Ordinary fragments — `#hours`, `#link-to-services` — are untouched, and no scheme, allowlist
  or sanitiser rule was added.
- Your application supplies the destination at render time. A marker, a `link` action and a `link` list
  item render as an **anchor** only when the application answers with a destination this platform
  classifies; otherwise the author's words appear with **no anchor**, never as a broken fragment.
- A marker that is malformed, or that names a declaration the document does not carry, is refused when
  the Page is read — by the same contract that reads published content, naming the field and the marker —
  because no host could ever resolve it.
- Foundation ships no resolver. Without one, a declared link renders as its words alone — which is the
  correct behaviour for a site that has no such application behind it.

### Public, unlisted and privacy

Visibility is declared **per localized JSON representation**:

```json
{
  "schemaVersion": 1,
  "title": "Internal launch note",
  "visibility": "unlisted",
  "sections": [{ "type": "prose", "body": "Reachable by URL, not advertised." }]
}
```

- absent `visibility` ⇒ `public`;
- `unlisted` remains directly reachable at its exact authorized URL;
- its response carries `robots: noindex, nofollow`;
- it is absent from the sitemap, generated navigation, `hreflang` and `x-default`;
- missing-translation fallback never redirects to an unlisted representation;
- other representations of the same Page publish independently;
- the reserved Home document may not be unlisted;
- Markdown has no visibility vocabulary and is always public;
- **unlisted is not private and is not access control**. It authenticates nobody and protects no
  secret.

### Addresses, canonical URLs and changing host

Canonical URLs, Open Graph URLs, alternates, assets and sitemap entries are derived from the
effective **publication binding**, never from `site.url`. `site.url` is optional informational
configuration. A custom-domain change is a publication/address change; it is not a new Entity
identity or a transfer of content ownership.

## Establishment and release lifecycle

These are different operations:

| Operation | What changes |
| --- | --- |
| **Source commit** | Foundation product code or documentation in Git |
| **Immutable release** | a verified platform payload built from an exact source commit |
| **Establishment** | one autonomous Installation created from a release plus an authored seed |
| **Update** | the adopter's configuration, content or assets; the release is unchanged |
| **Upgrade** | the Installation adopts a different immutable release |
| **Deployment** | a provider runs the committed Installation source |

```bash
pnpm release:build --release <identity> --source <commit> --dest <empty-directory>
pnpm installation:establish \
  --release <identity> --payload <release-directory> \
  --seed <authored-capsule> --target <installation-root> \
  --name "<installation-name>" --repository "<installation-repository>"
```

Release construction, establishment and clean-room verification are documented in
[`scripts/release/README.md`](scripts/release/README.md) and
[`scripts/installation/README.md`](scripts/installation/README.md). An Installation never upgrades
merely because Foundation `main` changes.

## Capabilities and boundaries

Foundation includes safe Markdown and declarative JSON authoring, localized Page representations,
explicit many-to-many publication, owner-scoped assets and dictionaries, shared presentation
shells, canonical/OpenGraph/sitemap/robots output, accessibility contracts, contact inquiry
adapters (stub or webhook), static booking and map action integrations, and configured analytics.

Foundation does **not** include a CRM, accounts, authentication, customer Dashboard, reseller
permissions, commerce, payments, scheduling inventory, AI assistance or automatic geographic
inference. `my.provelopment.com` is a public website hosting address, not a portal. The optional
future Dashboard is a separate application and is not a dependency of ordinary public websites.

No automatic timezone or currency derivation exists in EFS. Place, address, contact and authored
opening-hours facts may be declared as properties; they do not create geographic routing, locale
selection, “open now” computation, timezone/DST behavior or currency conversion.

## Validate

Use the repository's real gates:

```bash
pnpm assets:check
pnpm exec tsc --noEmit
pnpm lint
pnpm test:foundation
pnpm test:deployment
pnpm build
pnpm test:browser
pnpm release:classify
```

`pnpm test:browser` requires a local Chrome/Chromium/Edge binary. Release payload verification is
`pnpm release:verify`; it is not implied by a green source build.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — current EFS boundaries and retained legacy-engine notes
- [`CUSTOMIZING.md`](CUSTOMIZING.md) — configuration and authoring reference
- [`BRAND_ASSETS.md`](BRAND_ASSETS.md) — the runtime asset-role and replacement contract
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deployment runbook
- [`deployment/README.md`](deployment/README.md) — the reference Installation
- [`instruction-manuals/README.md`](instruction-manuals/README.md) — adopter operating manuals
- [`AGENTS.md`](AGENTS.md) — repository working contract

Historical EFS evidence and conversion records are retained as evidence, not current instructions.

## Public addresses

| Address | Meaning |
| --- | --- |
| [`provelopment/provelopment-foundation`](https://github.com/provelopment/provelopment-foundation) | This public source repository and its reference Installation |
| <https://foundation-template.provelopment.com> | The Foundation Spoke's public reference website |
| <https://foundation-template-germany.provelopment.com> | The Germany Spoke's public reference website |
| <https://foundation.provelopment.com> | The separate Foundation project website; not this repository |
| <https://www.provelopment.com> | The commercial Provelopment website |

The demonstration websites are not a distribution channel and do not imply that a customer
Installation exists.

## Licence

Apache License 2.0 — see [`LICENSE`](LICENSE). The licence grants no rights in the Provelopment
name, logos or branding. Third-party material is not relicensed by inclusion.
