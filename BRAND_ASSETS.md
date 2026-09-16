# Provelopment Foundation — Brand-Asset Swap Contract

**This is the ONE authoritative document for every replaceable branding asset in
the Foundation runtime.**

It exists so that an owner or a downstream adopter can answer every asset question
**without reading source code**:

```text
What exact file do I replace?          Where does it appear?
What must it be named?                 Which config key activates it?
What format must it be?                What happens if I remove the config?
What dimensions / viewBox should it    What happens if the file is missing?
  have?                                Can I replace only the file, no code?
Does it need transparency?             Can I choose not to use this graphic at all?
Will it be cropped?  Will it be scaled?
```

Every role has an explicit answer below.

> Other documents **point here** and do not restate the contract:
> [`README.md`](README.md) · [`CUSTOMIZING.md`](CUSTOMIZING.md) · the living brand
> packs under `.project/deployment-info/brands-provelopment/`.
>
> [`instruction-manuals/branding-and-assets.md`](instruction-manuals/branding-and-assets.md)
> describes the role/asset *concept* and the banner + navigation-icon behaviours.
> It is a **distributed** artifact with a master upstream, so it is not edited
> here; the contract above is authoritative for every filename/type/runtime fact.

---

## 1. Scope and responsibility boundary

**This document defines the CODE contract, not the artwork.**

| This document owns | This document does NOT own |
| --- | --- |
| the runtime filename | whether the artwork is beautiful |
| the accepted file type(s) | composition, focal-point placement, colour |
| what the engine requires | whether a designer should redraw anything |
| what the production standard recommends | the brand's visual judgement |
| transparency / crop / scaling behaviour | the approved master's artistic content |
| substitution, disable and fallback procedure | **Master Brand Architect rulings** (artistic) |

A **coding** acceptance decision is: *technically conforms, renders correctly, is
replaceable, is optional, does not break the UI.* Aesthetic acceptance belongs to
the artwork / owner review process and is never a coding gate.

### 1.1 Source assets vs runtime assets (the two-tree model)

The Foundation keeps **one authority per file** and **four source categories**,
and derives everything the browser can fetch from them:

```text
assets/branding/          deployment / business-specific artwork
  banners/                the ten page-banner graphics (banner-<page>.png)
  identity/               the identity mark + favicon
  logos/                  logo lockups (wordmark/emblem/monochrome variants)
  page-graphics/          background, header/footer/status graphics, OG image
  branding-schema.md      the brand-system specification (docs live with the
                          category they document, never inside a graphic folder)
assets/icon-library/      reusable NON-business-specific generic icons
                          (ALL retained — used or unused)
assets/placeholders/      blank / generic defaults for a fresh installation
assets/platform-marks/    royalty-free platform / social-service marks
                          (+ their provenance / withheld registers)

        ↓  scripts/sync-runtime-assets.mjs  (byte-identical mirror)

public/assets/            the ONLY directory the running site fetches
```

| Rule | Detail |
| --- | --- |
| One authority | A file is **edited in `assets/**`** and mirrored. `public/assets/**` is a byte-identical **derivative**, never a second place to maintain artwork |
| Deterministic | `pnpm assets:sync` writes the mirror; `pnpm assets:check` (and `tests/unit/asset-taxonomy-mirror.test.ts`) fails on any drift, on a missing declared source, and on any **undeclared** file appearing under `public/assets/` |
| Build-safe | `pnpm build` runs the mirror first, so a deployment can never ship a stale or half-applied asset move |
| No permanent exceptions | every **persistent** runtime visual asset has an authoritative source beneath `assets/**` — including the ten page banners (`assets/branding/banners/`). `RUNTIME_ONLY` (the explicit, reasoned allowlist in the mirror manifest) is **empty by design**; a generated, source-less asset would still have to be declared there with a reason |
| No junk drawer | `assets/placeholders/` holds blank/generic defaults only — never business branding, never general-purpose icons |
| Graphics ≠ documents | a graphic directory holds graphics; documentation lives with the category it documents (`assets/branding/branding-schema.md`, `assets/platform-marks/platform-marks-*.md`) |

---

## 2. How to read every field: HARD RUNTIME REQUIREMENT vs CANONICAL PRODUCTION RECOMMENDATION

Every field in this document is one of exactly two kinds. They are **never**
conflated:

| Kind | Meaning | If you violate it |
| --- | --- | --- |
| **HARD RUNTIME REQUIREMENT** | the engine, the schema, or the platform genuinely behaves this way | the asset does not render, fails validation, or breaks the UI |
| **CANONICAL PRODUCTION RECOMMENDATION** | a production-master convention chosen for consistency and artwork quality | nothing breaks; the artwork may simply look or compose worse |

Example of the distinction, applied to the page banners:

```text
Engine requirement:  no fixed pixel dimensions. The intrinsic ratio is read from
                     the supplied file, so ANY aspect ratio renders correctly.
Canonical master:    the approved Foundation banner family ships at its own
                     production size. That size is a RECOMMENDATION, not an
                     engine requirement.
```

Because artwork will change repeatedly over time, every role below states its
recommendation **as** a recommendation. Where the engine imposes nothing, this
document says so explicitly rather than inventing a requirement.

---

## 3. The two ways to replace any asset

Both are fully supported and neither requires a code change:

1. **Replace in place** — overwrite the file under `public/assets/`. The
   configuration keeps pointing at the same role file. (In *this* repository the
   file is authored in `assets/**` and mirrored — see §1.1; overwriting only the
   runtime copy is correct for an adopter, and `pnpm assets:sync` keeps the two
   trees identical for the Foundation itself.)
2. **Point configuration at your own file** — set the role's `site.assets.*`
   key to an **absolute URL** (required by the schema, validated at build time)
   whose basename matches a file in `public/assets/`.

```jsonc
{
  "site": {
    "assets": {
      "logo":          "https://cdn.example.com/assets/my-logo-header.svg",
      "ogImage":       "https://cdn.example.com/assets/my-share.png",
      "favicon":       "https://cdn.example.com/assets/my-icon.svg",
      "logoFooter":    "https://cdn.example.com/assets/my-logo-footer.svg",
      "banners":       { "home": "https://cdn.example.com/assets/banner-home.png" },
      "backgrounds":   { "all": "https://cdn.example.com/assets/background-all.webp" },
      "footerGraphic": "https://cdn.example.com/assets/footer-graphic.png",
      "headerGraphic": "https://cdn.example.com/assets/header-graphic.svg",
      "statusGraphic": "https://cdn.example.com/assets/status-graphic.svg"
    }
  }
}
```

> **How the value is consumed (the same for every `site.assets.*` role):** the
> validated absolute URL is reduced to its **pathname**, and then to its
> **basename**; the basename is checked for existence under `public/assets/`.
> **Only the filename decides availability** — which is why every role is swappable
> by filename alone.
>
> The **rendered** `src`/`url(...)` is the configured URL's **pathname**, which the
> browser then fetches from the **current origin**. So keep the path
> `/assets/<filename>`: a value whose path is not served by the deployment (e.g.
> `https://cdn.example.com/my-logo.svg`) still passes the availability check, but
> would render a `<img src="/my-logo.svg">` that the server does not serve.

> **Keep the filename stable.** Renaming the file without updating the config key
> (or vice versa) breaks the role — the name *is* the contract. Everything else
> about the file may change freely.

---

## 4. Canonical file-swap procedure (owner / adopter workflow)

```text
1.  Prepare a new file matching this document's contract for that role
    (filename, type, recommended master size, transparency, crop expectations).

2.  Use the EXACT canonical runtime filename for the role. The filename is the
    contract: it is what the resolver checks for under public/assets/.

3.  Place it at public/assets/<canonical-filename>
    (replace in place) — OR — point the role's site.assets.* key at your own
    absolute URL whose basename is backed by a file in public/assets/.

4.  If your deployment maintains a living brand pack (the Provelopment living
    packs do), replace the corresponding living-master file too, so source and
    runtime stay in step.

5.  Preserve or update the provenance record for that role — owner, source,
    SHA-256, byte count, geometry. (Provelopment keeps its record in
    .project/deployment-info/brands-provelopment/provenance/.)

6.  DO NOT change code when the filename and role are unchanged. There is no
    component, schema, resolver, CSS or routing edit in this workflow.

7.  Run the validation commands in §13.

8.  If the graphic should not be used at all, follow §5 — remove or omit the
    CONFIG ROLE. Never delete or edit engine code to suppress artwork.
```

### Byte-for-byte replacement (the intended production path)

```text
READ approved artwork
  -> COPY to the living master
  -> COPY to public/assets/<canonical-filename>
  -> VERIFY SHA-256 (source == living == runtime)
```

The runtime never depends on where the bytes came from; it only reads
`public/assets/<basename>` at composition time.

---

## 5. Asset-disable procedure — how to intentionally NOT use an asset

The engine stays **fully valid without any optional artwork**. Every optional
role is suppressed by **configuration**, never by code:

