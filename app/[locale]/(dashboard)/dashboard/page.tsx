import type { Metadata } from "next";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type DashboardRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({
  params,
}: DashboardRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale);

  return {
    title: dictionary.dashboard.metadataTitle,
    description: dictionary.dashboard.metadataDescription,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function DashboardRoute() {
  return null;
}
