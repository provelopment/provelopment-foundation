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
  methods?: { id, label, kind: "email", address, status? }[]
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

## 4. THE OPEN DECISION — where is Site configuration authoritative at render time?

Two pathways exist in this repository and they are not interchangeable:

1. **`site.config.json`** (`deployment/spokes/<spoke>/site.config.json`), read through the validated
   loader in `src/config` — `src/config/loader.ts` already owns `contact.email` / `contact.phone`, and
   §25 makes configuration the single source of truth for site settings.
2. **The EFS property cascade**, authored in `deployment/efs/manifest.json` and surfaced at render as
   `view.properties.publicEntries()`, which `efs-page.tsx` reads for `brand.name`, `contact.address`,
   `contact.phone` and `openingHours`. `contact.address` and `contact.phone` appear **nowhere** as
   literals under `src/**`, which is what proves pathway 2 is real and separate from the loader.

The instruction reads as pathway 1 for configuration ("Wire **Site configuration**, verified EFS
publication authority, `projectPublicContact`"). Making that work needs one thing that has not been
established:

> **At `efs-page.tsx`, how does a render know WHICH Spoke's `site.config.json` applies?**

`EfsView` exposes `binding`, `facet`, `locale`, `page`, `properties`, `navigation`, `alternates`,
`source` and `canonical` — but no Spoke configuration. Either the view must carry the resolved Spoke
identity (with the loader consulted server-side), or public-contact configuration belongs in the
property cascade after all.

**This is a decision for the Chief Architect, not a guess for the implementer.** Choosing wrongly
produces one of the two failures the directive forbids: configuration read through the wrong pathway,
so an author's file is silently ignored; or a second configuration source invented to work around it,
which §25 forbids.

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
