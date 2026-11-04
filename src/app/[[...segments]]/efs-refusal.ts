/**
 * THE CONTROLLED MISSING-INSTALLATION REFUSAL (`C07`)
 * ===================================================
 *
 * There is ONE request runtime in every environment: an explicit EFS declaration. A request that
 * reaches a Next entrypoint without one receives this controlled diagnostic; there is no second
 * resolver to fall back to, no environment switch to enable one, and no `NODE_ENV` in which an
 * undeclared Installation silently serves something else.
 *
 * The message is deliberately actionable: it names the two declarations the Installation must carry.
 */
export function missingEfsInstallation(): never {
  throw new Error(
    "FOUNDATION-EFS-S3E3-R05: this Installation declares no EFS manifest. A production request " +
      "cannot fall back to the retired Page/locale resolver; establish or convert the Installation so " +
      "it carries spokes.json and efs/manifest.json.",
  );
}
