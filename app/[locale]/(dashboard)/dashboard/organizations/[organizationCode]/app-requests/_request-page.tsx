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
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import {
  getAppRequestPage,
  type RequestFilters,
} from "@/features/app-requests/queries";
import type { DriverAppRequestType } from "@/features/app-requests/types";
import type { AppRequestSummary } from "@/features/app-requests/types";
import { markRequestNotificationsReadForCurrentUser } from "@/features/notifications/actions";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

export async function RequestPage({
  locale,
  organizationCode,
  requestType,
  title,
  query,
}: {
  locale: Locale;
  organizationCode: string;
  requestType: DriverAppRequestType;
  title: string;
  query: RequestFilters;
}) {
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

  if (!organization.navigation.appRequests) {
    return <AccessDenied locale={locale} />;
  }

  await markRequestNotificationsReadForCurrentUser({
    requestId: query.requestId,
    organizationId: organization.id,
  });

  const dictionary = getDictionary(locale).dashboard.appRequests;
  const data = await getAppRequestPage({
    organizationId: organization.id,
    organizationName: organization.name,
    requestType,
    filters: query,
  });

  if (data.status !== "success") {
    return <LoadError message={dictionary.errors.load_failed} />;
  }

  return (
    <div className="min-h-full bg-background">
      <RealtimeRefresh
        channelName={`dashboard-requests-${organization.id}-${requestType}`}
        table="driver_app_requests"
        filter={`organization_id=eq.${organization.id}`}
        toast={dictionary.realtime.requestUpdated}
      />
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {dictionary.requestsDescription}
        </p>
      </div>
      <div className="px-5 py-6 sm:px-7">
        <AppRequestSummaryCards cards={getRequestSummaryCards(dictionary, requestType, data.summary)} />
        <RequestFilterBar
          dictionary={dictionary}
          locale={locale}
          organizationCode={organizationCode}
          requestType={requestType}
          query={query}
        />
        <AppRequestResultAndPagination
          locale={locale}
          dictionary={dictionary}
          totalRows={data.totalRows}
          pagination={
            <Pagination
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            requestType={requestType}
            query={query}
            page={data.page}
            totalPages={data.totalPages}
          />
          }
        />
        {data.rows.length === 0 ? (
          <Empty
            message={
              requestType === "leave"
                ? dictionary.emptyLeaveRequests
                : dictionary.emptyRequests
            }
          />
        ) : (
          <AppRequestsTable
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            organizationId={organization.id}
            requestType={requestType}
            rows={data.rows}
            canReview={organization.permissionKeys.includes("app_requests.review")}
          />
        )}
        {data.totalPages > 1 ? (
          <div className="mt-4 flex justify-end">
            <Pagination
              locale={locale}
              dictionary={dictionary}
              organizationCode={organizationCode}
              requestType={requestType}
              query={query}
              page={data.page}
              totalPages={data.totalPages}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RequestFilterBar({
  dictionary,
  locale,
  organizationCode,
  requestType,
  query,
}: {
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"];
  locale: Locale;
  organizationCode: string;
  requestType: DriverAppRequestType;
  query: RequestFilters;
}) {
  const baseHref = getRequestPageHref({ locale, organizationCode, requestType });

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
          <AppRequestFilterSelect name="status" label={dictionary.filters.status} defaultValue={query.status ?? "all"}>
            <option value="all">{dictionary.filters.all}</option>
            <option value="pending">{dictionary.statuses.pending}</option>
            <option value="approved">{dictionary.statuses.approved}</option>
            <option value="rejected">{dictionary.statuses.rejected}</option>
            <option value="completed">{dictionary.statuses.completed}</option>
            <option value="cancelled">{dictionary.statuses.cancelled}</option>
          </AppRequestFilterSelect>
          {requestType === "leave" ? (
            <AppRequestFilterSelect name="leaveType" label={dictionary.filters.leaveType} defaultValue={query.leaveType ?? "all"}>
              <option value="all">{dictionary.filters.all}</option>
              <option value="annual">{dictionary.leaveTypes.annual}</option>
              <option value="sick">{dictionary.leaveTypes.sick}</option>
              <option value="weekly">{dictionary.leaveTypes.weekly}</option>
              <option value="emergency">{dictionary.leaveTypes.emergency}</option>
              <option value="unpaid">{dictionary.leaveTypes.unpaid}</option>
              <option value="other">{dictionary.leaveTypes.other}</option>
            </AppRequestFilterSelect>
          ) : null}
    </AppRequestFiltersShell>
  );
}

function Pagination({
  locale,
  dictionary,
  organizationCode,
  requestType,
  query,
  page,
  totalPages,
}: {
  locale: Locale;
  dictionary: ReturnType<typeof getDictionary>["dashboard"]["appRequests"];
  organizationCode: string;
  requestType: DriverAppRequestType;
  query: RequestFilters;
  page: number;
  totalPages: number;
}) {
  const previousHref =
    page <= 1
      ? undefined
      : buildPageHref({ locale, organizationCode, requestType, query, page: page - 1 });
  const nextHref =
    page >= totalPages
      ? undefined
      : buildPageHref({ locale, organizationCode, requestType, query, page: page + 1 });

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
  requestType: DriverAppRequestType,
  summary: AppRequestSummary,
) {
  const labels = requestType === "leave"
    ? dictionary.leaveSummary
    : dictionary.requestSummary;

  const cards: AppRequestSummaryCard[] = [
    { label: labels.total, value: summary.total, tone: "neutral" as const },
    { label: labels.pending, value: summary.pending, tone: "pending" as const },
    { label: labels.approved, value: summary.approved, tone: "success" as const },
    { label: labels.rejected, value: summary.rejected, tone: "danger" as const },
    { label: labels.today, value: summary.today, tone: "info" as const },
  ];

  if (requestType === "leave") {
    cards.push({
      label: dictionary.leaveSummary.activeToday,
      value: summary.activeToday,
      tone: "accent" as const,
    });
  }

  return cards;
}

function buildPageHref({
  locale,
  organizationCode,
  requestType,
  query,
  page,
}: {
  locale: Locale;
  organizationCode: string;
  requestType: DriverAppRequestType;
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
  return `${getRequestPageHref({ locale, organizationCode, requestType })}${search ? `?${search}` : ""}`;
}

function getRequestPageHref({
  locale,
  organizationCode,
  requestType,
}: {
  locale: Locale;
  organizationCode: string;
  requestType: DriverAppRequestType;
}) {
  return `/${locale}/dashboard/organizations/${organizationCode}/app-requests/${requestType === "oil_change" ? "oil-change" : requestType}`;
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
