import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OdometerTable } from "@/components/dashboard/app-requests/app-requests-table";
import { getOdometerPage, type OdometerFilters } from "@/features/app-requests/queries";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";

type RouteProps = {
  params: Promise<{ locale: string; organizationCode: string }>;
  searchParams?: Promise<OdometerFilters>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.appRequests;
  return {
    title: dictionary.odometerTitle,
    description: dictionary.odometerDescription,
    robots: { index: false, follow: false },
  };
}

export default async function OdometerRoute({ params, searchParams }: RouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();

  const organization = await getAccessibleOrganizationByCode(organizationCode);
  if (!organization || !organization.navigation.odometerManagement) notFound();

  const dictionary = getDictionary(locale).dashboard.appRequests;
  const filters = { ...query, date: query?.date ?? getBusinessDateString() };
  const data = await getOdometerPage({
    organizationId: organization.id,
    filters,
  });

  if (data.status !== "success") {
    return <Panel message={dictionary.errors.load_failed} />;
  }

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">
          {dictionary.odometerTitle}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {dictionary.odometerDescription}
        </p>
        <form className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            name="date"
            defaultValue={filters.date}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            name="driver"
            defaultValue={filters.driver}
            placeholder={dictionary.filters.driver}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            name="driverId"
            defaultValue={filters.driverId}
            placeholder={dictionary.filters.driverId}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            name="plate"
            defaultValue={filters.plate}
            placeholder={dictionary.filters.plate}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <select
            name="status"
            defaultValue={filters.status ?? "all"}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="all">{dictionary.filters.all}</option>
            <option value="open">{dictionary.statuses.open}</option>
            <option value="completed">{dictionary.statuses.completed_shift}</option>
          </select>
          <select
            name="reviewStatus"
            defaultValue={filters.reviewStatus ?? "all"}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="all">{dictionary.filters.all}</option>
            <option value="pending_review">{dictionary.reviewStatuses.pending_review}</option>
            <option value="approved">{dictionary.reviewStatuses.approved}</option>
            <option value="rejected">{dictionary.reviewStatuses.rejected}</option>
          </select>
          <select
            name="phase"
            defaultValue={filters.phase ?? "all"}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="all">{dictionary.filters.all}</option>
            <option value="start">{dictionary.start}</option>
            <option value="end">{dictionary.end}</option>
          </select>
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
            {dictionary.filters.apply}
          </button>
        </form>
      </div>
      <div className="px-5 py-6 sm:px-7">
        {data.rows.length === 0 ? (
          <Panel message={dictionary.emptyOdometer} />
        ) : (
          <OdometerTable
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            organizationId={organization.id}
            rows={data.rows}
            canReview={organization.permissionKeys.includes("odometer.manage")}
          />
        )}
      </div>
    </div>
  );
}

function Panel({ message }: { message: string }) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-muted">{message}</p>
    </div>
  );
}
