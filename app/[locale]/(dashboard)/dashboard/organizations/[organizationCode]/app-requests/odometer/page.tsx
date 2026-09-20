import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/dashboard/access-denied";
import {
  AppRequestFilterActions,
  AppRequestFilterDate,
  AppRequestFilterSelect,
  AppRequestFilterText,
  AppRequestFiltersShell,
  AppRequestPagination,
  AppRequestResultAndPagination,
  AppRequestSummaryCards,
} from "@/components/dashboard/app-requests/app-request-page-ui";
import { OdometerTable } from "@/components/dashboard/app-requests/app-requests-table";
import { getOdometerPage, type OdometerFilters } from "@/features/app-requests/queries";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
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

  const access = await getOrganizationPageAccessByCode(organizationCode);
  if (access.status === "unauthenticated") redirect(`/${locale}/login`);
  if (access.status === "not_found") notFound();
  if (access.status !== "success") return <AccessDenied locale={locale} />;

  const organization = access.organization;
  if (!organization.permissionKeys.some((key) => ["odometer.manage", "odometer.view"].includes(key))) {
    return <AccessDenied locale={locale} />;
  }

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
      </div>
      <div className="px-5 py-6 sm:px-7">
        <AppRequestSummaryCards
          cards={[
            { label: dictionary.odometerSummary.total, value: data.summary.total, tone: "neutral" },
            { label: dictionary.odometerSummary.notStarted, value: data.summary.notStarted, tone: "pending" },
            { label: dictionary.odometerSummary.startedOnly, value: data.summary.startedOnly, tone: "info" },
            { label: dictionary.odometerSummary.completed, value: data.summary.completed, tone: "success" },
            { label: dictionary.odometerSummary.alertRows, value: data.summary.alertRows, tone: "danger" },
          ]}
        />
        <OdometerFilterBar
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          filters={filters}
        />
        <AppRequestResultAndPagination
          locale={locale}
          dictionary={dictionary}
          totalRows={data.totalRows}
          pagination={
            <OdometerPagination
              locale={locale}
              organizationCode={organizationCode}
              dictionary={dictionary}
              filters={filters}
              page={data.page}
              totalPages={data.totalPages}
            />
          }
        />
        {data.rows.length === 0 ? (
          <Panel message={dictionary.emptyOdometer} />
        ) : (
          <OdometerTable
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            organizationId={organization.id}
            rows={data.rows}
            canEdit={organization.permissionKeys.some((key) => ["odometer.manage", "odometer.edit"].includes(key))}
          />
        )}
        {data.totalPages > 1 ? (
          <div className="mt-4 flex justify-end">
            <OdometerPagination
              locale={locale}
              organizationCode={organizationCode}
              dictionary={dictionary}
              filters={filters}
              page={data.page}
              totalPages={data.totalPages}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OdometerFilterBar({
  locale,
  organizationCode,
  dictionary,
  filters,
}: {
  locale: string;
  organizationCode: string;
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"];
  filters: OdometerFilters;
}) {
  const resetHref = `/${locale}/dashboard/organizations/${organizationCode}/app-requests/odometer`;

  return (
    <AppRequestFiltersShell
      actions={<AppRequestFilterActions dictionary={dictionary} resetHref={resetHref} />}
    >
      <AppRequestFilterText
        name="driver"
        label={dictionary.filters.search}
        defaultValue={filters.driver}
        placeholder={dictionary.filters.searchPlaceholder}
        wide
      />
      <AppRequestFilterDate name="date" label={dictionary.filters.date} defaultValue={filters.date} />
      <AppRequestFilterText name="driverId" label={dictionary.filters.driverId} defaultValue={filters.driverId} />
      <AppRequestFilterText name="plate" label={dictionary.filters.plate} defaultValue={filters.plate} />
      <AppRequestFilterSelect name="status" label={dictionary.filters.status} defaultValue={filters.status ?? "all"}>
        <option value="all">{dictionary.filters.all}</option>
        <option value="not_started">{dictionary.statuses.not_started}</option>
        <option value="started">{dictionary.statuses.open}</option>
        <option value="completed">{dictionary.statuses.completed_shift}</option>
      </AppRequestFilterSelect>
    </AppRequestFiltersShell>
  );
}

function OdometerPagination({
  locale,
  organizationCode,
  dictionary,
  filters,
  page,
  totalPages,
}: {
  locale: string;
  organizationCode: string;
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"];
  filters: OdometerFilters;
  page: number;
  totalPages: number;
}) {
  return (
    <AppRequestPagination
      dictionary={dictionary}
      page={page}
      totalPages={totalPages}
      previousHref={page <= 1 ? undefined : buildOdometerPageHref({ locale, organizationCode, filters, page: page - 1 })}
      nextHref={page >= totalPages ? undefined : buildOdometerPageHref({ locale, organizationCode, filters, page: page + 1 })}
    />
  );
}

function buildOdometerPageHref({
  locale,
  organizationCode,
  filters,
  page,
}: {
  locale: string;
  organizationCode: string;
  filters: OdometerFilters;
  page: number;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (key === "reviewStatus" || key === "phase") continue;
    if (key === "page" || value === undefined || value === "" || value === "all") continue;
    params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/${locale}/dashboard/organizations/${organizationCode}/app-requests/odometer${query ? `?${query}` : ""}`;
}

function Panel({ message }: { message: string }) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-muted">{message}</p>
    </div>
  );
}
