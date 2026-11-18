import { describe, expect, test } from "bun:test";
import type { MultiPolygon, Polygon } from "geojson";

import {
  boundaryBoundingBox,
  boundaryToFeatureCollection,
  isInsideBoundary,
  isPointInPolygon,
} from "@/lib/geo/boundary";
import {
  HERBLAY_BOUNDARY,
  HERBLAY_BOUNDARY_BBOX,
  HERBLAY_BOUNDARY_GEOMETRY,
  STUDY_AREA,
} from "@/lib/geo/herblay-boundary";

function square(minX: number, minY: number, size: number): [number, number][] {
  return [
    [minX, minY],
    [minX + size, minY],
    [minX + size, minY + size],
    [minX, minY + size],
    [minX, minY],
  ];
}

describe("Herblay-sur-Seine boundary", () => {
  test("contains the town centre and identifies the study area", () => {
    expect(
      isInsideBoundary(
        STUDY_AREA.center.longitude,
        STUDY_AREA.center.latitude,
        HERBLAY_BOUNDARY_GEOMETRY,
      ),
    ).toBe(true);
    expect(STUDY_AREA.insee).toBe("95306");
    expect(STUDY_AREA.name).toBe("Herblay-sur-Seine");
    expect(STUDY_AREA.department).toBe("Val-d'Oise");
  });

  test("rejects points outside the commune", () => {
    expect(isInsideBoundary(2.0, 49.0, HERBLAY_BOUNDARY_GEOMETRY)).toBe(false);
    expect(isInsideBoundary(2.3, 49.0, HERBLAY_BOUNDARY_GEOMETRY)).toBe(false);
    expect(isInsideBoundary(2.1556, 48.9, HERBLAY_BOUNDARY_GEOMETRY)).toBe(false);
  });

  test("reports a bounding box consistent with the stored metadata", () => {
    const bbox = boundaryBoundingBox(HERBLAY_BOUNDARY_GEOMETRY);
    expect(bbox.minLon).toBeCloseTo(HERBLAY_BOUNDARY_BBOX.minLon, 9);
    expect(bbox.minLat).toBeCloseTo(HERBLAY_BOUNDARY_BBOX.minLat, 9);
    expect(bbox.maxLon).toBeCloseTo(HERBLAY_BOUNDARY_BBOX.maxLon, 9);
    expect(bbox.maxLat).toBeCloseTo(HERBLAY_BOUNDARY_BBOX.maxLat, 9);
  });

  test("wraps the boundary in a map-ready FeatureCollection", () => {
    const collection = boundaryToFeatureCollection(HERBLAY_BOUNDARY);
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.properties.insee).toBe("95306");
  });
});

describe("point-in-polygon geometry", () => {
  const polygon: Polygon = {
    type: "Polygon",
    coordinates: [square(0, 0, 10)],
  };

  test("accepts interior points and rejects exterior points", () => {
    expect(isPointInPolygon({ longitude: 5, latitude: 5 }, polygon)).toBe(true);
    expect(isPointInPolygon({ longitude: -1, latitude: 5 }, polygon)).toBe(false);
    expect(isPointInPolygon({ longitude: 5, latitude: 11 }, polygon)).toBe(false);
  });

  test("behaves predictably very close to an edge", () => {
    expect(isPointInPolygon({ longitude: 0.0001, latitude: 5 }, polygon)).toBe(true);
    expect(isPointInPolygon({ longitude: -0.0001, latitude: 5 }, polygon)).toBe(false);
    expect(isPointInPolygon({ longitude: 5, latitude: 9.9999 }, polygon)).toBe(true);
    expect(isPointInPolygon({ longitude: 5, latitude: 10.0001 }, polygon)).toBe(false);
  });

  test("respects holes", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [square(0, 0, 10), square(3, 3, 4)],
    };
    expect(isPointInPolygon({ longitude: 1, latitude: 1 }, withHole)).toBe(true);
    expect(isPointInPolygon({ longitude: 5, latitude: 5 }, withHole)).toBe(false);
    expect(isPointInPolygon({ longitude: 12, latitude: 5 }, withHole)).toBe(false);
  });

  test("supports MultiPolygon boundaries", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[square(0, 0, 4)], [square(10, 10, 4)]],
    };

    expect(isInsideBoundary(2, 2, multi)).toBe(true);
    expect(isInsideBoundary(12, 12, multi)).toBe(true);
    expect(isInsideBoundary(6, 6, multi)).toBe(false);
    expect(boundaryBoundingBox(multi)).toEqual({ minLon: 0, minLat: 0, maxLon: 14, maxLat: 14 });
  });

  test("rejects invalid coordinate ranges before geometry checks", () => {
    expect(isInsideBoundary(Number.NaN, 49, HERBLAY_BOUNDARY_GEOMETRY)).toBe(false);
    expect(isInsideBoundary(200, 49, HERBLAY_BOUNDARY_GEOMETRY)).toBe(false);
    expect(isInsideBoundary(2.15, -100, HERBLAY_BOUNDARY_GEOMETRY)).toBe(false);
  });
});
