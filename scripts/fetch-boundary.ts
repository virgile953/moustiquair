/**
 * Download, validate and normalise the official municipal boundaries of every
 * supported city, then save them as versioned GeoJSON files.
 *
 * Usage: bun run boundary:fetch
 *
 * The application never fetches these geometries at runtime. The generated
 * files are committed so that the map works offline and stays reproducible.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { MultiPolygon, Polygon, Position } from "geojson";
import { SUPPORTED_CITIES } from "../src/lib/cities";
import type { BoundaryGeometry } from "../src/lib/geo/boundary";
import { lonLatToLambert93 } from "../src/lib/geo/projection";

const OUTPUT_DIRECTORY = resolve(import.meta.dir, "../src/data/boundary");

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
    const [currentLon, currentLat] = current;
    const [nextLon, nextLat] = next;
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

async function fetchCity(city: (typeof SUPPORTED_CITIES)[number]): Promise<void> {
  const sourceUrl = `https://geo.api.gouv.fr/communes/${city.insee}?format=geojson&geometry=contour`;
  console.log(`\nDownloading ${sourceUrl}`);

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`geo.api.gouv.fr returned HTTP ${response.status} for ${city.insee}`);
  }

  const payload = (await response.json()) as ApiFeature;
  if (payload.type !== "Feature" || payload.properties.code !== city.insee) {
    throw new Error(`Unexpected API response for INSEE ${city.insee}`);
  }

  const geometry = normaliseGeometry(payload.geometry);
  const areaKm2 = geometryAreaSquareMetres(geometry) / 1_000_000;
  if (areaKm2 < 0.5 || areaKm2 > 100) {
    throw new Error(`Implausible area for ${city.name}: ${areaKm2.toFixed(2)} km²`);
  }

  const feature = {
    type: "Feature" as const,
    properties: {
      name: city.name,
      insee: city.insee,
      department: city.departmentCode,
      region: "11",
      source: sourceUrl,
      license: "Etalab 2.0 — geo.api.gouv.fr",
      retrievedAt: new Date().toISOString(),
      version: "1.0.0",
    },
    geometry,
  };

  const outputPath = resolve(OUTPUT_DIRECTORY, `${city.slug}-${city.insee}.v1.json`);
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(feature, null, 2)}\n`, "utf8");

  console.log(`Boundary geometry: ${geometry.type}`);
  console.log(`Area: ${areaKm2.toFixed(2)} km²`);
  console.log(`Written to ${outputPath}`);
}

async function main() {
  for (const city of SUPPORTED_CITIES) {
    await fetchCity(city);
  }
  console.log(`\n${SUPPORTED_CITIES.length} boundaries downloaded and validated.`);
}

await main();
