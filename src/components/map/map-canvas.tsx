"use client";

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { City } from "@/lib/cities";
import {
  type DisplayResolution,
  INFLUENCE_RADIUS_METERS,
  LOD_ZOOM_THRESHOLDS,
  type PeriodValue,
} from "@/lib/config/model";
import type { LonLat } from "@/lib/geo/types";

import {
  type ActivityCollection,
  type ActivityFeatureProperties,
  type ActivityLoadState,
  EMPTY_ACTIVITY,
  type SelectedCell,
} from "./types";

/**
 * The two free basemaps we use. Positron is light and lets the red overlay
 * stand out. Liberty is the fallback if the Positron style cannot be reached.
 */
const POSITRON_STYLE = "https://tiles.openfreemap.org/styles/positron";
const LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const BOUNDARY_SOURCE = "study-area-boundary";
const ACTIVITY_SOURCE = "activity-cells";

type BoundaryCollection = FeatureCollection<Polygon | MultiPolygon>;

export interface MapApi {
  fitToStudyArea: () => void;
}

interface MapCanvasProps {
  /** Selected municipality; the grid request and initial view follow it. */
  city: City;
  period: PeriodValue;
  boundary: BoundaryCollection | null;
  overlayEnabled: boolean;
  gridEnabled: boolean;
  teacherView: boolean;
  reportMode: boolean;
  marker: LonLat | null;
  markerDraggable?: boolean;
  initialFocus?: LonLat | null;
  selectedCellId: string | null;
  /** Increment to force a fresh activity request (retry button). */
  refreshToken: number;
  onCellSelect: (cell: SelectedCell | null) => void;
  onLocationPick: (position: LonLat) => void;
  onActivityStateChange: (state: ActivityLoadState) => void;
  onResolutionChange: (resolution: DisplayResolution) => void;
  onMapReady: (api: MapApi) => void;
  onFatalError: (message: string) => void;
}

/** Compute the bounding box of a Polygon or MultiPolygon boundary. */
function boundaryBbox(collection: BoundaryCollection) {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  const polygons: number[][][][] = [];

  for (const feature of collection.features) {
    if (feature.geometry.type === "Polygon") {
      polygons.push(feature.geometry.coordinates);
    } else {
      polygons.push(...feature.geometry.coordinates);
    }
  }

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const position of ring) {
        const [longitude, latitude] = position;
        if (longitude === undefined || latitude === undefined) continue;
        minLon = Math.min(minLon, longitude);
        minLat = Math.min(minLat, latitude);
        maxLon = Math.max(maxLon, longitude);
        maxLat = Math.max(maxLat, latitude);
      }
    }
  }

  return { minLon, minLat, maxLon, maxLat };
}

/** Pick the level of detail that matches the current zoom. */
export function resolutionForZoom(zoom: number): DisplayResolution {
  if (zoom >= LOD_ZOOM_THRESHOLDS.fine) return 10;
  if (zoom >= LOD_ZOOM_THRESHOLDS.medium) return 50;
  return 100;
}

/** Replace the data of a GeoJSON source without touching the map instance. */
function setSourceData(map: import("maplibre-gl").Map, sourceId: string, data: GeoJSON.GeoJSON) {
  const source = map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource | undefined;
  source?.setData(data);
}

/** Add the commune outline. Safe to call again when boundary data arrives. */
function ensureBoundaryLayers(map: import("maplibre-gl").Map, collection: BoundaryCollection) {
  const existingSource = map.getSource(BOUNDARY_SOURCE);
  if (existingSource) {
    setSourceData(map, BOUNDARY_SOURCE, collection);
  } else {
    map.addSource(BOUNDARY_SOURCE, { type: "geojson", data: collection });
  }

  if (!map.getLayer("boundary-fill")) {
    // Insert the fill below the activity overlay so the red cells stay visible.
    map.addLayer(
      {
        id: "boundary-fill",
        type: "fill",
        source: BOUNDARY_SOURCE,
        paint: {
          "fill-color": "#a8553f",
          "fill-opacity": 0.035,
        },
      },
      map.getLayer("activity-fill") ? "activity-fill" : undefined,
    );
  }

  if (!map.getLayer("boundary-line")) {
    map.addLayer({
      id: "boundary-line",
      type: "line",
      source: BOUNDARY_SOURCE,
      paint: {
        "line-color": "#8a4b3b",
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 1.8],
        "line-opacity": 0.65,
        "line-dasharray": [3, 2],
      },
    });
  }
}

