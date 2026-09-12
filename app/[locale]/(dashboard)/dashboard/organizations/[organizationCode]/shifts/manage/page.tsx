import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import { ShiftManagementClient } from "@/components/dashboard/shifts/shift-management-client";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getShiftManagementData } from "@/features/shifts/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type RouteProps = {
  params: Promise<{ locale: string; organizationCode: string }>;
};

export async function generateMetadata({
  params,
}: RouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.shifts;

  return {
    title: dictionary.managementTitle,
    description: dictionary.managementMessage,
    robots: { index: false, follow: false },
  };
}

export default async function ShiftsManagementPage({ params }: RouteProps) {
  const { locale, organizationCode } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const access = await getOrganizationPageAccessByCode(organizationCode);

  if (access.status === "unauthenticated") {
    redirect(`/${locale}/login`);
  }

  if (access.status === "not_found") {
    notFound();
  }

  if (access.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  const organization = access.organization;

  if (!organization.navigation.shifts) {
    return <AccessDenied locale={locale} />;
  }

  const dictionary = getDictionary(locale).dashboard.shifts.management;
  const result = await getShiftManagementData({ organizationId: organization.id });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} />;
  }

  if (result.status === "load_error") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center shadow-sm">
          <h1 className="text-lg font-bold text-navy">{dictionary.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.loadError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <RealtimeRefresh
        channelName={`dashboard-shifts-templates-${organization.id}`}
        table="organization_shift_templates"
        filter={`organization_id=eq.${organization.id}`}
        toast={dictionary.description}
      />
      <RealtimeRefresh
        channelName={`dashboard-shifts-assignments-${organization.id}`}
        table="organization_shift_assignments"
        filter={`organization_id=eq.${organization.id}`}
        toast={dictionary.description}
      />
      <ShiftManagementClient
        locale={locale}
        organizationCode={organization.code}
        dictionary={dictionary}
        shifts={result.shifts}
        drivers={result.drivers}
        scheduledChanges={result.scheduledChanges}
        shiftChangeRequestDays={result.shiftChangeRequestDays}
        weeks={result.weeks}
        permissions={result.permissions}
      />
    </>
  );
}
