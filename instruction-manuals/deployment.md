# Deployment — taking a validated site live

> **Manual system:** Provelopment Foundation Instruction Manuals
> **Manual revision:** `2026-09-17.1`
> **Procedure validated against:** `main` @ `ccc29a5` (runtime commit `1114759`)
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
- **The provider project must already exist and be connected to the repository.** A
  provider that builds from Git does **not** create a project by itself: the project, its
  repository connection, its production branch and its domains are set up once, in the provider
  account. Verify this before planning a deployment rather than assuming a push will deploy.
  A coding-agent environment typically holds **no provider credentials** — check
  (`vercel whoami`, or the equivalent) and, if unauthenticated, treat the whole step as an
  owner action (`troubleshooting.md` entry 8). A site whose project has not been created is
  simply **not live**; nothing is broken by that, but it must be reported as pending, never as
  deployed.

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

## Domain and DNS (owner action)

Before proposing any DNS change, **read the zone first** — DNS is shared with email and other
services.

1. Find the authoritative nameservers and the current records for the apex and the intended
   `www` host (`Resolve-DnsName <host> -Type A/CNAME/NS/MX/TXT`).
2. Look at how **existing** hosts in the same zone are wired and follow that convention (for
   example sibling subdomains pointing at `<hash>.vercel-dns-017.com`); do not invent a new
   pattern.
3. Propose **only** the records the site needs. **Never modify MX, SPF/DKIM/DMARC or any other
   mail record** as part of a website deployment.
4. Publish **one canonical hostname**. If the convention is apex → `www`, the apex must
   **redirect** to the canonical host rather than serve a second canonical URL; the configured
   `site.url` must be the canonical form exactly.
5. An apex that already resolves to the provider but returns `DEPLOYMENT_NOT_FOUND` means the
   domain is pointed at the provider with **no deployment behind it** — that is a missing
   provider project, not a DNS defect.
6. Never guess a DNS value. Take the exact target from the provider's domain screen and hand it
   over; report the exact blocker if you lack access.

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

> **Verify the canonical host, never the raw deployment URL.** A provider that protects
> non-production deployments (Vercel's deployment protection, and equivalents) serves a **login page
> with HTTP 200** from the `*.vercel.app` / deployment-specific URL. A status-code-only check
> against that URL is green and proves **nothing**. Always check the **canonical production
> hostname** and inspect the rendered content: `<title>`, the canonical link, `og:site_name`, the
> favicon, and the header/footer identity. Also re-check the apex → canonical redirect and confirm
> mail records (MX/TXT) are intact.

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
