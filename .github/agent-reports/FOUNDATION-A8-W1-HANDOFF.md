# FOUNDATION A8 — Phase W1 downstream handoff (NOT a release document)

**Audience.** The next, independently authorized agent working in `provelopment/provelopment-web-1`
(`01.web-1/`). This file is **not** part of the Foundation release payload: `.github/` is excluded by
`scripts/release/release-content-policy.mjs`, so nothing adopter-specific can leak into a platform release.

**Status of this handoff.** Written at the end of the Foundation programme described below. The immutable
release it describes **has not been published yet**; the publication fields are marked
`PENDING PUBLICATION` and must be filled from the published release, from a fresh clone of the remote tag —
never from a constructing worktree, and never from this document's numbers.

---

## 1. What the Foundation programme did, and did not do

It delivered the generic **application-link reference** capability (A8 Phase F) plus documentation, in
`provelopment/provelopment-foundation` only.

**It made no change to `provelopment-web-1` or to Connect.** It did not branch, commit, merge, configure,
test or deploy Web-1; it did not modify a Connect record, module, mailbox, resolver wiring or DNS entry. Any
statement in this document about Web-1 is a *requirement for a later phase*, not a description of work done.

## 2. The release to adopt

| Field | Value |
| --- | --- |
| Release identity (tag) | `PENDING PUBLICATION` |
| Source commit / tree | `PENDING PUBLICATION` |
| Tag object | `PENDING PUBLICATION` |
| Payload file count | `PENDING PUBLICATION` |
| Payload content digest | `PENDING PUBLICATION` |
| Manifest SHA-256 | `PENDING PUBLICATION` |
| `release:verify --expect-tag` | `PENDING PUBLICATION` |

