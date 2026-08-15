import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { DriverReportsClient } from "@/components/dashboard/drivers/driver-reports-client";
import { getDriverReportsForOrganization } from "@/features/driver-reports/queries";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type DriversReportsRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams?: Promise<{
    date?: string;
  }>;
};

export async function generateMetadata({
  params,
}: DriversReportsRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.drivers;

  return {
    title: dictionary.reportsMetadataTitle,
    description: dictionary.reportsMetadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function DriversReportsRoute({
  params,
  searchParams,
}: DriversReportsRouteProps) {
  const { locale, organizationCode } = await params;
  const resolvedSearchParams = await searchParams;

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

  if (access.status === "forbidden") {
    return <AccessDenied locale={locale} />;
  }

  if (access.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  const organization = access.organization;

  if (!organization.navigation.driverReports) {
    return <AccessDenied locale={locale} />;
  }

  const dashboardDictionary = getDictionary(locale).dashboard;
  const driversDictionary = dashboardDictionary.drivers;
  const reports = await getDriverReportsForOrganization({
    organizationId: organization.id,
    selectedDate: resolvedSearchParams?.date,
  });

  if (reports.status !== "success") {
    if (reports.status === "unauthorized") {
      return <AccessDenied locale={locale} />;
    }

    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
          <h1 className="text-lg font-bold text-navy">
            {driversDictionary.loadErrorTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {driversDictionary.loadErrorDescription}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <DriverReportsClient
        locale={locale}
        dictionary={driversDictionary}
        organization={organization}
        report={reports.report}
        dates={reports.dates}
        selectedDateUnavailable={reports.selectedDateUnavailable}
        today={getBusinessDateString()}
      />
    </div>
  );
}