| To disable | Do this | Result |
| --- | --- | --- |
| Global decorative background | remove `site.assets.backgrounds["all"]` (or the whole `backgrounds` key) | no background layer is rendered — the flat `ui.theme.background` colour remains |
| A page-specific background | remove that page-role entry from `backgrounds` | that page falls back to `backgrounds["all"]`, then to none |
| Header decorative band | remove `site.assets.headerGraphic` | the header emits **no attribute, no style and no CSS at all** — byte-identical to a header that never had a band |
| Footer decorative graphic | remove `site.assets.footerGraphic` | no decorative footer layer DOM is emitted at all |
| Status decorative graphic | remove `site.assets.statusGraphic` | both error and not-found surfaces render no graphic, byte-identical to pre-P12-SG |
| Static social image | remove `site.assets.ogImage` | the generated per-locale OpenGraph route becomes the fallback |
| One page banner | remove that entry from `site.assets.banners` | that page renders nothing — no container, no reserved gap |
| All banners | remove `site.assets.banners` | no banner is ever rendered |
| One connectivity icon | remove that item's `icon` leaf (or set it to `""`) | the item renders as a complete **text link** |
| Identity roles | remove `site.assets.logo` / `logoFooter` / `favicon` | the corresponding element/metadata is simply not emitted |

> **Deleting the file is not the disable mechanism.** Removing the config key is.
> (A configured-but-missing file also degrades safely to "no artwork" — see §8 —
> but the intended, explicit disable is the config removal.)

---

## 6. Placeholder policy

```text
A placeholder may be used to VALIDATE A RUNTIME SEAM.

A placeholder is NOT BRAND AUTHORITY.

Production artwork can later replace the placeholder in place, at the same
filename and technical contract, with NO code change.

The runtime must never depend on placeholder-specific visual content.
```

Rules that follow from this:

- **Never use placeholder artwork for an identity/logo asset** that already has
  an approved production master.
- **Never represent placeholder bytes as approved brand artwork.**
- **Never commit a placeholder as a shipped runtime asset** where an approved
  master exists.
- A placeholder used for testing lives as a **source** placeholder under a
  clearly named location — in this repository
  `tests/fixtures/placeholder-assets/` — which is **never shipped**, **never
  referenced by `site.config.json`**, and **never read by any runtime resolver**.
- The placeholder's own filename **is** the canonical runtime filename, so it
  exercises the real filename contract while its location makes its status
  unmistakable.

### The current Foundation placeholder

| | |
| --- | --- |
| File | `tests/fixtures/placeholder-assets/header-graphic.svg` |
| Role exercised | `header-graphic` (`site.assets.headerGraphic`) |
| Type | SVG |
| viewBox | `0 0 4096 512` — the documented **RECOMMENDED CANONICAL MASTER** for this role |
| Content | transparent canvas + neutral dashed bounds, diagonals and corner ticks. No brand artwork, no script, no animation, no embedded raster, no font dependency, no external resource |
| Purpose | give the swap-contract tests controlled, neutral bytes at the exact canonical filename, so the seam is validated **without touching or asserting on any approved artwork's visual content** |
| Runtime status | **blank by default (2026-09 owner ruling).** The decorative header/footer roles ship a valid, transparent, drawing-free placeholder, so the default presentation is "blank / not used". The role stays ACTIVATED and swappable — see §10.5 and §10.4 |
| Shipped blank placeholder (header) | `assets/placeholders/header-graphic.svg` → mirrored to `public/assets/header-graphic.svg` |
| Shipped blank placeholder (footer) | `assets/placeholders/footer-graphic.svg` → mirrored to `public/assets/footer-graphic.svg` |
| Optional branded artwork | the branded Foundation masters are retained as **source** in `assets/branding/page-graphics/` (`header-graphic.svg`, `footer-graphic.svg`) and are activated by replacing the runtime file — a pure artwork swap |

> **The decorative defaults are blank, and the branded artwork is one copy away.**
> The header/footer decorative roles are ACTIVE against a **transparent, empty**
> placeholder: nothing paints, nothing is required, and a deployment activates its
> own graphic by replacing `public/assets/header-graphic.svg` /
> `public/assets/footer-graphic.svg` (or by re-pointing the role). The neutral
> *test* fixture at `tests/fixtures/placeholder-assets/header-graphic.svg` remains a
> testing-only source and is never resolved by the runtime.

---

## 7. File-only swap guarantee

```text
Artwork changes that preserve:
  - filename;
  - supported file type;
  - documented technical contract;

require NO component, schema, resolver, CSS or routing changes.
```

This is true for **every** role in this document. There are no exceptions.

Corollaries the engine enforces (proven by tests, §13):

- No resolving or rendering engine file hard-codes any artwork filename.
- No engine file contains a brand colour, brand name or platform name.
- The resolvers are generic: the same availability rule backs the banner,
  background, header-graphic, footer-graphic and status-graphic roles.
- Connectivity icons are filename-only: a **new filename needs no code change**
  (add the file, set the `icon` leaf).
- An **unknown/absent** asset name never produces a broken image or a 404 — it
  degrades to no artwork (decorative roles) or a text-only link (connectivity).

---

## 8. Missing-file behaviour (the shared availability rule)

Every `site.assets.*` graphic role and every icon leaf is screened by **one** rule:

```text
configured value + basename backed by a real file under public/assets/
        -> render it

configured value + NO backing file
        -> indistinguishable from ABSENT: render nothing
           (never a placeholder, never a broken <img>, never a 404)
```

Two deliberate differences:

| Family | A configured name with no backing file is… |
| --- | --- |
| Control / navigation icon leaves (`ui.navigation.sidebar.*.icon`, `ui.cta.icon`, `navigation[].icon/iconOpen/iconClosed`) | a **LOUD BUILD FAILURE** naming the leaf and the expected file |
| Connectivity icon leaves (`socialLinks[].icon`, `connect.methods[].icon`) | **tolerated**: the item degrades to a text link, because connectivity artwork is strictly supplementary and text stays authoritative |

---

## 9. Complete role index

Every swappable Foundation branding role, at a glance. **No role requires a code
change to swap.**
### 9.1 `site.assets.*` graphic roles (availability-screened)

| Runtime filename | Config role | Required type | Alternatives | Optional? | Code change to swap? |
| --- | --- | --- | --- | --- | --- |
| `background-all.svg` | `site.assets.backgrounds["all"]` | any browser-renderable image; SVG recommended | PNG · JPEG · WebP · AVIF · GIF | **yes** | **no** |
| `header-graphic.svg` | `site.assets.headerGraphic` | any browser-renderable image; SVG recommended | PNG · JPEG · WebP · AVIF · GIF | **yes** | **no** |
| `footer-graphic.svg` | `site.assets.footerGraphic` | any browser-renderable image; SVG recommended | PNG · JPEG · WebP · AVIF · GIF | **yes** | **no** |
| `status-graphic.svg` | `site.assets.statusGraphic` | one of SVG · PNG · JPEG · GIF · WebP (see §10.6) | — | **yes** | **no** |
| `banner-<page>.png` (×10) | `site.assets.banners["<page>"]` | one of SVG · PNG · JPEG · GIF · WebP (see §10.2) | — | **yes, per page** | **no** |
| `og-image.png` | `site.assets.ogImage` | PNG or JPEG (social-platform standard) | — | **yes** | **no** |

### 9.2 Identity / metadata roles (not availability-screened)

| Runtime filename | Config role | Required type | Alternatives | Optional? | Code change to swap? |
| --- | --- | --- | --- | --- | --- |
| `logo-header.svg` | `site.assets.logo` | SVG (recommended for the header mark and JSON-LD) | PNG · WebP | **yes** | **no** |
| `logo-footer.svg` | `site.assets.logoFooter` | SVG recommended | PNG · WebP | **yes** | **no** |
| `favicon.svg` | `site.assets.favicon` | SVG recommended | PNG · ICO | **yes** | **no** |

> These three are **not** screened for file existence: the configured value is
> reduced to its same-origin pathname and rendered as-is. If you configure one,
> **ship the file** — otherwise the browser requests a missing path. Omitting the
> config key is the safe, supported state (see §5).

### 9.3 Control / navigation icon roles (plain-filename leaves, loud-fail)

| Runtime filename | Config leaf | Required type | Optional? | Code change to swap? |
| --- | --- | --- | --- | --- |
| `sidebar-open.svg` | `ui.navigation.sidebar.open.icon` (default) | SVG recommended | **yes** | **no** |
| `sidebar-close.svg` | `ui.navigation.sidebar.close.icon` (default) | SVG recommended | **yes** | **no** |
| `sidebar-default-icon-open.svg` | `navigation[]` expanded default | SVG recommended | **yes** | **no** |
| `sidebar-default-icon-closed.svg` | `navigation[]` collapsed default | SVG recommended | **yes** | **no** |
| any `*.svg` / `*.png` | `ui.cta.icon`, `navigation[].icon/iconOpen/iconClosed` | any browser-renderable image | per leaf | **no** |
| any `icon-<name>.svg` from `assets/icon-library/` | `navigation[].iconOpen` / `navigation[].iconClosed` (the sidebar page icons) | SVG (generic, reusable) | **yes** | **no** |

