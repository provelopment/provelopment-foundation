/**
 * THE ISOLATED LEGACY TEST UTILITY (`S3-E3-R05`)
 * ==============================================
 *
 * The production request path has ONE runtime: explicit EFS. The released Page/locale resolver
 * remains available to the repository's own generic acceptance suites because those suites describe
 * a synthetic authored deployment rather than an EFS Installation.
 *
 * This module is the ONLY switch that may select that utility, and it is deliberately impossible in
 * production: the environment variable must be `1` AND `NODE_ENV` must not be `production`. The
 * browser harness sets it only for its disposable synthetic server; the Vitest setup sets it for the
 * generic/deployment authoring suites. No deployment can activate it by accident.
 */
export const LEGACY_TEST_RUNTIME_ENV = "FOUNDATION_ENABLE_LEGACY_TEST_RUNTIME";

/** Whether the isolated released-runtime test utility may answer this request. */
export function legacyTestRuntimeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env[LEGACY_TEST_RUNTIME_ENV] === "1";
}

/** The controlled diagnostic a production installation without EFS configuration receives. */
export function missingEfsInstallation(): never {
  throw new Error(
    "FOUNDATION-EFS-S3E3-R05: this Installation declares no EFS manifest. A production request " +
      "cannot fall back to the retired Page/locale resolver; establish or convert the Installation so " +
      "it carries spokes.json and efs/manifest.json.",
  );
}
