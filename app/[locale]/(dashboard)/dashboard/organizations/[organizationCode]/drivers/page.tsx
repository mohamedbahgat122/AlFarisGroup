import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DriversManagementClient } from "@/components/dashboard/drivers/drivers-management-client";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getDriversForOrganization } from "@/features/drivers/queries";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type DriversRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams?: Promise<{
    driver?: string;
  }>;
};

export async function generateMetadata({
  params,
}: DriversRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.drivers;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function DriversRoute({
  params,
  searchParams,
}: DriversRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization) {
    notFound();
  }

  if (!organization.navigation.drivers) {
    notFound();
  }

  const dictionary = getDictionary(locale).dashboard.drivers;
  const driversResult = await getDriversForOrganization(
    organization.id,
    organization.name,
  );

  if (driversResult.status === "unauthorized") {
    redirect(`/${locale}/login`);
  }

  if (driversResult.status === "load_error") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
          <h1 className="text-lg font-bold text-navy">
            {dictionary.loadErrorTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.loadErrorDescription}
          </p>
        </div>
      </div>
    );
  }

  return (
    <DriversManagementClient
      locale={locale}
      dictionary={dictionary}
      organization={organization}
      drivers={driversResult.drivers}
      today={getBusinessDateString()}
      initialDriverId={query?.driver ?? null}
    />
  );
}
