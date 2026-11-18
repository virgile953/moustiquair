import { describe, expect, test } from "bun:test";

import {
  addDaysToDateKey,
  daysBetweenDateKeys,
  getPeriodStart,
  isFutureDateKey,
  parisDateKey,
  parisWallTimeToUtc,
  startOfParisDayUtc,
} from "@/lib/time";

describe("Europe/Paris time handling", () => {
  test("converts winter wall time with a one-hour offset", () => {
    const instant = parisWallTimeToUtc("2026-01-15", 12, 0);
    expect(instant.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  test("converts summer wall time with a two-hour offset", () => {
    const instant = parisWallTimeToUtc("2026-07-15", 12, 0);
    expect(instant.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  test("starts a Paris day at the correct UTC instant", () => {
    expect(startOfParisDayUtc("2026-08-01").toISOString()).toBe("2026-07-31T22:00:00.000Z");
  });

  test("assigns a UTC instant to the correct Paris calendar day", () => {
    expect(parisDateKey(new Date("2026-01-01T22:30:00.000Z"))).toBe("2026-01-01");
    expect(parisDateKey(new Date("2026-01-01T23:30:00.000Z"))).toBe("2026-01-02");
    expect(parisDateKey(new Date("2026-07-01T21:30:00.000Z"))).toBe("2026-07-01");
    expect(parisDateKey(new Date("2026-07-01T22:30:00.000Z"))).toBe("2026-07-02");
  });

  test("adds calendar days across month and year boundaries", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToDateKey("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("observation periods", () => {
  const now = new Date("2026-11-19T12:00:00.000Z");

  test("starts the seven-day window six days ago at Paris midnight", () => {
    const start = getPeriodStart("7", now);
    expect(start?.toISOString()).toBe("2026-11-12T23:00:00.000Z");
  });

  test("starts the thirty-day window twenty-nine days ago", () => {
    const start = getPeriodStart("30", now);
    expect(start?.toISOString()).toBe("2026-10-20T22:00:00.000Z");
  });

  test("starts the ninety-day window eighty-nine days ago", () => {
    const start = getPeriodStart("90", now);
    expect(start?.toISOString()).toBe("2026-08-21T22:00:00.000Z");
  });

  test("returns no lower bound for the whole period", () => {
    expect(getPeriodStart("all", now)).toBeNull();
  });

  test("detects future date keys, not today", () => {
    expect(isFutureDateKey("2026-11-19", now)).toBe(false);
    expect(isFutureDateKey("2026-11-18", now)).toBe(false);
    expect(isFutureDateKey("2026-11-20", now)).toBe(true);
  });

  test("counts calendar days between keys", () => {
    expect(daysBetweenDateKeys("2026-11-01", "2026-11-19")).toBe(18);
    expect(daysBetweenDateKeys("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetweenDateKeys("not-a-date", "2026-01-01")).toBeNaN();
  });
});
