/**
 * The official study area, loaded from the versioned GeoJSON file.
 *
 * Importing JSON keeps the boundary available both in server code and in the
 * browser (for immediate validation feedback while placing a report).
 */

import boundaryFile from "../../data/boundary/herblay-sur-seine-95306.v1.json";
import type { BoundaryFeature } from "./boundary";
import { boundaryBoundingBox } from "./boundary";

export const HERBLAY_BOUNDARY = boundaryFile as unknown as BoundaryFeature;
export const HERBLAY_BOUNDARY_GEOMETRY = HERBLAY_BOUNDARY.geometry;
export const HERBLAY_BOUNDARY_BBOX = boundaryBoundingBox(HERBLAY_BOUNDARY_GEOMETRY);

export const STUDY_AREA = {
  name: "Herblay-sur-Seine",
  insee: "95306",
  department: "Val-d'Oise",
  region: "Île-de-France",
  /** Approximate centre used as a fallback before the boundary is fitted. */
  center: { longitude: 2.1556, latitude: 49.0052 },
} as const;
