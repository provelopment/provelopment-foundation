# Site Customization — configuration-first operation

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-19.1`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the current public/private topology (the public reusable product `provelopment-foundation`, and the live Foundation site implemented as a site profile in the private downstream `provelopment-web`)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## The principle

> **Prefer configuration, content and assets before source-code modification.**

The Foundation is a validated configuration-driven platform. Almost everything a
business needs — identity, navigation, calls to action, presentation, locale,
feature enablement — is **data**, validated at build time. Reaching into the
platform source to change behaviour breaks the upgrade path and the fidelity
guard, and is almost always unnecessary.

Full schema reference: the Foundation's `CUSTOMIZING.md`. This manual is the
**procedure**; that document is the **specification**. Do not duplicate the schema here.

## What you may change (adopter-owned)

- site configuration (identity, URL, contact, navigation, features, CTA, theme)
- business content
- business imagery/artwork and its wiring
- the adopter's own locale dictionaries
- project documentation

## What you must not change

- platform implementation reproduced into the site (the fidelity/divergence guard
  enforces byte-fidelity; see `validation.md`).

If a requirement genuinely cannot be met by configuration, content or assets, that
is an escalation — see `agent-operating-rules.md` — not a licence to fork the platform.

## Procedure

### Site identity

Set the business name, tagline and description. These drive page titles, metadata,
structured data and the visible brand text. Keep them consistent across content,
dictionaries and metadata.

### Site URL

Set the site's canonical URL to the **actual production hostname** before deploying.

> **Configured canonical URL and actual production hostname must agree.** A
> mismatch silently publishes wrong canonical/OpenGraph/sitemap/robots URLs — a
> production defect that local validation cannot catch. See `troubleshooting.md`.

### Presentation

The Foundation ships **ONE canonical presentation**: a coherent presentation
intent (typography, rhythm, surface, header, hero, density, content width,
radius) resolved by the shared UI engine from the shipped configuration.
Presentation is **not an adopter-selectable surface** — there is no preset
selector, no preset switching and no multi-presentation deployment map (the
former preset-comparison feature was retired in 2026-09). Do not add one.

### Theme

Theme mode (light/dark/system) and radius are configuration. Do not hand-edit
design tokens to fake a theme change.

### Navigation

Navigation is configuration: order, labels, targets, regions/groups where the
project uses them, and permitted per-item icons. Keep labels business-meaningful
and targets real routes. Removing an item does not remove the page — decide
deliberately whether the route should also stop being rendered (feature flags).

### Call to action (CTA)

The primary CTA is configuration: enabled, label, destination, style, icon,
icon position and state.

Current platform behaviour — treat as the contract:

- The CTA renders **once**, in the shell's **top region** (below the header, above
  the main content), at **every** width.
- It is never rendered inside the sidebar, the bottom bar, or a mobile
  menu/overlay, so it cannot be duplicated, collapsed away, or obscured.
- Disabled, or missing a label/destination, renders **nothing** — the platform
  never invents a destination or an accessible name.

### Regions / locality

Where the project uses locality, region or service-area configuration, keep it a
**single, consistent fictional or real locality** per site unless multi-location is
explicitly in scope. Multi-location architecture is not an incidental change.

### Contact information

Contact values are configuration. Where the platform wires a contact route, all
touchpoints must point at that route consistently — including the CTA, connect
methods and footer.

### Business metadata

Keep description, OpenGraph/social art and any structured-data inputs aligned with
the real business. Metadata must not make claims the business cannot support.

### Configuration validation

Every configuration change ends with the gate (`validation.md`):

```bash
pnpm validate        # schema, typecheck, lint, routes, build
pnpm test:browser    # rendered contract, responsive, accessibility
```

A schema failure is a **loud, intended** signal — never work around it by editing
the schema.

## Common mistakes

- Editing platform source to achieve a configuration outcome.
- Publishing a canonical URL that does not match the live hostname.
- Removing a navigation item while leaving the route reachable (or vice versa).
- Introducing selector controls (location/language) into a single-locale,
  single-location site contract.
- Changing a locale dictionary key structure rather than its values.
- Forgetting that presentation differences come from the shipped presentation
  configuration, not from ad-hoc CSS.
