/**
 * Coordinate projection helpers.
 *
 * Why project coordinates?
 * GPS gives longitude and latitude in degrees. A degree of longitude is about
 * 111 km at the equator but only about 73 km at the latitude of the Val-d'Oise. Doing
 * `sqrt(dx² + dy²)` directly on degrees would therefore produce a distorted
 * distance. Lambert-93 (EPSG:2154) is an official French projection whose unit
 * is the metre, which makes distance and grid calculations honest.
 */

import proj4 from "proj4";

import type { Lambert93, LonLat } from "./types";

/**
 * RGF93 / Lambert-93 definition (EPSG:2154).
 * The parameters are those published by the IGN / EPSG registry.
 */
const LAMBERT_93_DEFINITION =
  "+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 " +
  "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

export const LAMBERT_93 = "EPSG:2154";
export const WGS84 = "EPSG:4326";

proj4.defs(LAMBERT_93, LAMBERT_93_DEFINITION);

const lambert93Projection = proj4(WGS84, LAMBERT_93);

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number (received ${value}).`);
  }
}

/**
 * Convert a GPS coordinate (EPSG:4326) to Lambert-93 metres (EPSG:2154).
 */
export function lonLatToLambert93(position: LonLat): Lambert93 {
  assertFinite(position.longitude, "longitude");
  assertFinite(position.latitude, "latitude");
  if (position.longitude < -180 || position.longitude > 180) {
    throw new RangeError("longitude must be between -180 and 180.");
  }
  if (position.latitude < -90 || position.latitude > 90) {
    throw new RangeError("latitude must be between -90 and 90.");
  }

  const [x, y] = lambert93Projection.forward([position.longitude, position.latitude]);
  if (x === undefined || y === undefined) {
    throw new Error("Lambert-93 projection failed.");
  }
  return { x, y };
}

/**
 * Convert Lambert-93 metres back to a GPS coordinate.
 * GeoJSON output relies on this function to produce [longitude, latitude].
 */
export function lambert93ToLonLat(position: Lambert93): LonLat {
  assertFinite(position.x, "x");
  assertFinite(position.y, "y");

  const [longitude, latitude] = lambert93Projection.inverse([position.x, position.y]);
  if (longitude === undefined || latitude === undefined) {
    throw new Error("Lambert-93 inverse projection failed.");
  }
  return { longitude, latitude };
}

/**
 * Euclidean distance between two projected points, in metres.
 * This is the low-level helper used by the influence model.
 */
export function distanceMetersLambert(a: Lambert93, b: Lambert93): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/**
 * Distance between two GPS coordinates, in metres.
 *
 * Both points are projected into Lambert-93 first. Never subtract longitude
 * and latitude degrees directly: the result would not be a metric distance.
 */
export function distanceMeters(a: LonLat, b: LonLat): number {
  return distanceMetersLambert(lonLatToLambert93(a), lonLatToLambert93(b));
}

/**
 * Project a sighting once and reuse the result.
 * The database stores projectedX / projectedY for exactly this reason.
 */
export function projectSighting(position: LonLat): { projectedX: number; projectedY: number } {
  const projected = lonLatToLambert93(position);
  return { projectedX: projected.x, projectedY: projected.y };
}
