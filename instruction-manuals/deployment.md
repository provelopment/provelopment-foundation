# Deployment — taking a validated site live

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-16.3`
> **Procedure validated against:** `main` @ `dae07b4` (runtime commit `1114759`)
> **Adopter baseline:** per adopter — recorded in that project's `platform/SOURCE.md`
> **Master authority:** Provelopment root project — `.project/deployment-info/instruction-manuals/`
>
> This copy is **distributed**. It is byte-identical to the master. Edit the master
> upstream and propagate; never edit a distributed copy in place.

## Workflow

```text
validated repository
    → commit / merge to the deploy branch
    → deployment provider builds from the repository
    → custom domain (DNS → provider)
    → live QA
```

The full step-by-step runbook (provider setup, DNS records, screenshots, recorded
worked examples) lives in the project's own deployment guide. This manual is the
**workflow and the critical checks**; use the runbook for the click-by-click path.

## Preconditions

- The full validation gate is green (`validation.md`). **Never deploy an unvalidated
  build.**
- The repository is clean and the deploy branch is the intended one.
- The site's configured canonical URL matches the domain you are about to serve.
- **The commit that triggers the deployment is authored by an identity the deployment
  platform accepts.** Where a platform (Vercel, and others) builds from Git, a commit authored
  by someone who is not a member of the platform account can be **blocked** instead of built.
  A blocked deployment is neither built nor reported as a build failure — the site simply keeps
  serving the previous release, so a green validation gate can coexist with an unchanged
  production site. Commit under the project's established identity
  (`troubleshooting.md` entry 7).
- Deployment configuration is normally an **owner action**: prepare the exact
  proposed change (provider project, root directory, domain, DNS record) and hand
  it over rather than improvising infrastructure.

## Critical checks before going live

| Check | Why it matters |
| --- | --- |
| **Configured `site.url`** | Drives canonical, OpenGraph, sitemap, robots and hreflang. Wrong ⇒ wrong URLs published everywhere. |
| **Configured URL == live hostname** | A mismatch is invisible locally and only shows up in production. **The configured canonical URL and the actual production hostname must agree.** |
| **Expected routes return 200** | Home, offerings, any business-specific pages, contact, legal. |
| **Assets are served (200)** | Logo, favicon, imagery, banners. |
| **HTTPS is active** | Valid certificate on the apex/`www` form you publish. |
| **Favicon and metadata** | Tab icon correct; titles/descriptions/social art correct. |
| **CTA present and correctly placed** | Once, reachable, in the top region — not inside navigation. |
| **Responsive behaviour** | Mobile, tablet and desktop all render correctly. |
| **No horizontal overflow** | Including long-content cases (emails, labels). |

## Live QA

Run the project's live verification (a production QA script against the live origin,
catching exactly the class of defect local checks cannot). At minimum spot-check:

```bash
# expected shape — use the project's own script names/URLs
node tests/browser/live-qa.mjs https://<live-host> --site <site>
node tests/browser/footer-audit.mjs https://<live-host>
```

Then confirm by hand: canonical host in the page head equals the live host, the
sitemap uses the live host, and the favicon loads.

## Rollback

1. **Traffic-level (fastest):** promote the previous known-good deployment to
   production in the provider dashboard.
2. **Source-level:** revert the offending commit on a fix branch, validate, merge,
   redeploy.
3. Never rewrite shared history or force-push to fix a bad deploy.

Every production deployment should correspond to a tagged, durable source commit so
a rollback always has a trustworthy anchor.

## After deployment

- Record the deployment in the project's history/changelog.
- If the deploy needed a config change (typically the canonical URL), update the
  project's documentation in the same task.
- If anything about the deployment was unclear or manual, capture it in the
  project's knowledge/troubleshooting record so the next deployment is cheaper.
