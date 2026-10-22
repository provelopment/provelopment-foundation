import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

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

import { EFS_REQUEST_PATH_HEADER } from "@/config/efs/request-path";
import { materializeEfsInstallation, selectEfsInstallation } from "../support/efs-installation";

/**
 * The two identities the accepted R2F encoding collapsed into one receiver key:
 *
 *   Hub "a--b" + Spoke "c"  vs  Hub "a" + Spoke "b--c"
 *
 * This test materialises BOTH as real declared Spokes, gives each its own publication binding,
 * verifies each configured receiver is selected, and verifies each webhook body carries the origin
 * of the publication that the trusted host/path actually resolved. It also proves the old lossy
 * legacy key fails explicitly rather than delivering one owner's inquiry to the other.
 */
const installation = materializeEfsInstallation({
  mode: "hubs",
  hubs: [
    { id: "a--b", spokes: ["c"] },
    { id: "a", spokes: ["b--c"] },
  ],
});

const topology = JSON.parse(
  readFileSync(join(installation.root, "spokes.json"), "utf8"),
) as {
  spokeHubs: Array<{ id: string; spokes: Array<{ id: string; root: string }> }>;
};

for (const hub of topology.spokeHubs) {
  for (const spoke of hub.spokes) {
    const configPath = join(installation.root, ...spoke.root.split("/"), "site.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      features: { contact: Record<string, unknown> };
    };
    config.features.contact = { provider: "webhook" };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
}

const firstHost = "a--b-c.fixture.test";
const secondHost = "a-b--c.fixture.test";
const firstKey = "__ENC_HUB_612D2D62__63";
const secondKey = "__ENC_HUB_61__622D2D63";
const firstUrl = "https://first-hub.example.test/inquiries";
const secondUrl = "https://second-hub.example.test/inquiries";

const capsuleRoot = mkdtempSync(join(tmpdir(), "efs-contact-hub-capsule-"));
cpSync(join(process.cwd(), "tests", "fixtures", "efs", "canonical", "capsule"), capsuleRoot, {
  recursive: true,
});

const manifestPath = join(installation.root, "manifest.json");
const sourceManifest = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "efs", "canonical", "manifest.json"), "utf8"),
) as {
  entities: unknown[];
  publications: Array<{
    id: string;
    spokeId: string;
    spokeHubId?: string;
    bindings: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }>;
};
const template = sourceManifest.publications.find((publication) => publication.id === "acme-managed");
if (!template) throw new Error("the canonical fixture must declare acme-managed");

const firstBinding = {
  ...structuredClone(template.bindings[0]),
  id: "first-hub-web",
  host: firstHost,
  prefix: [],
};
const secondBinding = {
  ...structuredClone(template.bindings[0]),
  id: "second-hub-web",
  host: secondHost,
  prefix: [],
};

sourceManifest.publications = [
  {
    ...structuredClone(template),
    id: "first-hub-managed",
    spokeHubId: "a--b",
    spokeId: "c",
    bindings: [firstBinding],
  },
  {
    ...structuredClone(template),
    id: "second-hub-managed",
    spokeHubId: "a",
    spokeId: "b--c",
    bindings: [secondBinding],
  },
];
writeFileSync(manifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`, "utf8");

selectEfsInstallation(installation.root);
vi.resetModules();
process.env.FOUNDATION_EFS_MANIFEST = manifestPath;
process.env.FOUNDATION_EFS_CAPSULE = capsuleRoot;
process.env.CONTACT_WEBHOOK_URL = "https://fallback.example.test/inquiries";
process.env.CONTACT_WEBHOOK_TOKEN = "test-token";
process.env[`CONTACT_WEBHOOK_URL__${firstKey}`] = firstUrl;
process.env[`CONTACT_WEBHOOK_URL__${secondKey}`] = secondUrl;

const { submitContactInquiry } = await import("@/app/contact-actions");
const { initialContactSubmissionState } = await import("@/application/contact-inquiry-service");

afterAll(() => {
  installation.cleanup();
  rmSync(capsuleRoot, { recursive: true, force: true });
  delete process.env.CONTACT_WEBHOOK_URL;
  delete process.env.CONTACT_WEBHOOK_TOKEN;
  delete process.env[`CONTACT_WEBHOOK_URL__${firstKey}`];
  delete process.env[`CONTACT_WEBHOOK_URL__${secondKey}`];
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CONTACT_WEBHOOK_URL__A_B_C;
});

function setRequest(host: string, pathname: string): void {
  state.headers.set("host", host);
  state.headers.set(EFS_REQUEST_PATH_HEADER, pathname);
}

function submission(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "Jane Doe");
  form.set("email", "jane@example.test");
  form.set("subject", "Hub receiver identity");
  form.set("message", "This inquiry belongs to the publication owner.");
  form.set("locale", "en-001");
  form.set("website", "");
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

function webhookFetch() {
  let captured = "";
  const bodies: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    captured = String(input);
    if (init?.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    return { ok: true };
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, captured: () => captured, bodies: () => bodies };
}

describe("identified-Hub contact receiver identity (FOUNDATION-COMPLETE-A1-R2F-C1)", () => {
  it("selects each separately configured receiver and preserves each verified origin", async () => {
    const firstFetch = webhookFetch();
    setRequest(firstHost, "/en-001/about");
    const first = await submitContactInquiry(
      initialContactSubmissionState,
      submission({ receiverKey: secondKey, spokeKey: secondKey }),
    );
    expect(first.status).toBe("success");
    expect(firstFetch.captured()).toBe(firstUrl);
    expect(firstFetch.bodies()[0]?.origin).toMatchObject({
      publicationId: "first-hub-managed",
      bindingId: "first-hub-web",
      host: firstHost,
      path: "/en-001/about",
    });

    vi.unstubAllGlobals();
    const secondFetch = webhookFetch();
    setRequest(secondHost, "/en-001/about");
    const second = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(second.status).toBe("success");
    expect(secondFetch.captured()).toBe(secondUrl);
    expect(secondFetch.bodies()[0]?.origin).toMatchObject({
      publicationId: "second-hub-managed",
      bindingId: "second-hub-web",
      host: secondHost,
      path: "/en-001/about",
    });
  });

  it("fails explicitly when the old lossy key is configured for both owners", async () => {
    process.env.CONTACT_WEBHOOK_URL__A_B_C = "https://ambiguous.example.test/inquiries";
    setRequest(firstHost, "/en-001/about");

    const result = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(result.status).toBe("configError");
  });
});
