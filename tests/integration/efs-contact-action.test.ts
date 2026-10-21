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

const installation = materializeEfsInstallation({
  mode: "flat",
  spokes: ["acme-spoke", "beta-spoke", "client-a", "client_a"],
});

const acmeConfigPath = join(installation.root, "spokes", "acme-spoke", "site.config.json");
const betaConfigPath = join(installation.root, "spokes", "beta-spoke", "site.config.json");
const collisionConfigPaths = ["client-a", "client_a"].map((spoke) =>
  join(installation.root, "spokes", spoke, "site.config.json"),
);

interface ConfigShape {
  features: { contact: Record<string, unknown> };
}

const acmeConfig = JSON.parse(readFileSync(acmeConfigPath, "utf8")) as ConfigShape;
acmeConfig.features.contact = { provider: "webhook" };
writeFileSync(acmeConfigPath, `${JSON.stringify(acmeConfig, null, 2)}\n`, "utf8");

const betaConfig = JSON.parse(readFileSync(betaConfigPath, "utf8")) as ConfigShape;
betaConfig.features.contact = { provider: "webhook" };
writeFileSync(betaConfigPath, `${JSON.stringify(betaConfig, null, 2)}\n`, "utf8");

for (const configPath of collisionConfigPaths) {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as ConfigShape;
  config.features.contact = { provider: "webhook" };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

const capsuleRoot = mkdtempSync(join(tmpdir(), "efs-contact-capsule-"));
cpSync(join(process.cwd(), "tests", "fixtures", "efs", "canonical", "capsule"), capsuleRoot, {
  recursive: true,
});
const originalEntityId = "e_00000000000000000000000000";
const secondEntityId = "e_00000000000000000000000004";
cpSync(join(capsuleRoot, originalEntityId), join(capsuleRoot, secondEntityId), { recursive: true });

const manifestPath = join(installation.root, "manifest.json");
interface ManifestShape {
  entities: Array<{ id: string; [key: string]: unknown }>;
  publications: Array<{
    id: string;
    spokeId: string;
    entityId: string;
    facetId: string;
    bindings: Array<Record<string, unknown>>;
  }>;
}

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "efs", "canonical", "manifest.json"), "utf8"),
) as ManifestShape;

const originalEntity = manifest.entities[0];
if (!originalEntity) throw new Error("the canonical fixture must declare an Entity");
manifest.entities.push({ ...structuredClone(originalEntity), id: secondEntityId });

const acmePublication = manifest.publications.find((publication) => publication.id === "acme-managed");
if (!acmePublication) throw new Error("the canonical fixture must declare acme-managed");
acmePublication.bindings[0] = {
  ...acmePublication.bindings[0],
  host: "shared.example",
  prefix: ["acme-co"],
};

const betaPublication = {
  ...structuredClone(acmePublication),
  id: "beta-managed",
  spokeId: "beta-spoke",
  bindings: [
    {
      ...structuredClone(acmePublication.bindings[0]),
      id: "beta-managed-web",
      host: "shared.example",
      prefix: ["beta-co"],
    },
  ],
};
manifest.publications.push(betaPublication);

const secondEntityPublication = {
  ...structuredClone(acmePublication),
  id: "acme-secondary",
  entityId: secondEntityId,
  bindings: [
    {
      ...structuredClone(acmePublication.bindings[0]),
      id: "acme-secondary-web",
      host: "shared.example",
      prefix: ["gamma-co"],
    },
  ],
};
manifest.publications.push(secondEntityPublication);

