import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FleetPage } from "@/app/[locale]/(dashboard)/dashboard/organizations/[organizationCode]/fleet/_fleet-page";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type FleetMotorcyclesRouteProps = {
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
}: FleetMotorcyclesRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.fleet;

  return {
    title: dictionary.motorcyclesMetadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function FleetMotorcyclesRoute({
  params,
  searchParams,
}: FleetMotorcyclesRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <FleetPage
      locale={locale}
      organizationCode={organizationCode}
      category="motorcycle"
      includeArchived={query?.archived === "true"}
    />
  );
}
