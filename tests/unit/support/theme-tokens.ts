import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Design-token reading + EVALUATION for the theme contract tests.
 *
 * The Foundation theme derives its values (`var()` indirection) and its dark
 * mode derives the brand tint from the single accent via `color-mix()`. A test
 * that only pattern-matched hex literals could therefore silently stop auditing
 * the real colour, so these helpers resolve a token to the `#rrggbb` value the
 * engine would compute: `var()` chains are followed and srgb `color-mix()` is
 * evaluated with the same per-channel rounding.
 */
export const GLOBALS_PATH = path.join(process.cwd(), "src", "app", "globals.css");

export const readGlobalsCss = (): string => readFileSync(GLOBALS_PATH, "utf8");

/** The light scope and the dark scope of the stylesheet. */
export function schemeScopes(css: string): { light: string; dark: string } {
  const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
  return darkAt < 0
    ? { light: css, dark: "" }
    : { light: css.slice(0, darkAt), dark: css.slice(darkAt) };
}

/** The raw `--token: value;` DECLARATIONS found in one scope. */
export function declarations(scope: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const entry of scope.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    found[entry[1]] = entry[2].trim();
  }
  return found;
}

/** `#rrggbb` → `{ r, g, b }`. */
function rgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }: { r: number; g: number; b: number }): string =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/**
 * `color-mix(in srgb, <a> <p>%, <b>)` → `#rrggbb`, exactly as the browser
 * computes it: per-channel linear interpolation in srgb, rounded to 8 bits.
 * Either side may itself be a `var()` reference (e.g. the one Foundation accent).
 */
export function mixSrgb(a: string, p: number, b: string): string {
  const left = rgb(a);
  const right = rgb(b);
  return toHex({
    r: Math.round(left.r * p + right.r * (1 - p)),
    g: Math.round(left.g * p + right.g * (1 - p)),
    b: Math.round(left.b * p + right.b * (1 - p)),
  });
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const VAR = /^var\((--[\w-]+)\)$/;
const MIX =
  /^color-mix\(in srgb,\s*([^,]+?)\s+([\d.]+)%,\s*([^,)]+?)\s*\)$/;

/**
 * Resolve a token name to its computed `#rrggbb` value within one scheme's raw
 * declaration map. Returns `null` for values that are not colours (lengths,
 * keywords) or that cannot be resolved.
 */
export function resolveColor(
  raw: Readonly<Record<string, string>>,
  name: string,
  depth = 0,
): string | null {
  if (depth > 6) return null;
  const value = raw[name];
  if (value === undefined) return null;
  return evalColor(raw, value, depth);
}

function evalColor(
  raw: Readonly<Record<string, string>>,
  value: string,
  depth: number,
): string | null {
  if (HEX.test(value)) return value.toLowerCase();

  const indirect = VAR.exec(value);
  if (indirect) {
    const target = raw[indirect[1]];
    return target === undefined ? null : evalColor(raw, target, depth + 1);
  }

  const mixed = MIX.exec(value.trim());
  if (mixed) {
    const [, leftRaw, percentRaw, rightRaw] = mixed;
    const left = evalColor(raw, leftRaw.trim(), depth + 1);
    const right = evalColor(raw, rightRaw.trim(), depth + 1);
    if (!left || !right) return null;
    return mixSrgb(left, Number(percentRaw) / 100, right);
  }
  return null;
}

/** Relative luminance (WCAG 2.1) of an `#rrggbb` value. */
export function luminance(hex: string): number {
  const linear = (channel: number) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const { r, g, b } = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two `#rrggbb` values. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Both schemes as resolved colour maps: the dark scheme inherits every light
 * declaration and overrides only what it redeclares (exactly like the cascade),
 * so `var()` references across scopes resolve correctly.
 */
export function schemeTokens(): {
  light: Readonly<Record<string, string>>;
  dark: Readonly<Record<string, string>>;
} {
  const css = readGlobalsCss();
  const { light, dark } = schemeScopes(css);
  const lightRaw = declarations(light);
  const darkRaw = { ...lightRaw, ...declarations(dark) };

  const resolveAll = (raw: Record<string, string>) =>
    Object.fromEntries(
      Object.keys(raw)
        .map((name) => [name, resolveColor(raw, name)] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== null),
    );

  return { light: resolveAll(lightRaw), dark: resolveAll(darkRaw) };
}
