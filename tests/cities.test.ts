import { beforeEach, describe, expect, test } from "bun:test";
import type { FeatureCollection, Polygon } from "geojson";
import { PATCH as reviewAdminSighting } from "@/app/api/admin/sightings/[id]/route";
import { GET as listAdminSightings } from "@/app/api/admin/sightings/route";
import { GET as getBoundary } from "@/app/api/map/boundary/route";
import { GET as getGrid } from "@/app/api/map/grid/route";
import { POST as submitSighting } from "@/app/api/sightings/route";
import { GET as getStatsApi } from "@/app/api/stats/route";
import type { ActivityFeatureProperties } from "@/lib/activity-service";
import { DEFAULT_CITY, DEFAULT_CITY_INSEE, getCityByInsee, SUPPORTED_CITIES } from "@/lib/cities";
import { readCookieValue, selectCity } from "@/lib/city-selection";
import { getDb } from "@/lib/db/client";
import { sightings } from "@/lib/db/schema";
import { clearDemoData, seedDemoData } from "@/lib/db/seed";
import { parisDateKey } from "@/lib/time";

import {
  adminHeaders,
  apiRequest,
  atNoonDaysAgo,
  createTeacherCookie,
  HERBLAY_CENTER,
  insertSightings,
  makeSighting,
  resetDatabase,
  SAINT_LEU_CENTER,
} from "./helpers";

const SAINT_LEU = requireCity("95563");

function requireCity(insee: string) {
  const city = getCityByInsee(insee);
  if (!city) throw new Error(`Test city ${insee} must exist in the catalog.`);
  return city;
}

const HERBLAY_BBOX = "2.154,49.004,2.157,49.006";
const SAINT_LEU_BBOX = "2.241,49.019,2.245,49.023";

type ActivityFeatureCollection = FeatureCollection<Polygon, ActivityFeatureProperties>;

interface ErrorBody {
  error: { code: string; message: string };
}

interface StatsBody {
  approvedTotal: number;
  approvedInPeriod: number;
  activeCells: number;
}

function submissionBody(location: { longitude: number; latitude: number }, extra = {}) {
  return {
    longitude: location.longitude,
    latitude: location.latitude,
    observedOn: parisDateKey(),
    mosquitoCount: "2-5",
    reporterConfidence: "likely",
    notes: "Observation de test.",
    confirmation: true,
    ...extra,
  };
}

function cluster(cityInsee: string, center: { longitude: number; latitude: number }, count = 3) {
  return Array.from({ length: count }, (_, index) =>
    makeSighting({
      id: `${cityInsee}-cluster-${index}`,
      cityInsee,
      longitude: center.longitude + index * 0.00001,
      latitude: center.latitude,
      observedAt: atNoonDaysAgo(2),
    }),
  );
}

beforeEach(() => {
  resetDatabase();
});

describe("city selection precedence", () => {
  test("a valid query parameter wins over the cookie", () => {
    expect(selectCity("95563", "95607")).toEqual({
      city: SAINT_LEU,
      invalidQuery: false,
    });
  });

  test("the cookie is used when the query is absent", () => {
    expect(selectCity(null, "95607").city.insee).toBe("95607");
    expect(selectCity(undefined, undefined).city.insee).toBe(DEFAULT_CITY_INSEE);
  });

  test("an unknown query falls back safely but is reported as invalid", () => {
    expect(selectCity("00000", "95563")).toEqual({
      city: SAINT_LEU,
      invalidQuery: true,
    });
    expect(selectCity("not-a-city", null)).toEqual({
      city: DEFAULT_CITY,
      invalidQuery: true,
    });
    expect(selectCity("", "95306").invalidQuery).toBe(false);
  });

  test("the cookie parser tolerates encoded values and missing cookies", () => {
    expect(readCookieValue("a=1; moustiquair_city=95563; b=2", "moustiquair_city")).toBe("95563");
    expect(readCookieValue("moustiquair_city=%39%35%35%36%33", "moustiquair_city")).toBe("95563");
    expect(readCookieValue("other=1", "moustiquair_city")).toBeNull();
    expect(readCookieValue(null, "moustiquair_city")).toBeNull();
  });

  test("the catalog exposes six distinct INSEE codes", () => {
    const codes = new Set(SUPPORTED_CITIES.map((city) => city.insee));
    expect(codes.size).toBe(6);
    expect(codes.has("95306")).toBe(true);
    expect(codes.has("95563")).toBe(true);
  });
});

