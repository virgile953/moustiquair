import { MapExperience } from "@/components/map/map-experience";

export const metadata = {
  title: "Carte d'activité",
  description:
    "Carte interactive de l'activité estimée du moustique tigre à Herblay-sur-Seine, à partir des signalements validés.",
};

interface HomePageProps {
  searchParams: Promise<{ signaler?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  return <MapExperience initialReportOpen={params.signaler === "1"} />;
}
