/**
 * Administrative boundary helpers.
 *
 * The study area is the official commune boundary of Herblay-sur-Seine
 * (INSEE 95306), downloaded from geo.api.gouv.fr and stored locally.
 *
 * This module only answers "is this point inside the commune?" and "what is
 * the bounding box?". It is intentionally independent from the mosquito
 * influence model.
 */

import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

import type { LambertBounds, LonLat } from "./types";

export type BoundaryGeometry = Polygon | MultiPolygon;

export interface BoundaryFeatureProperties {
  name: string;
  insee: string;
  department: string;
  region: string;
  source: string;
  license: string;
  retrievedAt: string;
  version: string;
}

export type BoundaryFeature = Feature<BoundaryGeometry, BoundaryFeatureProperties>;

/**
 * Ray-casting point-in-ring test.
 *
 * We count how many times a ray going east from the point crosses the ring.
 * An odd number means the point is inside. This is the classic algorithm and
 * it is easy to read and test.
 *
 * Points exactly on an edge are an ambiguous case; the algorithm treats most
 * of them consistently but we do not rely on it for safety-critical decisions.
 */
export function isPointInRing(point: LonLat, ring: Position[]): boolean {
  let inside = false;
  const { longitude: x, latitude: y } = point;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const current = ring[i];
    const previous = ring[j];
    if (!current || !previous) continue;

    const xi = current[0];
    const yi = current[1];
    const xj = previous[0];
    const yj = previous[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Point-in-polygon with holes support.
 * The first ring is the exterior; subsequent rings are holes.
 */
export function isPointInPolygon(point: LonLat, polygon: Polygon): boolean {
  const [exterior, ...holes] = polygon.coordinates;
  if (!exterior || !isPointInRing(point, exterior)) return false;
  return !holes.some((hole) => isPointInRing(point, hole));
}

/** Point-in-boundary supporting both Polygon and MultiPolygon. */
export function isPointInBoundary(point: LonLat, geometry: BoundaryGeometry): boolean {
  if (geometry.type === "Polygon") {
    return isPointInPolygon(point, geometry);
  }
  return geometry.coordinates.some((polygon) =>
    isPointInPolygon(point, { type: "Polygon", coordinates: polygon }),
  );
}

/** Functional shortcut for API validation and tests. */
export function isInsideBoundary(
  longitude: number,
  latitude: number,
  geometry: BoundaryGeometry,
): boolean {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return false;
  return isPointInBoundary({ longitude, latitude }, geometry);
}

/** Bounding box in GPS degrees. */
export function boundaryBoundingBox(geometry: BoundaryGeometry): {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
} {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  const polygons: Position[][][] =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const position of ring) {
        const [longitude, latitude] = position;
        if (longitude === undefined || latitude === undefined) continue;
        minLon = Math.min(minLon, longitude);
        minLat = Math.min(minLat, latitude);
        maxLon = Math.max(maxLon, longitude);
        maxLat = Math.max(maxLat, latitude);
      }
    }
  }

  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Metric bounding box, obtained by projecting the four corners of the
 * geographic box. Used to pre-filter sightings in the database.
 */
export function lonLatBoundsToLambert(
  bounds: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  },
  project: (position: LonLat) => { x: number; y: number },
): LambertBounds {
  const corners = [
    project({ longitude: bounds.minLon, latitude: bounds.minLat }),
    project({ longitude: bounds.maxLon, latitude: bounds.minLat }),
    project({ longitude: bounds.maxLon, latitude: bounds.maxLat }),
    project({ longitude: bounds.minLon, latitude: bounds.maxLat }),
  ];

  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

/** Normalise a boundary geometry into a FeatureCollection for the map API. */
export function boundaryToFeatureCollection(
  feature: BoundaryFeature,
): FeatureCollection<BoundaryGeometry, BoundaryFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: [feature],
  };
}
