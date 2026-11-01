import { createPageSources } from "@/adapters/content/page-sources";
import { siteConfig } from "@/config";
import { deploymentPaths } from "@/config/deployment-root";
import { getDictionary } from "@/config/i18n";
import { createRuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";

/**
 * THE COMPATIBILITY SPOKE FACTS, FOR TESTS (FOUNDATION-MULTISITE-M13)
 * ====================================================================
 *
 * Before M13 the chrome components read the module-global Spoke authority (`@/config`'s `siteConfig`,
 * `@/config/i18n`'s `getDictionary`, `@/config/assets`' compatibility resolver). They now take those facts
 * as INPUTS, so a test that is not about multi-Spoke behaviour asks the SAME compatibility bindings for
 * them instead of letting a component reach for a global. That keeps every existing rendering expectation
 * meaningful (the values are identical to what the component used to read) while making the boundary
 * explicit — and it is exactly the shape `server-composition` uses for a real context.
 *
 * A test that IS about context isolation passes an explicit `SpokeRuntimeContext` instead (see
 * `tests/unit/server-composition-context.test.ts`).
 */

/** The compatibility runtime namespaces (`deploymentPaths()`), as one resolver instance. */
export const compatibilityAssets = createRuntimeAssetOwnershipResolver(
  deploymentPaths().runtimeAssetNamespaces,
);

/** The compatibility dictionary binding (`@/config/i18n`'s `getDictionary`) behind the access shape. */
export const compatibilityDictionaries: RuntimeDictionaryAccess = {
  get: (locale, siteCode) => getDictionary(locale, siteCode),
  /**
   * Chrome ALWAYS renders: the compatibility binding's accepted contract is "the requested locale,
   * else the deployment default", so whatever `get` answers is the applicable answer here. The
   * applicability question exists only for a consumer that publishes a fact in the representation's
   * own language (`GEO-02-R03` B), and no chrome consumer asks it.
   */
  applicable: () => true,
};

/** The context-bound inputs `SiteHeader`/`SiteFooter`/`BusinessInfo`/dedicated pages take (no `routes`). */
export function compatibilityChrome() {
  return {
    siteConfig,
    dictionaryAccess: compatibilityDictionaries,
    assets: compatibilityAssets,
  };
}

/** …plus the context-bound page composition `SiteFooter` takes for legal-document existence. */
export function compatibilityFooterChrome() {
  return {
    ...compatibilityChrome(),
    routes: createPageSources({ sites: siteConfig.sites }),
  };
}
