import { getSupervisorsList } from "@/features/supervisor-shifts/queries";
import { SupervisorShiftsClient } from "@/components/dashboard/supervisor-shifts/supervisor-shifts-client";
import { getGlobalPermissions } from "@/features/permissions/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { notFound } from "next/navigation";

export default async function SupervisorShiftsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    notFound();
  }

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  const hasAccess = admin.profile.role === "system_owner" || globalPermissions.has("supervisor_shifts.view");
  
  if (!hasAccess) {
    notFound();
  }

  const data = await getSupervisorsList();

  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <SupervisorShiftsClient data={data} locale={locale} />
    </div>
  );
}
