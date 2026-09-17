# Provelopment Canonical Icon Inventory

**Authoritative inventory assets — produced by Phase 9F.** These are the approved
source/catalog icon files for the Provelopment graphic system. They are **not** yet
Foundation runtime assets (see *Runtime status*).

See the architecture spec in the root project's brand-system authority:
the maintainer's brand-system visual rulebook.

## Purpose

A royalty-free, filename-stable graphic system covering the recurring navigation,
action, content and page-identity needs of roughly 80% of small-business websites.
An adopter rebrands the graphics by **replacing file contents while keeping the
filename** — the stable semantic filename *is* the asset contract.

## Canonical geometry

Every file in this directory uses exactly:

```text
width="24"
height="24"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round"
```

The SVG is `currentColor`-driven, and `currentColor` resolves **inside the SVG
document**, not against the surrounding page. When a file is referenced through an
`<img>` — the Foundation runtime's shared icon seam — the host text colour cannot
reach the file's contents, so `currentColor` paints in the image document's own
initial colour, i.e. **black**. Neutral/interface colour is still the normal case,
but through that seam it must be **encoded in the file** (a literal `stroke`/`fill`);
expression signature colours are used only where an icon deliberately acts as a
brand/accent cue. **Brand colour ≠ semantic colour.** (Browser-measured, not assumed;
see the Foundation contract `01.foundation/BRAND_ASSETS.md` §11.)

## Rendering scale

```text
24px — primary navigation / action icon   (canonical)
16px — compact / secondary functional icon
```

The source grid remains 24×24 in both cases. 32px and 64px are **not** canonical
sidebar/navigation icon sizes.

## Favicon exclusion

The favicon is **not** part of this inventory. It is a Phase 6 optical-small-emblem
production task with a canonical **24×24** target, and sharing a 24×24 presentation
size does not make it part of the ordinary UI pictogram family.

## Semantic filename principle

```text
<graphic-role>-<semantic-role>.<ext>
```

Lowercase, ASCII, hyphen-separated, **semantic rather than visual**, stable over
time, no vendor names, no colour descriptors, no arbitrary version suffixes.

## Canonical mapping

### Core navigation (20)

| Canonical file | Source |
| --- | --- |
| `icon-home.svg` | Tabler `home` |
| `icon-about.svg` | Tabler `info-circle` |
| `icon-services.svg` | **original Provelopment pictogram** (see below) |
| `icon-products.svg` | Tabler `package` |
| `icon-shop.svg` | Tabler `building-store` |
| `icon-menu.svg` | Tabler `list-details` |
| `icon-portfolio.svg` | Tabler `briefcase-2` |
| `icon-projects.svg` | Tabler `folder` |
| `icon-gallery.svg` | Tabler `photo` |
| `icon-resources.svg` | Tabler `books` |
| `icon-blog.svg` | Tabler `writing` |
| `icon-news.svg` | Tabler `news` |
| `icon-events.svg` | Tabler `ticket` |
| `icon-team.svg` | Tabler `users` |
| `icon-testimonials.svg` | Tabler `quote` |
| `icon-reviews.svg` | Tabler `star` |
| `icon-faq.svg` | Tabler `question-mark` |
| `icon-pricing.svg` | Tabler `tag` |
| `icon-contact.svg` | Tabler `address-book` |
| `icon-careers.svg` | Tabler `user-search` |

### Business actions (15)

| Canonical file | Source |
| --- | --- |
| `icon-book.svg` | Tabler `calendar-plus` |
| `icon-appointment.svg` | Tabler `calendar-time` |
| `icon-calendar.svg` | Tabler `calendar` |
| `icon-quote.svg` | Tabler `file-invoice` |
| `icon-enquire.svg` | Tabler `message-question` |
| `icon-email.svg` | Tabler `mail-opened` |
| `icon-message.svg` | Tabler `message` |
| `icon-order.svg` | Tabler `receipt-2` |
| `icon-cart.svg` | Tabler `shopping-cart` |
| `icon-checkout.svg` | Tabler `shopping-cart-check` |
| `icon-register.svg` | Tabler `user-plus` |
| `icon-download.svg` | Tabler `download` |
| `icon-upload.svg` | Tabler `upload` |
| `icon-login.svg` | Tabler `login` |
| `icon-account.svg` | Tabler `user-circle` |

### Location / operating (7)

| Canonical file | Source |
| --- | --- |
| `icon-location.svg` | Tabler `map-pin` |
| `icon-map.svg` | Tabler `map` |
| `icon-directions.svg` | Tabler `direction-sign` |
| `icon-hours.svg` | Tabler `clock-hour-4` |
| `icon-phone.svg` | Tabler `phone` |
| `icon-globe.svg` | Tabler `globe` |
| `icon-service-area.svg` | Tabler `route` |

### Content / information (10)

| Canonical file | Source |
| --- | --- |
| `icon-feature.svg` | Tabler `diamond` |
| `icon-benefits.svg` | Tabler `checklist` |
| `icon-process.svg` | Tabler `timeline` |
| `icon-information.svg` | Tabler `info-square` |
| `icon-document.svg` | Tabler `file-description` |
| `icon-link.svg` | Tabler `link` |
| `icon-external-link.svg` | Tabler `external-link` |
| `icon-search.svg` | Tabler `search` |
| `icon-filter.svg` | Tabler `filter` |
| `icon-share.svg` | Tabler `share` |

### Commerce (6)

| Canonical file | Source |
| --- | --- |
| `icon-bag.svg` | Tabler `basket` |
| `icon-delivery.svg` | Tabler `truck-delivery` |
| `icon-pickup.svg` | Tabler `package-import` |
| `icon-payment.svg` | Tabler `credit-card` |
| `icon-sale.svg` | Tabler `discount` |
| `icon-gift.svg` | Tabler `gift` |

