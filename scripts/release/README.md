# Foundation release tooling

This directory owns the **Foundation release mechanism**: how an immutable Foundation release is
constructed from an accepted source revision, what it contains, how its identity and provenance are
recorded, and how a consumer verifies what it received.

It does **not** publish releases. A release identity (a tag) is created only by the release process
outside this directory — this tooling constructs and verifies, and refuses to guess about anything it
cannot prove.

**The release CONTRACT is not owned here (FOUNDATION-B4A-A2).** What an immutable Foundation release *is* —
its identity and naming semantics, its canonical provenance, the manifest format, the content-policy
identity and the manifest's validators — is pure release knowledge and lives in
`src/core/foundation-release/`. This tooling imports it and re-exports it, because `src/core/**` must never
depend on `scripts/**`: the dependency points at the contract, from both sides. What remains here is what
does things: construction, the policy's rules, the digest, Git access, verification, the CLI.

| File | Owns |
| --- | --- |
| `release-content-policy.mjs` | what belongs in a release (machine-authoritative; fails closed on an unclassified path). The policy's IDENTITY is the contract's; the RULES are here |
| `release-construction.mjs` | the construction and verification mechanism (Git objects, one plan, one manifest) |
| `release-digest.mjs` | the normalised content digest and the payload walk |
| `release-identity.mjs` | the tooling's façade onto the identity contract: it re-exports the contract unchanged and owns only "now" (`foundationReleaseIdentityForPublication`) |
| `release-manifest.mjs` | CONSTRUCTING a manifest: the ONE authority behind each derived value. The manifest's schema and validators are the contract's and are re-exported here |
| `index.mjs` | the CLI: `classify`, `build`, `verify` |

## What a Foundation release IS

> A deterministic, platform-only **source set** constructed from one accepted Foundation `main`
> commit, identified by an immutable contract release tag, with source provenance and a normalised
> content digest, and consumable **without** this repository's reference deployment.

Consequences that follow from that sentence:

- **The release never contains another site.** `deployment/**` — the reference deployment's
  configuration, dictionaries, pages, artwork, acceptance suite and baseline record — is excluded, as
  is this repository's own CI and the tests whose subject IS that CI (`.github/**`, `scripts/ci/**`,
  the router's unit and architecture contracts, the writer-inventory guard that names it, and every
  generic test that RESOLVES a path beneath `.github/` — the `.temp` tracking guard reads the required
  `validate` step out of the workflow, so it travels only with the repository that owns the workflow),
  and every generated path (`public/**`, `.next/**`, `node_modules/**`). A deployment adopting a release
  brings **its own** deployment state and its own CI.

  The exclusion is a declared CRITERION, not a list of filenames:
  `scripts/release/release-content-policy.mjs` exports `CI_SUBJECT_TEST_EXCLUSIONS`, and
  `tests/architecture/release-content-boundary.test.ts` checks it in both directions — every declared
  subject is excluded, every declared test is excluded, every declaration is true of its file, and no
  NEW generic test that resolves a `.github/` path may go undeclared. A test keeps its full
  source-repository and CI enforcement; only its inclusion in a release is decided.

  A released file never imports an excluded module: `scripts/release/release-construction.mjs` refuses
  such a release at construction, and `tests/architecture/release-content-boundary.test.ts` runs that
  same check over the whole tracked tree.
- **A materialised release must be able to prove ITSELF.** Its own architecture guards use
  `git ls-files`, so a consumer runs `git init && git add -A` and the suite works with no commit to
  name and no history to copy.
- **The reference deployment stays a bounded compatibility canary.** It is an *input* to canary
  validation, never part of construction, and its files never enter the payload or the digest.
- **A release is cut from a commit, never from a working tree.** See "Determinism" below.
- **`scripts/release/**` travels with the release**, so a consumer can verify what it received using
  the same mechanism that produced it.

## The release content policy

