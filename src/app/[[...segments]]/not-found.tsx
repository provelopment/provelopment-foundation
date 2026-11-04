import Link from "next/link";
import { segments } from "next/root-params";

import { runtimeContextForCurrentRequest } from "@/config/spoke-request";
import { dictionaryAccessForRuntimeContext } from "@/config/runtime-dictionaries";
import { resolvePathContext, sitePath, siteSetOf } from "@/core/site";
import { StatusGraphic } from "@/components/site/status-graphic";
import { Section } from "@/components/ui/section";

/**
 * The 404 status page.
 *
 * S1 — the status page is SITE-SCOPED like every other URL: the root params name the site
 * scope, so the copy is the locale's dictionary and the "return home" link is the CURRENT
 * site's home (a bare `/` would negotiate from scratch and could land on another site's URLs).
 *
 * R10 — that determinism is now conditional on the path having GENUINELY resolved. On the EFS surface an
 * invalid Page request must not acquire an invented Site, locale or Home link, so an unresolved path renders
 * the copy and NO link at all.
 *
 * M17 — THE BOUNDARY RULE APPLIES HERE TOO. Next hands this route no props, so it takes the Spoke the
 * REQUEST selected (the boundary's exact hostname claim, carried on a private upstream header) and reads the
 * configuration, the path context and the dictionary from THAT context. No module-global Spoke authority is
 * involved, and no other Spoke can answer.
 */
export default async function NotFound() {
  const path = await segments();
  // A not-found surface is reached from inside the public route tree, so a selection exists — and if it does
  // not, failing loudly is the only honest answer: never another Spoke's dictionary.
  const context = await runtimeContextForCurrentRequest();
  if (context === null) {
    throw new Error(
      "FOUNDATION-MULTISITE-M17: no Spoke answers this request, so no not-found surface can be composed.",
    );
  }
  const siteConfig = context.siteConfig;
  const pathname = `/${(path ?? []).join("/")}`;
  const siteSet = siteSetOf(siteConfig.sites, siteConfig.defaultSite);
  // R10 — NO INVENTED SITE, LOCALE OR HOME. `pathContextOr` fabricates a default-Site context for ANY
  // unresolved path, so an invalid EFS Page request was silently handed a Site, a locale and a Home link it
  // never resolved to. `resolvePathContext` answers only what the request actually matched, and `null` is a
  // real answer: nothing resolved, so NO destination is composed. This surface deliberately does NOT re-enter
  // the EFS request resolver — a throwing resolver here would replace a 404 with a 500.
  const resolved = resolvePathContext(siteSet, siteConfig.pageBindings, pathname);
  // Copy still has to come from somewhere, and it is copy only — never a destination. The Spoke's default
  // locale supplies the strings; `homeHref` below is the only thing that could point anywhere, and it does not
  // exist unless the request genuinely resolved.
  const dictionary = dictionaryAccessForRuntimeContext(context).get(
    resolved?.localePath ?? siteConfig.defaultSite.defaultLocale,
    resolved?.site.code ?? siteConfig.defaultSite.code,
  );
  const homeHref = resolved === null ? null : sitePath(resolved.site, resolved.localePath);

  return (
    <Section className="py-24 text-center">
      {/* P12-SG — optional decorative status graphic (ONE role shared with
          `error.tsx`, which renders this identical status frame). Renders
          NOTHING when unconfigured, so the heading/message/link below remain the
          complete expression of the state. */}
      <StatusGraphic />
      <h1 className="text-4xl font-bold tracking-tight">
        {dictionary.notFound.title}
      </h1>
      <p className="mt-4 text-muted-foreground">{dictionary.notFound.message}</p>
      {homeHref === null ? null : (
        <p className="mt-6">
          <Link href={homeHref} className="font-medium text-primary hover:underline">
            {dictionary.notFound.returnHome}
          </Link>
        </p>
      )}
    </Section>
  );
}