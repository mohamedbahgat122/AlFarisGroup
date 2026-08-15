import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";
import { ShiftCalculationClient } from "./shift-calculation-client";

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
    title: dictionary.calculationTitle,
    description: dictionary.calculationIntro,
    robots: { index: false, follow: false },
  };
}

export default async function ShiftCalculationPage({ params }: RouteProps) {
  const { locale, organizationCode } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`);
  if (access.status === "not_found") notFound();
  if (access.status !== "success") return <AccessDenied locale={locale} />;
  if (!access.organization.navigation.shifts) {
    return <AccessDenied locale={locale} />;
  }

  const dictionary = getDictionary(locale).dashboard.shifts;

  return <ShiftCalculationClient text={dictionary} locale={locale} />;
}