**Sidebar page icons — the icon library is the normal source (2026-09 owner ruling).**

| Rule | Detail |
| --- | --- |
| Rendered size | **HARD: exactly 16 × 16 px** for every sidebar page icon on **desktop and tablet**, expanded **and** collapsed. One shared token (`--ui-sidebar-nav-icon-size: 1rem`), no breakpoint override, `object-fit: contain`, `flex: none` |
| Source precedence | 1. an explicitly configured deployment icon (business-specific artwork under `assets/branding/`) → 2. the recognized generic icon from `assets/icon-library/` → 3. the neutral fallback pair `sidebar-default-icon-*` under `assets/placeholders/` |
| Shipped default | the canonical deployment maps each of its page types to a semantically appropriate library icon (`icon-home`, `icon-about`, `icon-resources`, `icon-testimonials`, `icon-portfolio`, `icon-blog`, `icon-contact`, `icon-services`) |
| Retention | **all** library icons stay in the repository whether or not the current navigation uses them — the library is the template's reusable store |
| Expanded vs collapsed | expanded = 16 px icon **+** page name; collapsed = 16 px icon **only**, with the page name retained (sr-only accessible name + native `title` tooltip). The icon files may differ per state via `iconOpen`/`iconClosed` |
| Mobile | the mobile navigation uses its own disclosure control icons and does **not** use these page icons |

**Sidebar open/close CONTROL — a different contract (2026-09 closure pass).**

| Rule | Detail |
| --- | --- |
| Rendered size | **HARD: exactly 24 × 24 px** on **desktop and tablet**, expanded **and** collapsed. One token (`--ui-sidebar-control-icon-size: 1.5rem`), **no** breakpoint override |
| Distinct from page icons | the page icons above are 16 × 16; the control is 24 × 24. They are separate tokens and must never share one |
| Alignment | **HARD:** EXPANDED it is left-aligned with the shared page/edge inset `--ui-shell-control-inset` (≈5px, from the spacing scale); COLLAPSED it is **centred** on the rail's axis with no padding of its own |
| Rail geometry | the collapsed rail is a symmetric icon column: `--ui-sidebar-rail-collapsed` = the control icon + equal inline padding = **36 px**, with the inline-end padding reduced by the rail's own 1 px border so the contents centre between the rail's outer edges (browser-measured `left = right = 18.00`) |
| Page-icon centreline | in the collapsed rail the 16 × 16 page-icon column shares the control's exact centreline (browser-measured `navCx = controlCx`) |
| Shell CTA parity | the shell-top primary CTA (`Book Now`) takes the **same** inset value, so the action and the expanded rail control align on one edge |
| Mobile | unchanged — the mobile disclosure keeps its own `32 × 32` control sizing (`h-8 w-8`) |

**Colour.** Every icon in this table renders through the same plain `<img>` as
the connectivity family and is recoloured by nothing — encode the intended colour
in the file. `currentColor` does **not** follow the theme through this seam; see
the mechanism box in §11.

### 9.4 Connectivity icon roles (plain-filename leaves, never loud-fail)

| Runtime filename | Config leaf | Required type | Optional? | Code change to swap? |
| --- | --- | --- | --- | --- |
| `icon-phone.svg`, `icon-email.svg`, `icon-message.svg`, `icon-link.svg`, `icon-external-link.svg`, `icon-share.svg`, `icon-globe.svg` | `socialLinks[].icon` · `connect.methods[].icon` | SVG recommended | **yes** | **no** |
| the seven ADMITTED third-party platform marks (§11.2) | same generic leaf | as supplied by the source owner | **yes** | **no** |

### 9.5 Withheld marks (deliberately absent)

```text
X  ·  Slack  ·  Mastodon  ·  Viber  ·  YouTube
```

No mark ships for these platforms. See §11.3.

---

## 10. Foundation-owned graphic contracts

Each role below is a complete field/value contract. **HARD** = genuine runtime
requirement. **RECOMMENDED** = canonical production convention only.

### 10.1 Identity roles — `logo-header` · `logo-footer` · `favicon`

These three are the **identity** system. This document does not redefine identity
artwork; it documents only the file/rendering contract and the substitution path.

#### 10.1.1 `logo-header.svg` — the rendered header brand mark

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/logo-header.svg` |
| Config role | `site.assets.logo` (**absolute URL**, schema-validated) |
| Also consumed by | JSON-LD `Organization.logo` (same key) |
| Required file type | **HARD:** any browser-renderable image. **RECOMMENDED:** SVG (crisp at any size; the mark is also handed to search engines as a logo URL) |
| Alternative supported types | PNG, WebP, AVIF, JPEG |
| Engine-required dimensions | **HARD: none.** No intrinsic size is required or read. Height is fixed by CSS; width follows the file's own aspect ratio |
| Recommended production master | the approved Foundation living master (`logos/lockup-horizontal.svg` geometry: `viewBox="0 0 646.75 158"`, ratio ≈ 4.09:1). **RECOMMENDED only** |
| Required SVG viewBox | none — any viewBox renders. Set `viewBox` so the mark scales predictably |
| Transparency requirement | **RECOMMENDED:** transparent background. The header surface colour varies by theme, so an opaque canvas shows as a rectangle |
| Runtime sizing | **HARD:** rendered at `height: 2rem` (32px) with `width: auto`, `max-width: 100%`, `object-fit: contain` → aspect ratio preserved, never distorted, never cropped |
| Runtime crop behaviour | **HARD: never cropped.** There is no `cover` and no clipping in this path |
| Position / anchor | in flow, at the start of the header's left brand slot, inside the brand `<a href="/{locale}">` |
| Repetition | once per page |
| Engine recolouring | **HARD: none.** No filter/colour/blend is applied; the file's own colours render. (A monochrome master should itself use `currentColor` to follow the theme) |
| Engine opacity | none applied |
| Optional? | **yes.** Absent config → the header falls back to its plain **text brand link** |
| Missing-file behaviour | **not availability-screened.** A configured value resolves to its same-origin path regardless; if the file is not shipped the browser requests a missing path. Ship the file or omit the key |
| Removal / disable | remove `site.assets.logo` (header falls back to the text brand link; JSON-LD omits the logo) |
| Replacement procedure | §4 — replace the file in place, or point `site.assets.logo` at your own absolute URL |
| Requires code change to swap? | **no** |
| Accessible name | the rendered `<img>` carries `alt={siteConfig.name}` — the identity mark **is** the site's accessible name in the header |

#### 10.1.2 `logo-footer.svg` — the restrained footer mark

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/logo-footer.svg` |
| Config role | `site.assets.logoFooter` (**absolute URL**, schema-validated) |
| Required file type | **HARD:** any browser-renderable image. **RECOMMENDED:** SVG |
| Alternative supported types | PNG, WebP, AVIF, JPEG |
| Engine-required dimensions | **HARD: none** |
| Recommended production master | **the SAME coloured source as the header** — `assets/branding/logos/lockup-horizontal.svg`, mirrored into `logo-footer.svg` (owner ruling, 2026-09 closure pass: the footer uses the coloured lockup, not the monochrome one). **RECOMMENDED only**; the monochrome `lockup-mono.svg` remains a retained optional source asset |
| Required SVG viewBox | none |
| Transparency requirement | **RECOMMENDED:** transparent. The mark sits beside the copyright line on the footer surface |
| Runtime sizing | **HARD:** `height: var(--ui-logo-display-size)` = `2rem` (32px), `width: auto`, `max-width: 100%` → **the SAME displayed size as the header logo** (owner ruling, 2026-09) with the aspect ratio preserved; never cropped. ONE token governs both logo roles |
| Runtime crop behaviour | **HARD: never cropped** |
| Position / anchor | inline, immediately before the `© <year> <site name>` line |
| Repetition | once per page |
| Engine recolouring | **HARD: none** |
| Engine opacity | none applied |
| Optional? | **yes.** Absent config → no element at all |
| Missing-file behaviour | **not availability-screened** (same as §10.1.1) |
| Removal / disable | remove `site.assets.logoFooter` |
| Replacement procedure | §4 |
| Requires code change to swap? | **no** |
| Accessible name | `alt=""` + `aria-hidden="true"` — **decorative**. The adjacent copyright text carries the accessible site name; never move identity meaning into this mark alone |

