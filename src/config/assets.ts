import { deploymentPaths, type RuntimeAssetNamespace } from "./deployment-root";
// FOUNDATION-UI-R1F — the ONE authority for the per-Spoke runtime namespace PATH CONTAINER ("spokes"), so the
// compact-logo rule recognises generated per-Spoke artwork addressing without spelling the container again.
import { SPOKE_RUNTIME_CONTAINER } from "./spoke-runtime-segment.mjs";
import {
  createRuntimeAssetOwnershipResolver,
  owningNamespaceIn,
  type ImageDimensions,
  type RuntimeAssetOwnershipResolver,
} from "./runtime-asset-resolver";
// M16/M17 (Defect B) — the compatibility seam binds the SAME build-time catalog the request path uses, so
// a build-time diagnostic and a page render can never disagree about what exists. This module is
// SERVER-ONLY (see its note), so the generated catalog never reaches a client chunk.
import { withRuntimeAssetInventories } from "./runtime-asset-catalog";

/**
 * P6-1 — configured icon-asset availability (framework layer); S3F2A2-R4 — THE PRODUCTION CUTOVER
 * ==============================================================================================
 *
 * This module is still the ONE public seam through which the application asks asset questions, and every
 * answer it gives is now produced by the ONE proved runtime-asset resolver:
 *
 *   deploymentPaths().runtimeAssetNamespaces  →  compatibilityResolver  →  this public API
 *
 * What used to live here — a module-level `runtimeNamespaces`/`platformNamespace` pair, a process-wide
 * basename owner cache, a process-wide dimension cache, the `owningNamespace` filesystem search, the
 * `runtimeUrlFor` / `availableRoleAssetPath` projections and five image-header decoders — is GONE, because
 * all of it was a SECOND runtime-asset engine standing beside the proved one. The public names and
 * signatures are unchanged, so no caller migrates and the current build context behaves identically.
 *
 * The two guarantees this module has always backed are preserved exactly, and are now expressed through the
 * resolver's ownership:
 *
 *  1. LOUD BUILD FAILURE — `assertConfiguredIconAssetsExist` runs from the SERVER-ONLY layout (module load /
 *     build — see `[locale]/layout.tsx`), so a configured-but-missing icon fails the build by naming the
 *     exact leaf and the expected file (P5-5A: invalid configuration fails loudly). Deliberately-empty
 *     (`""`) and absent leaves are valid and skipped.
 *
 *  2. SAFE RUNTIME RENDER — `availableIconName` is applied at the framework composition boundary (layout,
 *     site-header, nav-links), so an icon that is unavailable at render time resolves to `""` (no icon) and
 *     the DOM can never contain a broken browser-image placeholder. Config components are never handed a
 *     name that is not backed by a real file.
 *
 * Layer note: this module lives in `src/config` (the framework layer) because the answers it delegates to
 * read the filesystem; `src/core` stays framework-agnostic and the UI primitives stay config-free
 * (architecture boundary tests). It must only be imported from SERVER modules: a CLIENT component (e.g.
 * `ContextNavLinks` imports siteConfig via `@/config`) must never pull filesystem access into a browser
 * chunk — the loud check therefore lives in the server layout, not the loader.
 */

/** The public dimension shape stays available from this module, re-exported from the resolver's ONE type. */
export type { ImageDimensions };

/**
 * THE ONE COMPATIBILITY RESOLVER FOR THE CURRENT BUILD CONTEXT.
 *
 * Built from the SAME namespace authority the legacy engine used — the selected deployment's generated
 * runtime namespaces, in resolution order (platform first, then the declared Spoke's own) — and it is
 * deliberately the only stateful thing in this module: the owner cache and the dimension cache live INSIDE
 * this instance.
 *
 * `SpokeRuntimeContext` is deliberately NOT wired here yet: the application is still the accepted one-Spoke
 * build runtime, so binding a per-request context belongs to the server-render conversion that follows the
 * dictionary work. This cutover changes the IMPLEMENTATION, never the context.
 */
