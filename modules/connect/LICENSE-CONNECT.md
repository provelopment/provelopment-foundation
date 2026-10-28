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

**Copying files does not relicense them** — which is why the terms here are recorded rather than
inferred. The carried source did not arrive under any grant: the Module's `package.json` declares
`"private": true` and `"license": "UNLICENSED"`, its repository ships **no `LICENSE` file** anywhere,
and its `README.md` says nothing about redistribution.

The grant exists, and it comes from the holder of the rights, not from the act of copying:

| | |
| --- | --- |
| Grantor | Provelopment — copyright holder and Project Owner |
| Instrument | Project Owner authority confirmation, 2026-10-28 |
| Scope | the Foundation-integrated copy pinned above |
| Licence | Apache-2.0, matching Foundation's `LICENSE` |
| Constraints | the private Connect repository stays private; no real addresses, credentials, provider accounts or adopter-specific configuration may be copied into Foundation |

The confirmation states that the Connect Module is the Project Owner's intellectual property, that
its incorporation into the open-source Foundation is authorised, and that the integrated source is
distributed under Foundation's Apache License 2.0. `connect-release.json` records it verbatim in
`license.instrument`.

### What the grant does not do

It does not relicense the private Connect repository, and it does not publish it. That repository
still declares `UNLICENSED`, still ships no `LICENSE`, and remains private — deliberately, because no
separate Connect publication is authorised. Upstream metadata is not Foundation's to edit, so this
notice explains the relationship instead of pretending the two agree by accident:

```text
private Connect repository  →  remains private, metadata unchanged, never published
Foundation-integrated copy  →  Apache-2.0 by recorded grant, published with Foundation
```

The architecture suite enforces the shape of this record: it fails if a grant is claimed without an
instrument naming it, and it fails if the record stops acknowledging the upstream declaration.

## Attribution

The Connect domain, application and port source is authored by Provelopment. Foundation owns the
integration around it — the EFS context, presentation, authoring configuration, application
composition and transport adapters under `src/**` — and those files are Apache-2.0 under the
repository's `LICENSE`. The boundary is deliberate: the carried tree is never edited to suit
Foundation, and Foundation never re-implements Connect's domain rules.