#### 10.1.3 `favicon.svg` — the browser tab / bookmark icon

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/favicon.svg` |
| Config role | `site.assets.favicon` (**absolute URL**, schema-validated) |
| Consumer | Next.js metadata `icons.icon` — a single authoritative `<link rel="icon">` declaration. There is no competing file-based icon route |
| Required file type | **HARD:** a browser icon format. **RECOMMENDED:** SVG. PNG and ICO also work |
| Engine-required dimensions | **HARD: none.** The browser renders it at its own icon size |
| Source of truth / derivation | **HARD (2026-09 owner ruling): the favicon is DERIVED from `assets/branding/identity/mark.svg`** — the high-resolution mark is never modified. `assets/branding/identity/favicon.svg` is the mark rendered into a **24 × 24 canvas**, mirrored to `public/assets/favicon.svg` |
| Required favicon geometry | **HARD: 24 × 24 canvas, the mark's own (square) `viewBox`, uniform scaling, no crop, no distortion, whole circular mark visible with transparent breathing room.** A narrowed `viewBox` (e.g. `256 256 1536 1536` on a 2048 mark) crops the artwork and produces flat-sided edges — locked against by `tests/unit/favicon-contract.test.ts` |
| Recommended production master | square, transparent, legible at 16px (the approved Foundation master uses a square `viewBox`). **RECOMMENDED only** |
| Required SVG viewBox | square recommended (a non-square viewBox is letterboxed by the browser) |
| Transparency requirement | **RECOMMENDED:** transparent |
| Runtime sizing | browser-controlled |
| Runtime crop behaviour | **HARD: the browser's fit rule applies.** Keep meaningful content inside the canvas with a small safe margin |
| Position / anchor | browser chrome (tab, bookmark, history) |
| Repetition | n/a |
| Engine recolouring | **HARD: none** |
| Engine opacity | none applied |
| Optional? | **yes** |
| Missing-file behaviour | **not availability-screened** — a configured-but-unshipped favicon is a missing request |
| Removal / disable | remove `site.assets.favicon` |
| Replacement procedure | §4 |
| Requires code change to swap? | **no** |
| **Not** an installable-app icon | The Foundation emits **no** web-app manifest, **no** service worker and **no** `apple-touch-icon`. There are **no PWA / installable-app icon roles** to replace. The `viewport` `theme-color` declaration is mobile-browser chrome, not a manifest `theme_color` |

### 10.2 Page banners — the `banner-*` family

**Ten canonical runtime filenames** (one per page role). Each is a **mirrored**
file: the authoritative source is `assets/branding/banners/<name>` and
`public/assets/<name>` is its byte-identical derivative (no runtime-only
exception — see §1.1).

| # | Runtime filename | Source | Config key | Page it decorates |
| --- | --- | --- | --- | --- |
| 1 | `public/assets/banner-home.png` | `assets/branding/banners/banner-home.png` | `site.assets.banners["home"]` | the home page (`/` and the regional landing) |
| 2 | `public/assets/banner-about.png` | `assets/branding/banners/banner-about.png` | `site.assets.banners["about"]` | About |
| 3 | `public/assets/banner-contact.png` | `assets/branding/banners/banner-contact.png` | `site.assets.banners["contact"]` | Contact |
| 4 | `public/assets/banner-connect.png` | `assets/branding/banners/banner-connect.png` | `site.assets.banners["connect"]` | Connect |
| 5 | `public/assets/banner-offerings.png` | `assets/branding/banners/banner-offerings.png` | `site.assets.banners["offerings"]` | Offerings |
| 6 | `public/assets/banner-portfolio.png` | `assets/branding/banners/banner-portfolio.png` | `site.assets.banners["portfolio"]` | Portfolio |
| 7 | `public/assets/banner-blog.png` | `assets/branding/banners/banner-blog.png` | `site.assets.banners["blog"]` | Blog |
| 8 | `public/assets/banner-resources.png` | `assets/branding/banners/banner-resources.png` | `site.assets.banners["resources"]` | Resources |
| 9 | `public/assets/banner-testimonials.png` | `assets/branding/banners/banner-testimonials.png` | `site.assets.banners["testimonials"]` | Testimonials |
| 10 | `public/assets/banner-legal.png` | `assets/branding/banners/banner-legal.png` | `site.assets.banners["legal"]` | Legal |

**Page-role resolution (HARD):** the page slug is derived from the URL — the
leading locale segment is dropped, then an optional configured operating-region
segment, then the first remaining segment is taken. `""` means the home page.

```text
/en                  -> home          /en/berlin/about   -> about
/en/about            -> about         /en/legal/privacy  -> legal
```

| Field | Value |
| --- | --- |
| Config role | `site.assets.banners` (a page-slug → **absolute URL** record; schema-validated) |
| Required file type | **HARD:** one of **SVG · PNG · JPEG · GIF · WebP** — the engine reads the intrinsic size from the file's magic bytes. Any other container renders but without a size-derived cap |
| Engine-required dimensions | **HARD: none.** No fixed width, no fixed height, no fixed aspect ratio. The ratio is read from the supplied file |
| Recommended production master | the approved Foundation family ships at **3546 × 443** (≈ 8:1). **RECOMMENDED only** — any ratio renders correctly. Supply a wide graphic (roughly 16:9 or wider) to obtain a wide banner band |
| Required SVG viewBox | none — but the viewBox must describe the intended ratio, since the ratio (not the file) drives the rendered height |
| Transparency requirement | **optional.** The banner sits above the header on the page surface; transparent canvas works and an opaque one works. There is no forced background |
| Runtime sizing | **HARD, two-case:** (a) intrinsic size readable and > 0 → `width: 100%` capped at `min(available page width, 1.5 × natural width)` — the graphic fills the page up to 1.5× its own size and **stops there**. (b) intrinsic size unreadable → natural size at most: it never upscales, only scales down to fit |
| Runtime crop behaviour | **HARD: never cropped and never distorted.** Height always follows the graphic's own aspect ratio; there is no `cover` and no clipping |
| Position / anchor | horizontally **centred** in the available page width, in its own region **above the whole shell** (above the header). It is NOT part of the header |
| Repetition | one banner per page, at most |
| Engine recolouring | **HARD: none** |
| Engine opacity | none applied |
| Optional? | **yes — per page and in total.** A page with no entry renders **nothing**: no container, no reserved blank block, no gap, and never another page's banner |
| Missing-file behaviour | **availability-screened.** A configured-but-missing banner is indistinguishable from absent → nothing is rendered (never a placeholder, never a broken image) |
| Removal / disable | remove that page's entry (one banner) or the whole `site.assets.banners` key (all banners). No code change |
| Replacement procedure | §4 — replace the single file, or re-point that page's config entry |
| Requires code change to swap? | **no** |
| Accessible name | `alt=""` — **decorative**. The header's configured brand mark carries the real accessible name, so the banner must not duplicate it |

> **The approved banner files must not be altered, reformatted or re-exported.**
> Replacing them is a file swap; restyling them is an artwork decision.

### 10.3 Decorative page background — `background-all.svg`

The GLOBAL background role, plus an optional page-specific override family.

```text
background-<page>   (page-specific; e.g. site.assets.backgrounds["about"])
        |
        v
background-all      (global; site.assets.backgrounds["all"])
        |
        v
none                (no graphic background at all)
```

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/background-all.svg` (and, optionally, `background-<page>.svg` for a page-specific role) |
| Config role | `site.assets.backgrounds["all"]` — the reserved **GLOBAL** key. Any other key (`"home"`, `"about"`, …) is that page's background |
| Required file type | **HARD:** any browser-renderable image (it is a CSS background). **RECOMMENDED:** SVG |
| Alternative supported types | PNG · JPEG · WebP · AVIF · GIF |
| Engine-required dimensions | **HARD: none.** No size is read for this role — unlike a banner, the layer needs no dimension/upscale contract |
| Recommended production master | the approved Foundation master is **2048 × 2048** (`viewBox="0 0 2048 2048"`, square). **RECOMMENDED only.** Because nothing is upscale-capped, size the master generously enough for the largest viewport you support |
| Required SVG viewBox | none. `cover` sizes it, so the viewBox only needs to describe the canvas you designed |
| Transparency requirement | **strongly RECOMMENDED: transparent.** The layer paints **over** the flat `ui.theme.background` colour and **under** all content, so transparent areas are what let the theme colour show through. A fully opaque canvas visually replaces the theme colour |
| Runtime sizing / scaling | **HARD:** `background-size: cover`, `background-position: center center`, `background-repeat: no-repeat`, on a `position: fixed; inset: 0` layer → one asset fills any viewport edge-to-edge with no gaps and no tiling |
| Runtime crop behaviour | **HARD: cropped (clipped) by definition of `cover`.** Non-matching aspect ratios are magnified until they cover the viewport and the overflow is clipped. Keep meaningful content away from the edges — the crop is the artwork's design responsibility |
| Position / anchor | fixed, covering the viewport, **behind all content**, **above** the flat canvas colour (`z-index: -1`) |
| Repetition | once per page (a page-specific role **overrides** the global one; they never stack) |
| Engine recolouring | **HARD: none** |
| Engine opacity | **HARD: none.** No opacity/blend is applied — subtlety must be carried by the artwork itself |
| Optional? | **yes** |
| Missing-file behaviour | **availability-screened.** A missing page-specific file falls through to `background-all`; a missing global file renders nothing at all |
| Removal / disable | remove `site.assets.backgrounds["all"]` for the global graphic; remove a page entry to drop that page's override |
| Replacement procedure | §4 |
| Requires code change to swap? | **no** |
| Accessibility | `aria-hidden="true"`, no text, no accessible name, no `role` — it is never a heading/title source |
| Interaction | `pointer-events: none` — it can never capture a click, a selection or focus |
| Layout impact | **HARD: none.** `position: fixed`, out of flow → no padding, margin, reserved height or horizontal overflow; it cannot shift the header, banner, content or footer |