const compatibilityResolver = createRuntimeAssetOwnershipResolver(
  withRuntimeAssetInventories(deploymentPaths().runtimeAssetNamespaces),
);

/**
 * The namespace that HOLDS `name`, or `null`, asked of an EXPLICIT namespace list and answered by the
 * resolver module's own pure rule — the very rule the compatibility resolver applies internally, so the
 * parameterised answer and the context answer can never disagree.
 *
 * The caller's own namespace OBJECTS come back unwrapped (identity preserved): a caller asking "which of MY
 * namespaces holds this" must get that namespace itself, not a copy of it.
 */
export function namespaceOwning(
  name: string,
  namespaces: readonly RuntimeAssetNamespace[],
): RuntimeAssetNamespace | null {
  return owningNamespaceIn(name, namespaces);
}

/** True when `<name>` exists as a real file in a namespace this deployment declares. */
export function iconAssetAvailable(name: string | undefined): boolean {
  return compatibilityResolver.iconAssetAvailable(name);
}

/**
 * The ABSOLUTE path of the generated runtime file `<name>`, or `undefined` when no declared namespace holds
 * it — the companion of `availableIconUrl` for a consumer that needs the file itself (to read its header, to
 * assert it ships), and the ONE answer to "which namespace owns this basename".
 */
export function runtimeAssetPath(name: string | undefined): string | undefined {
  return compatibilityResolver.runtimeAssetPath(name);
}

/**
 * The icon filename to render: the name when it is backed by a real asset in a declared namespace; `""` when
 * a CONFIGURED name has no backing file (safely: no icon, never a broken image — the P5-5
 * deliberate-absence value); `undefined`/`""` pass through so the P5-5A contract is preserved verbatim
 * (missing → the caller's shipped-asset fallback applies; `""` → deliberately no icon).
 */
export function availableIconName(name: string | undefined): string | undefined {
  return compatibilityResolver.availableIconName(name);
}

/**
 * S3F1 — the same-origin URL a configured icon FILENAME resolves to: the declared namespace that actually
 * holds it, or `""` when none does (the P5-5 deliberate-absence value, so a configured-but-unavailable icon
 * renders no element rather than a broken image).
 *
 * The answer is not always `/assets/<name>`: in an explicit Installation a Spoke's own artwork is served
 * from that Spoke's namespace, and a hardcoded prefix would point at a platform path that does not hold it.
 * `undefined`/`""` pass through verbatim, exactly as the filename projection does.
 */
export function availableIconUrl(name: string | undefined): string | undefined {
  return compatibilityResolver.availableIconUrl(name);
}

/**
 * S3F1 — the runtime URL of ONE icon CONTROL leaf, with the SHIPPED DEFAULT resolved the same way.
 *
 * The P5-5 three-state contract is preserved exactly: `""` stays a deliberate absence (no icon), an absent
 * leaf falls back to the shipped default ROLE, and any named leaf resolves to the namespace that holds it.
 * Resolving the default at this boundary is what keeps a shipped role icon (the sidebar disclosure assets)
 * served from the Spoke's own namespace in an explicit Installation instead of from a platform path that no
 * longer holds it.
 */
export function resolveIconControlUrl(configured: string | undefined, shippedDefault: string): string {
  return compatibilityResolver.resolveIconControlUrl(configured, shippedDefault);
}

/**
 * P6-2D — resolves a `site.assets.*` value (an FS-4 ABSOLUTE URL, validated against `site.url`) to a path
 * that always fetches from the CURRENT origin when rendered as a real `<img src>`.
 *
 * Why this exists: `site.url` is the site's own canonical origin (used for `<link rel="canonical">`/JSON-LD/
 * OpenGraph, where an absolute URL is correct even if it differs from the browser's current origin). A
 * rendered `<img>` has no such indirection — the browser fetches literally whatever `src` says, so an
 * absolute asset URL whose host is a placeholder/mismatched domain would 404. Every `site.assets.*` value
 * resolves to a same-origin served path in every shipped deployment, so re-deriving the path portion is
 * always correct and removes the coupling between `site.url` accuracy and real rendered images.
 */