for (const [spokeId, host, publicationId] of [
  ["client-a", "client-a.example", "client-a-managed"],
  ["client_a", "client-underscore.example", "client-underscore-managed"],
] as const) {
  manifest.publications.push({
    ...structuredClone(acmePublication),
    id: publicationId,
    spokeId,
    bindings: [
      {
        ...structuredClone(acmePublication.bindings[0]),
        id: `${publicationId}-web`,
        host,
        prefix: ["client"],
      },
    ],
  });
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

selectEfsInstallation(installation.root);
vi.resetModules();
process.env.FOUNDATION_EFS_MANIFEST = manifestPath;
process.env.FOUNDATION_EFS_CAPSULE = capsuleRoot;
process.env.CONTACT_WEBHOOK_URL = "https://receiver.example.test/inquiries";
process.env.CONTACT_WEBHOOK_TOKEN = "test-token";
process.env.CONTACT_WEBHOOK_URL__ACME_SPOKE = "https://acme.example.test/inquiries";
process.env.CONTACT_WEBHOOK_URL__BETA_SPOKE = "https://beta.example.test/inquiries";

const { submitContactInquiry } = await import("@/app/contact-actions");
const { initialContactSubmissionState } = await import("@/application/contact-inquiry-service");

afterAll(() => {
  installation.cleanup();
  rmSync(capsuleRoot, { recursive: true, force: true });
  delete process.env.CONTACT_WEBHOOK_URL;
  delete process.env.CONTACT_WEBHOOK_TOKEN;
  delete process.env.CONTACT_WEBHOOK_URL__ACME_SPOKE;
  delete process.env.CONTACT_WEBHOOK_URL__BETA_SPOKE;
  delete process.env.CONTACT_WEBHOOK_URL__CLIENT_A;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CONTACT_WEBHOOK_URL__CLIENT_A;
});

function setRequest(host: string, pathname: string): void {
  state.headers.set("host", host);
  state.headers.set(EFS_REQUEST_PATH_HEADER, pathname);
}

function submission(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "Jane Doe");
  form.set("email", "jane@example.test");
  form.set("subject", "EFS host");
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

describe("EFS contact publication ownership (FOUNDATION-COMPLETE-A1-R1)", () => {
  it("resolves one dedicated binding-only host through its publication owner", async () => {
    setRequest("www.acme-co.com", "/en-001/about");
    const { fetch, captured } = webhookFetch();

    const result = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(result.status).toBe("success");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(captured()).toBe("https://acme.example.test/inquiries");
  });

  it("resolves two independent Spokes sharing one host by their own binding prefix", async () => {
    setRequest("shared.example", "/acme-co/en-001/about");
    const { fetch, captured, bodies } = webhookFetch();
    const acme = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(acme.status).toBe("success");
    expect(captured()).toBe("https://acme.example.test/inquiries");
    expect(bodies()[0]?.origin).toEqual({
      publicationId: "acme-managed",
      bindingId: "managed-acme",
      entityId: originalEntityId,
      facetId: "acme",
      siteId: "main",
      locale: "en-001",
      host: "shared.example",
      path: "/acme-co/en-001/about",
    });

    setRequest("shared.example", "/beta-co/en-001/about");
    const beta = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(beta.status).toBe("success");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(captured()).toBe("https://beta.example.test/inquiries");
    expect(bodies()[1]?.origin).toEqual({
      publicationId: "beta-managed",
      bindingId: "beta-managed-web",
      entityId: originalEntityId,
      facetId: "acme",
      siteId: "main",
      locale: "en-001",
      host: "shared.example",
      path: "/beta-co/en-001/about",
    });
  });

  it("falls back to the installation-wide receiver when a Spoke override is absent", async () => {
    delete process.env.CONTACT_WEBHOOK_URL__ACME_SPOKE;
    setRequest("www.acme-co.com", "/en-001/about");
    const { captured } = webhookFetch();

    const result = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(result.status).toBe("success");
    expect(captured()).toBe("https://receiver.example.test/inquiries");
    process.env.CONTACT_WEBHOOK_URL__ACME_SPOKE = "https://acme.example.test/inquiries";
  });

  it("has no destination for an unclaimed host or an unclaimed prefix", async () => {
    setRequest("shared.example", "/unclaimed/en-001/about");
    await expect(
      submitContactInquiry(initialContactSubmissionState, submission()),
    ).rejects.toThrow(/no Spoke answers this request's host/);

    setRequest("unclaimed.example", "/en-001/about");
    await expect(
      submitContactInquiry(initialContactSubmissionState, submission()),
    ).rejects.toThrow(/no Spoke answers this request's host/);
  });

  it("ignores forged form fields, publication IDs and EntityIDs", async () => {
    setRequest("shared.example", "/acme-co/en-001/about");
    const { captured, bodies } = webhookFetch();

    const result = await submitContactInquiry(
      initialContactSubmissionState,
      submission({
        publicationId: "beta-managed",
        spokeId: "beta-spoke",
        entityId: secondEntityId,
        pathname: "/beta-co/en-001/about",
        host: "beta.example",
      }),
    );
    expect(result.status).toBe("success");
    expect(captured()).toBe("https://acme.example.test/inquiries");
    expect(bodies()[0]?.origin).toMatchObject({
      publicationId: "acme-managed",
      entityId: originalEntityId,
      host: "shared.example",
      path: "/acme-co/en-001/about",
    });
  });

  it("keeps two Entities in one Spoke on that Spoke's intentional shared receiver", async () => {
    setRequest("shared.example", "/gamma-co/en-001/about");
    const { captured, bodies } = webhookFetch();

    const result = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(result.status).toBe("success");
    expect(captured()).toBe("https://acme.example.test/inquiries");
    expect(bodies()[0]?.origin).toMatchObject({
      publicationId: "acme-secondary",
      bindingId: "acme-secondary-web",
      entityId: secondEntityId,
      siteId: "main",
      path: "/gamma-co/en-001/about",
    });
  });

  it("refuses to guess an owner when the trusted request path is absent", async () => {
    state.headers.set("host", "shared.example");
    state.headers.delete(EFS_REQUEST_PATH_HEADER);
    await expect(
      submitContactInquiry(initialContactSubmissionState, submission()),
    ).rejects.toThrow(/no Spoke answers this request's host/);
  });

  it("fails explicitly when flat identities collide on one legacy receiver key", async () => {
    process.env.CONTACT_WEBHOOK_URL__CLIENT_A = "https://legacy.example.test/inquiries";
    setRequest("client-a.example", "/client/en-001/about");

    const result = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(result.status).toBe("configError");
  });

  it("does not let a visitor field choose the encoded receiver key", async () => {
    setRequest("client-underscore.example", "/client/en-001/about");
    const { captured } = webhookFetch();

    const result = await submitContactInquiry(
      initialContactSubmissionState,
      submission({ receiverKey: "CLIENT_A", spokeKey: "CLIENT_A" }),
    );
    expect(result.status).toBe("success");
    expect(captured()).toBe("https://receiver.example.test/inquiries");
  });
});
