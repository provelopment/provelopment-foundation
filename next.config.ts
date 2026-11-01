import type { NextConfig } from "next";

import path from "node:path";

import { deploymentEnvironment, resolveDeploymentForBuild } from "./src/config/deployment-build.mjs";

/**
 * THE DEPLOYMENT ROOT, RESOLVED BY THE BUILD (FOUNDATION-DEPLOYMENT-ISO-B1C)
 * ========================================================================
 *
 * The build is the ONE place that may look at the filesystem to decide where a deployment lives, and
 * it INLINES the answer (`env`) so runtime code stays static and client-safe
 * (`src/config/deployment-root.ts` explains why: `siteConfig` is imported by client components, so
 * neither `node:fs` nor `process.cwd()` may appear there).
 *
 * Every layout is resolved the same way — capsule, override or the CURRENT repository layout — which
 * is what makes the deployment movable: no application module statically imports
 * `<repo>/site.config.json`, so B2 can move that file into a capsule without touching application
 * code or breaking module/build resolution.
 */
const nextConfig: NextConfig = {
  env: deploymentEnvironment(resolveDeploymentForBuild()),
  /**
   * P6-3B — disable the DEVELOPMENT-ONLY Next.js route/dev indicator. It is a
   * fixed-position `nextjs-portal` element pinned to the bottom-left corner of
   * the viewport, where it renders ON TOP of the mobile bottom-bar navigation
   * and swallows pointer events aimed at the bar (the CDP matrix clicks the
   * "More" trigger at its centre). Production never renders it, so this option
   * has no production effect.
   */
  devIndicators: false,
  /**
   * THE VISITOR'S OWN REQUEST TARGET REACHES THE BOUNDARY (`D40` Decision B, `R04-C34`)
   * ==============================================================================
   *
   * A casing redirect must carry the visitor's ORIGINAL query text — every percent-escape spelling, the
   * order of keys, repeated keys, a literal `+`, a bare key and even an empty `?` — byte for byte.
   * `src/proxy.ts` already forwards that text from `request.url` (`rawQueryOf`), but by default Next.js does
   * not hand the proxy the request it received: it REBUILDS the middleware URL from the parsed query
   * through `URLSearchParams` (`runMiddleware`, `next-server.js`), which decodes and re-serialises it.
   * Measured in both `next dev` and `next start` before this option — `?c=a%20b` arrived as `?c=a+b`, `?x`
   * as `?x=`, a bare `?` vanished, `%2f` became `%2F` and `%41` became `A`.
   *
   * `skipProxyUrlNormalize` is the platform's own control for exactly this: the proxy is handed the
   * request's `initURL` — the unmodified request target — instead of the rebuilt one. It changes the URL
   * STRING given to middleware/proxy only. Routing, the matcher below, trailing-slash handling,
   * RSC/flight dispatch, the App Router and every response this application builds were re-measured
   * unchanged with it enabled, so the visitor's bytes reach the boundary and the ONE `308` carries them.
   */
  skipProxyUrlNormalize: true,
  /**
   * THE PINNED MODULE'S NODENEXT SPECIFIERS (FOUNDATION-RELEASE-CANDIDATE-A1)
   * =======================================================================
   *
   * `modules/connect/src/**` is the released Connect source carried byte-for-byte (Git subtree
   * `a0f1f14a…`, proven by `pnpm connect:verify`). It is authored for Node ESM, so its relative imports
   * use an explicit `.js` extension — the emitted name of a file that ships as `.ts`. TypeScript and Vite
   * map that; Turbopack has no extension-aliasing option, so the build must be taught the mapping.
   *
   * One rule, scoped to that ONE tree, applies a two-expression build-time rewrite to the extensionless
   * form Turbopack already resolves (see `scripts/connect/nodenext-specifier-adapter.cjs`). No other file
   * is touched, no artifact is generated, and the source bytes on disk are unchanged — so `next dev` and
   * `next build` resolve the Module identically, and the integration needs no second bundler.
   */
  turbopack: {
    rules: {
      "./modules/connect/src/**/*.ts": {
        loaders: [
          {
            loader: path.resolve(process.cwd(), "scripts/connect/nodenext-specifier-adapter.cjs"),
          },
        ],
      },
    },
  },
};

export default nextConfig;