export function assetPathFromUrl(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.assetPathFromUrl(absoluteUrl);
}

/**
 * S3F1 — the same-origin URL a configured asset ROLE resolves to, WITHOUT requiring the file to be mirrored:
 * the owning namespace's URL when the basename IS installed by the runtime mirror (which installs by
 * basename, so that is the one place generated artwork actually lives), and the configured pathname verbatim
 * otherwise.
 *
 * The fallback matters: an adopter may serve artwork from the served directory directly (outside the mirror
 * plan), and such a value must keep working exactly as `assetPathFromUrl` resolved it before. A legacy
 * Installation therefore sees no change at all — its platform namespace URL base IS `/assets`, which is the
 * path its configured role URLs already name.
 */
export function runtimeAssetUrl(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.runtimeAssetUrl(absoluteUrl);
}

/**
 * P6-3B — resolves a configured `site.assets.banners[<page>]` value (an FS-4 ABSOLUTE URL) to a same-origin
 * path ONLY when a declared namespace holds a matching file; otherwise `undefined` (the page renders NO
 * banner — no placeholder, no reserved space, never another page's banner).
 */
export function availableBannerPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableBannerPath(absoluteUrl);
}

/**
 * P12-BG — resolves a configured `site.assets.backgrounds[<role>]` value under the same availability rule as
 * the banner, so a CONFIGURED-but-missing background is `undefined` — which is exactly what drives the
 * documented `background-<page>` → `background-all` → none fallback in the layout (that fallback belongs to
 * the layout: this module answers availability only).
 */
export function availableBackgroundPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableBackgroundPath(absoluteUrl);
}

/**
 * P12-BG — builds the page-role → same-origin-path map the decorative background layer consumes from the
 * configured `site.assets.backgrounds` record. Entries whose file is missing are DROPPED entirely, so a
 * CONFIGURED-but-missing background is indistinguishable from an ABSENT one.
 */
export function availableBackgroundMap(
  configured: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return compatibilityResolver.availableBackgroundMap(configured);
}

/**
 * P12-FG — resolves a configured `site.assets.footerGraphic` value (an FS-4 ABSOLUTE URL) to a same-origin
 * path ONLY when a declared namespace holds a matching file; otherwise `undefined`. Same availability rule as
 * the banner and background roles, so a CONFIGURED-but-missing footer graphic is indistinguishable from an
 * ABSENT one — the footer renders no decorative layer (never a placeholder, never a broken image).
 */
export function availableFooterGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableFooterGraphicPath(absoluteUrl);
}

/**
 * P12-HG — resolves a configured `site.assets.headerGraphic` value under the same availability rule as the
 * banner, background and footer-graphic roles, so a CONFIGURED-but-missing header graphic is
 * indistinguishable from an ABSENT one — the header paints no decorative band (never a placeholder, never a
 * broken image).
 */
export function availableHeaderGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableHeaderGraphicPath(absoluteUrl);
}

/**
 * P12-SG — resolves a configured `site.assets.statusGraphic` value under the same availability rule as the
 * four roles above, so a CONFIGURED-but-missing status graphic is indistinguishable from an ABSENT one — the
 * status surfaces render no decorative graphic (never a placeholder, never a broken image).
 */
export function availableStatusGraphicPath(absoluteUrl: string | undefined): string | undefined {
  return compatibilityResolver.availableStatusGraphicPath(absoluteUrl);
}

/**
 * P6-3C — the INTRINSIC pixel size of a configured graphic, when it can be read (server-only; cached per
 * asset filename INSIDE the resolver instance).
 *
 * The banner sizing contract is `displayWidth = min(availableWidth, 1.5 × naturalWidth)`. No CSS expression
 * can reference a replaced element's own intrinsic width, so the framework layer reads the asset's header
 * once at composition time and the renderer passes the derived cap down as an inline custom property (the
 * established token-only pattern — no component style rule). Supported containers: SVG, PNG, JPEG, GIF,
 * WebP.
 *
 * Returns `undefined` for anything undecodable, so the renderer falls back to a never-upscale presentation
 * rather than guessing a size.
 */
