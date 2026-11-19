# Multi-city support

Moustiq'Air studies six neighbouring communes of the Val-d'Oise as **separate
study areas**. This document describes how the selected city travels through
the application and what must be kept true when adding another commune.

## Supported cities

| INSEE   | Commune               | Boundary file                                           |
| ------- | --------------------- | ------------------------------------------------------- |
| `95306` | Herblay-sur-Seine     | `src/data/boundary/herblay-sur-seine-95306.v1.json`     |
| `95563` | Saint-Leu-la-Forêt    | `src/data/boundary/saint-leu-la-foret-95563.v1.json`    |
| `95607` | Taverny               | `src/data/boundary/taverny-95607.v1.json`               |
| `95488` | Pierrelaye            | `src/data/boundary/pierrelaye-95488.v1.json`            |
| `95176` | Cormeilles-en-Parisis | `src/data/boundary/cormeilles-en-parisis-95176.v1.json` |
| `95252` | Franconville          | `src/data/boundary/franconville-95252.v1.json`          |

The catalog lives in `src/lib/cities.ts`. It is imported by client components
too, so it must stay free of Node APIs and boundary GeoJSON. Geometries are
loaded only on the server through `src/lib/geo/city-boundaries.ts`.

`src/lib/geo/herblay-boundary.ts` remains as a backwards-compatible alias for
Herblay. New code should use the city-aware helpers.

## Selection precedence

`src/lib/city-selection.ts` implements one rule everywhere:

1. a valid `?city=<INSEE>` query parameter;
2. a valid `moustiquair_city` cookie;
3. Herblay-sur-Seine (`95306`).

Unknown values never throw. Pages silently fall back through the same rule;
APIs return `400 INVALID_CITY` when an explicit `city` was supplied but is not
supported.

## Proxy and cookie

`src/proxy.ts` runs on page requests (not on API routes or static assets). When
the URL contains a valid `?city=`:

- the value is written into the forwarded request cookie, so the current server
  render already sees it (no redirect, no flash);
- a one-year response cookie is set with `Path=/`, `SameSite=Lax` and
  `HttpOnly=false`. The client selector must be able to write the same cookie,
  which is why it is not HttpOnly.

The query parameter is never removed, so URLs remain shareable and bookmarkable.

## Server pages

`getSelectedCity()` reads the request cookie through `next/headers`. The root
layout uses it to render the header selector, and each page passes the resolved
city to its server or client components. Reading the cookie makes the shell
dynamic, which is intentional: the selected commune must be correct on first
paint.

## API contract

Every relevant route accepts `?city=`. When it is absent, the cookie is used,
then Herblay.

| Route                            | City usage                                       |
| -------------------------------- | ------------------------------------------------ |
| `GET /api/map/boundary`          | Returns that city's FeatureCollection            |
| `GET /api/map/grid`              | Studies that city's bbox and boundary            |
| `GET /api/stats`                 | Counts only that city's reports                  |
| `POST /api/sightings`            | Validates the point against that city's boundary |
| `GET /api/admin/sightings`       | Lists and counts only that city                  |
| `PATCH /api/admin/sightings/:id` | Refuses rows belonging to another city           |
| `POST /api/admin/demo/seed`      | Seeds only that city                             |
| `DELETE /api/admin/demo`         | Clears only that city's demo rows                |

`POST /api/sightings` also accepts an optional `cityInsee` body field, useful
for the report form. The query parameter takes precedence. Values are always
checked against the catalog; an arbitrary city name or unknown code is rejected.

## Demo data

`seedDemoData(city)` deletes only `isDemo = true` rows for that city, then
inserts a deterministic dataset whose IDs are `demo-<INSEE>-###`. `clearDemoData(city)`
does the same for deletion. `seedAllDemoData()` loops over the catalog and is
used by `bun run db:seed`. `bun run db:seed -- 95563` seeds a single commune.

## Adding a commune

1. Add an entry to `SUPPORTED_CITIES` in `src/lib/cities.ts`.
2. Run `bun run boundary:fetch` (or add the versioned GeoJSON manually) and
   reference it in `src/lib/geo/city-boundaries.ts`.
3. Keep the `city_insee` column in `sightings`; no schema change is needed.
4. Verify `isInsideBoundary(city.center…)` with the new geometry.
5. Run `bun test`, especially the city isolation tests in `tests/cities.test.ts`.