/** Activity fill, hover, selection and optional grid borders. */
function ensureActivityLayers(map: import("maplibre-gl").Map) {
  if (!map.getSource(ACTIVITY_SOURCE)) {
    map.addSource(ACTIVITY_SOURCE, {
      type: "geojson",
      data: EMPTY_ACTIVITY,
      // Use our stable cell id as the feature id, which lets MapLibre store
      // hover/selection state without rewriting the whole GeoJSON source.
      promoteId: "cellId",
    });
  }

  if (!map.getLayer("activity-fill")) {
    map.addLayer({
      id: "activity-fill",
      type: "fill",
      source: ACTIVITY_SOURCE,
      paint: {
        // Raw intensity is already normalised by the server (1 - exp(-score / scale)).
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "intensity"],
          0,
          "#fbe4de",
          0.15,
          "#f7b8aa",
          0.35,
          "#ef8a75",
          0.55,
          "#d94b38",
          0.75,
          "#ab2f23",
          1,
          "#741d16",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["get", "intensity"],
          0,
          0.08,
          0.2,
          0.28,
          0.5,
          0.46,
          0.75,
          0.6,
          1,
          0.72,
        ],
      },
    });
  }

  if (!map.getLayer("activity-hover")) {
    map.addLayer({
      id: "activity-hover",
      type: "line",
      source: ACTIVITY_SOURCE,
      paint: {
        "line-color": "#6d281f",
        "line-width": 2,
        "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
      },
    });
  }

  if (!map.getLayer("activity-selected")) {
    map.addLayer({
      id: "activity-selected",
      type: "line",
      source: ACTIVITY_SOURCE,
      paint: {
        "line-color": "#5f1a13",
        "line-width": 2.6,
        "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0],
      },
    });
  }

  if (!map.getLayer("activity-borders")) {
    map.addLayer({
      id: "activity-borders",
      type: "line",
      source: ACTIVITY_SOURCE,
      minzoom: 15.5,
      paint: {
        "line-color": "#7a2a20",
        "line-width": 0.45,
        "line-opacity": 0.22,
      },
    });
  }
}

