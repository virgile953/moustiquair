import { ArrowUpRight, LockKeyhole, MapPin } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SUPPORTED_CITIES, withCityQuery } from "@/lib/cities";
import { getSelectedCity } from "@/lib/city-selection";

export async function SiteFooter() {
  const city = await getSelectedCity();
  const mapHref = withCityQuery("/", city.insee);
  const statsHref = withCityQuery("/statistiques", city.insee);
  const reportHref = withCityQuery("/?signaler=1", city.insee);

  return (
    <footer className="border-t border-border/80 bg-card/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <BrandMark className="size-9 rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">
              Moustiq<span className="text-primary">&apos;</span>Air
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Un projet de science participative pour observer, comprendre et cartographier
            l&apos;activité du moustique tigre dans plusieurs communes du Val-d&apos;Oise.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="size-3.5 text-primary" aria-hidden="true" />
            Commune sélectionnée : {city.name} · {city.department} · INSEE {city.insee}
          </p>
          <p className="mt-2 text-[0.68rem] leading-relaxed text-muted-foreground">
            {SUPPORTED_CITIES.length} communes couvertes :{" "}
            {SUPPORTED_CITIES.map((item) => item.name).join(", ")}.
          </p>
        </div>

        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Explorer
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="font-medium hover:text-primary" href={mapHref}>
                Carte de l&apos;activité
              </Link>
            </li>
            <li>
              <Link className="font-medium hover:text-primary" href="/comprendre">
                Comprendre le modèle
              </Link>
            </li>
            <li>
              <Link className="font-medium hover:text-primary" href={statsHref}>
                Statistiques · {city.name}
              </Link>
            </li>
            <li>
              <Link className="font-medium hover:text-primary" href={reportHref}>
                Signaler un moustique
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
            Projet
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link
                className="inline-flex items-center gap-1 font-medium hover:text-primary"
                href={withCityQuery("/admin", city.insee)}
              >
                <LockKeyhole className="size-3.5" aria-hidden="true" />
                Espace enseignant
              </Link>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-1 font-medium hover:text-primary"
                href="https://www.santepubliquefrance.fr/"
                target="_blank"
                rel="noreferrer"
              >
                Santé publique France
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-1 font-medium hover:text-primary"
                href="https://www.iledefrance.ars.sante.fr/"
                target="_blank"
                rel="noreferrer"
              >
                ARS Île-de-France
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>
            Projet pédagogique · Les indices affichés ne sont pas des mesures de population ni un
            avis sanitaire.
          </p>
          <p>Données cartographiques © OpenStreetMap · OpenFreeMap</p>
        </div>
      </div>
    </footer>
  );
}
