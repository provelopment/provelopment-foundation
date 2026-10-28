# Deployment Runbook

This runbook takes an **established Foundation Installation** from its own repository to a live
website. It does not create a release, mutate a downstream Installation or reconfigure DNS.

## Terms

- **Product source** — the Foundation Git repository.
- **Immutable release** — a verified platform payload built from an exact Foundation source commit.
- **Installation** — one adopter's autonomous repository containing that release and its authored
  capsule.
- **Deployment** — the provider process that runs an Installation.
- **Reference deployment** — the public demonstration built from the Foundation source repository.

A green source build is not a release. A release is not a deployment. A demonstration deployment
is not a customer Installation.

## Prerequisites

- Admin access to the Installation's GitHub repository.
- A hosting account appropriate to the site's use. Foundation is free/open source; hosting is a
  separate decision. Vercel's Hobby plan is restricted to non-commercial personal use, so a
  commercial website needs a paid plan. Check the provider's current terms.
- Access to the Installation's domain and DNS settings when a custom domain is being attached.
- Node.js 24.x and pnpm 11.6.0 locally for verification.

## Before the first deployment

1. Establish the Installation from an immutable release and its authored seed; do not deploy a
   mixture of a platform checkout and another Installation's capsule.
2. Confirm the Installation's `deployment/efs/manifest.json` declares every Entity, Facet, Site,
   Page, representation and publication binding it intends to serve.
3. Confirm `deployment/spokes.json` declares the Spokes and that every publication names its
   owning Spoke (and Hub when applicable).
4. Confirm every declared representation has a validated source in the EFS capsule.
5. Run the Installation's own gate:

```bash
pnpm install
pnpm assets:check
pnpm exec tsc --noEmit
pnpm lint
pnpm test:deployment
pnpm build
pnpm test:browser:deployment
```

## Publication validation and the build lifecycle

`pnpm build` runs three steps in a fixed order, and the middle one is what makes ownership knowable:

```text
asset synchronization → validated publication projection → Next.js build
```

1. `node scripts/sync-runtime-assets.mjs` materializes the owning Spoke's `public/spokes/**`
   namespace from the assets authored in its capsule.
2. `node scripts/efs/validate-publications.mjs` validates the selected EFS manifest and writes the
   verified publication projection that the request boundary reads.
3. `next build` compiles the application against that projection.

A manifest that is selected but invalid, or selected and missing, is a **loud failure**: the build
stops rather than publishing a deployment whose permissions nobody can state, and any stale
projection from an earlier build is removed so it can never outlive the state it described. Neither
case degrades to legacy hostname authorization — that released host-only rule stands only for a
genuine non-EFS Installation that declares no manifest at all.

`declared` is not `published`. A Spoke declared in `deployment/spokes.json` has a namespace on disk,
but its presentation assets are served only to a caller that an explicit EFS publication **on this
host** names; on a shared host with no publication for a Spoke, both its pages and its presentation
assets are refused.

## Provider setup

1. Import the Installation repository into the provider.
2. Confirm the Next.js build settings:
   - Install command: `pnpm install`
   - Build command: `pnpm build`
3. Configure any optional contact webhook variables:
   - `CONTACT_WEBHOOK_URL` — installation-wide receiver URL, required when
     `features.contact.provider` is `webhook`;
   - `CONTACT_WEBHOOK_TOKEN` — optional bearer token;
   - optional per-Spoke overrides `CONTACT_WEBHOOK_URL__<SPOKE_KEY>` and
     `CONTACT_WEBHOOK_TOKEN__<SPOKE_KEY>` for distinct receivers. Conventional flat ids retain their
     old key; other flat ids use `__ENC_FLAT_…` and identified Hubs always use the injective
     `__ENC_HUB_<HUB_HEX>__<SPOKE_HEX>` form documented in `CUSTOMIZING.md`. An ambiguous legacy key
     is refused.
   They are read at request time and are not required at build time.
4. Attach the authorized custom domains through the provider and DNS owner.
5. Verify the publication manifest's binding hosts match the domains being attached. Canonical
   URLs, alternates, assets and sitemap entries come from the **binding**, not `site.url`.

