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
  type AppRequestSummaryCard,
} from "@/components/dashboard/app-requests/app-request-page-ui";
import { AppRequestsTable } from "@/components/dashboard/app-requests/app-requests-table";
import { OilMaintenanceTrackingTable } from "@/components/dashboard/app-requests/oil-maintenance-tracking-table";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import {
  getAppRequestPage,
  getEligibleMaintenanceProvidersForOrganization,
  getOilMaintenanceTrackingPage,
  type RequestFilters,
} from "@/features/app-requests/queries";
import type { AppRequestSummary } from "@/features/app-requests/types";
import { markRequestNotificationsReadForCurrentUser } from "@/features/notifications/actions";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";
import { isLocale } from "@/types/locale";
import { canReviewRequestType, canViewRequestType } from "@/features/app-requests/authorization";

type RouteProps = {
  params: Promise<{ locale: string; organizationCode: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = getDictionary(locale).dashboard.appRequests;
  return { title: dictionary.oilChangeTitle, robots: { index: false, follow: false } };
}

export default async function OilChangeRequestsRoute({ params, searchParams }: RouteProps) {
  const { locale, organizationCode } = await params;
  const query = await searchParams;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale).dashboard.appRequests;
  const filters: RequestFilters = { ...query, page: toPage(query?.page) };
  const access = await getOrganizationPageAccessByCode(organizationCode);

  if (access.status === "unauthenticated") {
    redirect(`/${locale}/login`);
  }

  if (access.status === "not_found") {
    notFound();
  }

  if (access.status !== "success") {
    return <AccessDenied locale={locale} />;
  }

  const organization = access.organization;

  if (!canViewRequestType(organization.permissionKeys, "oil_change")) {
    return <AccessDenied locale={locale} />;
  }

  await markRequestNotificationsReadForCurrentUser({
    requestId: filters.requestId,
    organizationId: organization.id,
  });

  const [trackingData, requestData, maintenanceProviderOptions] = await Promise.all([
    getOilMaintenanceTrackingPage({
      organizationId: organization.id,
      filters,
    }),
    getAppRequestPage({
      organizationId: organization.id,
      organizationName: organization.name,
      requestType: "oil_change",
      filters,
    }),
    getEligibleMaintenanceProvidersForOrganization(organization.id),
  ]);

  if (trackingData.status !== "success" || requestData.status !== "success") {
    return <LoadError message={dictionary.errors.load_failed} />;
  }

  return (
    <div className="min-h-full bg-background">
      <RealtimeRefresh
        channelName={`dashboard-requests-${organization.id}-oil_change`}
        table="driver_app_requests"
        filter={`organization_id=eq.${organization.id}`}
        toast={dictionary.realtime.requestUpdated}
      />
      <RealtimeRefresh
        channelName={`dashboard-maintenance-jobs-${organization.id}-oil_change`}
        table="maintenance_jobs"
        filter={`organization_id=eq.${organization.id}`}
        toast={dictionary.realtime.requestUpdated}
      />
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">{dictionary.oilChangeTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {dictionary.requestsDescription}
        </p>
      </div>
      <div className="space-y-6 px-5 py-6 sm:px-7">
        <AppRequestSummaryCards
          cards={getRequestSummaryCards(dictionary, requestData.summary)}
        />
        <RequestFilterBar
          dictionary={dictionary}
          locale={locale}
          organizationCode={organizationCode}
          query={filters}
        />

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-navy">
              {dictionary.oilMaintenanceTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {dictionary.oilMaintenanceDescription}
            </p>
          </div>
          {trackingData.rows.length === 0 ? (
            <Empty message={dictionary.emptyOilMaintenance} />
          ) : (
            <OilMaintenanceTrackingTable
              locale={locale}
              dictionary={dictionary}
              rows={trackingData.rows}
            />
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-navy">
              {dictionary.latestOilRequestsTitle}
            </h2>
          </div>
          <AppRequestResultAndPagination
            locale={locale}
            dictionary={dictionary}
            totalRows={requestData.totalRows}
            pagination={
              <Pagination
                locale={locale}
                dictionary={dictionary}
                organizationCode={organizationCode}
                query={filters}
                page={requestData.page}
                totalPages={requestData.totalPages}
              />
            }
          />
          {requestData.rows.length === 0 ? (
            <Empty message={dictionary.emptyRequests} />
          ) : (
            <AppRequestsTable
              locale={locale}
              dictionary={dictionary}
              organizationCode={organizationCode}
              organizationId={organization.id}
              requestType="oil_change"
              rows={requestData.rows}
              canReview={canReviewRequestType(organization.permissionKeys, "oil_change")}
              canAssignMaintenance={organization.permissionKeys.includes("maintenance_jobs.assign")}
              maintenanceProviderOptions={maintenanceProviderOptions}
            />
          )}
          {requestData.totalPages > 1 ? (
            <div className="mt-4 flex justify-end">
              <Pagination
                locale={locale}
                dictionary={dictionary}
                organizationCode={organizationCode}
                query={filters}
                page={requestData.page}
                totalPages={requestData.totalPages}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function toPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function RequestFilterBar({
  dictionary,
  locale,
  organizationCode,
  query,
}: {
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"];
  locale: Locale;
  organizationCode: string;
  query: RequestFilters;
}) {
  const baseHref = getOilChangeHref({ locale, organizationCode });

  return (
    <AppRequestFiltersShell
      actions={<AppRequestFilterActions dictionary={dictionary} resetHref={baseHref} />}
    >
      <AppRequestFilterText
        name="search"
        label={dictionary.filters.search}
        defaultValue={query.search ?? query.driver ?? query.driverId ?? ""}
        placeholder={dictionary.filters.searchPlaceholder}
        wide
      />
      <AppRequestFilterDate name="from" label={dictionary.filters.from} defaultValue={query.from} />
      <AppRequestFilterDate name="to" label={dictionary.filters.to} defaultValue={query.to} />
      <AppRequestFilterSelect
        name="status"
        label={dictionary.filters.status}
        defaultValue={query.status ?? "all"}
      >
        <option value="all">{dictionary.filters.all}</option>
        <option value="pending">{dictionary.statuses.pending}</option>
        <option value="approved">{dictionary.statuses.approved}</option>
        <option value="rejected">{dictionary.statuses.rejected}</option>
        <option value="completed">{dictionary.statuses.completed}</option>
        <option value="cancelled">{dictionary.statuses.cancelled}</option>
      </AppRequestFilterSelect>
    </AppRequestFiltersShell>
  );
}

function Pagination({
  locale,
  dictionary,
  organizationCode,
  query,
  page,
  totalPages,
}: {
  locale: Locale;
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"];
  organizationCode: string;
  query: RequestFilters;
  page: number;
  totalPages: number;
}) {
  const previousHref =
    page <= 1
      ? undefined
      : buildPageHref({ locale, organizationCode, query, page: page - 1 });
  const nextHref =
    page >= totalPages
      ? undefined
      : buildPageHref({ locale, organizationCode, query, page: page + 1 });

  return (
    <AppRequestPagination
      dictionary={dictionary}
      page={page}
      totalPages={totalPages}
      previousHref={previousHref}
      nextHref={nextHref}
    />
  );
}

function getRequestSummaryCards(
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"],
  summary: AppRequestSummary,
) {
  const cards: AppRequestSummaryCard[] = [
    { label: dictionary.requestSummary.total, value: summary.total, tone: "neutral" },
    { label: dictionary.requestSummary.pending, value: summary.pending, tone: "pending" },
    { label: dictionary.requestSummary.approved, value: summary.approved, tone: "success" },
    { label: dictionary.requestSummary.rejected, value: summary.rejected, tone: "danger" },
    { label: dictionary.requestSummary.today, value: summary.today, tone: "info" },
  ];

  return cards;
}

function buildPageHref({
  locale,
  organizationCode,
  query,
  page,
}: {
  locale: Locale;
  organizationCode: string;
  query: RequestFilters;
  page: number;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "page" || value === undefined || value === "" || value === "all") continue;
    params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${getOilChangeHref({ locale, organizationCode })}${search ? `?${search}` : ""}`;
}

function getOilChangeHref({
  locale,
  organizationCode,
}: {
  locale: Locale;
  organizationCode: string;
}) {
  return `/${locale}/dashboard/organizations/${organizationCode}/app-requests/oil-change`;
}

function Empty({ message }: { message: string }) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center">
      <p className="text-sm font-semibold text-muted">{message}</p>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <div className="border border-border bg-surface px-6 py-10 text-center">
        <h1 className="text-lg font-bold text-navy">{message}</h1>
      </div>
    </div>
  );
}
