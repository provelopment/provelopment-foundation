# Customizing Your Site

This guide is for users who cloned the Provelopment Foundation template and
want to turn it into their own website. The core idea:

> **You customize configuration, content, and assets only.**
> Platform code (`src/core`, `src/application`, `src/adapters`,
## CURRENT EFS CUSTOMIZATION MODEL

This section is authoritative for the production runtime. Later sections that describe
country-coded Sites, regional pages, Location selectors or computed timezone behavior document the
retained legacy test runtime and historical releases; do not use them to author an EFS Installation.

### What you change

| Surface | Where |
| --- | --- |
| Entity, Facet, Site, Page and representation declarations | `deployment/efs/manifest.json` |
| Owner-scoped Page content | `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/...` |
| Owner-scoped dictionaries/assets | the same owner path's `dictionaries/` and `assets/` |
| Publication hosts, prefixes and Spoke ownership | `deployment/efs/manifest.json` |
| Spoke hierarchy | `deployment/spokes.json` |
| Shared presentation shell | the owning Spoke's `site.config.json`, `config/i18n/` and `content/assets/` |

The manifest and a validated source are both required for a Page to be served. There is no
folder-derived publication and no implicit Site/locale/page fallback outside the declarations.

### Adding a Page

1. Declare the language-neutral Page in the Site's `pages` array:

```json
{
  "id": "services",
  "route": ["services"],
  "fallbackLocaleKey": "en",
  "representations": [{ "locale": "en" }, { "locale": "de" }],
  "properties": { "nav.label": { "value": "Services", "public": true } }
}
```

2. Add one source per declared representation:

```text
deployment/efs/capsule/<entity>/<facet>/<site>/pages/services/en.md
deployment/efs/capsule/<entity>/<facet>/<site>/pages/services/de.json
```

JSON is the higher-precedence format for the same representation. A declared representation with
no source, an undeclared source, a duplicate Page ID/route or a malformed document is refused.

### A link your application supplies

A Page sometimes has to name a destination you do not want to write down — one an application behind the
site owns and may change. Declare a **reference** and let that application answer it at render time:

```json
{
  "schemaVersion": 1,
  "title": "Request a quotation",
  "links": { "quotation-email": { "reference": "applicationLink", "key": "public-contact-email" } },
  "sections": [
    { "type": "prose", "body": "Email **[us](#link:quotation-email)** with your requirements." }
  ]
}
```

| Part | What it is | Who decides it |
| --- | --- | --- |
| declaration id (`quotation-email`) | the name you use inside THIS document | you, in `links` |
| `reference` | a closed kind — today exactly `applicationLink` | the platform |
| `key` (`public-contact-email`) | an opaque name the application understands | the application |
| the destination | produced when the page renders | the application |

Three things follow, and they are the whole contract:

- **A control names one destination.** `href`, `route` and `link` are mutually exclusive for an action
  (exactly one is required) and for a list item (at most one; a plain label is still a list item). The
  actions section, a card's action, a hero's actions and a list all obey the same rule.
- **Words without a destination are normal.** If the application answers nothing — the link is not offered,
  was revoked, or the site has no such application wired at all — the label is shown as text with no anchor.
  Nothing is invented, and there is never a broken `#…` fragment in the page.
- **A marker must name something.** The whole `#link:` namespace belongs to this contract: `[label](#link:<id>)`
  that is malformed (`#link:`, `#link:a_b`, `#LINK:x`), or whose id the document does not declare, is refused
  when the page is read — with the field and the marker named — and it is never rendered as a clickable
  fragment. The same contract runs when published content is read at serve time, so authoring and serving
  cannot disagree.

The `key` is deliberately opaque. Foundation validates its shape only, which is what lets the same document
serve every site and lets the application rename its own side without re-authoring the page. If you need a
link whose AUTHORITY is different (resolved from content, from configuration, or under another trust rule),
that is a platform contract change, not a new string in this field.

### Configuration authority

- `publication.host` (the binding) owns canonical URLs, `hreflang`, Open Graph URLs, assets and the
  sitemap.
- `site.url` is optional and informational; do not use it to change the public origin.
- A custom-domain change edits the publication binding. It does not mint a new Entity or transfer
  content ownership.
- A Spoke's `site.config.json` governs its approved presentation shell and contact features; it
  does not decide EFS Page visibility.

### Visibility and unlisted content

Visibility belongs to each localized JSON Page document:

```json
{
  "schemaVersion": 1,
  "title": "Launch note",
  "visibility": "unlisted",
  "sections": [{ "type": "prose", "body": "Reachable, not advertised." }]
}
```

- absent ⇒ public;
- `unlisted` ⇒ served at its exact URL, `noindex, nofollow`, absent from sitemap/navigation/
  `hreflang`/`x-default`;
- public and unlisted representations of the same Page are independent;
- fallback never redirects to an unlisted representation;
- Home may not be unlisted;
- Markdown has no visibility vocabulary;
- **unlisted is discoverability control, not privacy or access control.**

The manifest has no Page-level `visibility`; adding one is refused. This is the single publication
decision per effective representation.

### Geographic and time facts

A Site is not a country. IDs, names, routes, Spokes and publication prefixes never imply geography
or language. Place/address/contact/opening-hours facts may be authored as optional properties, but
EFS has **no automatic timezone or currency derivation**, no “open now” computation and no
location-derived locale. Any such behavior would require a separate accepted contract.

### Capability configuration

Analytics, maps directions, booking links and contact inquiry configuration remain in the owning
Spoke's `site.config.json`. The contact Server Action matches the exact host/prefix binding, resolves
the owning Spoke, then reads that Spoke's `features.contact`. Different Spokes may share one host
with disjoint prefixes; each resolves its own receiver. An unclaimed host/prefix, a missing trusted
path, or a forged form/header/EntityID has no destination. Two Entities in one Spoke intentionally
share that Spoke's receiver.

`CONTACT_WEBHOOK_URL` and `CONTACT_WEBHOOK_TOKEN` are installation-wide defaults. For distinct
Spoke receivers, set the additive `CONTACT_WEBHOOK_URL__<SPOKE_KEY>` and
`CONTACT_WEBHOOK_TOKEN__<SPOKE_KEY>` overrides. A conventional lowercase flat id keeps the published
key (`acme-spoke` → `ACME_SPOKE`); any other flat identity is UTF-8-hex encoded
(`__ENC_FLAT_<HEX>`). An identified Hub ALWAYS uses the injective UTF-8-hex pair
`__ENC_HUB_<HUB_HEX>__<SPOKE_HEX>` (`hub-one`/`client-a` →
`__ENC_HUB_6875622D6F6E65__636C69656E742D61`); hex contains no `_`, so the separator cannot be
confused with content such as consecutive hyphens. The old lossy key is rejected when it is
ambiguous, so two ids such as `client-a`/`client_a` — or Hub `a--b` + Spoke `c` and Hub `a` + Spoke
`b--c` — cannot silently share a receiver. The receiver owns downstream routing/retention; Foundation sends no Spoke administrative IDs;
the documented `origin` identifies the publication/Entity/Facet for attribution, and Foundation is not a CRM.

The webhook payload includes an optional server-derived `origin`
(`publicationId`, `bindingId`, `entityId`, `facetId`, optional `siteId`/`locale`, `host`, `path`) so a
shared receiver can attribute an inquiry to the published website. It is never populated from a form
field and contains no filesystem path, credential or visitor telemetry; existing clients may ignore it.


> `src/components`) should not need modification for rebranding.

---

### A contact form your Site owns (`contactForm`)

A contact form is **three authored pieces**, never one:

| Piece | Where | What it says |
| --- | --- | --- |
| The section | a JSON Page, `schemaVersion: 1` | "this Page hosts the form authored as `formRef`" |
| The Site record | `communication.contactForms` in that Spoke's `site.config.json` | what the Site offers, where, and to which publications |
| The private policy | `<spoke root>/config/contact-form-policy.json` | who receives it and who it is sent from — server-only |

**1. The Page section.** In a declarative (JSON) Page:

```json
{
  "type": "contactForm",
  "formRef": "your-form-key"
}
```

`formRef` is an opaque, lowercase, hyphenated key. The section carries **no** recipient, sender, transport or
authorization — page content must never be able to describe a mailbox.

**2. The Site record.** Keyed by the Site's **EFS Site id** (the id the verified route resolves — for the reference
Site, `main`), *not* by its presentation Site code (`sites[].code`, e.g. `ww`). Presentation codes are not
authorization identities:

```json
"communication": {
  "contactForms": {
    "main": {
      "formRef": "your-form-key",
      "enabled": true,
      "mode": "simple",
      "transport": "offline",
      "placement": { "page": "contact" },
      "authorizationRefs": ["your-canonical-binding-id"]
    }
  }
}
```

- `mode` — `off` (inactive), `simple` (one step; the only mode with a shipped presentation), `advanced` (authored,
  no presentation shipped).
