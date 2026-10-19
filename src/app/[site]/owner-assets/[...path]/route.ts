import { assetNotFound, serveOwnerAsset } from "@/app/efs-asset-response";

/** Prefix-scoped binding assets: `/<prefix>/owner-assets/<path>`. */
export async function GET(
  _request: Request,
  { params }: {
    readonly params: Promise<{ readonly site: string; readonly path: string[] }>;
  },
): Promise<Response> {
  const { site, path } = await params;
  return path?.length ? serveOwnerAsset([site], path) : assetNotFound();
}
