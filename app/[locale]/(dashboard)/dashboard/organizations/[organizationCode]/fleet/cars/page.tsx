import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FleetPage } from "@/app/[locale]/(dashboard)/dashboard/organizations/[organizationCode]/fleet/_fleet-page";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type FleetCarsRouteProps = {
  params: Promise<{
    locale: string;
    organizationCode: string;
  }>;
  searchParams?: Promise<{
    archived?: string;
  }>;
};

export async function generateMetadata({
  params,
}: FleetCarsRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.fleet;

  return {
    title: dictionary.carsMetadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function FleetCarsRoute({
  params,
  searchParams,
}: FleetCarsRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <FleetPage
      locale={locale}
      organizationCode={organizationCode}
      category="car"
      includeArchived={query?.archived === "true"}
    />
  );
}