`release-content-policy.mjs` is the **one** authority. Every tracked path of the source revision is
classified as `platform` (in the release) or `excluded` (repository/deployment/build state).

**A path nobody classified stops release construction.** There is no default include and no default
exclude: an unrecognised path is reported by name with the file to edit. This is what keeps a second
deployment, a new top-level tool or a future generated tree from silently entering — or silently
vanishing from — a release.

Rules match **surfaces**, not today's inventory: adding a page, a test, a deployment asset or a
platform module changes no rule, while adding a new top-level directory fails until it is classified.
Order is precedence, which is why `scripts/ci/**` (excluded) is matched before `scripts/**`
(platform). `tests/architecture/release-content-boundary.test.ts` proves the classification against
the repository's real tracked inventory.

## Identity and provenance

```text
canonical identity     release tag  →  source commit  →  source tree
content integrity      content.digest (normalised payload digest) + fileCount
provenance record      source.repository, source.commit, source.tree in the manifest
```

A **mirrored archive** (a future GitHub Release asset, say) is derived distribution: it may be
published *beside* the tag for convenience, and its `.sha256` describes the archive, but it is never a
competing identity. The tag and the commit remain the authority.

The release identity namespace is the contract for what a Foundation release may be **called**, and there
are exactly three classes of tag-shaped name (FOUNDATION-R1C-N1):

```text
historical checkpoint tags    v<YYYY.MM.DD>-foundation-<slug>
                              immutable historical EVIDENCE — not release identities

the first release             v2026.09.30-foundation-release-initial
                              the first immutable Foundation release, GRANDFATHERED: it was published
                              before this convention existed, so it keeps its name forever

every future release          provelopment-foundation-vYYYYMMDD.HHMM
                              the canonical identity of every NEW release
```

`YYYYMMDD.HHMM` is the **UTC release-publication minute** — not the repository machine's local time, not
the operator's timezone, not a deployment's timezone. Seconds are omitted and nothing is appended: no
`Z`, no offset, no counter. The timestamp is validated **semantically**, so an impossible instant
(`…v20260931.1200`, `…v20260930.2460`) is refused rather than merely looking plausible.

The ONE authority is `release-identity.mjs`, and it answers **two different questions**:

| Question | Answer | Who asks it |
| --- | --- | --- |
| `isRecognizedFoundationReleaseIdentity` — does an immutable release exist under this name? | the grandfathered first release, plus canonical identities | a **baseline record**, a manifest, verification |
| `isPublishableFoundationReleaseIdentity` — may a **new** release be published under this name? | canonical identities **only** | publication |

The grandfather is an exact identity, never a reusable pattern: no old-style
(`v<date>-foundation-release-<slug>`) name is recognized, so the previous convention cannot creep back
into a new release.

**The identity is named at the publication boundary** — after construction, the deterministic checks,
the clean room, the bounded canary and every gate, immediately before the irreversible tag step — so the
minute records when the release actually became immutable. `YYYYMMDD.HHMM` is therefore the ACTUAL UTC
publication minute: an identity is never pre-allocated for a minute the clock has not reached, and when
the candidate minute turns out to be occupied, publication moves to the next genuinely available minute —
never to a second identity inside the same minute.

### Same-minute collisions: two layers, one contract (FOUNDATION-R1C-N1-A1)

Two releases that become ready inside the same UTC minute must both be publishable, and neither may
sacrifice the truthfulness of its timestamp. The collision contract has **two layers** and one atomic
authority:

1. **Orchestrated publication (future control plane)** — queued publications are **serialized**. The
   first release takes the current available UTC minute; a later queued release **waits until the next
   available real UTC minute**, re-checks local and remote availability, derives its identity *then*, and
   publishes atomically. A collision inside a minute is resolved by queueing, never by inventing a second
   name for that minute.
