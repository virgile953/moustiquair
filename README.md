# Moustiq'Air

Moustiq'Air is a small citizen-science web application for **Herblay-sur-Seine**
(Val-d'Oise, INSEE **95306**). Year 10 students can report tiger-mosquito
sightings, and the application turns validated reports into a red, relative
activity layer on a MapLibre map.

The project is deliberately a **proof of concept**, not a public-health
surveillance system. A red cell means that several people reported mosquitoes
nearby and that the model computes a higher relative observation activity. It
does **not** count mosquitoes, measure a probability of infestation, or estimate
a health risk.

---

## Overview

- Reporting is public and anonymous: no account, name, address, e-mail or phone
  number is collected.
- Every new report starts as `pending`. Only a teacher can approve it.
- Approved reports contribute to a **10 m × 10 m** scientific grid using a
  **100 m** quadratic distance-decay radius.
- Overlapping reports add their contributions. Scores therefore reflect both
  mosquito observations **and** reporting effort.
- The public map suppresses cells with fewer than **3 distinct contributing
  reports**, so a single isolated report cannot be located precisely.
- A teacher-only view shows the complete model, including suppressed cells, for
  classroom demonstrations.

The interface is in French. Source code, comments and technical documentation
are in English, except `docs/ALGORITHME.md`, which is written in French for
students.

---

## Technology

| Layer                     | Choice                                                    |
| ------------------------- | --------------------------------------------------------- |
| Application               | Next.js 16 App Router, React 19, TypeScript strict        |
| Runtime / package manager | Bun                                                       |
| Styling                   | Tailwind CSS v4, shadcn/ui-style components, Lucide icons |
| Validation                | Zod                                                       |
| Database                  | SQLite through `bun:sqlite`, Drizzle ORM and Drizzle Kit  |
| Map                       | MapLibre GL JS, OpenFreeMap (Positron, Liberty fallback)  |
| Projection                | Proj4js, EPSG:4326 ↔ EPSG:2154 (Lambert-93)               |
| Tests                     | Bun's native test runner                                  |
| Lint / format             | Biome                                                     |

No paid map service, external database, Redis, message queue or separate API
server is required.

---

## Setup

Requirements: **Bun 1.4+**. Node.js is not required to run the project.

```bash
git clone <repository-url> moustiquair
cd moustiquair
bun install
cp .env.example .env
bun run admin:hash      # choose a teacher password, then paste the line into .env
bun run db:migrate      # create the SQLite schema
bun run db:seed         # optional: load the reproducible demo dataset
bun run dev
```

Open <http://localhost:3000>.

`bun run dev` does three things before starting Next.js:

1. copies the MapLibre worker into `public/vendor/` (required under Turbopack);
2. applies pending database migrations;
3. starts Next.js **with the Bun runtime** (`bun --bun next dev`), so
   `bun:sqlite` works inside Route Handlers.

Do not replace the runtime with Node.js: the SQLite driver is Bun-specific.
`next.config.ts` marks `bun:sqlite` as a server external package.

The development password hash shipped in `.env.example` corresponds to
`MoustiqAir2026!`. Change it before any real use with `bun run admin:hash`, then
restart the server so `.env` is reloaded.

---

## Configuration

All variables live in `.env`:

| Variable              | Required | Description                                                                                                                                |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_PATH`       | yes      | SQLite file. Relative paths resolve from the project root, e.g. `./data/moustiquair.db`. Use an absolute path in production.               |
| `ADMIN_PASSWORD_HASH` | yes      | scrypt hash of the teacher password. Format `scrypt:N:r:p:salt:hash`. Never store the plain password. Generate with `bun run admin:hash`.  |
| `SESSION_SECRET`      | yes      | Random string of at least 32 characters. Used to derive session-token hashes and rate-limit keys. Generate with `openssl rand -base64 32`. |
| `SESSION_TTL_HOURS`   | no       | Session lifetime in hours, default `12`.                                                                                                   |

The hash uses `:` separators instead of `$`. This is intentional: Bun and
Next.js can interpret `$` inside `.env` values as variable expansion, which
silently corrupts a hash. After changing any value, restart the server.

The SQLite file, `-wal` and `-shm` companion files must be writable by the
application user. Enable SQLite foreign keys and WAL mode — the database client
does both automatically on connection.

---

## Database

```bash
bun run db:migrate     # apply migrations from ./drizzle
bun run db:generate    # generate a migration after editing schema.ts
bun run db:seed        # idempotently rebuild only the synthetic demo rows
bun run db:reset-demo  # same operation, clearer name for demos
```

The schema has three small tables:

### `sightings`

| Column                                 | Type                | Notes                                                             |
| -------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `id`                                   | text PK             | UUID for real reports, stable `demo-###` for demo data            |
| `longitude`, `latitude`                | real                | EPSG:4326 GPS coordinates                                         |
| `projectedX`, `projectedY`             | real                | EPSG:2154 Lambert-93 metres, computed once at insertion           |
| `observedAt`, `createdAt`, `updatedAt` | timestamp (ms, UTC) | Observation date is stored at 12:00 Europe/Paris converted to UTC |
| `mosquitoCount`                        | text enum           | `1`, `2-5`, `6-10`, `10+`, `unknown`                              |
| `reporterConfidence`                   | text enum           | `likely`, `certain`                                               |
| `notes`                                | text nullable       | Maximum 500 characters                                            |
| `status`                               | text enum           | `pending`, `approved`, `rejected`                                 |
| `isDemo`                               | boolean             | Clearly separates synthetic rows                                  |
| `reviewedAt`                           | timestamp nullable  | Set by moderation                                                 |

Indexes cover status, observation date, demo flag and the projected coordinate
pair used for map queries.

### `sessions`

Hashed session tokens only (HMAC-SHA256), with an expiry timestamp. The raw
cookie value is never stored.

### `rate_limits`

Small fixed-window counters for report submission and teacher login. Keys are
HMACs of the client address; raw IP addresses are never stored.

No table contains student names, addresses, e-mails, phone numbers or class
information. The complete sightings table is never exposed by a public route.

### Demo dataset

`bun run db:seed` creates exactly 129 reproducible synthetic sightings:

- 116 approved, 10 pending, 3 rejected;
- five deliberately concentrated hotspots plus isolated observations;
- observations spread across the previous 90 days;
- varied mosquito-count and confidence categories;
- five deliberate hotspots so the city-wide map is immediately meaningful;
- fixed random seed (`20260921`) and deterministic IDs;
- every row marked `isDemo = true`.

Seeding first deletes **only demo rows**, then inserts the dataset again, so it
is safe and idempotent. Real reports are never touched. The interface displays a
`Données de démonstration` badge while demo rows exist.

---

## Development

```bash
bun run dev
bun run typecheck
bun run lint
bun run format
bun test
```

Useful routes:

| Route           | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `/`             | Interactive activity map and report form                      |
| `/comprendre`   | French educational explanation and interactive influence demo |
| `/statistiques` | Aggregated public statistics                                  |
| `/admin`        | Teacher login and moderation dashboard                        |
| `/admin/carte`  | Teacher-only full model view                                  |

The map fits the official municipal boundary at startup. The boundary is stored
locally in `src/data/boundary/herblay-sur-seine-95306.v1.json` and served by the
application; it is not downloaded from `geo.api.gouv.fr` on each page load. The
file can be refreshed with `bun run boundary:fetch`.

If MapLibre fails under Turbopack with `Worker failed to load`, run
`bun run prepare:worker` and reload. `dev` and `build` already do this.

---

## Production

Build and start with Bun:

```bash
bun install
bun run build
DATABASE_PATH=/var/lib/moustiquair/moustiquair.db \
SESSION_SECRET='<long random secret>' \
ADMIN_PASSWORD_HASH='<scrypt hash>' \
SESSION_TTL_HOURS=12 \
bun run start
```

The default port is 3000. Notes:

- Put a TLS reverse proxy (Caddy, nginx) in front of the app. The session cookie
  automatically gets `Secure` when `NODE_ENV=production`.
- Keep the SQLite file, its `-wal` and `-shm` files on persistent storage and
  include all three in backups. A simple file copy is consistent only when the
  application is stopped, or use `sqlite3 database.db ".backup backup.db"`.
- Do not run multiple application instances against the same SQLite file without
  a shared-filesystem guarantee. This POC targets one small server.
- Run migrations before starting a new release: `bun run db:migrate`.
- The MapLibre worker must exist in `public/vendor/`; `bun run build` copies it.

A minimal systemd unit:

```ini
[Unit]
Description=Moustiq'Air
After=network.target

[Service]
WorkingDirectory=/srv/moustiquair
EnvironmentFile=/srv/moustiquair/.env
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
User=moustiquair

[Install]
WantedBy=multi-user.target
```

### Docker

The repository includes a multi-stage `Dockerfile` based on
`oven/bun:1.4.4-slim`. It builds the Next.js standalone server, applies
migrations on startup, runs as the unprivileged `bun` user, and expects the
SQLite database in `/data`.

```bash
docker build -t moustiquair .
docker volume create moustiquair-data
docker run -d \
  --name moustiquair \
  -p 3000:3000 \
  -v moustiquair-data:/data \
  -e SESSION_SECRET='<long random secret>' \
  -e ADMIN_PASSWORD_HASH='<scrypt hash>' \
  moustiquair
```

BuildKit caches both the Bun download cache and `.next/cache`, so rebuilds after
a source-only change reuse dependencies and previous compilation work. The
final image contains the standalone Next.js server, static assets, the MapLibre
worker, the Drizzle migrations and a small bundled migration runner. It does not
contain the `.env` file, tests, development dependencies or the local SQLite
database.

The named volume mounted at `/data` is what makes the database survive image
rebuilds and redeployments. To create the initial demo dataset once the
container is running, log in at `/admin` and use **Restaurer la démonstration**,
or call `POST /api/admin/demo/seed` with a teacher session.

On Dokploy: use the repository Dockerfile, expose port `3000`, add a persistent
volume mounted at `/data`, and set `SESSION_SECRET` and `ADMIN_PASSWORD_HASH` in
the application environment. No `DATABASE_PATH` override is needed because the
image already sets `DATABASE_PATH=/data/moustiquair.db`.

---

## Spatial model

All metric work happens in Lambert-93 (EPSG:2154), never in longitude/latitude
degrees.

1. **Projection.** GPS coordinates are converted from EPSG:4326 to EPSG:2154
   with Proj4js. Proj4js, not Euclidean degree maths, handles the distortion.
2. **10 m grid.** `gridX = floor(easting / 10)`, `gridY = floor(northing / 10)`,
   `cellId = gridX + ":" + gridY`. The southwest corner is
   `(gridX × 10, gridY × 10)` and the centre is 5 m further in each direction.
   The grid is anchored at the Lambert-93 origin, so it is stable across
   requests and restarts.
3. **Influence.** For a validated sighting and a cell centre at distance `d`
   metres:

   ```text
   weight(d) = max(0, 1 - d / 100)²
   ```

   The weight is `1` at 0 m, `0.5625` at 25 m, `0.25` at 50 m, `0.0625` at
   75 m, and exactly `0` at or beyond 100 m.
4. **Aggregation.** Contributions from distinct approved reports are **summed**
   in a `Map<cellId, GridCell>`. Scores are not divided by report count.
5. **Computation bound.** For each sighting, only candidate cells inside the
   100 m bounding square are visited. About 305 cell centres fall within the
   radius, not every cell in the municipality.
6. **Time window.** Periods are 7, 30 (default), 90 days or all time, filtered on
   the reported observation date. There is no temporal decay in this version.
7. **Display resolution.** The scientific model is always 10 m. At low zoom the
   API returns 100 m cells, and at medium zoom 50 m cells. Each coarse cell is
   the **average of all underlying 10 m cells, including zero-activity cells**,
   so sparse areas are not artificially intensified.
8. **Visual normalization.** Raw scores are unbounded. The display uses
   `intensity = 1 - exp(-score / 1.5)` with a fixed scale, then maps intensity
   to colour and opacity. Normalization is separate from the scientific score
   and never changes the radius or the raw index.

See `docs/ALGORITHME.md` (French) for a two-sighting worked example, pseudocode
and complexity analysis.

### Why the numbers are assumptions

The 100 m radius is a **teaching simplification** of typical local movement, not
a hard biological boundary. The 10 m grid is a convenient spatial unit. Absence
of reports is not evidence of absence of mosquitoes, and identification is
declared by the reporter, not verified by an entomologist.

---

## Privacy and moderation

- Public reports require no account and collect no identity data.
- Every report is `pending` until a teacher reviews it.
- Pending and rejected reports never enter the activity calculation.
- Public GeoJSON applies a minimum of **3 distinct contributing reports per
  cell** before returning a feature. The threshold is applied on the server, not
  only in CSS. Suppressed cells omit their score, intensity and location.
- Public responses never contain sighting IDs, notes, raw coordinates, reporter
  data or individual timestamps.
- Teacher-only requests require a valid HttpOnly session cookie **and**, for
  mutations, a CSRF header plus same-origin checks.
- Passwords are scrypt-hashed. Login and reporting are rate-limited.
- Honeypot, payload-size limits, enum validation, date validation and
  municipality boundary validation reduce spam and invalid points.
- The teacher full view is for classroom instruction only. Do not project or
  share precise report locations, notes or demo-control screens.

### Data retention for a school

Decide and document a retention period with the school's data-protection
contact before collecting real reports. A reasonable POC policy is:

- review pending reports within the teaching sequence and delete rejected rows
  once they are no longer needed for moderation traceability;
- keep approved rows only as long as the classroom project runs;
- delete demo data with the admin button when it is no longer useful;
- export or delete the whole SQLite file at the end of the school year;
- never add names or contact details to notes.

The application does not implement automated retention. Retention is an
institutional decision, supported by the admin tools.

---

## API

All errors use a consistent JSON shape:

```json
{ "error": { "code": "CODE", "message": "Message lisible", "details": {} } }
```

| Method and route                                         | Access               | Purpose                                                |
| -------------------------------------------------------- | -------------------- | ------------------------------------------------------ |
| `GET /api/map/boundary`                                  | public               | Official municipality boundary as GeoJSON              |
| `GET /api/map/grid?bbox=w,s,e,n&period=30&resolution=10` | public               | Activity cells; applies the 3-report privacy threshold |
| `GET /api/map/grid?...&view=full`                        | teacher session      | Full model, including suppressed cells                 |
| `GET /api/stats?period=30`                               | public               | Aggregates without private counts                      |
| `GET /api/stats?period=30&view=full`                     | teacher session      | Adds pending/rejected counts and full-view indicators  |
| `POST /api/sightings`                                    | public, rate-limited | Validate and persist a pending report                  |
| `POST /api/admin/login`                                  | public, rate-limited | Verify password and create session                     |
| `POST /api/admin/logout`                                 | teacher + CSRF       | Destroy session                                        |
| `GET /api/admin/sightings?status=pending`                | teacher session      | Private moderation list                                |
| `PATCH /api/admin/sightings/:id`                         | teacher + CSRF       | Approve or reject                                      |
| `POST /api/admin/demo/seed`                              | teacher + CSRF       | Restore the demo dataset                               |
| `DELETE /api/admin/demo`                                 | teacher + CSRF       | Delete demo rows only                                  |

The grid route limits bounding-box span and evaluated cell count, and returns
only cells whose centre is inside Herblay-sur-Seine. Observation queries include
the 100 m influence margin around the requested viewport.

---

## Tests and verification

```bash
bun run typecheck
bun test
bun run lint
bun run build
```

The test suite covers:

- Lambert-93 reference conversions and round trips;
- grid alignment, negative coordinates, boundaries and 10 m polygon size;
- exact influence weights, overlapping sums, determinism, radius rejection and
  coarse-resolution averaging;
- Polygon, hole and MultiPolygon boundary handling;
- Europe/Paris period boundaries and future-date rejection;
- API submission, pending exclusion, approval inclusion, rejection exclusion,
  privacy threshold, demo separation, admin authorization, CSRF and oversized
  bounding boxes;
- a regression test proving that one isolated approved report cannot be
  reconstructed from the public GeoJSON response.

Tests use a temporary SQLite file created by `tests/setup.ts`; they never touch
`data/moustiquair.db`.

---

## Project structure

```text
src/app/                 Pages and Route Handlers
src/components/map/      MapLibre canvas, filters, legend, cell inspection
src/components/reporting/ Report form and map location picker
src/components/education/ Interactive influence demonstration
src/components/admin/    Teacher login and moderation dashboard
src/components/ui/       Reusable shadcn/ui-style primitives
src/lib/geo/             Projection, grid, influence, boundary, intensity
src/lib/db/              Drizzle schema, client and demo seed
src/lib/validation/      Zod input schemas
src/lib/auth/            Password hashing, sessions, server-side checks
src/lib/config/          Model constants and environment access
src/data/                Versioned municipal boundary
scripts/                 Migration, seed, boundary, worker and password tools
tests/                   Spatial, temporal and API tests
docs/                    French algorithm documentation
```

The spatial modules do not import React, Next.js or Drizzle. They can be reused
in a plain TypeScript script or a classroom notebook.

---

## Known limitations

- The activity index is **relative and observation-derived**. It is not a
  mosquito census, a calibrated probability, or a health-risk map.
- Reporting effort is not measured: a neighbourhood with more active reporters
  can score higher than a quieter one.
- Species identification is a reporter claim, not expert verification.
- No photo evidence, survey-effort recording or absence reports exist yet.
- The 100 m radius is a fixed teaching assumption. There is no seasonal or
  distance decay beyond the hard influence cutoff.
- Coarse display cells are averages of the underlying 10 m model, not a separate
  scientific resolution.
- SQLite and in-process rate limiting target one small server, dozens of
  simultaneous users and hundreds to a few thousand reports.
- The POC does not implement automated retention, backups or a full audit log.

---

## Possible future improvements

These are intentionally **not** implemented in this version:

- record survey effort, including surveys where no mosquito was seen;
- optional photo evidence with metadata removal, moderation and retention rules;
- temporal decay and comparison of periods;
- additional municipalities with separate study areas;
- a PostGIS migration if the dataset or concurrency grows;
- analysis of environmental factors (water, vegetation, temperature);
- richer classroom exports and anonymised aggregate downloads.

---

## Licences and data sources

- Municipal boundary: `geo.api.gouv.fr`, Etalab 2.0, stored locally with source
  metadata.
- Basemap: OpenFreeMap styles, data © OpenStreetMap contributors. Attribution is
  displayed on the map and in the footer.
- The application code is intended to remain free and open source. Add the
  school's chosen licence before publishing the repository.

Moustiq'Air is an educational project. For health questions, consult official
French sources such as Santé publique France and the regional ARS.
