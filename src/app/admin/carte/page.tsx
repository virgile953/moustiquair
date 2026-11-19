import { ArrowLeft, EyeOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MapExperience } from "@/components/map/map-experience";
import { getServerSession } from "@/lib/auth/server-session";
import { withCityQuery } from "@/lib/cities";
import { getSelectedCity } from "@/lib/city-selection";
import { isInsideBoundary } from "@/lib/geo/boundary";
import { getCityBoundaryGeometry } from "@/lib/geo/city-boundaries";
import type { LonLat } from "@/lib/geo/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Carte enseignante",
  robots: { index: false, follow: false },
};

interface AdminMapPageProps {
  searchParams: Promise<{ lat?: string; lon?: string; city?: string }>;
}

export default async function AdminMapPage({ searchParams }: AdminMapPageProps) {
  const params = await searchParams;
  const city = await getSelectedCity(params.city);

  const session = await getServerSession();
  if (!session) redirect(withCityQuery("/admin", city.insee));

  const latitude = Number(params.lat);
  const longitude = Number(params.lon);
  const boundary = getCityBoundaryGeometry(city.insee);
  const focus: LonLat | null =
    boundary && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? isInsideBoundary(longitude, latitude, boundary)
        ? { longitude, latitude }
        : null
      : null;

  return (
    <div className="relative">
      <MapExperience city={city} teacher initialFocus={focus} showReportAction={false} />

      <div className="pointer-events-none absolute bottom-5 left-4 z-50 flex flex-wrap items-center gap-2">
        <Link
          href={withCityQuery("/admin", city.insee)}
          className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card/95 px-4 text-xs font-semibold shadow-sm backdrop-blur transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour à l&apos;administration
        </Link>
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50/95 px-3 py-2 text-[0.65rem] font-semibold text-brand-900 shadow-sm backdrop-blur">
          {city.name} · {city.insee}
        </span>
        <span className="pointer-events-auto hidden items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50/95 px-3 py-2 text-[0.65rem] font-semibold text-brand-900 shadow-sm backdrop-blur sm:inline-flex">
          <EyeOff className="size-3.5" aria-hidden="true" />
          {focus
            ? "Position privée du signalement · non publiable"
            : "Vue complète · ne pas projeter en classe"}
        </span>
      </div>
    </div>
  );
}
