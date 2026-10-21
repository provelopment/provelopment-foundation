/**
 * THE FOUNDATION GENERIC TEST IDENTITY (FOUNDATION-DEPLOYMENT-ISO-H2)
 * ==================================================================
 *
 * Every test in the generic tree (`tests/**`, the `foundation` Vitest project) runs for a SYNTHETIC,
 * test-owned deployment — and it does so through the ORDINARY mechanism, not through a mock:
 *
 *     the synthetic deployment is placed in CAPSULE-OVERRIDE position (`FOUNDATION_DEPLOYMENT_ROOT`)
 *     and the run therefore describes it in `@/config` (its `siteConfig`) AND in
 *     `@/config/deployment-root` (its `deploymentPaths()`), exactly as a build would for a real one.
 *
 * Why the whole identity and not just `siteConfig` (the ISO-B1C lesson): substituting only the
 * configuration left generic tests reading the REAL deployment's filesystem — `deploymentPaths()`
 * still answered with the installed deployment's paths, so a test could assert synthetic branding
 * while plant-and-read fixtures inside the shipped `content/**`. A generic contract must never depend
 * on which real deployment happens to be installed (ISO-B2B proved the cost: eleven suites broke when
 * the reference deployment moved). One selection, one authority, one identity.
 *
 * Consequence, and the point of the exercise: this project can run with NO real deployment present at
 * all — no root `site.config.json`, no `config/i18n/**`, no `content/**`, no capsule — because nothing
 * in the generic suite resolves a real one.
 *
 * The synthetic deployment itself lives in `tests/support/synthetic-deployment.ts` (config + fixture
 * tree) and is materialised into a temporary directory OWNED BY THIS TEST-FILE CONTEXT, so a generic test
 * may read and WRITE deployment-owned state without touching any committed deployment — and that context
 * REMOVES the copy when its file finishes (see the teardown below), so a run leaves nothing in OS temp.
 */
import { afterAll } from "vitest";

import { deploymentPaths } from "@/config/deployment-root";

import { LEGACY_TEST_RUNTIME_ENV } from "@/app/[[...segments]]/legacy-test-runtime";
import {
  cleanupSyntheticDeployment,
  selectSyntheticDeployment,
} from "../support/synthetic-deployment-root";

// The generic suite describes a synthetic, LEGACY-authored deployment. The released Page/locale
// resolver is retained only as this isolated test utility; production has one EFS runtime. The gate
// itself refuses `NODE_ENV=production`, so this can never become a production switch.
process.env[LEGACY_TEST_RUNTIME_ENV] = "1";

const synthetic = selectSyntheticDeployment();

// THE CONTEXT THAT MATERIALISED THE COPY REMOVES IT (ISO-B3C2B-A1).
//
// A setup file runs once per test file, so the copy selected above belongs to exactly this file's context,
// and `afterAll` is that context's teardown: Vitest runs it however the file's tests ended. It is
// registered HERE — before the verification below, which may throw — so a file that fails at setup still
// gives its copy back.
//
// It replaces the `process.on("exit")` hook the copy used to rely on, which never ran: Vitest terminates
// its workers without executing exit handlers, so every generic test file left a complete deployment copy
// in OS temp (deterministic; 91 directories per full run). The removal is exact — the one root this
// context created — and never a search of OS temp.
afterAll(() => {
  cleanupSyntheticDeployment();
});

// Fail LOUDLY if the synthetic deployment is not the one the authority answers with: a generic test
// that silently received the real deployment would be exactly the coupling this project exists to
// prevent — and it would pass while doing it.
const resolved = deploymentPaths();
if (resolved.layout !== "override" || resolved.root !== synthetic.root) {
  throw new Error(
    "FOUNDATION-DEPLOYMENT-ISO-H2: the generic test project did not select the synthetic deployment " +
      `(got layout "${resolved.layout}" at "${resolved.root}", expected the override root ` +
      `"${synthetic.root}"). A generic test may never see the installed deployment.`,
  );
}
