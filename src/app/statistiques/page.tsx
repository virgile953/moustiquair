import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  Grid2X2,
  Info,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStats } from "@/lib/activity-service";
import { DEFAULT_PERIOD, isPeriodValue, PERIODS, type PeriodValue } from "@/lib/config/model";
import { formatPercent } from "@/lib/geo/intensity";
import { formatDateFr, formatShortDateFr, periodLabel } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Statistiques",
  description:
    "Chiffres clés de Moustiq'Air : signalements validés, activité estimée et zones concernées à Herblay-sur-Seine.",
};

interface StatsPageProps {
  searchParams: Promise<{ period?: string }>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "brand";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        tone === "brand" ? "border-brand-200 bg-brand-50/70" : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          tone === "brand" ? "bg-brand-100 text-brand-800" : "bg-muted text-primary",
        )}
      >
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <p className="mt-4 text-[0.65rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

export default async function StatistiquesPage({ searchParams }: StatsPageProps) {
  const params = await searchParams;
  const period: PeriodValue =
    params.period && isPeriodValue(params.period) ? params.period : DEFAULT_PERIOD;

  const stats = getStats(period, false);
  const demoShare =
    stats.approvedInPeriod > 0 ? stats.demoApprovedInPeriod / stats.approvedInPeriod : 0;
  const hasData = stats.approvedInPeriod > 0;

  return (
    <>
      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 85% 20%, rgba(217,75,56,0.12), transparent 32%)",
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
            <Badge variant="soft" className="mb-5">
              <BarChart3 className="size-3" aria-hidden="true" />
              Chiffres clés · {periodLabel(period)}
            </Badge>
            <h1 className="max-w-3xl text-balance text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl">
              Les nombres derrière
              <span className="font-display font-normal italic text-primary"> la carte</span>
            </h1>
            <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              Ces indicateurs résument les signalements validés et l&apos;activité estimée par le
              modèle. Ils ne représentent pas un comptage de moustiques.
            </p>

            <div
              className="mt-7 inline-flex flex-wrap gap-1 rounded-full border border-border bg-card p-1"
              role="group"
              aria-label="Choisir la période d'observation"
            >
              {PERIODS.map((option) => (
                <Link
                  key={option.value}
                  href={`/statistiques?period=${option.value}`}
                  aria-current={option.value === period ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
                    option.value === period
                      ? "bg-brand-500 text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
          {!hasData ? (
            <div className="rounded-3xl border border-border bg-card p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MapPinned className="size-5" aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-lg font-extrabold">Aucune observation sur cette période</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Aucun signalement validé n&apos;a été enregistré sur{" "}
                {periodLabel(period).toLowerCase()}. Essayez une période plus longue : les données
                de démonstration couvrent les 90 derniers jours.
              </p>
              <Button asChild className="mt-5" variant="outline">
                <Link href="/statistiques?period=all">Voir toute la période</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={CheckCircle2}
                  label="Signalements validés"
                  value={String(stats.approvedInPeriod)}
                  detail={`${periodLabel(period)} · ${stats.approvedTotal} au total`}
                  tone="brand"
                />
                <StatCard
                  icon={Activity}
                  label="Activité estimée"
                  value={formatPercent(stats.averageIntensity)}
                  detail="intensité visuelle moyenne des zones actives"
                />
                <StatCard
                  icon={Grid2X2}
                  label="Zones concernées"
                  value={String(stats.activeCells)}
                  detail="mailles de 100 m avec activité publiée"
                />
                <StatCard
                  icon={CalendarClock}
                  label="Dernier signalement"
                  value={stats.latestApprovedAt ? formatShortDateFr(stats.latestApprovedAt) : "—"}
                  detail={
                    stats.latestApprovedAt
                      ? `observation du ${formatDateFr(stats.latestApprovedAt)}`
                      : "aucune observation validée"
                  }
                />
              </div>

              <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-3xl border border-border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-extrabold tracking-tight">
                        D&apos;où viennent les observations ?
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Répartition des signalements validés sur la période.
                      </p>
                    </div>
                    {stats.demoActive ? (
                      <Badge variant="warning">
                        <FlaskConical className="size-3" aria-hidden="true" />
                        Démonstration
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold">Observations réelles</span>
                        <span className="font-bold tabular-nums">{stats.realApprovedInPeriod}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${stats.approvedInPeriod ? (stats.realApprovedInPeriod / stats.approvedInPeriod) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold">Observations synthétiques</span>
                        <span className="font-bold tabular-nums">{stats.demoApprovedInPeriod}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${demoShare * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    Les observations synthétiques sont générées pour la démonstration. Elles sont
                    identifiées en base et peuvent être supprimées par un enseignant sans toucher
                    aux signalements réels.
                  </p>
                </section>

                <section className="rounded-3xl border border-border bg-muted/45 p-6">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
                    Comment lire ces chiffres ?
                  </h2>
                  <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
                    <li>
                      <strong className="font-semibold text-foreground">
                        Signalements validés
                      </strong>{" "}
                      : uniquement les observations relues et approuvées par un enseignant.
                    </li>
                    <li>
                      <strong className="font-semibold text-foreground">Activité estimée</strong> :
                      moyenne de l&apos;indice visuel sur les zones publiées. Une zone isolée
                      n&apos;est pas affichée si moins de trois signalements y contribuent.
                    </li>
                    <li>
                      <strong className="font-semibold text-foreground">Zones concernées</strong> :
                      nombre de mailles de 100 m ayant une activité positive et publiée.
                    </li>
                  </ul>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link href="/comprendre">
                      Comprendre le modèle
                      <ArrowRight />
                    </Link>
                  </Button>
                </section>
              </div>
            </>
          )}

          <section className="mt-8 rounded-3xl border border-amber-200/80 bg-amber-50/65 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <Info className="size-4" aria-hidden="true" />
              Une carte d&apos;observation, pas une carte de risque
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-amber-950/80">
              Une zone rouge indique que plusieurs personnes ont signalé des moustiques à proximité
              et que le modèle y calcule une activité relative plus élevée. Cela ne signifie pas que
              la zone est officiellement infestée, ni qu&apos;elle présente un danger sanitaire
              particulier. L&apos;absence de rouge ne prouve pas non plus l&apos;absence de
              moustiques.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
