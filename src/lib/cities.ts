/**
 * Supported study areas.
 *
 * This module is imported by both server and client components, so it must
 * stay free of Node.js APIs and of the (large) boundary GeoJSON files.
 * The official geometries live in `src/lib/geo/city-boundaries.ts`.
 */

import type { LonLat } from "./geo/types";

export interface City {
  /** Official INSEE commune code. This is the stable identifier used in URLs. */
  insee: string;
  slug: string;
  name: string;
  department: string;
  departmentCode: string;
  region: string;
  /** Approximate centre, used for maps and generated demo data. */
  center: LonLat;
  population: number;
}

export const CITY_COOKIE_NAME = "moustiquair_city";
export const CITY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * A compact, neighbouring set of Val-d'Oise communes. Keeping the list small
 * makes the selector easy to use and keeps each map focused on one territory.
 */
export const SUPPORTED_CITIES = [
  {
    insee: "95306",
    slug: "herblay-sur-seine",
    name: "Herblay-sur-Seine",
    department: "Val-d'Oise",
    departmentCode: "95",
    region: "Île-de-France",
    center: { longitude: 2.1556, latitude: 49.0052 },
    population: 31779,
  },
  {
    insee: "95563",
    slug: "saint-leu-la-foret",
    name: "Saint-Leu-la-Forêt",
    department: "Val-d'Oise",
    departmentCode: "95",
    region: "Île-de-France",
    center: { longitude: 2.243, latitude: 49.0211 },
    population: 16138,
  },
  {
    insee: "95607",
    slug: "taverny",
    name: "Taverny",
    department: "Val-d'Oise",
    departmentCode: "95",
    region: "Île-de-France",
    center: { longitude: 2.2179, latitude: 49.0274 },
    population: 27593,
  },
  {
    insee: "95488",
    slug: "pierrelaye",
    name: "Pierrelaye",
    department: "Val-d'Oise",
    departmentCode: "95",
    region: "Île-de-France",
    center: { longitude: 2.1629, latitude: 49.0185 },
    population: 10130,
  },
  {
    insee: "95176",
    slug: "cormeilles-en-parisis",
    name: "Cormeilles-en-Parisis",
    department: "Val-d'Oise",
    departmentCode: "95",
    region: "Île-de-France",
    center: { longitude: 2.201, latitude: 48.9701 },
    population: 27292,
  },
  {
    insee: "95252",
    slug: "franconville",
    name: "Franconville",
    department: "Val-d'Oise",
    departmentCode: "95",
    region: "Île-de-France",
    center: { longitude: 2.2235, latitude: 48.9879 },
    population: 37754,
  },
] as const satisfies readonly City[];

export const DEFAULT_CITY_INSEE = "95306";
export const DEFAULT_CITY = SUPPORTED_CITIES[0];

/** Find a supported city by INSEE code. Returns null for anything unknown. */
export function getCityByInsee(insee: string | null | undefined): City | null {
  if (!insee) return null;
  return SUPPORTED_CITIES.find((city) => city.insee === insee) ?? null;
}

/** Same as above, but always returns a city (Herblay by default). */
export function getCityOrDefault(insee: string | null | undefined): City {
  return getCityByInsee(insee) ?? DEFAULT_CITY;
}

/** Add or replace the `city` query parameter in a link. */
export function withCityQuery(href: string, insee: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}city=${insee}`;
}

/** Short French label used in the header pill. */
export function cityLabel(city: City): string {
  return `${city.name} · ${city.department}`;
}