export function readImageDimensions(sameOriginPath: string | undefined): ImageDimensions | undefined {
  return compatibilityResolver.readImageDimensions(sameOriginPath);
}

interface IconLeafRef {
  readonly label: string;
  readonly value: string | undefined;
}

/** The icon-bearing part of the parsed configuration (structural projection). */
export interface IconConfigSource {
  readonly ui?: {
    readonly navigation?: {
      readonly sidebar?: {
        readonly open?: { readonly icon?: string };
        readonly close?: { readonly icon?: string };
      };
    };
    readonly cta?: { readonly icon?: string };
  };
  readonly navigation?: readonly {
    readonly icon?: string;
    readonly iconOpen?: string;
    readonly iconClosed?: string;
  }[];
}

/**
 * P6-1 — every icon leaf in the configuration that is a plain filename must be backed by a real file in a
 * declared runtime namespace. Missing files are loud build failures (P5-5A: invalid → loud configuration
 * failure), so an adopter who references a typo'd/absent asset can never ship a broken-image icon.
 *
 * Deliberate absence (`""`) on a control leaf remains valid (icon-only → text-only etc.), exactly as before —
 * only a NAME with no file fails. The availability question is asked of the ONE compatibility resolver, so
 * this build-time diagnostic and the runtime projection can never disagree about what exists.
 */
export function assertConfiguredIconAssetsExist(json: IconConfigSource): void {
  assertConfiguredIconAssetsExistFor(compatibilityResolver, json);
}

/**
 * M13 — THE SAME VALIDATION AGAINST AN ARBITRARY CONTEXT'S RESOLVER.
 *
 * The rule is expressed ONCE (below) and asked of whichever resolver owns the artwork: the compatibility
 * resolver for `assertConfiguredIconAssetsExist`, and a resolver built from that context's own
 * `runtimeAssetNamespaces` for the server composition that
 * renders THAT context. A second copy of the validation — or a second wording of the diagnostic — is
 * exactly what this avoids: the leaf names, the accepted `""`/absent leaves and the thrown message are
 * identical whichever resolver answers, so a context can only ever be judged by the artwork it may serve.
 */
export function assertConfiguredIconAssetsExistFor(
  resolver: RuntimeAssetOwnershipResolver,
  json: IconConfigSource,
): void {
  const leaves: IconLeafRef[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value && value !== "") leaves.push({ label, value });
  };

  push("ui.navigation.sidebar.open.icon", json.ui?.navigation?.sidebar?.open?.icon);
  push("ui.navigation.sidebar.close.icon", json.ui?.navigation?.sidebar?.close?.icon);
  push("ui.cta.icon", json.ui?.cta?.icon);
  for (const [index, item] of (json.navigation ?? []).entries()) {
    push(`navigation[${index}].icon`, item.icon);
    push(`navigation[${index}].iconOpen`, item.iconOpen);
    push(`navigation[${index}].iconClosed`, item.iconClosed);
  }

  const missing = leaves.filter((leaf) => !resolver.iconAssetAvailable(leaf.value));
  if (missing.length > 0) {
    const details = missing
      .map((leaf) => `  - ${leaf.label}: "${leaf.value}" not found under public/assets/`)
      .join("\n");
    throw new Error(
      `Invalid site configuration: configured icon leaf(s) have no matching asset file:\n${details}\n` +
        `Place the asset in public/assets/ (a plain filename) or use "" to deliberately omit the icon.`,
    );
  }
}

/** The site-asset leaves the compact-logo rule reads (structural projection). */
export interface HeaderLogoConfigSource {
  /**
   * The deployment's own base URL — the PARSED configuration's top-level `url` (`site.url` in the file), which
   * is what makes "same-origin" answerable without a second spelling of the site's identity.
   */
  readonly url?: string;
  readonly assets?: {
    readonly logo?: string;
    readonly logoCompact?: string;
  };
}

