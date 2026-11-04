"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { pathContextOr, sitePath } from "@/core/site";

import { type ErrorMessages, useErrorMessages, useStatusRecovery } from "@/components/site/error-messages-context";
import { useClientRouting } from "@/components/site/client-routing-context";
import { StatusGraphic } from "@/components/site/status-graphic";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

/**
 * Segment error boundary for recoverable render errors within a locale.
 *
 * This error.tsx catches errors in this segment and its children, so it renders
 * inside the `[locale]` layout and therefore preserves the site header, footer,
 * and current locale. It is a Client Component (per App Router requirements)
 * and localizes its copy via the canonical `dictionary.error` block, transported
 * from the `[locale]` layout through `ErrorMessagesProvider`.
 *
 * Security: the UI must never surface any details of the thrown error to
 * users — not its message, its stack, internal paths, or environment
 * information. Only Next.js's opaque error digest (never user-visible) is
 * available, and not even that is displayed here.
 */
/**
 * R10 — the boundary dispatches on the SERVER-supplied discriminant and touches no other hook first, so no
 * branch invokes a hook the other branch's provider tree cannot satisfy.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const recovery = useStatusRecovery();
  return recovery.mode === "efs" ? (
    <EfsErrorBody homeHref={recovery.homeHref} reset={reset} />
  ) : (
    <LegacyErrorBody reset={reset} />
  );
}

/**
 * R10 — the EFS body. Hook-safe by construction: it reads only the two providers the EFS document composes
 * (`ErrorMessagesProvider`, `StatusGraphicProvider`) and NEVER `useClientRouting()`, because that transport
 * deliberately does not exist on the EFS surface. Retry, localized copy and the status artwork are all
 * preserved. The recovery link is rendered ONLY from server-verified data: `homeHref === null` means this
 * EFS Site publishes no Home, and inventing a destination for it is exactly what R10 exists to prevent.
 */
function EfsErrorBody({ homeHref, reset }: { homeHref: string | null; reset: () => void }) {
  const messages = useErrorMessages();
  return (
    <StatusFrame messages={messages} reset={reset}>
      {homeHref === null ? null : (
        <Link href={homeHref} className="font-medium text-primary hover:underline">
          {messages.returnHome}
        </Link>
      )}
    </StatusFrame>
  );
}

/**
 * The established legacy body, unchanged in behaviour: the routing facts still arrive from the server's
 * projection for the CURRENT Spoke, and "return home" still resolves against the CURRENT site scope.
 *
 * S1 — the status frame is SITE-SCOPED: the params name the site scope, so "return home" goes to the CURRENT
 * site's home rather than negotiating from the deployment root.
 */
function LegacyErrorBody({ reset }: { reset: () => void }) {
  const params = useParams<{ segments?: string[] }>();
  const messages = useErrorMessages();
  // M14 — the routing facts arrive from the SERVER's projection for the CURRENT Spoke (the ONE client
  // transport, provided by the document composition this boundary renders inside): this boundary holds no
  // configuration module and can select nothing.
  const routing = useClientRouting();
  const request = pathContextOr(
    routing.siteSet,
    routing.pageBindings,
    `/${(params?.segments ?? []).join("/")}`,
    routing.siteSet.defaultSite.defaultLocale,
  );
  return (
    <StatusFrame messages={messages} reset={reset}>
      <Link
        href={sitePath(request.site, request.localePath) as string}
        className="font-medium text-primary hover:underline"
      >
        {messages.returnHome}
      </Link>
    </StatusFrame>
  );
}

/**
 * The ONE status frame both branches render, so the two surfaces cannot drift apart visually.
 * P12-SG — optional decorative status graphic (ONE role shared with `not-found.tsx`, which renders this
 * identical status frame). Renders NOTHING when unconfigured, so the heading/message/controls remain the
 * complete expression of the state.
 */
function StatusFrame({
  messages,
  reset,
  children,
}: {
  messages: ErrorMessages;
  reset: () => void;
  children: ReactNode;
}) {
  return (
    <Section className="py-24 text-center">
      <StatusGraphic />
      <h1 className="text-4xl font-bold tracking-tight">{messages.title}</h1>
      <p className="mt-4 text-muted-foreground">{messages.message}</p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Button type="button" onClick={() => reset()}>
          {messages.tryAgain}
        </Button>
        {children}
      </div>
    </Section>
  );
}
