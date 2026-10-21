# EFS S3-E1 integrated candidate (disposable evidence)

> **HISTORICAL CHECKPOINT.** The candidate described here was later completed and merged through
> `S3-E3` R01–R07 at Foundation `main` `19d9195`. The "preliminary, unreleased, unmerged" status below
> describes that checkpoint, not current state. Current behaviour is the merged source/tests; current
> governance is the root workspace's `ACTIVE-WORK.md` and the `FOUNDATION-COMPLETE-A1`/`A1-R1` reports.

**Status:** preliminary, unreleased, unmerged. This branch is **not** an implementation-release candidate and must not be
deployed, merged or treated as `D21` evidence. It exists to prove the owner-accepted integrated S2 target in real Foundation
candidate code with synthetic data.

## What is here

| Path | Purpose |
| --- | --- |
| `src/core/efs/identity.ts` | `e_` + 26-character Crockford EntityID; explicit refusal, no derivation |
| `src/core/efs/properties.ts` | one owner-scoped atomic-key cascade; inherit / `null` suppress / atomic replacement / provenance / private-by-default |
| `src/core/efs/locales.ts` | BCP 47 canonical tags and lowercase path keys; explicit-locale precedence; truthful same-Page fallback |
| `src/core/efs/publication.ts` | explicit host/prefix binding matching; site-closed/open suffixes; canonical/asset URLs from the binding only |
| `src/core/efs/discovery.ts` | sitemap entries only for public, existing representations under one binding |
| `src/config/efs/manifest.ts` | explicit Entity/Facet/Site/Page/representation/publication declarations and fail-closed validation |
| `src/adapters/content/efs-content.ts` | owner-scoped JSON/Markdown source and dictionary reads; JSON precedence; traversal refusal |
| `tests/fixtures/efs/**` | synthetic two-Entity capsule and manifest; no released fixture conversion |
| `tests/architecture/efs-identity-cascade-contract.test.ts`, `tests/unit/efs-*.test.ts`, `tests/integration/efs-candidate.test.ts` | E1 evidence |

## Commands

```bash
pnpm exec vitest run --project foundation tests/architecture/efs-identity-cascade-contract.test.ts \
  tests/unit/efs-localization.test.ts tests/unit/efs-publication.test.ts tests/integration/efs-candidate.test.ts
pnpm exec tsc --noEmit
pnpm lint
```

## Explicit E1 limits

- The candidate is **not wired into the released Next.js request path**. It proves the contracts and synthetic I/O boundaries;
  full route/render integration, exported/imported capsules, templates, coherence and the released fixture conversion belong to
  **E3/CP-8a** under separate authorization.
- `openingHours` is authored display data only. No open-now, timezone, DST, holiday or booking computation is implemented.
- No DNS, provider, deployment, release, Web 1, adopter or Dashboard work is performed.
- The full 18-use-case and 40-row preservation evidence is **not** claimed here. `D21` is **NOT PASSED**.