describe("POST /api/sightings with a selected city", () => {
  test("a Saint-Leu point is rejected for Herblay and accepted for Saint-Leu", async () => {
    const rejected = await submitSighting(
      apiRequest("/api/sightings?city=95306", {
        body: submissionBody(SAINT_LEU_CENTER),
        ip: "203.0.113.21",
      }),
    );
    expect(rejected.status).toBe(422);
    expect(((await rejected.json()) as ErrorBody).error.code).toBe("OUTSIDE_STUDY_AREA");
    expect(getDb().select().from(sightings).all()).toHaveLength(0);

    const accepted = await submitSighting(
      apiRequest("/api/sightings?city=95563", {
        body: submissionBody(SAINT_LEU_CENTER),
        ip: "203.0.113.22",
      }),
    );
    const body = (await accepted.json()) as { id: string; status: string };

    expect(accepted.status).toBe(201);
    expect(body.status).toBe("pending");

    const row = getDb().select().from(sightings).all()[0];
    expect(row?.id).toBe(body.id);
    expect(row?.cityInsee).toBe("95563");
    expect(row?.status).toBe("pending");
  });

  test("the body cityInsee is supported when the query is absent", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings", {
        body: submissionBody(SAINT_LEU_CENTER, { cityInsee: "95563" }),
        ip: "203.0.113.23",
      }),
    );
    expect(response.status).toBe(201);
    expect(getDb().select().from(sightings).all()[0]?.cityInsee).toBe("95563");
  });

  test("an unsupported explicit city is rejected, never trusted", async () => {
    const response = await submitSighting(
      apiRequest("/api/sightings?city=00000", {
        body: submissionBody(HERBLAY_CENTER),
        ip: "203.0.113.24",
      }),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.code).toBe("INVALID_CITY");
    expect(getDb().select().from(sightings).all()).toHaveLength(0);
  });
});

describe("activity and statistics are scoped by city", () => {
  test("two cities do not merge in stats or in the activity grid", async () => {
    insertSightings([...cluster("95306", HERBLAY_CENTER), ...cluster("95563", SAINT_LEU_CENTER)]);

    const herblayStats = (await (
      await getStatsApi(apiRequest("/api/stats?period=30&city=95306"))
    ).json()) as StatsBody;
    const saintLeuStats = (await (
      await getStatsApi(apiRequest("/api/stats?period=30&city=95563"))
    ).json()) as StatsBody;

    expect(herblayStats.approvedTotal).toBe(3);
    expect(herblayStats.approvedInPeriod).toBe(3);
    expect(saintLeuStats.approvedTotal).toBe(3);
    expect(saintLeuStats.approvedInPeriod).toBe(3);
    expect(herblayStats.activeCells).toBeGreaterThan(0);
    expect(saintLeuStats.activeCells).toBeGreaterThan(0);

    const herblayGrid = (await (
      await getGrid(
        apiRequest(`/api/map/grid?bbox=${HERBLAY_BBOX}&period=30&resolution=100&city=95306`),
      )
    ).json()) as ActivityFeatureCollection;
    const saintLeuGrid = (await (
      await getGrid(
        apiRequest(`/api/map/grid?bbox=${SAINT_LEU_BBOX}&period=30&resolution=100&city=95563`),
      )
    ).json()) as ActivityFeatureCollection;

    expect(herblayGrid.features.length).toBeGreaterThan(0);
    expect(saintLeuGrid.features.length).toBeGreaterThan(0);
    // Three reports per city: merging them would produce six contributors.
    expect(
      Math.max(
        ...herblayGrid.features.map((feature) => feature.properties?.contributingReports ?? 0),
      ),
    ).toBe(3);
    expect(
      Math.max(
        ...saintLeuGrid.features.map((feature) => feature.properties?.contributingReports ?? 0),
      ),
    ).toBe(3);
  });

  test("the public privacy threshold still applies inside a city", async () => {
    insertSightings(cluster("95563", SAINT_LEU_CENTER, 1));

    const hidden = (await (
      await getGrid(
        apiRequest(`/api/map/grid?bbox=${SAINT_LEU_BBOX}&period=30&resolution=100&city=95563`),
      )
    ).json()) as ActivityFeatureCollection;
    expect(hidden.features).toHaveLength(0);

    insertSightings(
      cluster("95563", SAINT_LEU_CENTER, 2).map((row, index) => ({
        ...row,
        id: `saint-leu-extra-${index}`,
        longitude: SAINT_LEU_CENTER.longitude + (index + 1) * 0.00001,
      })),
    );

    const published = (await (
      await getGrid(
        apiRequest(`/api/map/grid?bbox=${SAINT_LEU_BBOX}&period=30&resolution=100&city=95563`),
      )
    ).json()) as ActivityFeatureCollection;
    expect(published.features.length).toBeGreaterThan(0);
    expect(
      published.features.every((feature) => (feature.properties?.contributingReports ?? 0) >= 3),
    ).toBe(true);
  });

  test("invalid city query parameters return 400", async () => {
    const grid = await getGrid(
      apiRequest(`/api/map/grid?bbox=${HERBLAY_BBOX}&period=30&resolution=100&city=00000`),
    );
    expect(grid.status).toBe(400);
    expect(((await grid.json()) as ErrorBody).error.code).toBe("INVALID_CITY");

    const stats = await getStatsApi(apiRequest("/api/stats?period=30&city=paris"));
    expect(stats.status).toBe(400);
    expect(((await stats.json()) as ErrorBody).error.code).toBe("INVALID_CITY");
  });
});

