import { describe, expect, test } from "bun:test";

import {
  distanceMeters,
  distanceMetersLambert,
  lambert93ToLonLat,
  lonLatToLambert93,
} from "@/lib/geo/projection";

const EPSILON_METERS = 0.05;

function expectNear(actual: number, expected: number, tolerance = EPSILON_METERS): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

describe("Lambert-93 projection", () => {
  test("matches published reference coordinates", () => {
    const cases = [
      { name: "Paris Notre-Dame", lon: 2.349902, lat: 48.852968, x: 652297.0906, y: 6861632.7992 },
      { name: "Paris centre", lon: 2.352222, lat: 48.856667, x: 652470.698, y: 6862042.696 },
      { name: "Tour Eiffel", lon: 2.294481, lat: 48.85837, x: 648235.8777, y: 6862268.3583 },
      { name: "Herblay centre", lon: 2.169, lat: 49.006, x: 639202.3842, y: 6878773.8806 },
    ];

    for (const reference of cases) {
      const projected = lonLatToLambert93({
        longitude: reference.lon,
        latitude: reference.lat,
      });
      expectNear(projected.x, reference.x);
      expectNear(projected.y, reference.y);
    }
  });

  test("round-trips GPS coordinates without swapping longitude and latitude", () => {
    const original = { longitude: 2.1556, latitude: 49.0052 };
    const projected = lonLatToLambert93(original);
    const restored = lambert93ToLonLat(projected);

    expect(restored.longitude).toBeCloseTo(original.longitude, 9);
    expect(restored.latitude).toBeCloseTo(original.latitude, 9);
    // A swapped pair would not round-trip back to a valid Herblay coordinate.
    expect(restored.longitude).toBeGreaterThan(2);
    expect(restored.latitude).toBeGreaterThan(48);
  });

  test("computes a realistic metric distance between two municipalities", () => {
    const paris = { longitude: 2.352222, latitude: 48.856667 };
    const herblay = { longitude: 2.169, latitude: 49.006 };

    // About 21.4 km in reality. The tolerance catches errors caused by adding
    // or subtracting degrees without projecting first.
    expectNear(distanceMeters(paris, herblay), 21_410, 60);

    const a = lonLatToLambert93(paris);
    const b = lonLatToLambert93(herblay);
    expect(distanceMetersLambert(a, b)).toBeCloseTo(distanceMeters(paris, herblay), 6);
  });

  test("one hundredth of a degree of latitude is about 1.11 km", () => {
    const a = { longitude: 2.15, latitude: 49 };
    const b = { longitude: 2.15, latitude: 49.01 };
    expectNear(distanceMeters(a, b), 1112, 10);
  });

  test("rejects non-finite and out-of-range coordinates", () => {
    expect(() => lonLatToLambert93({ longitude: Number.NaN, latitude: 49 })).toThrow(RangeError);
    expect(() => lonLatToLambert93({ longitude: 2.15, latitude: 120 })).toThrow(RangeError);
    expect(() => lambert93ToLonLat({ x: Number.POSITIVE_INFINITY, y: 0 })).toThrow(RangeError);
  });
});
