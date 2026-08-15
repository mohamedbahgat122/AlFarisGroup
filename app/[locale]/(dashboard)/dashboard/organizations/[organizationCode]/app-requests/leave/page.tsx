import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RequestPage } from "@/app/[locale]/(dashboard)/dashboard/organizations/[organizationCode]/app-requests/_request-page";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type RouteProps = {
  params: Promise<{ locale: string; organizationCode: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.appRequests;
  return { title: dictionary.leaveTitle, robots: { index: false, follow: false } };
}

export default async function LeaveRequestsRoute({ params, searchParams }: RouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale).dashboard.appRequests;
  return (
    <RequestPage
      locale={locale}
      organizationCode={organizationCode}
      requestType="leave"
      title={dictionary.leaveTitle}
      query={{
        ...query,
        search: query?.search,
        page: toPage(query?.page),
      }}
    />
  );
}

function toPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
