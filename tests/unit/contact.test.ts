import { describe, expect, it } from "vitest";

import {
  createContactInquirySender,
  createStubContactInquirySender,
} from "@/adapters/contact-inquiry";
import {
  buildWebhookPayload,
  createWebhookContactInquirySender,
} from "@/adapters/contact-inquiry/webhook";
import { handleContactSubmission } from "@/application/contact-inquiry-service";
import type { ContactInquirySender } from "@/application/contact-inquiry-sender";
import {
  contactInquirySchema,
  ContactInquiryMisconfigurationError,
  HONEYPOT_FIELD,
  type ContactInquiry,
  type ContactInquiryOrigin,
} from "@/core/contact-inquiry";

const validValues = (): Record<string, unknown> => ({
  name: "Jane Doe",
  email: "Jane@Example.com",
  subject: "Hello",
  message: "A real message.",
  locale: "en",
});

const validInquiry = (): ContactInquiry => ({
  name: "Jane Doe",
  email: "jane@example.com",
  subject: "Hello",
  message: "A real message.",
  locale: "en",
});

const validOrigin = (): ContactInquiryOrigin => ({
  publicationId: "acme-publication",
  bindingId: "acme-primary",
  entityId: "e_00000000000000000000000001",
  facetId: "website",
  siteId: "main",
  locale: "en",
  host: "www.example.test",
  path: "/en/contact",
});

/** fetch stub: Response-shaped object; `ok` mirrors the caller. */
function fetchReturning(ok: boolean): typeof fetch {
  return (async () => ({ ok })) as unknown as typeof fetch;
}

function fetchCapturing(capture: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: unknown, init?: unknown) => {
    capture(String(url), (init ?? {}) as RequestInit);
    return { ok: true };
  }) as unknown as typeof fetch;
}

function fetchThrowing(error: Error): typeof fetch {
  return (async () => {
    throw error;
  }) as unknown as typeof fetch;
}

