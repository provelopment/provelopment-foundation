/**
 * NODENEXT SPECIFIER ADAPTER — build-time only, scoped to the pinned Connect source
 * ================================================================================
 * FOUNDATION-RELEASE-CANDIDATE-A1 (the pattern is Web-1's, proven in production by
 * WEB1-CONNECT-GIT-SOURCE-MAILTO-ADOPTION-A1)
 *
 * Connect is authored as a Node ESM package (`module`/`moduleResolution: NodeNext`,
 * `verbatimModuleSyntax`), so its relative imports carry an explicit `.js` extension:
 * `import … from './result.js'`. TypeScript resolves that to `./result.ts`, and Vite/Vitest does too —
 * but **Turbopack has no extension-aliasing option**, so `next build` refuses `./result.js` when only
 * `./result.ts` exists.
 *
 * The released source is carried BYTE-FOR-BYTE and may not be edited (`scripts/connect/verify-pinned-source.mjs`
 * recomputes its Git tree id), so the resolution happens HERE instead: this loader rewrites a relative
 * specifier's `.js` suffix to the extensionless form Turbopack already resolves through
 * `resolveExtensions`. Nothing is written to disk, nothing is generated, and the transform is confined
 * to `modules/connect/src/**` by the single rule that registers it in `next.config.ts`.
 *
 * WHY A LOADER AND NOT A BUNDLER SWITCH: an earlier revision of this integration moved the whole
 * application to webpack to reach `resolve.extensionAlias`. That fixed the production build and broke
 * the development/browser harness, which starts `next dev` (Turbopack, where a `webpack` key is never
 * read) — the platform would have had two different module-resolution rules depending on how it was
 * started. This rewrite is bundler-native, applies to development and production identically, and
 * leaves the shipped bytes provably unchanged.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH:
 *   · bare/package specifiers (`react`, `node:fs`, …) — no relative prefix, so no match;
 *   · any non-`.js` extension (`.json`, `.mjs`, `.svg`, …);
 *   · anything outside the pinned tree — no other file is ever passed to this loader.
 *
 * It is a build-resolution detail, not a source change: the same bytes are proven in Git, and the
 * application still type-checks against the original TypeScript.
 */

/** `from './x.js'`, `export … from './x.js'`, `import('./x.js')` — relative specifiers only. */
const RELATIVE_JS_SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"'\n]*?)\.js\2/g;

/**
 * @param {string | Buffer} source the file Turbopack is about to compile
 * @returns {string} the same file with relative `.js` specifiers made extensionless
 */
module.exports = function nodeNextSpecifierAdapter(source) {
  const text = Buffer.isBuffer(source) ? source.toString("utf8") : String(source);
  return text.replace(RELATIVE_JS_SPECIFIER, (_match, prefix, quote, specifier) => {
    return `${prefix}${quote}${specifier}${quote}`;
  });
};
