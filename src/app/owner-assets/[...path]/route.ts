import { assetNotFound, serveOwnerAsset } from "@/app/efs-asset-response";

/** Dedicated-root binding assets: `/owner-assets/<path>`. */
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly path: string[] }> },
): Promise<Response> {
  const path = (await params).path;
  return path?.length ? serveOwnerAsset([], path) : assetNotFound();
}
