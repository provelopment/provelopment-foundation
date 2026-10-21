import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

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

const installation = materializeEfsInstallation({ mode: "flat", spokes: ["acme-spoke"] });
const configPath = join(installation.root, "spokes", "acme-spoke", "site.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as {
  features: { contact: Record<string, unknown> };
};
config.features.contact = { provider: "webhook" };
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const manifestPath = join(installation.root, "manifest.json");
const manifest = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests", "fixtures", "efs", "canonical", "manifest.json"),
    "utf8",
  ),
) as {
  publications: Array<{
    id: string;
    bindings: Array<Record<string, unknown>>;
  }>;
};
const managed = manifest.publications.find((publication) => publication.id === "acme-managed");
if (!managed) throw new Error("the canonical fixture must declare acme-managed");
managed.bindings[0] = { ...managed.bindings[0], host: "efs-only.example" };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

selectEfsInstallation(installation.root);
vi.resetModules();
process.env.FOUNDATION_EFS_MANIFEST = manifestPath;
process.env.FOUNDATION_EFS_CAPSULE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "efs",
  "canonical",
  "capsule",
);
process.env.CONTACT_WEBHOOK_URL = "https://receiver.example.test/inquiries";
process.env.CONTACT_WEBHOOK_TOKEN = "test-token";

const { submitContactInquiry } = await import("@/app/contact-actions");
const { initialContactSubmissionState } = await import(
  "@/application/contact-inquiry-service"
);

afterAll(() => installation.cleanup());

function submission(): FormData {
  const form = new FormData();
  form.set("name", "Jane Doe");
  form.set("email", "jane@example.test");
  form.set("subject", "EFS host");
  form.set("message", "This inquiry belongs to the publication owner.");
  form.set("locale", "en-001");
  form.set("website", "");
  return form;
}

describe("EFS contact action ownership (FOUNDATION-COMPLETE-A1)", () => {
  it("resolves an EFS-only host through the publication owner and uses its webhook", async () => {
    state.headers.set("host", "efs-only.example");
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return { ok: true };
      },
    );

    const result = await submitContactInquiry(initialContactSubmissionState, submission());
    expect(result.status).toBe("success");
    expect(capturedUrl).toBe("https://receiver.example.test/inquiries");
    vi.unstubAllGlobals();
  });

  it("does not borrow a legacy Spoke for a host the EFS manifest does not claim", async () => {
    state.headers.set("host", "unclaimed.example");
    await expect(
      submitContactInquiry(initialContactSubmissionState, submission()),
    ).rejects.toThrow(/no Spoke answers this request's host/);
  });
});
