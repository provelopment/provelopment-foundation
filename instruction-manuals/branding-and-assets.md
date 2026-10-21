# Branding & Assets — runtime roles vs business files

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-10-21.3`
> **Content model described:** the **current EFS installation model** — one immutable Foundation release established into one autonomous Installation that owns its authored capsule and serves explicitly declared Entities, Facets, Sites, Pages and localized representations through publication bindings owned by declared Spokes. Pages are language-neutral; each localized representation is a JSON or Markdown source; JSON visibility is per representation; `unlisted` means reachable but not advertised, never private. Update changes authored material; Upgrade adopts a different immutable release. Legacy country-coded Sites, regional pages, Location routing and computed timezone/DST behavior are historical only.
> **Procedure validation:** the release and establishment procedures retain their 2026-09-30 end-to-end baseline. Revision `2026-10-21.3` reconciles the distributed model to the merged EFS runtime and the A1-R2 workspace-hygiene and contact-attribution correction, and is verified by the Foundation unit, integration, architecture, deployment and browser gates recorded in `FOUNDATION-COMPLETE-A1-R2`; no release tag is claimed by this revision.
> **Adopter baseline:** the installation's own adoption record — `deployment/foundation-baseline.json` inside the installation's capsule. An adopter's own governance record is the adopter's; it is never the Foundation's adoption record.
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed** and byte-identical to the master revision above — SHA-256
> verified at propagation — and is never edited in place: edit the master upstream and
> propagate.

## The distinction that matters

```text
runtime role                     vs.   physical business asset
(a Foundation-defined slot,            (the adopter's own artwork,
 resolved from configuration)           owned and preserved by the adopter)
```

A **runtime role** is a slot the platform fills (header mark, favicon, banner,
sidebar control). The **physical asset** is whatever file the adopter supplies.
The role is the Foundation's; the artifact is the adopter's.

> **Roles live in configuration. Artwork lives in the adopter's own asset area.**

This distinction is what makes adoption safe: platform defaults can be added or
improved without touching the adopter's artwork, and the adopter's artwork is never
destroyed when platform files land.

## Asset categories

| Role | What it is | How the adopter supplies it |
| --- | --- | --- |
| **Header logo** | the brand mark rendered in the site header | configuration: the logo asset URL |
| **Footer logo** | a restrained decorative mark composed into the footer | configuration: the footer-logo asset URL (absent → nothing) |
| **Favicon** | the browser tab icon | configuration: the favicon asset URL (absent → platform default) |
| **Page banners** | an optional per-page banner above the header | configuration: a page-slug → asset-URL map |
| **Sidebar toggle assets** | the sidebar show/hide control icons | configuration: plain asset filenames for open/close |
| **Navigation-item icons** | per-item icons in the sidebar | configuration: default open/closed pairs, or per-item overrides |
| **Business imagery** | photography, illustrations and graphics used inside pages | the adopter's own artwork under `content/assets/` (by convention `content/assets/branding/`), referenced from the page that shows it |
| **Social / OpenGraph art** | the social sharing image | configuration, or the platform's generated per-locale route |

## Where adopter artwork belongs

Put **business artwork** in the adopter's own artwork area — by convention
`content/assets/branding/` — and reference it from configuration or content. That area
is **adopter-owned**: platform files are never written there.

> **`public/assets/` is a generated mirror of `content/assets/**`.** The framework can
> only serve files under `public/`, so a script copies your artwork there
> (`pnpm assets:sync`). Never edit `public/assets/` by hand: the next sync overwrites the
> edit, and the automated check fails until the two agree again.

> **Do not park business artwork inside a platform-defined runtime asset
> directory unless you are deliberately overriding that role.** Doing so creates
> the dangerous overlap described in `foundation-upgrade.md` §Ownership model
> (category 3) and makes the next upgrade ambiguous.

If you *are* deliberately overriding a platform role, **record it** as a
deliberate override so the next upgrade knows it is intentional.

## Preserving adopter assets when a newer release arrives

1. Before a newer release is placed, record which asset files are deliberate overrides of
   a platform role.
2. Place the release the supported way — establish an installation from an immutable payload
   (`adoption.md`); never copy a release over a project's tree. A project-owned script that
   places platform files must not overwrite adopter-owned files; if it does, that is its own
   defect (see `troubleshooting.md`).
3. After the release lands, verify each override is **byte-identical to before** and that
   **new** platform defaults still arrived. Verify the generated mirror with
   `pnpm assets:check` (`pnpm assets:sync` regenerates it).
4. Reconcile any asset whose role the release changed, by evidence, file by file.

Never blindly overwrite an adopter override merely because its pathname is inside
a Foundation-defined asset directory — and never freeze every old file so that
legitimate platform defaults can no longer land.

## Page banner behaviour (current contract)

- **Always horizontally centred** in the available page width.
- **Proportional**: display width = `min(available page width, 1.5 × natural width)`;
  height always follows the graphic's own aspect ratio.
- **Never overflows** and never distorts (no crop, no stretch).
- **Maximum 1.5× upscale**: an over-wide graphic scales down; a graphic narrower
  than the page fills only up to 1.5 × its natural width — it is never enlarged
  merely to fill space.
- **A page with no banner entry renders nothing** — no placeholder, no reserved
  gap, never another page's banner.
- Supply a wide graphic (roughly 16:9 or wider) to obtain a wide banner band; a
  narrow graphic will be capped and centred.

## Navigation-icon behaviour (current contract)

- Sidebar navigation items support a **paired open/closed icon** per item
  (expanded state / collapsed state).
- Defaults are supplied by the platform; an item may override the pair, or supply
  a single icon used for both states.
- **Sidebar control** (the show/hide disclosure) is a separate role from
  navigation-item icons and is sized independently — do not assume they share a size.
- Icon sizes are part of the platform's presentation contract; changing them is a
  platform decision, not an adopter asset swap.

## Assets you must not redesign

Do not redesign platform artwork, control icons, or default assets as part of an
adopter customization. Supplying *your own* artwork for *your* roles is expected;
restyling the platform's defaults is not.
