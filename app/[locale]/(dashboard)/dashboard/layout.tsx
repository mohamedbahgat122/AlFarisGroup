import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getOilMaintenanceAlertsForDashboard } from "@/features/app-requests/queries";
import { getSystemExpiryAlertsForDashboard } from "@/features/expiry-alerts/queries";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import { getAppNotificationsForCurrentUser } from "@/features/notifications/queries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getGlobalPermissions } from "@/features/permissions/server";
import { getAuthorizationRevision } from "@/features/permissions/revision";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

export const dynamic = "force-dynamic";

type DashboardLayoutProps = {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    if (admin.status !== "unauthenticated") {
      await admin.supabase.auth.signOut();
    }

    redirect(`/${locale}/login`);
  }

  const organizationsResult = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );
  const organizations =
    organizationsResult.status === "success"
      ? organizationsResult.organizations
      : [];
  const appNotifications = await getAppNotificationsForCurrentUser({
    supabase: admin.supabase,
    organizations,
    recipientUserId: admin.profile.id,
  });
  const systemExpiryAlerts = await getSystemExpiryAlertsForDashboard({
    supabase: admin.supabase,
    profile: admin.profile,
    organizations,
    locale,
  });
  const oilMaintenanceAlerts = await getOilMaintenanceAlertsForDashboard({
    supabase: admin.supabase,
    organizations,
    locale,
  });
  const authorizationRevision =
    (await getAuthorizationRevision(admin.supabase, admin.profile.id)) ?? "";

  return (
    <DashboardShell
      locale={locale}
      dictionary={getDictionary(locale)}
      user={{
        id: admin.profile.id,
        fullName: admin.profile.full_name,
        email: admin.user.email ?? "",
        avatarUrl: admin.avatarUrl,
        jobTitle: admin.profile.job_title,
        role: admin.profile.role,
        homeOrganizationId: admin.profile.home_organization_id,
        hasGlobalFleetPermission: admin.profile.role === "system_owner" || (await getGlobalPermissions(admin.supabase, admin.profile)).has("fleet.view"),
        hasGlobalHousingPermission: admin.profile.role === "system_owner" || (await getGlobalPermissions(admin.supabase, admin.profile)).has("housing.view"),
        hasGlobalSupervisorShiftsPermission: admin.profile.role === "system_owner" || (await getGlobalPermissions(admin.supabase, admin.profile)).has("supervisor_shifts.view" as any),
      }}
      authorizationRevision={authorizationRevision}
      organizations={organizations}
      appNotifications={appNotifications}
      systemExpiryAlerts={systemExpiryAlerts}
      oilMaintenanceAlerts={oilMaintenanceAlerts}
    >
      {children}
    </DashboardShell>
  );
}
