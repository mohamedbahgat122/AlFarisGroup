import Link from "next/link";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import {
  DashboardIcon,
  type DashboardIconName,
  KpiCard,
  MiniStat,
  ProgressRow,
  RankBadge,
  RankCard,
  SectionTitle,
  StatLine,
  formatDateTime,
  formatNumber,
} from "@/components/dashboard/home/executive-dashboard";
import type { OrganizationDashboardData } from "@/features/dashboard/types";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Locale } from "@/types/locale";
import type { Dictionary } from "@/i18n/dictionaries";

type OrganizationDashboardProps = {
  data: Extract<OrganizationDashboardData, { status: "success" }>;
  locale: Locale;
  accessLabel: string;
  dictionary: Dictionary["dashboard"]["organizationDashboard"];
};

const requestTypes = [
  { key: "leave", href: "app-requests/leave" },
  { key: "maintenance", href: "app-requests/maintenance" },
  { key: "meeting", href: "app-requests/meetings" },
  { key: "oil_change", href: "app-requests/oil-change" },
];

export function OrganizationDashboard({
  data,
  locale,
  accessLabel,
  dictionary,
}: OrganizationDashboardProps) {
  const baseHref = `/${locale}/dashboard/organizations/${data.organization.code}`;
  const maxTrend = Math.max(...data.requests.trend.map((point) => point.total), 1);

  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7" dir={locale === "ar" ? "rtl" : "ltr"}>
      <RealtimeRefresh
        channelName={`organization-dashboard-requests-${data.organization.id}`}
        table="driver_app_requests"
        filter={`organization_id=eq.${data.organization.id}`}
        toast={dictionary.lastUpdated}
      />
      <RealtimeRefresh
        channelName={`organization-dashboard-shifts-${data.organization.id}`}
        table="driver_shifts"
        filter={`organization_id=eq.${data.organization.id}`}
        toast={dictionary.lastUpdated}
      />
      <RealtimeRefresh
        channelName={`organization-dashboard-fleet-${data.organization.id}`}
        table="fleet_vehicles"
        filter={`assigned_organization_id=eq.${data.organization.id}`}
        toast={dictionary.lastUpdated}
      />

      <div className="space-y-6">
        <OrganizationHeader
          organization={data.organization}
          accessLabel={accessLabel}
          lastUpdated={data.lastUpdated}
          locale={locale}
          dictionary={dictionary}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.kpis.map((metric) => (
            <KpiCard key={metric.id} metric={metric} />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionTitle icon="chart" title={dictionary.requestTrend} subtitle={dictionary.lastDays.replace("{range}", String(data.range))} />
              <form className="flex items-end gap-2" method="get">
                <label className="grid gap-1 text-sm font-medium text-navy">
                  {dictionary.period}
                  <select
                    name="range"
                    defaultValue={data.range}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    <option value="7">7</option>
                    <option value="30">30</option>
                  </select>
                </label>
                <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white">
                  {dictionary.apply}
                </button>
              </form>
            </div>
            <div className="mt-5 flex h-56 items-end gap-2 overflow-x-auto pb-2">
              {data.requests.trend.map((point) => (
                <div key={point.date} className="flex min-w-16 flex-1 flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end rounded-lg bg-background px-2">
                    <div
                      className="w-full rounded-t-md bg-primary transition-all"
                      style={{
                        height: `${Math.max((point.total / maxTrend) * 100, point.total > 0 ? 8 : 0)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums text-navy">
                    {formatNumber(point.total, locale)}
                  </span>
                  <span className="text-[11px] text-text-muted">{point.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="clipboard" title={dictionary.requestsByType} subtitle={dictionary.requestsByTypeDescription} />
            <div className="mt-4 grid gap-2">
              {requestTypes.map((type) => (
                <Link
                  key={type.key}
                  href={`${baseHref}/${type.href}`}
                  className="flex items-center justify-between rounded-lg bg-background px-3 py-3 text-sm transition hover:bg-primary/5"
                >
                  <span className="font-medium text-navy">{dictionary[type.key === "leave" ? "leave" : type.key === "maintenance" ? "maintenance" : type.key === "meeting" ? "meeting" : "oilChange"]}</span>
                  <strong className="font-semibold text-navy">
                    {formatNumber(data.requests.byTypeToday[type.key] ?? 0, locale)}
                  </strong>
                </Link>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label={dictionary.pending} value={data.requests.pending} tone="warning" locale={locale} />
              <MiniStat label={dictionary.approved} value={data.requests.approved} locale={locale} />
              <MiniStat label={dictionary.rejected} value={data.requests.rejected} tone="danger" locale={locale} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="car" title={dictionary.fleetStatus} subtitle={dictionary.fleetSubtitle} />
            <div className="mt-4 space-y-2">
              <StatLine label={dictionary.total} value={formatNumber(data.fleet.totalActive, locale)} />
              <StatLine label={dictionary.active} value={formatNumber(data.fleet.operationalActive, locale)} />
              <StatLine label={dictionary.stopped} value={formatNumber(data.fleet.operationalStopped, locale)} />
              <StatLine label={dictionary.maintenanceStatus} value={formatNumber(data.fleet.maintenance, locale)} />
              <StatLine label={dictionary.damaged} value={formatNumber(data.fleet.damaged, locale)} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="users" title={dictionary.driverStatus} subtitle={dictionary.driverSubtitle} />
            <div className="mt-4 space-y-2">
              <StatLine label={dictionary.total} value={formatNumber(data.drivers.active, locale)} />
              <StatLine label={dictionary.started} value={formatNumber(data.shifts.started, locale)} />
              <StatLine label={dictionary.completed} value={formatNumber(data.shifts.completed, locale)} />
              <StatLine
                label={dictionary.notStarted}
                value={formatNumber(Math.max(data.drivers.active - data.shifts.started, 0), locale)}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="home" title={dictionary.housing} subtitle={dictionary.housingSubtitle} />
            <div className="mt-4 space-y-4">
              <ProgressRow label={dictionary.utilization} value={data.housing.utilizationPercent} />
              <StatLine label={dictionary.units} value={formatNumber(data.housing.units, locale)} />
              <StatLine label={dictionary.capacity} value={formatNumber(data.housing.capacity, locale)} />
              <StatLine label={dictionary.occupied} value={formatNumber(data.housing.occupied, locale)} />
              <StatLine label={dictionary.available} value={formatNumber(data.housing.available, locale)} />
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          {data.topPerformanceDrivers.length > 0 ? (
            <DriverRanking
              empty={dictionary.emptyRankings}
              title={dictionary.topRated}
              subtitle={dictionary.dailyReports}
              rows={data.topPerformanceDrivers.map((driver) => ({
                id: driver.driverId,
                name: driver.driverName,
                meta: `${formatNumber(driver.deliveredTasks, locale)} ${dictionary.deliveries}`,
                value: `${formatNumber(driver.score, locale)}%`,
              }))}
            />
          ) : null}
          <DriverRanking
            empty={dictionary.emptyRankings}
            title={dictionary.mostActive}
            subtitle={dictionary.deliveriesShiftsRequests}
            rows={data.activityLeaders.map((driver) => ({
              id: driver.driverId,
              name: driver.driverName,
              meta: `${formatNumber(driver.deliveredTasks, locale)} ${dictionary.deliveries}`,
              value: formatNumber(driver.activityCount, locale),
            }))}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="activity" title={dictionary.dailySummary} subtitle={dictionary.quickOperational} />
            <div className="mt-4 grid gap-2">
              <StatLine label={dictionary.completedShifts} value={formatNumber(data.shifts.completed, locale)} />
              <StatLine label={dictionary.notStartedShifts} value={formatNumber(Math.max(data.drivers.active - data.shifts.started, 0), locale)} />
              <StatLine label={dictionary.incompleteReadings} value={formatNumber(data.shifts.incomplete, locale)} />
              <StatLine label={dictionary.missingProof} value={formatNumber(data.shifts.missingStartProof + data.shifts.missingEndProof, locale)} />
              <StatLine label={dictionary.newRequests} value={formatNumber(data.requests.todayTotal, locale)} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="warning" title={dictionary.alerts} subtitle={dictionary.alertsSubtitle} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label={dictionary.expired} value={data.alerts.expired} tone="danger" locale={locale} />
              <MiniStat label={dictionary.critical} value={data.alerts.critical} tone="warning" locale={locale} />
              <MiniStat label={dictionary.warning} value={data.alerts.warning} locale={locale} />
            </div>
            <div className="mt-4 space-y-2">
              {data.alerts.nearest.map((alert) => (
                <Link key={alert.id} href={alert.href} className="block rounded-lg bg-background px-3 py-3 transition hover:bg-primary/5">
                  <p className="font-semibold text-navy">{alert.title}</p>
                  <p className="text-xs text-text-muted">
                    {alert.expiryDate} · {formatNumber(alert.daysRemaining, locale)}
                  </p>
                </Link>
              ))}
              {data.alerts.nearest.length === 0 ? (
                <p className="rounded-lg bg-background px-3 py-4 text-sm text-text-muted">
                  {dictionary.noAlerts}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <SectionTitle icon="activity" title={dictionary.quickActions} subtitle={dictionary.quickActionsSubtitle} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold text-navy transition hover:border-primary/30 hover:bg-primary/5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <DashboardIcon name={action.icon as DashboardIconName} className="size-5" />
                </span>
                {action.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function OrganizationHeader({
  organization,
  accessLabel,
  lastUpdated,
  locale,
  dictionary,
}: {
  organization: AccessibleOrganization;
  accessLabel: string;
  lastUpdated: string;
  locale: Locale;
  dictionary: Dictionary["dashboard"]["organizationDashboard"];
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <DashboardIcon name="building" className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight text-navy">{organization.name}</h1>
            <p className="mt-2 text-sm text-text-muted">{dictionary.insideOrganization}</p>
            <p className="mt-2 text-sm text-text-muted">
              {dictionary.lastUpdated}: {formatDateTime(lastUpdated, locale)}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {accessLabel}
        </span>
        {organization.isHomeOrganization ? (
          <span className="rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            {dictionary.primaryOrganization}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function DriverRanking({
  title,
  subtitle,
  empty,
  rows,
}: {
  title: string;
  subtitle: string;
  empty: string;
  rows: Array<{ id: string; name: string; meta: string; value: string }>;
}) {
  return (
    <RankCard icon="activity" title={title} subtitle={subtitle} empty={empty}>
      {rows.map((driver, index) => (
        <div key={driver.id} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg bg-background px-3 py-3">
          <RankBadge rank={index + 1} />
          <div className="min-w-0">
            <p className="font-semibold text-navy">{driver.name}</p>
            <p className="text-xs text-text-muted">{driver.meta}</p>
          </div>
          <p className="font-bold leading-none text-navy">{driver.value}</p>
        </div>
      ))}
    </RankCard>
  );
}
