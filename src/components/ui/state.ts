/**
 * Shared UI interaction state (UI-03 — Shared UI Primitives).
 *
 * Pure, deterministic state transitions for the disclosure-style interactive
 * primitives (collapsible groups, sidebar, drawers, overlays). Colocated in the
 * UI layer because these are DOM-interaction semantics — NOT business rules —
 * and kept completely framework-free so they can be unit-tested in the node
 * vitest environment with zero browser dependencies.
 *
 * UI-03 contract: markup/ARIA semantics are verified by render-time tests;
 * full keyboard/focus/Escape/scroll-lock behavior is validated in a real
 * browser at UI-10 (Cross-Presentation Validation, mandatory behavioral gate).
 */

export const DISCLOSURE_OPEN = "open" as const;
export const DISCLOSURE_CLOSED = "closed" as const;

/** The two disclosure states a primitive-visible toggler advertises. */
export type DisclosureState = typeof DISCLOSURE_OPEN | typeof DISCLOSURE_CLOSED;

/** Actions that can transition a disclosure. */
export type DisclosureAction =
  | { readonly type: "toggle" }
  | { readonly type: "open" }
  | { readonly type: "close" }
  | { readonly type: "escape" };

/**
 * Transition a disclosure state. Deterministic and idempotent:
 *  - `escape` and `close` both settle on `closed` (escape is the keyboard
 *    path; close is the explicit trigger path);
 *  - repeated/`redundant actions leave the state unchanged (no churn);
 *  - unknown actions are ignored (defensive; returns the input state).
 */
export function disclosureReducer(
  state: DisclosureState,
  action: DisclosureAction,
): DisclosureState {
  switch (action.type) {
    case "open":
      return DISCLOSURE_OPEN;
    case "toggle":
      return state === DISCLOSURE_OPEN ? DISCLOSURE_CLOSED : DISCLOSURE_OPEN;
    case "close":
    case "escape":
      return DISCLOSURE_CLOSED;
    default:
      return state;
  }
}

/** The initial disclosure state (deterministic default). */
export function createInitialDisclosure(open = false): DisclosureState {
  return open ? DISCLOSURE_OPEN : DISCLOSURE_CLOSED;
}