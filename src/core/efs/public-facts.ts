/**
 * BRAND/CONTACT SOURCE PRECEDENCE (`D40` Decision C)
 * ==================================================
 *
 * One deterministic ordering between two sources that already exist:
 *
 *   1. the effective, PUBLICLY AUTHORIZED EFS property;
 *   2. the Spoke's presentation configuration, as a GOVERNED FALLBACK.
 *
 * The fallback trigger is the CASCADE, not the public projection outcome (`D40` §3.1). "No public
 * value" and "no declaration" look identical in output but are different states, and only the
 * second may be filled:
 *
 *   | cascade state            | public output | fallback? |
 *   | ------------------------ | ------------- | --------- |
 *   | declared + public        | EFS value     | no        |
 *   | declared but private     | nothing       | NO        |
 *   | declared explicit `null` | nothing       | NO        |
 *   | absent at every level    | fallback      | YES       |
 *   | absent, no fallback      | nothing       | no        |
 *
 * A fallback keyed on the OUTPUT would silently publish a configuration value whenever an Entity
 * chose privacy, and would undo suppression. Keying on the cascade cannot.
 *
 * Only the twelve ESTABLISHED key names (`D40` / `GEO-01-R02` §5.2) are consulted. No new key,
 * no new typing and no second resolver is introduced. Pure functions: no I/O, no React.
 */

import type { EffectiveProperties, PropertyLevel } from "@/core/efs/properties";

/**
 * The established brand/contact facts this module resolves.
 *
 * `contact.name` is contact-PERSON identity, a different semantic fact from business identity. It
 * therefore has NO configuration fallback (`BusinessContact` declares no name) and must never be
 * promoted into `business.name`/`brand.name`: doing so would relabel the business with a person's
 * name. It is resolved and exposed so `D40`-C covers it, and consumed only by a proper contact-name
 * consumer — of which there is none in the EFS shell today (`GEO-02-R02` C1).
 *
 * `brand.logo` is deliberately NOT here. It is an asset reference, and the EFS shell resolves
 * branding graphics through the asset catalog (binding-scoped `owner-assets` paths versus absolute
 * catalog URLs). Ordering those two representations is asset work, not source precedence, and
 * belongs with the `GEO-03` asset migration. Including it here would either break header resolution
 * or produce a JSON-LD logo that contradicts the header — the very contradiction `D40` Decision C
 * forbids. Its behaviour is therefore unchanged, which is the safe state: one existing behaviour,
 * not two competing ones.
 */
export const PUBLIC_FACT_KEYS = [
  "brand.name",
  "contact.name",
  "contact.email",
  "contact.phone",
] as const;

export type PublicFactKey = (typeof PUBLIC_FACT_KEYS)[number];

/**
 * Why a fact has the value it has.
 *
 * `private` and `suppressed` are BLOCKING states: they produce no output AND no fallback. They are
 * reported distinctly from `absent` so that a diagnostic — or a test — can prove the block was
 * deliberate rather than accidental.
 */
export type PublicFactState = "declared" | "fallback" | "private" | "suppressed" | "absent";

/** One resolved fact. `value` is present only for `declared` and `fallback`. */
export interface ResolvedPublicFact {
  readonly key: PublicFactKey;
  readonly value: string | undefined;
  readonly state: PublicFactState;
  /** Present for `declared`, `private` and `suppressed`: where the deciding declaration lives. */
  readonly originLevel?: PropertyLevel;
  readonly originId?: string;
}

/** The complete resolution for one rendered context. */
export interface ResolvedPublicFacts {
  get(key: PublicFactKey): ResolvedPublicFact;
  readonly entries: readonly ResolvedPublicFact[];
}

/** Spoke presentation configuration, consulted only where the cascade declares nothing. */
export type PublicFactFallback = Readonly<Partial<Record<PublicFactKey, string | undefined>>>;

function usable(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Resolve the established brand/contact facts for one context.
 *
 * These are STRING facts. A declared public value that is not a usable string is reported as
 * `declared` with no value and does NOT fall back: it is a declaration, so it occupies the
 * precedence slot. Such a value should have been refused at validation; treating it as declared
 * here keeps the ordering total rather than silently demoting it to a fallback.
 */
export function resolvePublicFacts(
  properties: EffectiveProperties,
  fallback: PublicFactFallback = {},
): ResolvedPublicFacts {
  const resolved = new Map<PublicFactKey, ResolvedPublicFact>();

  for (const key of PUBLIC_FACT_KEYS) {
    const entry = properties.get(key);

    if (entry !== undefined) {
      if (entry.state === "suppressed") {
        resolved.set(key, {
          key,
          value: undefined,
          state: "suppressed",
          originLevel: entry.originLevel,
          originId: entry.originId,
        });
        continue;
      }
      if (!entry.public) {
        resolved.set(key, {
          key,
          value: undefined,
          state: "private",
          originLevel: entry.originLevel,
          originId: entry.originId,
        });
        continue;
      }
      resolved.set(key, {
        key,
        value: usable(entry.value),
        state: "declared",
        originLevel: entry.originLevel,
        originId: entry.originId,
      });
      continue;
    }

    const configured = usable(fallback[key]);
    resolved.set(
      key,
      configured === undefined
        ? { key, value: undefined, state: "absent" }
        : { key, value: configured, state: "fallback" },
    );
  }

  return {
    get(key: PublicFactKey) {
      return resolved.get(key)!;
    },
    entries: Object.freeze([...resolved.values()]),
  };
}

/**
 * Convenience for a single fact, and the shape most call sites want.
 * Returns `undefined` for every state that must produce no output.
 */
export function publicFactValue(
  properties: EffectiveProperties,
  key: PublicFactKey,
  fallback?: string,
): string | undefined {
  return resolvePublicFacts(properties, { [key]: fallback } as PublicFactFallback).get(key).value;
}
