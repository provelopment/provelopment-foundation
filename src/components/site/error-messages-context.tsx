"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Localized copy shown by an error boundary.
 *
 * The canonical source is `dictionary.error` in `config/i18n/<locale>.json`;
 * `ErrorMessagesProvider` receives the already-resolved copy for the active
 * locale from the `[locale]` layout and hands it to client error boundaries,
 * so no client-side locale registry is needed.
 */
export interface ErrorMessages {
  readonly title: string;
  readonly message: string;
  readonly tryAgain: string;
  readonly returnHome: string;
}

/**
 * R10 Scope Addendum 02 — the EFS/legacy status-recovery discriminant.
 *
 * A status surface (`error.tsx`) cannot discover the shell mode on its own: the only values reaching it are
 * dictionary copy and artwork. It must therefore be told, and told by the SERVER, on the same transport that
 * already carries the copy. `legacy` is the DEFAULT so that every surface that has not opted in keeps its
 * existing behaviour exactly; `efs` is stated explicitly, and `homeHref: null` states explicitly that this
 * EFS Site publishes no Home — the boundary must then render NO home link rather than invent one.
 */
export type StatusRecovery =
  | { readonly mode: "legacy" }
  | { readonly mode: "efs"; readonly homeHref: string | null };

const ErrorMessagesContext = createContext<ErrorMessages | null>(null);
const StatusRecoveryContext = createContext<StatusRecovery>({ mode: "legacy" });

/**
 * Provides `dictionary.error` to client error boundaries. Rendered by the
 * `[locale]` layout (a Server Component) with the canonical per-locale copy;
 * `[locale]/error.tsx` reads it via `useErrorMessages()`.
 */
export function ErrorMessagesProvider({
  messages,
  statusRecovery,
  children,
}: {
  messages: ErrorMessages;
  /** Omitted means legacy — the safe default, so no existing surface changes behaviour. */
  statusRecovery?: StatusRecovery;
  children: ReactNode;
}) {
  return (
    <StatusRecoveryContext.Provider value={statusRecovery ?? { mode: "legacy" }}>
      <ErrorMessagesContext.Provider value={messages}>
        {children}
      </ErrorMessagesContext.Provider>
    </StatusRecoveryContext.Provider>
  );
}

/**
 * Returns the status-recovery discriminant. Unlike `useErrorMessages()` this NEVER throws when absent: a
 * boundary that renders outside the layout that mounts the provider is already a wiring error, and the
 * legacy branch it falls back to is the branch that will surface that error honestly.
 */
export function useStatusRecovery(): StatusRecovery {
  return useContext(StatusRecoveryContext);
}

/** Returns the localized error copy provided by the `[locale]` layout. */
export function useErrorMessages(): ErrorMessages {
  const messages = useContext(ErrorMessagesContext);
  if (!messages) {
    // Only possible when the boundary is rendered outside the layout that
    // mounts the provider (i.e. a wiring error) — fail loudly rather than
    // silently falling back to a hard-coded locale.
    throw new Error("useErrorMessages must be used within an ErrorMessagesProvider");
  }
  return messages;
}