### Professional / service (5)

| Canonical file | Source |
| --- | --- |
| `icon-consultation.svg` | Tabler `messages` |
| `icon-case-studies.svg` | Tabler `file-search` |
| `icon-clients.svg` | Tabler `heart-handshake` |
| `icon-support.svg` | Tabler `headset` |
| `icon-emergency.svg` | Tabler `urgent` |

### Hospitality / food (5)

| Canonical file | Source |
| --- | --- |
| `icon-reservation.svg` | Tabler `calendar-check` |
| `icon-table.svg` | Tabler `table` |
| `icon-food.svg` | Tabler `chef-hat` |
| `icon-drink.svg` | Tabler `cup` |
| `icon-rooms.svg` | Tabler `bed` |

### Health / personal services (4)

| Canonical file | Source |
| --- | --- |
| `icon-health.svg` | Tabler `heart` |
| `icon-wellness.svg` | Tabler `yoga` |
| `icon-beauty.svg` | Tabler `sparkles` |
| `icon-treatment.svg` | Tabler `stethoscope` |

### Education / organization (6)

| Canonical file | Source |
| --- | --- |
| `icon-courses.svg` | Tabler `certificate` |
| `icon-enrol.svg` | Tabler `clipboard-plus` |
| `icon-membership.svg` | Tabler `user-check` |
| `icon-community.svg` | Tabler `building-community` |
| `icon-donate.svg` | Tabler `coin` |
| `icon-volunteer.svg` | Tabler `heart-handshake` |

Counts: 20 + 15 + 7 + 10 + 6 + 5 + 5 + 4 + 6 = **78 common-business icons**.

## Custom Services icon

`icon-services.svg` is an **original Provelopment pictogram** — not Tabler-derived.
It is the one role whose library candidates all failed a required semantic test
(trade-specific tool, software-settings metaphor, or abstract modular glyph).

Concept: *multiple offerings under one organised service system.* Construction:
three vertically arranged service rows; each row is one small outlined rounded-square
marker at left plus one horizontal line at right; the three markers are identical in
size; equal vertical rhythm; top line longest, middle line shortest, bottom line
intermediate.

Provenance is recorded as `source_library: original` /
`source_icon_name: Provelopment services pictogram` / `license: Provelopment original
artwork`. It is **not** claimed as Tabler artwork.

## Intentional source reuse

`heart-handshake` is deliberately used for **both** `icon-clients.svg` and
`icon-volunteer.svg`. This is approved; the semantic **filenames remain distinct asset
roles** even where artwork is shared.

One further exact source reuse arises from the approved mapping:

| Source | Canonical roles |
| --- | --- |
| `heart-handshake` | `icon-clients.svg`, `icon-volunteer.svg` |
| `info-circle` | `icon-about.svg`, `icon-status-info.svg` |

These are mapping outcomes, not errors, and were not resolved by inventing artwork.

## Removed aliases

The following are deliberately **absent** (removed during vocabulary rationalization);
no compatibility aliases exist in the authoritative inventory:

```text
icon-call.svg          → use icon-phone.svg
icon-locations.svg     → use icon-location.svg
icon-reserve.svg       → use icon-book.svg / icon-reservation.svg
icon-price.svg         → use icon-pricing.svg
icon-accommodation.svg → use icon-rooms.svg
```

The vocabulary was rationalized from 83 to **78** canonical common-business roles.

## Sidebar control set (2)

Functional controls, separate from the 78:

| Canonical file | Source |
| --- | --- |
| `icon-sidebar-open.svg` | Tabler `layout-sidebar-left-expand` |
| `icon-sidebar-close.svg` | Tabler `layout-sidebar-left-collapse` |

These are **canonical future** functional controls. They do **not** overwrite the
Foundation's existing `sidebar-open.svg` / `sidebar-close.svg`.

## Semantic status set (4)

Functionally separate from the 78; status **text** remains the accessible source of
meaning in future implementation:

| Canonical file | Source |
| --- | --- |
| `icon-status-success.svg` | Tabler `circle-check` |
| `icon-status-warning.svg` | Tabler `alert-triangle` |
| `icon-status-error.svg` | Tabler `circle-x` |
| `icon-status-info.svg` | Tabler `info-circle` |

## Menu / content distinction

`icon-menu.svg` means the **business/content menu** role — including restaurant/menu
content. It does **not** mean a hamburger/navigation-menu control.

## No generic navigation placeholders

These are deliberately **not** created:

```text
icon-navigation-default.svg
icon-navigation-default-collapsed.svg
```

The system intentionally does not establish dot/plus placeholder navigation graphics
as part of the canonical icon language. Unknown/custom links may remain text-only or
supply an explicitly configured icon.

## Source / provenance

Source library: **Tabler Icons v3.46.0**, `icons/outline`, **MIT**. Upstream geometry
is preserved exactly — no redrawing, simplification, expansion or normalisation.
Canonical Provelopment filenames differ from upstream names; **file renaming is not
source-geometry modification**.

- License text: [`../licensing/TABLER-ICONS-MIT.txt`](../licensing/TABLER-ICONS-MIT.txt)
- Machine-readable provenance: [`../licensing/icon-provenance.json`](../licensing/icon-provenance.json)

## Runtime status

> **No icon inventory has yet been propagated into Foundation runtime assets.**

These files are authoritative **inventory** assets. `public/assets/` has not been
modified, no config schema has been changed, no sidebar CSS has been touched, and
Tabler has **not** been installed as a runtime dependency. Runtime propagation belongs
to a later implementation phase.

## Not in this step

Social/platform marks (separate trademark-aware subsystem), the optical small
favicon/identity icon, backgrounds/watermarks, and page banners are **not** produced
here.
