import { assetNotFound, serveOwnerAsset } from "@/app/efs-asset-response";

/** A two-segment publication prefix: `/<site>/<locale>/owner-assets/<path>`. */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    readonly params: Promise<{
      readonly site: string;
      readonly locale: string;
      readonly path: string[];
    }>;
  },
): Promise<Response> {
  const { site, locale, path } = await params;
  return path?.length ? serveOwnerAsset([site, locale], path) : assetNotFound();
}
