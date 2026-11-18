import { describe, expect, test } from "bun:test";

import {
  cellToBounds,
  cellToCenter,
  cellToGeoJSON,
  cellToLonLatRing,
  coordinateToCell,
  geoJsonPositionToLonLat,
  getCellsWithinRadius,
  getGridRangeForBounds,
  makeCellId,
  parseCellId,
} from "@/lib/geo/grid";
import { distanceMeters } from "@/lib/geo/projection";

describe("grid indexing", () => {
  test("assigns a metric point to the correct cell", () => {
    expect(coordinateToCell({ x: 1_234_567.8, y: 6_876_543.2 })).toEqual({
      gridX: 123_456,
      gridY: 687_654,
    });
    expect(coordinateToCell({ x: 640_000, y: 6_880_000 })).toEqual({
      gridX: 64_000,
      gridY: 688_000,
    });
  });

  test("uses floor for negative coordinates", () => {
    expect(coordinateToCell({ x: -0.1, y: -0.1 })).toEqual({ gridX: -1, gridY: -1 });
    expect(coordinateToCell({ x: -10, y: -10 })).toEqual({ gridX: -1, gridY: -1 });
    expect(coordinateToCell({ x: -10.1, y: -10.1 })).toEqual({ gridX: -2, gridY: -2 });
  });

  test("a point on a boundary belongs to the north-east cell", () => {
    expect(coordinateToCell({ x: 0, y: 0 })).toEqual({ gridX: 0, gridY: 0 });
    expect(coordinateToCell({ x: 10, y: 10 })).toEqual({ gridX: 1, gridY: 1 });
    expect(coordinateToCell({ x: -10, y: -10 })).toEqual({ gridX: -1, gridY: -1 });
  });

  test("builds and parses stable identifiers", () => {
    const id = makeCellId(-12_034, 56_789);
    expect(id).toBe("-12034:56789");
    expect(parseCellId(id)).toEqual({ gridX: -12_034, gridY: 56_789 });
    expect(parseCellId("12:")).toBeNull();
    expect(parseCellId("not-a-cell")).toBeNull();
  });

  test("computes bounds and centre from the southwest corner", () => {
    expect(cellToBounds(64_000, 688_000)).toEqual({
      minX: 640_000,
      minY: 6_880_000,
      maxX: 640_010,
      maxY: 6_880_010,
    });
    expect(cellToCenter(64_000, 688_000)).toEqual({ x: 640_005, y: 6_880_005 });
  });

  test("returns a closed GeoJSON ring with ten-metre sides", () => {
    const ring = cellToLonLatRing(64_000, 688_000);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);

    const southwest = geoJsonPositionToLonLat(ring[0] as [number, number]);
    const southeast = geoJsonPositionToLonLat(ring[1] as [number, number]);
    const northeast = geoJsonPositionToLonLat(ring[2] as [number, number]);

    expect(distanceMeters(southwest, southeast)).toBeCloseTo(10, 1);
    expect(distanceMeters(southeast, northeast)).toBeCloseTo(10, 1);
  });

  test("wraps a cell into a GeoJSON feature", () => {
    const feature = cellToGeoJSON(64_000, 688_000, 10, { cellId: "64000:688000" });
    expect(feature.type).toBe("Feature");
    expect(feature.id).toBe("64000:688000");
    expect(feature.properties.cellId).toBe("64000:688000");
    expect(feature.geometry.type).toBe("Polygon");
    expect(feature.geometry.coordinates[0]).toHaveLength(5);
  });

  test("covers a bounding box with an integer grid range", () => {
    expect(
      getGridRangeForBounds({ minX: 640_000, minY: 6_880_000, maxX: 640_030, maxY: 6_880_030 }),
    ).toEqual({ minGridX: 64_000, maxGridX: 64_003, minGridY: 688_000, maxGridY: 688_003 });
  });
});

describe("candidate cells within a radius", () => {
  const centre = { x: 640_005, y: 6_880_005 };

  test("includes only cell centres at or below the radius", () => {
    const cells = getCellsWithinRadius(centre, 20);
    expect(cells).toHaveLength(13); // centre + 4 neighbours + 4 diagonals + 4 at 20 m
    for (const cell of cells) expect(cell.distance).toBeLessThanOrEqual(20);
    expect(cells.every((cell) => cell.cellId === makeCellId(cell.gridX, cell.gridY))).toBe(true);
  });

  test("returns the containing cell for a zero radius", () => {
    const cells = getCellsWithinRadius(centre, 0);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.cellId).toBe("64000:688000");
  });
});
