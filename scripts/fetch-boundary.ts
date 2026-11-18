/**
 * Download, validate and normalise the official municipal boundary of
 * Herblay-sur-Seine (INSEE 95306), then save it as a versioned GeoJSON file.
 *
 * Usage: bun run boundary:fetch
 *
 * The application never fetches this geometry at runtime. The generated file
 * is committed to the repository so that the map works offline and remains
 * reproducible.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { MultiPolygon, Polygon, Position } from "geojson";
import type { BoundaryGeometry } from "../src/lib/geo/boundary";
import { lonLatToLambert93 } from "../src/lib/geo/projection";

const INSEE_CODE = "95306";
const SOURCE_URL = `https://geo.api.gouv.fr/communes/${INSEE_CODE}?format=geojson&geometry=contour`;
const OUTPUT_PATH = resolve(
  import.meta.dir,
  "../src/data/boundary/herblay-sur-seine-95306.v1.json",
);

interface ApiFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

function closeRing(ring: Position[]): Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) throw new Error("Empty ring");
  const firstLon = first[0];
  const firstLat = first[1];
  if (firstLon === undefined || firstLat === undefined) throw new Error("Invalid ring");
  if (firstLon !== last[0] || firstLat !== last[1]) {
    return [...ring, [firstLon, firstLat] as Position];
  }
  return ring;
}

function normaliseGeometry(raw: unknown): BoundaryGeometry {
  if (!raw || typeof raw !== "object") throw new Error("Missing geometry");
  const geometry = raw as { type: string; coordinates: unknown };

  const validateRing = (ring: unknown): Position[] => {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new Error("A polygon ring must contain at least four positions.");
    }
    return closeRing(
      ring.map((position) => {
        if (
          !Array.isArray(position) ||
          position.length < 2 ||
          typeof position[0] !== "number" ||
          typeof position[1] !== "number"
        ) {
          throw new Error("Invalid coordinate in boundary geometry.");
        }
        const longitude = position[0] as number;
        const latitude = position[1] as number;
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
          throw new Error(`Coordinate out of range: ${longitude}, ${latitude}`);
        }
        return [longitude, latitude] as Position;
      }),
    );
  };

  if (geometry.type === "Polygon") {
    if (!Array.isArray(geometry.coordinates)) throw new Error("Invalid Polygon coordinates");
    const coordinates = geometry.coordinates.map(validateRing);
    return { type: "Polygon", coordinates } satisfies Polygon;
  }

  if (geometry.type === "MultiPolygon") {
    if (!Array.isArray(geometry.coordinates)) throw new Error("Invalid MultiPolygon coordinates");
    const coordinates = geometry.coordinates.map((polygon) => {
      if (!Array.isArray(polygon)) throw new Error("Invalid MultiPolygon polygon");
      return polygon.map(validateRing);
    });
    return { type: "MultiPolygon", coordinates } satisfies MultiPolygon;
  }

  throw new Error(`Unsupported boundary geometry: ${geometry.type}`);
}

function ringAreaSquareMetres(ring: Position[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const current = ring[i];
    const next = ring[i + 1];
    if (!current || !next) continue;
    const currentLon = current[0];
    const currentLat = current[1];
    const nextLon = next[0];
    const nextLat = next[1];
    if (
      currentLon === undefined ||
      currentLat === undefined ||
      nextLon === undefined ||
      nextLat === undefined
    ) {
      continue;
    }
    const a = lonLatToLambert93({ longitude: currentLon, latitude: currentLat });
    const b = lonLatToLambert93({ longitude: nextLon, latitude: nextLat });
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function geometryAreaSquareMetres(geometry: BoundaryGeometry): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce((total, polygon) => {
    const [exterior, ...holes] = polygon;
    if (!exterior) return total;
    const holesArea = holes.reduce((sum, hole) => sum + ringAreaSquareMetres(hole), 0);
    return total + ringAreaSquareMetres(exterior) - holesArea;
  }, 0);
}

async function main() {
  console.log(`Downloading ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`geo.api.gouv.fr returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiFeature;
  if (payload.type !== "Feature" || payload.properties.code !== INSEE_CODE) {
    throw new Error("Unexpected API response: not the requested commune.");
  }

  const geometry = normaliseGeometry(payload.geometry);
  const areaKm2 = geometryAreaSquareMetres(geometry) / 1_000_000;
  if (areaKm2 < 1 || areaKm2 > 100) {
    throw new Error(`Implausible commune area: ${areaKm2.toFixed(2)} km²`);
  }

  const feature = {
    type: "Feature" as const,
    properties: {
      name: String(payload.properties.nom ?? "Herblay-sur-Seine"),
      insee: INSEE_CODE,
      department: String(payload.properties.codeDepartement ?? "95"),
      region: String(payload.properties.codeRegion ?? "11"),
      source: SOURCE_URL,
      license: "Etalab 2.0 — geo.api.gouv.fr",
      retrievedAt: new Date().toISOString(),
      version: "1.0.0",
    },
    geometry,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(feature, null, 2)}\n`, "utf8");

  console.log(`Boundary geometry: ${geometry.type}`);
  console.log(`Area: ${areaKm2.toFixed(2)} km²`);
  console.log(`Written to ${OUTPUT_PATH}`);
}

await main();
