import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminLogin } from "@/components/admin/admin-login";
import { SiteFooter } from "@/components/site-footer";
import { getStats } from "@/lib/activity-service";
import { listSightings } from "@/lib/admin-data";
import { getServerSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace enseignant",
  description: "Modération des signalements Moustiq'Air.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const session = await getServerSession();

  if (!session) {
    return (
      <>
        <AdminLogin />
        <SiteFooter />
      </>
    );
  }

  const initialList = listSightings({ status: "pending", limit: 100 });
  const initialStats = getStats("30", true);

  return (
    <>
      <AdminDashboard
        initialList={initialList}
        initialStats={initialStats}
        sessionExpiresAt={session.expiresAt.toISOString()}
      />
      <SiteFooter />
    </>
  );
}
