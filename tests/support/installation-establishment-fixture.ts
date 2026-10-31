/**
 * DISPOSABLE PLATFORMS, RELEASES, SEEDS AND TARGETS (FOUNDATION-B4B)
 * =================================================================
 *
 * Everything establishment's tests need, and nothing anybody's real state: a synthetic platform committed
 * into a throwaway Git repository, a release CONSTRUCTED from it by the platform's own release tooling, an
 * authored seed assembled by copying the platform's own committed synthetic deployment fixture, and empty
 * target workspaces. Every tree is created under OS temp and removed by exact ownership after each test.
 *
 * THE SYNTHETIC PLATFORM IS NOT A FAKE BUSINESS. It contains the anchors the release policy requires and the
 * two modules the manifest derives compatibility from, so release construction really constructs — the
 * mechanism under test is the platform's own, never a stand-in. Authored material comes from the fixture a
 * generic Foundation contract already uses, so proving establishment needs no invented site.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach } from "vitest";

import { capsuleDirectory } from "@/config/deployment-build.mjs";
import {
  foundationInstallationAdoptionRecord,
  INSTALLATION_ADOPTION_RECORD_FILE_NAME,
} from "@/core/foundation-installation/establishment";
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";
import {
  FOUNDATION_SOURCE_REPOSITORY,
  RELEASE_CONTENT_POLICY_ID,
} from "@/core/foundation-release/manifest.mjs";
import type { FoundationReleaseReference } from "@/core/foundation-release/reference";

import { constructRelease } from "../../scripts/release/release-construction.mjs";
import { SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT } from "./synthetic-deployment-root";
import { installationOperationalStateFile } from "../../src/adapters/installation/establish";

/** The release identity every establishment proof constructs under. */
export const SYNTHETIC_RELEASE_IDENTITY = "provelopment-foundation-v20990101.0000";

/** A fixed clock, so two establishments of the same inputs are byte-identical. */
export const SYNTHETIC_ESTABLISHMENT_MOMENT = new Date("2099-01-01T00:00:00Z");

/** Trees this process created, removed by exact ownership — never by searching OS temp. */
const owned: string[] = [];

afterEach(() => {
  for (const tree of owned.splice(0)) rmSync(tree, { recursive: true, force: true });
});

/** A fresh, empty directory under OS temp, removed after the test that created it. */
export function disposableTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  owned.push(root);
  return root;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Write a map of root-relative POSIX paths to exact text. */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

/** The anchors the release policy requires, plus what establishment's own checks read. */
const PLATFORM_FILES: Record<string, string> = {
  LICENSE: "Apache License\nVersion 2.0, January 2004\n",
  ".gitattributes": "# synthetic\n",
  ".gitignore": "# synthetic\n",
  "package.json": `${JSON.stringify(
    { name: "synthetic", private: true, packageManager: "pnpm@11.6.0", engines: { node: ">=22" } },
    null,
    2,
  )}\n`,
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": "allowBuilds: {}\n",
  "next.config.ts": "export default {};\n",
  "tsconfig.json": "{}\n",
  "vitest.config.mts": "export default {};\n",
  "eslint.config.mjs": "export default [];\n",
  "postcss.config.mjs": "export default {};\n",
  "README.md": "# Synthetic platform\n",
  "ARCHITECTURE.md": "# Synthetic architecture\n",
  "CUSTOMIZING.md": "# Synthetic customizing\n",
  "CLAUDE.md": "See AGENTS.md\n",
  "AGENTS.md": "# Synthetic agent contract\n",
  "src/config/deployment-build.mjs": "export function resolveDeploymentForBuild() { return null; }\n",
  "src/config/deployment-root.ts": 'export type DeploymentLayout = "capsule" | "repository" | "override";\n',
  "src/core/page-document.ts": "export const PAGE_DOCUMENT_SCHEMA_VERSION = 1;\n",
  "tests/setup/synthetic-deployment.ts": "export {};\n",
  "tests/setup/production-state-integrity.ts": "export {};\n",
  "tests/support/synthetic-deployment-root.ts": "export {};\n",
  "tests/fixtures/synthetic-deployment/site.config.json": '{ "site": {} }\n',
  "tests/unit/example.test.ts": "export {};\n",
  "scripts/sync-runtime-assets.mjs": "export {};\n",
  "scripts/generate-country-code-reference.mjs": "export {};\n",
  "scripts/release/index.mjs": "// the release tooling travels with the release\n",
  "instruction-manuals/README.md": "# Manuals\n",
};