- `transport` — `none` (inactive) or `offline` (Foundation's demonstration transport).
- `placement` — `{ "page": "<page id>" }` or `{ "siteWide": true }`. Rendering and submission read this one value.
- `authorizationRefs` — the canonical binding ids allowed to expose this form. Authoring an id here **is** the act
  of authorizing that publication; there is no wildcard.

**3. The private policy** — server-only, read at submission time from
`<spoke root>/config/contact-form-policy.json` (one fixed path; no request value selects it):

```json
{
  "schemaVersion": 1,
  "sites": {
    "main": {
      "recipients": [{ "address": "someone@example.com", "kind": "to" }],
      "sender": { "fromAddress": "website@example.com", "fromDisplayName": "Your site", "replyTo": "visitor" }
    }
  }
}
```

It is keyed by EFS Site id **inside the owning Spoke's own file**, which is what keeps two Spokes that both declare
a Site `main` apart. Never put these values in `site.config.json`: client components import it.

**The demonstration is offline, on purpose.** The shipped transport transmits nothing, stores nothing and needs no
credential. A visitor is told so *before* entering anything, and the outcome says only that the message reached
this server and was discarded. Keep these four states distinct when you talk about it:

| State | Meaning here |
| --- | --- |
| HTTP submission | the browser posted to a real Server Action |
| Offline processing | Foundation validated, authorized and drove the pinned Connect use case |
| Provider acceptance | **not** claimed — no provider is contacted |
| Actual delivery | **not** claimed, and not observable here at all |

**It fails closed.** No form renders, and no submission sends, when: the Page authors no section; the Site authors
no record; the record is disabled or names a mode Foundation cannot present; the section and the record name
different forms; the record does not place the form on this Page; the verified publication is not in
`authorizationRefs`; or the Spoke authors no valid private policy. A missing, unreadable, malformed or wrongly
shaped policy file answers "no policy" — never "inherit someone else's", never "fall back to the default Site".

**If you want real delivery**, that is yours to add: supply your own `MailTransportPort` and your own policy
source in *your* application, plus the abuse controls a public form needs (rate limiting, spam defence, size
limits, a privacy notice, retention rules). Do not repoint the demonstration transport at a real mailbox, and do
not ship your credentials in a page, a record or a client bundle.

**In a clean-room Installation** established from a release there is no policy file and no record, so the
capability is simply absent until its owner authors all three pieces.

**Public contact details** are separate and unaffected: the public `mailto:`/contact link is a configured value
projected through the page-document `applicationLink` mechanism, and `public-contact` never reads the private
policy.


## What is the Provelopment Foundation?

There are **two distinct artifacts**, and they are not the same repository:

| Artifact | Repository | Role |
| --- | --- | --- |
| **Foundation source repository** | [`provelopment/provelopment-foundation`](https://github.com/provelopment/provelopment-foundation) | **This repository** — the source of the reusable platform, and also the home of a **concrete reference Installation** (`deployment/spokes.json` with the `foundation` and `germany` Spokes) used for demonstration, acceptance and authoring examples. This is what you clone. |
| **The live Foundation site** | `provelopment/provelopment-web` (private) | The Provelopment Foundation's own website, deployed at `foundation.provelopment.com`. It is one **site profile** in a private multi-site application that derives from this template. Its source is not part of the public template distribution. |

Three artifacts must not be confused:

```text
SOURCE REPOSITORY (this one)   the platform source together with the concrete
                              reference deployment used for demonstration,
                              acceptance and authoring examples
IMMUTABLE FOUNDATION RELEASE  platform-only; built from this source and EXCLUDES
                              deployment/**
INDEPENDENT INSTALLATION      that platform release combined with its own authored
                              capsule/seed
```

The reference deployment is therefore a property of **this repository**, never of the
immutable Foundation release: a release carries no `deployment/**` at all.

The dependency direction is **template → adopting site**: a site adopts the template, it
does not define it. The live Foundation site is a useful real-world example to compare
against — but this repository is a complete, standalone starting point, and you do not
need that site, its application or its content to build yours.

`example.com`, `hello@example.com`, the booking/contact/maps/connect placeholders,
the starter copy and the neutral graphics are **intentional placeholders** — your
deployment replaces them. Do not treat them as operational contacts or services.

## One Foundation, one canonical presentation

The Foundation ships **ONE canonical presentation** — the site produced by the
shipped configuration. It is resolved by the **shared** token renderer described
under *The `ui.presentation` block* below.

> **The former five-site model is retired (2026-09 owner decision).** The
> Foundation used to be compared across five externally hosted presentations via
> a header dropdown (`ui.presetComparison`). That feature is **removed**: there is
> no preset selector, no preset switching and no deployment map. The
> `adaptive.foundation.provelopment.com` family is not part of the Foundation
> product surface.

The presentation a visitor sees is a coherent intent (typography, rhythm, surface,
header, hero, density, content width, radius) applied through `data-ui-*`
attributes onto **one** content model — never a per-presentation fork.

There is **one** content model and **one** configuration set
(`site.config.json`, `content/`, `config/i18n/`, `public/assets/`) — all of it inside the
deployment (this repository's deployment is the capsule at `deployment/`); the canonical
presentation is what the shipped config resolves to. No other presentation is
selectable, so nothing can diverge.

## Changing pages is an Update, not an Upgrade

Editing `content/pages/**` or `content/assets/**` is an **Update**: the Foundation release you run does not
change, and neither does anything the platform owns. Adopting a *different* Foundation release is an
**Upgrade** — the whole installation moves together, every website in it. `ARCHITECTURE.md` states the
distinction and the vocabulary; `instruction-manuals/foundation-upgrade.md` is the operator's procedure.

## Customization ownership boundary

`CUSTOMIZING.md` is the downstream user guide: everything you are expected to
customize lives in **config, content, and assets** — never in platform code.
Every path below is **deployment-relative**: those files live at the DEPLOYMENT ROOT —
the capsule `deployment/` in this repository, and the repository root in a deployment
hosted there.
The boundary between "Foundation-owned" and "downstream/user-owned" is:

| Foundation-owned (do not edit for customization) | Downstream/user-owned (edit freely) |
| --- | --- |
| `src/**` — application code, components, framework wiring | `site.config.json` — site identity, navigation, features, UI composition, theme, assets |
| configuration **schema + loaders** (`src/config/`) | `content/**` — your Markdown/JSON pages and the artwork they use |
| UI engine (`src/core/ui/`, `src/components/ui/`) | `config/i18n/<locale>.json` — localized interface strings |
| design-system implementation (`src/app/globals.css` tokens) | `content/assets/**` — the source asset tree; `public/assets/*` is its mirrored runtime derivative |
| localization infrastructure + dictionary schema | asset URL values you supply through `site.assets.*` |
| build/deploy machinery, tests, proofs-of-consistency | feature/provider switches (`features.*`, `provider: "none"`) you choose |
| Foundation **defaults** (what the layers above fall back to) | presentation values you expose through the configuration contract (`ui.presentation`, `ui.theme.background`, …) |

The Foundation default asset files themselves live under Foundation ownership
because they ship with the template; **replacing them** is the downstream
action (see the Assets section below). The **values** you configure in
`site.config.json` (including `site.assets.*`) are always downstream-owned.

## Update-safety model (be honest about it)

- **Downstream-owned files are preserved** on a future upstream pull: your
  `site.config.json`, `content/**` (including the `content/assets/**` artwork) and
  `config/i18n/*` edits stay yours. In a `git merge upstream/main`, your versions of
  those files win when you've changed them. `public/assets/**` is GENERATED output —
  git-ignored and installed by the package lifecycle — so there is nothing of yours to
  preserve there, and derived bytes can never conflict with their source.
- **Foundation-owned files are replaced** on a future upstream pull: `src/**`,
  `tests/**`, build/deploy files, and the schema/loader evolve with the
  template.
- **Defaults interact with your overrides:** a future Foundation release may
  add a **new** `site.assets.*` key or `ui.theme.*` leaf whose **default**
  value you haven't overridden. Because the configuration surface is additive
  and validated, your existing values keep working; a genuinely conflicting
  key is a real merge you should read.
- **The re-vendor step is deliberate, not automatic:** if you maintain a
  Foundation-derived deployment workspace, the canonical content/config/assets
  must be re-vendored through that repository's `setup`/`generate` machinery
  and re-verified — a manual step, not a merge.
- **Where a change is structural** (e.g. a new required configuration key),
  the build fails loudly with an actionable message rather than silently
  changing behavior.

In short: **your configuration, content, assets, and selected presentation are
yours; the implementation that renders them is the Foundation's and may evolve
under you.**

---

## 1. Site Configuration — `site.config.json`

This file is the single source of truth for your site's settings. It is
validated by a [Zod](https://zod.dev) schema at load time; invalid values
fail the build with actionable error messages.

| Section | What it controls |
| --- | --- |
| `site` | Production URL, site name, tagline, meta description, logo, `assets` (`logo`/`ogImage`/`favicon` URLs) |
| `i18n` | Locales and the default locale |
| `contact` | Public contact email |
| `socialLinks` | Outbound profile links (`platform`, `label`, `href`, optional `icon`) rendered as **text links** in the footer Connect column; `icon` is the **generic optional connectivity icon/mark seam** — one leaf for every platform, supplementary and decorative; see *Connectivity icons* below |
| `navigation` | Header navigation entries (label + href) |
| `footerNavigation` | **Optional** secondary / footer navigation group (`heading` + `items`) — see *Secondary / footer navigation* below |
| `features` | Feature flags, e.g. `analytics.provider` |
| `ui` | Intent-level UI namespace — shell, navigation patterns, density, CTA, theme, presentation; see below |

Set `site.url` to your final production origin before go-live — it drives
the sitemap, canonical URLs, and hreflang alternates.

Read configuration only through the loader exports from `src/config`; never
import the JSON file directly from components.

### Secondary / footer navigation — `footerNavigation`

`footerNavigation` is an **optional** group of links rendered in the footer. It exists
because a footer group is a **navigation** concern, not a connection one — before this
surface existed, a footer group could only be expressed through `connect.methods`, which
misrepresents a project link (Home, About, Help) as a contact method.

```jsonc
"footerNavigation": {
  "heading": "Project",                       // optional; plain text, never a link
  "items": [
    { "label": "Home",   "href": "/" },
    { "label": "About",  "href": "/about" },
    { "label": "Help",   "href": "/help" },
    { "label": "GitHub", "href": "https://github.com/example/example" }
  ]
}
```

Keep it distinct from the surfaces beside it:

| Surface | Meaning |
| --- | --- |
| `navigation[]` | the **primary** navigation (menu, sidebar, bottom bar) |
| `footerNavigation` | a **secondary / footer** navigation group |
| `connect.methods[]` | connection/contact **methods** (message form, email, phone, messaging) |
| `socialLinks[]` | profile / connectivity destinations |
| `legal[]` | policy documents |

The contract:

- the whole block is **optional** — omit it and no group is rendered;
- `heading` is optional and is **plain text, never a link** (a group label has no
  destination);
- `items` reuse the shared navigation-item contract, so an internal `href` becomes a
  locale-prefixed route and an external `href` opens in a new tab with
  `rel="noreferrer"` — identical semantics to every other link surface, not a second
  implementation;
- labels resolve through `config/i18n/<locale>.json` → `navigation.items` (keyed by
  `href`), exactly like the primary navigation, and fall back to the configured `label`;
- it does **not** change the primary navigation, does **not** create routes, and does
  **not** add anything to the sitemap — a footer link is a link, never evidence that a
  page exists;
- the sidebar-only leaves (`position`, `iconOpen`, `iconClosed`) have no meaning in a
  footer group and are ignored if set.

### The `ui` namespace (one canonical presentation, configuration-first)

The optional top-level `ui` key is the intent-level UI configuration namespace
(shell, navigation, density, content width, CTA, theme, **presentation** —
P5-3), validated at build time. `resolveUiConfig` resolves it deterministically:
**explicit configuration overrides → Foundation canonical defaults →
completeness guard.** There is no presentation/profile selection layer: the
Foundation ships **exactly ONE canonical presentation**, and `ui.preset` is not
part of the accepted surface (a configuration that still carries it fails
validation as an unknown key).

**The canonical composition** — what the reference site renders, and what any
deployment gets when it omits the `ui` block entirely:

| Dimension | Value | Effect |
| --- | --- | --- |
| `navigation.desktop` | `sidebar` | expanded collapsible rail ≥`lg` |
| `navigation.tablet` | `collapsed-sidebar` | centred icon rail ≥`md` |
| `navigation.mobile` | `bottom-bar` | bottom navigation carrying EVERY configured item, wrapping <`md` |
| `shell.sidebar.collapsible` | `true` | the rail collapses to an icon column and restores |
| `shell.header` / `shell.footer` | `standard` | standard chrome |
| `presentation` (5 leaves) | balanced/default | typography · rhythm · surface · header · hero |
| `density` | `comfortable` | |
| `content.width` | `standard` | |
| `theme.radius` / `theme.mode` | `medium` / `system` | |
| `cta.enabled` | `false` | the Foundation never invents a business action |

**You configure semantic intent, never component internals or CSS.** Any single
leaf may be overridden; every other leaf keeps its canonical value:

```jsonc
{
  "ui": {
    "navigation": { "mobile": "drawer" },   // override one dimension only
    "density": "compact"
  }
}
```

```jsonc
{ "ui": { "navigation": { "desktop": "top", "tablet": "top-compact" } } }
// → a header-slot composition; mobile keeps the canonical bottom bar
```

Every value comes from the closed vocabulary in `src/core/ui/vocabulary.ts`
(per-viewport navigation patterns, shell variants, densities, content widths,
menu modes, CTA styles/states, theme modes/radii, presentation dimensions). An
invalid value fails the build with the full list of allowed values, and an
unknown key is rejected outright.

> **Retired: selectable presentations (2026-09).** Earlier releases let a
> configuration select one of five presentation *profiles*
> (`classic` / `adaptive` / `focus` / `workspace` / `immersive`), and the project
> ran five demo deployments. That feature is **gone**: the profile table
> (`src/core/ui/presets.ts`), the `ui.preset` key, the `ui.presetComparison`
> deployment map and the five-presentation browser permutations were removed.
> The composition values the canonical presentation used are now ordinary entries
### The `ui.presentation` block (P5-3 — presentation intent)

The `presentation` block carries the site's visual intent (the HOW of styling):
`typography`, `rhythm`, `surface`, `header`, `hero`. Each leaf is a generalized
vocabulary value, and the resolved intent is applied as inert `data-ui-*`
attributes on `<html>` — the shared design-token renderer implements the look
(no presentation-specific CSS components, no forks):

```jsonc
{
  "ui": {
    "presentation": {
      "typography": "editorial",   // balanced | editorial | minimal | utility | expressive
      "rhythm":     "structured",  // balanced | structured | airy | dense | spacious
      "surface":    "paper",       // default | paper | minimal | instrument | layered
      "header":     "rule",        // default | rule | bare | compact | elevated
      "hero":       "split"        // default | split | center | concise | showcase
    }
  }
}
```

The canonical values are `balanced` / `balanced` / `default` / `default` /
`default`, so omitting the block changes nothing. Each leaf is independent: an
override applies to that dimension only, and any combination of vocabulary values
is valid.

P5-4/P6-1 — a CONFIGURED off-canvas disclosure (the `Show navigation` drawer / overlay pattern,
i.e. `navigation.mobile: "drawer"` or `"overlay"`) always renders ONE navigation item per line in
every composition; follow the shared list composition in `site-header.tsx` rather than adding
composition-specific styling. Sidebar mode composes no such disclosure (see *Responsive behavior*
below): its navigation is the persistent rail itself at every width.

**Behavioral & accessibility contract (UI-10):** the disclosures share a
browser-validated modal contract in the `Drawer` primitive (every drawer/overlay
composition uses it): **focus** moves into an opened disclosure
and returns to the trigger on close (Escape / backdrop / trigger); Tab / Shift+Tab
are contained; the background becomes **`inert`** while open and is restored on
close; a dismissing **backdrop/scrim** is shown; background **scroll is locked**;
and the global **`prefers-reduced-motion`** rule governs any motion (none is
added). The active page is marked **`aria-current="page"`** on the internal nav
link in every placement (header, sidebar bands, drawer/overlay, footer), and each
disclosure's trigger owns the id the dialog is named by
(`aria-controls`/`aria-labelledby` resolve to real elements). This is validated by
the committed **CDP browser matrix** (`pnpm test:browser`, also run in CI) at
desktop / tablet / mobile.

**Responsive behavior:** the CONFIGURED layout owns the navigation at every width, and the width
never substitutes a different navigation for it. Sidebar mode uses ONE persistent sticky sidebar
presentation at every viewport width (`navigation.mobile: "persistent-sidebar"`): the same rail — a
collapsible rail ≥`lg`, a collapsed rail ≥`md`, and THE SAME rail below `md`, where the page frame
keeps the rail and the content on one row (the content simply has less remaining width) rather than
stacking the rail above the page — closed by default and reopened from its own Show/Hide navigation
control, whose placement, scale and geometry never change with the viewport. The rail sits ON the page
edge (it carries no outer shell gutter) and its two states are a LAYOUT contract, not merely a width
change: CLOSED it reserves its narrow column and the page is laid out beside it; OPEN it keeps its
accepted **220px**, and how the page coexists with it depends on the BAND. At **tablet and desktop
widths the rail expands in the normal layout**, so the page's own column moves right and gets narrower
— exactly what any in-flow column does — with no overlay and no overlap. At **mobile widths (below
768px) the rail expands over the page as an opaque overlay**: the page keeps the geometry it had while
the rail was closed, the document gets no wider, and the rail — painted with the site's own background
colour — never lets page text show through it. **Selecting a destination dismisses an open rail in
every band** (by pointer, by keyboard or by assistive technology — it is the link's own activation),
so the destination is presented with the collapsed, sticky rail; the rail's own `Hide navigation`
control still closes it without navigating. Viewport width does not substitute
a drawer or a header disclosure, so Sidebar mode composes no drawer, no `Show navigation` band and no
header affordance at all. Nothing in the shell scrolls sideways at the supported widths: the layout
has a deliberate **280px floor** (`--ui-shell-min-inline-size`), so every width from 280px up — rail
closed or open — fits the viewport without a horizontal scrollbar, and a narrower window scrolls
horizontally by design instead of deforming the layout. Menu Bar mode uses a full-width sticky
bottom navigation at every viewport width: the top navigation is not part of Menu Bar mode. The
bottom bar's content rule is deterministic and **has no overflow control**: EVERY configured
`navigation` item renders in the bar, in configuration order, and the rows WRAP onto further rows
as the width requires (the bar grows in height rather than hiding a destination). The former
"first four + **More** drawer" rule — and the `BOTTOM_NAV_PRIMARY_LIMIT`/`splitBottomNavItems`
platform constant behind it — was **retired by the owner**, because natural wrapping is ordinary
visible navigation and an overflow drawer is not: no trigger, no drawer and nothing hidden. The
bar's SURFACE
spans the viewport and its navigation region uses the full available width minus the page-edge
inset — the page's own `max-w-page` bound is deliberately NOT applied to it — and its links flow
horizontally inside that region, wrapping onto another row whenever the width requires it.

`cta.enabled` resolves `false` by default — the shell renders no CTA, and the
Foundation never invents a business action. When you enable a CTA, supply
`action`, `label`, and `href` (the adopter-owned destination), and keep `style`
semantic (`standard`/`prominent`). The Foundation never derives `href` from
`action` — an enabled CTA without label+href renders nothing.

> in `FOUNDATION_UI_DEFAULTS` (`src/core/ui/defaults.ts`), so the resolved
> configuration and the rendered site are unchanged. Historical records of the
> feature are held in the maintainer's private governance repository.
### Configurable controls, assets & presentation modes (P5-5)

P5-5 makes the "change the configuration, not the Foundation" experience real
for the controls and menus: **icon assets, disclosure controls, sidebar/top/
bottom presentation modes, navigation regions, and the primary CTA** are all
configurable through validated `ui` + `navigation` leaves. The Foundation stays
a coherent design system — every value is a **semantic vocabulary member**
(never raw CSS), schema-validated, and rendered by the ONE shared component
pipeline (configuration → resolver → shared primitives → semantic classes).

#### Asset replacement contract (icons, images, replacement assets)

Two equivalent ways to replace a UI asset:

1. **Replace the file** — keep the configured filename and replace the SOURCE artwork
   in the deployment's `content/assets/**` (this repository: the capsule's
   `deployment/spokes/foundation/content/assets/**`, e.g. `placeholders/sidebar-open.svg`). No configuration
   change; the generated `public/assets/` copy is installed from it by `pnpm assets:sync`
   (and by `pnpm install`, `pnpm dev` and `pnpm build`).
2. **Change the configured filename** — put your file in the same source tree and point
   the leaf at that filename (e.g. `"icon": "my-sidebar-icon.svg"`). The runtime
   filename the resolver screens is the one installed into the installation's DECLARED runtime namespaces (§ BRAND_ASSETS.md §1.1).

Only **plain filenames** are accepted (letters, digits, `.`, `_`, `-`, ending in
`.svg`/`.png`/`.webp`/`.jpg`/`.jpeg`/`.gif`/`.ico`). Paths and URLs are
rejected at build time (no traversal, no remote, no arbitrary CSS). Icons are
rendered at a **fixed control size** (`1em`, `object-fit: contain`) so any
intrinsic dimension can never break layout; aspect ratios are respected;
controls keep ≥44px touch targets; the label (or an explicit accessible name)
remains the accessible name — never a bare image.

**Missing vs unavailable (P6-1):** if a configured icon leaf names a file that
does **not exist** in the installation's DECLARED runtime namespaces (§ BRAND_ASSETS.md §1.1), the build **fails loudly** naming
the exact leaf (`ui.navigation.sidebar.open.icon`, `ui.navigation.sidebar.close.icon`,
`ui.cta.icon`, or `navigation[i].icon`) and the expected file — a misspelled
asset can never ship. At render time the same guard is applied again, so an
icon that ever becomes unavailable resolves to **no icon** (never a broken
browser image): the DOM contains no `broken-image` placeholder in any state.

**Connectivity icons are the deliberate exception (owner product decision).**
`socialLinks[i].icon` and `connect.methods[i].icon` are **screened at render
time only**: a name with no backing file degrades the item to its authoritative
**text link** instead of failing the build. Connectivity artwork is strictly
supplementary (see *Connectivity icons*), so it must never fail a deployment,
error a page, or hide a communication method — artwork may legitimately be
missing, unproduced or not yet trademark-approved. The icon **value shape** is
still validated loudly (a path, URL or query string is rejected by the schema),
so a malformed leaf remains a build error; only "no file yet" is tolerated.

#### Connectivity icons (social/profile links + connection methods)

**Connectivity is a CORE Foundation capability** (owner product decision): the
engine is architecturally prepared for social and communication destinations
across every platform, without hard-coding any of them. One generic optional
icon leaf serves **both** connectivity families:

```jsonc
"socialLinks": [
  {
    "platform": "github",                        // free-form: any platform, now or later
    "label": "GitHub",                           // authoritative visible text
    "href": "https://github.com/example",
    "icon": "icon-platform-example.svg"          // OPTIONAL supplementary artwork
  }
],
"connect": {
  "methods": [
    { "id": "telegram", "label": "Telegram", "href": "https://t.me/example",
      "icon": "icon-platform-example.svg" }      // the SAME generic leaf
  ]
}
```

- **One generic leaf.** There is no `whatsappIcon` / `telegramIcon` /
  `linkedinIcon` and no closed platform enum: `platform`/`id`/`label` stay
  free-form deployment data, so any future platform (Signal, Discord, LINE,
  WeChat, Teams, Matrix, Bluesky, Threads, …) needs **no schema or engine
  change**. The engine only understands "an optional asset belongs to this
  connectivity item".
- **Text stays authoritative.** The icon is supplementary and **decorative**
  (`alt=""` + `aria-hidden`, never focusable, no accessible name of its own), so
  the visible label remains the accessible name — never a redundant
  "GitHub GitHub". The link/method renders correctly with no icon configured, a
  **path/URL value** (schema error), a **missing file** (degrades to text; see
  *Missing vs unavailable* above), or artwork that is not yet approved.
- **Layout/size.** `[icon] Label`, `inline-flex` + `gap`, at the shared
  UI-icon size (`1em` → **16 × 16 CSS px** at the default 16px root font size,
  `object-fit: contain`, `flex-shrink: 0`): the same node, size and alignment in
  the footer Connect column and on the `/connect` page, at desktop and mobile.
  No per-platform CSS and no platform-specific width.
- **Asset contract.** Same as every other configurable icon: a plain
  `public/assets/` **filename** (no paths, no traversal, no query strings, no
  remote URLs) ending in `.svg`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.gif` or
  `.ico`. The engine never recolours, filters, crops or animates the bytes, and a
  connectivity icon is loaded through a plain `<img>`, so **the colour that
  renders is the colour the file carries**. A self-contained full-colour official
  mark renders as produced. A `currentColor` generic icon does **not** follow the
  surrounding link colour through this seam — `currentColor` resolves inside the
  image's own document, so it paints black; encode the colour you want in the
  file. See `BRAND_ASSETS.md` §11.
- **Generic vs third-party artwork.** Universal semantic icons
  (`icon-phone`, `icon-email`, `icon-message`, `icon-link`, `icon-external-link`
  from the universal inventory) suit **non-trademark** channels (telephone,
  email, message form). A **third-party platform mark** is trademark-sensitive
  and may be added only after its official source / licence / trademark-use
  conditions have been reviewed for the intended Foundation use — a file
  licence (even MIT) does **not** grant trademark rights. Marks are produced,
  approved separately — the admitted marks ship as artwork files in the living
  pack; this seam creates and installs **no** platform
  artwork.
- **No integrations.** No WhatsApp API, Telegram Bot API, Slack API, Messenger
  SDK, OAuth or calling JavaScript exists anywhere in this contract — it is a
  presentation/config seam only.

#### Empty-string semantics (explicit, tested)

For **control leaves** (`navigation.sidebar.open/close`, `ui.cta.icon` /
`ui.cta.label`):

| Configuration | Meaning |
| --- | --- |
| leaf **missing** | Foundation fallback: shipped default asset / localized dictionary label |
| `"text": ""` | **Icon-only** control (no visible text; the accessible name stays the fallback label via `aria-label`) |
| `"icon": ""` | **Text-only** control (no icon) |
| `"icon": ""` **and** `"text": ""` | The control is **not rendered** — a derived disabled state; no invented `enabled` boolean |

Missing ≠ `null` ≠ `""`: missing falls back, `null` is rejected by the schema,
and `""` is the deliberate "hide this element" value.

On the **desktop/tablet collapsible rail** there is one P0-1 exception: a
collapsible rail is **never a dead-end**, so when `open` and `close` are both
fully empty (`icon: ""` + `text: ""`) the rail toggle stays reachable and falls
back to the localized label ("Show navigation"/"Hide navigation") — no invented text,
no broken image, no empty box.

#### Sidebar disclosure — ONE vocabulary, one control (P6-1)

Every sidebar disclosure says the same thing, in every state and at every width:

| State | The rail's Show/Hide control (every band — NAV1D) | A configured drawer/overlay disclosure's trigger + close |
| --- | --- | --- |
| disclosure **closed** | `Show navigation` (flips to this while collapsed) | trigger label `Show navigation` |
| disclosure **open** | `Hide navigation` (flips to this while open) | close control `Hide navigation` |

The second column belongs to a site that explicitly configures an off-canvas disclosure
(`navigation.mobile: "drawer"` or `"overlay"`). **Sidebar mode is not one of those** (NAV1D): it
presents its rail at every width, so the Show/Hide control is the only disclosure it has — the same
control, at the same scale, at every width.

- The labels are the localized `navigation.showSidebar` / `navigation.hideSidebar`
  dictionary values (one per locale), reused by the `ui.navigation.sidebar.open/close.text`
  configuration leaves as their fallback — the SAME vocabulary on desktop,
  tablet, and mobile (no per-breakpoint labels).
- The **desktop/tablet rail toggle is a real interactive control**: a semantic
  button (`aria-expanded` + `aria-controls`), bordered control surface with
  hover / focus-visible / active (pressed) affordances, pointer cursor, a
  recognizable show/hide **icon** beside the label, and keyboard activation.
  It can never look like ordinary static heading text.
- **Both states' copy are declared in the markup, and the stylesheet presents ONE**
  (FOUNDATION-UI1-A3). The page is statically generated and the state is
  browser-local, so the rail toggle can only show the right thing before the page's
  scripts run if the markup already carries both variants: the show and the hide
  icon, each with its own state hook (`ui-sidebar-toggle-icon-open` /
  `-closed`), and the `Show navigation` / `Hide navigation` labels
  (`ui-sidebar-toggle-label-open` / `-closed`). Exactly one variant is displayed —
  the other is `display: none`, so it is never visible and can never join the
  control's accessible name — and the rail's own state selects which. **Do not
  delete either variant, and do not "tidy up" the duplicate copy:** the one you
  remove is the one a visitor whose stored state differs would see before the
  scripts run. The sidebar PAGE icons (`ui-nav-item-icon-open` / `-closed`) are the
  same pattern at 16×16.
- **What the control CLAIMS follows what it presents** (FOUNDATION-UI1-A3-A1).
  Artwork and copy can be selected by the stylesheet, but `aria-expanded` and the
  control's accessible name are single-valued attributes — a statically generated
  document can only carry the canonical CLOSED ones. The same one pre-paint script
  that presents the rail (`foundation.sidebar` → the layout's inline bridge) also
  applies the visitor's OPEN state to those two attributes, as soon as the control
  exists and before it can be painted, and it stops at `DOMContentLoaded` — after
  that the runtime owns them, exactly as it owns `data-collapsed`. It writes no
  name of its own: in the modes whose name is author-supplied (an `aria-label`, i.e.
  a control configured with no explicit visible text) the control declares that name
  in its markup, and in every mode with explicit visible text the name already comes
  from the label the stylesheet selects. There is no ARIA state, no icon state and
  no accessibility-only preference anywhere — one preference, one bridge.
- **Default icon assets:** `sidebar-open.svg` in the role namespace (BRAND_ASSETS.md §1.1) (show) and
  `sidebar-close.svg` (hide) — **project-owned original SVG artwork** (24×24,
  stroke-based, `currentColor`-aware) shipped with the template and replaceable
  by file or by configuration (see *Asset replacement contract* above).
  Provenance: original project artwork, no external licensing concerns.
- **Hierarchy/spacing:** the rail has a comfortable horizontal inset and the
  navigation list sits at a further consistent inset beneath the disclosure
  control (control level → item level), verified at 1280/1440/1920: nothing
  clips the viewport edge and items clearly belong inside the sidebar.
- **Compact mode** (icon-only rail) keeps the same insets; icon-less items keep
  their labels per the established P5-5A semantics.
#### Persistent horizontal rail (P6-3A; refined P6-3B icon system/derived width/full-height border; P6-3C icon sizes + CTA placement)

The **desktop/tablet sidebar is a persistent left rail**: collapsing it
**contracts it horizontally** to a narrow rail — the rail is **never removed**
from the layout (`display:none` is not used). Both states keep the thin border
and the same left-side vertical position.

| State | Behavior |
| --- | --- |
| **Expanded** | Icons **and** labels, at the intended width (`13.75rem` / 220px rail; with the frame inset the total footprint is the previous 240px). |
| **Collapsed** | The rail **remains visible** as a narrow, symmetric icon column: `--ui-sidebar-rail-collapsed` = the 24px control icon + equal inline padding on both sides = **36px** (browser-measured `rail=36`). Icons stay; labels are hidden from the visual layout. |

- **Horizontal only.** Collapse/expand is a **width** change
  (`transition: width 200ms`, stripped under `prefers-reduced-motion`) — never a
  vertical move, never a disappearance.
- **The collapsed rail is centred by construction (2026-09 owner geometry).**
  The inline-end padding is reduced by the rail's own 1px border, so the content
  box is centred between the rail's OUTER edges: browser-measured
  `left=18.00 right=18.00` around `controlCx=38` = `railCx=38`, with the page-icon
  column on the **same** centreline (`navCx=38`). There is no inset and no
  negative-margin compensation in the collapsed state.
- **Icon sizes (2026-09).** THREE separate contracts, one token each:
  - **Show/Hide disclosure (CONTROL) icon:** **exactly 24×24 on desktop AND
    tablet** — `--ui-sidebar-control-icon-size: 1.5rem`, one value with **no
    breakpoint override**. **Expanded** it is left-aligned with the shared
    `--ui-shell-control-inset` (≈5px) from the rail's inline edge (unchanged);
    **collapsed** it is **centred** on the rail's axis with no padding of its own.
  - **Sidebar navigation-item (page) icons:** **exactly 16×16 on desktop AND
    tablet**, expanded and collapsed, via one shared token
    `--ui-sidebar-nav-icon-size: 1rem` with **no breakpoint override**
    (2026-09 owner ruling; the former 32px-at-`lg` override is deliberately gone).
  - The **mobile** disclosure control icon renders **32×32** (unchanged). Top-nav /
    bottom-bar keep the shared `1em` base.
- **The shell-top CTA keeps the shared inset.** `--ui-shell-control-inset` also
  pads `.ui-shell-cta` (`Book Now`) by ≈5px, so the action and the expanded rail
  control line up on one edge — from ONE value, never per-view magic numbers.
- **Full-height right border.** The rail's `border-inline-end` spans the whole
  sidebar/page-shell row (browser-measured `rail=774` vs `main=774` at 1280),
  not merely the navigation content.
- **Toggle.** The `ui.navigation.sidebar.open/close` (Show/Hide navigation)
  disclosure toggle stays present and keyboard-operable in **both** states
  (`aria-expanded` reflects the state; `aria-controls` targets the persistent
  panel). No `viewSidebar`/`closeSidebar`/`sidebarToggle` vocabulary. A
  deliberately non-collapsible rail (immersive `floating`) has no toggle.
- **State life-cycle (UI1/UI1-A1).** The rail's open/closed state is the visitor's
  PRESENTATION PREFERENCE, and it is remembered in browser-local storage — one
  key, `foundation.sidebar`, whose only values are `open` and `closed`. It has two
  layers: the **resolved** preference is the authority for as long as the page is
  in view, and browser storage is what carries the choice to the next visit. So
  the choice **survives a refresh** and it applies to **every route of the
  origin**: changing Site, Language or Location through the selector controls
  changes the URL and nothing else about the sidebar. With **no stored preference
  the canonical state is CLOSED**, and exactly TWO actions change it: the rail's
  own disclosure control, and **selecting a destination inside the rail**. Choosing a destination
  dismisses an open rail — by pointer, by keyboard or by assistive
  technology, and also when the destination is the page
  the visitor is already on — and the destination is presented with the collapsed,
  sticky rail (at tablet/desktop widths the page also returns to its full width; at
  mobile widths the overlay is cleared). No route DERIVES the state: no route, remount or breakpoint opens,
  closes or resets the rail. The tablet and mobile bands follow the same
  preference and the same control. A missing,
  unusable or blocked stored value falls back to the canonical CLOSED state. A page
  load is still served with the canonical CLOSED rail — no cookie, no session, no
  request-time rendering, so every page stays statically generated — and the stored
  choice is applied **before the rail is first painted**: one small synchronous
  script (`@/components/ui/sidebar-preference-boot`, built from the same contract)
  marks the document, the stylesheet presents the canonical rail as the visitor's
  OPEN one while that mark is present, and the rail's runtime relinquishes the mark
  as soon as it represents the resolved preference. Refreshing while the sidebar is
  open therefore shows the OPEN sidebar **from the first painted frame** and never
  expands into place — including the disclosure control's own artwork and its
  `Hide navigation` copy, which are presented by that same seam from that same frame
  (FOUNDATION-UI1-A3; before it, the rail was already open but the control still
  showed the closed state's show icon and `Show navigation` until the page's scripts
  ran), **and including what that control says about itself** (FOUNDATION-UI1-A3-A1:
  `aria-expanded` is `true` and the control announces the OPEN action from that same
  first frame, so a screen-reader visitor is never told the rail is closed while
  everybody else sees it open); nothing about toggling, navigation or later page
  lifetimes
  changes (the disclosure control remains the only thing that changes the state).
- **The primary CTA is NEVER part of the rail (P6-3C).** The aside rail and the
  mobile disclosure carry **navigation only**: the single Book Now action lives in
  the shell's top region (`ui-shell-header-row`), so collapsing or expanding the
  rail can neither move, clip, nor obscure it — and no second copy exists in the
  bottom bar or the disclosure (browser-verified at desktop **and** tablet:
  `aside.cta.outsideSidebar inAside=false`, `aside.cta.reachableInTop`,
  `aside.cta.single count=1`, `open.cta.notInPanel`).
- **Navigation-item icons (P6-3B).** Every sidebar navigation item shows a page
  icon at **16×16** in both states — expanded (icon **+** page name) and collapsed
  (icon **only**, with the page name kept as the sr-only accessible name plus a
  native `title` tooltip). The canonical configuration maps each page to a
  **semantic icon from `content/assets/icon-library/`** (`icon-home.svg`,
  `icon-about.svg`, `icon-resources.svg`, `icon-testimonials.svg`,
  `icon-portfolio.svg`, `icon-blog.svg`, `icon-contact.svg`, `icon-services.svg`);
  the neutral dot/plus pair in `content/assets/placeholders/` is the fallback for an
  unmapped page type. Each item is independently replaceable, per state, through
  configuration:

  | Configuration (`navigation[]`) | Expanded icon | Collapsed icon |
  | --- | --- | --- |
  | *(none)* | `iconOpen ?? icon ?? sidebar-default-icon-open.svg` (placeholder fallback) | `iconClosed ?? icon ?? sidebar-default-icon-closed.svg` (placeholder fallback) |
  | `"icon": "my-icon.svg"` | `my-icon.svg` | `my-icon.svg` |
  | `"iconOpen": "a.svg"`, `"iconClosed": "b.svg"` | `a.svg` | `b.svg` |

  Source precedence: an explicitly configured deployment icon (business artwork in
  `content/assets/branding/`) → a generic icon from `content/assets/icon-library/` → the neutral
  placeholder fallback. All library icons are retained whether or not a page uses
  them. Mobile navigation does **not** use these page icons.

  Mixed configurations are supported (some items custom, others on the defaults)
  without any component change. A configured name with no backing file fails the
  **build** loudly (`assertConfiguredIconAssetsExist`); the DOM never contains a
  broken `<img>`.
- **Labels.** In the collapsed rail labels are hidden with the `sr-only`
  technique — absent from the visual layout yet still the item's accessible name —
  never clipped by the rail edge and never partially visible (browser-verified:
  zero stray labels in the aside composition).
- **Responsive breakpoint (P6-3B).** The aside page frame is a wrapping row from
  **`md` (768px)** upward, so a composed rail is always laid out BESIDE `<main>`
  and never becomes a stacked vertical list at the top of the content. Verified
  across the transition: 767 / 800 / 900 / 1000 / 1023 / 1024px.
- **Mobile is unchanged.** The `<md` navigation architecture (bottom bar /
  drawer / overlay) is **out of scope** for P6-3A/P6-3B and unchanged.
- **`mode: closed`** (below) still removes the rail entirely — a deliberate
  config choice, distinct from *collapse* (which now never removes it).



#### Sidebar modes (`ui.navigation.sidebar.mode`)

The sidebar (the ≥md aside rail) has three explicit presentation modes:

| Mode | Behavior |
| --- | --- |
| `open` | Normal sidebar — icons (when configured) **and** labels. **Default.** |
| `compact` | Sidebar stays visible but renders **icon-only** navigation: labels of icon-bearing items are visually hidden (kept for screen readers); items without an icon keep their label so nothing becomes invisible. The same class marker implements top/bottom menus. |
| `closed` | The persistent rail is **not displayed**; the responsive "Show navigation" disclosure remains the way navigation is reached. Distinct from `compact`. |

The distinction is modeled explicitly in the configuration/state (never a CSS
accident): `mode` is a validated vocabulary value, and the renderer hides
labels only for icon-bearing items.

#### Top & bottom menus (`ui.navigation.top.mode` / `ui.navigation.bottom.mode`)

The ≥md header navigation and the mobile bottom bar share the **same**
three-state contract as the sidebar — `open` (icon + text), `compact`
(icon-only), `closed` (menu not composed). One vocabulary, one renderer, three
surfaces — not three unrelated systems.

In the shipped layouts the ≥md header navigation is the CUSTOM-composition case
(`navigation.desktop`/`tablet` as `top`/`minimal`, no layout switcher): the Menu-bar
layout presents its navigation in the sticky bottom bar at every width and closes its
top menu, so `ui.navigation.top.mode` describes nothing there.

**Compact semantics (exact, browser-verified):** `compact` hides the visible
label **only of items that have a configured icon** (labels stay in the DOM,
visually collapsed via the sr-only technique, so the accessible name is
unchanged). An item **without an icon keeps its label visible** — nothing ever
becomes invisible or nameless. Consequence, and by design: on a menu whose
items have **no icons at all**, `compact` is visually identical to `open`
(there is nothing to collapse). Configure icons on your navigation items, then
use `compact` to get the icon-only rail on any surface (sidebar rail, header
top-nav, or bottom bar).

**Closed semantics (exact, browser-verified):** the menu is **not rendered**
at all — the header navigation landmark, the bottom bar, or the
aside rail respectively disappears. No empty placeholder, no orphaned
`aria-controls` target, no layout gap. On surfaces that own other navigation
(the responsive "Show navigation" disclosure), that other mechanism is untouched.
(The Menu-bar layout uses exactly this value to retire its top menu: see
`ui.layoutSwitcher` below.)

#### Navigation items — icons, regions, disabled

Each `navigation` entry may carry:

```jsonc
{
  "navigation": [
    { "label": "Home", "href": "/", "icon": "home.svg", "position": "top" },
    { "label": "About", "href": "/about" },                    // middle (default)
    { "label": "Legacy", "href": "/legacy", "icon": "", "disabled": true }
  ]
}
```

- `icon` — optional item icon (plain `public/assets/` filename).
- `position` — `top` | `middle` | `bottom` **sidebar region group** (default
  `middle`). On the sidebar rail and the mobile sidebar disclosure the list
  orders deterministically `top → middle → bottom` (stable within each group;
  keyboard/AT natural — no absolute positioning).
- `disabled` — semantic disabled state: rendered `aria-disabled="true"`, not
  navigable, removed from the tab order, visually muted; never silently dropped.
  (P5-5A hardening: this leaf is now schema-validated and round-trips into the
  renderer — earlier it could be silently stripped by validation.)

`href` may be **duplicated** across entries — two navigation rows pointing at
the same destination is valid adopter configuration (e.g. a prominent short
label and a verbose one, or an enabled + a disabled entry for the same route).
Each entry keeps its own `label`, `icon`, `disabled` and `position` because
navigation identity is **position-derived** (the internal `key` stamped from
the configured array order by the content layer), never derived from `href`
(P5-6). One note: dictionary localization keys labels by `href`
(`dictionary.navigation.items[href]`), so two same-`href` entries share a
dictionary-provided label when one exists; for destinations without a
dictionary entry, each `navigation[].label` is used verbatim.



#### Buttons — the primary CTA (`ui.cta`)

The CTA is the Foundation's demonstrated configurable button (the native form
`Button` stays a semantic `<button>` with browser-native hover/focus/active
states plus the global focus ring). `ui.cta` adds:

```jsonc
{
  "ui": {
    "cta": {
      "enabled": true,
      "action": "book",               // semantic action = accessible name source
      "label": "Book Now",            // omit or "" for an icon-only CTA
      "href": "/booking",             // adopter-owned destination (never inferred)
      "style": "prominent",
      "icon": "calendar.svg",         // plain public/assets filename, or ""
      "iconPosition": "start",        // "start" | "end"
      "state": "default"             // "default" | "disabled"
    }
  }
}
```

Presentations: **icon-only** (`label` missing/`""` + `icon`), **text-only**
(no icon), **icon + text**; `iconPosition` chooses leading/trailing. States are
a finite vocabulary — `default` and `disabled` — plus the browser-native
`:hover`/`:focus-visible`/`:active`; arbitrary CSS through JSON is never
exposed. An enabled CTA without `href` (or without any visible content, or
without any accessible name) renders nothing — the Foundation never infers a
destination and never ships an empty accessible label.

**Placement (P6-3C).** The CTA's position is not a per-viewport decision: the
shell composes it **once** in its top region (`ui-shell-header-row`, below the
header and above `<main>`), at every width and in every composition. It is never
composed into the aside rail, the bottom bar, or a mobile drawer/overlay, so the
action cannot be duplicated, collapsed away, or obscured (browser-verified:
`count=1` reachable action at 220–1280px). `ui.cta.enabled: false` (or an
incomplete CTA) renders nothing anywhere.

**Button state model (P5-5A decision, owner-reviewed):** the Foundation's
semantic state vocabulary is deliberately the minimum that has a real
consumer:

| State | Where it lives | Configurable? |
| --- | --- | --- |
| `default` (interactive, unchanged) | resolved `ui.cta.state` | ✔ `"state": "default"` |
| `disabled` (non-interactive, `aria-disabled`, not navigable) | resolved `ui.cta.state` | ✔ `"state": "disabled"` |
| `hover` / `focus-visible` / `active` (pressed) | **browser-native** interaction feedback on the semantic `<a>`/`<button>` (`:hover`, `:focus-visible`, `:active`) | ❌ theme-level only (design tokens), never JSON |
| current page ("on" for a nav item) | `aria-current="page"` derived from the URL (shared `NavItem`) | ❌ application state, never configuration |
| `selected` / `on` / `off` (toggle) | **no consumer** in the Foundation today — the CTA is a link, the form `Button` is a submit | ❌ not in the vocabulary (no invented states) |

`selected`/`on`/`off` are application-toggle states, not visual presentation
choices; the Foundation's current buttons are never toggles, so adding them to
the vocabulary would be a state system without a consumer. If a future phase
introduces a real toggle control, its states are introduced then — alongside
the control that consumes them.

#### Derived disable example (empty sidebar-open)

```jsonc
{ "ui": { "navigation": { "sidebar": { "open": { "icon": "", "text": "" } } } } }
```

On the **mobile** disclosure the "Show navigation" trigger is not rendered (the
adopter explicitly chose to hide both its elements); nothing else changes —
Escape, backdrop, and focus return still apply to any disclosure that IS
rendered. On the **desktop/tablet collapsible rail** the toggle stays reachable
with the localized label (P0-1: a collapsible rail is never a dead-end — see
*Sidebar disclosure* above).

#### Summary of the P5-5 vocabulary

| Leaf | Values |
| --- | --- |
| `ui.navigation.sidebar.mode` | `open` \| `compact` \| `closed` |
| `ui.navigation.top.mode` / `.bottom.mode` | `open` \| `compact` \| `closed` |
| `navigation[].position` | `top` \| `middle` \| `bottom` |
| `ui.cta.iconPosition` | `start` \| `end` |
| `ui.cta.state` | `default` \| `disabled` |
| `ui.layoutSwitcher.enabled` | `true` \| `false` (absent = off) |
| `ui.layoutSwitcher.default` | `sidebar` \| `menu-bar` |
| icon leaves | plain asset filename, or `""` on control leaves |

The resolved modes are observable on `<html>` as `data-ui-sidebar-mode`,
`data-ui-top-mode`, `data-ui-bottom-mode`, `data-ui-cta-state` — the same
generalized attribute surface as the P5-3 presentation layer (no identity
coupling, so downstream CSS may key on vocabulary values if desired).

### The `ui.layoutSwitcher` block (N2 — optional shell layout switcher)

A Foundation site ships with **ONE shell composition** (the canonical sidebar layout). If
you want a visitor to be able to choose between the platform's two layouts, enable the
switcher:

```jsonc
{
  "ui": {
    "layoutSwitcher": {
      "enabled": true,      // off unless you say otherwise
      "default": "sidebar"  // "sidebar" (default) | "menu-bar"
    }
  }
}
```

What it does:

- renders one secondary **Layout** dropdown (`Sidebar` / `Menu bar`), labelled for screen
  readers from the dictionary and offered at **every** width. It is the RIGHT-ALIGNED occupant of
  the header's TOP row (beside the identity), in normal control sizing;
- switches the **shell layout only** — the page, its route, its locale, its content, its
  assets and every other `ui` leaf are untouched. Each layout brings its OWN navigation at every
  width: the sidebar layout presents a rail ≥`md` and its own off-canvas drawer below `md`, and the
  menu-bar layout presents the sticky bottom bar at EVERY width (the top navigation is not part of
  Menu Bar mode). Switching the mode is therefore a real change at any width — the surface follows
  the mode immediately, without a reload;
- remembers the visitor's choice in browser-local storage (that preference and nothing
  else — no cookie, no session, no account, and no route becomes dynamically rendered);
  storage that is blocked, empty or holds a value the vocabulary does not declare falls
  back to your configured `default`;
- exposes exactly ONE navigation structure at a time: the inactive one is removed from the
  accessibility tree and the focus order, so there is never a second focusable navigation
  system — including the withdrawn mobile surface — and persistent navigation plus fragment
  clearance follow the active layout automatically. An open mobile drawer whose layout stops
  being active closes itself, so nothing invisible keeps the page's scroll lock.

**The header's two semantic rows never change ownership.** At every width the header is:

```text
[ identity                                     ] [ Sidebar / Menu bar ]
[ Site ] [ Location ] [ Language ]
```

The navigation-MODE selector keeps the top row's right edge; a TEXT identity too long to share the
line wraps BELOW the selector instead of moving it (its continuation lines stay left-aligned with it,
inside its own column). A GRAPHIC identity follows the same row contract but not the text rule: it
keeps its natural aspect and may continue BENEATH the selector's occupied area, with the selector
painted above it — a graphic never displaces the selector, is never shrunk into the text column, and
never moves the selector onto another line. Every other header control — the contextual
Site/Location/Language selectors, and the ≥md header navigation a custom composition presents —
stays in the second row, left-aligned, wrapping inside that row when the width requires it.

| Leaf | Values |
| --- | --- |
| `ui.layoutSwitcher.enabled` | `true` \| `false` (absent = off) |
| `ui.layoutSwitcher.default` | `sidebar` \| `menu-bar` (absent = `sidebar`) |

The two layouts are named presets of existing vocabulary, nothing more:

| Layout | `ui.navigation.desktop` | `ui.navigation.tablet` | `ui.navigation.mobile` | ≥`md` top menu |
| --- | --- | --- | --- | --- |
| `sidebar` | `sidebar` | `collapsed-sidebar` | `drawer` | left as configured (inert: this layout composes no ≥`md` header navigation) |
| `menu-bar` | `top` | `top-compact` | `bottom-bar` | `closed` — the navigation is the bottom bar at every width |

Because a layout IS those three leaves, enabling the switcher **and** setting
`ui.navigation.desktop`, `ui.navigation.tablet` or `ui.navigation.mobile` is refused at
build time with an actionable message — remove those leaves, or leave the switcher off.
Everything else (the sidebar/top/bottom presentation modes, density, width, theme, CTA and
the P5-3 presentation intent) still applies to both layouts. `ui.navigation.top.mode` is not an
input while the switcher is enabled: neither layout presents a ≥`md` header navigation (the
sidebar layout's navigation is its rail, the menu-bar layout's is the bottom bar), so there is no
top menu for that leaf to describe.

The active layout is observable on `<html>` as `data-ui-shell-layout` (the same inert
attribute surface as `data-ui-typography`, `data-ui-sidebar-mode`, …), so downstream CSS
can key on it if desired. With the switcher disabled that attribute and every layout
marker are absent — a site that offers no choice renders exactly the markup it always has.

### Theme presentation — `ui.theme`

- `ui.theme.mode` (`system` | `light` | `dark`) — the light/dark preference.
  `system` follows the operating system preference (the shipped default; the
  site is AA-verified in both schemes).
- `ui.theme.radius` (`none` | `small` | `medium` | `large`) — semantic corner
  radius intent, aligned with the `--radius-*` design tokens.
- `ui.theme.background` — the **adopter-owned page/background color**, an
  optional hex value (`#rgb`, `#rrggbb`, or `#rrggbbaa`). When set, it flows
  through the existing design-token system (`--background` on the root
  element) and **replaces the Foundation's default background**; when absent,
  the Foundation's default `--background` token renders unchanged. This is the
  **flat colour** capability and it always remains the source of the page
  colour. The optional **decorative background graphic** (P12-BG,
  `site.assets.backgrounds` — see *Assets* below) is a **separate layer painted
  over this colour**; it never replaces or overrides the colour token.

```jsonc
// Reference site, default background (nothing added).
{ "ui": { "theme": { "mode": "system", "radius": "medium" } } }

// A downstream site changing its page background via configuration only:
{
  "ui": {
    "theme": { "mode": "system", "radius": "medium", "background": "#faf7f2" }
  }
}
```

The background is a **configuration value, not an identity branch**: it
behaves identically in every composition and is applied through the established
token mechanism — no components need to change. Invalid values (a non-hex
string, wrong length) fail the build with an actionable message.
> **EFS PATH NOTE.** In the current production capsule, Markdown and JSON sources live under
> `deployment/efs/capsule/<entityId>/<facetId>/<siteId>/pages/<pageId>/<locale>.{md,json}`. The
> `content/pages/<site>/<locale>/...` examples in this legacy content section describe the retained
> legacy runtime, not EFS publication.

## 2. Content — Markdown Pages

A page is authored in one of **two first-class modes**:

| Where | What it is |
| --- | --- |
| `content/pages/markdown/<site>/<locale>/<route>.md` | **Safe Markdown** — ordinary Markdown, for anyone who can write a text file. Frontmatter is optional; raw HTML is shown as text and unsafe link destinations are dropped. **Start here.** |
| `content/pages/json/<site>/<locale>/<route>.json` | **Declarative JSON** — the advanced/developer mode: validated structured data composed from a fixed vocabulary of sections (hero, prose, media, gallery, actions, callout, cards, features, columns, steps, stats, quote, table, FAQ, list, divider). Anything the vocabulary does not declare is refused, naming the file and the property. |

`<route>` is the page's path inside its locale folder — one name (`about`) or a folder
path (`services/web-design`), because a page's URL is built from the folders it is
authored in (see the sections table below).

Those are the *only* two page-authoring paths. `content/` is the single
human-facing content area — pages and the artwork they use — and
[`content/README.md`](deployment/spokes/foundation/content/README.md) is the map to hand to whoever edits the
site. Each mode root's own `README.md` explains its mode in plain language, and a
README is never itself a page, at any level.

A page becomes a route and a sitemap entry as soon as its file exists for a
configured language — publishing the *route* needs no configuration change;
`navigation` in `site.config.json` controls the menu, not existence. Publishing the
*change* means committing and pushing it (see
[Publishing your changes](README.md#publishing-your-changes) in the root README):
a saved but uncommitted file is invisible to the site.

Safe Markdown supports the full ordinary Markdown/GFM feature set — headings and
paragraphs, bold/italic/strikethrough, ordered/unordered/**nested** lists,
blockquotes, links, images, inline code, fenced code blocks, horizontal rules,
autolinks, task-list marks and **tables**. Each heading also receives a deterministic
fragment id, so `## Opening hours` is linkable as `#opening-hours` (case and accents
ignored; repeats become `-2`, `-3`; documentation:
[`content/pages/markdown/README.md`](deployment/spokes/foundation/content/pages/markdown/README.md)). A capability
not listed here is deliberately not part of the mode.

Every rendered page has exactly ONE top-level heading — its **page title**. A heading
written inside a body is therefore rendered RELATIVE to that title (`# Opening hours` →
`<h2 id="opening-hours">`, `## …` → `<h3>`, … capping at `<h6>`), so ordinary authoring is
unchanged: `#` is still how a section is written, nothing is removed and no page is
refused. The fragment id follows the heading's WORDS rather than its level, so existing
section links keep resolving; the shallowest heading the mode can produce is `h2`, which
is why a page can never carry a second level-1 heading.

If the same slug exists in both modes, the order is: JSON, then safe Markdown —
within the requested language first, and only then falling back to the default
language. A safe Markdown page needs nothing but prose (a title comes from
frontmatter, then the first `# heading`, then the filename).

### The home page is OPTIONAL, and may be authored as content (`home.md`)

The locale root (`/{locale}`) renders the generic, configuration-driven starter homepage
**unless you author it as content**: add `content/pages/markdown/<site>/<locale>/home.md` (or
`content/pages/json/<site>/<locale>/home.json`)
and the locale-root route renders THAT, through the same page-source composition as every
other page — same precedence, same per-locale fallback, and the same safe Markdown
policy.

```markdown
---
title: Your Site Name — what you do
---

## Start here

Your homepage body, in Markdown.
```

- **Optional.** With no `home.md` you keep the generic starter homepage, unchanged — so
  this is purely additive for every existing site.
- **The slug is reserved.** `/home` is never a public route and never appears in the
  sitemap, because the home page's real URL is the locale root.
- **Metadata stays configuration-driven** at the locale root (site name + description
  from `site.config.json`); the file's `title` renders as the page's `h1`.

- Wire new pages into `navigation` in `site.config.json`.
- Missing translations fall back to the default locale automatically.
- The sitemap is derived from the **content model** (every page route the site
  actually authors, plus the locale root), not from `navigation`. Navigation controls
  exposure and order; a page joins the sitemap as soon as its file exists.
- Markdown is rendered under the **safe authoring policy** (raw HTML is shown as text,
  unsafe link destinations are dropped, the output is allowlisted), so a page body is
  never trusted markup. The trusted renderer is reserved for the platform's own
  reviewed content.
- Wide Markdown **tables** scroll locally, inside their own region, instead of
  forcing the whole page to scroll sideways on a narrow viewport. The table stays
  real tabular markup (`<table>/<thead>/<th>/<td>`) and the scroll region is
  keyboard-reachable; nothing is shrunk or clipped away.
- Interface strings (buttons, headings outside page bodies) live in the
  dictionaries under `config/i18n/<locale>.json` (see §4).

> **Navigation is deliberate, not derived.** `navigation[]` may legally point
> at a route whose content is missing — the link simply leads to a 404. Navigation
> never filters itself against content state, so when you remove a page, remove (or
> leave) the matching navigation entry yourself.

All page bodies are localized the same way: the requested locale's file at
`content/pages/markdown/<site>/<locale>/<route>.md` is served when present; otherwise the
composition falls back to the default locale's file. No per-kind rule exists — a page
is a page.

The shipped template is intentionally minimal: it declares **one** locale (`en`) and
ships **no content files at all**, so a fresh clone renders the configuration-driven
starter homepage with no authored pages. Adding a locale is data work — add
`config/i18n/<locale>.json` and the matching `content/pages/**/<locale>/` files; no
platform code changes are required.

> **Fallback is intentional, not a bug.** A localized URL (e.g.
> `/ww/de/legal/privacy`) with a missing translation serves the default-locale
> body under that URL, and `<html lang>` still reflects the requested locale.
> That is the documented behavior — localize the file when you want a
> true per-locale page.

### Keeping a page out of ordinary discovery — `visibility: "unlisted"` (TEMPLATE-PV-A1)

A JSON page may declare how it is PUBLISHED:

```json
{
  "schemaVersion": 1,
  "title": "Preview",
  "visibility": "unlisted",
  "sections": []
}
```

| Value | What it means |
| --- | --- |
| `public` | The ordinary page — and the DEFAULT, so a page that declares nothing is public. Served at its URL, listed in the sitemap, offered as an `hreflang` alternate. |
| `unlisted` | Reachable at its exact URL and advertised nowhere: still served exactly as authored, but left out of the sitemap, never offered as an `hreflang` alternate (including `x-default`), and its own response carries `robots: noindex, nofollow`. |

Four things are deliberate:

- **It is not privacy.** Anyone who has the URL can open the page. Authentication, authorization and drafts are
  different capabilities, and none of them is this.
- **It decides publication, not access.** The page is served exactly as authored, with its own canonical URL, and
  its own heading and layout are unchanged.
- **The home document cannot be unlisted.** `content/pages/json/<site>/<locale>/home.json` is served by the locale
  root — your site's own identity URL — so declaring it `unlisted` is REFUSED: the build stops and names the file.
  Mark an ordinary page (one with its own URL) instead.
- **Markdown is unaffected.** The Markdown mode has no visibility vocabulary: a `visibility:` key in Markdown
  frontmatter is refused as unsupported metadata, and a Markdown page is always public.

The precedence rule above is unchanged and decides this too: when the same route exists in both modes, the WINNING
document's declaration is the one that counts.

### Sections, listings and items: folders ARE the model

There is no catalogue, blog, portfolio or testimonials system to configure. **If
authored content has its own URL, it is a page**, and a page's URL comes from the
folders it is authored in. A section is a folder; a listing is a page; an item is a
page inside that folder.

| What you want | Where it goes | URL |
| --- | --- | --- |
| A services overview | `content/pages/markdown/ww/en/services.md` | `/ww/en/services` |
| One service | `content/pages/markdown/ww/en/services/web-design.md` | `/ww/en/services/web-design` |
| A blog index | `content/pages/markdown/ww/en/blog.md` | `/ww/en/blog` |
| One article | `content/pages/markdown/ww/en/blog/choosing-a-domain.md` | `/ww/en/blog/choosing-a-domain` |
| A portfolio project | `content/pages/markdown/ww/en/portfolio/rebrand.md` | `/ww/en/portfolio/rebrand` |
| A privacy policy | `content/pages/markdown/ww/en/legal/privacy.md` | `/ww/en/legal/privacy` |

- **Folders may be up to four deep**, and every folder and file name follows the same
  rule as a page name (lowercase words joined by hyphens). The rule is declared once
  (`src/core/page-route-path.ts`), so a URL is always readable and always predictable.
- **A listing is just a page.** Write your own links to the items in it — an ordinary
  Markdown list of links is the listing. Nothing generates it for you, and nothing
  needs to.
- **Quotes, cards, statistics and FAQ rows are embedded**: they have no URL, so they
  are written in the page that shows them — as Markdown, or as declared `cards`, `quote`,
  `stats` and `faq` sections in the declarative JSON mode.
- **There is no content feature flag.** A page exists because a file exists; a
  deployment hides a page by not linking to it.

> **Why this replaced the collections.** The Foundation used to ship separate
> `content/offerings/`, `content/posts/`, `content/portfolio/`, `content/testimonials/`
> and `content/legal/` directories, each with its own feature flag, route, parser and
> presentation components. There are no adopters that need compatibility, and one
> authoring model is far easier to learn than five, so those systems were removed in
> `FOUNDATION-PAGES-A1E`. Nothing was lost that a page cannot express.

### Legal documents — configuration plus a page

A legal document is a page **plus one line of configuration** so the footer can link
to it:

```text
content/pages/markdown/ww/en/legal/privacy.md   →   /ww/en/legal/privacy
```

```json
"legal": [
  { "slug": "privacy", "label": "Privacy Policy" },
  { "slug": "terms",   "label": "Terms of Service" }
]
```

- **Configuration decides exposure; the page decides existence.** A slug that has no
  page is never linked, and a page that is not listed is never advertised. The footer
  renders its legal group only when at least one configured document exists.
- **Labels** come from `config/i18n/<locale>.json` → `legal.labels.<slug>`, falling back
  to the configured `label`.
- **Localization is the page's own fallback** (see above): author
  `content/pages/markdown/<site>/<locale>/legal/<slug>.md` for a translated document.
- There is **no legal index page** and no legal-specific chrome: the document is an
  ordinary page with an ordinary page's presentation.

## 3. Branding, Design Tokens & Visual Identity

The visual identity of the whole site is controlled by **one sanctioned
surface**: the design-token section at the top of `src/app/globals.css`
(colors, radius, container width) plus the brand font mapping (below) and
`public/` assets. You change values in `globals.css` — never in components.

> **Same components, different tokens.** There is no theme switcher or marker
> class — the same Foundation components read the same
> semantic tokens, and a downstream site re-brands by changing token values.

### Design tokens (`src/app/globals.css`)

Every semantic color token exists for the light scheme (`:root`) and the dark
scheme (the `@media (prefers-color-scheme: dark)` block). Dark mode follows the
system preference by design (CSS-only — zero flash, zero JavaScript, no manual
toggle).

| Token | Purpose |
| --- | --- |
| `--background` / `--foreground` | base canvas / default text |
| `--muted` / `--muted-foreground` | secondary surfaces / subdued text |
| `--card` / `--card-foreground` | card surfaces (offerings, connect, FAQ) / text on them |
| `--border` | hairline borders |
| `--input` | form control borders |
| `--ui-foundation-accent` | **THE Foundation accent** — the ONE hardcoded brand value. Change this and the whole Foundation re-colours |
| `--ui-brand-accent` | the scheme-resolved theme colour every consumer reads (identical to the accent in light; **derived** from it in dark) |
| `--ring` | keyboard focus ring (**derived** from `--ui-brand-accent`) |
| `--accent` | highlight / badge surfaces |
| `--primary` / `--primary-foreground` | brand color / text on brand (**derived** from `--ui-brand-accent`) |
| `--secondary` / `--secondary-foreground` | secondary action surfaces |
| `--success` | "Open now" status text |
| `--destructive` / `--destructive-foreground` | error text / error surfaces (the separate danger role — **not** the brand colour) |
| `--ui-shell-control-inset` | the shared page/edge inset (≈5px) for shell controls: the sidebar show/hide control and the shell-top primary CTA |
| `--radius-sm` / `--radius-md` / `--radius-lg` | corner radii (`rounded-*`) |
| `--container-page` | page/container width (`max-w-page`) |

Shape and layout tokens are declared in the `@theme` block (so they generate
Tailwind utilities); the color mapping lives in `@theme inline` which keeps
utilities referencing your `:root` values at runtime.

### One theme colour (required invariant)

The template ships **exactly ONE hardcoded accent value**, deliberately neutral.
Everything else derives from it — including the dark scheme, which never stores a
second hex:

```text
   --ui-foundation-accent: #475569;        ← the ONE value you change
              ↓
   --ui-brand-accent  (scheme-resolved)
     light: var(--ui-foundation-accent)
     dark : color-mix(in srgb, var(--ui-foundation-accent) 50%, #ffffff)
              ↓
      ┌───────┴────────┐
 --primary           --ring
 (site name, brand   (focus ring, selector
  text, CTA fill)     emphasis, accent-color)
                    ↕
   select[data-selector] { accent-color: var(--ui-brand-accent) }
```

Setting that one value re-colours the site name/heading **and** every
application-controlled highlight together, so the two can never drift apart.
Replace `#475569` with your own accent. It is used for TEXT, so keep it at least as
dark as this neutral slate: `tests/unit/design-tokens.test.ts` enforces the WCAG AA
4.5:1 minimum against both the light and the dark canvas. The dark scheme's lifted
tint is **derived** (`color-mix(in srgb, var(--ui-foundation-accent) 50%, #ffffff)`
= `#a3aab4` for the shipped default, 7.67:1 on `#0F172A`) — never a second hex, and
nothing else in the theme needs editing.

> **This is a platform file, not configuration — and it is a present product limitation.** The
> configuration schema carries no brand-accent key, so the accent (and, when you change it, the brand
> font mapping) can only be changed by editing Foundation-owned platform files. Those edits are **not
> upgrade-safe**: `src/**` is replaced when a different immutable release is adopted, so your value has
> to be carried across and re-applied deliberately (§7), and a modified platform file no longer matches
> the release byte-for-byte — the release identity, manifest and digest describe the release, not your
> installation. Treat changing the accent as a deliberate platform-level decision. Everything else the
> schema exposes (identity, navigation, features, `ui.*`, `site.assets.*`) is yours to configure without
> touching platform code.

`tests/unit/theme-color-contract.test.ts` enforces the relationship: exactly one
hardcoded accent declaration (the approved value), both consumers derived, a
derived dark tint, no crimson declarations, and no component carrying its own brand
colour. The browser matrix additionally proves the derived dark value in a real
engine (`prefers-color-scheme: dark` emulation).

### Changing colors

**To re-brand, change the ONE Foundation accent.** Editing `--ui-foundation-accent`
re-colours the Foundation wordmark, the focus ring, the selector emphasis and the
CTA fill together, and the dark scheme follows automatically (see "One theme
colour" above) — that single edit is all a Foundation re-brand normally needs.
Then, if you want a different treatment for any role, edit the other hex values in
the light block and, for a proper dark experience, the corresponding values in the
dark block — then run
`pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`.
`tests/unit/design-tokens.test.ts` verifies the **default** token set meets
WCAG 2.1 AA contrast (≥ 4.5:1) for every documented pair in both schemes, and
`tests/unit/theme-color-contract.test.ts` fails if a consumer stops deriving from
the single source.

> **Accessibility is your responsibility when you customize.** The Foundation's
> default tokens are contrast-verified, but an arbitrary downstream color
> override cannot be guaranteed accessible automatically. After changing any
> color, re-check the pairs you touched (a contrast checker will do):
> `foreground`/`background`, `muted-foreground` on `background`/`muted`/`card`,
> `primary-foreground`/`primary`, `success`/`background`,
> `destructive-foreground`/`destructive`, `primary`/`background`. Text needs
> ≥ 4.5:1 (3:1 for large text). The focus ring color is `--ring` (visible
> against both `--background` and `--card`).

### Typography

- The brand heading/body family is **Plus Jakarta Sans** (`next/font/google`),
  loaded in `src/app/[[...segments]]/layout.tsx`; monospace stays
  **Geist Mono**. `--font-sans` / `--font-mono` live in the `@theme inline`
  block of `globals.css`.
- **To change the brand font:** swap the `next/font/*` call in `layout.tsx`
  (another `next/font/google` family, or `next/font/local` for a self-hosted
  file — nothing else changes) and keep `--font-sans` pointing at its CSS
  variable. This is the one sanctioned code-surface change for fonts.
- **Multi-script note:** Plus Jakarta Sans is loaded `latin`-only.
  Japanese/Chinese/Korean and Russian render through the documented
  system-font fallback stack in the
  `body` rule (`Noto Sans JP/KR/SC`, system CJK/Cyrillic). Do not add CJK
  webfonts — the payload cost is not justified. If a translated page's
  fallback looks wrong, adjust the fallback stack in `globals.css`.
- **Type conventions** (component-level, not tokens): page headings
  `text-3xl font-bold tracking-tight`, section headings `text-xl font-semibold`,
  meta/overline `text-sm font-semibold uppercase tracking-wide
  text-muted-foreground`, body `text-sm/base`, status `text-xs`. Font sizes and
  weights stay Tailwind utilities so every locale inherits fluid behavior.
- **RTL:** not currently supported (no RTL locale in the inventory). Layouts
  use flex/grid with gap-based spacing, so a future RTL locale is mostly a
  `dir` + text-alignment change, but it is not part of the current contract.

## 4. Interface Translations — `config/i18n/*.json`
### Ready-to-use palette recipes

Paste each pair (light `:root` values + dark block values) into `globals.css`
to preview a whole different brand. Validate the pairs you use per the note
above.

**Corporate Slate** — navy/slate on crisp white:

```css
/* light */ --background:#ffffff; --foreground:#0f172a; --muted-foreground:#475569;
--muted:#f1f5f9; --card:#f1f5f9; --card-foreground:#0f172a; --border:#e2e8f0;
--input:#e2e8f0; --accent:#f1f5f9; --primary:#1d4ed8; --primary-foreground:#ffffff;
--secondary:#e2e8f0; --secondary-foreground:#0f172a; --success:#15803d;
--destructive:#dc2626; --destructive-foreground:#ffffff; --ring:#1d4ed8;
/* dark */ --background:#0f172a; --foreground:#e2e8f0; --muted-foreground:#94a3b8;
--muted:#1e293b; --card:#1e293b; --card-foreground:#e2e8f0; --border:#334155;
--input:#334155; --accent:#1e293b; --primary:#93c5fd; --primary-foreground:#0f172a;
--secondary:#1e293b; --secondary-foreground:#e2e8f0; --success:#4ade80;
--destructive:#f87171; --destructive-foreground:#450a0a; --ring:#93c5fd;
```

**Modern Tech** — charcoal with emerald accents:

```css
/* light */ --background:#ffffff; --foreground:#111827; --muted-foreground:#4b5563;
--muted:#f3f4f6; --card:#f3f4f6; --card-foreground:#111827; --border:#e5e7eb;
--input:#e5e7eb; --accent:#ecfdf5; --primary:#047857; --primary-foreground:#ffffff;
--secondary:#e5e7eb; --secondary-foreground:#111827; --success:#047857;
--destructive:#dc2626; --destructive-foreground:#ffffff; --ring:#047857;
/* dark */ --background:#111827; --foreground:#f9fafb; --muted-foreground:#9ca3af;
--muted:#1f2937; --card:#1f2937; --card-foreground:#f9fafb; --border:#374151;
--input:#374151; --accent:#064e3b; --primary:#34d399; --primary-foreground:#064e3b;
--secondary:#1f2937; --secondary-foreground:#f9fafb; --success:#34d399;
--destructive:#f87171; --destructive-foreground:#450a0a; --ring:#34d399;
```

**Warm Minimalist** — sand, terracotta, warm neutrals:

```css
/* light */ --background:#faf9f6; --foreground:#292524; --muted-foreground:#57534e;
--muted:#f5f0e8; --card:#f5f0e8; --card-foreground:#292524; --border:#e7e0d3;
--input:#e7e0d3; --accent:#f5f0e8; --primary:#c2410c; --primary-foreground:#ffffff;
--secondary:#e7e0d3; --secondary-foreground:#292524; --success:#15803d;
--destructive:#b91c1c; --destructive-foreground:#ffffff; --ring:#c2410c;
/* dark */ --background:#1c1917; --foreground:#e7e5e4; --muted-foreground:#a8a29e;
--muted:#292524; --card:#292524; --card-foreground:#e7e5e4; --border:#44403c;
--input:#44403c; --accent:#44403c; --primary:#fdba74; --primary-foreground:#431407;
--secondary:#292524; --secondary-foreground:#e7e5e4; --success:#4ade80;
--destructive:#fca5a5; --destructive-foreground:#450a0a; --ring:#fdba74;
```

**Bold Vibrant** — midnight indigo with violet accents:

```css
/* light */ --background:#ffffff; --foreground:#1e1b4b; --muted-foreground:#6b7280;
--muted:#eef2ff; --card:#eef2ff; --card-foreground:#1e1b4b; --border:#e0e7ff;
--input:#e0e7ff; --accent:#eef2ff; --primary:#4f46e5; --primary-foreground:#ffffff;
--secondary:#e0e7ff; --secondary-foreground:#1e1b4b; --success:#15803d;
--destructive:#dc2626; --destructive-foreground:#ffffff; --ring:#4f46e5;
/* dark */ --background:#131135; --foreground:#e0e7ff; --muted-foreground:#a5b4fc;
--muted:#1e1b4b; --card:#1e1b4b; --card-foreground:#e0e7ff; --border:#312e81;
--input:#312e81; --accent:#312e81; --primary:#a5b4fc; --primary-foreground:#1e1b4b;
--secondary:#1e1b4b; --secondary-foreground:#e0e7ff; --success:#4ade80;
--destructive:#f87171; --destructive-foreground:#450a0a; --ring:#a5b4fc;
```

### SEO & social preview

Every page is search-, crawler-, and social-ready **by default** — there is no
per-page SEO configuration to fill in:

- **Metadata** — each route emits `title`, `description`, canonical URL,
  `hreflang` alternates, OpenGraph (`og:title`, `og:description`, `og:url`,
  `og:type`, `og:site_name`, `og:locale`, `og:locale:alternate`,
  `og:image`) and Twitter card metadata. All of it is derived deterministically
  from `site.config.json`, the localized content, and the regional page
  bindings — never hardcoded.
- **Social preview image** — the generated `/{locale}/opengraph-image` route (a
  **1200 × 630 PNG** built from your config values — site name, localized tagline) is
  referenced automatically by every page's `og:image`/`twitter:image`. Setting
  `site.assets.ogImage` **replaces** it for the whole deployment: ONE image for every
  locale and every page, serving Open Graph **and** Twitter, while an absent key keeps
  the generated route as the fallback (a deployment that leaves it absent keeps
  that fallback). Produce a replacement at **1200 × 630** — **PNG** or **JPEG**; **SVG** is
  not suitable for social previews. This is the one branding role that is **not**
  screened for local file existence: `site.assets.ogImage` is an absolute URL that may
  legitimately point at a CDN, so it is emitted verbatim and no build failure or
  fallback guards a typo — keep the URL reachable on the live origin. The generated
  route's palette lives in `src/app/[[...segments]]/opengraph-image.tsx`; edit that file only
  if you want the *fallback* preview to match your palette.
- **Sitemap & robots** — `sitemap.xml` covers every configured locale, content
  page, offering, legal document, and regional page (only genuinely configured
  combinations — never a 404); `robots.txt` references your absolute sitemap
  URL. Both derive from `site.url`.
- **Structured data (JSON-LD)** — global `Organization`/`LocalBusiness`,
  regional `LocalBusiness`, and per-offering `Service` are emitted
  automatically from the same resolved business/region data the visible UI
  uses, so machine-readable and human-readable data never drift.
  - Optional `site.logo` (an absolute URL, validated) feeds the JSON-LD `logo`.
  - `sameAs` comes from your configured `socialLinks` (never invented).
  - An offering's `Service.offers.price` is emitted ONLY when its `price`
    display string is a bare parseable number (an optional leading currency
    symbol is stripped but never recorded); `priceCurrency` is never emitted.
    Prices like `From $150` or `Custom Quote` simply omit `offers` — the
    Foundation never guesses a price or implies commerce semantics.
- **When you change `site.url`** (before go-live), every canonical, hreflang,
  sitemap, and robots reference updates automatically.

### Assets — `public/assets/` and `site.assets.*`

The standard site assets have **predictable default paths** and are
configurable through the validated `site.assets.*` block:

> **The complete, authoritative contract for every replaceable graphic role —
> exact filename, required file type, engine-required vs. recommended dimensions,
> required viewBox, transparency, runtime sizing, crop behaviour, anchor,
> repetition, engine recolouring/opacity, optionality, missing-file behaviour, and
> the replace/disable procedure — lives in
> [`BRAND_ASSETS.md`](BRAND_ASSETS.md).** The table below is the summary; that
> document is the authority and is not duplicated here.
>
> **WHERE a role file is served (S3E1C/S3F1).** Every path below names the role's
> **canonical filename**; the directory it is served from depends on how the
> Installation is authored, and the build resolves it once (`BRAND_ASSETS.md` §1.1):
> a **legacy** Installation serves role artwork at `/assets/<filename>` exactly as it
> always did, while an **explicit** one serves it from the SOLE declared Spoke's own
> namespace, `/spokes/<runtime-segment>/assets/<filename>`. Platform/shared artwork
> (`icon-library/**`, `platform-marks/**`) is always served from `/assets/**`. Nothing
> you configure changes; only the URL the framework resolves for you changes, and it
> never reads another Installation's namespace.

| Asset | Default file | Configuration (`site.assets.*`) |
| --- | --- | --- |
| Brand logo — the `logo-header` role (JSON-LD **and** the rendered header mark) | `logo-header.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.logo` — rendered inside the shared display size **and** the header's own maximum inline size (280px by default, `--ui-site-header-logo-max-inline-size`); an exceptionally wide or intricate mark may be better served by artwork designed for that size, or by the text-brand fallback (omit `site.assets.logo`) |
| Compact brand logo — the optional `logo-compact` role (the header's narrow-viewport mark) | `logo-compact.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.logoCompact` (FOUNDATION-UI-R1F/R1G) — optional, **absent by default**, and valid only beside `site.assets.logo`: the browser shows it below 600 CSS pixels and the primary logo at or above that width. Author it under this Spoke's `content/assets/branding/**` so the asset mirror installs it; a compact value that cannot be served from this Spoke's namespaces fails the build — and because runtime artwork is always delivered from this deployment's own origin, the value must be ON that origin (a CDN URL cannot be delivered) and a generated path must name a namespace this context may serve and a file THAT namespace holds |
| Open Graph / social share image — the `ogImage` role (ONE **global** image serving `og:image` **and** `twitter:image`; the generated per-locale route is the fallback) | `og-image.png` in the role namespace (BRAND_ASSETS.md §1.1) (the approved 1200 × 630 replacement for the generated route, used when a deployment configures the role) | `site.assets.ogImage` |
| Browser favicon — the `favicon` role (the **browser tab / bookmark icon** only; it is **not** an installable-app icon) | `favicon.svg` in the role namespace (BRAND_ASSETS.md §1.1) (the single authoritative browser-icon route) | `site.assets.favicon` |
| Footer logo — the `logo-footer` role | `logo-footer.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.logoFooter` |
| Page banner — the `banner-*` role (P6-3B, keyed by page slug; ten canonical Foundation roles) | `banner-home.png` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.banners` |
| Page background — the `background-*` role (P12-BG, keyed by page role; `all` = the global background) | `background-all.svg` in the role namespace (BRAND_ASSETS.md §1.1) (the reserved global/fallback page-background role: a graphic background for pages that have no page-specific entry) | `site.assets.backgrounds` |
| Footer decorative graphic / watermark — the `footer-graphic` role (P12-FG; ONE global decorative layer, **not** the footer logo) | `footer-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) (the shipped default is the blank placeholder; the layer renders only when a deployment configures the role and its file resolves) | `site.assets.footerGraphic` |
| Header decorative graphic / band — the `header-graphic` role (P12-HG; ONE global decorative layer, **not** the header logo and **not** a page banner) | `header-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) (4096 × 512; the shipped default is the blank placeholder — the band renders only when a deployment configures the role and its file resolves) | `site.assets.headerGraphic` |
| Error / not-found decorative graphic — the `status-graphic` role (P12-SG; ONE **shared** global decorative layer for **both** status surfaces, **not** an error icon and **not** a replacement for the status heading) | `status-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) (640 × 320; renders only when a deployment configures the role and its file resolves) | `site.assets.statusGraphic` |

> **No installable-app / PWA icon roles exist.** The Foundation emits **no** web app
> manifest, **no** service worker and **no** `apple-touch-icon` / installable-app icon
> metadata — the `favicon` role above is the **browser** tab/bookmark icon only (the
> `viewport` `theme-color` declaration is mobile-browser chrome, not a manifest
> `theme_color`). **PWA / installable-app branding capability is not part of the
> current Foundation contract**, so there is nothing to replace or configure here and
> no app-icon or splash artwork is required.

There are **two equally-supported ways to customize an asset**:

1. **Replace the file** — overwrite the default artwork where it is AUTHORED, in the
   deployment's `content/assets/**` (for example the capsule's
   `deployment/spokes/foundation/content/assets/placeholders/favicon.svg` for the icon role). No
   configuration change, no code change: the git-ignored `public/assets/` copy is
   installed from it by `pnpm assets:sync` (and by `pnpm install`, `pnpm dev` and
   `pnpm build`).
2. **Point configuration at your own URL** — keep the Foundation default file
   untouched and set the absolute URL:

```jsonc
{
  "site": {
    "assets": {
      "logo":       "https://cdn.example.com/content/assets/my-logo-header.svg", // replaces JSON-LD logo
      "ogImage":    "https://cdn.example.com/content/assets/my-share.png",       // replaces og:image / twitter:image
      "favicon":    "https://cdn.example.com/content/assets/my-icon.svg",        // replaces the browser icon
      "logoFooter": "https://cdn.example.com/content/assets/my-logo-footer.svg", // footer mark
      "banners":    { "home": "https://cdn.example.com/content/assets/banner-home.png" }, // page-keyed banners (P6-3B)
      "backgrounds": { "all": "https://cdn.example.com/content/assets/background-all.webp",   // global decorative background (P12-BG)
                       "about": "https://cdn.example.com/content/assets/background-about.webp" }, // page-specific wins
      "footerGraphic": "https://cdn.example.com/content/assets/footer-graphic.png", // decorative footer watermark (P12-FG) — NOT the footer logo
      "headerGraphic": "https://cdn.example.com/content/assets/header-graphic.svg", // decorative header band (P12-HG) — NOT the header logo or a banner
      "statusGraphic": "https://cdn.example.com/content/assets/status-graphic.svg"   // decorative error/404 graphic (P12-SG) — ONE shared status role, NOT an icon
    }
  }
}
```

`site.assets.*` values are **absolute URLs** (validated at build time). Absent
keys fall back to the shipped Foundation default asset, so a fresh clone needs
no asset configuration. The `ogImage` value is used by every page's Open Graph
and Twitter metadata (via the `resolveOgImageUrl` helper) whenever a deployment
**configures** it against its own approved image, and when the key is
absent — as it is unless a deployment sets it — the per-locale generated
OpenGraph image route is used as the fallback (that route deliberately stays in the
engine).

#### Generic branding asset roles (P6-2A, wired P6-2C, composed P6-2D)

Branding assets under `public/assets/` use **generic functional filenames**,
not brand-specific ones. Components/configuration reference a role's
filename, never a Provelopment-specific name — so replacing the underlying
artwork is a **file swap only**, with no component change required.

These are **functional asset roles**. The files are intended to be replaceable
without changing component source code.

| Generic role | Runtime file | Wired to |
| --- | --- | --- |
| `logo-header` | `logo-header.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.logo` → JSON-LD `Organization.logo` **and** the rendered header brand mark (P6-3B) |
| `logo-footer` | `logo-footer.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.logoFooter` → `SiteFooter` (P6-2D — a restrained decorative mark beside the copyright line) |
| `banner-*` | `banner-home.png` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.banners["home"]` → `PageBanner` (P6-3B — a per-page banner above the header) |
| `sidebar-default-icon-open` | `sidebar-default-icon-open.svg` in the role namespace (BRAND_ASSETS.md §1.1) | the sidebar navigation-item EXPANDED default (P6-3B — a large dot) |
| `sidebar-default-icon-closed` | `sidebar-default-icon-closed.svg` in the role namespace (BRAND_ASSETS.md §1.1) | the sidebar navigation-item COLLAPSED default (P6-3B — a large plus) |
| `sidebar-open` | `sidebar-open.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `ui.navigation.sidebar.open.icon` default (`DEFAULT_SIDEBAR_OPEN_ICON`) — the live Show navigation control graphic |
| `sidebar-close` | `sidebar-close.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `ui.navigation.sidebar.close.icon` default (`DEFAULT_SIDEBAR_CLOSE_ICON`) — the live Hide navigation control graphic |
| `favicon` | `favicon.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.favicon` → `metadata.icons.icon` (the live browser tab icon) |
| `footer-graphic` | `footer-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.footerGraphic` → `FooterGraphic` (P12-FG — ONE global decorative footer graphic / watermark layer behind the footer content; **not** the footer logo) — **role supported; it becomes active only when a deployment configures `site.assets.footerGraphic` and the referenced file resolves** |
| `header-graphic` | `header-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.headerGraphic` → the header's own background band (P12-HG — ONE global decorative header band behind the logo/navigation; **not** the header logo and **not** a page banner) — **role supported; it becomes active only when a deployment configures `site.assets.headerGraphic` and the referenced file resolves** (the measured `cover` crop is an artwork/owner review item, not a coding gate) |
| `background-all` | `background-all.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.backgrounds.all` → `PageBackground` (P12-BG — the reserved `all` key: the **global/fallback** page-background graphic, layered **over** the flat `ui.theme.background` colour, used only where no page-specific entry applies) — **role supported; it becomes active only when a deployment configures the role and the referenced file resolves** |
| `status-graphic` | `status-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) | `site.assets.statusGraphic` → `StatusGraphic` (P12-SG — ONE shared decorative graphic above the heading on **both** status surfaces; **not** an error icon) — **role supported; it becomes active only when a deployment configures `site.assets.statusGraphic` and the referenced file resolves** |

Status (P6-2D/P6-3B/P6-3C — brand presentation composed; header mark + scaled page banners):

- **`favicon`** — fully live and authoritative: `site.assets.favicon` resolves via
  `assetPathFromUrl` to the same-origin `/content/assets/favicon.svg` and Next.js emits
  exactly one `<link rel="icon">` (browser-verified `count=1`,
  `href=/content/assets/favicon.svg`). The former file-convention route `src/app/icon.svg`
  was **removed** in P6-3B, so no competing/stale icon declaration exists. The
  artwork is the owner-supplied graphic; no favicon redesign was performed.
- **`logo-header`** — wired through JSON-LD `Organization.logo`
  (`site.assets.logo`, consumed by `structured-data.tsx`) **and**, since P6-3B,
  rendered as the header's left brand mark (`<img class="ui-site-header-logo">`
  inside a link to the locale root, `alt` = the site name, intrinsic aspect ratio
  via `height: 2rem; width: auto`, `max-width: 100%`). The former text brand
  label was replaced. Absent config → the previous text brand link (never a
  broken image).
- **`banner-*` (P6-3B; scaling contract P6-3C)** — **composed**: the server
  resolves `site.assets.banners` (page-slug → absolute URL) through
  `availableBannerPath` to same-origin paths for entries whose file exists under
  `public/assets/`, reads the graphic's **intrinsic size** (`readImageDimensions`,
  server-only, cached), and `PageBanner`
  (`src/components/site/page-banner.tsx`) renders the banner for the CURRENT page
  above the header. A page with **no** entry renders **nothing** — no container,
  no reserved blank block, never another page's banner (browser-verified: header
  top = 0 on a no-banner page). Sizing contract:
  - **Always centered** horizontally in the available page width (never
    left-aligned) — including when the graphic is capped and narrower than the
    page (browser-measured at 1280: `left=453 right=813 vw=1265 w=360`).
  - **`displayWidth = min(available page width, 1.5 × natural width)`** and the
    height always follows the graphic's own aspect ratio (**no** fixed height, no
    crop, no stretch, no structural padding/margin/border/radius).
  - It therefore **scales down** when the graphic is wider than the page,
    **fills** the page between the natural width and 1.5×, and **stops at 1.5×**
    beyond that — it is never enlarged merely to fill the page. The cap is passed
    down as `--ui-banner-max-width` (never a hard-coded width), and if the
    intrinsic size cannot be decoded the banner is **downscale-only**
    (`width: auto; max-width: 100%`).
  - Browser-measured cases with the shipped approved graphic (natural 3546×443,
    ≈8:1, cap 5319): the page width is always **below** the cap, so the banner
    fills the available width at every supported viewport — 220px viewport →
    **205** (below the mobile minimum, exercises the downscale case); 300 → **285**;
    390/700/800/1024/1280 → the full available width. No horizontal overflow at
    any width, and the height always follows the graphic's own ~8:1 ratio.
  - The former `banner-home.jpg` was the migrated `logo-title.jpg` (240×135 ≈ 16:9),
    so with the 1.5× cap it rendered only a **centered 360px-wide** banner on
    desktop. It has been **superseded and removed** by the approved Foundation
    banner family. To obtain the intended full-width band, supply a graphic wide
    enough that 1.5 × its natural width exceeds the target viewport (the approved
    pack's 3546px does so at every supported width).
- **`background-*` (P12-BG)** — **capability composed; no Foundation artwork yet**:
  the server resolves `site.assets.backgrounds` (page role → absolute URL, with the
  reserved `all` key as the **global** background) through `availableBackgroundMap`
  to same-origin paths for entries whose file exists in a DECLARED runtime namespace (§ BRAND_ASSETS.md §1.1), and
  `PageBackground` (`src/components/site/page-background.tsx`) renders one
  decorative, content-independent layer for the CURRENT page. Resolution is
  `background-<page>` → `background-all` → **none**: a page with no entry (and no
  global) renders **nothing** — no placeholder, never another page's graphic — so
  no graphic background is required for any page to work. The layer is
  `position: fixed; z-index: -1; pointer-events: none` with `aria-hidden="true"`:
  it adds no padding/margin/reserved height/horizontal overflow, cannot shift the
  header/banner/content/footer, cannot capture a click/selection/focus, and
  contributes no accessible name or semantics. It layers **over** the flat
  `ui.theme.background` colour — the colour token still defines the base colour.
  One asset `cover`s any viewport (no per-breakpoint roles, no art direction) and
  it is static only (no animation, no parallax). As a CSS `background-image` it
  bypasses the Next image optimizer. **The role is supported by the Foundation
  and needs no artwork**: `site.assets.backgrounds` becomes active only when a
  deployment configures it (`all` is the global/fallback entry) and the referenced
  file resolves; until then **nothing is rendered at all**, so the page keeps the
  flat `ui.theme.background` colour on its own.
- **`footer-graphic` (P12-FG)** — **capability composed; the shipped default is BLANK**:
  `site.assets.footerGraphic` is ONE optional **global** decorative footer graphic /
  watermark — deliberately **not** the footer identity mark, so a deployment may have
  a footer logo, a decorative graphic, both, or neither. The server resolves it
  through `availableFooterGraphicPath` (the **same** generic availability rule as the
  banner/background roles) to a same-origin path only when the file exists under
  a DECLARED runtime namespace (§ BRAND_ASSETS.md §1.1), and renders `FooterGraphic`
  (`src/components/site/footer-graphic.tsx`) as a `.ui-footer-graphic` layer inside
  the footer. Configured-but-missing is indistinguishable from absent → **nothing is
  rendered at all**, so an unconfigured deployment gains no DOM and the footer layout
  is unchanged. The layer is `position: absolute; inset: 0; z-index: -1;
  pointer-events: none` inside the `relative` footer with `aria-hidden="true"`: it
  adds no padding/margin/reserved height/horizontal overflow, cannot move or obscure
  the logo, columns, links or copyright line, cannot capture a click/selection/focus
  (footer links stay fully clickable), and contributes no accessible name or
  semantics. The engine applies **no** colour, opacity or blend mode — the approved
  artwork carries its own subtlety and is never recoloured. One asset `cover`s any
  viewport (no mobile/desktop variants, no art direction) and it is static only (no
  animation, no parallax). As a CSS `background-image` it bypasses the Next image
  optimizer. **The default Foundation configuration no longer requires a branded
  decorative footer graphic**: `footer-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) is the byte-identical
  mirror of the blank transparent placeholder
  (`content/assets/placeholders/footer-graphic.svg`), so the default presentation is
  **blank / not used**; the role is available through
  `site.assets.footerGraphic` and renders a layer only once a deployment configures
  it. Activating a branded footer graphic is a pure file replacement
  (2026-09 owner ruling).
- **`header-graphic` (P12-HG)** — **capability composed; the shipped default is BLANK**:
  `site.assets.headerGraphic` is ONE optional **global** decorative header band /
  structural graphic layer — deliberately **not** the header identity mark (that stays
  the independent `logo-header` role) and **not** a page banner (that stays the
  page-specific `banner-*` region *above* the shell). The server resolves it through
  `availableHeaderGraphicPath` (the **same** generic availability rule as the
  banner/background/footer-graphic roles) to a same-origin path only when the file
  exists in a DECLARED runtime namespace (§ BRAND_ASSETS.md §1.1), then `headerGraphicBandProps`
  (`src/components/site/header-graphic.ts`) emits the marker attribute plus the
  `--ui-header-graphic` custom property. Configured-but-missing is indistinguishable
  from absent → **no attribute, no style and no CSS at all**, so an unconfigured
  deployment's header is byte-identical to before. The band is painted as the
  header's **own background** (globals.css —
  `.ui-site-header[data-ui-header-graphic]`), which is the only representation whose
  paint order is guaranteed for every `data-ui-header` treatment: the header's own
  `background-color`, then the band, then **all** of its in-flow content (logo,
  navigation, switchers, mobile trigger). It therefore adds **no DOM node**, **no
  layout height**, no reserved space, no overflow, and **no stacking context or
  `position`** — which is what keeps the shell's `position: fixed` drawer/overlay
  panels (`z-index: 40/50`), which live inside the header, exactly where they were.
  As a CSS `background-image` it carries no semantics (no accessible name, no `alt`,
  no reading-order entry, never focusable) and cannot receive pointer events — no
  `pointer-events` override is applied, because on the header it would disable the
  logo link and the navigation. The engine applies **no** colour, opacity, filter or
  blend mode — the approved artwork carries its own appearance and is never
  recoloured. One asset `cover`s the header edge-to-edge at every viewport (no
  mobile/desktop variants, no art direction) and it is static only (no animation, no
  parallax). **The default Foundation configuration no longer requires a branded
  decorative header graphic**: `header-graphic.svg` in the role namespace (BRAND_ASSETS.md §1.1) is the
  byte-identical mirror of the blank transparent placeholder
  (`content/assets/placeholders/header-graphic.svg`) — a valid 4096 × 512 canvas that draws
  nothing — so the default presentation is **blank / not used**; the role is
  available through `site.assets.headerGraphic` and paints a band only once a
  deployment configures it. Activating a branded header graphic is a pure file
  replacement, and the measured `cover` crop it would imply inside the header box
  (19.46:1 desktop / 2.59:1 mobile) stays an artwork/owner judgement recorded in the
  living-pack provenance — never a coding gate, and no artwork was altered and no CSS
  was added to compensate. Replacing the file or removing the key needs **no code
  change**; the full contract is in [`BRAND_ASSETS.md`](BRAND_ASSETS.md) §10.5
  (2026-09 owner ruling).
- **`status-graphic` (P12-SG)** — **capability composed; no Foundation artwork activated**:
  `site.assets.statusGraphic` is ONE optional **global** decorative status graphic
  shared by **both** status surfaces (`[[...segments]]/error.tsx` and
  `[[...segments]]/not-found.tsx`). It is deliberately **ONE** role, not two: both surfaces
  render the *same* status frame (`<Section className="py-24 text-center">` with an
  `h1` / `p` / action rhythm), so one replaceable graphic serves both truthfully and
  no per-route artwork or per-route config exists. It is **not** an error icon, **not**
  semantic status communication and **not** a replacement for the status heading — the
  heading, the message and the retry/navigation controls remain the complete
  expression of the state, and **the page must be fully understandable and operable
  with no graphic at all**. The `[[...segments]]` layout (server-side) resolves the role
  through `availableStatusGraphicPath` (the **same** generic availability rule as the
  banner/background/footer-graphic/header-graphic roles) to a same-origin path only
  when the file exists in a DECLARED runtime namespace (§ BRAND_ASSETS.md §1.1), reads its intrinsic size, and hands
  `{ src, width, height }` to `StatusGraphicProvider`
  (`src/components/site/status-graphic-context.tsx`) — the same transport
  `ErrorMessagesProvider` already uses, because `error.tsx` is a **Client Component**
  while `not-found.tsx` is a Server Component and the resolver reads `node:fs`.
  `StatusGraphic` (`src/components/site/status-graphic.tsx`) renders one in-flow,
  centred box as the **first child of the status frame — above the heading**
  (`globals.css` — `.ui-status-graphic`). Configured-but-missing is indistinguishable
  from absent → **nothing is rendered at all**, so an unconfigured deployment gains no
  DOM and both status pages are byte-identical to pre-P12-SG. Decorative only:
  `aria-hidden="true"` + `alt=""` (no accessible name, no `role`, no reading order),
  non-focusable, and `pointer-events: none` so the retry button and links stay fully
  clickable. The image renders at its **natural size**, only ever scaling **down**
  (`max-width: 100%`) — never enlarged to fill the page, never cropped, never
  distorted, so no artwork dimension can reshape the page and horizontal overflow is
  impossible; the intrinsic `width`/`height` attributes reserve the box before load
  (no layout shift). The engine applies **no** colour, opacity, filter or blend mode —
  the approved artwork carries its own appearance and is never recoloured. ONE asset
  serves desktop and mobile (no breakpoint variants, no art direction, no `<picture>`,
  no viewport listeners) and it is static only (no animation, no parallax). As a plain
  `<img>` it bypasses the Next image optimizer, exactly like the page banner.
  **No Foundation status artwork is activated**: the role is supported and renders
  on both status surfaces only once a deployment configures
  `site.assets.statusGraphic` and the referenced file resolves.
- **`logo-footer`** — **composed (P6-2D)**: `site.assets.logoFooter` is rendered
  by `SiteFooter` as a visually restrained decorative mark (`alt=""`,
  `aria-hidden="true"`, `h-5 w-auto`) beside the copyright text — supplementary,
  never a substitute for the accessible text. Absent config → no element.
- **`sidebar-open`/`sidebar-close`** — already fully live (pre-existing generic
  filenames, already resolved through
  `DEFAULT_SIDEBAR_OPEN_ICON`/`DEFAULT_SIDEBAR_CLOSE_ICON`,
  `src/core/ui/controls.ts`). The owner-supplied real graphics at these paths
  are used exactly as supplied; **sidebar geometry/behavior was NOT changed by
  P6-2D** — the persistent horizontal-width sidebar redesign is a separate,
  later task.
- **Asset URL handling (P6-2D)** — every composed image reads its role through
  `siteConfig.assets?.*` (never a hard-coded filename) and passes the configured
  absolute URL through `assetPathFromUrl` (`src/config/assets.ts`), which
  re-derives the same-origin pathname so a rendered `<img>` always fetches from
  the CURRENT origin regardless of `site.url` accuracy (placeholder/staging).
  Behavioral coverage: `tests/unit/config-assets.test.ts`.
- Replace any of the six files in place at its existing path, exactly like
  the other `public/assets/*` defaults described above — no configuration or
  component change required.

> **Shipped reference artwork (installed).** The canonical Foundation site now ships the
> **owner-approved Provelopment Foundation brand artwork** at three of these roles:
> `favicon`, `logo-header` and `logo-footer` are the three identity roles. In the
> **generic template** all three resolve to the neutral files in
> `content/assets/placeholders/` (`favicon.svg` and `logo-header.svg`; the footer role shares
> the header source). A deployment replaces them with its own
> byte-identical brand install — which is exactly the swap described here: a file
> replacement (or a `site.assets.*` URL) with no component or configuration change.
> No runtime code references a brand pack at all, and no brand pack ships with this
> template.
> The expanded reverse variants (`lockup-reversed-mono.svg`, `lockup-reversed-color.svg`,
> `lockup-reversed-knockout.svg`) are **not** consumed by any runtime role yet.

#### Source asset tree — `content/assets/` (the three ownership categories)

The repository carries the **source** asset tree in `content/assets/`. It is NOT served
under `public/`; the runtime files are byte-identical mirrors of it (see below). This generic
template ships **three** populated categories — `icon-library/`, `placeholders/` and
`platform-marks/` — and **no** `branding/` category at all: a deployment that supplies its own
artwork creates and populates it, and the template's own taxonomy test asserts that
`content/assets/branding/` is **not** shipped in this repository
(`deployment/tests/unit/asset-taxonomy-mirror.test.ts`).

```text
content/assets/
├── branding/          — YOUR deployment/business artwork; NOT present in this template.
│   ├── banners/         The generic template has no brand of its own, so these
│   ├── identity/        folders are yours to create (banners, identity, logos,
│   ├── logos/           page-graphics are the categories an adopter uses)
│   ├── page-graphics/   (see the capsule's content/assets/README.md)
│   └── branding-schema.md  a brand-system specification you keep, if you keep one
├── icon-library/      — reusable, NON-business-specific generic icons (ALL
│   ├── icons/           retained, whether or not a page currently uses them)
│   └── licensing/       provenance + upstream licence
├── placeholders/      — blank/generic defaults a fresh installation renders
└── platform-marks/    — royalty-free platform/social-service marks (+ their
                         provenance/withheld registers)
```

Architecture (one authority per file — never a second asset system):

```text
content/assets/**                          (source of truth — edit here)
    ↓  scripts/sync-runtime-assets.mjs   (byte-identical mirror)
public/                            (the generated tree the site fetches: the platform namespace and the Spoke's own — §1.1)
    ↓
Foundation components / site.assets.* configuration
```

- `pnpm assets:sync` writes the mirror; `pnpm assets:check` fails on **any** drift,
  on a missing declared source and on an **undeclared** file appearing under
  `public/assets/`. `pnpm build` runs the mirror first, so a half-applied asset
  move can never ship. `deployment/tests/unit/asset-taxonomy-mirror.test.ts` enforces all of it.
- There are **no permanent runtime-only exceptions**: every persistent runtime
  visual asset the template ships has an authoritative source beneath
  `content/assets/`, so the runtime-only allowlist is empty (`RUNTIME_ONLY` in
  `scripts/sync-runtime-assets.mjs`). The mirror's `from` paths are relative to the
  **selected deployment**, so a deployment that adds artwork points the same
  mechanism at its own source rather than at a runtime-only file.
- The header and footer logo ROLES derive from **one** authoritative source: in this
  template both resolve to the neutral `content/assets/placeholders/logo-header.svg`
  (one file, two runtime basenames — see `MIRRORED` in
  `scripts/sync-runtime-assets.mjs`), so the footer shows the same mark as the
  header. A branded deployment mirrors its own single coloured lockup through the
  same mechanism, so the relationship holds whatever the source is.
- The four categories have distinct responsibilities: **branding** is the
  deployment's own artwork, **icon-library** is the reusable generic store,
  **placeholders** are the blank/generic defaults, **platform-marks** are the
  optional social-service marks. Do not mix them (no generic icons in branding, no
  brand artwork in placeholders, no platform marks in the icon library).

**Branding-agent workflow** (source tree → runtime):

1. Read the brand specification
   (`content/assets/branding/branding-schema.md`).
2. Review the source graphics under `content/assets/branding/`.
3. Determine the required branding for the target site.
4. Author/replace the role file **in `content/assets/`** (e.g.
   `content/assets/branding/identity/favicon.svg`).
5. Run `pnpm assets:sync` to mirror it to `public/assets/`, then `pnpm assets:check`.
6. Build the Foundation (`pnpm build`).
7. Verify the assets resolve (no broken images; gate green).
8. Deploy.

A customer/branding implementation should never require a Foundation
component-source change merely to replace branding — only an `content/assets/**` file
replacement (mirrored) and/or a `site.assets.*` URL change.

#### Shipped brand assets — what a fresh clone already contains

A fresh clone needs **no brand artwork of its own**: the Foundation ships its
approved asset set under `public/assets/`, and the canonical `site.config.json`
activates some of those roles while deliberately leaving others merely available.

| Group | Files shipped in `public/assets/` | Canonical role configured? |
| --- | --- | --- |
| Identity | `logo-header.svg`, `logo-footer.svg`, `favicon.svg` | yes — `logo`, `logoFooter`, `favicon` |
| Page banners | `banner-home/about/contact/connect/offerings/portfolio/blog/resources/testimonials/legal.png` | yes — `banners` (ten page roles) |
| Decorative graphics | `background-all.svg`, `status-graphic.svg` (branded); `header-graphic.svg`, `footer-graphic.svg` (**blank transparent defaults**) | yes — `backgrounds.all`, `headerGraphic`, `footerGraphic`, `statusGraphic` |
| Generic page icons | the `content/assets/icon-library/` set (`icon-home.svg`, `icon-about.svg`, `icon-services.svg`, …) — every library icon is mirrored into `public/assets/` | yes — `navigation[].iconOpen/iconClosed` for the sidebar pages |
| Social preview | `og-image.png` (1200 × 630) | yes — `ogImage` (the generated per-locale route remains the fallback) |
| Generic connectivity icons | `icon-phone.svg`, `icon-email.svg`, `icon-message.svg`, `icon-link.svg`, `icon-external-link.svg`, `icon-share.svg`, `icon-globe.svg` | **no** — available for your own connectivity items |
| Admitted platform marks | `whatsapp.svg`, `telegram.svg`, `facebook.png`, `messenger.svg`, `instagram.svg`, `linkedin.png`, `github.svg` | **no** — available only; see below |

**Replace** any Foundation-owned graphic by overwriting the file in place at its
`public/assets/` path (or by pointing the `site.assets.*` key at your own absolute
URL) — no component, no config grammar and no engine change is involved. **Remove**
one by deleting its config key; a configured-but-missing role behaves exactly like an
absent one and renders nothing (never a placeholder, never a broken image).

> **`header-graphic.svg` and `footer-graphic.svg` ship as BLANK transparent
> defaults.** The default Foundation configuration does not require a
> branded decorative graphic: each runtime file is the byte-identical mirror of its
> `content/assets/placeholders/` source and draws nothing, so the default presentation is
> **blank / not used** — the roles render only once a deployment configures them.
> Activating branded artwork is a pure file replacement (a deployment that keeps a
> branded master swaps the runtime file). The header band
> is `cover`-painted inside the measured header box (19.46:1 desktop / 2.59:1
> mobile), so activating the 8:1 branded master would magnify and crop it; that crop
> outcome is a **Master-Brand-Architect-owned aesthetic judgement**, recorded in the
> living-pack provenance — deliberately **not** a coding criterion, and the seam is
> technically validated: it adds no DOM, no layout height and no stacking context,
> never overflows, and leaves the navigation, the logo and the mobile drawer working.
> Replace the file (or remove the key) at any time — **no code change**. See
> [`BRAND_ASSETS.md`](BRAND_ASSETS.md) §10.5.

##### Generic connectivity icons vs. platform marks

These are two different things, and only one of them is trademark-gated:

```text
generic functional icon (phone, email, message, link, external-link, share, globe)
  → non-trademark universal inventory → free to use on any connectivity item

third-party platform mark (WhatsApp, Telegram, …)
  → the platform owner's official mark, subject to that owner's brand rules
```

**Generic connectivity icons** are used exactly like any other icon leaf: set
`connect.methods[].icon` (or `socialLinks[].icon`) to the plain filename, e.g.
`"icon-phone.svg"` → `/content/assets/icon-phone.svg`. They are never recoloured in code,
and because they render through a plain `<img>` they cannot inherit the
surrounding text colour either: the shipped `stroke="currentColor"` masters paint
in the image's own initial colour (**black**). Encode the colour you want in the
file — see `BRAND_ASSETS.md` §11.

**Admitted platform marks** are used the same way — ONE generic optional leaf, no
platform vocabulary in the engine:

```jsonc
{
  "connect": {
    "methods": [
      { "id": "whatsapp", "label": "WhatsApp", "href": "https://wa.me/1234567890",
        "icon": "whatsapp.svg" }
    ]
  }
}
```

Two honest caveats:

1. **A mark file may legitimately be present without any account.** The canonical
   Foundation ships all seven admitted marks so they are available after a fresh
   pull, but it configures **no** social profile, handle, phone number or page — so
   the site renders **zero** platform artwork today. Do not attach a mark to an
   invented destination: availability is not activation.
2. **A missing or unapproved mark falls back to text, by design.** Connectivity
   artwork is strictly supplementary: if the configured `icon` has no backing file
   (or the platform has no approved mark — e.g. one of the five withheld platforms),
   the item simply renders as its complete, working **text link**. No build failure,
   no broken image, no lost contact method. The visible label is always the
   accessible name.

Admitted-mark provenance and the withheld register live with the marks themselves —
`content/assets/platform-marks/platform-marks-provenance.md` (official source owner,
published use basis, colour variant, modifications and
preconditions P-1…P-4). Note that platform brand rules sometimes require a
particular colour variant for a particular surface, and the engine applies **no**
recolouring or filter — see *Precondition P-1* for the two black variants.

**Content-level images are separate:** an image inside a page comes from the content
itself — an ordinary Markdown image (`![description](/assets/photo.png)`) in a page
body. It is distinct from the global site-asset registry above; an adopter supplies page
imagery in the same `content/**` files that hold the words, and it is served from
`public/assets/` like any other runtime graphic (see §1.1 in `BRAND_ASSETS.md`).
the text.

User-facing interface strings (nav labels, hero copy, section headings, 404
copy, the language-selector label) live in one JSON file per locale under
`config/i18n/`. These are the customizable translation data.

Adding a locale is **config + data work only** — no `src/` code needs to
change:

1. Register the locale in `i18n.locales` in `site.config.json`.
2. Create `config/i18n/<code>.json` matching the shape of the existing files.
   Each file carries:
   - `home.tagline` / `home.description` — the localized home-page hero copy
   - `navigation.items` — localized navigation labels keyed by href
     (`"/"`, `"/about"`, …). Missing keys fall back to the label configured
     in `site.config.json`, so pages you don't localize still work.
   - `language.label` — accessible label for the header language selector
   - `error` — copy for the error-recovery page (`title`, `message`,
     `tryAgain`, `returnHome`). Localized the same way the 404 copy is; the
     error page automatically follows the active locale.
   - `business` / `a11y` — business-hours and accessibility strings
3. Dictionaries are discovered automatically from the `config/i18n/`
   directory at build time and validated against the **Zod** `dictionarySchema`.
   A malformed file, a missing key, or a *configured locale with no dictionary
   file* fails the build with an actionable error — it never silently falls
   back to English. (`getDictionary()` falls back to the default locale only
   for locales that are NOT configured.)
4. Optionally translate pages: add `content/pages/markdown/<code>/<slug>.md` (or the
   JSON counterpart) beside the default language's file.

Every locale is statically rendered and included in the sitemap with
hreflang alternates.

## 5. Features & Business Profile

Optional functionality is expressed as feature flags under `features` in
`site.config.json` and consumed by dedicated adapters. Every integration is
**optional** — the Foundation provides seams, not mandatory third-party
accounts. A site with no `features` block (or with a feature omitted) still
builds and runs normally; unconfigured integrations simply do not render.

Current feature flags:

- `analytics` — visitor analytics provider (e.g. `vercel`).
- `maps` — directions-deep-link provider for business locations (e.g. `google`).
- `booking` — static external booking action (e.g. `external-url`).
- `contact` — contact inquiry provider (`webhook` or the `stub` demo default).

> **Content has no flag.** Adding or removing a page is adding or removing a file —
> there is no switch that could hide a page that exists, and no flag whose state could
> disagree with the content tree.

> **LEGACY RUNTIME — NOT EFS.** The business/location/hours configuration below is retained for
> historical maintenance and legacy tests. EFS has no automatic timezone, currency, open-now or
> location-routing behavior. Authored place/contact/opening-hours facts are optional properties.

### Business profile, locations & hours (`business` in `site.config.json`)

- **Timezone:** values must be valid IANA identifiers (e.g. `Asia/Jakarta`,
  `America/New_York`). Invalid zones fail configuration at build time.
  Resolution precedence: `location.timezone → business.timezone → "Etc/UTC"`.
- **Hours:** `intervals` list weekday ranges with 24-hour `HH:mm` times.
  `close < open` means *overnight* — `22:00–02:00` opens at 22:00 and stays
  open until 02:00 the next day. `open === close` is rejected as ambiguous.
- **Exceptional days:** `exceptional` entries override a single calendar date
  (in the location's timezone) — either `closed: true` or a custom interval,
  overnight included. They follow the same model as regular intervals.
- **UI:** the footer shows each location's weekly schedule with localized day
  labels, any exceptional/holiday dates, a timezone indicator, and a live
  "Open now"/"Closed" badge computed in the location's timezone.
- **Structured data:** the JSON-LD `LocalBusiness`/`Organization` block
  includes an `openingHoursSpecification` built from the configured intervals.

> **LEGACY RUNTIME — NOT EFS.** Regional pages and operating contexts below are not current
> production instructions and are not an EFS geographic capability.

### Regionalized pages & operating context (`business.regions` + `business.pages`) — Phase K

When a business operates in more than one place — or wants different pages to
show different operational identities — configure **regions** instead of (or
alongside) the global model. A **Page** is `locale + content slug + optional
region`; a **Region** is the complete operational identity of that page.

```jsonc
"business": {
  "regions": {
    "toronto": {
      "timezone": "America/Toronto",          // required, valid IANA
      "name": "Toronto Studio",
      "address": { "street": "…", "city": "Toronto", "country": "Canada" },
      "geo": { "lat": 43.6473, "lng": -79.3963 },
      "phone": "+1 416 555 0142",
      "email": "toronto@example.com",
      "hours": {
        "monday":  [{ "open": "09:00", "close": "17:00" }],
        "tuesday": [{ "open": "09:00", "close": "17:00" }],
        // … every day is independently configurable …
        "saturday": [{ "open": "10:00", "close": "14:00" }],
        "sunday": [],                          // [] = closed, structurally
        "holidays": [
          { "date": "2026-12-25", "name": "Christmas Day", "closed": true },
          { "date": "2026-12-24", "name": "Christmas Eve",
            "intervals": [{ "open": "09:00", "close": "13:00" }] }
        ]
      }
    },
    "new-york": { /* America/New_York, its own address/hours/holidays */ }
  },
  "pages": [
    { "locale": "en", "slug": "toronto",   "region": "toronto" },
    { "locale": "en", "slug": "new-york",  "region": "new-york" },
    { "locale": "fr", "slug": "toronto",   "region": "toronto" }   // one region, many locales
  ]
}
```

Key rules:

- **Seven explicit days.** Hours are `monday` … `sunday`, each a list of
  `HH:mm` intervals. `[]` or an omitted day = closed (no fake times). Multiple
  intervals per day (e.g. split lunch hours) are supported; `close < open` is
  overnight and carries into the next day.
- **Holidays are structured overrides.** Precedence:
  *weekly schedule → holiday/special-date → resolved hours*. A holiday with
  `closed: true`, or one listed with only a `name`, closes the date; special
  `intervals` replace the weekly schedule for that date.
- **Timezone is region-authoritative.** Each region requires a valid IANA
  identifier. It is used for visible timezone text, hours evaluation, open/
  closed status, overnight carry, DST, and holiday evaluation. The timezone is
  NEVER inferred from locale, address, or any global/default value.
- **Isolation.** A regional page shows ONLY its region's address, phone, email,
  timezone, hours, holidays, status, directions, and JSON-LD. Other regions'
  data and any legacy global `business`/`locations` values never appear.
- **Deterministic modal precedence.** `business.regions` non-empty → regional
  mode (legacy footer NAP + global JSON-LD are suppressed). `business.regions`
  absent → the legacy global model renders exactly as before. The two never mix.
- **Pages are independent.** Create `content/pages/markdown/<site>/<locale>/<slug>.md` for each
  page (its existence makes the route real), add a `pages` binding to attach a
  region, and add navigation entries for discoverability. Locales may have
  different page sets; one locale may host several regional pages; one region
  may be reached from several locales.
- **Page→region errors fail the build:** a binding to a missing region, a
  duplicate `(locale, slug)`, an unconfigured locale, `local-international`
  without `addressInternational`, invalid holiday dates/names, bad `HH:mm`, or
  `open === close` are all rejected at configuration time.
- All demonstration region data is **fictional** — replace it before go-live.

> **LEGACY RUNTIME — NOT EFS.** The Location selector and regional URL instructions below are
> retired from current production. Do not configure them in an EFS Installation.

### Locale + Location selectors and regional page URLs (`business.pages`) — Phase L

Locations are **selectors**, not navigation links. The location selector sits
beside the language selector in the header; together they determine which
page/footprint you are viewing. This removes the old location entries from the
main menu.

```jsonc
"business": {
  "regions": { "toronto": { …, "label": "Toronto" }, "new-york": { … } },
  "pages": [
    { "locale": "en", "region": "toronto" },                   // /en/toronto (Home)
    { "locale": "en", "region": "toronto", "slug": "about" },     // /en/toronto/about
    { "locale": "en", "region": "toronto", "slug": "connect" },   // /en/toronto/connect
    { "locale": "en", "region": "new-york" },                 // /en/new-york (Home)
    { "locale": "en", "region": "new-york", "slug": "about" },
    { "locale": "en", "region": "new-york", "slug": "connect" }
  ]
}
```

Key points:

- **URL model:** `/{locale}` (home), `/{locale}/{region}` (regional landing),
  `/{locale}/{region}/{page}` (regional page). A page authored for a region is served
  there with the region's operational identity; a region whose id collides with a
  reserved first segment is rejected at build time.
- **Every bound `(locale, region)` needs a landing entry** (the bare `{
  locale, region }` line). A page entry without its landing fails the build.
  The Phase K `{ locale, slug: "toronto", region: "toronto" }` form is still
  accepted and migrated automatically.
- **What a region exposes is CONFIG + PAGES:** a regional page exists exactly when it
  is bound for that `(locale, region)` AND authored as a page. Downstream adopters
  configure whatever page inventory they want per locale × region; one region may
  exist in several locales.
- **Regional currency values** (`currency`, `currencySymbol`) remain part of a region's
  identity data. Nothing in the platform renders a catalogue price today: with the
  offerings collection gone (A1E), a deployment that shows prices states them in the
  page's own text, in whatever currency it chooses.
- **Switching behavior (deterministic, pure core):**
  - Location: keep the language; go to the same page in the target region, or
    its landing, or (as a defensive fallback) its first configured page.
  - Language: keep the region; go to the same page in the target locale, or
    its landing; locales that have no page for the current region are simply
    not offered (never a silent region change, never a dead link).
- **`region.label`** (falls back to `name`, then the id) is what the location
  selector shows. The selector is hidden for locales with no configured
  regions.
- **SEO:** canonical URLs, hreflang only for existing locale/region/page
  combinations, and the sitemap lists only configured routes.

### Selector semantics, region-aware navigation, Connect & identity (`connect` + region `defaultLocale`) — Phase M

Locations are **selectors**: the Location dropdown shows every configured
operating location (from `business.regions`) in alphabetical order, plus an
explicit **Unspecified** option — the list is never filtered by the current
language and is never lost after selecting a region. Option display labels
use contextual parenthetical notation:
- When viewing in a non-English language (`ko`, `ja`, `zh`, etc.): the city
  name in that language is displayed first, followed by the English name in
  brackets if distinct (e.g. `서울 (Seoul)`, `東京 (Tokyo)`, `Londres (London)`).
- When viewing in English: the English name is displayed; for cities whose
  primary operating language is non-English, the local name is appended in
  brackets if distinct (e.g. `Tokyo (東京)`, `Seoul (서울)`, `Moscow (Москва)`),
  while English-primary locations omit brackets (`London`, `Sydney`, `Toronto`).
The Language dropdown lists the default language (English) first, followed by
remaining languages in alphabetical order.

```jsonc
"business": {
  "regions": {
    "toronto": { …, "defaultLocale": "en" },   // the default audience language
    "new-york": { … }
  },
  "pages": [
    { "locale": "en", "region": "toronto" },
    { "locale": "fr", "region": "toronto" },
    { "locale": "fr", "region": "toronto", "slug": "about" },
    { "locale": "fr", "region": "toronto", "slug": "connect" }
  ]
},
"connect": {
  "methods": [
    { "id": "message", "label": "Message Us", "href": "/contact" },
    { "id": "email", "label": "Email", "href": "mailto:…", "demoOnly": true },
    { "id": "whatsapp", "label": "WhatsApp", "href": "https://wa.me/…", "demoOnly": true },
    { "id": "viber", "label": "Viber", "href": "viber://chat?number=…", "demoOnly": true }
  ]
}
```

Key behavior:

- **`region.defaultLocale` (optional).** The deterministic locale chosen when a
  location switch arrives from an unsupported language (`/de` → Toronto →
  `/ww/en/toronto`). Must be a configured locale AND bound to the region (build
  error otherwise). Absent → derived from the region's first landing binding.
  Never inferred from country/timezone/browser.
- **Unspecified returns you to generic:** `/ww/en/toronto/about` → *Location:
  Unspecified* → `/ww/en/about`; `/ww/de/berlin` → `/de`. Generic pages have no
  operating identity (no invented address/timezone/JSON-LD).
- **Region-aware navigation.** Inside a region, primary/footer navigation shows
  only pages that exist for that locale + region (e.g. Home/About/Connect, no
  fake Resources). Home always means **this region's home**. A nav item never
  silently redirects.
- **Connect first-class.** Primary nav exposes **Connect** (not Contact). The
  `/connect` page renders the configured `connect.methods` (internal page or
  `mailto:`/`tel:`/`https:` deep link), badges `demoOnly` entries, and always
  shows a visible demo notice. The Contact page (`/contact`) remains, with a
  visible "not connected to a real backend" notice. Footer: **Contact** lives
  under a dedicated **Connect** column (never under Navigate).
- **`connect.methods`** are the adopter's configurable connection inventory —
  no provider integrations; `demoOnly` = template demonstration. Each method may
  also carry the optional generic `icon` (**Connectivity icons** section above)
  — supplementary artwork only: the method always renders as a text action.
- **Template identity.** The Foundation demo names itself **Your Business
  Site**; keep or replace it. The old "My Site" placeholder is gone from
  visitor-facing copy.

### Requiring a Location per Site (`sites[].locationSelection`) — LOC1, LOC2

Keep the two concepts apart first — they are independent:

| Concept | What it is | Where it lives |
| --- | --- | --- |
| **Site** | the country/global context *inside* the active website (its own pages, languages and Locations) | the first URL segment (`/ca/en/...`) |
| **Location** | the physical/business place *inside* that Site (address, phone, hours, currency) | `business.regions` + that Site's `business.pages` bindings |

By default a Site is **optional-location**: the Location control offers an explicit *Unspecified*
choice, and non-regional routes (`/ca/en`, `/ca/en/about`) are valid pages with no operating identity.
A Site whose every page belongs to a place can instead say so — **once, about itself**:

```jsonc
"sites": [
  {
    "code": "ca",                                  // the Site this policy is about
    "locales": ["en", "fr"],
    "defaultLocale": "en",
    "locationSelection": {
      "mode": "required",                          // the ONLY mode; omit the block for optional behaviour
      "default": "toronto",                        // YOUR choice — never inferred from order/locale/timezone
      "localeDefaults": { "fr": "montreal" }       // OPTIONAL (LOC2): the Location that completes a
                                                   // Location-less request in THAT locale — also YOUR choice
    }
  }
]
```

What `required` changes, and nothing else:

- **No unspecified state.** The Location control drops its *Unspecified* option; the configured
  `default` Location is the natural selection and leads the list. The remaining Locations keep their
  usual (label) order, and the inventory is still the ACTIVE Site's own Locations only.
- **Non-regional URLs are completed into the default Location, publicly.** `/ca/en` →
  `/ca/en/toronto`; `/ca/en/about` → `/ca/en/toronto/about` (when that Location has the page — else its
  landing). `/{site}/{locale}` and `/{site}/{locale}/{page}` therefore always end up inside a Location.
  The requested locale is kept when the default Location is bound to it; otherwise the Location's own
  configured `defaultLocale` decides, exactly as the Location selector already does. A URL that already
  names a Location — including one that is not the default — is answered unchanged.
- **…and, if YOU say so, into a DIFFERENT Location per locale (LOC2).** When a Site's languages are
  different places, name the Location that completes a Location-less request in that language:
  `"localeDefaults": { "fr": "montreal" }` → `/ca/fr` → `/ca/fr/montreal`, while every locale you do not
  name keeps the Site-wide `default`. Three things this is *not*:
  - **not inference** — the platform knows no association between a language and a place, so nothing is
    derived from a language, a country, a timezone or an order; if `fr` should land in Montréal, you
    write it down;
  - **not a replacement for the URL** — it is consulted ONLY while completing a request that names no
    Location yet, so once a Location is in the URL the URL wins, in every locale;
  - **not a second site-wide default** — it is a refinement of the completion, per Site and per locale,
    and omitting `localeDefaults` is exactly the LOC1 behaviour.
- **The Location stays in the URL.** Nothing is stored in a cookie, a session, `localStorage`, an
  environment variable or any other hidden state: the URL is still the Location's authority, and the
  redirect is the only mechanism.
- **Discovery follows.** Because those non-regional URLs are redirects, a required Site's sitemap
  publishes its Location inventory (landings and regional pages) and deliberately does not advertise
  the non-regional forms as visitor destinations.
- **Errors are configuration errors.** A policy that cannot be honoured is **rejected at build time**,
  naming the Site, the configured Location and the rule broken:
  - `default` must exist in `business.regions`;
  - the Site must actually bind Locations (`business.pages`);
  - `default` must be one of THIS Site's Locations — another Site's Location can never satisfy it;
  - `default` must have a usable landing in this Site (a locale bound to it with a landing entry);
  - and, for **each `localeDefaults` entry** (LOC2):
    - the locale key must be one THIS Site serves;
    - its Location must exist in `business.regions`;
    - its Location must be one of THIS Site's Locations (the Site that owns it is named otherwise);
    - its Location must have a landing in **that exact locale** — a refinement may never fall back to
      another locale, because that is exactly what you authored it to prevent.
  It never becomes a runtime 404.

Backward compatibility is intentional and total: **absent `locationSelection` = today's behaviour**, and
**absent `localeDefaults` = the LOC1 behaviour**. Existing Sites keep the *Unspecified* option,
non-regional routes stay valid, a required Site's locales you do not refine keep its site-wide `default`,
and no configuration needs migrating. `mode` accepts exactly one value (`"required"`); there is no
deployment-wide switch, no per-locale mode and no second spelling.

### Presentation localization, timezone heading & Connect gateway (Phase M refinement)

- **Localized + English display names.** Add `englishLabel` to each
  `i18n.locales[]` entry (`Français` + `englishLabel: "French"` → the Language
  selector shows `Français (French)`; never `English (English)`). Add
  `region.labels[locale]` for localized **location** names — canonical English
  stays `region.label ?? name ?? id` (`labels: { "ja": "東京" }` shows
  `東京 (Tokyo)`; `Montréal` + `labels: { "fr": "Montréal" }` shows
  `Montréal (Montreal)` in French and `Montreal` in English). Presentation
  only — region ids remain language-neutral.
- **Timezone inside the Business Hours heading.** `RegionBlock`/`BusinessInfo`
  render `Hours (Time Zone: <localized (<English>) — <IANA>)` as ONE heading.
  Human names come from the platform `Intl` table (no translation data); the
  English parenthetical is omitted when identical; the IANA identifier is
  always shown. Requires `dictionary.business.hoursTimeZoneLabel` per locale.
- **Footer Connect = gateway.** The section heading IS the `/connect` link
  (resolved exactly like the header). Beneath it only the configured
  connection methods appear — no duplicate Connect, no separate Contact item.
  The `/contact`-backed action is called **Message Us** (`connect.methods`
  label + `dictionary.connect.methods.message` override); the route stays
  `/contact`. Internal actions are omitted in regional contexts where `/contact`
  is not a regional page; external deep links (mailto/tel/https/viber) never
  reset locale or location.
- **`getDictionary(locale).connect.methods`** optionally override method labels
  per locale (the footer and Connect page share `connectMethodLabel`); proper
  nouns (WhatsApp, Telegram, Viber) typically keep the config label.
- **Viber.** Add it like any other method: `{ "id": "viber", "label": "Viber",
  "href": "viber://chat?number=…", "demoOnly": true }`. Configuration-only —
  no SDK/API/backend.

### Locale-specific business address, phone & geo (`locations[].locales`)

By default a location's address, phone and geo are **global** — the same for
every locale. If you want a visitor to a specific locale to see market-appropriate
business data instead of the global/head-office location, add a per-locale
override to that location:

```jsonc
"business": {
  "locations": [
    {
      "id": "main",
      "address": {
        "street": "1 Demo Street",
        "city": "Jakarta",
        "country": "Indonesia"
      },
      "phone": "+62 21 0000 0000",
      "geo": { "lat": -6.2, "lng": 106.816 },
      "locales": {
        "de": {
          "address": { "city": "Example City", "country": "Example Land" },
          "phone": "+49 30 0000 0000",
          "geo": { "lat": 52.52, "lng": 13.405 }
        }
      }
    }
  ]
}
```

Key points:

- **`locales` is optional.** A location without it behaves exactly as today
  (global data for every locale).
- The `locales` map is keyed by **BCP-47 locale code** (the same codes used in
  `i18n.locales`). Adding an override for a locale is a pure
  configuration/data change — no `src/` platform code edit.
- **A locale is a visitor context, not a geographic mapping.** The Foundation
  makes no assumption that `de`⇄Germany, `ja`⇄Japan, `id`⇄Indonesia, etc. You
  decide, in this file, whether a given locale should present different data.
- **Each override is partial.** Only the fields you set replace the global
  values: `address` is merged **per field** (unset fields like `street`,
  `postalCode`, `country` are inherited from the global address), and unset
  `phone`/`geo` are inherited.
- **Fallback chain:** locale override → global location data → existing behavior.
  A locale with no entry always falls back to the global data, never an error.
- **Timezone and hours are NOT localized in this model.** They stay at the
  location level and are a single global truth (operating schedules, not
  identity/presentation).
- **Structured data follows the same rule:** the footer *and* the JSON-LD
  resolve through the same mechanism, so a localized address never diverges
  between the visible footer and structured data.
- **Only supply real business/location data** appropriate to your own
  operation. The Foundation ships no fabricated localized addresses as
  production data; treat the example above (clearly fictional) as schema
  illustration only.

> **What the shipped Foundation demo configuration uses.** To visually prove the
> Phase G pipeline (`locale → locale-resolved location → address → geo →
> directions`), the Foundation's default `site.config.json` ships per-locale
> overrides pointing at recognizable **public landmarks** (e.g. `en` → Big Ben /
> Westminster, London; `id` → Monas, Jakarta; `de` → Brandenburg Gate, Berlin;
> `fr` → Eiffel Tower, Paris; `es` → Puerta del Sol, Madrid; `ja` → Tokyo Tower,
> Tokyo; `ko` → Gyeongbokgung Palace, Seoul; `zh` → The Bund, Shanghai).
> **This is Foundation demonstration data only** — it does NOT imply that the
> template author or Provelopment operates from those locations. Replace all of
> it with your real business data before go-live.

### Customer-facing contact per locale (`business.contact.locales`)

The footer's **customer-facing** contact channels (email + phone) can be
configured independently for each locale. Configure them once on the business
contact block; a visitor to a locale sees that locale's values instead of a
silently global number:

```jsonc
"business": {
  "contact": {
    "email": "hello@example.com",  // global fallback
    "locales": {
      "de": { "phone": "+49 30 0000 0000", "email": "hallo@example.de" },
      "fr": { "phone": "+33 1 0000 0000" } // partial: email inherits global
    }
  }
}
```

- **`locales` is optional.** No `locales` (or no entry for a locale) falls back
  to the global contact values — a globally-fixed business is a valid state.
- **A locale is a customer context, not a country.** The Foundation never infers
  a phone number from a locale; you supply exactly the per-market values you want.
- **Precedence:** locale override → global business contact. Locale-specific
  email and phone are independent (per-field fallback).
- The location-level `locations[].phone` capability remains supported — use it
  for a specific branch's number. **Customer-facing contact display** (the
  footer top block + JSON-LD) reads `business.contact` (locale-resolved). If you
  want a per-market number shown to visitors, configure
  `business.contact.locales`.

### Native/local + optional Latin/international address

A location can carry **two structured representations** of the same place:

- `address` — the native/local form (what a local customer reads).
- `addressInternational` — an optional Latin/international form for global /
  cross-border consumers (**owner-supplied**; the Foundation never transliterates).
- `addressMode` — `"local"` (default) or `"local-international"`.

```jsonc
"locations": [{
  "id": "main",
  "address": { "street": "東京都港区芝公園4丁目2-8", "city": "東京都港区", "country": "日本" },
  "addressInternational": { "street": "4-2-8 Shibakoen, Minato City", "city": "Tokyo", "country": "Japan" },
  "addressMode": "local-international"
}]
```

- **`"local"`** (the default, or omitted) shows only the native/local address.
  This is right for a business serving primarily local customers, or any
  Latin-script locale where there is no meaningful second representation — no
  artificial duplication is needed.
- **`"local-international"`** shows the native/local address **followed by** the
  Latin/international address. **It requires `addressInternational`** — requesting
  this mode without one is a **configuration error** (fail-fast at build time,
  naming the offending location/locale), because silently dropping the Latin form
  would hide a mistake. Local-only businesses simply omit `addressInternational`
  and use the default `local` mode.
- Both representations are **owner-supplied business data**. No transliteration,
  translation or geocoding service is invoked.
- **Precedence / inheritance** mirrors Phase G: a locale override can supply its
  own `address`, `addressInternational` and/or `addressMode`; each is inherited
  per-field / per-value from the location base when not overridden. Absent mode
  defaults to `local`.
- **What each consumer uses (all from the same resolved location):**
  - **Visible footer** follows `addressMode` (native only, or native + Latin).
  - **JSON-LD (structured data)** uses `addressInternational` when supplied,
    otherwise `address` — for global machine readability.
  - **Directions/maps** use geo coordinates when present; otherwise the address
    query prefers `addressInternational`, else `address`.
- The Foundation ships `ja`/`ko`/`zh` demo locales in **local-international** mode
  and the Latin-script locales (`id`/`en`/`de`/`fr`/`es`) in **local** mode —
  **demonstration landmarks only**, replace with your real data.

### Booking label requirement (when `features.booking` is enabled)

If you enable booking (`features.booking.provider = "external-url"`), **every
configured locale** must provide a localized `booking.book` label in
`config/i18n/<locale>.json`. A missing label is a build/configuration error
naming the offending locale(s) — an enabled booking CTA must never silently
disappear just because one locale lacks its button text. Disabling booking (or
omitting it) requires no label.

### Maps directions (`features.maps`)

The footer turns each business-location address into a "Get directions" link via
a **provider-neutral** seam. Configure which provider builds the link:

```jsonc
"features": {
  "maps": { "provider": "google" } // or "none"
}
```

- **`google`** (default demo) — a **keyless** deep link to Google Maps built from
  the **locale-resolved** location (geo coordinate when present, otherwise the
  address query). No API key, no account, no SDK, no network call.
- **`none`** or **no `features.maps`** — no directions link is rendered; the
  address still shows as plain text. The site works unchanged.
- The directions link always follows Phase G localization: a German visitor sees
  the German location's coordinates, an English visitor the London coordinates,
  etc. There is no locale→geography inference in platform code.
- Adding a different maps provider later (Apple Maps, OpenStreetMap, …) is a
  new adapter + a config value change — no component or platform-code rewrite.

### Booking action (`features.booking`)

The home page can show a modest static "Book" CTA linking to your external
scheduler or booking page:

```jsonc
"features": {
  "booking": {
    "provider": "external-url",
    "url": "https://your-scheduler.example/book"
  }
}
```

- **`external-url`** — renders a static external-link CTA to the **public**
  `url` (this is configuration, not a secret).
- **`none`** or **no `features.booking`** — no CTA is rendered; the site works
  unchanged.
- **Misconfiguration fails loudly:** `external-url` without a valid `url` is
  rejected at build/schema time (and throws a typed
  `BookingMisconfigurationError` at runtime) — it never silently degrades to a
  hidden `none` state, so a deployment error is caught immediately.
- This phase is a **static action only**: no Calendly/Google Calendar SDK, no
  OAuth/account credentials, no embedded scheduling widget. Future calendar
  providers (Calendly, Google Calendar, Apple Calendar, ICS, …) plug in as
  adapters behind the same seam.

### Analytics (`features.analytics`)

```jsonc
"features": {
  "analytics": { "provider": "vercel" } // or "none" — the explicit off state
}
```

- **`vercel`** mounts Vercel Web Analytics exactly as before — no new data
  collection is introduced.
- **`none`** (or **no `features.analytics`**) — no analytics is mounted; the
  site works unchanged. `provider: "none"` is an additive schema capability
  that makes the disabled state explicit (`features.analytics` untouched or
  absent behaves identically).
- **Loud failure:** a provider value that reaches the adapter factory with no
  registered adapter throws `AnalyticsMisconfigurationError` (the config
  schema rejects unknown providers at build time first; the factory throw is
  the defensive runtime contract). Analytics never silently disappears.
- Provider selection happens in the analytics adapter factory, not in
  application/layout code. Adding another provider later (GA4, Plausible, …) is
  an adapter + config change, not an application rewrite.

### Analytics privacy posture (audited — documentation only, Phase U)

The Foundation ships **no consent gate** — no banner, no consent cookie, no opt-in
gating of the analytics element. The following is the technically verified posture of the
shipped `features.analytics: { "provider": "vercel" }` integration (audited during
Phase U against the installed `@vercel/analytics` v2.0.1 package and the built
output), plus Vercel's own product description where noted:

- **Loads client-side only.** Analytics is composed through the Phase I adapter factory
  and injected by the **browser after hydration** (a `defer` script appended to
  `document.head`, deduplicated by `src`). It never appears in SSR HTML;the built
  server output contains no `/_vercel/insights` or analytics markup.
- **The inspected client loader writes no browser cookies/storage.** The
  `@vercel/analytics` client runtime (`dist/index.mjs`) contains zero references to
  `cookie`, `localStorage`, or `sessionStorage`;the package's only `cookie`
  references live in its server-side request-forwarding helper (`dist/server/*`),
  which the Foundation does not use.
- **The production script is same-origin.** The client injects
  `/_vercel/insights/script.js` (or `{basePath}/insights/script.js`) served from
  the site's own origin;events post to same-origin `/_vercel/insights/*`.
- **Vercel describes Web Analytics as cookieless and anonymized.** Vercel's docs state
  it "only stores anonymized dataand does not use cookies" and is built into its
  platform (no third-party service required). That is Vercel's claim about its
  product — attributed as such — not a Foundation legal conclusion.

- **Adopter responsibility.** When you change providers, add tracking or marketing
  integrations, or operate in a jurisdiction with specific rules, **you** determine
  whatever privacy/consent requirements apply to your configuration. If you publish a
  cookie policy, author it as a page
  (`content/pages/markdown/<site>/<locale>/legal/cookies.md`) and list it in `legal[]` — page
  content is not legal advice — and `features.analytics: { "provider": "none" }`
  disables analytics entirely if you prefer.

### Contact inquiries (`features.contact` + `/contact`)

> **EFS CURRENT NOTE.** The receiver is owned by the Spoke that owns the exact host/prefix binding.
> `CONTACT_WEBHOOK_URL`/`TOKEN` are installation-wide defaults; `CONTACT_WEBHOOK_URL__<SPOKE_KEY>`/
> `TOKEN__<SPOKE_KEY>` are additive per-Spoke overrides. Two Entities in one Spoke intentionally
> share that Spoke's receiver. The legacy folder paths below describe the retained legacy content
> tree; EFS Page sources remain in the EFS capsule. The form is not a CRM and a receiver is not
> guaranteed to answer a visitor.

The `/contact` page and contact form are the inquiry capability. It is
**content-driven** (`content/pages/markdown/<site>/<locale>/contact.md`, or its JSON
counterpart — the sitemap picks the
route up automatically) and **config-driven**:

```jsonc
"features": {
  "contact": {
    "provider": "webhook",        // or "stub" (the explicit demo default)
    "fields": { "subject": true } // optionally hide the subject field
  }
}
```

- **No `features.contact`** → the page shows an explicit "contact form is not
  configured" state. **`provider: "stub"`** (default) → the form works but every
  submission shows "Demo mode: nothing was sent." **`provider: "webhook"`** →
  the form delivers to your endpoint. Foundation never stores, emails, or
  processes inquiries itself — it only forwards to the receiver you connect.
- **Webhook configuration is environment-only** (never in `site.config.json`):
  - `CONTACT_WEBHOOK_URL` — the receiver endpoint (must be `https://` for
    non-local endpoints).
  - `CONTACT_WEBHOOK_TOKEN` (optional) — sent as an `Authorization: Bearer`
    header.
  - If `provider: "webhook"` is set but `CONTACT_WEBHOOK_URL` is missing, the
    form fails loudly with a "misconfigured" state (it will NOT pretend to be
    the demo).
- **Payload** (POST, `application/json`):
  `{ id (UUID), name, email, subject?, message, locale, submittedAt, origin? }` — a
  minimal, stable contract. No visitor IP/user-agent/cookies are included.
- **Success wording is precise:** "Your inquiry was submitted successfully"
  means your receiver accepted it — not that a human read it.
- **Security/privacy built in:** same-origin server action (Next.js origin
  check), invisible honeypot field that silently discards bots, shared Zod
  validation, `aria-live` status, no inquiry contents logged.
- **Rate limiting/anti-abuse at scale is your responsibility** — enforce at
  your edge/receiver. Foundation is a frontend + integration seam, not an
  email/spam platform.

### Outbound integration seams — at a glance

Every outbound connection a visitor can trigger is modeled as a **visitor
intent** and served through a small, provider-neutral seam. The Foundation
ships the seams, not the providers: there is no provider SDK, no vendor
account, and no provider-specific code outside `src/adapters/<capability>/`.
Phase I (release `v2026.09.03-foundation-phase-i-outbound-seams`) verified
this contract as a whole; per-capability detail lives in the sections above.

| Intent | Feature key | Providers | Off state | Misconfigured → | Env secrets |
| --- | --- | --- | --- | --- | --- |
| Book | `features.booking` | `external-url` | `none` (or absent) | loud `BookingMisconfigurationError` (never a silent no-CTA) | none |
| Directions | `features.maps` | `google` (keyless) | `none` (or absent) | none by construction (keyless) | none |
| Inquiry | `features.contact` | `webhook` / `stub` | `stub` (explicit demo) | loud `ContactInquiryMisconfigurationError` (never the demo) | `CONTACT_WEBHOOK_URL` (+ optional token) **env-only** |
| Analytics | `features.analytics` | `vercel` | `none` (or absent) | loud `AnalyticsMisconfigurationError` (never silent nothing) | none |
| Connect/Message | `connect.methods` | config deep links (`mailto:`, `tel:`, `https:`, `whatsapp:`, `viber:`, …) | omit the method; `demoOnly` badges mark template demos | schema rejects malformed `href`/duplicate ids | none |

Unifying rules:

- **Explicit off states.** Every seam has an explicit disabled state; absent
  config and `"none"` behave identically.
- **No breaking schema or public contract changes across releases; additive
  configuration support only where required.** Phase I added no provider and
  no new dependency; the only schema addition is the explicit
  `analytics: "none"` off state.
- **Secrets are environment-backed only.** Nothing secret ever lives in
  `site.config.json`, `config/`, or `content/`; webhook secrets are read
  lazily from `process.env` by the contact server action.
- **Privacy by default.** Contact webhook payloads are minimal
  (`id`, `name`, `email`, `subject?`, `message`, `locale`, `submittedAt`, `origin?`) —
  no IP, user-agent, cookies, or referrer. Every outbound anchor renders with
  `rel="noreferrer" target="_blank"`.
- **Loud failure.** A configured-but-invalid provider is rejected by the
  config schema at build time and, defensively, throws a typed
  `*MisconfigurationError` at its factory — it never silently degrades to the
  disabled/demo state.

Adding a new provider (e.g. a second maps provider) is a local change: a new
adapter file in the capability directory, a factory branch, and a schema enum
extension — **no** `src/app`, `src/components`, `src/core`, or
`src/application` rewrite. This milestone deliberately ships no new provider.
## 6. Deploying

The template deploys to Vercel directly from a Git repository. Follow
[`DEPLOYMENT.md`](DEPLOYMENT.md): create a Vercel project from your repo,
add your custom domain, and run through the go-live checklist.

## 7. Updating, and upgrading

**An Update** changes your own material — `site.config.json`, dictionaries, pages, artwork — and leaves
the Foundation release you run exactly as it is. Commit and push; that is the whole operation, and §1–§5
above are the surface it covers.

**An Upgrade** replaces the Foundation release itself. You deliberately select a **new immutable
Foundation release** and establish the installation against it. One installation runs one Foundation
release, so an Upgrade moves that whole installation — every website in it — together. The supported
procedure, what it preserves, what it refuses and how to prove the result are in
[`instruction-manuals/foundation-upgrade.md`](instruction-manuals/foundation-upgrade.md); the release
identity, manifest and digest contract is in
[`src/core/foundation-release/README.md`](src/core/foundation-release/README.md), and establishment itself in
[`scripts/installation/README.md`](scripts/installation/README.md).

**There is no in-place upgrade executor, and no `git merge` upgrades an installation.** Nothing in the
platform fetches, merges or rewrites an existing installation on its own, and no command upgrades you in
place: an Upgrade is a deliberate establishment of a **new** installation from the release you selected,
with your authored material carried in as an input. Plan for that — the release as the platform, your
capsule as the seed — rather than for an edit to the running installation.

### What an Upgrade preserves, and what it replaces

| Surface | On an Upgrade to a different immutable Foundation release |
| --- | --- |
| `site.config.json` (your values) | **Preserved** — your configuration is an input to establishment |
| `content/**` (your pages and artwork) | **Preserved** |
| `config/i18n/*` (your translations) | **Preserved** |
| `public/assets/**` (the generated runtime mirror) | **Regenerated** — build output, never yours to edit; the source artwork you replace lives in `content/assets/**` and is preserved |
| `src/**`, `tests/**`, build/deploy files | **Replaced** by the release you adopted |
| schema/loader (`src/config/`) | **Replaced** — but additive and validated, so your configuration keeps building |
| Foundation **default assets** you did not replace | **Replaced** by the release's defaults — this is expected |
| a **platform file you edited** (for example the theme accent token) | **Replaced, not merged** — the release's own bytes win, so carry your value across and re-apply it deliberately (§3) |

Decisions an Upgrade asks of you rather than performing for you:

1. A new **required** configuration key or a changed config shape — the build fails loudly with an
   actionable message telling you what to add;
2. A new `site.assets.*` / `ui.theme.*` leaf whose **default** you did not override — your existing
   values keep working; read the release's notes to see what the new default is;
3. If you maintain a Foundation-derived deployment workspace, its canonical content/config/assets must be
   **re-vendored** through that repository's `setup`/`generate` machinery and re-verified — a manual,
   deliberate step.

Nothing is changed silently under you: real structural changes surface as actionable build errors, and
your own material stays yours.

### Repository-shaped clones (a distinct, legacy workflow)

A clone that was *derived from* this repository in the older **repository-shaped** style — the deployment
at the repository root, updated by pulling from upstream — is maintained with Git:

```bash
git remote add upstream https://github.com/provelopment/provelopment-foundation.git
git fetch upstream
git merge upstream/main
```

Those instructions apply **only** to that legacy repository-shaped workflow. They are **not** how a
current Foundation installation is upgraded: a current installation adopts a selected immutable release
through the establishment procedure described above.

## 8. Validating Your Changes

Before committing or deploying, run the validation gate:

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build
```


---

> **LEGACY MODEL NOTE.** The country/Site/Location guidance below belongs to the retained legacy
> runtime. For EFS, Sites are content contexts and publication prefixes are explicit bindings; see
> *CURRENT EFS CUSTOMIZATION MODEL* at the top of this guide.

## Serving more than one country (Spokes and Sites)

One Foundation repository can serve several **independent websites** — each is a **Spoke**, selected by
hostname. Inside a Spoke, a **Site** is the country/global context: it is named by a
recognized lowercase country code (or `ww` for a worldwide Site — see
[`content/COUNTRY-CODES.md`](deployment/spokes/foundation/content/COUNTRY-CODES.md)) and lives at `/<site>/<locale>/…`.

```json
{
  "sites": [
    { "code": "ca", "locales": ["fr", "en"], "defaultLocale": "fr" },
    { "code": "fr", "locales": ["fr"], "defaultLocale": "fr" }
  ],
  "defaultSite": "ca"
}
```

**Do you need another site?** Only when you have another country/global context *inside the same website*:

```
another independent domain/website       →  another SPOKE     (its own site.config.json, dictionaries, pages, assets)
another country/global context
inside the SAME website                  →  another SITE      (e.g. ww and ca in one Spoke)
another office/city/region inside a Site →  another LOCATION  (a city/region inside that Site)
```

```text
example.com                     →  one Spoke
inside that Spoke: ww and ca    →  two Sites, if that website intentionally carries both contexts
Toronto / Montreal              →  Locations inside Site ca
```

**A Spoke may carry exactly one Site — as both reference Spokes do.** A second Site is a genuine
business decision (another country or global context in the *same* website), never a default; and a
second country that is really a separate website belongs to a **Spoke**, not to a Site of this one.

Toronto, Montreal and Vancouver are Locations inside the Canada Site, not sites of their own:

```json
{
  "business": {
    "regions": { "toronto": { "timezone": "America/Toronto", "address": { }, "hours": {} } },
    "pages": [{ "site": "ca", "locale": "fr", "region": "toronto" }]
  }
}
```

### What a Site may change — and what stays shared

| A Site may override | Deliberately shared |
| --- | --- |
| `navigation` and `footerNavigation` | theme and design tokens |
| `legal` page destinations | assets (logos, icons, backgrounds) |
| `connect` (contact methods) | the component vocabulary |
| the page CTA destination (`ctaHref`) | the shell/layout system |
| its `locales`, `defaultLocale`, `fallback` | UI dictionaries, unless a Site refines them |
| its region/page bindings | |

You do **not** duplicate the configuration file per country — you add only what differs:

```json
{
  "sites": [
    { "code": "ca", "locales": ["fr", "en"], "navigation": [{ "label": "Emplacements", "href": "/locations" }] },
    { "code": "fr", "locales": ["fr"], "navigation": [{ "label": "Conformité", "href": "/conformite" }] }
  ],
  "navigation": [{ "label": "Home", "href": "/" }]
}
```

### Refining the interface language per site

`config/i18n/fr.json` is the common French interface language, and it already serves `fr`, `fr-ca`
and `fr-fr`. Add a partial override only where a site must differ:

```
config/i18n/sites/ca/fr.json       → Canadian French wording
config/i18n/sites/fr/fr.json       → France wording
config/i18n/sites/ca/fr-ca.json    → an exact-locale refinement (wins over the two above)
```

Overrides are **optional** and **partial** (state only the keys you change), an **unknown key is
refused** with the file named, and **another site's override is never used**.

### Grouping sites into Hubs (optional)

A deployment may **group its sites into Hubs** by adding one optional leaf, `hub`, to a site entry. A
Hub is an internal grouping only: it has **no URL segment, no hostname, no directory and no asset
namespace**.

```json
{
  "sites": [
    { "code": "ww", "hub": "europe" },
    { "code": "de", "hub": "europe" },
    { "code": "ca", "hub": "north-america" },
    { "code": "us", "hub": "north-america" }
  ]
}
```

- **All or none.** If any site declares `hub`, **every** site must declare one. A partially grouped
  population is refused at build time rather than guessed.
- **Absent means one implicit Hub.** A deployment that declares no `hub` anywhere keeps working
  exactly as it did: all of its sites belong to one implicit Hub.
- **`implicit` is reserved.** It names the Hub a deployment gets when it groups nothing, so it can
  never be used as an authored Hub id.
- **A Hub is not an address.** It never appears in a public URL, it adds no filesystem path, and a
  site keeps exactly the URLs it already had.

### The visitor controls

| Control | What it changes | When it appears |
| --- | --- | --- |
| **Language** | the language inside the active website | when that website offers more than one language |
| **Location** | the office/city/region inside the active website | when locations are configured for it |
| **Layout** | Sidebar or Menu bar presentation (visitor's own choice) | when `ui.layoutSwitcher.enabled` is true |

Each control is a plain, labelled form control (keyboard-usable, with its current value exposed),
and each one only ever offers destinations that exist — a control never invents a page, a language
or a location. They are composed in one documented order:

```text
Location → Language → Layout
```

**There is no Site control, and no cross-website control of any kind.** Since M18 one website is one
**Spoke**, with its own `site.config.json`, dictionaries, pages and artwork, selected by HOSTNAME alone
(a private request context — never a URL segment and never a visitor choice). Which website a visitor sees
is decided by the address they used; a link from one of our websites to another is ordinary authored footer
navigation, not a control.

### What the reference deployment demonstrates

The public reference deployment is TWO independent websites, one Spoke each:

```text
foundation-template.provelopment.com         foundation-template-germany.provelopment.com
foundation Spoke — Site ww (Global)          germany Spoke — Site de (Germany)
├── English, Deutsch                         ├── Deutsch (default), English
├── no locations                             ├── Locations: Berlin, Frankfurt
└── its own pages, dictionaries, artwork     └── its own pages, dictionaries, artwork
```

The configuration behind each one is that Spoke's OWN `site.config.json`
(`deployment/spokes/<spoke>/site.config.json`) → `sites`, `i18n.locales` and `business.regions` +
`business.pages`; its pages are ordinary content files under that Spoke's `content/pages/`, one tree per
Site and one localized representation per language.

Three things the example deliberately shows:

- **the Location control appears only where locations exist** — the Foundation website configures none, so
  its header shows Language and Layout, while the Germany website shows Location, Language and Layout;
- **languages belong to the website, not to a single location** — the Germany website offers German and
  English and both locations are readable in both. This model has no per-location language restriction;
- **each website is reachable from the other** through an ordinary authored footer link to the other public
  origin (`footerNavigation`), which is navigation rather than a selector.

**Germany, Berlin and Frankfurt are demonstration data.** They are not statements about
Provelopment's own offices, addresses or markets, the configured addresses are placeholders, and no
opening hours are claimed. Replace them with your own sites, languages and locations — the
capability is configuration, not code.