### 10.4 Decorative footer graphic — `footer-graphic.svg`

**This is NOT the footer identity mark.** `logo-footer` (§10.1.2) stays the
independent footer logo. A deployment may have a logo, a decorative graphic,
both, or neither.

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/footer-graphic.svg` |
| Config role | `site.assets.footerGraphic` |
| Rendered as | a static CSS **`background-image`** on one decorative `<div class="ui-footer-graphic">` inside the `relative isolate` footer — not a DOM `<img>` |
| Required file type | **HARD:** any browser-renderable image. **RECOMMENDED:** SVG |
| Alternative supported types | PNG · JPEG · WebP · AVIF · GIF |
| Engine-required dimensions | **HARD: none.** No size is read for this role |
| Recommended production master | the branded Foundation master is **2048 × 2048** (`width`/`height` 2048, `viewBox="0 0 2048 2048"`). **RECOMMENDED only** |
| Shipped default artwork | **blank / transparent (2026-09 owner ruling)** — the runtime file is the byte-identical mirror of `assets/placeholders/footer-graphic.svg`, which declares the role's `viewBox` and **draws nothing**. The branded master is retained as source at `assets/branding/page-graphics/footer-graphic.svg` |
| Required SVG viewBox | none |
| Transparency requirement | **strongly RECOMMENDED: transparent.** The engine applies no opacity, so the layer's subtlety must come from the artwork itself, and footer content must remain readable on top of it |
| Runtime sizing / scaling | **HARD:** `background-size: cover`, `background-position: center center`, `background-repeat: no-repeat` on `position: absolute; inset: 0` |
| Runtime crop behaviour | **HARD: cropped to the footer's box.** `inset: 0` confines the layer to the footer and `cover` magnifies/clips the graphic to that box — which changes shape across the footer's multi-column → stacked responsive transition |
| Position / anchor | absolute, filling the footer box, `z-index: -1` → above the footer's own background, **behind every in-flow footer element** (logo, columns, links, copyright) |
| Repetition | once per page |
| Engine recolouring | **HARD: none** |
| Engine opacity | **HARD: none** |
| Optional? | **yes** |
| Missing-file behaviour | **availability-screened** → the footer renders no decorative DOM at all |
| Removal / disable | remove `site.assets.footerGraphic` |
| Replacement procedure | §4 |
| Requires code change to swap? | **no** |
| Accessibility | `aria-hidden="true"`, no `role`/`alt`/text, no accessible name |
| Interaction | **HARD:** `pointer-events: none` — footer links stay fully clickable, selectable and keyboard-focusable |
| Layout impact | **HARD: none.** `position: absolute; inset: 0` inside a `relative isolate` footer adds no padding, margin, reserved height or horizontal overflow |
| Stacking | the footer's `isolation: isolate` makes the footer its own stacking context, so the layer can never be pushed behind an ancestor background |

### 10.5 Decorative header band — `header-graphic.svg`

**This is NOT the header identity mark** (`logo` / `logo-header` stays the
independent brand link) and **NOT a page banner** (`banners` is page-specific and
renders *above* the whole shell; this role is global and belongs *to* the header).

**Representation — the key structural fact:** the band is painted as the
**header element's own CSS `background-image`**. It is **not** a DOM image and
**not** a positioned child layer. When configured, the shell emits this and
nothing else:

```html
<header class="ui-site-header border-b border-border"
        data-ui-header-graphic="true"
        style="--ui-header-graphic:url(&quot;/assets/header-graphic.svg&quot;)">
```

Why: any stacking context on `<header>` (or its content container) would confine
the shell's `position: fixed` drawer/overlay panels (`z-index: 40/50`), which live
*inside* the header. A CSS background needs no stacking context, no `position` and
no extra DOM: the header's own `background-color` paints first, then the band,
then **all** in-flow header descendants. Consequently **no `pointer-events`
override is applied** — on the header it would disable the logo link and the
navigation.

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/header-graphic.svg` |
| Config role | `site.assets.headerGraphic` (ONE global absolute URL) |
| CSS contract | `.ui-site-header[data-ui-header-graphic]` → `background-image: var(--ui-header-graphic); background-repeat: no-repeat; background-position: center center; background-size: cover` |
| Required file type | **HARD:** any browser-renderable image. **RECOMMENDED:** SVG |
| Alternative supported types | PNG · JPEG · WebP · AVIF · GIF |
| Engine-required dimensions | **HARD: none.** No width, height or aspect ratio is required or read. `cover` accepts **any** ratio |
| Recommended production master | **RECOMMENDED CANONICAL MASTER: 4096 × 512, `viewBox="0 0 4096 512"`** (8:1) — the branded Foundation master's geometry. This is a **RECOMMENDATION**, not an engine requirement |
| Shipped default artwork | **blank / transparent (2026-09 owner ruling)** — `public/assets/header-graphic.svg` is the byte-identical mirror of `assets/placeholders/header-graphic.svg`, a valid 4096 × 512 canvas that **draws nothing** and carries no branded content. The branded master is retained as source at `assets/branding/page-graphics/header-graphic.svg` |
| Required SVG viewBox | none. Set it to the canvas you designed; `cover` sizes it |
| Transparency requirement | **strongly RECOMMENDED: transparent.** The band paints over the header's own `background-color` (the `data-ui-header` treatment), so transparent areas are what let the header surface show through |
| Runtime sizing / scaling | **HARD:** `cover` magnifies the artwork until it covers the header box. The header box is wide and short: **measured 1265 × 65 ≈ 19.46:1 at desktop 1280**, **885 × 65 ≈ 13.62:1 at tablet 900**, **375 × 145 ≈ 2.59:1 at mobile 390** |
| Runtime crop behaviour | **HARD: cropped (clipped) by the header box.** A graphic whose ratio differs from the header box is magnified until it covers and the overflow is clipped. Because the header box spans a very wide ratio range, a non-matching master is magnified and cropped substantially. **The artwork was not altered and no engine CSS was added to compensate** |
| Position / anchor | `center center`, painted inside the header element, edge-to-edge at every viewport |
| Repetition | `no-repeat`. **ONE asset for every viewport** — there are deliberately no breakpoint variants, no art direction (`<picture>`) and no viewport listeners |
| Engine recolouring | **HARD: none** — no colour, opacity, filter, mask or blend mode |
| Engine opacity | **HARD: none** |
| Optional? | **yes** |
| Missing-file behaviour | **availability-screened** → no attribute, no inline style and no CSS at all; the header is byte-identical to a header that never had a band |
| Removal / disable | remove `site.assets.headerGraphic` |
| Replacement procedure | §4 — replace `public/assets/header-graphic.svg`, or re-point the key. **The success criterion for this role: an owner may replace the file with another technically conforming `header-graphic.svg` and no source-code change is required** |
| Requires code change to swap? | **no** |
| Mobile / desktop behaviour | identical mechanism at every width; only the header box ratio changes (see *Runtime sizing*) |
| Interaction | a CSS background cannot receive pointer events, be focused or carry semantics — navigation, the logo, the switchers and the mobile trigger are entirely unaffected |
| Layout impact | **HARD: none.** `background-*` longhands are paint-only → no height, no reserved space, no shift, no horizontal overflow. **No stacking context, no `position`, no `z-index`, no `inset`** is added to the header |

#### Activation status (recorded, not a coding gate)

The role **ships** and the canonical role is **ACTIVE**, and the artwork it paints by
default is the **blank transparent placeholder** — the default presentation is
"blank / not used", so no branded decorative header graphic is required (2026-09
owner ruling). The seam is technically validated (resolves, paints nothing, adds no
DOM/height/stacking context, no overflow, navigation and the mobile drawer
unaffected); enabling a branded graphic is **a file replacement or a one-line
config change, with no code change**. The branded Foundation master — and the
measured `cover` crop it implies inside the wide, short header box — is retained in
the source package
(`assets/branding/page-graphics/header-graphic.svg`) and the living-pack provenance
(`.project/deployment-info/brands-provelopment/provenance/display-graphics-provenance.json`);
that crop remains a **Master-Brand-Architect-owned aesthetic judgement**, never a
coding acceptance criterion.

### 10.6 Decorative status graphic — `status-graphic.svg`

ONE role, shared by **both** status surfaces. The audit proved
`[locale]/error.tsx` and `[locale]/not-found.tsx` render the **same** status frame
(an `h1` / `p` / action rhythm in one centred section), so one replaceable graphic
serves both truthfully — there is deliberately **no per-surface variant**.