2. **Direct / manual publication (low level)** — a direct attempt whose exact canonical identity already
   exists **fails closed**. It never overwrites, force-updates, deletes, recreates, repoints, appends
   seconds or a counter, or silently substitutes another identity. The operator is told, in effect:
   *"Foundation release publication is already in progress for this UTC minute; retry after the next UTC
   minute."* (Exact wording is settled when a publisher exists.)

**The atomic authority is the remote tag.** Two publishers can both observe a minute as free; the
authoritative boundary is the successful creation/push of the immutable remote tag. A publisher that
loses that race must not overwrite the winner: an orchestrated workflow treats it as **busy**, waits for
the next available UTC minute, derives a new canonical identity, re-runs its preconditions and attempts
publication again; a direct workflow reports the collision instead.

**Queueing belongs ABOVE construction, never inside it.** "Delay the release by one minute" is
orchestration semantics — construction, tag creation and verification never `sleep`, block or retry, and
stay deterministic. The queue, scheduler, lock or reservation service is **not implemented in this
directory**: no publisher exists at this layer yet, and R1C-N1-A1 records the policy that the future
publisher must implement.

## The manifest (`foundation-release.json`)

Written inside the constructed release, **last** (so a failed construction leaves no manifest and
cannot be mistaken for a finished release):

```json
{
  "format": 1,
  "release": "provelopment-foundation-v20990101.1200",
  "source": {
    "repository": "https://github.com/provelopment/provelopment-foundation",
    "commit": "<40-character commit SHA>",
    "tree": "<40-character tree SHA>"
  },
  "content": { "policy": "foundation-source-v1", "digest": "sha256:<digest>", "fileCount": 305 },
  "requirements": { "node": "24.x", "pnpm": "11.6.0" },
  "compatibility": { "pageDocumentSchema": 1, "deploymentLayouts": ["capsule", "repository", "override"] }
}
```

Every derived value has **one authority**, and it is extracted from the payload being released — never
restated as a constant in the tooling:

| Manifest value | Authority (inside the release) |
| --- | --- |
| `requirements.node` | `package.json` → `engines.node` |
| `requirements.pnpm` | `package.json` → `packageManager` |
| `compatibility.pageDocumentSchema` | `src/core/page-document.ts` → `PAGE_DOCUMENT_SCHEMA_VERSION` |
| `compatibility.deploymentLayouts` | `src/config/deployment-root.ts` → the `DeploymentLayout` union |
| `content.policy` | `release-content-policy.mjs` → `RELEASE_CONTENT_POLICY_ID` |
| `source.commit` / `source.tree` | the source revision, resolved by Git |
| `content.digest` / `content.fileCount` | the payload, digested (`release-digest.mjs`) |

If an authority changes shape, construction **fails** naming the file and the expected pattern: a
release that cannot state its compatibility truthfully is not produced. Nothing in the manifest is a
timestamp, an environment value or a build-machine fact, so two constructions are identical.

## The normalised content digest

```text
header    "release-content-v1 <policyId> manifest-format:<n>\n"
record    "<path>\0<sha256 of the file's exact bytes>\n"      one per payload file
order     paths sorted BYTE-WISE (locale-independent)
```

The digest covers the **payload only**: `foundation-release.json` (and any future `.sha256` sidecar) is
excluded by construction, which is what makes the manifest non-self-referential — it records the digest
of the content it describes without the digest depending on the file that carries it. The delimiters are
unambiguous: NUL cannot appear in a path, and a path containing a line break is refused outright rather
than encoded.

**No file-mode metadata.** Every tracked entry in this platform is mode `100644` (the policy refuses any
no symlinks, no executables), so mode carries no meaning here and is deliberately not invented into the
digest. Construction refuses a revision that introduces a link, an executable or a submodule, naming the
path, instead of silently releasing a file whose meaning depends on metadata nobody recorded.

## Determinism — and why the bytes come from Git, not from the working tree