Phase F's reviewed source, for orientation only: commit `dd6c4ec4ab91b476b00aca989435beda18cab7b6`, tree
`5cefff9f1239d9b7e93ce214708c42b6ee5372aa` (PR #269). A release is cut from the **merged** main revision,
so do not treat that branch commit as the release source.

Adopt by establishing from a **fresh clone of the remote annotated tag**. Never adopt from a working tree, a
branch tip or a payload someone reconstructed by hand.

## 3. The generic interface (what your content may now say)

Foundation supplies a *reference*, never a destination. A page declares a link; the **application** resolves
it at render time. Foundation does not know what a "public contact" is, and no Connect vocabulary entered it.

```json
{
  "schemaVersion": 1,
  "title": "Request a quotation",
  "links": {
    "quotation-email": { "reference": "applicationLink", "key": "public-contact-email" }
  },
  "sections": [
    { "type": "prose", "body": "Email **[us](#link:quotation-email)** with your requirements." },
    {
      "type": "actions",
      "actions": [{ "label": "Email us about a quotation", "link": "quotation-email" }]
    },
    {
      "type": "list",
      "items": [{ "label": "Email us", "link": "quotation-email" }]
    }
  ]
}
```

- `reference` is a **closed** set — today exactly `applicationLink`. An unknown kind is refused at read time.
- `key` is **opaque**: Foundation validates its shape (`^[a-z0-9]+(?:[.-][a-z0-9]+)*$`, ≤ 96) and never its
  meaning. Choose a Web-1-namespaced key, not a Connect record identifier — the page should survive a rename
  on the Module side.
- Destination forms are `href`, `route` or `link`: **exactly one** for an action, **at most one** for a list
  item (a plain label stays valid).
- The Markdown marker is `[label](#link:<declaration-id>)`. The **whole `#link:` namespace is reserved**: a
  malformed spelling (`#link:`, `#link:a_b`, `#LINK:x`) is never a clickable fragment, and ordinary fragments
  (`#hours`) are untouched.

**The resolver you supply is an argument, not a registration.** There is no global, no cache and no context
singleton in Foundation, so two pages rendered concurrently cannot see each other's links:

```tsx
<PageDocumentContent
  document={document}
  locale={locale}
  resolveLink={(reference) =>
    // Your namespace. Return an href Foundation will classify, or null for "not offered".
    reference.key === "public-contact-email" ? "mailto:contact@example.com" : null
  }
/>
```

Return `null` for absent, disabled, revoked or unauthorized. Foundation refuses anything else that is unsafe,
that is itself inside `#link:`, or that it cannot classify — and in every one of those cases the author's
label is rendered **as text with no anchor**. Do not invent a fallback destination in the content: there is
no fallback anywhere.

**Authoring integrity.** A marker that is malformed, or that names an id the document does not declare, is
refused when the page is read — in the offline reader *and* in the EFS runtime reader that serves it — naming
the field and the marker. Your authored content must therefore declare every link it names.

---

## 4. The frozen Web-1 baseline — design-time, RE-VERIFY BEFORE USE

These values come from **A8 Design R02 §1/§6**, not from a measurement made by this programme. They are a
**design-time baseline**: re-verify them first-hand (blob SHA-1 in both worktrees) before you rely on any of
them, and treat a mismatch as a stop condition rather than something to reconcile by editing either side.

| Item | Design-time value (unverified by this programme) |
| --- | --- |
| Repository | `provelopment/provelopment-web-1`, worktree `01.web-1/` |
| Frozen authority | `cf7596f…`, tree `ea57feb…`, clean |
| Release in use at design time | `provelopment-foundation-v20261024.0539` |
| Proposed branch → PR | `chore/web1-adopt-foundation-<successor>` → new PR against `main` |

Paths that were **byte-identical** between Foundation and Web-1 at design time (the whole reason the
capability belongs upstream): `src/core/page-document.ts`, `src/core/safe-url.ts`,
`src/adapters/markdown/safe-markdown.ts`, `src/components/site/page-document-content.tsx`,
`src/components/site/safe-markdown-content.tsx`, `src/components/site/page-sections/section-support.tsx`,
`src/components/site/page-sections/text-sections.tsx`, `src/components/site/page-sections/items-sections.tsx`.

Phase F changes most of those files, and adds `src/adapters/content/page-link-integrity.ts` plus one
architecture-visible rule to `src/adapters/content/efs-content.ts`. Expect the adopted delta to be **larger
than the eight paths**, and derive the real list from the release's own classification — not from this table.

## 5. Phase W1 — adoption and source integrity (the next authorized work)

Objective: adopt the successor release, prove source integrity, and prove authored content is untouched.
**No WWW capability is activated in W1.**

1. Reconstruct the release from a fresh clone of the remote tag: record tag object, peeled commit/tree,
   policy, payload count, content digest, manifest SHA-256, and `release:verify --expect-tag`.
2. Per-path **SHA-256 equality** between every adopted file and the release bytes. Not "looks the same".
3. `pnpm release:verify --source-repository . --expect-tag` on the adopted tree.
4. **Authored-content preservation** — `deployment/spokes/**`, `deployment/efs/**` and `modules/connect/**`
   with **zero** diff; the ten WWW `en` page blobs keep their fixed identities (e.g. `contact-us.json`
   `31844a75d9bf49d2bf2c5cff9d073c1a444300ea`). Do **not** regenerate expectations from the checkout.
5. `pnpm connect:verify` — the Connect source subtree unchanged.
6. Gates: `install --frozen-lockfile`, `assets:check`, `country-codes:check`, `connect:verify`,
   `tsc --noEmit`, `lint`, `test:deployment`, `test:foundation`, `build`, `test:browser:deployment`,
   `git diff --check`, plus exact-head GitHub CI (`full`).

**Stop conditions.** Any authored-content diff; any Connect/Module diff; any adopted path not byte-identical
 to the release; a gate whose remedy would be a Foundation change (**return to Foundation — never patch
 downstream**); a successor whose `pageDocumentSchema` version moved; an unreconstructable release.

**Rollback.** Revert the adoption commit: it restores the previous `foundation-release.json` and sources, and
nothing visitor-visible changes in W1.

## 6. Explicitly deferred to Phase W2 (do not start it in W1)

- Any WWW page authored to use `links`/`applicationLink`.
- Any Connect `sites[].publicContact` record, method identifier or mailbox.
- Any resolver wiring from the application into `PageDocumentContent`.
- Any `deployment/**` publication, provider, DNS or promotion change.
- Any change that makes Foundation know a product, an address, a scheme or a business policy.

W2 is activated only under its own authorization, after W1 is accepted, and it resolves the *key* your
content names — Foundation keeps knowing nothing about it.
