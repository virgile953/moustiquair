"use client";

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Crosshair,
  FlaskConical,
  Grid2X2,
  Info,
  Layers,
  Loader2,
  LocateFixed,
  MapPinOff,
  PanelRightOpen,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ReportPanel } from "@/components/reporting/report-panel";
import { Button } from "@/components/ui/button";
import { DEFAULT_PERIOD, type PeriodValue } from "@/lib/config/model";
import type { BoundaryGeometry } from "@/lib/geo/boundary";
import type { LonLat } from "@/lib/geo/types";
import { formatShortDateFr, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

import { type MapApi, MapCanvas } from "./map-canvas";
import { MapSidebar } from "./map-sidebar";
import type { ActivityLoadState, MapStats, SelectedCell } from "./types";

type BoundaryCollection = FeatureCollection<Polygon | MultiPolygon>;

interface MapExperienceProps {
  initialReportOpen?: boolean;
  /** Teacher mode asks the API for complete, unpublished model results. */
  teacher?: boolean;
  /** Optional point to centre on, used by the private admin locator. */
  initialFocus?: LonLat | null;
  /** Admin locator hides the public reporting action. */
  showReportAction?: boolean;
}

function firstBoundaryGeometry(collection: BoundaryCollection | null): BoundaryGeometry | null {
  if (!collection) return null;
  for (const feature of collection.features) {
    if (feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon") {
      return feature.geometry;
    }
  }
  return null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="map-panel flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-primary sm:size-8">
        <Icon className="size-3.5 sm:size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[0.58rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase sm:text-[0.62rem] sm:tracking-[0.06em]">
          {label}
        </p>
        <p className="text-[0.8rem] font-extrabold tabular-nums tracking-tight sm:text-sm">
          {value}
        </p>
        <p className="hidden text-[0.6rem] text-muted-foreground sm:block">{detail}</p>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  pressed,
  onClick,
  children,
  className,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "map-panel flex size-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:ring-4 focus-visible:ring-brand-100 focus-visible:outline-none",
        pressed === false && "text-muted-foreground",
        pressed === true && "border-brand-200 bg-brand-50 text-brand-700",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MapExperience({
  initialReportOpen = false,
  teacher = false,
  initialFocus = null,
  showReportAction = true,
}: MapExperienceProps) {
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [boundary, setBoundary] = useState<BoundaryCollection | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [boundaryNonce, setBoundaryNonce] = useState(0);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [activityState, setActivityState] = useState<ActivityLoadState>({
    loading: true,
    error: null,
    featureCount: 0,
    resolution: 100,
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [mapFatalError, setMapFatalError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const [reportOpen, setReportOpen] = useState(initialReportOpen);
  const [choosingLocation, setChoosingLocation] = useState(false);
  const [reportLocation, setReportLocation] = useState<LonLat | null>(null);

  const mapApiRef = useRef<MapApi | null>(null);

  // Load the official commune boundary once from our local, versioned copy.
  // biome-ignore lint/correctness/useExhaustiveDependencies: boundaryNonce is a retry trigger.
  useEffect(() => {
    const controller = new AbortController();
    setBoundaryError(null);
    void (async () => {
      try {
        const response = await fetch("/api/map/boundary", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("La limite communale n'a pas pu être chargée.");
        const data = (await response.json()) as BoundaryCollection;
        if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
          throw new Error("La limite communale reçue est invalide.");
        }
        setBoundary(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        setBoundaryError(
          error instanceof Error ? error.message : "La limite communale n'a pas pu être chargée.",
        );
      }
    })();
    return () => controller.abort();
  }, [boundaryNonce]);

  // Public statistics for the selected period. Teacher mode also returns the
  // moderation counts, which are never public.
  useEffect(() => {
    const controller = new AbortController();
    setStatsError(null);
    const params = new URLSearchParams({ period });
    if (teacher) params.set("view", "full");

    void (async () => {
      try {
        const response = await fetch(`/api/stats?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Statistiques indisponibles.");
        const data = (await response.json()) as MapStats;
        setStats(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatsError(error instanceof Error ? error.message : "Statistiques indisponibles.");
      }
    })();
    return () => controller.abort();
  }, [period, teacher]);

  // Let the header CTA reopen the panel even when the URL is already
  // /?signaler=1 (clicking the same link would not remount the page).
  useEffect(() => {
    if (initialReportOpen) setReportOpen(true);
    const openPanel = () => {
      setReportOpen(true);
      setChoosingLocation(false);
      setMobileSheetOpen(false);
    };
    window.addEventListener("moustiquair:open-report", openPanel);
    return () => window.removeEventListener("moustiquair:open-report", openPanel);
  }, [initialReportOpen]);

  useEffect(() => {
    if (!mobileSheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSheetOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileSheetOpen]);

  const handlePeriodChange = (nextPeriod: PeriodValue) => {
    setPeriod(nextPeriod);
    setSelectedCell(null);
  };

  const handleOverlayChange = (enabled: boolean) => {
    setOverlayEnabled(enabled);
    if (!enabled) setSelectedCell(null);
  };

  const handleMapReady = useCallback((api: MapApi) => {
    mapApiRef.current = api;
  }, []);

  const handleResolutionChange = useCallback(() => {
    // The sidebar reads the resolution from the activity state; this callback
    // exists so the map can report zooms without being re-created.
  }, []);

  const handleLocationPick = (position: LonLat) => {
    setReportLocation(position);
    setReportOpen(true);
    setChoosingLocation(false);
  };

  const startReport = () => {
    setReportOpen(true);
    setChoosingLocation(false);
    setMobileSheetOpen(false);
  };

  const closeReport = () => {
    setReportOpen(false);
    setChoosingLocation(false);
    setReportLocation(null);
  };

  const requestMapLocation = () => {
    setChoosingLocation(true);
    setMobileSheetOpen(false);
  };

  const cancelMapLocation = () => {
    setChoosingLocation(false);
  };

  const boundaryGeometry = firstBoundaryGeometry(boundary);
  const latestLabel = stats?.latestApprovedAt ? formatShortDateFr(stats.latestApprovedAt) : "—";

  const statCards = [
    {
      icon: CheckCircle2,
      label: "Signalements",
      value: stats ? String(stats.approvedInPeriod) : "—",
      detail: periodLabel(period),
    },
    {
      icon: Activity,
      label: "Activité",
      value: stats ? `${Math.round(stats.averageIntensity * 100)} %` : "—",
      detail: "indice visuel moyen",
    },
    {
      icon: Grid2X2,
      label: "Zones actives",
      value: stats ? String(stats.activeCells) : "—",
      detail: "mailles de 100 m",
    },
    {
      icon: Clock3,
      label: "Dernier signal",
      value: latestLabel,
      detail: "observation validée",
    },
  ];

  return (
    <main className="relative h-[calc(100dvh-68px)] min-h-[540px] overflow-hidden bg-[#e9e3d9]">
      <div className="flex h-full">
        <div className="relative min-w-0 flex-1">
          <MapCanvas
            period={period}
            boundary={boundary}
            overlayEnabled={overlayEnabled}
            gridEnabled={gridEnabled}
            teacherView={teacher}
            reportMode={choosingLocation}
            marker={reportOpen ? reportLocation : initialFocus}
            markerDraggable={showReportAction}
            initialFocus={initialFocus}
            selectedCellId={selectedCell?.cellId ?? null}
            refreshToken={refreshToken}
            onCellSelect={setSelectedCell}
            onLocationPick={handleLocationPick}
            onActivityStateChange={setActivityState}
            onResolutionChange={handleResolutionChange}
            onMapReady={handleMapReady}
            onFatalError={setMapFatalError}
          />

          {/* Compact statistics. Pointer events stay off so the map remains usable. */}
          <div className="pointer-events-none absolute top-4 left-4 z-20 w-[min(650px,calc(100%-5.5rem))]">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {stats?.demoActive ? (
                <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-[0.68rem] font-semibold text-amber-900 shadow-sm backdrop-blur">
                  <FlaskConical className="size-3.5" />
                  Données de démonstration
                  <span className="hidden font-medium text-amber-800/80 sm:inline">
                    · observations synthétiques
                  </span>
                </div>
              ) : null}
              {teacher ? (
                <div className="pointer-events-auto rounded-full border border-brand-200 bg-brand-50/95 px-3 py-1.5 text-[0.68rem] font-semibold text-brand-800 shadow-sm">
                  Vue enseignante · données complètes
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {statCards.map((card) => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>
            {statsError ? (
              <p className="pointer-events-auto mt-2 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[0.65rem] font-medium text-red-800">
                {statsError}
              </p>
            ) : null}
          </div>

          {/* Map controls */}
          <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
            <ControlButton
              label="Recentrer sur Herblay-sur-Seine"
              onClick={() => mapApiRef.current?.fitToStudyArea()}
            >
              <LocateFixed className="size-4.5" />
            </ControlButton>
            <ControlButton
              label="Afficher ou masquer la couche d'activité"
              pressed={overlayEnabled}
              onClick={() => handleOverlayChange(!overlayEnabled)}
            >
              <Layers className="size-4.5" />
            </ControlButton>
            <ControlButton
              label="Afficher ou masquer les contours de la grille"
              pressed={gridEnabled}
              onClick={() => setGridEnabled((value) => !value)}
            >
              <Grid2X2 className="size-4.5" />
            </ControlButton>
            {!panelOpen ? (
              <ControlButton
                label="Ouvrir le panneau d'information"
                onClick={() => setPanelOpen(true)}
                className="hidden lg:flex"
              >
                <PanelRightOpen className="size-4.5" />
              </ControlButton>
            ) : null}
            <ControlButton
              label="Ouvrir la légende et les réglages"
              onClick={() => setMobileSheetOpen(true)}
              className="lg:hidden"
            >
              <Info className="size-4.5" />
            </ControlButton>
          </div>

          {/* Reporting action */}
          {showReportAction && !choosingLocation ? (
            <Button
              size="lg"
              onClick={startReport}
              className="absolute bottom-5 left-4 z-30 rounded-full px-5 shadow-[0_18px_40px_-18px_rgba(217,75,56,0.75)]"
            >
              <Plus className="size-4.5" />
              Signaler un moustique
            </Button>
          ) : null}

          {/* Loading pill */}
          {activityState.loading ? (
            <div className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[0.7rem] font-medium text-muted-foreground shadow-sm backdrop-blur sm:bottom-5">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Mise à jour de la carte…
            </div>
          ) : null}

          {/* Empty state */}
          {!activityState.loading &&
          !activityState.error &&
          activityState.featureCount === 0 &&
          overlayEnabled ? (
            <div className="pointer-events-none absolute inset-x-4 top-1/2 z-10 flex -translate-y-1/2 justify-center px-2">
              <div className="map-panel pointer-events-auto w-full max-w-sm rounded-2xl p-4 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <MapPinOff className="size-5" />
                </div>
                <p className="mt-2.5 text-sm font-bold">
                  Aucune activité publiée pour cette période
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Les signalements en attente de validation n&apos;apparaissent pas. Les zones sont
                  aussi masquées tant que moins de trois signalements validés s&apos;y recoupent.
                </p>
                <p className="mt-2 text-[0.68rem] text-muted-foreground">
                  Essayez une période plus longue ou déplacez la carte.
                </p>
              </div>
            </div>
          ) : null}

          {/* Activity request error */}
          {activityState.error ? (
            <div className="pointer-events-none absolute inset-x-4 top-1/2 z-10 flex -translate-y-1/2 justify-center px-2">
              <div className="map-panel pointer-events-auto w-full max-w-sm rounded-2xl border-red-100 p-4 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-red-50 text-red-700">
                  <AlertTriangle className="size-5" />
                </div>
                <p className="mt-2.5 text-sm font-bold">Carte momentanément indisponible</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {activityState.error}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => setRefreshToken((value) => value + 1)}
                >
                  Réessayer
                </Button>
              </div>
            </div>
          ) : null}

          {/* Fatal map / basemap error */}
          {mapFatalError ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#e9e3d9]/80 p-6 backdrop-blur-sm">
              <div className="map-panel max-w-sm rounded-2xl p-5 text-center">
                <AlertTriangle className="mx-auto size-6 text-red-700" />
                <p className="mt-2 text-sm font-bold">La carte n&apos;a pas pu démarrer</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {mapFatalError}
                </p>
                <Button className="mt-3" size="sm" onClick={() => window.location.reload()}>
                  Recharger la page
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {panelOpen ? (
          <aside
            aria-label="Légende et informations sur la carte"
            className="hidden w-[382px] shrink-0 border-l border-border bg-card lg:block"
          >
            <MapSidebar
              period={period}
              onPeriodChange={handlePeriodChange}
              overlayEnabled={overlayEnabled}
              onOverlayChange={handleOverlayChange}
              gridEnabled={gridEnabled}
              onGridChange={setGridEnabled}
              selectedCell={selectedCell}
              onClearSelection={() => setSelectedCell(null)}
              activityState={activityState}
              stats={stats}
              boundaryError={boundaryError}
              onRetryBoundary={() => setBoundaryNonce((value) => value + 1)}
              onClose={() => setPanelOpen(false)}
            />
          </aside>
        ) : null}
      </div>

      {/* Mobile legend sheet */}
      {mobileSheetOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Fermer la légende"
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
            onClick={() => setMobileSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Légende et réglages de la carte"
            className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-[1.5rem] border border-border bg-card shadow-[0_-20px_60px_-25px_rgba(33,29,25,0.5)] animate-in slide-in-from-bottom duration-250"
          >
            <MapSidebar
              period={period}
              onPeriodChange={handlePeriodChange}
              overlayEnabled={overlayEnabled}
              onOverlayChange={handleOverlayChange}
              gridEnabled={gridEnabled}
              onGridChange={setGridEnabled}
              selectedCell={selectedCell}
              onClearSelection={() => setSelectedCell(null)}
              activityState={activityState}
              stats={stats}
              boundaryError={boundaryError}
              onRetryBoundary={() => setBoundaryNonce((value) => value + 1)}
              onClose={() => setMobileSheetOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Location selection instructions */}
      {choosingLocation ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[66] flex justify-center px-4 pb-5">
          <div className="map-panel pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-primary">
              <Crosshair className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Placez le point sur la carte</p>
              <p className="text-[0.7rem] leading-snug text-muted-foreground">
                Touchez l&apos;endroit précis de l&apos;observation, puis déplacez le marqueur si
                besoin.
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Annuler" onClick={cancelMapLocation}>
              <X />
            </Button>
          </div>
        </div>
      ) : null}

      <ReportPanel
        open={showReportAction && reportOpen}
        hidden={choosingLocation}
        location={reportLocation}
        boundaryGeometry={boundaryGeometry}
        onClose={closeReport}
        onLocationChange={setReportLocation}
        onRequestMapSelection={requestMapLocation}
      />
    </main>
  );
}
