/**
 * Backwards-compatible exports for the original Herblay study area.
 *
 * New code should use `getCityBoundary()` from `city-boundaries.ts` and the
 * selected city from `src/lib/cities.ts`.
 */

import type { BoundaryFeature } from "./boundary";
import { boundaryBoundingBox } from "./boundary";
import { getCityBoundary } from "./city-boundaries";
import type { LonLat } from "./types";

const HERBLAY_BOUNDARY_VALUE = getCityBoundary("95306");
if (!HERBLAY_BOUNDARY_VALUE) {
  throw new Error("The Herblay-sur-Seine boundary file is missing.");
}

export const HERBLAY_BOUNDARY: BoundaryFeature = HERBLAY_BOUNDARY_VALUE;
export const HERBLAY_BOUNDARY_GEOMETRY = HERBLAY_BOUNDARY.geometry;
export const HERBLAY_BOUNDARY_BBOX = boundaryBoundingBox(HERBLAY_BOUNDARY_GEOMETRY);

export const STUDY_AREA: {
  name: string;
  insee: string;
  department: string;
  region: string;
  center: LonLat;
} = {
  name: "Herblay-sur-Seine",
  insee: "95306",
  department: "Val-d'Oise",
  region: "Île-de-France",
  center: { longitude: 2.1556, latitude: 49.0052 },
};