export function MapCanvas({
  city,
  period,
  boundary,
  overlayEnabled,
  gridEnabled,
  teacherView,
  reportMode,
  marker,
  markerDraggable = true,
  initialFocus = null,
  selectedCellId,
  refreshToken,
  onCellSelect,
  onLocationPick,
  onActivityStateChange,
  onResolutionChange,
  onMapReady,
  onFatalError,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const boundaryRef = useRef<BoundaryCollection | null>(boundary);
  const reportModeRef = useRef(reportMode);
  const selectedIdRef = useRef<string | null>(selectedCellId);
  const abortRef = useRef<AbortController | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  // City whose boundary has already been framed. Initial focus (admin locator)
  // suppresses the initial automatic fit.
  const fittedCityRef = useRef<string | null>(initialFocus ? city.insee : null);

  const callbacksRef = useRef({
    onCellSelect,
    onLocationPick,
    onActivityStateChange,
    onResolutionChange,
    onMapReady,
    onFatalError,
  });
  callbacksRef.current = {
    onCellSelect,
    onLocationPick,
    onActivityStateChange,
    onResolutionChange,
    onMapReady,
    onFatalError,
  };

  const [mapLoaded, setMapLoaded] = useState(false);
  const [resolution, setResolution] = useState<DisplayResolution>(100);
  const [viewportNonce, setViewportNonce] = useState(0);

  // Keep non-callback props available to MapLibre event handlers without
  // re-creating the map. The map instance is created exactly once.
  boundaryRef.current = boundary;
  reportModeRef.current = reportMode;

  // Create the map once. Dynamic import keeps MapLibre out of the server bundle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the map is intentionally created once from the initial focus.
  useEffect(() => {
    let cancelled = false;
    let localMap: import("maplibre-gl").Map | null = null;

    async function initialize() {
      const container = containerRef.current;
      if (!container) return;

      let maplibregl: typeof import("maplibre-gl");
      try {
        maplibregl = await import("maplibre-gl");
      } catch {
        callbacksRef.current.onFatalError(
          "La bibliothèque cartographique n'a pas pu être chargée.",
        );
        return;
      }

      // Turbopack does not emit MapLibre's worker chunk in a location the
      // browser can load. `scripts/copy-maplibre-worker.ts` copies the official
      // worker to `public/vendor`, and we point MapLibre at it explicitly.
      // The version query lets `next.config.ts` cache the file immutably while
      // still fetching a fresh worker after a MapLibre upgrade.
      maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`);

      // Fetch the style once and hand the parsed object to MapLibre. Passing a
      // URL would make MapLibre download the very same style a second time.
      // A small preflight still gives us a clean fallback to Liberty.
      let style: string | import("maplibre-gl").StyleSpecification = POSITRON_STYLE;
      try {
        const response = await fetch(POSITRON_STYLE, { cache: "force-cache" });
        if (!response.ok) throw new Error("Positron unavailable");
        style = (await response.json()) as import("maplibre-gl").StyleSpecification;
      } catch {
        try {
          const response = await fetch(LIBERTY_STYLE, { cache: "force-cache" });
          if (!response.ok) throw new Error("Liberty unavailable");
          style = (await response.json()) as import("maplibre-gl").StyleSpecification;
        } catch {
          callbacksRef.current.onFatalError(
            "Le fond de carte est indisponible. Vérifiez votre connexion puis rechargez la page.",
          );
          return;
        }
      }

      if (cancelled) return;

      const map = new maplibregl.Map({
        container,
        style,
        center: initialFocus
          ? [initialFocus.longitude, initialFocus.latitude]
          : [city.center.longitude, city.center.latitude],
        zoom: initialFocus ? 16.2 : 13.1,
        minZoom: 10,
        maxZoom: 18,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
        fadeDuration: 120,
      });
      localMap = map;
      mapRef.current = map;

      // Development-only handle used by the browser smoke tests. It is stripped
      // from production bundles thanks to the NODE_ENV guard.
      if (process.env.NODE_ENV !== "production") {
        (
          window as typeof window & {
            __moustiquairMap?: import("maplibre-gl").Map;
          }
        ).__moustiquairMap = map;
      }

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

      let fatalReported = false;
      map.on("error", (event) => {
        // Style/download errors are reported once. Tile errors at high zoom are
        // non-fatal and should not cover a still-usable map.
        if (!fatalReported && !map.isStyleLoaded()) {
          fatalReported = true;
          console.error("[map] style error", event.error);
          callbacksRef.current.onFatalError(
            "Le fond de carte n'a pas pu être affiché. Rechargez la page pour réessayer.",
          );
        }
      });

      map.on("load", () => {
        if (cancelled) return;
        ensureActivityLayers(map);
        if (boundaryRef.current) ensureBoundaryLayers(map, boundaryRef.current);
        setMapLoaded(true);
        callbacksRef.current.onMapReady({
          fitToStudyArea: () => {
            const current = mapRef.current;
            if (!current) return;
            fitBoundary(current);
          },
        });
        setViewportNonce((value) => value + 1);
      });

      const fitBoundary = (current: import("maplibre-gl").Map) => {
        const collection = boundaryRef.current;
        if (!collection || collection.features.length === 0) return;
        const bbox = boundaryBbox(collection);
        const panelPadding = window.innerWidth >= 1024 ? 430 : 56;
        current.fitBounds(
          [
            [bbox.minLon, bbox.minLat],
            [bbox.maxLon, bbox.maxLat],
          ],
          {
            padding: { top: 70, right: panelPadding, bottom: 70, left: 56 },
            duration: 450,
            maxZoom: 15.2,
          },
        );
      };

      // The map must not wander far outside the municipality. Allow a small
      // margin so the outline and edge cells remain visible. Updated again when
      // the boundary for another city arrives.
      const collection = boundaryRef.current;
      if (collection) {
        const bbox = boundaryBbox(collection);
        map.setMaxBounds([
          [bbox.minLon - 0.07, bbox.minLat - 0.05],
          [bbox.maxLon + 0.07, bbox.maxLat + 0.05],
        ]);
      }

      const updateViewport = () => {
        const zoom = map.getZoom();
        const nextResolution = resolutionForZoom(zoom);
        setResolution((previous) => {
          if (previous !== nextResolution) {
            callbacksRef.current.onResolutionChange(nextResolution);
          }
          return nextResolution;
        });
        setViewportNonce((value) => value + 1);
      };

      map.on("moveend", () => {
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(updateViewport, 380);
      });

      map.on("click", (event) => {
        if (reportModeRef.current) {
          callbacksRef.current.onLocationPick({
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat,
          });
          return;
        }

        if (!map.getLayer("activity-fill")) return;
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["activity-fill"],
        });
        const feature = features[0];
        const properties = feature?.properties as ActivityFeatureProperties | undefined;

        if (!properties) {
          callbacksRef.current.onCellSelect(null);
          return;
        }

        callbacksRef.current.onCellSelect({
          cellId: properties.cellId,
          score: Number(properties.score),
          intensity: Number(properties.intensity),
          level: properties.level,
          contributingReports: Number(properties.contributingReports),
          resolution: Number(properties.resolution),
        });
      });

      map.on("mousemove", (event) => {
        if (reportModeRef.current) {
          map.getCanvas().style.cursor = "crosshair";
          return;
        }
        if (!map.getLayer("activity-fill")) return;
        const features = map.queryRenderedFeatures(event.point, {
          layers: ["activity-fill"],
        });
        const id = features[0]?.properties?.cellId as string | undefined;
        map.getCanvas().style.cursor = id ? "pointer" : "";

        if (hoveredIdRef.current && hoveredIdRef.current !== id) {
          map.setFeatureState(
            { source: ACTIVITY_SOURCE, id: hoveredIdRef.current },
            { hover: false },
          );
        }
        if (id) {
          map.setFeatureState({ source: ACTIVITY_SOURCE, id }, { hover: true });
        }
        hoveredIdRef.current = id ?? null;
      });

      map.on("mouseout", () => {
        if (hoveredIdRef.current) {
          map.setFeatureState(
            { source: ACTIVITY_SOURCE, id: hoveredIdRef.current },
            { hover: false },
          );
          hoveredIdRef.current = null;
        }
      });
    }

    void initialize();

    return () => {
      cancelled = true;
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      abortRef.current?.abort();
      markerRef.current?.remove();
      markerRef.current = null;
      localMap?.remove();
      mapRef.current = null;
    };
  }, []);

  // Boundary data arrives after the map starts. The map instance is reused:
  // the GeoJSON source is updated, max bounds follow the new commune, and the
  // view is refitted whenever the selected city changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !boundary) return;

    ensureBoundaryLayers(map, boundary);

    const bbox = boundaryBbox(boundary);
    map.setMaxBounds([
      [bbox.minLon - 0.015, bbox.minLat - 0.012],
      [bbox.maxLon + 0.015, bbox.maxLat + 0.012],
    ]);

    if (fittedCityRef.current !== city.insee) {
      fittedCityRef.current = city.insee;
      const panelPadding = window.innerWidth >= 1024 ? 430 : 56;
      map.fitBounds(
        [
          [bbox.minLon, bbox.minLat],
          [bbox.maxLon, bbox.maxLat],
        ],
        {
          padding: { top: 70, right: panelPadding, bottom: 70, left: 56 },
          duration: 450,
          maxZoom: 15.2,
        },
      );
    }
  }, [boundary, mapLoaded, city.insee]);

  // Toggle grid borders without touching the activity data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (map.getLayer("activity-borders")) {
      map.setLayoutProperty("activity-borders", "visibility", gridEnabled ? "visible" : "none");
    }
  }, [gridEnabled, mapLoaded]);

  // Report mode changes the cursor even before the first mouse move.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = reportMode ? "crosshair" : "";
  }, [reportMode]);

  // Fetch only the visible activity. Requests are aborted when the viewport or
  // filters change quickly, and the GeoJSON source is updated in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: viewportNonce and refreshToken are fetch triggers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // A city change starts a fit animation. Waiting for `moveend` avoids
    // requesting the new city with the previous city's viewport.
    if (map.isMoving()) return;

    if (!overlayEnabled) {
      setSourceData(map, ACTIVITY_SOURCE, EMPTY_ACTIVITY);
      callbacksRef.current.onActivityStateChange({
        loading: false,
        error: null,
        featureCount: 0,
        resolution,
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    callbacksRef.current.onActivityStateChange({
      loading: true,
      error: null,
      featureCount: 0,
      resolution,
    });

    const bounds = map.getBounds();
    const pad = 0.004;
    const bbox = [
      bounds.getWest() - pad,
      bounds.getSouth() - pad,
      bounds.getEast() + pad,
      bounds.getNorth() + pad,
    ]
      .map((value) => value.toFixed(6))
      .join(",");

    const params = new URLSearchParams({
      bbox,
      period,
      resolution: String(resolution),
      city: city.insee,
    });
    if (teacherView) params.set("view", "full");

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/map/grid?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? "La carte n'a pas pu être chargée.");
        }
        const data = (await response.json()) as ActivityCollection;
        if (controller.signal.aborted) return;

        setSourceData(map, ACTIVITY_SOURCE, data);

        callbacksRef.current.onActivityStateChange({
          loading: false,
          error: null,
          featureCount: data.features.length,
          resolution,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        callbacksRef.current.onActivityStateChange({
          loading: false,
          error: error instanceof Error ? error.message : "La carte n'a pas pu être chargée.",
          featureCount: 0,
          resolution,
        });
      }
    }, 140);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    mapLoaded,
    overlayEnabled,
    period,
    resolution,
    viewportNonce,
    teacherView,
    refreshToken,
    city.insee,
  ]);

  // Selection outline. Clear the previous id before setting the new one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resolution changes replace the GeoJSON source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getSource(ACTIVITY_SOURCE)) return;
    if (selectedIdRef.current && selectedIdRef.current !== selectedCellId) {
      map.setFeatureState(
        { source: ACTIVITY_SOURCE, id: selectedIdRef.current },
        { selected: false },
      );
    }
    if (selectedCellId) {
      map.setFeatureState({ source: ACTIVITY_SOURCE, id: selectedCellId }, { selected: true });
    }
    selectedIdRef.current = selectedCellId;
  }, [selectedCellId, mapLoaded, resolution]);

  // Movable report marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    let disposed = false;

    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className = "moustiquair-marker";
      element.setAttribute("aria-hidden", "true");
      element.innerHTML = `
        <span class="moustiquair-marker__pulse"></span>
        <span class="moustiquair-marker__pin"></span>
      `;

      void import("maplibre-gl").then((maplibregl) => {
        if (disposed || !mapRef.current || markerRef.current) return;
        const instance = new maplibregl.Marker({
          element,
          anchor: "bottom",
          draggable: markerDraggable,
        })
          .setLngLat([marker.longitude, marker.latitude])
          .addTo(mapRef.current);

        instance.on("dragend", () => {
          const position = instance.getLngLat();
          callbacksRef.current.onLocationPick({
            longitude: position.lng,
            latitude: position.lat,
          });
        });
        markerRef.current = instance;
      });
    } else {
      markerRef.current.setLngLat([marker.longitude, marker.latitude]);
    }

    return () => {
      disposed = true;
    };
  }, [marker, mapLoaded, markerDraggable]);

  return (
    // MapLibre forces `position: relative` on its container. Wrapping it in an
    // absolutely positioned box keeps `inset-0` sizing while the inner node can
    // still fill 100% of that box.
    <div className="absolute inset-0" data-influence-radius={INFLUENCE_RADIUS_METERS}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label={`Carte de l'activité du moustique tigre à ${city.name}`}
      />
    </div>
  );
}
