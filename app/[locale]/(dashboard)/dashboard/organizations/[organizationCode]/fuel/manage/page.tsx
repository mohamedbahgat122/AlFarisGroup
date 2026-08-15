import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { FuelManagementClient } from "@/components/dashboard/fuel/fuel-management-client";
import { getKafaratplusFuelManagementData } from "@/features/fuel/queries";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
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

  if (!organization.navigation.fuelManagement) {
    return <AccessDenied locale={locale} />;
  }

  const fuelDate = isDate(query?.date) ? query.date : getBusinessDateString();
  const dictionary = getDictionary(locale).dashboard.fuel;
  const data = await getKafaratplusFuelManagementData({
    organizationId: organization.id,
    fuelDate,
  });

  return (
    <FuelManagementClient
      locale={locale}
      dictionary={dictionary}
      organization={organization}
      rows={data.rows}
      fuelDate={fuelDate}
      integrationMessage={data.status === "success" ? undefined : data.message}
    />
  );
}

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
