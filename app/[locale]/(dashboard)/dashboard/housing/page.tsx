import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { GlobalHousingListClient } from "@/components/dashboard/housing/global-housing-client";
import { getGlobalHousingPageData } from "@/features/housing/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type HousingRouteProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ archived?: string }>;
};

export async function generateMetadata({
  params,
}: HousingRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.housing;

  return {
    title: dictionary.metadataTitle,
    description: dictionary.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function HousingRoute({
  params,
  searchParams,
}: HousingRouteProps) {
  const { locale } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  const includeArchived = query?.archived === "true";
  const result = await getGlobalHousingPageData({ includeArchived });

  if (result.status === "unauthorized") {
    return <AccessDenied locale={locale} showOrganizationsLink={false} />;
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
    <GlobalHousingListClient
      locale={locale}
      dictionary={dictionary}
      housing={result.housing}
      permissions={result.permissions}
      includeArchived={includeArchived}
    />
  );
}
