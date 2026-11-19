/**
 * Shared fixtures for integration tests.
 *
 * Every fixture is deterministic. Tests call `resetDatabase()` before each
 * case, so the suite can run in any order and never depends on demo data.
 */

import { NextRequest } from "next/server";

import { createTeacherSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { type NewSightingRow, rateLimits, sessions, sightings } from "@/lib/db/schema";
import { projectSighting } from "@/lib/geo/projection";
import { addDaysToDateKey, parisDateKey, parisWallTimeToUtc } from "@/lib/time";

/** A point well inside Herblay-sur-Seine. */
export const HERBLAY_CENTER = { longitude: 2.1556, latitude: 49.0052 };

/** A point well inside Saint-Leu-la-Forêt (INSEE 95563). */
export const SAINT_LEU_CENTER = { longitude: 2.243, latitude: 49.0211 };

export function atNoonDaysAgo(daysAgo: number, now: Date = new Date()): Date {
  const key = addDaysToDateKey(parisDateKey(now), -daysAgo);
  return parisWallTimeToUtc(key, 12, 0);
}

export function makeSighting(overrides: Partial<NewSightingRow> = {}): NewSightingRow {
  const longitude = overrides.longitude ?? HERBLAY_CENTER.longitude;
  const latitude = overrides.latitude ?? HERBLAY_CENTER.latitude;
  const projected = projectSighting({ longitude, latitude });
  const observedAt = overrides.observedAt ?? atNoonDaysAgo(2);
  const now = new Date();

  return {
    id: overrides.id ?? crypto.randomUUID(),
    longitude,
    latitude,
    projectedX: overrides.projectedX ?? projected.projectedX,
    projectedY: overrides.projectedY ?? projected.projectedY,
    observedAt,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    mosquitoCount: overrides.mosquitoCount ?? "2-5",
    reporterConfidence: overrides.reporterConfidence ?? "likely",
    notes: overrides.notes ?? null,
    status: overrides.status ?? "approved",
    isDemo: overrides.isDemo ?? false,
    reviewedAt: overrides.reviewedAt ?? null,
    ...overrides,
  };
}

export function insertSightings(rows: NewSightingRow[]): void {
  if (rows.length === 0) return;
  getDb().insert(sightings).values(rows).run();
}

export function resetDatabase(): void {
  const db = getDb();
  db.delete(sightings).run();
  db.delete(sessions).run();
  db.delete(rateLimits).run();
}

export interface TeacherCookie {
  cookie: string;
  expiresAt: Date;
}

export function createTeacherCookie(): TeacherCookie {
  const session = createTeacherSession();
  return {
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.token)}`,
    expiresAt: session.expiresAt,
  };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Distinct fake client addresses keep rate limits independent in tests. */
  ip?: string;
}

export function apiRequest(path: string, options: RequestOptions = {}): NextRequest {
  const headers = new Headers(options.headers);
  headers.set("host", "localhost:3000");
  if (options.ip) headers.set("x-forwarded-for", options.ip);
  if (options.body !== undefined) headers.set("content-type", "application/json");

  return new NextRequest(`http://localhost:3000${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export function adminHeaders(cookie: string, ip = "10.0.0.1"): Record<string, string> {
  return {
    cookie,
    "x-moustiquair-csrf": "1",
    origin: "http://localhost:3000",
    "x-forwarded-for": ip,
  };
}
