# FOUNDATION A9 — Stage 2 integration design (verified contracts, one open decision)

**Status:** Stage 1 accepted at `bad9a4f` (exact-head CI green: `full` 9m38s, `validate` pass).
`§1` documentation corrections complete at `b5deb26`. Functional integration **not started**.

This note records what was VERIFIED by reading the carried source and Foundation's own code, so the
next implementer does not re-derive it — and so the one open architectural question is visible instead
of being silently decided by whichever file gets edited first.

---

## 1. Connect's public-contact contract (`modules/connect/src/domain/public-contact.ts`)

```ts
projectPublicContact({ authority, configuration }): PublicContactProjection
```

`authority` — the **consumer's already-verified** association facts:

```ts
{ deploymentId, ownerId, siteId, authorizationRef, publisherRef? }
```

`configuration` — consumer-authored, validated for internal consistency against that authority:

```ts
{
  deploymentId, ownerId, siteId,
  authorizationRefs: string[],        // authority.authorizationRef must appear here
  publisherRefs?: string[],           // when present, authority.publisherRef must appear
  status: "enabled" | "disabled" | "revoked",
  methods?: {
    methodRef: string;                 // NOT `id`; ≤ 64 (MAX_PUBLIC_METHOD_REF_LENGTH)
    label: string;                     // ≤ 64
    kind: "email";
    address: string;                   // ≤ 254; the Module owns address validity
    status: "enabled" | "disabled" | "revoked";   // REQUIRED, not optional
  }[]                                  // ≤ 20 (MAX_PUBLIC_METHODS)
}
```

Three outcomes, and the distinction is the whole safety property:

| kind | meaning | renderer behaviour |
| --- | --- | --- |
| `available` | one or more methods, in authored order | render each as a native `mailto:` |
| `absent` | nothing public configured, or nothing usable (`not-configured`, `configuration-disabled`, `configuration-revoked`, `no-available-method`) | render **no** destination; not an error |
| `unavailable` | the configuration cannot be trusted for this authority (`configuration-malformed`, `scope-mismatch`, `publication-mismatch`, `unauthorized`) | fail closed, reveal nothing |

The module refuses what Foundation must not "help" it accept: quoted local parts, comments, and anything
able to start a `mailto:` query (`? & = # %`) or a header. The href is exactly `mailto:` + address — no
query string, no subject, no body, no redirect, no script.

## 2. Foundation's renderer hook (present, currently unwired)

- `PageLinkResolver = (reference: PageLinkReference) => string | null` — the host's answer, supplied
  **as an argument** to a render (`@/core/page-document`).
- `resolvePageLink(links, linkId, resolve)` is a **pure lookup**: no URL building, no authorization, no
  filesystem, no adapter import. `null` for a missing declaration, a missing resolver, a throwing
  resolver, a reserved marker (no chained resolution), or any answer the classifier refuses. No
  fallback destination exists anywhere.
- The **only** call site is `src/components/efs/efs-page.tsx:71`, which today passes no resolver:
  `<PageDocumentContent document={document} locale={view.locale} />`.
- A document declares its intent declaratively —
  `links: { contact: { reference: "applicationLink", key: "public-contact-email" } }` — and references
  it from Markdown (`#link:contact`) or an action (`link: "contact"`).

So the adapter's only job is to **answer truthfully** for one opaque key. It never sanitises, never
substitutes, never invents: the platform already refuses anything unsafe.

## 3. Foundation's verified publication authority (`src/core/efs/publication.ts`)

`EfsBinding` is the explicit public-address binding, and therefore the natural `authorizationRef`: a
binding *is* the declaration that this entity may publish at this host and prefix.

```ts
interface EfsBinding {
  id, host, prefix[], entityId, facetId,
  siteIds[], siteMode: "closed" | "open", defaultSiteId?,
  locales[], defaultLocale, canonical?, aliasOf?
}
```

Proposed mapping (**needs confirmation — §4**):

| Connect | Foundation source |
| --- | --- |
| `deploymentId` | deployment identity from the Spoke's configuration |
| `ownerId` | `binding.entityId` — the Spoke/Entity that owns the publication |
| `siteId` | the resolved `siteId` of this publication (not the locale, not the host) |
| `authorizationRef` | `binding.id` — the verified publication authorization |
| `publisherRef` | the publishing Hub, **only** when a Hub publishes a Spoke's Site |

## 4. RESOLVED BY THE CHIEF ARCHITECT — configuration authority

**This section previously asked a question that the codebase had already answered. That was wrong, and
the error is recorded rather than deleted, because the cause is instructive.**

