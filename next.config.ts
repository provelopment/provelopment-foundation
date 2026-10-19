import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { NextConfig } from "next";

import { deploymentEnvironment, resolveDeploymentForBuild } from "./src/config/deployment-build.mjs";

/**
 * The EFS public host claims are a BUILD projection of the explicit manifest, not a runtime mode.
 * The request boundary only needs to know whether a host belongs to EFS at all; the App Router
 * then resolves the binding and fails closed. An installation without an EFS manifest projects no
 * host, so the existing reference runtime remains exactly as it was.
 */
function efsHostClaims(deploymentRoot: string): string {
  const manifestPath = process.env.FOUNDATION_EFS_MANIFEST ?? join(deploymentRoot, "efs", "manifest.json");
  if (!existsSync(manifestPath)) return "";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      publications?: { bindings?: { host?: unknown }[] }[];
    };
    const hosts = new Set<string>();
    for (const publication of manifest.publications ?? []) {
      for (const binding of publication.bindings ?? []) {
        if (typeof binding.host === "string" && binding.host.trim()) {
          hosts.add(binding.host.trim().toLowerCase());
        }
      }
    }
    return [...hosts].join(",");
  } catch {
    return "";
  }
}

const deployment = resolveDeploymentForBuild();

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
  env: {
    ...deploymentEnvironment(deployment),
    FOUNDATION_EFS_HOSTS: efsHostClaims(deployment.root),
  },
  /**
   * P6-3B — disable the DEVELOPMENT-ONLY Next.js route/dev indicator. It is a
   * fixed-position `nextjs-portal` element pinned to the bottom-left corner of
   * the viewport, where it renders ON TOP of the mobile bottom-bar navigation
   * and swallows pointer events aimed at the bar (the CDP matrix clicks the
   * "More" trigger at its centre). Production never renders it, so this option
   * has no production effect.
   */
  devIndicators: false,
};

export default nextConfig;
