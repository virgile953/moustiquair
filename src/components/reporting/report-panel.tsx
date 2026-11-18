"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Crosshair,
  Loader2,
  LocateFixed,
  MapPin,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_NOTES_LENGTH,
  MOSQUITO_COUNT_OPTIONS,
  type MosquitoCount,
  REPORTER_CONFIDENCE_OPTIONS,
  type ReporterConfidence,
} from "@/lib/config/model";
import { type BoundaryGeometry, isInsideBoundary } from "@/lib/geo/boundary";
import type { LonLat } from "@/lib/geo/types";
import { parisDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";

interface ReportPanelProps {
  open: boolean;
  /** Kept mounted but visually hidden while the user picks a point on the map. */
  hidden: boolean;
  location: LonLat | null;
  boundaryGeometry: BoundaryGeometry | null;
  onClose: () => void;
  onLocationChange: (position: LonLat) => void;
  onRequestMapSelection: () => void;
}

interface FieldErrors {
  [field: string]: string[];
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(5).replace(".", ",")}° ${direction}`;
}

export function ReportPanel({
  open,
  hidden,
  location,
  boundaryGeometry,
  onClose,
  onLocationChange,
  onRequestMapSelection,
}: ReportPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [observedOn, setObservedOn] = useState(() => parisDateKey());
  const [mosquitoCount, setMosquitoCount] = useState<MosquitoCount>("1");
  const [confidence, setConfidence] = useState<ReporterConfidence>("likely");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const today = parisDateKey();
  const insideBoundary =
    location && boundaryGeometry
      ? isInsideBoundary(location.longitude, location.latitude, boundaryGeometry)
      : null;

  // Close with Escape and prevent the page behind the dialog from scrolling.
  useEffect(() => {
    if (!open || hidden) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, hidden, onClose]);

  if (!open) return null;

  const handleUseDeviceLocation = () => {
    setGeolocationError(null);
    if (!navigator.geolocation) {
      setGeolocationError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocationChange({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
        });
      },
      () => {
        setLocating(false);
        setGeolocationError(
          "Impossible d'obtenir votre position. Vous pouvez choisir un point sur la carte.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors: FieldErrors = {};
    if (!location) {
      nextErrors.location = ["Choisissez un point sur la carte."];
    } else if (insideBoundary === false) {
      nextErrors.location = ["Le point doit se trouver à Herblay-sur-Seine."];
    }
    if (!observedOn) {
      nextErrors.observedOn = ["La date est requise."];
    } else if (observedOn > today) {
      nextErrors.observedOn = ["La date ne peut pas être future."];
    }
    if (!confirmation) {
      nextErrors.confirmation = ["Merci de confirmer que cette observation est réelle."];
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/sightings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          longitude: location?.longitude,
          latitude: location?.latitude,
          observedOn,
          mosquitoCount,
          reporterConfidence: confidence,
          notes,
          confirmation,
          website,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: Record<string, string[]> };
      } | null;

      if (!response.ok) {
        if (body?.error?.details) setErrors(body.error.details);
        setSubmitError(body?.error?.message ?? "Le signalement n'a pas pu être envoyé.");
        return;
      }

      setSuccess(true);
    } catch {
      setSubmitError("Le serveur est injoignable. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-end justify-center sm:items-stretch sm:justify-end",
        hidden && "hidden",
      )}
    >
      <button
        type="button"
        aria-label="Fermer le formulaire"
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.6rem] border border-border bg-card shadow-[0_35px_90px_-30px_rgba(33,29,25,0.6)] outline-none animate-in slide-in-from-bottom duration-300 sm:h-full sm:max-h-none sm:w-[470px] sm:rounded-none sm:border-y-0 sm:border-r-0 sm:slide-in-from-right"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/80 px-5 py-4">
          <div>
            <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
              Observation citoyenne
            </p>
            <h2 id="report-title" className="mt-1 text-xl font-extrabold tracking-tight">
              {success ? "Signalement envoyé" : "Signaler un moustique"}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
            <X />
          </Button>
        </div>

        {success ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 py-12 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Merci pour votre contribution !</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Votre signalement est bien enregistré. Il est actuellement{" "}
                <strong className="font-semibold text-foreground">en attente de modération</strong>{" "}
                et n&apos;apparaîtra sur la carte qu&apos;après validation par un enseignant.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-left text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-emerald-700" />
              Aucune information personnelle n&apos;est demandée ni publiée.
            </div>
            <Button className="mt-2" onClick={onClose}>
              Fermer
            </Button>
          </div>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <div className="no-scrollbar flex-1 space-y-7 overflow-y-auto px-5 py-5">
              <section aria-labelledby="location-title">
                <div className="mb-2 flex items-center justify-between">
                  <h3 id="location-title" className="text-sm font-bold">
                    1. Localisation
                  </h3>
                  <Badge variant="outline">obligatoire</Badge>
                </div>

                <div
                  className={cn(
                    "rounded-2xl border p-4",
                    errors.location
                      ? "border-red-200 bg-red-50/60"
                      : location
                        ? insideBoundary === false
                          ? "border-red-200 bg-red-50/60"
                          : "border-emerald-200 bg-emerald-50/60"
                        : "border-border bg-muted/60",
                  )}
                >
                  {location ? (
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                          insideBoundary === false
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700",
                        )}
                      >
                        {insideBoundary === false ? (
                          <MapPin className="size-4" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {insideBoundary === false
                            ? "Point hors de la commune"
                            : "Point sélectionné"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatCoordinate(location.latitude, "N", "S")} ·{" "}
                          {formatCoordinate(location.longitude, "E", "O")}
                        </p>
                        {insideBoundary === false ? (
                          <p className="mt-1.5 text-xs font-medium text-red-700">
                            Replacez le marqueur à l&apos;intérieur d&apos;Herblay-sur-Seine.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary">
                        <Crosshair className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Aucun point choisi</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          Placez le point le plus précisément possible, sans indiquer
                          d&apos;adresse.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={location ? "outline" : "default"}
                      onClick={onRequestMapSelection}
                    >
                      <Crosshair />
                      {location ? "Déplacer le point" : "Choisir sur la carte"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleUseDeviceLocation}
                      disabled={locating}
                    >
                      {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
                      Ma position
                    </Button>
                  </div>

                  {geolocationError ? (
                    <p role="alert" className="mt-2 text-xs font-medium text-red-700">
                      {geolocationError}
                    </p>
                  ) : null}
                  {errors.location ? (
                    <p role="alert" className="mt-2 text-xs font-medium text-red-700">
                      {errors.location[0]}
                    </p>
                  ) : null}
                </div>
              </section>

              <section aria-labelledby="date-title">
                <h3 id="date-title" className="mb-2 text-sm font-bold">
                  2. Date de l&apos;observation
                </h3>
                <Input
                  id="observed-on"
                  name="observedOn"
                  type="date"
                  value={observedOn}
                  max={today}
                  onChange={(event) => setObservedOn(event.target.value)}
                  aria-invalid={Boolean(errors.observedOn)}
                  aria-describedby={errors.observedOn ? "date-error" : undefined}
                />
                {errors.observedOn ? (
                  <p
                    id="date-error"
                    role="alert"
                    className="mt-1.5 text-xs font-medium text-red-700"
                  >
                    {errors.observedOn[0]}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Aujourd&apos;hui par défaut. Les dates futures sont refusées.
                  </p>
                )}
              </section>

              <section aria-labelledby="count-title">
                <h3 id="count-title" className="mb-2 text-sm font-bold">
                  3. Nombre de moustiques observés
                </h3>
                <RadioGroup
                  value={mosquitoCount}
                  onValueChange={(value) => setMosquitoCount(value as MosquitoCount)}
                  className="grid grid-cols-2 gap-2"
                >
                  {MOSQUITO_COUNT_OPTIONS.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`count-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                        mosquitoCount === option.value
                          ? "border-brand-300 bg-brand-50 text-brand-800"
                          : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <RadioGroupItem id={`count-${option.value}`} value={option.value} />
                      {option.label}
                    </Label>
                  ))}
                </RadioGroup>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Une estimation suffit : ce nombre ne modifie pas le poids du signalement.
                </p>
              </section>

              <section aria-labelledby="confidence-title">
                <h3 id="confidence-title" className="mb-2 text-sm font-bold">
                  4. Votre identification
                </h3>
                <RadioGroup
                  value={confidence}
                  onValueChange={(value) => setConfidence(value as ReporterConfidence)}
                  className="gap-2"
                >
                  {REPORTER_CONFIDENCE_OPTIONS.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`confidence-${option.value}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-3 text-sm leading-snug transition-colors",
                        confidence === option.value
                          ? "border-brand-300 bg-brand-50 text-brand-800"
                          : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <RadioGroupItem
                        id={`confidence-${option.value}`}
                        value={option.value}
                        className="mt-0.5"
                      />
                      {option.label}
                    </Label>
                  ))}
                </RadioGroup>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Ces deux choix décrivent votre propre niveau de certitude. Ils ne remplacent pas
                  une validation scientifique.
                </p>
              </section>

              <section aria-labelledby="notes-title">
                <div className="mb-2 flex items-center justify-between">
                  <h3 id="notes-title" className="text-sm font-bold">
                    5. Notes <span className="font-medium text-muted-foreground">(facultatif)</span>
                  </h3>
                  <span className="text-[0.7rem] tabular-nums text-muted-foreground">
                    {notes.length}/{MAX_NOTES_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value.slice(0, MAX_NOTES_LENGTH))}
                  placeholder="Ex. : vu près du pot de fleurs, en fin de journée…"
                  rows={3}
                  maxLength={MAX_NOTES_LENGTH}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  N&apos;écrivez pas votre nom, votre adresse ou vos coordonnées.
                </p>
              </section>

              {/* Honeypot: hidden from humans, tempting for naive bots. */}
              <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                <Label htmlFor="website">Site web</Label>
                <Input
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>

              <section>
                <Label
                  htmlFor="confirmation"
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm leading-relaxed",
                    errors.confirmation
                      ? "border-red-200 bg-red-50/60"
                      : "border-border bg-muted/40",
                  )}
                >
                  <Checkbox
                    id="confirmation"
                    checked={confirmation}
                    onCheckedChange={(value) => setConfirmation(value === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Je confirme que cette observation est réelle et que je n&apos;ai pas saisi de
                    données personnelles.
                  </span>
                </Label>
                {errors.confirmation ? (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                    {errors.confirmation[0]}
                  </p>
                ) : null}
              </section>
            </div>

            <div className="border-t border-border/80 bg-card px-5 py-4">
              {submitError ? (
                <div
                  role="alert"
                  className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-800"
                >
                  {submitError}
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <Button type="submit" size="lg" className="flex-1" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  Envoyer le signalement
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Annuler"
                  onClick={onClose}
                >
                  <ArrowLeft />
                </Button>
              </div>
              <p className="mt-2 text-center text-[0.68rem] leading-relaxed text-muted-foreground">
                Publication après validation par un enseignant. Aucun compte requis.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
