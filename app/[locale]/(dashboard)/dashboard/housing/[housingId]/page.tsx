import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { HousingDetailsClient } from "@/components/dashboard/housing/global-housing-client";
import { getHousingDetails } from "@/features/housing/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type HousingDetailsRouteProps = {
  params: Promise<{ locale: string; housingId: string }>;
};

export async function generateMetadata({
  params,
}: HousingDetailsRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.housing;

  return {
    title: dictionary.detailsTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function HousingDetailsRoute({
  params,
}: HousingDetailsRouteProps) {
  const { locale, housingId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const result = await getHousingDetails(housingId);

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} showOrganizationsLink={false} />;
  }

  if (result.status === "not_found") {
    notFound();
  }

  const dictionary = getDictionary(locale).dashboard.housing;

  if (result.status !== "success") {
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
    <HousingDetailsClient
      locale={locale}
      dictionary={dictionary}
      housing={result.housing}
      organizations={result.organizations}
      permissions={result.permissions}
    />
  );
}
