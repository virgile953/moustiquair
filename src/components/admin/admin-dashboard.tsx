"use client";

import {
  Activity,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  FlaskConical,
  Grid2X2,
  Loader2,
  LogOut,
  MapPin,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminSighting, AdminSightingList, AdminStatusFilter } from "@/lib/admin-data";
import { type City, withCityQuery } from "@/lib/cities";
import {
  MOSQUITO_COUNT_OPTIONS,
  REPORTER_CONFIDENCE_OPTIONS,
  type SightingStatus,
} from "@/lib/config/model";
import { formatDateTimeFr, formatShortDateFr } from "@/lib/time";
import { cn } from "@/lib/utils";

interface DashboardStats {
  approvedTotal: number;
  approvedInPeriod: number;
  pendingCount: number | null;
  rejectedCount: number | null;
  activeCells: number;
  demoApprovedInPeriod: number;
  demoActive: boolean;
}

interface AdminDashboardProps {
  city: City;
  initialList: AdminSightingList;
  initialStats: DashboardStats;
  sessionExpiresAt: string;
}

const STATUS_FILTERS: { value: AdminStatusFilter; label: string }[] = [
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Validés" },
  { value: "rejected", label: "Rejetés" },
  { value: "all", label: "Tous" },
];

const STATUS_LABEL: Record<SightingStatus, string> = {
  pending: "En attente",
  approved: "Validé",
  rejected: "Rejeté",
};

