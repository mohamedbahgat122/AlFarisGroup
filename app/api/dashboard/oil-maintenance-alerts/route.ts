import { NextResponse } from "next/server";
import { getOilMaintenanceAlertsForDashboard } from "@/features/app-requests/queries";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale } from "@/types/locale";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAuthenticatedAdmin({ resolveAvatar: false });

  if (admin.status !== "authorized") {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const organizationsResult = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );
  const organizations =
    organizationsResult.status === "success"
      ? organizationsResult.organizations
      : [];

  const requestedLocale = new URL(request.url).searchParams.get("locale");
  const locale = requestedLocale && isLocale(requestedLocale) ? requestedLocale : "ar";
  const alerts = await getOilMaintenanceAlertsForDashboard({
    supabase: admin.supabase,
    organizations,
    locale,
  });

  return NextResponse.json(alerts);
}