**This is NOT an error icon and NOT semantic status communication.** The heading,
the supporting message and the retry/navigation controls remain the complete,
authoritative expression of the state. The page is fully understandable and
operable with **no graphic at all**.

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/status-graphic.svg` |
| Config role | `site.assets.statusGraphic` (ONE global absolute URL) |
| Rendered as | a real in-flow `<img class="ui-status-graphic-image">` inside a centred `.ui-status-graphic` box — the **first child** of the status frame, i.e. **above** the status heading |
| Required file type | **HARD:** one of **SVG · PNG · JPEG · GIF · WebP** (so the intrinsic size can be read). Any other container still renders — it simply gets no reserved box |
| Engine-required dimensions | **HARD: none.** No fixed size is required. The graphic is shown at its **natural size** and only ever scales **down** |
| Recommended production master | **RECOMMENDED: 640 × 320, `viewBox="0 0 640 320"`** — the approved Foundation master. This is a **PRODUCTION STANDARD ONLY; it is NOT runtime-required** |
| Required SVG viewBox | none required — but declare a readable intrinsic size (`width`/`height`, or a viewBox the reader can resolve) so the box is reserved before load |
| Transparency requirement | **RECOMMENDED: transparent.** The graphic sits on the page surface above the heading |
| Runtime sizing | **HARD:** `display: block; width: auto; max-width: 100%; height: auto` → natural size, **scale-down only**, never enlarged to fill the page, never distorted. Maximum rendered width = the status content column (100%) |
| Runtime crop behaviour | **HARD: never cropped.** No `cover`, no clipping |
| Position / anchor | in flow, horizontally **centred**, at the **start** of the status frame — immediately **above** the status heading |
| Gap below | **HARD: 2rem** (`margin: 0 0 2rem`) — the same rhythm the frame's own action row already uses. No new spacing scale is introduced |
| Repetition | once per status page |
| Engine recolouring | **HARD: none** — no colour, opacity, filter or blend mode |
| Engine opacity | **HARD: none** |
| Optional? | **yes** |
| Missing-file behaviour | **availability-screened** → nothing is rendered at all; both status pages are byte-identical to their pre-capability output |
| Removal / disable | remove `site.assets.statusGraphic` |
| Replacement procedure | §4 |
| Requires code change to swap? | **no** |
| Layout stability | the intrinsic `width`/`height` read on the server are emitted as real HTML attributes, so the browser reserves the correct aspect-ratio box **before** the file loads → no layout shift |
| Accessibility | box `aria-hidden="true"`, image `alt=""` — contributes no accessible name, no `role`, no reading-order entry |
| Interaction | `pointer-events: none` — the error boundary's retry button and both pages' links stay fully usable |

### 10.7 Social / Open Graph image — `og-image.png`

This role has **stronger external requirements** than the others: it is consumed by
third-party platforms, not by the Foundation.

| Field | Value |
| --- | --- |
| Runtime filename | `public/assets/og-image.png` |
| Config role | `site.assets.ogImage` (ONE global absolute URL) |
| Emitted as | **the configured absolute URL verbatim** — this is the ONE role that is **not** reduced to a same-origin pathname, because the URL must be absolute for external crawlers |
| Scope | **global** — every page's `og:image` **and** `twitter:image` derive from this one value |
| Platform metadata | `openGraph.images[].url` and `twitter.images[]`, with `twitter.card = "summary_large_image"` |
| Recommended / required format | **RECOMMENDED: PNG** (safer than JPEG for text/diagram artwork). JPEG also works |
| Recommended / required dimensions | **PRODUCTION STANDARD: 1200 × 630** (1.91:1) — the approved Foundation master is exactly 1200 × 630. This is a **social-platform compatibility** standard, **NOT** a Foundation runtime requirement: the Foundation does **not** validate the image's dimensions |
| Engine-required dimensions | **HARD: none** |
| Required SVG viewBox | n/a (raster role) |
| Transparency requirement | **RECOMMENDED: none / opaque.** Social platforms render these on their own backgrounds and some flatten transparency unpredictably — an opaque canvas is the safe production choice |
| Runtime sizing | n/a — the platform scales/crops the image into its own card |
| Runtime crop behaviour | the **platform's** crop applies, not the Foundation's. Keep essential content inside the central safe area for 1.91:1 |
| Position / anchor | attached to the document metadata of every page |
| Repetition | one value site-wide |
| Engine recolouring | n/a |
| Engine opacity | n/a |
| Optional? | **yes** |
| Generated fallback when unconfigured | when the key is absent, the engine uses the **generated per-locale OpenGraph image route** (`/{locale}/opengraph-image`). That route deliberately stays in the engine for adopters who remove the static role |
| Missing-file behaviour | the value is emitted verbatim; a URL with no backing file would be a broken external reference. Ship the file, or point the key at a URL that exists |
| How to disable the static override | remove `site.assets.ogImage` → the generated per-locale route is used again |
| How to replace the file | §4 — replace `public/assets/og-image.png`, or point `site.assets.ogImage` at your own `https://…` URL |
| Requires code change to swap? | **no** |

### 10.8 Control and navigation icons — plain-filename leaves

These are configured as **plain filenames**, not absolute URLs:
`"icon": "my-icon.svg"` → `/assets/my-icon.svg`. The value shape is validated
loudly (paths, URLs and query strings are rejected).

| Field | Value |
| --- | --- |
| Runtime filenames (shipped defaults) | `sidebar-open.svg` · `sidebar-close.svg` · `sidebar-default-icon-open.svg` · `sidebar-default-icon-closed.svg` |
| Config leaves | `ui.navigation.sidebar.open.icon` · `ui.navigation.sidebar.close.icon` · `ui.cta.icon` · `navigation[].icon` · `navigation[].iconOpen` · `navigation[].iconClosed` |
| Required file type | **HARD:** any browser-renderable image. **RECOMMENDED:** SVG |
| Supported extensions | any the browser renders (`.svg`, `.png`, `.webp`, …). The filename is opaque to the engine |
| Engine-required dimensions | **HARD: none.** A fixed CSS box governs the rendered size, so a file's intrinsic dimensions can never overflow the layout |
| Recommended production master | square, single-colour, with the intended colour **encoded in the file** (the shipped `sidebar-default-icon-open.svg` uses a literal `fill="#6b7280"`). A `currentColor` master renders in the image document's own initial colour (**black**), not the surrounding text/theme colour — see the box in §11. **RECOMMENDED only** |
| Transparency requirement | **RECOMMENDED:** transparent |
| Runtime sizing | shared icons: `1em × 1em`, `object-fit: contain`, `flex: none` (so they scale with the surrounding text and are never stretched). **Sidebar page icons: exactly 16 × 16 px** — one token (`--ui-sidebar-nav-icon-size: 1rem`), no breakpoint override, with `max-width: none` to defeat the preflight clamp |
| Runtime crop behaviour | **HARD: none.** `object-fit: contain` letterboxes rather than crops |
| Position / anchor | inline with the label (leading by default, `iconPosition` may make it trailing); sidebar items use state-paired classes (`…-open` / `…-closed`) |
| Repetition | per configured control / nav item |
| Engine recolouring | **HARD: none by the engine** — colour comes only from the file. Every icon in this table renders through the same plain `<img>` as the connectivity family, so a `stroke="currentColor"` master does **not** follow the surrounding text/theme colour and renders black (see the box in §11) |
| Engine opacity | none applied |
| Optional? | **yes** per leaf. `""` is the deliberate "no icon" value |
| Missing-file behaviour | **HARD: LOUD BUILD FAILURE.** A configured filename with no backing file names the exact config leaf and expected file, matching the "invalid configuration fails loudly" contract. `""` and absent leaves are valid and skipped |
| Removal / disable | delete the leaf, or set it to `""` |
| Replacement procedure | replace the file in place, or set the leaf to your own filename — **a new filename requires no code change** |
| Requires code change to swap? | **no** |
| Accessibility | icons are decorative (`alt=""`, `aria-hidden="true"`); the visible label (or an explicit `ariaLabel`) remains the accessible name |
| `sidebar-open`/`sidebar-close` vs `sidebar-default-icon-*` | the first pair is the **disclosure control** (show/hide the sidebar); the second pair is the **neutral navigation-item fallback** (dot when expanded, plus when collapsed) and lives in `assets/placeholders/`. They are separate roles with separate sizing — do not assume they share a size |
| Source category | the disclosure control pair lives in `assets/placeholders/`; the generic page icons live in `assets/icon-library/`; business-specific overrides live in `assets/branding/` — see §1.1 |

---

## 11. Connectivity asset contract

Both connectivity families (`socialLinks[]` and `connect.methods[]`) carry the
**same** optional generic leaf and are screened on the server:

```text
absent leaf   -> undefined        (no icon; nothing is rendered)
configured + backed by a file     -> the filename
configured + NO backing file      -> "" (deliberate no-icon) — never a broken <img>
```

**How every connectivity icon renders and colours — the `<img>` seam (HARD).**
Both families use the one shared decorative node, which emits a plain
`<img src="/assets/<filename>">`:

```text
renderer ......... plain <img> (AssetIcon / NavItem) — never inline SVG, never a
                   CSS mask, never injected markup
sizing ........... 1em x 1em, object-fit: contain, flex-shrink: 0
engine recolour .. NONE. No colour, filter, tint, blend, mask or opacity is
                   applied to the icon's paint
colour source .... ONLY the colour the file itself carries
```

The surrounding text colour **cannot reach the icon's contents.** The `<img>`
*element* does inherit the link's CSS `color`, but an `<img>`-referenced SVG is
rendered as its **own document** with no author `color` declaration, so:

* `stroke="currentColor"` / `fill="currentColor"` in a connectivity icon does
  **NOT** follow the surrounding label colour;
