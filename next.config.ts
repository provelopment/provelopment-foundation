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