/** The ORIGIN of an absolute URL, or `undefined` when there is none to compare (schema-validated elsewhere). */
function originOf(url: string | undefined): string | undefined {
  if (!url || url === "") return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** The LONGEST declared base the pathname addresses (`/spokes/a/assets/x.svg` → `/spokes/a/assets`), or `undefined`. */
function namespaceBaseNamedBy(pathname: string, declaredBases: readonly string[]): string | undefined {
  let named: string | undefined;
  for (const base of declaredBases) {
    if (base === "" || !pathname.startsWith(`${base}/`)) continue;
    if (named === undefined || base.length > named.length) named = base;
  }
  return named;
}

/**
 * FOUNDATION-UI-R1F — THE COMPACT HEADER LOGO'S BUILD-TIME RULE.
 * FOUNDATION-UI-R1G — THE ORIGIN AND NAMESPACE CONTRACT, CLOSED HERE.
 *
 * `site.assets.logoCompact` is the ONE optional header-presentation ALTERNATIVE to the primary brand logo: the
 * browser selects it natively below 600 CSS pixels and the primary artwork at and above that width. It is not a
 * second organisation identity (JSON-LD and every other consumer keep reading `site.assets.logo`), so the only
 * question worth failing a build over is whether the artwork the compact leaf names can actually be SERVED by
 * the context doing the asking.
 *
 * THE RULE, as narrow as it can be and still be useful. R1G closed the two incoherences an independent review
 * found in the first cut of it: a value on ANOTHER ORIGIN was accepted even though the render delivers its
 * pathname from THIS origin, and a per-Spoke path was judged by BASENAME alone, so a context holding that
 * basename could serve its own file for a path that named a different namespace.
 *
 *   · absent (or deliberately empty) → nothing to prove: the compact role is optional, and its absence is the
 *     shipped state — the template ships no compact artwork and configures none;
 *   · THE ORIGIN CONTRACT. Runtime image DELIVERY is always THIS deployment's own origin: a configured absolute
 *     URL is canonical SOURCE IDENTITY, and the browser fetches its PATHNAME from the current origin, whatever
 *     host the value names (BRAND_ASSETS.md §3). A value naming another origin can therefore never be delivered
 *     as authored, so it is REFUSED — naming both origins and the fix — instead of silently becoming a
 *     same-origin request for artwork the author hosts elsewhere (or quietly resolving to a local file that
 *     merely shares the basename). A same-origin PATH, and a value on the deployment's own origin, are
 *     unaffected;
 *   · THE NAMESPACE CONTRACT. Where the value addresses GENERATED artwork — a path that names a runtime
 *     namespace base (`/assets/**`, `/spokes/<segment>/assets/**`), or that lies anywhere inside the per-Spoke
 *     container, which exists ONLY as generated artwork — the path must name a namespace THIS context may serve,
 *     must address one of that namespace's files FLAT exactly as the mirror installs them, and the file must be
 *     held by the namespace the path NAMES: never another Spoke's, never a different namespace's file
 *     substituted for the one a path explicitly names, and never nothing at all. The SHARED platform namespace
 *     keeps its established ownership rule — availability by basename, so a Spoke's own artwork for a role is
 *     served from that Spoke's namespace;
 *   · anything else — a same-origin path OUTSIDE the generated namespace space (`/uploads/logo-compact.svg`) →
 *     nothing to prove here, exactly as the primary logo's external URLs are left alone: the engine does not own
 *     that file and cannot know whether it exists.
 *
 * The resolver is built from the context's OWN namespaces, and the namespace a path NAMES is asked of that same
 * resolver through the SAME ownership predicate — no second resolver, no weaker check. A context can therefore
 * only ever be judged by the artwork it may serve, and "one Spoke can never load another Spoke's private compact
 * logo" is enforced by construction.
 *
 * Note the deliberate ASYMMETRY with every other `site.assets.*` role: only this leaf refuses a value whose
 * origin is not the deployment's own, because only this leaf promises that the artwork it names WILL be shown at
 * the widths it exists for. `runtimeAssetUrl`, the origin policy and the primary logo are untouched.
 *
 * The companion rule — a compact logo is valid only beside a primary logo — belongs to the SCHEMA
 * (`./schema`, `siteAssetsSchema`), which already refuses the combination with an actionable message; it is
 * deliberately not restated here.
 */
export function assertConfiguredCompactLogoAvailableFor(
  resolver: RuntimeAssetOwnershipResolver,
  json: HeaderLogoConfigSource,
): void {
  const configured = json.assets?.logoCompact;
  if (!configured || configured === "") return;
  const pathname = resolver.assetPathFromUrl(configured);
  if (pathname === undefined || pathname === "") return;

  // ── 1. THE ORIGIN CONTRACT (R1G) ─────────────────────────────────────────────────────────────────────────
  // The value must be deliverable FROM THIS DEPLOYMENT'S OWN ORIGIN: an absolute URL on that origin, or a
  // same-origin path. Anything else is refused, because the render delivers a PATHNAME FROM THIS ORIGIN whatever
  // host the value names — so accepting it would silently request a path this deployment does not serve (or a
  // local file that merely shares the basename) instead of the artwork the adopter authored.
  const siteOrigin = originOf(json.url);
  const configuredOrigin = originOf(configured);
  if (configuredOrigin !== undefined && configuredOrigin !== siteOrigin) {
    throw new Error(
      "Invalid site configuration: the configured compact header logo is not deliverable by this context:\n" +
        `  - site.assets.logoCompact: "${configured}" names the origin "${configuredOrigin}", but runtime artwork ` +
        "is always delivered from this deployment's own origin" +
        (siteOrigin === undefined
          ? ', and this context states no "site.url" to compare the configured origin with.\n'
          : ` ("${siteOrigin}").\n`) +
        "    A configured origin is the artwork's canonical SOURCE identity, never a delivery instruction " +
        "(BRAND_ASSETS.md §3): the browser requests this value's pathname from this deployment, so artwork " +
        "hosted elsewhere would never appear.\n" +
        "Author the compact artwork in THIS deployment's content/assets/ and let the asset mirror install it (or " +
        "point the leaf at this deployment's own origin), or omit \"site.assets.logoCompact\" so the primary " +
        "logo is used at every width.",
    );
  }
  if (configuredOrigin === undefined && !(configured.startsWith("/") && !configured.startsWith("//"))) {
    throw new Error(
      "Invalid site configuration: the configured compact header logo is not deliverable by this context:\n" +
        `  - site.assets.logoCompact: "${configured}" is neither an absolute URL nor a same-origin path, so no ` +
        "origin can be confirmed for it.\n" +
        "Runtime artwork is always delivered from THIS deployment's own origin: configure an absolute URL on that " +
        'origin (the informational "site.url") or a same-origin path this deployment serves.',
    );
  }

  const name = pathname.split("/").pop() ?? "";
  if (name === "") return;

  // ── 2. THE NAMESPACE CONTRACT (R1G) ──────────────────────────────────────────────────────────────────────
  // OWNERSHIP IS ASKED ONLY WHERE THE ENGINE TRULY OWNS THE ANSWER: artwork it GENERATED for this deployment —
  // a path that NAMES a runtime namespace base this context declares, or that lies inside the per-Spoke
  // container, which exists ONLY as generated artwork. A hand-served same-origin path outside that address space
  // is left exactly as configured, the latitude every role's absolute URL has always had.
  const declaredBases = resolver.namespaces.map((namespace) => namespace.urlBase);
  const platformBase = resolver.namespaces[0]?.urlBase;
  const namedBase = namespaceBaseNamedBy(pathname, declaredBases);
  const insideTheSpokeNamespaceContainer = pathname.startsWith(`/${SPOKE_RUNTIME_CONTAINER}/`);
  if (namedBase === undefined && !insideTheSpokeNamespaceContainer) return;

  // 2a. THE PATH MUST NAME A NAMESPACE THIS CONTEXT MAY SERVE, AND ONE FILE THAT NAMESPACE REALLY INSTALLS.
  if (namedBase === undefined) {
    throw new Error(
      "Invalid site configuration: the configured compact header logo cannot be served in this context:\n" +
        `  - site.assets.logoCompact: "${configured}" names the path "${pathname}", which is not the address of ` +
        `a runtime asset namespace this context may serve (declared: ${declaredBases.join(", ") || "none"}).\n` +
        "Each Spoke's generated artwork is served from its OWN namespace only: author the artwork under this " +
        "Spoke's content/assets/ and let the asset mirror install it (BRAND_ASSETS.md — the logo-compact role), " +
        "or reference the shared platform namespace (/assets/<file>). Artwork belonging to ANOTHER Spoke's " +
        "namespace is deliberately not served here.",
    );
  }
  if (pathname !== `${namedBase}/${name}`) {
    throw new Error(
      "Invalid site configuration: the configured compact header logo cannot be served in this context:\n" +
        `  - site.assets.logoCompact: "${configured}" names the path "${pathname}", but "${namedBase}" publishes ` +
        `its files FLAT — the asset mirror installs every role by its basename, so "${namedBase}/${name}" is the ` +
        "only path it ever serves.\n" +
        "Reference that path (or author the artwork in the namespace's own source tree under the basename the " +
        'leaf must name), or omit "site.assets.logoCompact" so the primary logo is used at every width.',
    );
  }

  // 2b. THE FILE MUST BE HELD BY THE NAMESPACE THE PATH NAMES.
  // The SHARED platform namespace keeps its established ownership rule: a basename a declared namespace holds is
  // served from that namespace (BASENAME decides — the accepted swap contract). A path that names a PER-SPOKE
  // namespace is stricter, because the render keeps that very pathname: substituting another namespace's file
  // for it would serve artwork the value does not name, and a file the named namespace does not hold is a path
  // nothing can serve.
  if (namedBase !== platformBase) {
    const named = resolver.namespaces.find((namespace) => namespace.urlBase === namedBase);
    if (named !== undefined && owningNamespaceIn(name, [named]) !== null) return;
    const holder = resolver.namespaceOwning(name);
    throw new Error(
      "Invalid site configuration: the configured compact header logo cannot be served in this context:\n" +
        `  - site.assets.logoCompact: "${configured}" names the file "${name}" in "${namedBase}", and that ` +
        "namespace does not hold it — nothing would be served at the path the value names.\n" +
        "    A namespace is never substituted for the one a path names:\n" +
        (holder === null
          ? `      "${name}" is held by no namespace this context may serve (searched: ${declaredBases.join(", ")}).\n`
          : `      "${name}" is held by "${holder.urlBase}" — a DIFFERENT namespace.\n`) +
        `Author the artwork under the Spoke that owns "${namedBase}" (BRAND_ASSETS.md — the logo-compact role), ` +
        "reference the shared platform namespace (/assets/<file>), or omit \"site.assets.logoCompact\" so the " +
        "primary logo is used at every width.",
    );
  }

  // OWNERSHIP, asked of THIS context's resolver: the basename must be held by the platform namespace or by a
  // Spoke namespace this context declares — never by another Spoke's, and never by nothing at all.
  if (resolver.iconAssetAvailable(name)) return;

  throw new Error(
    "Invalid site configuration: the configured compact header logo cannot be served in this context:\n" +
      `  - site.assets.logoCompact: "${configured}" names "${name}", which no runtime asset namespace this ` +
      `context may serve holds (searched: ${declaredBases.join(", ") || "none"}).\n` +
      "Author the artwork under this Spoke's content/assets/ (BRAND_ASSETS.md — the logo-compact role) and let " +
      'the asset mirror install it, or omit "site.assets.logoCompact" so the primary logo is used at every ' +
      "width. Artwork belonging to ANOTHER Spoke's namespace is deliberately not served here.",
  );
}