describe("contactInquirySchema (validation limits)", () => {
  it("accepts a valid inquiry and normalizes name/email", () => {
    const result = contactInquirySchema.safeParse(validValues());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane@example.com"); // trimmed + lowercased
      expect(result.data.name).toBe("Jane Doe");
    }
  });

  it("rejects an empty name and empty message", () => {
    for (const overrides of [{ name: "   " }, { message: "" }]) {
      const result = contactInquirySchema.safeParse({ ...validValues(), ...overrides });
      expect(result.success).toBe(false);
    }
  });

  it("rejects an invalid email", () => {
    const result = contactInquirySchema.safeParse({ ...validValues(), email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("enforces payload size limits", () => {
    const tooLongMessage = contactInquirySchema.safeParse({
      ...validValues(),
      message: "x".repeat(5001),
    });
    expect(tooLongMessage.success).toBe(false);

    const tooLongName = contactInquirySchema.safeParse({
      ...validValues(),
      name: "x".repeat(121),
    });
    expect(tooLongName.success).toBe(false);
  });

  it("treats subject as optional", () => {
    const values = validValues();
    delete values.subject;
    const result = contactInquirySchema.safeParse(values);
    expect(result.success).toBe(true);
  });
});

describe("buildWebhookPayload (minimal external contract)", () => {
  it("includes the inquiry data plus correlation id and timestamp", () => {
    const payload = buildWebhookPayload(validInquiry());
    expect(payload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(payload.name).toBe("Jane Doe");
    expect(payload.email).toBe("jane@example.com");
    expect(payload.subject).toBe("Hello");
    expect(payload.message).toBe("A real message.");
    expect(payload.locale).toBe("en");
    expect(Number.isNaN(Date.parse(payload.submittedAt))).toBe(false);
  });

  it("omits the subject when absent", () => {
    const payload = buildWebhookPayload({ ...validInquiry(), subject: undefined });
    expect(Object.hasOwn(payload, "subject")).toBe(false);
  });

  it("adds server-derived publication origin only when supplied", () => {
    const withOrigin = buildWebhookPayload(validInquiry(), validOrigin());
    expect(withOrigin.origin).toEqual(validOrigin());
    expect(withOrigin.origin).not.toHaveProperty("filesystemPath");
    expect(withOrigin.origin).not.toHaveProperty("token");
    expect(Object.hasOwn(buildWebhookPayload(validInquiry()), "origin")).toBe(false);
  });

  it("sends no visitor telemetry (no ip/ua/cookies/referrer)", () => {
    const telemetryKeys = ["ip", "ipAddress", "userAgent", "cookie", "cookies", "referrer", "headers"];
    const payload = buildWebhookPayload(validInquiry());
    for (const key of Object.keys(payload)) {
      expect(telemetryKeys).not.toContain(key);
    }
  });
});
describe("webhook adapter", () => {
  it("reports success when the receiver responds 2xx", async () => {
    const sender = createWebhookContactInquirySender({
      url: "https://example.test/hook",
      fetchImpl: fetchReturning(true),
    });
    await expect(sender.send(validInquiry())).resolves.toEqual({ ok: true });
  });

  it("reports an adapter error on a non-2xx response", async () => {
    const sender = createWebhookContactInquirySender({
      url: "https://example.test/hook",
      fetchImpl: fetchReturning(false),
    });
    await expect(sender.send(validInquiry())).resolves.toEqual({
      ok: false,
      kind: "adapterError",
    });
  });

  it("reports an adapter error on network/timeout failure without throwing", async () => {
    const sender = createWebhookContactInquirySender({
      url: "https://example.test/hook",
      fetchImpl: fetchThrowing(new Error("ECONNRESET")),
    });
    await expect(sender.send(validInquiry())).resolves.toEqual({
      ok: false,
      kind: "adapterError",
    });
  });

  it("POSTs JSON with the payload id and optional bearer token", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit = {};
    const sender = createWebhookContactInquirySender({
      url: "https://example.test/hook",
      token: "secret-token",
      fetchImpl: fetchCapturing((url, init) => {
        capturedUrl = url;
        capturedInit = init;
      }),
    });

    await sender.send(validInquiry(), validOrigin());

    expect(capturedUrl).toBe("https://example.test/hook");
    expect(capturedInit.method).toBe("POST");
    const headers = capturedInit.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["authorization"]).toBe("Bearer secret-token");
    const body = JSON.parse(String(capturedInit.body)) as Record<string, unknown>;
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.name).toBe("Jane Doe");
    expect(body.origin).toEqual(validOrigin());
  });
});

describe("stub adapter", () => {
  it("explicitly reports demo/unconfigured — never a real delivery", async () => {
    const sender = createStubContactInquirySender();
    await expect(sender.send(validInquiry())).resolves.toEqual({
      ok: false,
      kind: "unconfiguredDemo",
    });
  });
});
describe("createContactInquirySender (factory)", () => {
  it("defaults to the stub when no feature is configured", async () => {
    const sender = createContactInquirySender(undefined, {});
    await expect(sender.send(validInquiry())).resolves.toEqual({
      ok: false,
      kind: "unconfiguredDemo",
    });
  });

  it("keeps an explicit stub provider as the demo stub", async () => {
    const sender = createContactInquirySender({ provider: "stub" }, {});
    await expect(sender.send(validInquiry())).resolves.toEqual({
      ok: false,
      kind: "unconfiguredDemo",
    });
  });

  it("throws loudly when webhook is configured without an endpoint (never silent stub)", () => {
    expect(() => createContactInquirySender({ provider: "webhook" }, {})).toThrow(
      ContactInquiryMisconfigurationError,
    );
  });

  it("refuses non-HTTPS non-loopback webhook endpoints", () => {
    expect(() =>
      createContactInquirySender({ provider: "webhook" }, { webhookUrl: "http://example.test/hook" }),
    ).toThrow(/https/);
  });

describe("handleContactSubmission (orchestration)", () => {
  function senderReturning(
    result: Awaited<ReturnType<ContactInquirySender["send"]>>,
  ): ContactInquirySender {
    return { async send() { return result; } };
  }

  it("discards a honeypot-filled submission without invoking the sender", async () => {
    let invoked = false;
    const state = await handleContactSubmission({
      values: { ...validValues(), [HONEYPOT_FIELD]: "spam" },
      createSender() {
        invoked = true;
        return senderReturning({ ok: true });
      },
    });

    expect(state.status).toBe("botDiscarded");
    expect(invoked).toBe(false);
  });

  it("returns field-level validation errors for invalid submissions", async () => {
    const state = await handleContactSubmission({
      values: { ...validValues(), email: "bad" },
      createSender: () => senderReturning({ ok: true }),
    });

    expect(state).toMatchObject({ status: "validationError", fieldErrors: { email: true } });
  });

  it("forwards the server-derived origin to the sender", async () => {
    let seenOrigin: ContactInquiryOrigin | undefined;
    const state = await handleContactSubmission({
      values: validValues(),
      origin: validOrigin(),
      createSender: () => ({
        async send(_inquiry, origin) {
          seenOrigin = origin;
          return { ok: true };
        },
      }),
    });
    expect(state.status).toBe("success");
    expect(seenOrigin).toEqual(validOrigin());
  });

  it("maps stub outcome to the explicit demo state", async () => {
    const state = await handleContactSubmission({
      values: validValues(),
      createSender: () => createStubContactInquirySender(),
    });
    expect(state.status).toBe("unconfiguredDemo");
  });

  it("maps a 2xx webhook acceptance to success", async () => {
    const state = await handleContactSubmission({
      values: validValues(),
      createSender: () =>
        createWebhookContactInquirySender({
          url: "https://example.test/hook",
          fetchImpl: fetchReturning(true),
        }),
    });
    expect(state.status).toBe("success");
  });

  it("maps adapter failure to a send error", async () => {
    const state = await handleContactSubmission({
      values: validValues(),
      createSender: () =>
        createWebhookContactInquirySender({
          url: "https://example.test/hook",
          fetchImpl: fetchReturning(false),
        }),
    });
    expect(state.status).toBe("sendError");
  });

  it("surfaces misconfiguration as configError without invoking a sender", async () => {
    const messages: string[] = [];
    const state = await handleContactSubmission({
      values: validValues(),
      createSender: () => createContactInquirySender({ provider: "webhook" }, {}),
      log: (message) => messages.push(message),
    });

    expect(state.status).toBe("configError");
    expect(messages.length).toBe(1);
    expect(messages[0]).toMatch(/CONTACT_WEBHOOK_URL/);
  });

  it("rethrows unexpected sender-construction errors (non-misconfiguration)", async () => {
    await expect(
      handleContactSubmission({
        values: validValues(),
        createSender: () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
  });
});
  it("allows loopback HTTP endpoints for local development", async () => {
    const sender = createContactInquirySender(
      { provider: "webhook" },
      { webhookUrl: "http://localhost:8787/hook" },
    );
    // Real path taken (not the stub): with nothing listening, transport fails.
    await expect(sender.send(validInquiry())).resolves.toEqual({
      ok: false,
      kind: "adapterError",
    });
  });
});