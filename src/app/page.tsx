import { MapExperience } from "@/components/map/map-experience";
import { getSelectedCity } from "@/lib/city-selection";

export const metadata = {
  title: "Carte d'activité",
  description:
    "Carte interactive de l'activité estimée du moustique tigre dans les communes couvertes, à partir des signalements validés.",
};

interface HomePageProps {
  searchParams: Promise<{ signaler?: string; city?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const city = await getSelectedCity(params.city);

  return <MapExperience city={city} initialReportOpen={params.signaler === "1"} />;
}
