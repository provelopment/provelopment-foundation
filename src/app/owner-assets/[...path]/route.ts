import { assetNotFound, serveOwnerAsset } from "@/app/efs-asset-response";

/**
 * OWNER ASSETS AT A DEDICATED ROOT (`GEO-03` R04 §8/§9).
 *
 * A binding whose prefix is empty owns the whole host, so its public base — and therefore its asset
 * base (`assetUrl`) — has no segment before `owner-assets`. The prefix-scoped routes cannot serve
 * that shape (they require a leading segment of their own), so the dedicated root gets its own entry
 * point. Nothing about the ownership rule changes: `serveOwnerAsset` still matches the binding on the
 * request host and still resolves the file inside the Entity/Facet capsule that owns it.
 */
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  return path?.length ? serveOwnerAsset([], path) : assetNotFound();
}
