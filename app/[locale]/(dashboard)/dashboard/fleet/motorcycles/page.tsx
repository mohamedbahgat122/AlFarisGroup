import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlobalFleetPage } from "@/app/[locale]/(dashboard)/dashboard/fleet/_global-fleet-page";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type FleetMotorcyclesRouteProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    archived?: string;
    archive?: string;
    search?: string;
    technical?: string;
    operational?: string;
    organization?: string;
    vehicleType?: string;
    ownership?: string;
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
  const { locale } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <GlobalFleetPage
      locale={locale}
      category="motorcycle"
      searchParams={query ?? {}}
    />
  );
}
