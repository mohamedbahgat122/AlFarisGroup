import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FuelManagementClient } from "@/components/dashboard/fuel/fuel-management-client";
import { getFuelManagementData } from "@/features/fuel/queries";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type FuelManagementRouteProps = {
  params: Promise<{ locale: string; organizationCode: string }>;
  searchParams?: Promise<{ date?: string }>;
};

export async function generateMetadata({
  params,
}: FuelManagementRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.fuel;

  return {
    title: dictionary.managementTitle,
    description: dictionary.managementDescription,
    robots: { index: false, follow: false },
  };
}

export default async function FuelManagementRoute({
  params,
  searchParams,
}: FuelManagementRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization || !organization.navigation.fuelManagement) {
    notFound();
  }

  const fuelDate = isDate(query?.date) ? query.date : getBusinessDateString();
  const dictionary = getDictionary(locale).dashboard.fuel;
  const data = await getFuelManagementData({
    organizationId: organization.id,
    fuelDate,
  });

  if (data.status !== "success") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="border border-border bg-surface px-6 py-10 text-center">
          <h1 className="text-lg font-bold text-navy">
            {dictionary.errors.load_failed}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <FuelManagementClient
      locale={locale}
      dictionary={dictionary}
      organization={organization}
      rows={data.rows}
      fuelDate={fuelDate}
    />
  );
}

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
