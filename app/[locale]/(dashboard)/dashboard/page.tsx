import type { Metadata } from "next";
import { ExecutiveDashboard } from "@/components/dashboard/home/executive-dashboard";
import { getExecutiveDashboardData } from "@/features/dashboard/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type DashboardRouteProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    organization?: string;
    range?: string;
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

export default async function DashboardRoute({
  params,
  searchParams,
}: DashboardRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  const filters = await searchParams;
  const data = await getExecutiveDashboardData({
    locale,
    organization: filters?.organization,
    range: filters?.range,
  });

  if (data.status !== "success") {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-black text-navy">
          {data.status === "unauthorized"
            ? "ليس لديك صلاحية للوصول"
            : "تعذر تحميل لوحة التحكم"}
        </h1>
      </div>
    );
  }

  return <ExecutiveDashboard data={data} locale={locale} />;
}
