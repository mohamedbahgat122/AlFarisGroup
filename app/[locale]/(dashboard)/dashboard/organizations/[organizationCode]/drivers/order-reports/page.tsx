import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { DriverOrderReportsClient } from "@/components/dashboard/drivers/driver-order-reports-client";
import { getDriverOrderReportsForOrganization } from "@/features/driver-order-reports/queries";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";
import { getBusinessDateString } from "@/features/drivers/expiry";

type Props = { params: Promise<{ locale: string; organizationCode: string }>; searchParams?: Promise<{ date?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { locale } = await params; if (!isLocale(locale)) return {}; const d = getDictionary(locale).dashboard.drivers; return { title: d.orderReportsMetadataTitle, description: d.orderReportsMetadataDescription, robots: { index: false, follow: false } }; }
export default async function DriverOrderReportsPage({ params, searchParams }: Props) {
  const { locale, organizationCode } = await params; const query = await searchParams; if (!isLocale(locale)) notFound();
  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`); if (access.status === "not_found") notFound(); if (access.status !== "success" || !access.organization.navigation.driverOrderReports) return <AccessDenied locale={locale} />;
  const result = await getDriverOrderReportsForOrganization({ organizationId: access.organization.id, selectedDate: query?.date }); const labels = getDictionary(locale).dashboard.drivers;
  if (result.status !== "success") return <div className="min-h-full bg-background px-5 py-10 text-center"><h1 className="text-lg font-bold text-navy">{labels.loadErrorTitle}</h1><p className="mt-2 text-sm text-muted">{labels.loadErrorDescription}</p></div>;
  return <DriverOrderReportsClient locale={locale} organization={access.organization} report={result.report} dates={result.dates} selectedDateUnavailable={result.selectedDateUnavailable} labels={labels} today={getBusinessDateString()} />;
}
