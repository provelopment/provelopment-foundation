import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { materializeEfsInstallation, selectEfsInstallation } from "../support/efs-installation";
import { LEGACY_TEST_RUNTIME_ENV } from "@/app/[[...segments]]/legacy-test-runtime";
import { EFS_REQUEST_PATH_HEADER } from "@/config/efs/request-path";

// The canonical fixture's publications name REAL Spokes (`acme-spoke`). Declare that Spoke in a
// disposable explicit Installation before the runtime modules are loaded, so ownership is checked
// against a genuine hierarchy rather than a mocked context.
const installation = materializeEfsInstallation({ mode: "flat", spokes: ["acme-spoke"] });
selectEfsInstallation(installation.root);
vi.resetModules();
const { efsContactContextForCurrentRequest, efsViewForCurrentRequest } = await import(
  "@/app/[[...segments]]/efs-request"
);

afterAll(() => installation.cleanup());

function request(host: string, path: string) {
  state.headers.set("host", host);
  return efsViewForCurrentRequest(path.split("/").filter(Boolean));
}

describe("EFS actual App Router request branch (S3-E3)", () => {
  beforeEach(() => {
    state.headers.clear();
    process.env.FOUNDATION_EFS_MANIFEST = join(
      process.cwd(),
      "tests",
      "fixtures",
      "efs",
      "canonical",
      "manifest.json",
    );
    process.env.FOUNDATION_EFS_CAPSULE = join(
      process.cwd(),
      "tests",
      "fixtures",
      "efs",
      "canonical",
      "capsule",
    );
  });

  it("resolves the managed shared-host Page through its explicit binding", async () => {
    const view = await request("my.provelopment.com", "/acme-co/en-001/about");
    expect(view).not.toBeNull();
    expect(view?.entity.id).toBe("e_00000000000000000000000000");
    expect(view?.facet.id).toBe("acme");
    expect(view?.site.id).toBe("main");
    expect(view?.page.id).toBe("about");
    expect(view?.locale).toBe("en-001");
    expect(view?.canonical).toBe("https://my.provelopment.com/acme-co/en-001/about");
    expect(view?.source.format).toBe("markdown");
  });

  it("resolves the dedicated-host Page with the same ownership identities", async () => {
    const managed = await request("my.provelopment.com", "/acme-co/en-001/about");
    const dedicated = await request("www.acme-co.com", "/en-001/about");
    expect(dedicated?.entity.id).toBe(managed?.entity.id);
    expect(dedicated?.facet.id).toBe(managed?.facet.id);
    expect(dedicated?.site.id).toBe(managed?.site.id);
    expect(dedicated?.page.id).toBe(managed?.page.id);
    expect(dedicated?.canonical).toBe("https://www.acme-co.com/en-001/about");
  });

  it("redirects a bare binding entry to a real localized Home Page", async () => {
    await expect(request("my.provelopment.com", "/acme-co")).rejects.toThrow(
      "REDIRECT:/acme-co/en-001/",
    );
    const home = await request("my.provelopment.com", "/acme-co/en-001/");
    expect(home?.page.id).toBe("home");
    expect(home?.canonical).toBe("https://my.provelopment.com/acme-co/en-001");
  });

  it("supports nested routes and Site-open selectors", async () => {
    const nested = await request("my.provelopment.com", "/acme-co/en-001/products/detail");
    expect(nested?.page.id).toBe("detail");
    expect(nested?.visibility).toBe("unlisted");
    const open = await request("my.provelopment.com", "/acme-open/outlet/fr-fr/");
    expect(open?.site.id).toBe("outlet");
    expect(open?.page.id).toBe("home");
    expect(open?.canonical).toBe("https://my.provelopment.com/acme-open/outlet/fr-fr");
  });

  it("publishes a public English representation while its French representation is unlisted", async () => {
    const english = await request("my.provelopment.com", "/acme-co/en-001/guide");
    expect(english?.visibility).toBe("public");
    expect(english?.alternates.map((alternate) => alternate.hreflang)).toEqual(["en-001"]);
    expect(english?.xDefault).toBe("https://my.provelopment.com/acme-co/en-001/guide");
    expect(english?.navigation.some((item) => item.pageId === "guide")).toBe(true);

    const french = await request("my.provelopment.com", "/acme-co/fr-fr/guide");
    expect(french?.visibility).toBe("unlisted");
    expect(french?.alternates.map((alternate) => alternate.hreflang)).toEqual(["en-001"]);
    expect(french?.navigation.some((item) => item.pageId === "guide")).toBe(false);
    expect(french?.canonical).toBe("https://my.provelopment.com/acme-co/fr-fr/guide");
  });

  it("publishes a public French representation while its English representation is unlisted", async () => {
    const english = await request("my.provelopment.com", "/acme-co/en-001/notice");
    expect(english?.visibility).toBe("unlisted");
    expect(english?.alternates.map((alternate) => alternate.hreflang)).toEqual(["fr-FR"]);
    expect(english?.xDefault).toBeUndefined();
    expect(english?.navigation.some((item) => item.pageId === "notice")).toBe(false);

    const french = await request("my.provelopment.com", "/acme-co/fr-fr/notice");
    expect(french?.visibility).toBe("public");
    expect(french?.alternates.map((alternate) => alternate.hreflang)).toEqual(["fr-FR"]);
    expect(french?.xDefault).toBeUndefined();
    expect(french?.navigation.some((item) => item.pageId === "notice")).toBe(true);
  });

  it("keeps an all-unlisted Page reachable without advertising either representation", async () => {
    for (const locale of ["en-001", "fr-fr"]) {
      const view = await request("my.provelopment.com", `/acme-co/${locale}/secret`);
      expect(view?.visibility, locale).toBe("unlisted");
      expect(view?.alternates, locale).toEqual([]);
      expect(view?.xDefault, locale).toBeUndefined();
      expect(view?.navigation.some((item) => item.pageId === "secret"), locale).toBe(false);
    }
  });

  it("never redirects a missing translation to an unlisted fallback", async () => {
    await expect(request("my.provelopment.com", "/acme-co/fr-ca/notice")).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(request("my.provelopment.com", "/acme-co/fr-CA/guide")).rejects.toThrow(
      "REDIRECT:/acme-co/en-001/guide/",
    );
  });

  it("treats an absent visibility declaration as public", async () => {
    const about = await request("my.provelopment.com", "/acme-co/en-001/about");
    expect(about?.source.format).toBe("markdown");
    expect(about?.visibility).toBe("public");
  });

  it("refuses an invalid EFS JSON Page instead of rendering generic fallback content", async () => {
    const root = mkdtempSync(join(tmpdir(), "efs-invalid-page-"));
    const capsule = join(root, "capsule");
    cpSync(
      join(process.cwd(), "tests", "fixtures", "efs", "canonical", "capsule"),
      capsule,
      { recursive: true },
    );
    writeFileSync(
      join(
        capsule,
        "e_00000000000000000000000000",
        "acme",
        "main",
        "pages",
        "guide",
        "en-001.json",
      ),
      JSON.stringify({ schemaVersion: 1, title: 123, sections: [] }),
      "utf8",
    );
    process.env.FOUNDATION_EFS_CAPSULE = capsule;
    await expect(request("my.provelopment.com", "/acme-co/en-001/guide")).rejects.toThrow(
      /Invalid Page document[\s\S]*title/,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses an unlisted representation of the reserved Home document", async () => {
    const root = mkdtempSync(join(tmpdir(), "efs-unlisted-home-"));
    const capsule = join(root, "capsule");
    cpSync(
      join(process.cwd(), "tests", "fixtures", "efs", "canonical", "capsule"),
      capsule,
      { recursive: true },
    );
    writeFileSync(
      join(
        capsule,
        "e_00000000000000000000000000",
        "acme",
        "main",
        "pages",
        "home",
        "en-001.json",
      ),
      JSON.stringify({
        schemaVersion: 1,
        title: "Unlisted home",
        visibility: "unlisted",
        sections: [],
      }),
      "utf8",
    );
    process.env.FOUNDATION_EFS_CAPSULE = capsule;
    await expect(request("my.provelopment.com", "/acme-co/en-001/")).rejects.toThrow(
      /visibility.*refused on the reserved "home" document/,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a Markdown visibility declaration rather than treating it as public", async () => {
    const root = mkdtempSync(join(tmpdir(), "efs-markdown-visibility-"));
    const capsule = join(root, "capsule");
    cpSync(
      join(process.cwd(), "tests", "fixtures", "efs", "canonical", "capsule"),
      capsule,
      { recursive: true },
    );
    writeFileSync(
      join(
        capsule,
        "e_00000000000000000000000000",
        "acme",
        "main",
        "pages",
        "about",
        "fr-ca.md",
      ),
      "---\ntitle: About\nvisibility: unlisted\n---\n\nBody.\n",
      "utf8",
    );
    process.env.FOUNDATION_EFS_CAPSULE = capsule;
    await expect(request("my.provelopment.com", "/acme-co/fr-CA/about")).rejects.toThrow(
      /Markdown authoring mode has no visibility vocabulary/,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("suppresses an inherited address at the descendant Site", async () => {
    const open = await request("my.provelopment.com", "/acme-open/outlet/fr-fr/");
    expect(open?.properties.get("contact.address")?.state).toBe("suppressed");
    expect(open?.properties.publicEntries().map((entry) => entry.key)).not.toContain("contact.address");
  });

  it("refuses an unclaimed prefix and an unclaimed host when the EFS manifest is authoritative", async () => {
    await expect(request("my.provelopment.com", "/other/en-001/about")).rejects.toThrow("NOT_FOUND");
    await expect(request("unclaimed.example", "/acme-co/en-001/about")).rejects.toThrow("NOT_FOUND");
  });

  it("keeps identity and properties unchanged between prefixed and dedicated bindings", async () => {
    const managed = await request("my.provelopment.com", "/acme-co/en-001/about");
    const dedicated = await request("127.0.0.1", "/en-001/about");
    expect(dedicated?.entity.id).toBe(managed?.entity.id);
    expect(dedicated?.facet.id).toBe(managed?.facet.id);
    expect(dedicated?.site.id).toBe(managed?.site.id);
    expect(dedicated?.page.id).toBe(managed?.page.id);
    expect(dedicated?.locale).toBe(managed?.locale);
    expect(dedicated?.properties.toRecord()).toEqual(managed?.properties.toRecord());
    expect(dedicated?.canonical).not.toBe(managed?.canonical);
  });

  it("refuses an unsupported locale without inferring one from the prefix or Site", async () => {
    await expect(request("my.provelopment.com", "/acme-co/de/about")).rejects.toThrow("NOT_FOUND");
  });

  it("fails closed when a capsule exists without its explicit manifest", async () => {
    const directory = mkdtempSync(join(tmpdir(), "efs-missing-"));
    mkdirSync(join(directory, "capsule"), { recursive: true });
    process.env.FOUNDATION_EFS_MANIFEST = join(directory, "manifest.json");
    process.env.FOUNDATION_EFS_CAPSULE = join(directory, "capsule");
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /EFS manifest is missing/,
    );
  });

  it("fails with a controlled diagnostic instead of falling back when the manifest is invalid", async () => {
    const directory = mkdtempSync(join(tmpdir(), "efs-invalid-"));
    const invalid = join(directory, "manifest.json");
    writeFileSync(invalid, "{ not json", "utf8");
    process.env.FOUNDATION_EFS_MANIFEST = invalid;
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /EFS manifest is invalid/,
    );
  });

  it("fails closed when the manifest exists without its capsule", async () => {
    const directory = mkdtempSync(join(tmpdir(), "efs-no-capsule-"));
    process.env.FOUNDATION_EFS_MANIFEST = join(
      process.cwd(),
      "tests",
      "fixtures",
      "efs",
      "canonical",
      "manifest.json",
    );
    process.env.FOUNDATION_EFS_CAPSULE = join(directory, "capsule");
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /EFS capsule is missing/,
    );
  });

  it("refuses an empty manifest override instead of selecting the legacy runtime", async () => {
    process.env.FOUNDATION_EFS_MANIFEST = "";
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /must name a manifest or be left unset/,
    );
  });

  it("gives a controlled setup diagnostic when a production installation has no EFS declaration", async () => {
    delete process.env.FOUNDATION_EFS_MANIFEST;
    delete process.env.FOUNDATION_EFS_CAPSULE;
    delete process.env[LEGACY_TEST_RUNTIME_ENV];
    await expect(request("my.provelopment.com", "/acme-co/en-001/about")).rejects.toThrow(
      /declares no EFS manifest/,
    );
    process.env[LEGACY_TEST_RUNTIME_ENV] = "1";
  });

  // THE RESERVED HOME PAGE HAS EXACTLY ONE PUBLIC ADDRESS: its binding's locale root (GEO-03 R04-C23). `home` is that
  // document's INTERNAL Page identity, so the literal suffix is refused — never aliased, rewritten or redirected. These
  // are real requests through the shared resolver, so each addressing shape must apply the rule after parsing its own
  // distinct routing components.
  it("refuses the literal home suffix on a Site-closed dedicated host, in every declared locale", async () => {
    const home = await request("www.acme-co.com", "/en-001/");
    expect(home?.page.id).toBe("home");
    expect(home?.home).toBe(true);
    expect(home?.canonical).toBe("https://www.acme-co.com/en-001");
    for (const locale of ["en-001", "fr-fr"]) {
      await expect(request("www.acme-co.com", `/${locale}/home`), locale).rejects.toThrow(
        "NOT_FOUND",
      );
    }
    // Case semantics are untouched: an undeclared `Home` Page route was and remains refused, and the refusal of
    // `home` added no case folding.
    await expect(request("www.acme-co.com", "/en-001/Home")).rejects.toThrow("NOT_FOUND");
    expect((await request("www.acme-co.com", "/en-001/about"))?.page.id).toBe("about");
  });

  it("refuses the literal home suffix on a prefix-scoped Site-closed binding", async () => {
    const home = await request("my.provelopment.com", "/acme-co/en-001/");
    expect(home?.page.id).toBe("home");
    expect(home?.canonical).toBe("https://my.provelopment.com/acme-co/en-001");
    expect(home?.alternates.length).toBeGreaterThan(0);
    for (const locale of ["en-001", "fr-fr"]) {
      await expect(request("my.provelopment.com", `/acme-co/${locale}/home`), locale).rejects.toThrow(
        "NOT_FOUND",
      );
    }
    expect((await request("my.provelopment.com", "/acme-co/en-001/about"))?.page.id).toBe("about");
  });

  it("refuses the literal home suffix after a Site-open selector while real Pages still resolve", async () => {
    const home = await request("my.provelopment.com", "/acme-open/outlet/fr-fr/");
    expect(home?.page.id).toBe("home");
    expect(home?.canonical).toBe("https://my.provelopment.com/acme-open/outlet/fr-fr");
    await expect(request("my.provelopment.com", "/acme-open/outlet/fr-fr/home")).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(request("my.provelopment.com", "/acme-open/main/en-001/home")).rejects.toThrow(
      "NOT_FOUND",
    );
    const nested = await request("my.provelopment.com", "/acme-open/main/en-001/products/detail");
    expect(nested?.page.id).toBe("detail");
  });

  it("never binds a contact form to the reserved literal home suffix", async () => {
    // A DISPOSABLE capsule copy gives the Home representation its own `contactForm`, so the hosting seam is genuinely
    // exercised: if the reserved suffix could still resolve the Home Page, it would acquire a pageId/formRef and a
    // submission to `…/home` would be accepted by a page that has no public address.
    //
    // OWNERSHIP AND CLEANUP (GEO-03 R04-C23-R02). The root is owned the instant it exists; population and the
    // assertions run under a guard; and restoration is attempted INDEPENDENTLY of disposal, so a failed `cpSync`, a
    // failed write or a failed assertion cannot leak the directory, while a failed disposal cannot hide the primary
    // failure — both are reported. The earlier form called `rmSync` only after the assertions had succeeded.
    const capsuleBefore = process.env.FOUNDATION_EFS_CAPSULE;
    const headersBefore = new Map(state.headers);
    const root = mkdtempSync(join(tmpdir(), "efs-home-form-"));
    let failure: unknown = null;
    try {
      const capsule = join(root, "capsule");
      cpSync(join(process.cwd(), "tests", "fixtures", "efs", "canonical", "capsule"), capsule, {
        recursive: true,
      });
      writeFileSync(
        join(
          capsule,
          "e_00000000000000000000000000",
          "acme",
          "main",
          "pages",
          "home",
          "en-001.json",
        ),
        JSON.stringify({
          schemaVersion: 1,
          title: "Home with a form",
          sections: [{ type: "contactForm", formRef: "home-form" }],
        }),
        "utf8",
      );
      process.env.FOUNDATION_EFS_CAPSULE = capsule;
      state.headers.set("host", "my.provelopment.com");

      state.headers.set(EFS_REQUEST_PATH_HEADER, "/acme-co/en-001/");
      const canonicalRoot = await efsContactContextForCurrentRequest();
      expect(canonicalRoot?.pageId).toBe("home");
      expect(canonicalRoot?.formRef).toBe("home-form");

      state.headers.set(EFS_REQUEST_PATH_HEADER, "/acme-co/en-001/home");
      const reserved = await efsContactContextForCurrentRequest();
      expect(reserved).not.toBeNull();
      expect(reserved?.pageId).toBeUndefined();
      expect(reserved?.formRef).toBeUndefined();
    } catch (error) {
      failure = error;
    } finally {
      const problems: string[] = [];
      // The environment and the request headers are restored on their OWN, before the directory is touched: they
      // are cheap, they must never depend on a successful removal, and leaving them set would leak into every
      // later case in this file.
      try {
        if (capsuleBefore === undefined) delete process.env.FOUNDATION_EFS_CAPSULE;
        else process.env.FOUNDATION_EFS_CAPSULE = capsuleBefore;
      } catch (error) {
        problems.push("capsule environment: " + String(error));
      }
      try {
        state.headers.clear();
        for (const [key, value] of headersBefore) state.headers.set(key, value);
      } catch (error) {
        problems.push("request headers: " + String(error));
      }
      try {
        rmSync(root, { recursive: true, force: true });
      } catch (error) {
        problems.push("dispose " + root + ": " + String(error));
      }
      if (failure !== null && problems.length > 0) {
        throw new Error(
          "contact fixture: the assertion failed AND teardown failed. primary=" +
            (failure instanceof Error ? failure.message : String(failure)) +
            "; teardown=" +
            problems.join(" | "),
          { cause: failure },
        );
      }
      if (failure !== null) throw failure;
      if (problems.length > 0) throw new Error("contact fixture teardown failed: " + problems.join(" | "));
    }
  });

  it("refuses a publication whose declared Spoke does not own the host-selected context", async () => {
    const directory = mkdtempSync(join(tmpdir(), "efs-owner-"));
    const source = JSON.parse(
      readFileSync(
        join(process.cwd(), "tests", "fixtures", "efs", "canonical", "manifest.json"),
        "utf8",
      ),
    ) as {
      publications: Array<{
        spokeId: string;
        bindings: Array<Record<string, unknown>>;
      }>;
    };
    source.publications[0].spokeId = "germany";
    source.publications[0].bindings[0] = {
      ...source.publications[0].bindings[0],
      host: "foundation-template.provelopment.com",
      prefix: ["acme-co"],
    };
    const manifest = join(directory, "manifest.json");
    writeFileSync(manifest, JSON.stringify(source), "utf8");
    process.env.FOUNDATION_EFS_MANIFEST = manifest;
    await expect(
      request("foundation-template.provelopment.com", "/acme-co/en-001/about"),
    ).rejects.toThrow("NOT_FOUND");
  });
});
