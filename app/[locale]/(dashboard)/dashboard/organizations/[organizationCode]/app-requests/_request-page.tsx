import { notFound } from "next/navigation";
import { AppRequestsTable } from "@/components/dashboard/app-requests/app-requests-table";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import {
  getAppRequestPage,
  type RequestFilters,
} from "@/features/app-requests/queries";
import type { DriverAppRequestType } from "@/features/app-requests/types";
import { markRequestNotificationsReadForCurrentUser } from "@/features/notifications/actions";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
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
  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization || !organization.navigation.appRequests) {
    notFound();
  }

  await markRequestNotificationsReadForCurrentUser({
    requestId: query.requestId,
    organizationId: organization.id,
  });

  const dictionary = getDictionary(locale).dashboard.appRequests;
  const data = await getAppRequestPage({
    organizationId: organization.id,
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
        <form className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            name="from"
            defaultValue={query.from}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            type="date"
            name="to"
            defaultValue={query.to}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            name="driver"
            defaultValue={query.driver}
            placeholder={dictionary.filters.driver}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <input
            name="driverId"
            defaultValue={query.driverId}
            placeholder={dictionary.filters.driverId}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <select
            name="status"
            defaultValue={query.status ?? "all"}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="all">{dictionary.filters.all}</option>
            <option value="pending">{dictionary.statuses.pending}</option>
            <option value="approved">{dictionary.statuses.approved}</option>
            <option value="rejected">{dictionary.statuses.rejected}</option>
            <option value="completed">{dictionary.statuses.completed}</option>
          </select>
          {requestType === "leave" ? (
            <select
              name="leaveType"
              defaultValue={query.leaveType ?? "all"}
              className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            >
              <option value="all">{dictionary.filters.all}</option>
              <option value="annual">{dictionary.leaveTypes.annual}</option>
              <option value="sick">{dictionary.leaveTypes.sick}</option>
              <option value="weekly">{dictionary.leaveTypes.weekly}</option>
            </select>
          ) : null}
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
            {dictionary.filters.apply}
          </button>
        </form>
      </div>
      <div className="px-5 py-6 sm:px-7">
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
      </div>
    </div>
  );
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
