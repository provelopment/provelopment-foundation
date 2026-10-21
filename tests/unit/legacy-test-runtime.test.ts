import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LEGACY_TEST_RUNTIME_ENV,
  legacyTestRuntimeEnabled,
} from "@/app/[[...segments]]/legacy-test-runtime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the isolated released-runtime test utility (R05)", () => {
  it("is enabled only when explicitly requested outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(LEGACY_TEST_RUNTIME_ENV, "1");
    expect(legacyTestRuntimeEnabled()).toBe(true);
  });

  it("cannot be enabled in production, even with the variable set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(LEGACY_TEST_RUNTIME_ENV, "1");
    expect(legacyTestRuntimeEnabled()).toBe(false);
  });

  it("is disabled by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(LEGACY_TEST_RUNTIME_ENV, "");
    expect(legacyTestRuntimeEnabled()).toBe(false);
  });
});
