import { renderToReadableStream } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "foundation-template.provelopment.com",
      "x-foundation-spoke-segment": "foundation",
    }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en-001",
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { efsPublicSegments, efsViewForCurrentRequest, type EfsView } from "@/app/[[...segments]]/efs-request";
import { layoutForEfsContext } from "@/app/[[...segments]]/server-composition";
import { foundationSpoke } from "../support/spoke-contexts";

async function rendered(view: EfsView): Promise<string> {
  const shell = await layoutForEfsContext(
    view.context,
    view,
    efsPublicSegments(view),
    <p>EFS page</p>,
    "test-html",
  );
  expect(shell).not.toBeNull();
  const stream = await renderToReadableStream(shell);
  return new Response(stream).text();
}

async function referenceView(): Promise<EfsView> {
  const view = await efsViewForCurrentRequest(["en-001"]);
  expect(view).not.toBeNull();
  return view as EfsView;
}

function withBinding(view: EfsView, prefix: readonly string[], siteMode: "closed" | "open", canonical: string): EfsView {
  return {
    ...view,
    binding: { ...view.binding, id: "presentation-test", prefix, siteMode, canonical: true },
    canonical,
  };
}

describe("EFS shared shell is publication-independent (R04)", () => {
  it("renders the explicit publication's shell at a single-prefix public base", async () => {
    const html = await rendered(await referenceView());
    expect(html).toContain('lang="en-001"');
    expect(html).toContain("Provelopment Foundation");
    expect(html).toContain('data-selector="language"');
    expect(html).not.toContain('data-selector="location"');
    expect(html).toContain('href="/en-001/about"');
    expect(html).not.toContain("data-region");
    expect(html).toContain("EFS page");
  });

  it("keeps the same shell features at a dedicated root", async () => {
    const html = await rendered(
      withBinding(await referenceView(), [], "closed", "https://foundation-template.provelopment.com/en"),
    );
    expect(html).toContain('lang="en-001"');
    expect(html).toContain('data-selector="language"');
    expect(html).toContain('href="/en-001/about"');
    // The public path carries NO Site segment: the Site is an ownership context, never a URL part.
    expect(html).not.toContain('href="/main/');
  });

  it("keeps the same shell features at a multi-segment prefix", async () => {
    const html = await rendered(
      withBinding(
        await referenceView(),
        ["us", "west"],
        "closed",
        "https://foundation-template.provelopment.com/us/west/en",
      ),
    );
    expect(html).toContain('href="/us/west/en-001/about"');
    expect(html).not.toContain("data-region");
    expect(html).toContain('data-selector="language"');
  });

  it("keeps the same shell features for a Site-open publication", async () => {
    const html = await rendered(
      withBinding(
        await referenceView(),
        ["us"],
        "open",
        "https://foundation-template.provelopment.com/us/main/en",
      ),
    );
    expect(html).toContain('href="/us/main/en-001/about"');
    expect(html).toContain('data-selector="language"');
    expect(html).not.toContain('data-selector="location"');
  });

  it("refuses to compose the shell for a publication owned by another Spoke", async () => {
    const foreign: EfsView = {
      ...(await referenceView()),
      publication: { ...(await referenceView()).publication, spokeId: "germany" },
    };
    await expect(
      layoutForEfsContext(foundationSpoke.context, foreign, ["ww", "en"], <p>EFS page</p>, "test-html"),
    ).rejects.toThrow(/owned by Spoke "germany"/);
  });

  it("keeps the rendered shell identical when Entity/Facet/Site/Page names change", async () => {
    const base = await referenceView();
    const renamed: EfsView = {
      ...base,
      entity: { ...base.entity, id: "e_00000000000000000000000009" },
      facet: { ...base.facet, id: "north" },
      site: { ...base.site, id: "place" },
      page: { ...base.page, id: "city" },
    };
    expect(await rendered(renamed)).toBe(await rendered(base));
  });
});