* there, `currentColor` resolves to the image document's own initial colour —
  **black** (browser-measured, not assumed: see §13);
* therefore **any runtime-visible colour an icon needs must be encoded in the
  asset itself.** The shipped `sidebar-default-icon-open.svg` shows the working
  pattern with a literal `fill="#6b7280"`.

This does **not** contradict *engine recolouring = none*. The engine applies no
colour, and the only colour that renders is the one the file carries. A
self-contained, full-colour platform mark is unaffected — it was always
self-contained, which is exactly why both families behave identically here.

### 11.1 Generic functional connectivity icons

Universal, non-trademark inventory — free to use on any connectivity item.

```text
icon-phone.svg   icon-email.svg   icon-message.svg   icon-link.svg
icon-external-link.svg   icon-share.svg   icon-globe.svg
```

| Field | Value |
| --- | --- |
| Config leaf | `socialLinks[].icon` · `connect.methods[].icon` |
| Contract | **filename-only.** `"icon-phone.svg"` → `/assets/icon-phone.svg`. No URL, no path, no query string |
| Supported extensions | any browser-renderable extension; the engine never inspects it |
| Required file type | **RECOMMENDED:** SVG |
| Engine-required dimensions | **HARD: none** |
| Recommended production master | `viewBox="0 0 24 24"`, monochrome, with the intended colour **encoded in the file**. (The shipped generic icons declare `stroke="currentColor"`, which renders as the image document's own initial colour — **black** — through the `<img>` seam; encode a colour when the icon must be neutral/interface-coloured. See the box in §11.) **RECOMMENDED only** |
| Transparency requirement | **RECOMMENDED:** transparent |
| Runtime sizing | **HARD:** `1em × 1em` in the shared icon slot, `object-fit: contain` |
| Runtime crop behaviour | **HARD: none** (`contain` letterboxes) |
| Position / anchor | inline with the visible label |
| Repetition | per configured item |
| Engine recolouring | **HARD: none by the engine.** Colour comes only from the file: a `currentColor` master renders in the image document's own initial colour (**black**), never the surrounding label colour (see the box in §11) |
| Engine opacity | none applied |
| Optional? | **yes** |
| Missing icon → | **text-only.** The item renders as its complete, working text link |
| Visible text remains authoritative | **always.** The label is the accessible name; the icon is strictly supplementary (`alt=""`, `aria-hidden`) |
| Removal / disable | delete the `icon` leaf, or set it to `""` |
| New filename | **no code change** — add the file to `public/assets/` and set the leaf |
| Requires code change to swap? | **no** |

### 11.2 ADMITTED third-party platform marks

These are **the platform owner's official marks**, subject to that owner's brand
rules — a different category from the generic icons above. Shipping a mark does
**not** create or configure an account.

Shipped admitted files:

```text
whatsapp.svg   telegram.svg   facebook.png   messenger.svg
instagram.svg  linkedin.png   github.svg
```

| Field | Value |
| --- | --- |
| Config leaf | the **same generic leaf** as §11.1 — `socialLinks[].icon` · `connect.methods[].icon`. There is no platform vocabulary in the engine |
| Example | `{ "id": "whatsapp", "label": "WhatsApp", "href": "https://wa.me/1234567890", "icon": "whatsapp.svg" }` |
| Required file type | **as supplied by the source owner** — official SVG where the owner publishes SVG, the owner's own raster otherwise. Never re-traced, never re-encoded, never recoloured |
| Engine-required dimensions | **HARD: none.** Marks render inside the same fixed icon box as every other icon |
| Recommended production master | **do not re-author.** Use the platform's official mark at its published geometry (the shipped files retain their own viewBoxes, e.g. `720×720`, `1000×1000`, `502×502`, `98×96`) |
| Transparency requirement | as published by the source owner |
| Runtime sizing | **HARD:** the same `1em × 1em` slot with `object-fit: contain` |
| Runtime crop behaviour | **HARD: none** (`contain`) |
| Engine recolouring | **HARD: none.** A multi-colour official mark renders exactly as supplied |
| Optional? | **yes** |
| **Shipping ≠ activation** | a mark is used **only** when a real connectivity item **references it by filename**. The canonical Foundation ships all seven marks and configures **no** social profile, handle, number or page — so it renders **zero** platform artwork |
| Text remains authoritative | **always.** The visible label is the accessible name; the platform mark is supplementary |
| Missing / unapproved mark | **remains text-only** — no build failure, no broken image, no lost contact method |
| Removal / disable | clear or delete the item's `icon` leaf; or remove the connectivity item entirely |
| Requires code change to swap? | **no** |
| Third-party provenance / trademark review | **mandatory and NOT performed by this document.** The admitted/withheld register and each mark's source owner, published use basis, colour variant and modifications live in the living brand pack: `.project/deployment-info/brands-provelopment/provelopment-foundation/social/platform-marks/` |

> **Do not attach a mark to an invented destination.** Availability is not
> activation. Do not add a mark for a platform that has not been admitted.

### 11.3 WITHHELD platforms — no mark ships

```text
X   ·   Slack   ·   Mastodon   ·   Viber   ·   YouTube
```

No mark file exists for these platforms, and **none may be substituted, traced or
approximated**. If a deployment references one, the connectivity item degrades to
its **text link** (§11.2) — the supported, correct behaviour.

---

## 12. Artwork-agent handoff data

Written so a future **graphics-only** agent can produce or revise each motif
**without reading any source code**. Production facts only.

```text
ROLE ................ header-graphic
file ................ header-graphic.svg            (SVG recommended)
canvas .............. 4096 x 512  ·  viewBox "0 0 4096 512"   (RECOMMENDED master)
transparency ........ required in practice — the band paints over the header surface
scaling ............. CSS `cover`, centred -> the artwork is MAGNIFIED to cover the
                      header box, i.e. it behaves as a full-bleed surface
crop ................ clipped by the header box, whose ratio is ~19.46:1 (desktop),
                      ~13.62:1 (tablet), ~2.59:1 (mobile)
safe area ........... assume heavy magnify + centre-crop at BOTH extremes; do not
                      rely on a single focal element surviving whole
animation ........... NOT permitted (static paint only)
text ................ permitted inside the artwork, but it is decorative-only and
                      never carries accessible meaning
opacity/recolour .... the engine applies none — bake the intended subtlety in

ROLE ................ background-all
file ................ background-all.svg
canvas .............. 2048 x 2048  ·  viewBox "0 0 2048 2048"  (RECOMMENDED master)
transparency ........ transparent — it layers over the theme colour
scaling ............. CSS `cover`, centred, on a fixed viewport layer
crop ................ clipped to the viewport; an arbitrary viewport ratio crops it
safe area ........... keep meaningful content away from the outer edges
animation ........... NOT permitted
text ................ not a meaning carrier
opacity/recolour .... none applied by the engine

ROLE ................ footer-graphic
file ................ footer-graphic.svg
canvas .............. 2048 x 2048  ·  viewBox "0 0 2048 2048"  (RECOMMENDED master)
transparency ........ transparent — footer text must stay readable over it
scaling ............. CSS `cover`, centred, absolute layer filling the footer
crop ................ clipped to the footer's box (which changes shape responsively)
safe area ........... content must survive a centre-crop in both a tall and a short box
animation ........... NOT permitted
text ................ not a meaning carrier
opacity/recolour .... none applied — the artwork carries all subtlety

ROLE ................ status-graphic
file ................ status-graphic.svg
canvas .............. 640 x 320  ·  viewBox "0 0 640 320"  (PRODUCTION STANDARD only)
transparency ........ recommended
scaling ............. natural size, scale-down only (never enlarged, never cropped)
crop ................ none
safe area ........... none needed
animation ........... NOT permitted
text ................ permitted; the status heading and message carry the meaning
opacity/recolour .... none applied

ROLE ................ banner-<page>   (home, about, contact, connect, offerings,
                      portfolio, blog, resources, testimonials, legal)
file ................ banner-<page>.png
canvas .............. 3546 x 443  (RECOMMENDED master; the RATIO is what matters)
transparency ........ either is acceptable
scaling ............. width fills the page up to 1.5x the file's own width, then
                      stops; height always follows the file's aspect ratio
crop ................ none — never cropped, never distorted
safe area ........... none needed
animation ........... NOT permitted (static <img>)
text ................ none — purely decorative artwork

ROLE ................ og-image
file ................ og-image.png
canvas .............. 1200 x 630  (1.91:1 — social-platform standard)
transparency ........ avoid; make it opaque
scaling / crop ...... the SOCIAL PLATFORM scales and crops it into its card
safe area ........... keep text and marks well inside the centre
animation ........... NOT permitted
text ................ permitted (it is a share card), but keep it legible when
                      scaled down

ROLE ................ logo-header / logo-footer / favicon        (identity)
Do not re-author as part of an asset-swap task. Replacement is a byte-for-byte
file swap of the approved masters, at the same filenames.
```

---

## 13. Validation

Run from the repository root of the Foundation runtime
(`01.foundation/`):

```bash
pnpm exec tsc --noEmit      # typecheck
pnpm lint                   # ESLint
pnpm assets:check           # runtime mirror is byte-identical to assets/** (no drift)
pnpm test                   # unit + architecture-boundary tests
pnpm build                  # production build (mirror + config validation run here)
pnpm run test:browser       # CDP browser matrix across viewports
```

Locking tests for this contract:

| Suite | What it locks |
| --- | --- |
| `tests/unit/brand-asset-swap-contract.test.ts` | the swap/file contract itself — role index ↔ config keys, filename-only resolution, optional-role removal, the file-only swap guarantee, the placeholder's neutrality, that this document names every shipped role, that the decorative header/footer defaults are blank, and that the icon colour seam is stated as measured (no inheritance claim) |
| `tests/unit/asset-taxonomy-mirror.test.ts` | the four source categories, the source→runtime mirror (byte-identical, no undeclared runtime file, icon-library retention), and the blank placeholder rules |
| `tests/unit/favicon-contract.test.ts` | the favicon is DERIVED from the untouched `mark.svg`: same `viewBox`, same path data, uniform scaling, no clip/crop, artwork strictly inside the 24 × 24 canvas |
| `tests/unit/sidebar-page-icon-contract.test.ts` | 16 × 16 sidebar page icons on desktop and tablet, the page → icon-library mapping and precedence, expanded/collapsed behaviour and tooltip discoverability, and unchanged mobile navigation |
| `tests/unit/approved-assets-integration.test.ts` | the Foundation-owned page graphics ship **and** are active; the header/footer decorative defaults are blank; the admitted/withheld mark register; availability never creates a link |
| `tests/unit/p12-hg-header-graphic.test.ts` | the header band contract — attributes only, no DOM, no height, no stacking context, no recolouring, removable by config, blank default artwork |
| `tests/unit/p12-bg-page-background.test.ts` · `p12-fg-footer-graphic.test.ts` · `p12-sg-status-graphic.test.ts` | the background / footer / status contracts, including that each role is independent |
| `tests/unit/connectivity-icons.test.ts` | the filename-only connectivity contract |
| `tests/unit/branding-placeholders.test.ts` | the shipped default role filenames |
| `tests/architecture/boundaries.test.ts` | the layer boundaries (config may touch the filesystem; `src/core` and UI primitives may not) |
| `tests/browser/matrix.mjs` | live behaviour in a real browser: the band resolves and paints, the header stays non-stacking, no horizontal overflow, navigation and the mobile drawer keep working, and the icon colour seam is **measured** — a deliberately non-neutral colour is set on the link and the icon's painted pixels are read back from a canvas |

**Browser-measured colour behaviour (the `<img>` seam, §11).** The claim that an
`<img>`-loaded icon cannot inherit the host text colour is **measured, not
assumed**. `tests/browser/matrix.mjs` sets a deliberate, non-neutral text colour
on a connectivity link, draws the rendered icon onto a canvas and reads the
painted pixels back:

| Icon file's declared colour model | Computed `color` on the `<img>` element | **Painted** opaque pixels |
| --- | --- | --- |
| `stroke="currentColor"`, no `<style>`, no hex (`icon-phone.svg`) | follows the link (e.g. `rgb(255, 0, 0)`) | **`rgb(0, 0, 0)`** — 89/89 opaque px |
| literal `fill="#6b7280"` (`sidebar-default-icon-open.svg`) | follows the link (`rgb(255, 0, 0)`) | **`rgb(107, 114, 128)`** = `#6b7280` |

In both cases the link's colour reaches the `<img>` **element** and stops there:
what paints is what the file carries (or `currentColor`'s own initial value,
black). No artwork was recoloured, and none was modified, to establish this — the
check runs against whatever files are present.

**No test asserts on the content of a Foundation-owned graphic.** Every
graphic-facing assertion is about file existence, container type, declared
geometry, filename or runtime geometry — never about an artwork's pixels, colours
or composition. That is what keeps the artwork swappable. The one colour-adjacent
check above is a **runtime seam property** (an externally loaded image cannot
inherit the host colour), which holds for any file with any colour and therefore
constrains no artwork.

---

## 14. Where the contract lives in code

A short map, for maintainers — not required reading for an artwork task.

| Concern | Location |
| --- | --- |
| Schema for every `site.assets.*` role | `src/config/schema.ts` — `siteAssetsSchema` |
| The shared availability rule (URL → pathname → basename → file exists) | `src/config/assets.ts` — `availableRoleAssetPath`, `assetPathFromUrl`, `iconAssetAvailable` |
| Per-role resolvers | `src/config/assets.ts` — `availableBannerPath`, `availableBackgroundMap`, `availableHeaderGraphicPath`, `availableFooterGraphicPath`, `availableStatusGraphicPath`, `availableIconName` |
| Intrinsic-size reader (SVG · PNG · JPEG · GIF · WebP) | `src/config/assets.ts` — `readImageDimensions` |
| Loud missing-icon check (build time) | `src/config/assets.ts` — `assertConfiguredIconAssetsExist` (called from `src/app/[locale]/layout.tsx`) |
| Banner rendering + page-slug derivation | `src/components/site/page-banner.tsx` |
| Background layer | `src/components/site/page-background.tsx` |
| Header band (attributes only) | `src/components/site/header-graphic.ts` + `src/components/site/site-header.tsx` |
| Footer decorative layer | `src/components/site/footer-graphic.tsx` + `src/components/site/site-footer.tsx` |
| Status graphic (+ its server→client transport) | `src/components/site/status-graphic.tsx` · `status-graphic-context.tsx` |
| Connectivity icon screening | `src/components/site/connectivity-links.ts` |
| Open Graph / Twitter metadata | `src/app/[locale]/layout.tsx` + `src/core/seo-metadata.ts` (`resolveOgImageUrl`) |
| All presentation (sizing, crop, anchor, pointer behaviour) | `src/app/globals.css` |
| **Source → runtime asset mirror** (the only sanctioned writer of `public/assets/**`) | `scripts/sync-runtime-assets.mjs` — `MIRRORED`, `MIRRORED_DIRECTORIES`, `RUNTIME_ONLY`, `buildPlan`, `syncMirrors`, `checkMirrors` (`pnpm assets:sync` / `pnpm assets:check`; run first by `pnpm build`) |
| Sidebar page icons (16 × 16 contract, icon-library mapping, tooltip) | `src/app/globals.css` (`--ui-sidebar-nav-icon-size`) · `src/components/site/nav-links.ts` (`withSidebarNavIcons`) · `src/components/ui/nav-item.tsx` · `site.config.json` (`navigation[].iconOpen/iconClosed`) |
| Sidebar open/close CONTROL (24 × 24; expanded inset / collapsed centred) | `src/app/globals.css` (`--ui-sidebar-control-icon-size`, `--ui-shell-control-inset`, `--ui-sidebar-rail-collapsed`, `--ui-sidebar-rail-collapsed-pad`) · `src/components/ui/sidebar.tsx` · `src/components/shell/shell-engine.tsx` (`resolveControlPresentation`) |
| **Foundation accent** (the ONE hardcoded `--ui-foundation-accent` → wordmark + highlights; dark derived) | `src/app/globals.css` (`--ui-foundation-accent`; `--ui-brand-accent`, `--primary`, `--ring` derive from it) · consumers: `src/app/[locale]/page.tsx` (wordmark), `src/components/site/{location,language}-switcher.tsx` (selector emphasis), `src/components/ui/cta.tsx` (CTA fill) |
| Header/footer logo source relationship + shared display size | `scripts/sync-runtime-assets.mjs` (`MIRRORED`: both roles ← `assets/branding/logos/lockup-horizontal.svg`) · `src/app/globals.css` (`--ui-logo-display-size`, `.ui-site-header-logo` / `.ui-site-footer-logo`) |

---

## 15. Final statement

```text
The Provelopment Foundation branding system is file-swappable by documented
contract. Production artwork may be replaced, updated, or omitted without changing
the branding engine when the documented filename/type/runtime contract is preserved.
```

The **living brand packs** that carry the approved masters, and the **provenance
records** that tie source ↔ living ↔ runtime byte-for-byte, live outside the
runtime tree:

```text
.project/deployment-info/brands-provelopment/provelopment-foundation/   # living masters
.project/deployment-info/brands-provelopment/provenance/                # provenance records
```

The runtime never reads those paths. It reads `public/assets/<basename>` only —
which is precisely why the swap is a file operation and never a code change. The
in-repository **source** of each runtime file is declared in the mirror manifest
(§1.1, `scripts/sync-runtime-assets.mjs`), so **source ↔ runtime is enforced
byte-for-byte** by `pnpm assets:check`. Parity with the **living pack** is a
per-role property, not an assumption: the identity mark, the logo family, the
Open Graph image and the banner family are byte-identical to the pack today,
while (a) the re-saved page graphics and platform marks differ from the pack only
in whitespace/formatting, and (b) `identity/favicon.svg` deliberately differs —
it was re-derived from the pack's untouched `identity/mark.svg` to remove the
cropped `viewBox` that produced the flat-sided tab icon, so the pack's own
favicon still needs the same correction by its owner.
