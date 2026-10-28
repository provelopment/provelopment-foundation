/**
 * THE COMMUNICATION BLOCK MUST SURVIVE NORMALIZATION — AND STAY KEYED BY EFS SITE ID
 * =================================================================================
 * FOUNDATION-CONNECT-MODULE-INTEGRATION-A9-R02 §1 and §2.
 *
 * A schema that ACCEPTS a block proves nothing on its own: `parseSiteConfig` builds the runtime
 * `SiteConfig` as an explicit literal, so a validated field the normalizer forgets is silently invisible
 * to every consumer — no error, no warning, both capabilities simply off. These cases therefore begin
 * with AUTHORED JSON and end at the runtime contract the renderer actually reads.
 *
 * The second half is the naming hazard: an EFS Site id (`main`) and a configuration Site code are
 * different contracts. `main` must be found as `main`; a declaration keyed by the configuration code
 * must NOT be treated as that Site's authorization.
 */
import { describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config/loader";

import {
  resolvePublicContactLink,
  type VerifiedPublicContactAuthority,
} from "@/adapters/connect/public-contact";
import { syntheticDeploymentConfigText } from "../support/synthetic-deployment";

const declaration = {
  publicContact: {
    main: {
      status: "enabled",
      authorizationRefs: ["binding-main"],
      methods: [
        {
          methodRef: "email",
          label: "Email us",
          address: "hello@foundation.test",
          status: "enabled",
        },
      ],
    },
  },
} as const;

function authored(communication?: unknown): unknown {
  const raw = JSON.parse(syntheticDeploymentConfigText());
  if (communication !== undefined) raw.communication = communication;
  return raw;
}

describe("parseSiteConfig carries the communication block", () => {
  it("returns the authored declaration unchanged in the runtime SiteConfig", () => {
    const parsed = parseSiteConfig(authored(declaration));

    // The renderer reads `view.context.siteConfig.communication`; if this is undefined the whole
    // capability is off and NOTHING reports it, which is the regression this case exists to catch.
    expect(parsed.communication).toEqual(declaration);
  });

  it("keeps an absent declaration absent, rather than inventing one", () => {
    expect(parseSiteConfig(authored()).communication).toBeUndefined();
  });

  it("validates the block instead of passing it through blindly", () => {
    // Strictness is the proof that this is a contract and not a container: an unknown key, a Site entry
    // with no authorized binding, and a status outside the enumerated set are each refused at load.
    expect(() => parseSiteConfig(authored({ unexpected: true }))).toThrow();

    expect(() =>
      parseSiteConfig(
        authored({
          publicContact: {
            main: { status: "enabled", authorizationRefs: [], methods: [] },
          },
        }),
      ),
    ).toThrow();

    expect(() =>
      parseSiteConfig(
        authored({
          publicContact: {
            main: {
              status: "enabled",
              authorizationRefs: ["binding-main"],
              methods: [
                {
                  methodRef: "email",
                  label: "Email us",
                  address: "hello@foundation.test",
                  status: "sending",
                },
              ],
            },
          },
        }),
      ),
    ).toThrow();
  });
});

describe("the EFS Site id, not the configuration Site code, selects the declaration", () => {
  const authority: VerifiedPublicContactAuthority = {
    deploymentId: "spoke-foundation",
    ownerId: "entity-foundation",
    siteId: "main",
    authorizationRef: "binding-main",
  };

  it("finds the declaration authored for the EFS Site id", () => {
    const parsed = parseSiteConfig(authored(declaration));

    expect(resolvePublicContactLink({ authority, configuration: parsed.communication })).toBe(
      "mailto:hello@foundation.test",
    );
  });

  it("ignores a declaration keyed by a configuration Site code", () => {
    // `ww` is a configuration Site code; the EFS Site is `main`. Confusing the two would let a Site's
    // authorization be found under the wrong name, so it must find nothing at all.
    const parsed = parseSiteConfig(
      authored({
        publicContact: {
          ww: {
            status: "enabled",
            authorizationRefs: ["binding-main"],
            methods: [
              {
                methodRef: "email",
                label: "Email us",
                address: "hello@foundation.test",
                status: "enabled",
              },
            ],
          },
        },
      }),
    );

    expect(resolvePublicContactLink({ authority, configuration: parsed.communication })).toBeNull();
  });

  it("gives two Spokes publishing the same EFS Site id their own answers", () => {
    // Both Spokes publish an EFS Site called `main`. Their configurations are separate values, passed
    // per request, so neither can answer for the other — and one of them offers nothing at all.
    const foundation = parseSiteConfig(authored(declaration));
    const germany = parseSiteConfig(
      authored({
        publicContact: {
          main: {
            status: "disabled",
            authorizationRefs: ["binding-main"],
            methods: [
              {
                methodRef: "email",
                label: "E-Mail",
                address: "hallo@germany.test",
                status: "enabled",
              },
            ],
          },
        },
      }),
    );

    expect(
      resolvePublicContactLink({ authority, configuration: foundation.communication }),
    ).toBe("mailto:hello@foundation.test");
    expect(
      resolvePublicContactLink({ authority, configuration: germany.communication }),
    ).toBeNull();
  });
});
