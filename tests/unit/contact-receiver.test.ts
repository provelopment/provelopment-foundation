import { describe, expect, it } from "vitest";

import {
  contactReceiverKey,
  contactReceiverLegacyGroups,
  contactReceiverLegacyKey,
  type ContactOwnerIdentity,
} from "@/config/contact-receiver";

const flat = (id: string): ContactOwnerIdentity => ({ id });
const hub = (spokeHubId: string, id: string): ContactOwnerIdentity => ({ spokeHubId, id });

describe("contact receiver keys", () => {
  it("preserves the conventional flat key", () => {
    expect(contactReceiverKey(flat("acme-spoke"))).toBe("ACME_SPOKE");
    expect(contactReceiverKey(flat("client-a"))).toBe("CLIENT_A");
    expect(contactReceiverKey(flat("client-a"))).toBe(contactReceiverLegacyKey(flat("client-a")));
  });

  it("never collapses distinct flat identifiers", () => {
    const identities = [flat("client-a"), flat("client_a"), flat("Client"), flat("client")];
    const keys = identities.map(contactReceiverKey);
    expect(new Set(keys).size).toBe(identities.length);
    expect(contactReceiverKey(flat("client_a"))).toMatch(/^__ENC_FLAT_[0-9A-F]+$/);
    expect(contactReceiverKey(flat("Client"))).toMatch(/^__ENC_FLAT_[0-9A-F]+$/);
  });

  it("never collides a flat id with a composite identity", () => {
    const flatDoubleHyphen = contactReceiverKey(flat("a--b"));
    const composite = contactReceiverKey(hub("a", "b"));
    expect(flatDoubleHyphen).toBe("A__B");
    expect(composite).toBe("__COMPOSITE__A__B");
    expect(flatDoubleHyphen).not.toBe(composite);
  });

  it("keeps identified-Hub composite identities unique", () => {
    const identities = [
      hub("hub-one", "client-a"),
      hub("hub_one", "client_a"),
      hub("Hub", "Client"),
      hub("hub", "client"),
    ];
    const keys = identities.map(contactReceiverKey);
    expect(new Set(keys).size).toBe(identities.length);
    expect(contactReceiverKey(hub("hub-one", "client-a"))).toBe(
      "__COMPOSITE__HUB_ONE__CLIENT_A",
    );
  });

  it("detects the flat legacy-key group that must fail if configured", () => {
    const groups = contactReceiverLegacyGroups([flat("client-a"), flat("client_a")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("CLIENT_A");
    expect(groups[0]?.owners).toHaveLength(2);
  });

  it("detects the identified-Hub legacy-key group that must fail if configured", () => {
    const groups = contactReceiverLegacyGroups([
      hub("hub-one", "client-a"),
      hub("hub_one", "client_a"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("HUB_ONE_CLIENT_A");
    expect(groups[0]?.owners).toHaveLength(2);
  });

  it("does not report a group for already-unique keys", () => {
    expect(
      contactReceiverLegacyGroups([flat("client-a"), flat("client_b"), flat("client-c")]),
    ).toHaveLength(0);
  });
});
