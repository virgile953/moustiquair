import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLogin } from "@/components/admin/admin-login";
import { SiteFooter } from "@/components/site-footer";
import { getStats } from "@/lib/activity-service";
import { listSightings } from "@/lib/admin-data";
import { getServerSession } from "@/lib/auth/server-session";
import { getSelectedCity } from "@/lib/city-selection";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace enseignant",
  description: "Modération des signalements Moustiq'Air, commune par commune.",
  robots: { index: false, follow: false },
};

interface AdminPageProps {
  searchParams: Promise<{ city?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const city = await getSelectedCity(params.city);
  const session = await getServerSession();

  if (!session) {
    return (
      <>
        <AdminLogin city={city} />
        <SiteFooter />
      </>
    );
  }

  const initialList = listSightings({ status: "pending", limit: 100, cityInsee: city.insee });
  const initialStats = getStats("30", true, city.insee);

  return (
    <>
      <AdminDashboard
        key={city.insee}
        city={city}
        initialList={initialList}
        initialStats={initialStats}
        sessionExpiresAt={session.expiresAt.toISOString()}
      />
      <SiteFooter />
    </>
  );
}
