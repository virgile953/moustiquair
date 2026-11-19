"use client";

import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Info,
  Layers,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type City, withCityQuery } from "@/lib/cities";
import { PERIODS, type PeriodValue } from "@/lib/config/model";
import { formatActivityScore, formatPercent, getActivityLevelLabel } from "@/lib/geo/intensity";
import { periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

import type { ActivityLoadState, MapStats, SelectedCell } from "./types";

interface MapSidebarProps {
  city: City;
  period: PeriodValue;
  onPeriodChange: (period: PeriodValue) => void;
  overlayEnabled: boolean;
  onOverlayChange: (enabled: boolean) => void;
  gridEnabled: boolean;
  onGridChange: (enabled: boolean) => void;
  selectedCell: SelectedCell | null;
  onClearSelection: () => void;
  activityState: ActivityLoadState;
  stats: MapStats | null;
  boundaryError: string | null;
  onRetryBoundary: () => void;
  onClose?: () => void;
}

const LEVEL_BADGE: Record<SelectedCell["level"], string> = {
  none: "bg-muted text-muted-foreground",
  low: "bg-brand-50 text-brand-700 border-brand-100",
  moderate: "bg-brand-100 text-brand-800 border-brand-200",
  high: "bg-brand-500 text-white border-brand-500",
};

export function ActivityLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div
        className={cn("h-2.5 w-full rounded-full", compact ? "mb-2" : "mb-2.5")}
        style={{
          background:
            "linear-gradient(90deg, #fbe4de 0%, #f7b8aa 24%, #ef8a75 47%, #d94b38 70%, #9e2f22 88%, #741d16 100%)",
        }}
        aria-hidden="true"
      />
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.7rem] leading-tight text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[#fbe4de]" aria-hidden="true" />
          Aucune activité
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[#f7b8aa]" aria-hidden="true" />
          Activité faible
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[#ef8a75]" aria-hidden="true" />
          Activité modérée
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-[#9e2f22]" aria-hidden="true" />
          Activité élevée
        </li>
      </ul>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
        L&apos;intensité traduit le nombre et le recoupement des signalements validés, pas une
        densité de moustiques mesurée.
      </p>
    </div>
  );
}

function CellDetails({
  cell,
  period,
  onClear,
}: {
  cell: SelectedCell;
  period: PeriodValue;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/55 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.66rem] font-bold tracking-[0.12em] text-brand-700 uppercase">
            Activité estimée
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold",
                LEVEL_BADGE[cell.level],
              )}
            >
              <Activity className="size-3" />
              {getActivityLevelLabel(cell.level)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fermer le détail de la cellule"
          onClick={onClear}
          className="-mt-1 -mr-1"
        >
          <X />
        </Button>
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Indice d&apos;activité</dt>
          <dd className="font-bold tabular-nums text-foreground">
            {formatActivityScore(cell.score)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Signalements contributeurs</dt>
          <dd className="font-bold tabular-nums text-foreground">{cell.contributingReports}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Période</dt>
          <dd className="font-semibold text-foreground">{periodLabel(period)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Maille affichée</dt>
          <dd className="font-semibold text-foreground">{cell.resolution} m</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Intensité visuelle</dt>
          <dd className="font-semibold text-foreground">{formatPercent(cell.intensity)}</dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-brand-100 pt-2.5 text-[0.68rem] leading-relaxed text-muted-foreground">
        La position exacte des signalements et l&apos;identité des observateurs ne sont jamais
        publiées.
      </p>
    </div>
  );
}

export function MapSidebar({
  city,
  period,
  onPeriodChange,
  overlayEnabled,
  onOverlayChange,
  gridEnabled,
  onGridChange,
  selectedCell,
  onClearSelection,
  activityState,
  stats,
  boundaryError,
  onRetryBoundary,
  onClose,
}: MapSidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border/80 px-5 py-4">
        <div>
          <p className="text-[0.66rem] font-bold tracking-[0.14em] text-primary uppercase">
            Carte d&apos;activité
          </p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight">{city.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {city.department} · INSEE {city.insee} · grille scientifique de 10 m
          </p>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Réduire le panneau d'information"
            onClick={onClose}
          >
            <ChevronRight />
          </Button>
        ) : null}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section>
          <Label htmlFor="activity-period" className="text-xs font-bold tracking-wide uppercase">
            Période d&apos;observation
          </Label>
          <Select
            id="activity-period"
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as PeriodValue)}
            className="mt-2"
          >
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-[0.7rem] leading-relaxed text-muted-foreground">
            Seuls les signalements validés par un enseignant sont pris en compte.
          </p>
        </section>

        {selectedCell ? (
          <CellDetails cell={selectedCell} period={period} onClear={onClearSelection} />
        ) : (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
              <Layers className="size-3.5 text-primary" />
              Légende
            </h3>
            <ActivityLegend />
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/70 p-3 text-[0.7rem] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Touchez un carré coloré pour lire son indice, ou consultez la{" "}
                <Link
                  href={withCityQuery("/comprendre", city.insee)}
                  className="font-semibold text-brand-700 underline underline-offset-2"
                >
                  méthode complète
                </Link>
                .
              </span>
            </p>
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-bold tracking-wide uppercase">Affichage</h3>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 px-3.5 py-3">
            <div>
              <Label htmlFor="overlay-toggle" className="text-sm font-semibold">
                Couche d&apos;activité
              </Label>
              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                Afficher les carrés rouges
              </p>
            </div>
            <Switch
              id="overlay-toggle"
              checked={overlayEnabled}
              onCheckedChange={onOverlayChange}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 px-3.5 py-3">
            <div>
              <Label htmlFor="grid-toggle" className="text-sm font-semibold">
                Contours de la grille
              </Label>
              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                Visibles à partir du zoom 15,5
              </p>
            </div>
            <Switch id="grid-toggle" checked={gridEnabled} onCheckedChange={onGridChange} />
          </div>
        </section>

        <section className="rounded-xl border border-border/80 bg-muted/45 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {activityState.loading ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <span className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
            )}
            <span>
              {activityState.loading
                ? "Actualisation de la carte…"
                : `${activityState.featureCount} zone${activityState.featureCount > 1 ? "s" : ""} active${activityState.featureCount > 1 ? "s" : ""} affichée${activityState.featureCount > 1 ? "s" : ""}`}
            </span>
          </div>
          <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted-foreground">
            Maille affichée : {activityState.resolution} m
            {activityState.resolution === 10
              ? " (résolution scientifique)"
              : " (vue simplifiée, calculée depuis la grille de 10 m)"}
            .
          </p>
          {activityState.error ? (
            <p className="mt-2 flex items-start gap-1.5 text-[0.68rem] font-medium text-red-700">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {activityState.error}
            </p>
          ) : null}
        </section>

        {boundaryError ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[0.7rem] text-amber-900">
            <p className="font-semibold">Limite communale indisponible</p>
            <p className="mt-1 leading-relaxed">{boundaryError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-amber-300 bg-white/60"
              onClick={onRetryBoundary}
            >
              Réessayer
            </Button>
          </section>
        ) : null}

        <section className="border-t border-border/80 pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
            <ShieldCheck className="size-3.5 text-emerald-700" />
            Confidentialité
          </h3>
          <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
            Une zone n&apos;est publiée que si au moins{" "}
            <strong className="font-semibold text-foreground">3 signalements validés</strong> y
            contribuent. Cela empêche de retrouver la position exacte d&apos;un signalement isolé.
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-[0.68rem] leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" />
            Aucun nom, e-mail ou adresse n&apos;est collecté.
          </p>
        </section>

        {stats?.demoActive ? (
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-[0.68rem] leading-relaxed text-amber-900">
            <strong className="font-semibold">Données de démonstration.</strong> Des observations
            synthétiques sont mélangées aux données réelles pour la présentation.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 pb-1">
          <Badge variant="outline">POC pédagogique</Badge>
          <Link
            href={withCityQuery("/statistiques", city.insee)}
            className="text-[0.7rem] font-semibold text-brand-700 underline underline-offset-2"
          >
            Voir les statistiques de {city.name}
          </Link>
        </div>
      </div>
    </div>
  );
}
