# Content Management — business content ownership

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-17.3`
> **Procedure validated against:** Foundation template release `v2026.09.17-foundation-generic-template` (`b9f7a18`) + the FS1 repository split (public template / private reference site)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** maintained in the Provelopment governance repository (private; not part of this product)
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## Ownership

> **Actual business content is adopter-owned.** The platform supplies structure,
> validation and rendering; it never supplies a business's words or pictures.

Platform reproduction must never overwrite adopter content. If it would, that is a
tooling defect (see `troubleshooting.md`).

## Content structure

Content is organised as markdown collections, one directory per content type,
under a locale path. Typical collections:

| Collection | Purpose |
| --- | --- |
| **Pages** | the primary page set (home, about, contact, FAQs, and business-specific pages) |
| **Offerings / services** | the products or services offered, with imagery and descriptive copy |
| **Portfolio / work** | completed projects or case studies, where the business has them |
| **Testimonials** | customer statements |
| **Legal** | privacy, terms, cookie and similar pages |
| **Posts / resources** | articles, where enabled |

Not every site needs every collection — feature flags decide what is rendered.
Disable a feature rather than deleting the collection, unless the content is truly
obsolete.

## Frontmatter

Content files carry structured frontmatter for the values the renderer and metadata
need: titles, descriptions, ordering, imagery references, and any collection-specific
fields. Rules:

- Use the field names the collection's schema expects — an unknown or missing
  required field is a **loud** validation failure by design.
- Keep imagery references pointing at real files that exist.
- Alt text / image semantics matter: meaningful images need meaningful alt text;
  purely decorative images must be marked decorative (empty alt) rather than
  mis-described.

## Locales and dictionaries

- Interface strings (labels, headings, button text, notices) live in **locale
  dictionaries** — one JSON file per locale.
- Business prose lives in **content**, per locale.
- The **canonical language** is the one the business actually writes in; other
  locales are translations of it. Keep the canonical locale complete and correct
  first.
- **Translation handling:** when adding a locale, supply real translations for the
  dictionary values and the content that matters. Do not machine-translate legal or
  financial statements without review, and never publish a locale that makes claims
  the canonical copy does not.
- **Dictionary keys are structure; values are yours.** Never rename or restructure
  keys to fit a translation — add required keys when a release demands them, and
  otherwise change values only.

## Writing rules for business copy

- Keep contact details, service area and CTA language consistent across every page.
- Prefer claims the business can substantiate. No unsupported awards, certifications,
  guarantees, or legally/financially sensitive statements.
- For demonstration/fictional sites, keep everything clearly fictional and never
  present invented reviews, addresses or people as real.
- Reserve space in your mind for the **long-content case**: a legitimate long email
  address, long navigation label or long business name is a layout test, not an edge
  case. Content must be real input the template handles gracefully.

## Procedure for a content change

1. Edit the relevant content file(s) — and the dictionary values if interface copy changes.
2. Keep imagery references valid (add the asset to the adopter's business asset area).
3. Run the gate (`validation.md`): route validation, build, and the browser matrix.
4. Confirm the rendered page: correct copy, no overflow, correct imagery semantics.
5. Update any project documentation that quotes the changed content.

## Common mistakes

- Editing a dictionary key structure instead of its values.
- Adding an image reference without adding the file.
- Disabling a feature but leaving navigation pointing at the removed route.
- Publishing translations that are incomplete or that change claims.
- Treating a content-length failure as a styling problem instead of a real content input.
