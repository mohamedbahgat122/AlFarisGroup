import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FuelReportsTable } from "@/components/dashboard/fuel/fuel-reports-table";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getFuelReportData } from "@/features/fuel/queries";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type FuelReportsRouteProps = {
  params: Promise<{ locale: string; organizationCode: string }>;
  searchParams?: Promise<{ from?: string; page?: string; to?: string }>;
};

export async function generateMetadata({
  params,
}: FuelReportsRouteProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return {};
  }

  const dictionary = getDictionary(locale).dashboard.fuel;

  return {
    title: dictionary.reportsTitle,
    description: dictionary.reportsDescription,
    robots: { index: false, follow: false },
  };
}

export default async function FuelReportsRoute({
  params,
  searchParams,
}: FuelReportsRouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;

  if (!isLocale(locale)) {
    notFound();
  }

  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization || !organization.navigation.fuelReports) {
    notFound();
  }

  const today = getBusinessDateString();
  const fromDate = isDate(query?.from) ? query.from : today.slice(0, 8) + "01";
  const toDate = isDate(query?.to) ? query.to : today;
  const page = getPositiveInteger(query?.page) ?? 1;
  const dictionary = getDictionary(locale).dashboard.fuel;
  const data = await getFuelReportData({
    organizationId: organization.id,
    fromDate,
    page,
    toDate,
  });

  if (data.status !== "success") {
    return (
      <div className="min-h-full bg-background px-5 py-6 sm:px-7">
        <div className="border border-border bg-surface px-6 py-10 text-center">
          <h1 className="text-lg font-bold text-navy">
            {dictionary.errors.load_failed}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">
          {dictionary.reportsTitle}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {dictionary.reportsDescription}
        </p>
        <form className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
            {dictionary.filters.apply}
          </button>
        </form>
      </div>
      <div className="px-5 py-6 sm:px-7">
        {data.rows.length === 0 ? (
          <div className="border border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm font-semibold text-muted">
              {dictionary.emptyReports}
            </p>
          </div>
        ) : (
          <FuelReportsTable
            dictionary={dictionary}
            fromDate={fromDate}
            locale={locale}
            organizationCode={organizationCode}
            rows={data.rows}
            toDate={toDate}
          />
        )}
      </div>
    </div>
  );
}

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getPositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
