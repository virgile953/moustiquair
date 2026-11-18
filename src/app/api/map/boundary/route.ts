import { NextResponse } from "next/server";

import { boundaryToFeatureCollection } from "@/lib/geo/boundary";
import { HERBLAY_BOUNDARY } from "@/lib/geo/herblay-boundary";

/**
 * GET /api/map/boundary
 *
 * The official commune boundary, served from the versioned local GeoJSON file.
 * The response is static and can be cached by the browser.
 */
export function GET() {
  return NextResponse.json(boundaryToFeatureCollection(HERBLAY_BOUNDARY), {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Data-Source": "geo.api.gouv.fr / Etalab 2.0",
    },
  });
}
