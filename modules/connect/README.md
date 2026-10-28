# `modules/connect` — the Connect module Foundation carries

This directory holds Foundation's **own integrated copy** of the Provelopment Connect Module: the
reusable communication domain, its application use cases and its port interfaces. Together with the
adapters and pages under `src/**`, it is what lets a Foundation website publish a public email
contact method and accept a simple contact form.

You do not need a Connect checkout, a private GitHub account or an npm package to build or run
Foundation. The source is here, and it is proven to be the released source.

## What is here

```text
modules/connect/src/**              the released Connect source, carried byte-for-byte
modules/connect/connect-release.json   the exact upstream identity of those bytes
modules/connect/LICENSE-CONNECT.md  the licence and attribution record — READ THIS BEFORE PUBLISHING
```

`src/index.ts` is the Module's public entry point, and the only import Foundation may use:

```ts
import { SendDirectEnquiry } from "../../../modules/connect/src/index.js";
```

It exports **domain contracts, application use cases and port interfaces — and nothing else**. The
reference in-memory adapters are deliberately not exported: a consumer must supply its own approved
adapters, and no store, transport or mail provider is created by the Module. That is the boundary
Foundation fills in `src/adapters/connect/**`.

That snippet is the real Foundation import, written from `src/adapters/connect/`, which sits three
directories below the repository root: no `@/` alias reaches outside `src/`, so a file one level
shallower needs one fewer `../`. Never point it at a module-internal path — `index.ts` is the whole
published surface, and the architecture suite fails a deep import.

## Verify the pin

```bash
pnpm connect:verify
```

It recomputes the Git tree object id of `modules/connect/src` and compares it with the id recorded in
`connect-release.json`. Expected output ends `PINNED SOURCE OK` and shows the same id twice:

```text
  source subtree   a0f1f14ae68aa79cd548e6fc8db5145407bbd3e8 (recorded)
  carried subtree  a0f1f14ae68aa79cd548e6fc8db5145407bbd3e8 (recomputed)
```

The check is also an architecture test, so a mismatch fails the ordinary test suite rather than
waiting for someone to remember the command.

## Re-vendoring, and the trap that catches everyone

**Do not copy a working tree.** Connect publishes no `.gitattributes` of its own, so a clone on a
machine with `core.autocrlf=true` arrives with CRLF line endings, and `git archive` converts as well.
Copying that tree carries bytes the release never published — every file looks correct and the tree
id is wrong. This was not hypothetical: it happened while this integration was being built, and the
verifier is what caught it.

Materialise from the object database instead:

```bash
git clone --depth 1 --branch <release> https://github.com/provelopment/provelopment-module-connect.git /tmp/connect
git -C /tmp/connect rev-parse 'refs/tags/<release>^{}'          # the released commit
git -C /tmp/connect rev-parse '<commit>:src'                    # the subtree id to record
# write each blob from `git -C /tmp/connect cat-file blob <sha>` to modules/connect/src/<path>
```

Then update `connect-release.json` (tag object, commit, tree, subtree, file count), run
`pnpm connect:verify`, and confirm the recomputed id equals the upstream `'<commit>:src'` id you just
printed. `.gitattributes` keeps `modules/connect/src/**` verbatim (`-text`) so the stored bytes are
the verified bytes on every machine.

**Never edit a carried file to make the check pass.** A mismatch means the tree was materialised
wrongly, or the provenance is out of date. Both are fixed upstream of the carried tree.

## Typecheck target

The Module uses BigInt literals (`0xcbf29ce484222325n`, a 64-bit hash), which TypeScript accepts only
at `target` ES2020 or later. Foundation's `tsconfig.json` therefore targets **ES2020**. `tsc` runs
with `noEmit`, so this governs typechecking only — what ships is compiled by SWC at Next.js's own
build target, which this does not touch.

If a typecheck reports TS2737 (`BigInt literals are not available when targeting lower than ES2020`),
either the target was lowered again or a stale `tsconfig.tsbuildinfo` is replaying old diagnostics:
delete it and re-run. That is not a cosmetic instruction — the first check of this integration failed
on exactly that cached state after the target had already been corrected.

## What Foundation owns, and what it must not own

| Concern | Owner |
| --- | --- |
| Domain rules, authorization, content validation, policy validation, direct-send outcomes | Connect (`modules/connect/src`) |
| EFS request context and publication ownership | Foundation (`src/**`) |
| Presentation, authoring configuration, application composition | Foundation (`src/**`) |
| Concrete mail transport, provider credentials | Foundation adapters, configured by the adopter |

Foundation adapts Connect; it never re-implements it. If a behaviour seems to need a change inside
`modules/connect/src`, that is a Connect release, not a Foundation patch.

## What this directory does not do

It contains no credentials, no provider account, no recipient address and no live delivery
destination. Supplying those is an **adopter activation step**, and until an adopter supplies them the
capabilities report themselves as unavailable rather than pretending to send.

The carried source is distributed under Foundation's Apache-2.0 by a recorded grant from the
copyright holder — see `LICENSE-CONNECT.md` for the instrument, its scope and what it deliberately
does not cover. It contains no credentials, recipient address or live delivery destination of any
kind.