/**
 * Commit a synthetic platform into a throwaway Git repository and CONSTRUCT a release from it with the
 * platform's own tooling. Returns where the payload is, and the identities construction recorded.
 */
export function constructSyntheticRelease(
  identity: string = SYNTHETIC_RELEASE_IDENTITY,
): { payloadDirectory: string; commit: string; tree: string; digest: string; fileCount: number } {
  const source = disposableTree("foundation-b4b-platform-");
  writeFiles(source, PLATFORM_FILES);
  git(source, ["init", "-q"]);
  git(source, ["add", "-A"]);
  git(source, [
    "-c",
    "user.name=B4B",
    "-c",
    "user.email=b4b@example.invalid",
    "commit",
    "-q",
    "-m",
    "synthetic platform",
  ]);
  const commit = git(source, ["rev-parse", "HEAD"]);
  const tree = git(source, ["rev-parse", "HEAD^{tree}"]);

  const payloadDirectory = path.join(disposableTree("foundation-b4b-release-"), "payload");
  const constructed = constructRelease({
    sourceRepository: source,
    revision: commit,
    release: identity,
    destination: payloadDirectory,
  });
  return { payloadDirectory, commit, tree, digest: constructed.digest, fileCount: constructed.fileCount };
}

/**
 * QUALIFY THE SEED'S PUBLISHED LANGUAGES (`GEO-03` R04-C1 §4/§5).
 *
 * Establishment CONVERTS the seed's Spoke configuration into an EFS publication, so the seed's
 * `i18n.locales[].code` become the published representation locales. Publication qualification is now
 * validated before serving, so a seed that declares bare `en`/`de` can no longer be established —
 * correctly: a bare language does not say which authored representation is meant.
 *
 * This rewrites the DISPOSABLE COPY only. The committed synthetic fixture stays byte-identical,
 * because ~50 legacy suites read it and its geographic tree belongs to `GEO-05`'s fixture work rather
 * than to this migration. The declared code and the authored directory are renamed TOGETHER, so the
 * conversion still finds each representation's own source.
 */
const SEED_LOCALE_MAP: Readonly<Record<string, string>> = { en: "en-001", de: "de-de" };

function qualifySeedLocales(seed: string): void {
  const configPath = path.join(seed, "site.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    i18n?: { defaultLocale?: string; locales?: { code?: string }[] };
  };
  const i18n = config.i18n;
  for (const locale of i18n?.locales ?? []) {
    if (typeof locale.code === "string" && SEED_LOCALE_MAP[locale.code] !== undefined) {
      locale.code = SEED_LOCALE_MAP[locale.code];
    }
  }
  const defaultLocale = i18n?.defaultLocale;
  if (typeof defaultLocale === "string" && SEED_LOCALE_MAP[defaultLocale] !== undefined) {
    i18n!.defaultLocale = SEED_LOCALE_MAP[defaultLocale];
  }

  // A Site's own locale list and default are declared in the SAME vocabulary as `i18n.locales`
  // (membership is validated), so they move with it.
  const qualify = (value: unknown): unknown =>
    typeof value === "string" && SEED_LOCALE_MAP[value] !== undefined ? SEED_LOCALE_MAP[value] : value;
  for (const site of (config as { sites?: { locales?: unknown[]; defaultLocale?: unknown }[] }).sites ?? []) {
    if (Array.isArray(site.locales)) {
      site.locales = site.locales.map((entry) =>
        typeof entry === "object" && entry !== null
          ? { ...entry, path: qualify((entry as { path?: unknown }).path) }
          : qualify(entry),
      );
    }
    site.defaultLocale = qualify(site.defaultLocale);
  }

  // The legacy region bindings pair a Site with a locale path key, so they move with it too.
  const bindings = (config as { business?: { pages?: { locale?: unknown }[] } }).business?.pages ?? [];
  for (const binding of bindings) binding.locale = qualify(binding.locale);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const pagesRoot = path.join(seed, "content", "pages");
  for (const mode of readdirSync(pagesRoot)) {
    const modeRoot = path.join(pagesRoot, mode);
    if (!statSync(modeRoot).isDirectory()) continue;
    for (const site of readdirSync(modeRoot)) {
      const siteRoot = path.join(modeRoot, site);
      if (!statSync(siteRoot).isDirectory()) continue;
      for (const locale of readdirSync(siteRoot)) {
        const qualified = SEED_LOCALE_MAP[locale];
        if (qualified === undefined) continue;
        cpSync(path.join(siteRoot, locale), path.join(siteRoot, qualified), { recursive: true });
        rmSync(path.join(siteRoot, locale), { recursive: true, force: true });
      }
    }
  }
}

