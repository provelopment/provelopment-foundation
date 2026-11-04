/**
 * THE ONE SHARED-SHELL DOCUMENT BOUNDARY (FOUNDATION-GEO-04 Stage B R10)
 * =====================================================================
 *
 * This module owns the document. Exactly one tree renders `<html>`, `<body>`, the pre-paint sidebar
 * bridge, the skip link, the decorative layers, the shared `ShellEngine`, the status/error providers and
 * the analytics/JSON-LD tail — and BOTH entrypoints render through it. There is no second copy of this
 * markup anywhere in the repository, so the two surfaces cannot drift in landmarks, accessibility
 * contracts or presentation.
 *
 * WHAT IS SHARED (identical for both modes, by construction — same code, not a re-implementation):
 * skip link, `PageBackground`, `PageBanner`, the sidebar bridge and its ONE hydration tolerance,
 * `SidebarPreferenceBoot`, `ErrorMessagesProvider` + `StatusGraphicProvider`, `ShellEngine` and every
 * presentation fact it receives (resolved UI, sidebar labels/controls, banner/background/status maps,
 * structured data, analytics).
 *
 * WHAT IS MODE-SPECIFIC — and only this:
 *
 *   | mode     | routing transport                    | bar destinations                  |
 *   | -------- | ------------------------------------ | --------------------------------- |
 *   | `legacy` | `ClientRoutingProvider`, `pageBindings`, `siteSet` | resolved regionally |
 *   | `efs`    | NONE — omitted, not stubbed          | the publication's verified items  |
 *
 * The `efs` mode omits the routing transport and the geographic inputs entirely rather than passing empty
 * placeholders, so nothing downstream can resolve an EFS address from a page binding or a Site set. The
 * EFS addresses were already proved against the publication by the caller, and the bar receives them
 * ready-made. `mode` is a compile-time discriminant and a runtime invariant (`routing` is required in
 * `legacy` and absent in `efs`), so a caller cannot half-wire a mode.
 */
import type { ComponentProps, CSSProperties, ReactNode } from "react";

import { PageBackground } from "@/components/site/page-background";
import { PageBanner } from "@/components/site/page-banner";
import { ClientRoutingProvider } from "@/components/site/client-routing-context";
import type { ClientRoutingContext } from "@/components/site/client-routing";
import { ErrorMessagesProvider } from "@/components/site/error-messages-context";
import { StatusGraphicProvider } from "@/components/site/status-graphic-context";
import { ShellEngine } from "@/components/shell";
import { SidebarPreferenceBoot } from "@/components/ui/sidebar-preference-boot";
import type { SiteSet } from "@/core/site";
import type { ResolvedUiConfig } from "@/core/ui";

type BannerMap = ComponentProps<typeof PageBanner>["banners"];
type BackgroundMap = ComponentProps<typeof PageBackground>["backgrounds"];
type StatusGraphic = ComponentProps<typeof StatusGraphicProvider>["asset"];
type ErrorMessages = ComponentProps<typeof ErrorMessagesProvider>["messages"];
type BottomNav = ComponentProps<typeof ShellEngine>["bottomNav"];
type EfsBottomNavItems = ComponentProps<typeof ShellEngine>["efsBottomNavItems"];
type PageBindings = ComponentProps<typeof ShellEngine>["pageBindings"];

/** The presentation facts both modes share. Nothing here can name a destination. */
interface ShellDocumentPresentation {
  readonly localeTag: string;
  readonly locale: string;
  readonly htmlClassName: string;
  readonly htmlStyle?: CSSProperties;
  readonly htmlAttributes: Readonly<Record<string, string>>;
  /** UI1-A2 — the ONE hydration tolerance, emitted only where the rail bridge is composed. */
  readonly sidebarPreferenceBridge: boolean;
  readonly skipToContentLabel: string;
  readonly errorMessages: ErrorMessages;
  readonly bannerMap: BannerMap;
  readonly backgroundMap: BackgroundMap;
  readonly statusGraphic: StatusGraphic;
  readonly regionIds: readonly string[];
  readonly notice?: ReactNode;
  readonly header: ReactNode;
  readonly footer: ReactNode;
  readonly children: ReactNode;
  readonly resolved: ResolvedUiConfig;
  readonly mainId: string;
  readonly mainClassName: string;
  readonly navigationLabel: string;
  readonly asideContent?: ReactNode;
  readonly sidebarLabels: { readonly show: string; readonly hide: string };
  readonly sidebarOpen: { readonly icon: string; readonly text: string | undefined };
  readonly sidebarClose: { readonly icon: string; readonly text: string | undefined };
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
  readonly structuredData?: ReactNode;
  readonly analytics?: ReactNode;
}

/** The legacy surface: the routing transport and the geographic inputs are REQUIRED here. */
export interface LegacyShellDocumentProps extends ShellDocumentPresentation {
  readonly mode: "legacy";
  readonly routing: ClientRoutingContext;
  readonly pageBindings: PageBindings;
  readonly siteSet: SiteSet;
  readonly bottomNav?: BottomNav;
}

