---
title: About
---

## About the Provelopment Foundation

The **Provelopment Foundation** is an open website foundation for small
businesses — a production-grade, configurable template that provides the
starting point for a complete multilingual website.

This site is both the Foundation's own home page and its living
demonstration: everything you see here is produced by the Foundation itself,
from configuration, Markdown content, and shared building blocks.

The Foundation is intentionally a **display and demonstration shell**. It
shows what the template makes possible without pretending to operate a real
business: contact forms, booking actions, and connection options are
configurable placeholders that a real deployment replaces with its own.

## What the Foundation provides

The capabilities demonstrated on this site:

- **Configuration-first identity and structure** — `site.config.json` defines
  the site name, URL, contact channels, navigation, feature toggles, legal
  documents, and UI composition. Ordinary customization happens here, not in
  code.
- **Multilingual content** — interface strings live in locale dictionaries
  (`config/i18n/<locale>.json`); page text lives in Markdown under
  `content/`. A missing translation falls back to the default locale.
- **Content collections** — pages, offerings, portfolio items, blog posts,
  testimonials, and legal documents are all Markdown-driven collections,
  statically generated at build time.
- **Configurable capability seams** — contact inquiries (webhook or demo
  stub), booking actions, map directions, and analytics are provider-neutral
  adapters, enabled and disabled through `features` in `site.config.json`.
- **Search-ready by default** — canonical URLs, hreflang alternates,
  structured data, a dynamic sitemap, and robots output are generated from
  the configured content.
- **Accessible and responsive** — shared UI primitives, focus-visible
  handling, modal/drawer behavior, and responsive shell navigation.
- **RSS** — the blog publishes a localized RSS feed (`/blog/rss.xml`).

## Why it exists

Most small-business websites repeat the same hard work: multilingual
routing, responsive navigation, search optimization, contact handling,
accessibility, and a clean visual system. The Foundation packages that work
into one reusable template so a new site starts from a proven base instead
of a blank page — and so ordinary customization never requires editing
platform code.

## How it can be configured

A downstream site customizes the Foundation through documented, user-owned
surfaces:

- **JSON configuration** — `site.config.json` (identity, navigation, features,
  UI composition) and locale dictionaries in `config/i18n/`.
- **Markdown content** — pages, offerings, portfolio, blog posts,
  testimonials, and legal documents under `content/`.
- **Assets** — logos, images, icons, and favicon under `public/`.
- **User customization files** — site-owned files that survive Foundation
  engine updates.

The goal: most ordinary website customization requires changing these files,
never the Foundation's driving code.

## How the presentation works

The Foundation presents one canonical composition — a collapsible sidebar on
desktop, a collapsed icon rail on tablet, and bottom navigation on mobile — and
the visual intent (typography, rhythm, surface, header, hero) is configuration,
not code. Every dimension is an optional leaf in the `ui` block of
`site.config.json`, drawn from a closed vocabulary, so a deployment can adjust
the composition and the look while the underlying content stays the same. There
is no presentation selector on the site: location and language are the only
visitor-facing selectors.

## How this site relates to Provelopment.com

The Provelopment Foundation is the template and demonstration base.
**Provelopment.com** is the eventual operational parent/business site, where
real operational contacts and services are established. This site — the
Foundation reference site — remains the canonical demonstration and
reference implementation of the template.
