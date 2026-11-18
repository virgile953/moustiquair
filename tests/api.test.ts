import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { FeatureCollection, Polygon } from "geojson";
import { POST as login } from "@/app/api/admin/login/route";
import { PATCH as reviewAdminSighting } from "@/app/api/admin/sightings/[id]/route";
import { GET as listAdminSightings } from "@/app/api/admin/sightings/route";
import { GET as getGrid } from "@/app/api/map/grid/route";
import { POST as submitSighting } from "@/app/api/sightings/route";
import { GET as getStats } from "@/app/api/stats/route";
import type { ActivityFeatureProperties } from "@/lib/activity-service";
import { getDb } from "@/lib/db/client";
import { sightings } from "@/lib/db/schema";
import { addDaysToDateKey, parisDateKey } from "@/lib/time";
import { TEST_ADMIN_PASSWORD } from "./constants";
import {
  adminHeaders,
  apiRequest,
  atNoonDaysAgo,
  createTeacherCookie,
  HERBLAY_CENTER,
  insertSightings,
  makeSighting,
  resetDatabase,
} from "./helpers";

const PUBLIC_BBOX = "2.154,49.004,2.157,49.006";

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

type ActivityFeatureCollection = FeatureCollection<Polygon, ActivityFeatureProperties>;

function submissionBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    longitude: HERBLAY_CENTER.longitude,
    latitude: HERBLAY_CENTER.latitude,
    observedOn: parisDateKey(),
    mosquitoCount: "2-5",
    reporterConfidence: "likely",
    notes: "Observé au jardin.",
    confirmation: true,
    ...overrides,
  };
}

beforeEach(() => {
  resetDatabase();
});

describe("POST /api/sightings", () => {
  test("accepts a valid report and stores it as pending", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", { body: submissionBody(), ip: "203.0.113.1" }),
    );
    const body = (await response.json()) as { id: string; status: string };

    expect(response.status).toBe(201);
    expect(body.status).toBe("pending");
    expect(body.id).toMatch(/[0-9a-f-]{36}/);

    const row = getDb().select().from(sightings).where(eq(sightings.id, body.id)).get();
    expect(row?.status).toBe("pending");
    expect(row?.isDemo).toBe(false);
    expect(row?.projectedX).toBeGreaterThan(600_000);
    expect(row?.projectedY).toBeGreaterThan(6_800_000);
  });

  test("rejects invalid payloads with field details", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody({ confirmation: false, mosquitoCount: "beaucoup" }),
        ip: "203.0.113.2",
      }),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details?.confirmation).toBeDefined();
    expect(body.error.details?.mosquitoCount).toBeDefined();
  });

  test("rejects observations outside the municipality", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody({ longitude: 2.3, latitude: 49 }),
        ip: "203.0.113.3",
      }),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("OUTSIDE_STUDY_AREA");
  });

  test("rejects future observations", async () => {
    const tomorrow = addDaysToDateKey(parisDateKey(), 1);
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody({ observedOn: tomorrow }),
        ip: "203.0.113.4",
      }),
    );
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("FUTURE_OBSERVATION");
  });

  test("silently ignores honeypot submissions", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody({ website: "https://spam.example" }),
        ip: "203.0.113.5",
      }),
    );

    expect(response.status).toBe(201);
    expect(getDb().select().from(sightings).all()).toHaveLength(0);
  });

  test("rejects cross-site submissions", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody(),
        headers: { origin: "https://evil.example" },
        ip: "203.0.113.6",
      }),
    );
    expect(response.status).toBe(403);
  });

  test("limits repeated submissions from one client", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await submitSighting(
        apiRequest("/api/sightings", { body: submissionBody(), ip: "203.0.113.7" }),
      );
      expect(response.status).toBe(201);
    }
    const blocked = await submitSighting(
      apiRequest("/api/sightings", { body: submissionBody(), ip: "203.0.113.7" }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  test("rejects oversized payloads", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody({ notes: "x".repeat(20_000) }),
        ip: "203.0.113.8",
      }),
    );
    expect(response.status).toBe(413);
  });
});