/**
 * An authored seed: the platform's committed synthetic deployment fixture, plus the generated-state ignore
 * rule a capsule must carry. Copied, never written in place — other suites use the fixture.
 */
export function syntheticSeed(extra: Record<string, string> = {}): string {
  const seed = disposableTree("foundation-b4b-seed-");
  cpSync(SYNTHETIC_DEPLOYMENT_FIXTURE_ROOT, seed, { recursive: true });
  qualifySeedLocales(seed);
  writeFileSync(path.join(seed, ".gitignore"), `${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}\n`, "utf8");
  writeFiles(seed, extra);
  return seed;
}

/**
 * A DIFFERENT immutable release: the one a SOURCE installation adopted (FOUNDATION-B4B-A2).
 *
 * Deliberately its own release, so a target's adoption record can be proved FRESH rather than inherited by
 * comparison: equal bytes would prove nothing if source and target had adopted the same release, and the
 * real-world case is exactly that they may not.
 */
export const SYNTHETIC_SOURCE_RELEASE: FoundationReleaseReference = {
  tag: "provelopment-foundation-v20980101.0000",
  repository: FOUNDATION_SOURCE_REPOSITORY,
  commit: "9".repeat(40),
  tree: "8".repeat(40),
  manifestFormat: 1,
  content: { policy: RELEASE_CONTENT_POLICY_ID, digest: `sha256:${"7".repeat(64)}`, fileCount: 12 },
};

/**
 * The adoption record text a SOURCE installation's capsule carries — built by the platform's own record
 * function, so the fixture cannot drift from the shape an installation really writes.
 */
export function syntheticSourceAdoptionRecordText(
  overrides: { tag?: string; adoptedAt?: string; establishedBy?: string } = {},
): string {
  const record = foundationInstallationAdoptionRecord(
    { ...SYNTHETIC_SOURCE_RELEASE, tag: overrides.tag ?? SYNTHETIC_SOURCE_RELEASE.tag },
    {
      adoptedAt: overrides.adoptedAt ?? "2098-01-01T00:00:00+00:00",
      establishedBy: overrides.establishedBy ?? "FOUNDATION-B4B-A2 fixture",
    },
  );
  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * AN EXISTING INSTALLATION'S CAPSULE AS A SEED — the real-world case FOUNDATION-B4B-A2 exists for.
 *
 * The ordinary synthetic capsule PLUS the adoption record every installation carries. The earlier fixtures
 * omitted that expected file, which is exactly why they never exercised the documented procedure: an
 * operator's seed is `deployment/`, and `deployment/` is an established installation's own capsule.
 */
export function syntheticSeedFromExistingInstallation(
  options: { record?: string; extra?: Record<string, string> } = {},
): string {
  return syntheticSeed({
    [INSTALLATION_ADOPTION_RECORD_FILE_NAME]: options.record ?? syntheticSourceAdoptionRecordText(),
    ...options.extra,
  });
}

/** The capsule directory inside a target root, asked of the platform's own authority. */
export function targetCapsule(targetRoot: string): string {
  return capsuleDirectory(targetRoot);
}

/**
 * The capsule's relative name inside an installation root — asked of the platform's own authority, which is
 * what the operator surface passes to establishment (`src/**` may not import that authority).
 */
export const INSTALLATION_CAPSULE_RELATIVE_PATH = capsuleDirectory("");

/** The target installation's operational record, in the shape the composition root resolves it. */
export function operationalStateFileOf(targetRoot: string): string {
  return installationOperationalStateFile(targetRoot, INSTALLATION_CAPSULE_RELATIVE_PATH);
}

/** Every file beneath a root, as root-relative POSIX paths → exact bytes, for before/after comparison. */
export function snapshotTree(root: string, prefix = ""): Map<string, string> {
  const files = new Map<string, string>();
  if (!statSync(root, { throwIfNoEntry: false })) return files;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      for (const [key, value] of snapshotTree(absolute, relative)) files.set(key, value);
    } else if (entry.isFile()) {
      files.set(relative, readFileSync(absolute).toString("base64"));
    }
  }
  return files;
}
