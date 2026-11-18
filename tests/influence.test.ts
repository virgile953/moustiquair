import { describe, expect, test } from "bun:test";

import { calculateActivityGrid, calculateInfluence, sightingCellId } from "@/lib/geo/influence";
import type { ModelSighting } from "@/lib/geo/types";

const OBSERVED_AT = "2026-11-10T11:00:00.000Z";

function sighting(
  id: string,
  x: number,
  y: number,
): ModelSighting & { projectedX: number; projectedY: number } {
  return {
    id,
    longitude: 0,
    latitude: 0,
    projectedX: x,
    projectedY: y,
    observedAt: OBSERVED_AT,
  };
}

describe("quadratic influence function", () => {
  test("matches the documented reference values", () => {
    expect(calculateInfluence(0, 100)).toBe(1);
    expect(calculateInfluence(25, 100)).toBe(0.5625);
    expect(calculateInfluence(50, 100)).toBe(0.25);
    expect(calculateInfluence(75, 100)).toBe(0.0625);
    expect(calculateInfluence(100, 100)).toBe(0);
  });

  test("is zero beyond the radius", () => {
    expect(calculateInfluence(100.0001, 100)).toBe(0);
    expect(calculateInfluence(250, 100)).toBe(0);
  });

  test("uses the configured radius rather than a hard-coded one", () => {
    expect(calculateInfluence(25, 50)).toBe(0.25);
    expect(calculateInfluence(50, 200)).toBe(0.5625);
  });

  test("rejects impossible distances", () => {
    expect(() => calculateInfluence(-1, 100)).toThrow(RangeError);
    expect(() => calculateInfluence(Number.NaN, 100)).toThrow(RangeError);
    expect(() => calculateInfluence(Number.POSITIVE_INFINITY, 100)).toThrow(RangeError);
  });
});

describe("activity aggregation", () => {
  test("an empty dataset produces no cells", () => {
    expect(calculateActivityGrid([])).toEqual([]);
  });

  test("a single sighting scores 1 at the centre of its own cell", () => {
    const point = sighting("a", 640_005, 6_880_005);
    const cells = calculateActivityGrid([point]);
    const ownCell = cells.find((cell) => cell.cellId === sightingCellId(point));

    expect(ownCell).toBeDefined();
    expect(ownCell?.score).toBeCloseTo(1, 10);
    expect(ownCell?.contributingReports).toBe(1);
    expect(ownCell?.centerX).toBe(640_005);
    expect(ownCell?.centerY).toBe(6_880_005);
    expect(ownCell?.latestObservedAt).toBe(OBSERVED_AT);
  });

  test("one sighting influences roughly 300 cells, not the whole municipality", () => {
    const cells = calculateActivityGrid([sighting("a", 640_005, 6_880_005)]);
    // Integer lattice points strictly inside a 100 m circle: 305 cells.
    // Points exactly on the radius are excluded because their weight is zero.
    expect(cells.length).toBe(305);
  });

  test("overlapping sightings add their contributions", () => {
    const a = sighting("a", 640_005, 6_880_005);
    const b = sighting("b", 640_025, 6_880_005);

    const cells = calculateActivityGrid([a, b]);
    const cellA = cells.find((cell) => cell.cellId === "64000:688000");
    const cellB = cells.find((cell) => cell.cellId === "64002:688000");

    // Cell A is 20 m from B: 1 + (1 - 20/100)^2 = 1.64
    expect(cellA?.score).toBeCloseTo(1.64, 10);
    expect(cellA?.contributingReports).toBe(2);
    expect(cellB?.score).toBeCloseTo(1.64, 10);
  });

  test("a report outside the influence radius does not affect a cell", () => {
    const point = sighting("a", 640_005, 6_880_005);
    const cells = calculateActivityGrid([point]);

    // This cell centre is 110 m to the east; its weight is zero.
    expect(cells.some((cell) => cell.centerX === 640_115 && cell.centerY === 6_880_005)).toBe(
      false,
    );
  });

  test("counts distinct reports, even at the same position", () => {
    const sightings = [
      sighting("a", 640_005, 6_880_005),
      sighting("b", 640_005, 6_880_005),
      sighting("c", 640_005, 6_880_005),
    ];
    const cells = calculateActivityGrid(sightings);
    const ownCell = cells.find((cell) => cell.cellId === "64000:688000");

    expect(ownCell?.score).toBeCloseTo(3, 10);
    expect(ownCell?.contributingReports).toBe(3);
  });

  test("is deterministic regardless of input order", () => {
    const sightings = [
      sighting("c", 640_045, 6_880_015),
      sighting("a", 640_005, 6_880_005),
      sighting("b", 640_025, 6_880_025),
    ];

    const first = calculateActivityGrid(sightings);
    const second = calculateActivityGrid([...sightings].reverse());

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("restricts output to a requested metric bounding box", () => {
    const cells = calculateActivityGrid([sighting("a", 640_005, 6_880_005)], {
      bbox: { minX: 640_000, minY: 6_880_000, maxX: 640_020, maxY: 6_880_020 },
    });

    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.cellX).toBeLessThanOrEqual(640_020);
      expect(cell.cellX + 10).toBeGreaterThanOrEqual(640_000);
      expect(cell.cellY).toBeLessThanOrEqual(6_880_020);
      expect(cell.cellY + 10).toBeGreaterThanOrEqual(6_880_000);
    }
  });

  test("coarse cells average all underlying 10 m centres, including zeros", () => {
    const point = sighting("a", 640_005, 6_880_005);
    const cells = calculateActivityGrid([point], { resolution: 100 });
    const coarse = cells.find((cell) => cell.cellId === "6400:68800");

    let expected = 0;
    for (let subY = 0; subY < 10; subY += 1) {
      for (let subX = 0; subX < 10; subX += 1) {
        const sampleX = 640_000 + subX * 10 + 5;
        const sampleY = 6_880_000 + subY * 10 + 5;
        const distance = Math.hypot(sampleX - point.projectedX, sampleY - point.projectedY);
        expected += calculateInfluence(distance, 100);
      }
    }
    expected /= 100;

    expect(coarse).toBeDefined();
    expect(coarse?.score).toBeCloseTo(expected, 10);
    // Averaging with zero cells prevents coarse views from looking hotter.
    expect(coarse?.score).toBeLessThan(1);
  });

  test("rejects unsupported resolutions", () => {
    const point = sighting("a", 640_005, 6_880_005);
    expect(() => calculateActivityGrid([point], { resolution: 15 })).toThrow(RangeError);
  });
});