/** The EFS surface: no routing transport, no `pageBindings`, no `siteSet` — they are not merely unused. */
export interface EfsShellDocumentProps extends ShellDocumentPresentation {
  readonly mode: "efs";
  /**
   * R10 Scope Addendum 02 — the EFS status-recovery fact, and the mode discriminant that rides the provider
   * the error boundary already reads. REQUIRED (not optional) so every EFS caller must state, explicitly,
   * either the published Home it verified or `null` for "this Site publishes no Home". `null` renders no
   * recovery link; it never licenses a guessed destination.
   */
  readonly statusRecoveryHomeHref: string | null;
  readonly bottomNavLabel?: string;
  readonly bottomNavMode?: NonNullable<BottomNav>["mode"];
  readonly efsBottomNavItems?: EfsBottomNavItems;
}

export type ShellDocumentProps = LegacyShellDocumentProps | EfsShellDocumentProps;

/**
 * Render the shared shell document. Pure and synchronous: it reads no request, no configuration and no
 * filesystem, so identical props always produce an identical document.
 *
 * `mode` selects the routing transport ONLY. Every other element below is the same code for both surfaces.
 */
export function ShellDocument(props: ShellDocumentProps): ReactNode {
  const {
    localeTag,
    locale,
    htmlClassName,
    htmlStyle,
    htmlAttributes,
    sidebarPreferenceBridge,
    skipToContentLabel,
    errorMessages,
    bannerMap,
    backgroundMap,
    statusGraphic,
    regionIds,
    notice,
    header,
    footer,
    children,
    resolved,
    mainId,
    mainClassName,
    navigationLabel,
    asideContent,
    sidebarLabels,
    sidebarOpen,
    sidebarClose,
    ctaLabel,
    ctaHref,
    structuredData,
    analytics,
  } = props;

  const engine = (
    <ShellEngine
      resolved={resolved}
      notice={notice}
      header={header}
      // The SAME two providers on both surfaces, so an EFS error/404 page reads the same dictionary copy
      // and the same resolved status graphic as every other page.
      main={
        <ErrorMessagesProvider
          messages={errorMessages}
          // R10 Scope Addendum 02 — the SERVER states the mode here. `props.mode` is the discriminator, so
          // `efs` carries the verified Home (or an explicit `null`) and `legacy` cannot carry one at all.
          statusRecovery={
            props.mode === "efs"
              ? { mode: "efs", homeHref: props.statusRecoveryHomeHref }
              : { mode: "legacy" }
          }
        >
          <StatusGraphicProvider asset={statusGraphic}>{children}</StatusGraphicProvider>
        </ErrorMessagesProvider>
      }
      footer={footer}
      mainId={mainId}
      mainClassName={mainClassName}
      navigationLabel={navigationLabel}
      sidebarLabels={sidebarLabels}
      sidebarOpen={sidebarOpen}
      sidebarClose={sidebarClose}
      asideContent={asideContent}
      bottomNav={
        props.mode === "legacy"
          ? props.bottomNav
          : props.bottomNavLabel === undefined
            ? undefined
            : {
                  label: props.bottomNavLabel,
                  // The legacy `links` contract is never read on the EFS path: the bar takes its EFS branch
                  // from `efsBottomNavItems` and renders the publication's verified items instead.
                  links: [],
                  ...(props.bottomNavMode === undefined ? {} : { mode: props.bottomNavMode }),
              }
      }
      efsBottomNavItems={props.mode === "efs" ? props.efsBottomNavItems : undefined}
      locale={locale}
      // GEO-04 R10 — the geographic transport is supplied by the legacy surface ONLY. On the EFS path these
      // are genuinely absent, not empty, so no address can be resolved from a page binding or a Site set.
      pageBindings={props.mode === "legacy" ? props.pageBindings : undefined}
      siteSet={props.mode === "legacy" ? props.siteSet : undefined}
      ctaLabel={ctaLabel}
      ctaHref={ctaHref}
    />
  );

  /**
   * Everything inside `<body>`. Identical for both modes — this is the composition that must not drift.
   */
  const body = (
    <>
      {sidebarPreferenceBridge ? <SidebarPreferenceBoot /> : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
      >
        {skipToContentLabel}
      </a>
      <PageBackground backgrounds={backgroundMap} regionIds={regionIds} />
      <PageBanner banners={bannerMap} regionIds={regionIds} />
      {engine}
      {structuredData ?? null}
      {analytics}
    </>
  );

  return (
    <html
      lang={localeTag}
      className={htmlClassName}
      style={htmlStyle}
      suppressHydrationWarning={sidebarPreferenceBridge}
      {...htmlAttributes}
    >
      <body className="min-h-full flex flex-col">
        {/* M14 — the ONE client transport for a Spoke's routing projection. Absent entirely on the EFS path,
            where every control is a server-resolved, hook-free rendering. */}
        {props.mode === "legacy" ? (
          <ClientRoutingProvider routing={props.routing}>{body}</ClientRoutingProvider>
        ) : (
          body
        )}
      </body>
    </html>
  );
}
