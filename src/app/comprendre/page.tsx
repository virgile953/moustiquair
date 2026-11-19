import {
  ArrowRight,
  ArrowUpRight,
  Bug,
  Calculator,
  CircleDashed,
  Droplets,
  Eye,
  FlaskConical,
  Grid3X3,
  Info,
  MapPinned,
  Microscope,
  Ruler,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { InfluenceExplorer } from "@/components/education/influence-explorer";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_CITY_INSEE, SUPPORTED_CITIES, withCityQuery } from "@/lib/cities";
import { GRID_SIZE_METERS, INFLUENCE_RADIUS_METERS } from "@/lib/config/model";

export const metadata: Metadata = {
  title: "Comprendre",
  description:
    "Le moustique tigre, la grille de 10 mètres, le rayon de 100 mètres et les limites scientifiques du modèle Moustiq'Air.",
};

const SOMMAIRE = [
  { href: "#moustique", label: "Le moustique tigre" },
  { href: "#distances", label: "10 m et 100 m" },
  { href: "#modele", label: "Notre modèle" },
  { href: "#limites", label: "Les limites" },
  { href: "#methode", label: "La méthode scientifique" },
];

const MODEL_STEPS = [
  {
    icon: MapPinned,
    title: "Enregistrer une position",
    text: "Un signalement est un point précis, saisi sur la carte. Ses coordonnées GPS sont converties en mètres dans le système Lambert-93, adapté à la France.",
  },
  {
    icon: CircleDashed,
    title: "Tracer une zone d'influence",
    text: "Autour du point, on dessine un cercle théorique de 100 mètres. C'est une hypothèse de travail, pas une barrière que les moustiques ne franchiraient jamais.",
  },
  {
    icon: Grid3X3,
    title: "Découper le territoire",
    text: "Chaque commune étudiée est découpée en carrés de 10 mètres sur 10. Ce quadrillage commun permet de comparer tous les quartiers avec la même unité.",
  },
  {
    icon: Ruler,
    title: "Calculer les distances",
    text: "Pour chaque carré proche, on mesure la distance entre son centre et le signalement. Plus le carré est loin, plus sa contribution diminue.",
  },
  {
    icon: Calculator,
    title: "Additionner les observations",
    text: "Quand plusieurs signalements validés se recoupent, leurs contributions s'additionnent. Deux observations au même endroit comptent davantage qu'une seule.",
  },
  {
    icon: Sparkles,
    title: "Colorer le résultat",
    text: "L'indice brut est transformé en intensité visuelle, puis en couleur. Cette étape sert uniquement à rendre la carte lisible : elle ne modifie pas le calcul scientifique.",
  },
];

const LIMITS = [
  "Un signalement n'est pas un recensement : voir un moustique ne dit rien du nombre total présent.",
  "L'absence de signalement ne prouve pas l'absence de moustiques. Elle peut simplement signifier que personne n'a observé ou signalé.",
  "Certains quartiers ont plus d'observateurs, plus de jardins ou plus de temps pour participer : cela peut augmenter leur score.",
  "L'identification de l'espèce repose sur la personne qui signale. Elle peut être erronée, même avec de la bonne volonté.",
  "Le rayon de 100 mètres est une simplification pédagogique. Les distances de vol varient selon le milieu, la saison et les femelles.",
  "La carte décrit une activité d'observation relative. Ce n'est ni une densité mesurée, ni une carte de risque sanitaire.",
];

const METHOD = [
  {
    number: "01",
    title: "Observation",
    text: "Je vois un moustique, je note où et quand. C'est une donnée brute, personnelle et forcément incomplète.",
  },
  {
    number: "02",
    title: "Hypothèse",
    text: "Je suppose qu'autour d'un lieu où des moustiques sont vus, l'activité est plus probable qu'à 500 mètres.",
  },
  {
    number: "03",
    title: "Modèle mathématique",
    text: "Je traduis cette hypothèse par une règle de distance, un rayon et une somme. Le modèle est simplifié mais explicite.",
  },
  {
    number: "04",
    title: "Visualisation",
    text: "Je transforme les nombres en couleur et en formes pour rendre les motifs géographiques visibles.",
  },
  {
    number: "05",
    title: "Interprétation",
    text: "Je compare, je discute les biais et je reste prudent. La carte aide à poser des questions ; elle ne les clôt pas.",
  },
];

