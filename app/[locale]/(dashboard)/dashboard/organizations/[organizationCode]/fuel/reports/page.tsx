import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { FuelReportsTable } from "@/components/dashboard/fuel/fuel-reports-table";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getKafaratplusFuelReportData } from "@/features/fuel/queries";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type FuelReportsRouteProps = { params: Promise<{ locale: string; organizationCode: string }>; searchParams?: Promise<{ from?: string; page?: string; to?: string }> };

export async function generateMetadata({ params }: FuelReportsRouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.fuel;
  return { title: dictionary.reportsTitle, description: dictionary.reportsDescription, robots: { index: false, follow: false } };
}

export default async function FuelReportsRoute({ params, searchParams }: FuelReportsRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`);
  if (access.status === "not_found") notFound();
  if (access.status !== "success") return <AccessDenied locale={locale} />;
  const organization = access.organization;
  if (!organization.navigation.fuelReports) return <AccessDenied locale={locale} />;
  const today = getBusinessDateString();
  const fromDate = isDate(query?.from) ? query.from : today.slice(0, 8) + "01";
  const toDate = isDate(query?.to) ? query.to : today;
  const page = getPositiveInteger(query?.page) ?? 1;
  const dictionary = getDictionary(locale).dashboard.fuel;
  const data = await getKafaratplusFuelReportData({ organizationId: organization.id, fromDate, page, toDate });
  return <div className="min-h-full bg-background">
    <div className="border-b border-border bg-surface px-5 py-6 sm:px-7"><h1 className="text-2xl font-bold text-navy">{dictionary.reportsTitle}</h1><p className="mt-2 text-sm leading-6 text-muted">{dictionary.reportsDescription}</p><form className="mt-4 flex flex-wrap gap-2"><input type="date" name="from" defaultValue={fromDate} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy" /><input type="date" name="to" defaultValue={toDate} className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy" /><button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">{dictionary.filters.apply}</button></form></div>
    <div className="px-5 py-6 sm:px-7">
      {data.status !== "success" ? <div className="border border-amber-200 bg-amber-50 px-6 py-10 text-center"><p className="text-sm font-bold text-amber-800">{data.message}</p></div> : data.rows.length === 0 ? <div className="border border-border bg-surface px-6 py-10 text-center"><p className="text-sm font-semibold text-muted">{dictionary.emptyReports}</p></div> : <FuelReportsTable dictionary={dictionary} locale={locale} rows={data.rows} totals={data.totals} vehicleSummaries={data.vehicleSummaries} />}
      {data.status === "success" ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-muted"><p>{dictionary.pagination.operations}: {data.operationsCount} | {dictionary.pagination.page} {data.pagination.page} {dictionary.pagination.of} {data.pagination.totalPages}</p><div className="flex gap-2">{data.pagination.page > 1 ? <a className="rounded-lg border border-border bg-surface px-3 py-2" href={`?from=${fromDate}&to=${toDate}&page=${data.pagination.page - 1}`}>{dictionary.pagination.previous}</a> : null}{data.pagination.page < data.pagination.totalPages ? <a className="rounded-lg border border-border bg-surface px-3 py-2" href={`?from=${fromDate}&to=${toDate}&page=${data.pagination.page + 1}`}>{dictionary.pagination.next}</a> : null}</div>{data.fuelClassification.excludedNonFuelCount > 0 || data.fuelClassification.unverifiedCount > 0 ? <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">{dictionary.pagination.excluded} {data.fuelClassification.excludedNonFuelCount} {dictionary.pagination.nonFuel}. {data.fuelClassification.unverifiedCount} {dictionary.pagination.unverified}.</p> : null}</div> : null}
    </div>
  </div>;
}
function isDate(value: string | undefined): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function getPositiveInteger(value: string | undefined) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