function countLabel(value: string): string {
  return MOSQUITO_COUNT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function confidenceLabel(value: string): string {
  return REPORTER_CONFIDENCE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function Metric({
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
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.62rem] font-bold tracking-[0.1em] text-muted-foreground uppercase">
          {label}
        </p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AdminDashboard({
  city,
  initialList,
  initialStats,
  sessionExpiresAt,
}: AdminDashboardProps) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState<AdminStatusFilter>("pending");
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(
    async (nextFilter: AdminStatusFilter) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/sightings?status=${nextFilter}&city=${city.insee}`,
          {
            cache: "no-store",
          },
        );
        if (response.status === 401) {
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error("La liste n'a pas pu être chargée.");
        const data = (await response.json()) as AdminSightingList;
        setList(data);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "La liste n'a pas pu être chargée.",
        );
      } finally {
        setLoading(false);
      }
    },
    [router, city.insee],
  );

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/stats?period=30&view=full&city=${city.insee}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as DashboardStats;
      setStats(data);
    } catch {
      // Statistics are secondary; the moderation list remains usable.
    }
  }, [city.insee]);

  const refreshAll = useCallback(
    async (nextFilter: AdminStatusFilter = filter) => {
      await Promise.all([loadList(nextFilter), loadStats()]);
    },
    [filter, loadList, loadStats],
  );

  const changeFilter = (nextFilter: AdminStatusFilter) => {
    setFilter(nextFilter);
    void loadList(nextFilter);
  };

  const review = async (sighting: AdminSighting, status: "approved" | "rejected") => {
    setActionId(sighting.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/sightings/${encodeURIComponent(sighting.id)}?city=${city.insee}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-moustiquair-csrf": "1",
          },
          body: JSON.stringify({ status }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "La décision n'a pas pu être enregistrée.");
      }
      setNotice(
        status === "approved"
          ? "Signalement validé. Il contribue désormais à la carte publique."
          : "Signalement rejeté. Il ne contribuera jamais à la carte publique.",
      );
      await refreshAll();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "La décision n'a pas pu être enregistrée.",
      );
    } finally {
      setActionId(null);
    }
  };

  const handleDemoSeed = async () => {
    if (
      !window.confirm(
        `Restaurer le jeu de démonstration de ${city.name} ? Les observations synthétiques existantes de cette commune seront remplacées. Les signalements réels ne sont pas modifiés.`,
      )
    ) {
      return;
    }
    setDemoBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/demo/seed?city=${city.insee}`, {
        method: "POST",
        headers: { "x-moustiquair-csrf": "1" },
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        inserted?: number;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "Les données de démonstration n'ont pas pu être créées.",
        );
      }
      setNotice(
        `Jeu de démonstration de ${city.name} restauré${body?.inserted ? ` (${body.inserted} observations)` : ""}.`,
      );
      await refreshAll();
    } catch (demoError) {
      setError(
        demoError instanceof Error
          ? demoError.message
          : "Les données de démonstration n'ont pas pu être créées.",
      );
    } finally {
      setDemoBusy(false);
    }
  };

  const handleDemoClear = async () => {
    if (
      !window.confirm(
        `Supprimer les observations de démonstration de ${city.name} ? Les signalements réels et les autres communes seront conservés.`,
      )
    ) {
      return;
    }
    setDemoBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/demo?city=${city.insee}`, {
        method: "DELETE",
        headers: { "x-moustiquair-csrf": "1" },
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
        removed?: number;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "Les données de démonstration n'ont pas pu être supprimées.",
        );
      }
      setNotice(`${body?.removed ?? 0} observations de démonstration supprimées à ${city.name}.`);
      await refreshAll();
    } catch (demoError) {
      setError(
        demoError instanceof Error
          ? demoError.message
          : "Les données de démonstration n'ont pas pu être supprimées.",
      );
    } finally {
      setDemoBusy(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "x-moustiquair-csrf": "1" },
      });
    } finally {
      router.refresh();
      router.push("/admin");
    }
  };

  const totalAll = list.counts.pending + list.counts.approved + list.counts.rejected;

  return (
    <main className="min-h-[calc(100dvh-68px)] bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-5 lg:px-7 lg:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft">
                <ShieldCheck className="size-3" aria-hidden="true" />
                Espace enseignant
              </Badge>
              <Badge variant="outline">
                {city.name} · {city.insee}
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl">
              Modération et pilotage
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Validez les observations de {city.name}, inspectez leur position privée et gérez le
              jeu de démonstration de cette commune. Les signalements en attente ne sont jamais
              publiés.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={withCityQuery("/", city.insee)}>
                <ArrowLeft />
                Carte publique
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={withCityQuery("/admin/carte", city.insee)}>
                <MapPinned />
                Vue complète
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut />
              Quitter
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[0.68rem] text-muted-foreground">
          Session sécurisée jusqu&apos;au {formatDateTimeFr(sessionExpiresAt)}.
        </p>

        {notice ? (
          <div
            role="status"
            className="mt-5 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {notice}
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <section
          aria-label="Indicateurs de modération"
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Metric
            icon={Clock3}
            label="En attente"
            value={String(stats.pendingCount ?? list.counts.pending)}
            detail="à relire avant publication"
          />
          <Metric
            icon={CheckCircle2}
            label="Validés"
            value={String(stats.approvedTotal)}
            detail={`${stats.approvedInPeriod} sur 30 jours`}
          />
          <Metric
            icon={XCircle}
            label="Rejetés"
            value={String(stats.rejectedCount ?? list.counts.rejected)}
            detail="jamais pris en compte"
          />
          <Metric
            icon={Grid2X2}
            label="Zones actives"
            value={String(stats.activeCells)}
            detail="mailles de 100 m publiées"
          />
        </section>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="moderation-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="moderation-title" className="text-lg font-extrabold tracking-tight">
                  File de modération
                </h2>
                <p className="text-xs text-muted-foreground">
                  {list.total} signalement{list.total > 1 ? "s" : ""} à {city.name} dans ce filtre ·
                  positions visibles uniquement par l&apos;enseignant.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshAll()}
                disabled={loading}
              >
                <RefreshCw className={loading ? "animate-spin" : undefined} />
                Actualiser
              </Button>
            </div>

            <div
              className="mt-4 flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-1.5"
              role="group"
              aria-label="Filtrer les signalements"
            >
              {STATUS_FILTERS.map((option) => {
                const count = option.value === "all" ? totalAll : list.counts[option.value];
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => changeFilter(option.value)}
                    aria-pressed={filter === option.value}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                      filter === option.value
                        ? "bg-brand-500 text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {option.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[0.6rem] tabular-nums",
                        filter === option.value ? "bg-white/20" : "bg-muted",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-3">
              {loading && list.items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-14 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Chargement des signalements…
                </div>
              ) : null}

              {!loading && list.items.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center">
                  <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </div>
                  <p className="mt-3 text-sm font-bold">
                    Aucun signalement à {city.name} dans ce filtre
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    La file de {city.name} est vide. Les nouvelles observations de cette commune
                    apparaîtront ici. Changez de commune dans l&apos;en-tête pour voir les autres
                    files.
                  </p>
                </div>
              ) : null}

              {list.items.map((sighting) => {
                const busy = actionId === sighting.id;
                return (
                  <article
                    key={sighting.id}
                    className="rounded-2xl border border-border bg-card p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            sighting.status === "pending"
                              ? "warning"
                              : sighting.status === "approved"
                                ? "success"
                                : "danger"
                          }
                        >
                          {STATUS_LABEL[sighting.status]}
                        </Badge>
                        {sighting.isDemo ? (
                          <Badge variant="outline">
                            <FlaskConical className="size-3" aria-hidden="true" />
                            Démo
                          </Badge>
                        ) : null}
                        <span className="text-xs font-semibold">
                          {formatShortDateFr(sighting.observedAt)}
                        </span>
                      </div>
                      <span className="font-mono text-[0.65rem] text-muted-foreground">
                        {sighting.id.slice(0, 18)}
                        {sighting.id.length > 18 ? "…" : ""}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-muted-foreground">Moustiques observés</p>
                        <p className="mt-0.5 font-semibold">{countLabel(sighting.mosquitoCount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Identification</p>
                        <p className="mt-0.5 font-semibold">
                          {sighting.reporterConfidence === "certain" ? "Certaine" : "Probable"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reçu le</p>
                        <p className="mt-0.5 font-semibold">
                          {formatShortDateFr(sighting.createdAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Coordonnées privées</p>
                        <p className="mt-0.5 font-mono font-semibold tabular-nums">
                          {sighting.latitude.toFixed(5)}, {sighting.longitude.toFixed(5)}
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 text-[0.68rem] text-muted-foreground">
                      Certitude déclarée : {confidenceLabel(sighting.reporterConfidence)}
                    </p>

                    {sighting.notes ? (
                      <p className="mt-3 rounded-xl bg-muted/65 px-3 py-2.5 text-xs leading-relaxed">
                        {sighting.notes}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                      {sighting.status !== "approved" ? (
                        <Button
                          size="sm"
                          onClick={() => void review(sighting, "approved")}
                          disabled={busy}
                        >
                          {busy ? <Loader2 className="animate-spin" /> : <Check />}
                          Approuver
                        </Button>
                      ) : null}
                      {sighting.status !== "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void review(sighting, "rejected")}
                          disabled={busy}
                        >
                          {busy ? <Loader2 className="animate-spin" /> : <X />}
                          Rejeter
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/admin/carte?lat=${sighting.latitude}&lon=${sighting.longitude}&city=${city.insee}`}
                        >
                          <MapPin />
                          Voir la position
                        </Link>
                      </Button>
                      {sighting.reviewedAt ? (
                        <span className="ml-auto text-[0.65rem] text-muted-foreground">
                          Relu le {formatShortDateFr(sighting.reviewedAt)}
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Database className="size-4 text-primary" aria-hidden="true" />
                Jeu de démonstration
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Le jeu synthétique de {city.name} est reproductible et couvre les 90 derniers jours.
                Il contient {stats.demoApprovedInPeriod} observations validées sur 30 jours
                {stats.demoActive ? "" : " (actuellement absent pour cette commune)"}.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDemoSeed()}
                  disabled={demoBusy}
                >
                  {demoBusy ? <Loader2 className="animate-spin" /> : <FlaskConical />}
                  Restaurer la démonstration
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={() => void handleDemoClear()}
                  disabled={demoBusy}
                >
                  {demoBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Supprimer les données démo de {city.name}
                </Button>
              </div>
              <p className="mt-3 text-[0.65rem] leading-relaxed text-muted-foreground">
                Ces actions ne touchent jamais aux signalements réels des autres communes. Toutes
                les lignes synthétiques portent <span className="font-mono">isDemo = true</span>.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-muted/45 p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="size-4 text-emerald-700" aria-hidden="true" />
                Rappels de confidentialité
              </h2>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
                <li>
                  Les coordonnées et les notes ne doivent pas être projetées en classe ni partagées
                  publiquement.
                </li>
                <li>
                  La carte publique ne publie une maille que si au moins trois signalements validés
                  y contribuent.
                </li>
                <li>
                  Les signalements rejetés sont conservés pour la traçabilité de la modération mais
                  n&apos;entrent jamais dans le calcul.
                </li>
                <li>Ne demandez jamais de nom, d&apos;adresse ou d&apos;e-mail aux élèves.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
              <h2 className="text-sm font-bold text-brand-900">Deux niveaux de lecture</h2>
              <div className="mt-3 flex flex-col gap-2">
                <Button asChild variant="outline" size="sm" className="justify-start bg-card">
                  <Link href={withCityQuery("/", city.insee)}>
                    <Activity />
                    Carte publique filtrée
                  </Link>
                </Button>
                <Button asChild size="sm" className="justify-start">
                  <Link href={withCityQuery("/admin/carte", city.insee)}>
                    <MapPinned />
                    Carte complète enseignante
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-[0.65rem] leading-relaxed text-brand-950/70">
                La vue complète conserve les mailles sous le seuil de trois signalements. Elle est
                protégée par la session enseignante.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