describe("teacher authentication and moderation", () => {
  test("requires a valid password to log in", async () => {
    const wrong = await login(
      apiRequest("/api/admin/login", {
        body: { password: "wrong-password" },
        ip: "198.51.100.1",
      }),
    );
    expect(wrong.status).toBe(401);

    const valid = await login(
      apiRequest("/api/admin/login", {
        body: { password: TEST_ADMIN_PASSWORD },
        ip: "198.51.100.1",
      }),
    );
    const cookie = valid.headers.get("set-cookie") ?? "";

    expect(valid.status).toBe(200);
    expect(cookie).toContain("moustiquair_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  test("protects the private moderation list", async () => {
    insertSightings([makeSighting({ id: "pending-1", status: "pending" })]);

    const anonymous = await listAdminSightings(apiRequest("/api/admin/sightings"));
    expect(anonymous.status).toBe(401);

    const teacher = createTeacherCookie();
    const authorized = await listAdminSightings(
      apiRequest("/api/admin/sightings", { headers: { cookie: teacher.cookie } }),
    );
    const body = (await authorized.json()) as { total: number; items: unknown[] };

    expect(authorized.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
  });

  test("requires the CSRF header to review a report", async () => {
    insertSightings([makeSighting({ id: "to-review", status: "pending" })]);
    const teacher = createTeacherCookie();

    const missingCsrf = await reviewAdminSighting(
      apiRequest("/api/admin/sightings/to-review", {
        method: "PATCH",
        body: { status: "approved" },
        headers: { cookie: teacher.cookie },
      }),
      { params: Promise.resolve({ id: "to-review" }) },
    );
    expect(missingCsrf.status).toBe(403);

    const approved = await reviewAdminSighting(
      apiRequest("/api/admin/sightings/to-review", {
        method: "PATCH",
        body: { status: "approved" },
        headers: adminHeaders(teacher.cookie),
      }),
      { params: Promise.resolve({ id: "to-review" }) },
    );
    expect(approved.status).toBe(200);

    const row = getDb().select().from(sightings).where(eq(sightings.id, "to-review")).get();
    expect(row?.status).toBe("approved");
    expect(row?.reviewedAt).toBeInstanceOf(Date);
  });

  test("approving a report makes it eligible for the public activity layer", async () => {
    insertSightings([
      makeSighting({ id: "approved-1", longitude: 2.1556, latitude: 49.0052 }),
      makeSighting({ id: "approved-2", longitude: 2.15562, latitude: 49.0052 }),
      makeSighting({ id: "pending-1", longitude: 2.15564, latitude: 49.0052, status: "pending" }),
    ]);

    const before = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=100`),
    );
    const beforeBody = (await before.json()) as ActivityFeatureCollection;
    expect(beforeBody.features).toHaveLength(0);

    const teacher = createTeacherCookie();
    await reviewAdminSighting(
      apiRequest("/api/admin/sightings/pending-1", {
        method: "PATCH",
        body: { status: "approved" },
        headers: adminHeaders(teacher.cookie),
      }),
      { params: Promise.resolve({ id: "pending-1" }) },
    );

    const after = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=100`),
    );
    const afterBody = (await after.json()) as ActivityFeatureCollection;
    expect(afterBody.features.length).toBeGreaterThan(0);
    expect(
      afterBody.features.every((feature) => (feature.properties?.contributingReports ?? 0) >= 3),
    ).toBe(true);
  });
});

