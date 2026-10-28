/**
 * THE FORM'S TWO IDENTITIES AND ITS PRIVATE POLICY (FOUNDATION-RELEASE-CANDIDATE-A6)
 * ==================================================================================
 *
 * A5 shipped a Site-identity defect (`sites[].code`, the presentation code `ww`, compared against the EFS Site
 * id `main`) and shipped no test that would have caught it. These cases are that test, and they are written so
 * they fail if the defect ever returns:
 *
 *   - a presentation Site code and an EFS Site id are DIFFERENT identities that coexist;
 *   - the authored record is reached by the EFS Site id only;
 *   - an EFS Site that authors no record answers undefined rather than inheriting one;
 *   - another Spoke's Site with the same id reaches nothing, because the configuration it is asked of is the
 *     OTHER Spoke's own file;
 *   - the private policy is read from the OWNING Spoke's own root, at one fixed path, and every failure mode
 *     (missing file, unreadable JSON, wrong shape, unlisted Site, another Spoke's root) answers undefined - no
 *     sender, no send.
 *
 * The configuration objects here are TEST-OWNED and deliberately minimal: the loader's schema is proved by the
 * config loader's own tests, and this file is about the RESOLUTION CONTRACT.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { contactFormRecordForSite } from "@/config/contact-form-record";
import {
  contactFormPolicyAuthorized,
  contactFormPolicyForSite,
  contactFormPolicyPathFor,
} from "@/config/contact-form-policy";
import type { SiteConfig } from "@/config/site-config";

const roots: string[] = [];

function spokeRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `a6-${name}-`));
  roots.push(root);
  return root;
}

function policyAt(root: string, body: unknown): void {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    contactFormPolicyPathFor(root),
    typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`,
    "utf8",
  );
}

function configWith(record: unknown | undefined, siteCode: string): SiteConfig {
  return {
    sites: [{ code: siteCode }],
    ...(record === undefined ? {} : { communication: { contactForms: record } }),
  } as unknown as SiteConfig;
}

const validRecord = {
  formRef: "test-contact",
  enabled: true,
  mode: "simple",
  transport: "offline",
  placement: { page: "contact" },
  authorizationRefs: ["test-binding"],
};

const validPolicy = {
  schemaVersion: 1,
  sites: {
    main: {
      recipients: [{ address: "demonstration@example.com", kind: "to" }],
      sender: { fromAddress: "website@example.com", fromDisplayName: "Test", replyTo: "visitor" },
    },
  },
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the record is keyed by the VERIFIED EFS Site id", () => {
  it("reaches the record by EFS id even when the presentation code differs", () => {
    const config = configWith({ main: validRecord }, "ww");
    expect(contactFormRecordForSite(config, "main")?.formRef).toBe("test-contact");
  });

  it("does not reach the record through the presentation code", () => {
    const config = configWith({ main: validRecord }, "ww");
    // `ww` is a presentation code, not an authorization identity: it must never select a form.
    expect(contactFormRecordForSite(config, "ww")).toBeUndefined();
  });

  it("answers undefined for an EFS Site that authors no record", () => {
    expect(contactFormRecordForSite(configWith(undefined, "ww"), "main")).toBeUndefined();
    expect(contactFormRecordForSite(configWith({ other: validRecord }, "ww"), "main")).toBeUndefined();
  });

  it("cannot inherit another Spoke's record for the same Site id", () => {
    // Both reference Spokes declare a Site `main`; each is asked of ITS OWN configuration.
    const foundation = configWith({ main: validRecord }, "ww");
    const germany = configWith(undefined, "de");
    expect(contactFormRecordForSite(foundation, "main")?.formRef).toBe("test-contact");
    expect(contactFormRecordForSite(germany, "main")).toBeUndefined();
  });
});

describe("the private policy belongs to the owning Spoke's own root", () => {
  it("reads an authorized Site's policy from the fixed supported path", () => {
    const root = spokeRoot("owner");
    policyAt(root, validPolicy);
    expect(contactFormPolicyPathFor(root).endsWith(join("config", "contact-form-policy.json"))).toBe(true);
    expect(contactFormPolicyAuthorized(root, "main")).toBe(true);
    expect(contactFormPolicyForSite(root, "main")?.recipients).toHaveLength(1);
  });

  it("answers undefined when the Spoke authors no policy file", () => {
    const root = spokeRoot("empty");
    mkdirSync(root, { recursive: true });
    expect(contactFormPolicyForSite(root, "main")).toBeUndefined();
  });

  it("answers undefined for malformed JSON, an invalid shape or an unknown schema version", () => {
    const malformed = spokeRoot("malformed");
    policyAt(malformed, "{ not json");
    expect(contactFormPolicyForSite(malformed, "main")).toBeUndefined();

    const invalid = spokeRoot("invalid");
    policyAt(invalid, { schemaVersion: 1, sites: { main: { recipients: [] } } });
    expect(contactFormPolicyForSite(invalid, "main")).toBeUndefined();

    const future = spokeRoot("future");
    policyAt(future, { schemaVersion: 2, sites: {} });
    expect(contactFormPolicyForSite(future, "main")).toBeUndefined();
  });

  it("answers undefined for a Site the policy does not name, and never for another Spoke's root", () => {
    const foundation = spokeRoot("foundation");
    policyAt(foundation, validPolicy);
    const germany = spokeRoot("germany");
    mkdirSync(germany, { recursive: true });

    expect(contactFormPolicyForSite(foundation, "secondary")).toBeUndefined();
    expect(contactFormPolicyForSite(germany, "main")).toBeUndefined();
  });
});