`build` reads `<commit>:<path>` **Git objects**, in one `git cat-file --batch` process for the whole
payload. It never copies the working tree, which matters concretely rather than theoretically: on a
Windows checkout whose Git configuration converts line endings, tracked files exist on disk with CRLF
where the committed blob has LF, so a tree-copy builder would produce a machine-dependent release. It
also means a dirty, generated or ignored working tree cannot contaminate a release at all — an untracked
file, a modified file and an ignored `public/assets/**` probe are proved harmless in
`tests/unit/release-construction.test.ts`.

The remaining determinism comes from fixed ordering (byte-wise sorted paths), a manifest with no
timestamp, and a digest over paths + exact bytes. Two constructions of the same commit into two empty
destinations must be identical in file set, bytes, digest and manifest.

## Using the tooling

```bash
# What would a release contain? (also the fail-closed inventory check)
pnpm release:classify
pnpm release:classify -- --source 63656c23b6f0d1ba79398f4886a45a6d9168754f

# Construct a release into an EMPTY destination — this publishes nothing
pnpm release:build -- --release provelopment-foundation-v20990101.1200 \
                     --source 63656c23b6f0d1ba79398f4886a45a6d9168754f \
                     --dest /tmp/foundation-release-a
pnpm release:build -- ... --dest /tmp/foundation-release-b     # then compare the two digests

# Verify — without Git history, or against the source repository
pnpm release:verify -- --payload /tmp/foundation-release-a
pnpm release:verify -- --payload /tmp/foundation-release-a --source-repository . --expect-tag
```

`--source` must be a **full 40-character commit SHA**: a release is cut from a named source commit, so a
branch name is never a release input. `--expect-tag` additionally requires the release identity to
resolve to the recorded commit — the check the release process (R1C) makes before anyone adopts it.

### Procedure

1. **Source** — the revision is an accepted `main` commit and its gate is green.
2. **Classify** — `release:classify` reports `unclassified: 0` for that revision.
3. **Construct twice** — two empty destinations, same commit, same identity; digests and manifests must
   be identical.
4. **Verify** — `release:verify --source-repository .` proves the payload is exactly the policy's plan
   for the recorded commit.
5. **Clean room** — materialise the payload as its own Git work tree and validate it there with a
   *synthetic* deployment (see below).
6. **Publish (R1C, not this tooling)** — name the canonical identity from the **actual** UTC publication
   minute at the final boundary, then create the annotated tag, then optionally mirror a deterministic
   archive + `.sha256` beside it. A published release is never repointed or replaced; a collision is
   resolved by queueing (orchestrated publication) or by failing closed (direct publication), never by
   adjusting the identity (see "Same-minute collisions" above).

## Consuming a release

- Install with `pnpm install --frozen-lockfile` (Node 24.x, pnpm 11.6.0). The `postinstall` asset step is
  tolerant when no deployment is installed, so a bare extraction installs cleanly.
- The release contains **no deployment**. Point the platform at your own deployment root — a capsule at
  `deployment/` (the supported layout) or your repository root. With no deployment selected the build
  **fails loudly** rather than serving a different site; that contract is unchanged and deliberate.
- Two architecture guards in the generic test tree use `git ls-files`, so a materialised release must be
  a **Git work tree**: run `git init && git add -A` inside it. Never copy this repository's `.git`. **No
  commit is needed**: the suite's own self-proof re-constructs the release from that work tree's INDEX
  and takes the source identity from the carried `foundation-release.json`
  (`constructReleaseFromWorkTree`), so nothing depends on inherited history — and a release whose content
  no longer matches its manifest is refused, with both digests named.
- Generated state is output, not release content: `pnpm assets:sync` creates `public/assets/**` from the
  selected deployment's sources and `pnpm assets:check` proves it byte-identical.
- A deployment's own acceptance suite runs from its own capsule; a release proves the **generic**
  contracts plus one bounded canary, and never enumerates other deployments.