`EfsView` (line 74 of `src/app/[[...segments]]/efs-request.ts`) carries
`readonly context: SpokeRuntimeContext`, and `SpokeRuntimeContext`
(`src/config/installation-runtime.ts:108`) already holds `siteConfig`, `runtimeSegment`, `id`,
`canonicalHostname`, `resources`, `runtimeAssetNamespaces`, and the optional composite identity
`spokeHubId` / `spokeRef`. The page view therefore always had the owning Spoke's verified configuration.

**Why it was missed:** the first search used `Select-String -Path 'src\app\[[...segments]]\efs-request.ts'`.
In PowerShell `[` starts a character class, so `[[...segments]]` was a wildcard that matched no file and
the search returned *nothing* — which read as "the member does not exist". The same class of mistake as
the CRLF vendor bug in Stage 1: **an absence of output was mistaken for evidence of absence.** Every
later search used `-LiteralPath`.

**Ruling:** `view.context.siteConfig` is the Spoke's authoritative configuration. Connect policy is
NOT authored in the EFS property cascade, and no alternative configuration system is created.

Consequences now implemented:

- the authored block is `communication.publicContact`, **keyed by EFS Site id**, added to
  `siteConfigFileSchema` and kept independent of `contact.*`, `connect.methods[]` and
  `features.contact`;
- a missing Site entry is `absent` — there is **no default-Site fallback**, because that would be one
  Site borrowing another Site's publication authorization;
- `authorizationRefs` is explicitly authored (min 1, no wildcard), so adding a binding cannot silently
  start publishing an address nobody approved for it;
- identity is **never authored**: the adapter composes Connect's document from verified runtime values,
  and brands them through the Module's own `identifier` factories after bounding them at
  `MAX_IDENTIFIER_LENGTH` (the factories validate nothing and must never see visitor input);
- the `mailto:` href is the Module's own `method.href`, never rebuilt in Foundation.

The two pathways that appeared to compete are in fact complementary, and each keeps its own job:
`site.config.json` decides *what a Site offers and to which publications* (via `context.siteConfig`),
while the EFS manifest decides *where a Site is published* (`binding`, and therefore `authorizationRef`).

## 5. Form contract (`modules/connect/src/application/send-direct-enquiry.ts`)

```ts
new SendDirectEnquiry({
  transport, renderer, telemetry, clock, ids,
  abuse?,                                  // required once an attempt budget is authored (else POL-001)
  limits: { maxPayloadBytes },
  idempotencyNamespace,
}).execute({ policy, context, content, payloadBytes? })   // → DirectSendOutcome (never throws)
```

Every refusal happens **before** any transport call: parse context → parse policy →
`policy.deploymentRef === context.deploymentId` and `policy.ownerRef === context.ownerRef` (else
`CTX-004`) → purpose match (`POL-003`) → binding specificity (`POL-002`) → attempt budget present
(`POL-001`) → payload size (`FRM-002`) → content validation → render → transport.

Authored policy keys are a **closed set**; unknown keys are refused, and specifically refused *by name*:
`policyId`, `policyRevision`, `retention`, `abuseProfile`, `acknowledgement`, `serviceInterests`.

```text
deploymentRef, ownerRef, purpose, applicability, recipients, sender, template, validity, quotas,
messageMinLength
applicability: siteRefs, bindings, forms, publisherRefs, authorizationRefs
sender:        fromAddress, fromDisplayName, replyToMode, replyToAddress
template:      templateId, version, localeFallbacks
validity:      enabled, fromEpochMs, untilEpochMs
quotas:        attemptPerOwnerHour, attemptPerSiteHour   (accepted-enquiry quotas refused)
```

The transport port is `MailTransportPort.send({ message }) → TransportObservation`, and it demands
**honest** reporting: a timeout that may already have sent the payload is
`{ kind: "timeout", payloadSent: true }` — never a bare throw, never a refusal — so the module can avoid
a blind resend. An offline transport therefore reports `accepted` with a synthetic provider reference,
or a truthful ambiguity, and never claims delivery: a transport knows at most that a provider took the
message.

## 6. Deliberately still absent

`src/adapters/connect/**` does not exist. No `mailto:` is wired, no form is rendered, no server action
exists, no transport is registered, neither reference site demonstrates anything, and no documentation,
sensitivity audit, multi-Hub isolation or clean-room evidence has been produced for this stage.

Nothing has been merged, tagged, published, deployed, or activated against a real provider.


| Connect | Foundation source |
| --- | --- |
| `deploymentId` | deployment identity from the Spoke's configuration |
| `ownerId` | `binding.entityId` — the Spoke/Entity that owns the publication |
| `siteId` | the resolved `siteId` of this publication (not the locale, not the host) |
| `authorizationRef` | `binding.id` — the verified publication authorization |
| `publisherRef` | the publishing Hub, **only** when a Hub publishes a Spoke's Site |