describe("public activity privacy", () => {
  test("one isolated approved sighting is not published", async () => {
    insertSightings([
      makeSighting({ id: "secret-location", status: "approved", latitude: 49.0052 }),
    ]);

    const response = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=10`),
    );
    const text = await response.text();
    const body = JSON.parse(text) as ActivityFeatureCollection;

    expect(response.status).toBe(200);
    expect(body.features).toHaveLength(0);
    expect(text).not.toContain("secret-location");
    expect(text).not.toContain('"score"');
    expect(text).not.toContain("latitude");
    expect(text).not.toContain("longitude");
  });

  test("the teacher full view can inspect suppressed cells", async () => {
    insertSightings([makeSighting({ id: "teacher-only", status: "approved" })]);
    const teacher = createTeacherCookie();

    const response = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=10&view=full`, {
        headers: { cookie: teacher.cookie },
      }),
    );
    const body = (await response.json()) as ActivityFeatureCollection;

    expect(response.status).toBe(200);
    expect(body.features.length).toBeGreaterThan(0);
    expect(body.features.some((feature) => feature.properties?.contributingReports === 1)).toBe(
      true,
    );
  });

  test("pending and rejected reports never contribute to the public layer", async () => {
    insertSightings([
      makeSighting({ id: "approved-1" }),
      makeSighting({ id: "approved-2", longitude: 2.15562 }),
      makeSighting({ id: "pending-1", status: "pending" }),
      makeSighting({ id: "rejected-1", status: "rejected" }),
    ]);

    const publicResponse = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=100`),
    );
    const publicBody = (await publicResponse.json()) as ActivityFeatureCollection;
    expect(publicBody.features).toHaveLength(0);

    const teacher = createTeacherCookie();
    const teacherResponse = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=100&view=full`, {
        headers: { cookie: teacher.cookie },
      }),
    );
    const teacherBody = (await teacherResponse.json()) as ActivityFeatureCollection;
    const counts = teacherBody.features.map(
      (feature) => feature.properties?.contributingReports ?? 0,
    );
    expect(counts.length).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBe(2);
  });

  test("public features only expose aggregated properties", async () => {
    insertSightings([
      makeSighting({ id: "a", latitude: 49.0052 }),
      makeSighting({ id: "b", latitude: 49.00521 }),
      makeSighting({ id: "c", latitude: 49.00522 }),
    ]);

    const response = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=30&resolution=100`),
    );
    const body = (await response.json()) as ActivityFeatureCollection;
    const properties = body.features[0]?.properties;

    expect(properties).toBeDefined();
    expect(Object.keys(properties ?? {}).sort()).toEqual([
      "cellId",
      "contributingReports",
      "intensity",
      "level",
      "resolution",
      "score",
    ]);
    expect(properties?.contributingReports).toBeGreaterThanOrEqual(3);
  });

  test("filters by the reported observation period, not insertion date", async () => {
    insertSightings([
      makeSighting({ id: "recent-a", observedAt: atNoonDaysAgo(2) }),
      makeSighting({ id: "recent-b", observedAt: atNoonDaysAgo(2), longitude: 2.15562 }),
      makeSighting({ id: "recent-c", observedAt: atNoonDaysAgo(2), longitude: 2.15564 }),
      makeSighting({ id: "old-a", observedAt: atNoonDaysAgo(60), latitude: 49.0058 }),
      makeSighting({ id: "old-b", observedAt: atNoonDaysAgo(60), latitude: 49.0058 }),
      makeSighting({ id: "old-c", observedAt: atNoonDaysAgo(60), latitude: 49.0058 }),
    ]);

    const sevenDays = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=7&resolution=100`),
    );
    const sevenBody = (await sevenDays.json()) as ActivityFeatureCollection;
    expect(sevenBody.features.length).toBeGreaterThan(0);

    const allTime = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&period=all&resolution=100`),
    );
    const allBody = (await allTime.json()) as ActivityFeatureCollection;

    const totalScore = (collection: ActivityFeatureCollection) =>
      collection.features.reduce((sum, feature) => sum + (feature.properties?.score ?? 0), 0);

    // The old cluster may share coarse cells with the recent one, so compare
    // accumulated activity rather than the number of polygons.
    expect(totalScore(allBody)).toBeGreaterThan(totalScore(sevenBody));
  });
});

describe("viewport validation", () => {
  test("rejects malformed and oversized bounding boxes", async () => {
    const malformed = await getGrid(apiRequest("/api/map/grid?bbox=2,49,2,49&resolution=10"));
    expect(malformed.status).toBe(400);

    const oversized = await getGrid(apiRequest("/api/map/grid?bbox=-10,40,10,50&resolution=10"));
    expect(oversized.status).toBe(400);
    expect(((await oversized.json()) as ErrorBody).error.code).toBe("BBOX_TOO_LARGE");
  });

  test("rejects viewports outside the study area and invalid resolutions", async () => {
    const outside = await getGrid(apiRequest("/api/map/grid?bbox=5,45,5.1,45.1&resolution=10"));
    expect(outside.status).toBe(400);
    expect(((await outside.json()) as ErrorBody).error.code).toBe("OUTSIDE_STUDY_AREA");

    const badResolution = await getGrid(
      apiRequest(`/api/map/grid?bbox=${PUBLIC_BBOX}&resolution=25`),
    );
    expect(badResolution.status).toBe(400);
  });
});

describe("GET /api/stats", () => {
  test("separates public aggregates from teacher-only counters", async () => {
    insertSightings([
      makeSighting({ id: "approved-recent-a", observedAt: atNoonDaysAgo(1) }),
      makeSighting({ id: "approved-recent-b", observedAt: atNoonDaysAgo(2), longitude: 2.15562 }),
      makeSighting({
        id: "approved-old",
        observedAt: atNoonDaysAgo(60),
        longitude: 2.15564,
        latitude: 49.0054,
      }),
      makeSighting({ id: "pending", status: "pending", observedAt: atNoonDaysAgo(1) }),
      makeSighting({ id: "rejected", status: "rejected", observedAt: atNoonDaysAgo(1) }),
    ]);

    const publicResponse = await getStats(apiRequest("/api/stats?period=30"));
    const publicBody = (await publicResponse.json()) as {
      approvedTotal: number;
      approvedInPeriod: number;
      pendingCount: number | null;
      rejectedCount: number | null;
    };

    expect(publicBody.approvedTotal).toBe(3);
    expect(publicBody.approvedInPeriod).toBe(2);
    expect(publicBody.pendingCount).toBeNull();
    expect(publicBody.rejectedCount).toBeNull();

    const teacher = createTeacherCookie();
    const teacherResponse = await getStats(
      apiRequest("/api/stats?period=30&view=full", { headers: { cookie: teacher.cookie } }),
    );
    const teacherBody = (await teacherResponse.json()) as {
      pendingCount: number | null;
      rejectedCount: number | null;
    };
    expect(teacherBody.pendingCount).toBe(1);
    expect(teacherBody.rejectedCount).toBe(1);
  });

  test("requires authentication for the full statistics view", async () => {
    const response = await getStats(apiRequest("/api/stats?view=full"));
    expect(response.status).toBe(401);
  });

  test("distinguishes synthetic demonstration data from real reports", async () => {
    insertSightings([
      makeSighting({ id: "demo-1", isDemo: true }),
      makeSighting({ id: "demo-2", isDemo: true, latitude: 49.00521 }),
      makeSighting({ id: "real-1", isDemo: false, latitude: 49.0058 }),
    ]);

    const response = await getStats(apiRequest("/api/stats?period=30"));
    const body = (await response.json()) as {
      demoActive: boolean;
      demoApprovedInPeriod: number;
      realApprovedInPeriod: number;
    };

    expect(body.demoActive).toBe(true);
    expect(body.demoApprovedInPeriod).toBe(2);
    expect(body.realApprovedInPeriod).toBe(1);
  });

  test("rejects an invalid period", async () => {
    const response = await getStats(apiRequest("/api/stats?period=365"));
    expect(response.status).toBe(400);
  });
});
