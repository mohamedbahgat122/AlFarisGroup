import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale).dashboard.shifts;

  return <ShiftCalculationClient text={dictionary} locale={locale} />;
}
