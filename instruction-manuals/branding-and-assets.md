# Branding & Assets — runtime roles vs business files

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-17.3`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the FS1 repository split (public template / private reference site)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

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

This distinction is what makes upgrades safe: platform defaults can be added or
improved without touching the adopter's artwork, and the adopter's artwork is never
destroyed by platform reproduction.

## Asset categories

| Role | What it is | How the adopter supplies it |
| --- | --- | --- |
| **Header logo** | the brand mark rendered in the site header | configuration: the logo asset URL |
| **Footer logo** | a restrained decorative mark composed into the footer | configuration: the footer-logo asset URL (absent → nothing) |
| **Favicon** | the browser tab icon | configuration: the favicon asset URL (absent → platform default) |
| **Page banners** | an optional per-page banner above the header | configuration: a page-slug → asset-URL map |
| **Sidebar toggle assets** | the sidebar show/hide control icons | configuration: plain asset filenames for open/close |
| **Navigation-item icons** | per-item icons in the sidebar | configuration: default open/closed pairs, or per-item overrides |
| **Business imagery** | offerings, portfolio, project and other content photography | the adopter's own business image area, referenced from content |
| **Social / OpenGraph art** | the social sharing image | configuration, or the platform's generated per-locale route |

## Where adopter artwork belongs

Put **business artwork** in the adopter's own asset area (by convention a
`business/` directory under the site's public assets), and reference it from
configuration or content. That area is **adopter-owned**: platform reproduction
must never touch it.

> **Do not park business artwork inside a platform-defined runtime asset
> directory unless you are deliberately overriding that role.** Doing so creates
> the dangerous overlap described in `foundation-upgrade.md` §Ownership model
> (category 3) and makes the next upgrade ambiguous.

If you *are* deliberately overriding a platform role, **record it** as a
deliberate override so the next upgrade knows it is intentional.

## Preserving adopter assets across an upgrade

1. Before an upgrade, record which asset files are deliberate adopter overrides.
2. Ensure the project's reproduction step will not blindly overwrite them — if it
   would, that is a tooling defect to fix (see `troubleshooting.md`).
3. After reproduction, verify each override is **byte-identical to before** and
   that **new** platform defaults still arrived.
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
