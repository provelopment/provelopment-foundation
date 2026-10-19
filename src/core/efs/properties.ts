/**
 * ONE OWNER-SCOPED PROPERTY CASCADE (`D31`, Amendment 06)
 * =====================================================
 *
 * Every level of the ownership chain may declare optional atomic property keys. A descendant's
 * effective value is the NEAREST EXPLICIT declaration on its direct ancestry:
 *
 *   Entity -> Facet -> Site -> Page -> localized representation
 *
 * Absence inherits. Explicit JSON `null` suppresses. A composite value replaces atomically.
 * Invalid or empty values are refused rather than being read as suppression. Nothing crosses a
 * sibling, another Entity, another Spoke or another representation.
 *
 * Public projection is deny-by-default: an effective property is public only when its declaring
 * node explicitly marks it public. Inheritance never grants publication permission.
 *
 * Framework-neutral: plain data and pure functions, no I/O, React, Next.js or filesystem.
 */

/** The only ownership levels, root first. */
export const PROPERTY_LEVELS = ["entity", "facet", "site", "page", "representation"] as const;

/** One ownership level. */
export type PropertyLevel = (typeof PROPERTY_LEVELS)[number];

/** A typed authored declaration. `public` is the explicit publication permission. */
export interface PropertyDeclaration {
  readonly value: unknown;
  readonly public?: boolean;
}

/**
 * One node's authored property bag. `null` is a deliberate suppression of an inherited key;
 * an omitted key means "inherit".
 */
export type PropertyBag = Readonly<Record<string, PropertyDeclaration | null>>;

/** The minimum owner shape needed to resolve properties. */
export interface PropertyOwner {
  readonly level: PropertyLevel;
  readonly id: string;
  readonly properties?: PropertyBag;
}

/** Where an effective value came from. */
export type PropertyState = "declared" | "inherited" | "suppressed";

/** One resolved atomic key. Suppressed keys have `value: undefined`. */
export interface ResolvedProperty {
  readonly key: string;
  readonly value: unknown;
  readonly state: PropertyState;
  readonly originLevel: PropertyLevel;
  readonly originId: string;
  readonly public: boolean;
}

/** The complete resolution result for one target context. */
export interface EffectiveProperties {
  readonly entries: readonly ResolvedProperty[];
  get(key: string): ResolvedProperty | undefined;
  toRecord(): Readonly<Record<string, unknown>>;
  publicEntries(): readonly ResolvedProperty[];
  provenance(): readonly ResolvedProperty[];
}

const PROPERTY_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Refuse malformed authored values. Empty strings are malformed; empty arrays/objects are valid
 * explicit composite values (they replace, rather than inherit, the ancestor value).
 */
export function propertyValueIssue(value: unknown): string | null {
  if (value === undefined) return "A property value must not be undefined.";
  if (value === null) return "Null is a suppression marker, not a value.";
  if (typeof value === "string") {
    return value.trim().length === 0 ? "A property string must not be empty." : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : "A property number must be finite.";
  }
  if (typeof value === "boolean") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const issue = propertyValueIssue(item);
      if (issue) return `Array item: ${issue}`;
    }
    return null;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key.trim().length === 0) return "A composite property key must not be empty.";
      const issue = propertyValueIssue(item);
      if (issue) return `"${key}": ${issue}`;
    }
    return null;
  }
  return `A property value must be JSON data, received ${typeof value}.`;
}

function assertChain(chain: readonly PropertyOwner[]): void {
  if (chain.length === 0) {
    throw new Error("A property chain must contain at least the Entity owner.");
  }
  if (chain.length > PROPERTY_LEVELS.length) {
    throw new Error("A property chain cannot exceed the five ownership levels.");
  }
  const seen = new Set<PropertyLevel>();
  chain.forEach((owner, index) => {
    const expected = PROPERTY_LEVELS[index];
    if (owner.level !== expected) {
      throw new Error(`Property chain position ${index} must be "${expected}", received "${owner.level}".`);
    }
    if (seen.has(owner.level)) throw new Error(`Duplicate property level "${owner.level}".`);
    seen.add(owner.level);
    if (owner.id.trim().length === 0) {
      throw new Error(`The "${owner.level}" owner must have a non-empty id.`);
    }
  });
}

/**
 * Resolve all effective properties for the LAST owner in `chain`.
 *
 * The chain must be a contiguous prefix of `Entity -> Facet -> Site -> Page -> representation`.
 * A Site target therefore passes `[entity, facet, site]`; a rendered Page passes all five.
 */
export function resolveProperties(chain: readonly PropertyOwner[]): EffectiveProperties {
  assertChain(chain);
  const targetIndex = chain.length - 1;
  const resolved = new Map<string, ResolvedProperty>();

  chain.forEach((owner, index) => {
    for (const [key, declaration] of Object.entries(owner.properties ?? {})) {
      if (!PROPERTY_KEY_PATTERN.test(key)) {
        throw new Error(`Invalid property key "${key}" at ${owner.level} "${owner.id}".`);
      }

      if (declaration === null) {
        resolved.set(key, {
          key,
          value: undefined,
          state: "suppressed",
          originLevel: owner.level,
          originId: owner.id,
          public: false,
        });
        continue;
      }

      if (!isPlainObject(declaration)) {
        throw new Error(`Property "${key}" must be a declaration object or null.`);
      }
      const issue = propertyValueIssue(declaration.value);
      if (issue) {
        throw new Error(`Invalid property "${key}" at ${owner.level} "${owner.id}": ${issue}`);
      }

      resolved.set(key, {
        key,
        value: declaration.value,
        state: index === targetIndex ? "declared" : "inherited",
        originLevel: owner.level,
        originId: owner.id,
        public: declaration.public === true,
      });
    }
  });

  const entries = Object.freeze([...resolved.values()]);

  return {
    entries,
    get(key: string) {
      return resolved.get(key);
    },
    toRecord() {
      const record: Record<string, unknown> = {};
      for (const entry of entries) {
        if (entry.state !== "suppressed") record[entry.key] = entry.value;
      }
      return record;
    },
    publicEntries() {
      return entries.filter((entry) => entry.state !== "suppressed" && entry.public);
    },
    provenance() {
      return entries;
    },
  };
}

/** Resolve one key; useful for diagnostics and tests. */
export function resolveProperty(
  chain: readonly PropertyOwner[],
  key: string,
): ResolvedProperty | undefined {
  return resolveProperties(chain).get(key);
}

