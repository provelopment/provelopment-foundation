/**
 * THE THREE PRESENTATION DECLARATIONS — `GEO-04 R13`
 * ==================================================
 *
 * A publication's `presentationSiteCode` has three distinct meanings, and the difference is a security and
 * no-loss boundary, not a formatting preference:
 *
 *   absent            -> the intentional EFS-only document: 200, no borrowed chrome, no invented Site;
 *   declared          -> the shared shell composes from that Site;
 *   declared but NOT declared by the owning Spoke -> REFUSAL (sanctioned public not-found), never a
 *                       chrome-less 200 and never another owner's Site, locale, default or address.
 *
 * These cases are asserted directly against the published classifier so a future edit cannot quietly
 * collapse `invalid` into `efs-only` — which is exactly what made an undeclared code look like a legitimate
 * EFS-only page in the R11/R12 verification runs.
 */
import { describe, expect, it } from "vitest";

import type { SiteConfig } from "@/config/site-config";
import type { EfsView } from "../../src/app/[[...segments]]/efs-request";
import {
  EfsPresentationRefusal,
  efsPresentationDeclaration,
  efsShellPresentationConfig,
} from "../../src/app/[[...segments]]/server-composition";

/** The owning Spoke's own declarations: two descriptive presentation Sites, nothing else. */
const source = {
  name: "Runtime Cut",
  sites: [{ code: "main" }, { code: "outlet" }],
} as unknown as SiteConfig;

function viewWith(presentationSiteCode: string | undefined, spokeId = "runtime-cut-spoke"): EfsView {
  return { publication: { presentationSiteCode, spokeId } } as unknown as EfsView;
}

describe("EFS presentation declarations", () => {
  it("treats an ABSENT code as the intentional EFS-only document", () => {
    expect(efsPresentationDeclaration(source, viewWith(undefined))).toEqual({ kind: "efs-only" });
    // The shared shell is not composed — and that is not a failure, so nothing is thrown.
    expect(efsShellPresentationConfig(source, viewWith(undefined))).toBeNull();
  });

  it("accepts a code the owning Spoke actually declares", () => {
    expect(efsPresentationDeclaration(source, viewWith("main"))).toEqual({
      kind: "declared",
      code: "main",
    });
    expect(efsPresentationDeclaration(source, viewWith("outlet"))).toEqual({
      kind: "declared",
      code: "outlet",
    });
  });

  it("refuses an explicit code the owning Spoke does not declare", () => {
    expect(efsPresentationDeclaration(source, viewWith("atlantis"))).toEqual({
      kind: "invalid",
      code: "atlantis",
    });
    expect(() => efsShellPresentationConfig(source, viewWith("atlantis"))).toThrow(
      EfsPresentationRefusal,
    );
  });

  it("refuses another Spoke's Site rather than borrowing its identity", () => {
    // `ca` is a real presentation key elsewhere in the programme; it is NOT this Spoke's declaration.
    const borrow = viewWith("ca", "some-other-spoke");
    expect(efsPresentationDeclaration(source, borrow)).toEqual({ kind: "invalid", code: "ca" });
    try {
      efsShellPresentationConfig(source, borrow);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(EfsPresentationRefusal);
      expect((error as EfsPresentationRefusal).presentationSiteCode).toBe("ca");
      expect((error as EfsPresentationRefusal).spokeId).toBe("some-other-spoke");
    }
  });

  it("is case-sensitive: a differently-cased code is not a declaration", () => {
    expect(efsPresentationDeclaration(source, viewWith("Main"))).toEqual({
      kind: "invalid",
      code: "Main",
    });
  });

  it("never collapses an invalid declaration into the EFS-only document", () => {
    for (const code of ["atlantis", "ca", "Main", "ww"]) {
      const declaration = efsPresentationDeclaration(source, viewWith(code));
      expect(declaration.kind).toBe("invalid");
      expect(() => efsShellPresentationConfig(source, viewWith(code))).toThrow(
        EfsPresentationRefusal,
      );
    }
  });
});