describe("admin moderation is scoped by city", () => {
  test("the moderation list only returns the selected city", async () => {
    insertSightings([
      makeSighting({ id: "herblay-pending-1", cityInsee: "95306", status: "pending" }),
      makeSighting({ id: "herblay-pending-2", cityInsee: "95306", status: "pending" }),
      makeSighting({
        id: "saint-leu-pending-1",
        cityInsee: "95563",
        status: "pending",
        longitude: SAINT_LEU_CENTER.longitude,
        latitude: SAINT_LEU_CENTER.latitude,
      }),
    ]);
    const teacher = createTeacherCookie();

    const herblay = (await (
      await listAdminSightings(
        apiRequest("/api/admin/sightings?status=pending&city=95306", {
          headers: { cookie: teacher.cookie },
        }),
      )
    ).json()) as { total: number; items: { id: string; cityInsee: string }[] };

    expect(herblay.total).toBe(2);
    expect(herblay.items.every((item) => item.cityInsee === "95306")).toBe(true);

    const saintLeu = (await (
      await listAdminSightings(
        apiRequest("/api/admin/sightings?status=pending&city=95563", {
          headers: { cookie: teacher.cookie },
        }),
      )
    ).json()) as { total: number; items: { id: string }[] };

    expect(saintLeu.total).toBe(1);
    expect(saintLeu.items[0]?.id).toBe("saint-leu-pending-1");

    const invalid = await listAdminSightings(
      apiRequest("/api/admin/sightings?city=00000", { headers: { cookie: teacher.cookie } }),
    );
    expect(invalid.status).toBe(400);
  });

  test("a report cannot be reviewed from another city", async () => {
    insertSightings([
      makeSighting({
        id: "saint-leu-review",
        cityInsee: "95563",
        status: "pending",
        longitude: SAINT_LEU_CENTER.longitude,
        latitude: SAINT_LEU_CENTER.latitude,
      }),
    ]);
    const teacher = createTeacherCookie();

    const wrongCity = await reviewAdminSighting(
      apiRequest("/api/admin/sightings/saint-leu-review?city=95306", {
        method: "PATCH",
        body: { status: "approved" },
        headers: adminHeaders(teacher.cookie),
      }),
      { params: Promise.resolve({ id: "saint-leu-review" }) },
    );
    expect(wrongCity.status).toBe(404);

    const rightCity = await reviewAdminSighting(
      apiRequest("/api/admin/sightings/saint-leu-review?city=95563", {
        method: "PATCH",
        body: { status: "approved" },
        headers: adminHeaders(teacher.cookie),
      }),
      { params: Promise.resolve({ id: "saint-leu-review" }) },
    );
    expect(rightCity.status).toBe(200);

    const updated = (await rightCity.json()) as { item: { cityInsee: string; status: string } };
    expect(updated.item.cityInsee).toBe("95563");
    expect(updated.item.status).toBe("approved");
  });
});

describe("demo data is scoped by city", () => {
  test("seeding and clearing one city leaves the others untouched", () => {
    const now = new Date();
    const result = seedDemoData(SAINT_LEU, now);
    expect(result.inserted).toBeGreaterThan(0);

    const rows = getDb().select().from(sightings).all();
    expect(rows.every((row) => row.cityInsee === "95563")).toBe(true);
    expect(rows.every((row) => row.isDemo)).toBe(true);

    // Clearing another city removes nothing.
    expect(clearDemoData("95306")).toBe(0);
    expect(getDb().select().from(sightings).all()).toHaveLength(rows.length);

    expect(clearDemoData("95563")).toBe(rows.length);
    expect(getDb().select().from(sightings).all()).toHaveLength(0);
  });

  test("seeding is idempotent for the same city", () => {
    const now = new Date();
    seedDemoData(SAINT_LEU, now);
    const firstCount = getDb().select().from(sightings).all().length;
    seedDemoData(SAINT_LEU, now);
    expect(getDb().select().from(sightings).all().length).toBe(firstCount);
  });
});

describe("GET /api/map/boundary", () => {
  test("returns the boundary of the selected city", async () => {
    const saintLeu = (await (
      await getBoundary(apiRequest("/api/map/boundary?city=95563"))
    ).json()) as FeatureCollection<Polygon, { insee: string; name: string }>;

    expect(saintLeu.features).toHaveLength(1);
    expect(saintLeu.features[0]?.properties.insee).toBe("95563");
    expect(saintLeu.features[0]?.properties.name).toBe("Saint-Leu-la-Forêt");
  });

  test("defaults to Herblay without a query parameter", async () => {
    const response = await getBoundary(apiRequest("/api/map/boundary"));
    const body = (await response.json()) as FeatureCollection<Polygon, { insee: string }>;

    expect(response.status).toBe(200);
    expect(body.features[0]?.properties.insee).toBe("95306");
  });

  test("rejects an unsupported city", async () => {
    const response = await getBoundary(apiRequest("/api/map/boundary?city=00000"));
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.code).toBe("INVALID_CITY");
  });
});
