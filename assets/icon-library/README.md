# Universal assets

Reusable, **non-brand** assets that any deployment may use - Provelopment's own
expressions and future business deployments alike.

## What "universal" means

A universal asset carries **no brand identity**: it is neutral, generic and
appropriate for any adopter. This is what distinguishes it from a brand asset,
which belongs to one specific expression or business.

- **Universal assets** -> generic graphics (icons), reused everywhere, never
  recoloured to a brand colour.
- **Brand assets** -> one expression's or business's own identity. The living brand
  packs are **not** part of this repository: they are governed from the root
  project, at the maintainer's Provelopment brand pack and
  the maintainer's business brand packs.

## Categories

| Directory | Contents |
| --- | --- |
| [`icons/`](icons/README.md) | The canonical neutral UI icon inventory (84 SVG files) |
| `licensing/` | Per-asset provenance (`icon-provenance.json`) and the upstream license notice (`TABLER-ICONS-MIT.txt`) |

## How a deployment uses them

A deployment copies the roles it requires into its own **deployment-specific**
`icons/` directory and keeps the **stable semantic filename** (e.g.
`icon-services.svg`), so the graphic can later be replaced without any
configuration change. The universal library is the shared source; the
deployment-specific destination is the per-deployment `icons/` directory
(e.g. the maintainer's Provelopment brand pack icons, and
later the maintainer's business brand pack icons). Icon roles
are owned by [`icons/README.md`](icons/README.md).

## Provenance and licensing

Structured provenance and the license text live under `licensing/`. The icons are
third-party-derived; the license and per-asset source names must be preserved. See
[`licensing/icon-provenance.json`](licensing/icon-provenance.json) and
[`licensing/TABLER-ICONS-MIT.txt`](licensing/TABLER-ICONS-MIT.txt).

Universal assets are **not** a place for Provelopment-specific logos, colours,
banners or backgrounds.
