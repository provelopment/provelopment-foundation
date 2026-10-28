# Connect — licence and attribution record for the carried source

This file is the **licence record** for the Connect source carried at `modules/connect/src`. It is
legal evidence as well as documentation, so it states what is established and what is not.

## What is carried

The released source subtree of the private Provelopment Connect Module, pinned to one revision:

```text
repository   https://github.com/provelopment/provelopment-module-connect
release      v261027.1036          (annotated tag object 2d9dc7c397b2cf20f6af2e5a050bc43addf27ee5)
commit       7a5fb80f4f94af513909dbc38a1e6bb3b1159f3a
release tree 41dcc15a0fdabba820f036244c3c8c48cbdf467e
src subtree  a0f1f14ae68aa79cd548e6fc8db5145407bbd3e8  (49 files)
```

`scripts/connect/verify-pinned-source.mjs` recomputes that subtree id from the carried bytes, so the
claim "these are the released bytes" is checkable rather than asserted. Provenance, including the
Module's own passing CI run for the commit, is in `connect-release.json`.

## The licence problem, stated plainly

**Copying files does not relicense them.** The carried source does not arrive under Apache-2.0 or any
other grant:

- the Module's `package.json` declares `"private": true` and `"license": "UNLICENSED"`;
- the Module's repository ships **no `LICENSE` file** anywhere;
- its `README.md` says nothing about copyright, licensing or redistribution.

A vendored tree keeps the terms it arrived with. Foundation is a **public** repository offered under
Apache-2.0, so including this subtree in a published release is a redistribution of material that
currently carries no grant. That is why `connect-release.json` records
`license.state: BLOCKED` rather than claiming a licence it does not have.

## What the Project Owner has directed

The Project Owner's revised directive of 2026-10-28 directs that the Foundation-integrated Connect
source be distributed as part of the open-source Foundation under Foundation's applicable licence,
and instructs that the authority to grant those rights be **verified and recorded** first. The
direction is the owner's; the verification is not something this repository can perform on its own
behalf.

## What has to happen before an immutable release is built from it

Both items are the same act seen from two sides — a grant from the copyright holder, and a record
that does not contradict itself:

1. **A recorded grant.** The copyright holder (Provelopment) executes the licence for the
   Foundation-integrated copy of Connect — Apache-2.0, matching Foundation's `LICENSE` — naming the
   released revision this file pins. A countersigned statement held with the release records, or an
   upstream `LICENSE` in the Connect repository, both satisfy this. Either way the artefact must
   exist and be referenced here.
2. **Reconciled upstream metadata.** The Module's `package.json` still declares `UNLICENSED` and the
   repository still has no `LICENSE`. Upstream alignment is the owner's decision — this repository
   may not modify the private Module — but a public release should not ship a notice that flatly
   contradicts the manifest sitting next to it. When both items exist, set
   `connect-release.json`'s `license.state` to the recorded grant and name the instrument.

Until then this integration is **reviewable and testable but not publishable**: the carried source
can be exercised locally, and no Foundation release may be constructed or published from it.

## Attribution

The Connect domain, application and port source is authored by Provelopment. Foundation owns the
integration around it — the EFS context, presentation, authoring configuration, application
composition and transport adapters under `src/**` — and those files are Apache-2.0 under the
repository's `LICENSE`. The boundary is deliberate: the carried tree is never edited to suit
Foundation, and Foundation never re-implements Connect's domain rules.