export default function ComprendrePage() {
  return (
    <>
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/70">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(circle at 82% 18%, rgba(217,75,56,0.13), transparent 34%), radial-gradient(circle at 10% 90%, rgba(201,162,39,0.10), transparent 28%)",
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 md:py-20 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16 lg:px-8">
            <div>
              <Badge variant="soft" className="mb-5">
                <Microscope className="size-3" aria-hidden="true" />
                Ressources pédagogiques · classe de troisième
              </Badge>
              <h1 className="max-w-2xl text-balance text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl lg:text-[3.7rem] lg:leading-[1.03]">
                Comprendre le moustique tigre,
                <span className="font-display font-normal italic text-primary">
                  {" "}
                  sans exagérer ce que la carte raconte.
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Moustiq&apos;Air transforme des observations citoyennes en une carte d&apos;activité
                relative, commune par commune dans le Val-d&apos;Oise. Voici les hypothèses, les
                calculs et les limites qui se cachent derrière chaque carré rouge.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/">
                    Explorer la carte
                    <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/?signaler=1">Signaler une observation</Link>
                </Button>
              </div>
            </div>

            <aside className="self-end rounded-3xl border border-border bg-card p-5 shadow-[0_30px_80px_-58px_rgba(33,29,25,0.65)] sm:p-6">
              <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                Les trois repères du modèle
              </p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                <div className="border-b border-border/70 pb-3 lg:flex lg:items-baseline lg:justify-between lg:gap-4">
                  <dt className="text-sm font-semibold">Maille scientifique</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold tabular-nums lg:mt-0">
                    {GRID_SIZE_METERS} m
                  </dd>
                </div>
                <div className="border-b border-border/70 pb-3 lg:flex lg:items-baseline lg:justify-between lg:gap-4">
                  <dt className="text-sm font-semibold">Rayon d&apos;influence</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold tabular-nums lg:mt-0">
                    {INFLUENCE_RADIUS_METERS} m
                  </dd>
                </div>
                <div className="lg:flex lg:items-baseline lg:justify-between lg:gap-4">
                  <dt className="text-sm font-semibold">Fenêtre par défaut</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold tabular-nums lg:mt-0">30 jours</dd>
                </div>
              </dl>
              <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                Ces valeurs sont des hypothèses explicites, rassemblées dans un seul fichier de
                configuration du projet.
              </p>
            </aside>
          </div>
        </section>

        {/* Communes couvertes */}
        <section
          aria-labelledby="communes-couvertes"
          className="border-b border-border/70 bg-card/40"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                  Périmètre du projet
                </p>
                <h2 id="communes-couvertes" className="mt-1 text-xl font-extrabold tracking-tight">
                  {SUPPORTED_CITIES.length} communes du Val-d&apos;Oise
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Chaque commune possède sa propre limite officielle, sa carte et ses statistiques.
                  Utilisez le sélecteur de commune dans l&apos;en-tête pour passer de l&apos;une à
                  l&apos;autre : les signalements, les zones actives et les chiffres ne sont jamais
                  mélangés.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={withCityQuery("/", DEFAULT_CITY_INSEE)}>
                  Explorer la carte
                  <ArrowRight />
                </Link>
              </Button>
            </div>
            <ul className="mt-5 flex flex-wrap gap-2">
              {SUPPORTED_CITIES.map((city) => (
                <li key={city.insee}>
                  <Link
                    href={withCityQuery("/", city.insee)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                  >
                    <MapPinned className="size-3.5 text-primary" aria-hidden="true" />
                    {city.name}
                    <span className="font-normal text-muted-foreground">{city.insee}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Sommaire */}
        <nav aria-label="Sommaire de la page" className="border-b border-border/70 bg-card/55">
          <div className="no-scrollbar mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-5 py-3 lg:px-8">
            {SOMMAIRE.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-800"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="mx-auto w-full max-w-6xl px-5 py-14 lg:px-8 lg:py-20">
          {/* Le moustique */}
          <section id="moustique" className="scroll-mt-24">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                  01 · Le vivant
                </p>
                <h2 className="mt-2 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
                  Un petit moustique, des enjeux bien réels
                </h2>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                  <em>Aedes albopictus</em>, le moustique tigre, est reconnaissable à ses pattes et
                  à son abdomen zébrés de blanc. Il est plus petit que la plupart des moustiques
                  communs et pique souvent le jour, surtout tôt le matin et en fin
                  d&apos;après-midi.
                </p>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                  La femelle pond dans de très petites quantités d&apos;eau stagnante : soucoupe de
                  pot de fleurs, gouttière bouchée, jouet oublié, seau, récupérateur d&apos;eau.
                  Supprimer ces réservoirs est le geste le plus efficace pour réduire sa présence.
                </p>
                <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
                  <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-950">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      Moustiq&apos;Air ne remplace pas un avis médical ou sanitaire. En cas de
                      piqûre inhabituelle ou de question de santé, parlez-en à un adulte et
                      consultez les recommandations officielles.
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: Eye,
                    title: "Reconnaître",
                    text: "Corps noir, rayures blanches nettes sur les pattes et l'abdomen. Une seule paire d'ailes visible.",
                  },
                  {
                    icon: Droplets,
                    title: "Repérer les gîtes",
                    text: "Tout récipient qui garde un peu d'eau plus de quelques jours peut devenir un lieu de ponte.",
                  },
                  {
                    icon: Bug,
                    title: "Observer sans capture",
                    text: "Pour la carte, une observation visuelle suffit. Pas besoin de capturer ni de tuer le moustique.",
                  },
                  {
                    icon: MapPinned,
                    title: "Localiser",
                    text: "On note le lieu de l'observation, pas le domicile de la personne qui signale.",
                  },
                ].map((item) => (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-primary">
                      <item.icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-sm font-bold">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.text}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Distances */}
          <section id="distances" className="mt-20 scroll-mt-24 border-t border-border/70 pt-14">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                02 · Les échelles
              </p>
              <h2 className="mt-2 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
                Pourquoi 10 mètres et 100 mètres ?
              </h2>
            </div>

            <div className="mt-7 grid gap-5 lg:grid-cols-2">
              <article className="rounded-3xl border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    <Grid3X3 className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-extrabold tracking-tight">Des carrés de 10 m</h3>
                </div>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Pour analyser un territoire, on le découpe en unités de même taille. Un carré de
                  10 mètres correspond environ à une petite place de parking ou à une terrasse.
                  C&apos;est assez fin pour distinguer deux rues, et assez grand pour garder un
                  nombre de cellules raisonnable.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  Chaque carré possède un identifiant stable, calculé à partir de ses coordonnées en
                  mètres. Le même carré garde donc le même nom d&apos;un rechargement de page à
                  l&apos;autre.
                </p>
                <p className="mt-4 rounded-xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground">
                  À l&apos;écran, un carré de 100 m suffit quand la carte est dézoomée. Le calcul
                  scientifique reste pourtant toujours réalisé sur la grille de 10 m.
                </p>
              </article>

              <article className="rounded-3xl border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    <CircleDashed className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-extrabold tracking-tight">Un rayon de 100 m</h3>
                </div>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Le moustique tigre ne voyage pas comme un oiseau. Il reste souvent près de son
                  lieu de naissance, mais il peut se déplacer de plusieurs dizaines ou centaines de
                  mètres, porté par le vent, une voiture ou un objet.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  100 mètres est donc une{" "}
                  <strong className="font-semibold text-foreground">hypothèse simplifiée</strong>,
                  choisie pour être facile à comprendre et à représenter. Ce n&apos;est ni une
                  distance maximale garantie, ni une constante biologique universelle.
                </p>
                <p className="mt-4 rounded-xl bg-muted/70 p-3 text-xs leading-relaxed text-muted-foreground">
                  Une observation influence donc environ 300 carrés de 10 m. Pour éviter de tout
                  recalculer, le programme ne parcourt que les carrés situés dans ce rayon.
                </p>
              </article>
            </div>
          </section>

          {/* Modèle */}
          <section id="modele" className="mt-20 scroll-mt-24 border-t border-border/70 pt-14">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                03 · Le calcul
              </p>
              <h2 className="mt-2 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
                Comment fonctionne notre modèle ?
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Six étapes suffisent. Chacune est réalisée dans un fichier TypeScript différent,
                pour que l&apos;on puisse vérifier et tester les calculs séparément.
              </p>
            </div>

            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MODEL_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="relative rounded-2xl border border-border bg-card p-5"
                >
                  <span className="absolute top-4 right-4 text-3xl font-extrabold tracking-tight text-border/90 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-primary">
                    <step.icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 pr-8 text-sm font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <h3 className="text-xl font-extrabold tracking-tight">
                  La formule, en langage humain
                </h3>
                <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/65 p-5">
                  <p className="font-mono text-lg font-bold text-brand-900">
                    poids(d) = max(0, 1 − d / 100)²
                  </p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-10 shrink-0 font-bold text-brand-900">d</dt>
                      <dd className="text-muted-foreground">
                        distance entre le signalement et le centre du carré, en mètres.
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-10 shrink-0 font-bold text-brand-900">100</dt>
                      <dd className="text-muted-foreground">
                        rayon d&apos;influence. Au-delà, le poids vaut zéro.
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-10 shrink-0 font-bold text-brand-900">²</dt>
                      <dd className="text-muted-foreground">
                        le carré accentue la proximité : le poids chute vite quand on
                        s&apos;éloigne.
                      </dd>
                    </div>
                  </dl>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Exemple : à 25 m, le poids vaut 0,5625 ; à 50 m, 0,25 ; à 75 m, 0,0625. À 100 m,
                  il vaut exactement zéro. Ces valeurs sont vérifiées par des tests automatiques.
                </p>
              </div>
              <InfluenceExplorer />
            </div>
          </section>

          {/* Limites */}
          <section id="limites" className="mt-20 scroll-mt-24 border-t border-border/70 pt-14">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                  04 · L&apos;honnêteté scientifique
                </p>
                <h2 className="mt-2 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
                  Ce que la carte ne dit pas
                </h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Une visualisation peut impressionner. C&apos;est justement pour cela qu&apos;il
                  faut écrire noir sur blanc ce qu&apos;elle ne mesure pas.
                </p>
                <div className="mt-5 rounded-2xl border border-border bg-muted/55 p-4 text-sm leading-relaxed text-muted-foreground">
                  <Target className="mb-2 size-4 text-primary" aria-hidden="true" />
                  La carte décrit une{" "}
                  <strong className="font-semibold text-foreground">
                    activité d&apos;observation relative
                  </strong>
                  . Elle dépend autant des moustiques que du nombre de personnes qui ont regardé et
                  signalé.
                </div>
              </div>
              <ul className="space-y-3">
                {LIMITS.map((limit) => (
                  <li
                    key={limit}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm leading-relaxed"
                  >
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{limit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Méthode */}
          <section id="methode" className="mt-20 scroll-mt-24 border-t border-border/70 pt-14">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-bold tracking-[0.14em] text-primary uppercase">
                05 · La démarche
              </p>
              <h2 className="mt-2 text-balance text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
                De l&apos;observation à l&apos;interprétation
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Un projet scientifique ne consiste pas à affirmer une réponse, mais à construire une
                chaîne de raisonnement que l&apos;on peut discuter.
              </p>
            </div>

            <ol className="mt-8 grid gap-3 md:grid-cols-5">
              {METHOD.map((step) => (
                <li key={step.number} className="rounded-2xl border border-border bg-card p-4">
                  <p className="font-display text-2xl italic text-primary">{step.number}</p>
                  <h3 className="mt-1 text-sm font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-8 rounded-3xl border border-brand-100 bg-brand-50/55 p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="max-w-xl">
                  <p className="flex items-center gap-2 text-sm font-bold text-brand-900">
                    <FlaskConical className="size-4" aria-hidden="true" />À faire en classe
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-brand-950/80">
                    Choisissez une zone de la carte, comparez deux périodes et formulez trois
                    hypothèses possibles pour expliquer une différence. Cherchez ensuite un biais
                    d&apos;observation qui pourrait produire le même résultat sans changement réel
                    du nombre de moustiques.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/statistiques">
                    Voir les statistiques
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Ressources */}
          <section className="mt-16 border-t border-border/70 pt-10">
            <h2 className="text-lg font-extrabold tracking-tight">Pour aller plus loin</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Des ressources officielles, en dehors de Moustiq&apos;Air.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                {
                  href: "https://www.santepubliquefrance.fr/",
                  title: "Santé publique France",
                  text: "Surveillance et recommandations nationales.",
                },
                {
                  href: "https://www.iledefrance.ars.sante.fr/",
                  title: "ARS Île-de-France",
                  text: "Actions régionales de lutte contre le moustique tigre.",
                },
                {
                  href: "https://www.moustiquetigre.org/",
                  title: "Info moustique tigre",
                  text: "Gestes de prévention et signalement officiel.",
                },
              ].map((resource) => (
                <a
                  key={resource.href}
                  href={resource.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <span className="flex items-center justify-between gap-3 text-sm font-bold">
                    {resource.title}
                    <ArrowUpRight className="size-4 text-primary" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {resource.text}
                  </span>
                </a>
              ))}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
