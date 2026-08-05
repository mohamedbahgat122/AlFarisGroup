import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import {
  getAppNotificationsForCurrentUser,
} from "@/features/notifications/queries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
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

  return (
    <DashboardShell
      locale={locale}
      dictionary={getDictionary(locale)}
      user={{
        id: admin.profile.id,
        fullName: admin.profile.full_name,
        jobTitle: admin.profile.job_title,
        role: admin.profile.role,
      }}
      organizations={organizations}
      appNotifications={appNotifications}
    >
      {children}
    </DashboardShell>
  );
}