## Post-deployment verification

Run these checks against the actual public host:

- [ ] Every binding that claims the host is authorized and unambiguous — not necessarily exclusive.
      One hostname may carry more than one Spoke, which is the supported shared-host case, provided
      the bindings' EFS path prefixes do not collide.
- [ ] On a shared host every published Spoke answers its canonical `/<prefix>/<locale>/<route>`, and
      a path that names only a prefix is refused rather than guessed, because the host then names no
      single owner.
- [ ] A duplicate or ambiguous claim, an unknown prefix, a declared-but-unpublished Spoke and an
      unauthored `/` all fail closed: none of them falls back to another Spoke, another Entity or the
      released host-only rule.
- [ ] A bare binding entry redirects to a real localized Home representation.
- [ ] Every public Page returns HTTP 200 at its authored binding URL.
- [ ] A path outside the binding returns 404; it never falls through to another Spoke or Entity.
- [ ] An unlisted representation is directly reachable, sends `robots: noindex, nofollow`, and is
      absent from the sitemap, navigation, `hreflang` and `x-default`.
- [ ] A public sibling representation of the same Page remains discoverable.
- [ ] `sitemap.xml` contains only canonical binding origins and no provider inspection hostname.
- [ ] `robots.txt` points at the canonical binding sitemap.
- [ ] Canonical and Open Graph URLs use the public binding host, not `site.url` or the
      `*.vercel.app` inspection URL.
- [ ] Owner-scoped assets return their correct bytes and content types.
- [ ] The shared shell (when `presentationSiteCode` is declared) renders the owning Spoke's
      dictionaries, navigation, footer, branding and accessibility contract.
- [ ] The contact action reaches the configured receiver for the same owning Spoke, including on an
      EFS-only host absent from the legacy host-routing table.
- [ ] No cross-Entity or cross-Spoke content, dictionary or asset is exposed.
- [ ] Dark mode, responsive layouts and horizontal-overflow checks pass.
- [ ] A malformed JSON Page is refused rather than rendered as generic fallback content.

## Environment variables

No variables are required for a default build. `CONTACT_WEBHOOK_URL` and
`CONTACT_WEBHOOK_TOKEN` configure the optional webhook sender; the additive
`CONTACT_WEBHOOK_URL__<SPOKE_KEY>` / `CONTACT_WEBHOOK_TOKEN__<SPOKE_KEY>` overrides may configure
distinct Spoke receivers; conventional flat ids retain their old key, while other flat ids use
`__ENC_FLAT_…` and identified Hubs always use the injective
`__ENC_HUB_<HUB_HEX>__<SPOKE_HEX>` form documented in `CUSTOMIZING.md`.
An ambiguous legacy key is refused. The receiver is Spoke-owned; two Entities in one Spoke intentionally share
it, and the receiver owns downstream routing/retention. The webhook payload adds an optional
server-derived `origin` (`publicationId`, `bindingId`, `entityId`, `facetId`, optional
`siteId`/`locale`, `host`, `path`) so even a shared receiver can attribute the inquiry to the published
website; it never comes from form data and contains no filesystem path or credential. A webhook
provider without a URL surfaces a configuration error; it never silently falls back to the stub.

Foundation provides same-origin Server Action protection and a honeypot. It does not provide
server-side rate limiting or spam filtering; configure those at the edge or receiver.

## CI gating

The repository's CI classifies changed paths and runs the gate that owns them: documentation
hygiene, deployment acceptance, Foundation acceptance, or the complete shared gate. The source of
truth is `.github/workflows/ci.yml` and `scripts/ci/change-scope.mjs`.

## Rollback

Use the provider's deployment history to promote the previous known-good deployment while a fix is
prepared. A rollback of an **Installation upgrade** is a separate lifecycle operation; it is not
the same as promoting an earlier provider build.

## Reference deployment

The public reference site is built from this Foundation source repository. It demonstrates the
current EFS model; it is not a distribution channel and does not upgrade any Installation.
