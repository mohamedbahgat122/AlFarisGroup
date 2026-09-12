import Link from "next/link";
import type { ReactNode } from "react";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import type { ExecutiveDashboardData } from "@/features/dashboard/types";
import type { Locale } from "@/types/locale";

type ExecutiveDashboardProps = {
  data: Extract<ExecutiveDashboardData, { status: "success" }>;
  locale: Locale;
};

const requestTypeLabels: Record<string, string> = {
  leave: "إجازة",
  maintenance: "صيانة",
  meeting: "مقابلة",
  oil_change: "تغيير زيت",
  odometer: "عداد",
};

export type DashboardIconName =
  | "activity"
  | "bed"
  | "building"
  | "car"
  | "chart"
  | "clipboard"
  | "clock"
  | "home"
  | "pause"
  | "trophy"
  | "users"
  | "userCheck"
  | "warning";

const metricIcons: Record<string, DashboardIconName> = {
  organizations: "building",
  drivers: "users",
  vehicles: "car",
  "active-drivers": "userCheck",
  "active-vehicles": "car",
  "stopped-vehicles": "pause",
  housing: "home",
  "housing-capacity": "bed",
  "housing-occupied": "users",
  "requests-today": "clipboard",
  "pending-requests": "clock",
  "shifts-today": "clock",
  "critical-alerts": "warning",
};

export function ExecutiveDashboard({ data, locale }: ExecutiveDashboardProps) {
  const maxTrend = Math.max(...data.requests.trend.map((point) => point.total), 1);

  return (
    <div className="space-y-6" dir={locale === "ar" ? "rtl" : "ltr"}>
      <RealtimeRefresh
        channelName="executive-dashboard-app-requests"
        table="driver_app_requests"
        toast="تم تحديث لوحة التحكم"
      />
      <RealtimeRefresh
        channelName="executive-dashboard-shifts"
        table="driver_shifts"
        toast="تم تحديث لوحة التحكم"
      />
      <RealtimeRefresh
        channelName="executive-dashboard-housing-assignments"
        table="housing_driver_assignments"
        toast="تم تحديث لوحة التحكم"
      />
      <RealtimeRefresh
        channelName="executive-dashboard-fleet"
        table="fleet_vehicles"
        toast="تم تحديث لوحة التحكم"
      />
      <RealtimeRefresh
        channelName="executive-dashboard-housing-units"
        table="housing_units"
        toast="تم تحديث لوحة التحكم"
      />

      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">مباشر</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-navy md:text-3xl">
              لوحة التحكم التنفيذية
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              آخر تحديث: {formatDateTime(data.lastUpdated, locale)}
            </p>
          </div>
          <form className="grid w-full gap-3 md:w-auto md:grid-cols-[minmax(220px,280px)_150px_auto]" method="get">
            <label className="grid gap-1 text-sm font-medium text-navy">
              المؤسسة
              <select
                name="organization"
                defaultValue={data.filters.organization}
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="all">كل المؤسسات</option>
                {data.availableOrganizations.map((organization) => (
                  <option key={organization.id} value={organization.code}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-navy">
              الفترة
              <select
                name="range"
                defaultValue={data.filters.range}
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="1">اليوم</option>
                <option value="7">7 أيام</option>
                <option value="30">30 يوما</option>
              </select>
            </label>
            <button className="self-end rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary/90">
              تطبيق
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((metric) => (
          <KpiCard key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <SectionTitle icon="chart" title="اتجاه الطلبات" subtitle={`آخر ${data.filters.range} يوم`} />
          <div className="mt-5 flex h-64 items-end gap-2 overflow-x-auto pb-2">
            {data.requests.trend.map((point) => (
              <div key={point.date} className="flex min-w-16 flex-1 flex-col items-center gap-2">
                <div className="flex h-44 w-full items-end rounded-lg bg-background px-2">
                  <div
                    className="w-full rounded-t-md bg-primary transition-all"
                    style={{ height: `${Math.max((point.total / maxTrend) * 100, point.total > 0 ? 8 : 0)}%` }}
                    aria-label={`${point.date}: ${point.total}`}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums text-navy">{point.total}</span>
                <span className="text-[11px] text-text-muted">{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 text-xs text-text-muted sm:grid-cols-3">
            {Object.entries(data.requests.byTypeToday).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
                <span>{requestTypeLabels[type] ?? type}</span>
                <strong className="text-navy">{count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <SectionTitle icon="home" title="السكن والورديات" subtitle="قراءة تشغيلية مختصرة" />
          <div className="mt-5 space-y-5">
            <ProgressRow label="إشغال السكن" value={data.housing.utilizationPercent} />
            <ProgressRow
              label="اكتمال الورديات"
              value={data.shifts.todayTotal > 0 ? Math.round((data.shifts.completed / data.shifts.todayTotal) * 100) : 0}
            />
            <StatLine label="المسافة اليوم" value={`${formatNumber(data.shifts.totalDistanceToday, locale)} كم`} />
            <StatLine label="إثباتات بداية ناقصة" value={formatNumber(data.shifts.missingStartProof, locale)} />
            <StatLine label="إثباتات نهاية ناقصة" value={formatNumber(data.shifts.missingEndProof, locale)} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <RankCard
          title="الأعلى تقييما"
          subtitle="متوسط معدلات تقارير المناديب اليومية"
          empty="لا توجد بيانات أداء في الفترة"
          icon="trophy"
        >
          {data.topPerformanceDrivers.map((driver, index) => (
            <div key={driver.driverId} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg bg-background px-3 py-3">
              <RankBadge rank={index + 1} />
              <div>
                <p className="font-semibold text-navy">{driver.driverName}</p>
                <p className="text-xs text-text-muted">{driver.organizationName}</p>
              </div>
              <div className="text-end">
                <p className="font-bold leading-none text-navy">{formatNumber(driver.score, locale)}%</p>
                <p className="text-xs text-text-muted">
                  {formatNumber(driver.deliveredTasks, locale)} تسليم
                </p>
              </div>
            </div>
          ))}
        </RankCard>

        <RankCard icon="activity" title="الأعلى نشاطا" subtitle="تسليمات + ورديات + طلبات" empty="لا توجد بيانات نشاط في الفترة">
          {data.activityLeaders.map((driver, index) => (
            <div key={driver.driverId} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg bg-background px-3 py-3">
              <RankBadge rank={index + 1} />
              <div>
                <p className="font-semibold text-navy">{driver.driverName}</p>
                <p className="text-xs text-text-muted">{driver.organizationName}</p>
              </div>
              <div className="text-end">
                <p className="font-bold leading-none text-navy">{formatNumber(driver.activityCount, locale)}</p>
                <p className="text-xs text-text-muted">
                  {formatNumber(driver.deliveredTasks, locale)} تسليم
                </p>
              </div>
            </div>
          ))}
        </RankCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <SectionTitle icon="building" title="نظرة المؤسسات" subtitle="أول 20 مؤسسة حسب المناديب النشطين" />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="py-3 text-start">المؤسسة</th>
                  <th className="py-3 text-center">مناديب</th>
                  <th className="py-3 text-center">مركبات</th>
                  <th className="py-3 text-center">سكن</th>
                  <th className="py-3 text-center">طلبات اليوم</th>
                  <th className="py-3 text-center">ورديات اليوم</th>
                  <th className="py-3 text-center">تنبيهات</th>
                </tr>
              </thead>
              <tbody>
                {data.organizationOverview.map((organization) => (
                  <tr key={organization.id} className="border-b border-border/60">
                    <td className="py-3 font-semibold text-navy">
                      <Link href={`/${locale}/dashboard/organizations/${organization.code}`} className="hover:text-primary">
                        {organization.name}
                      </Link>
                    </td>
                    <td className="py-3 text-center">{formatNumber(organization.activeDrivers, locale)}</td>
                    <td className="py-3 text-center">{formatNumber(organization.vehicles, locale)}</td>
                    <td className="py-3 text-center">{formatNumber(organization.housingLinkedDrivers, locale)}</td>
                    <td className="py-3 text-center">{formatNumber(organization.todayRequests, locale)}</td>
                    <td className="py-3 text-center">{formatNumber(organization.todayShifts, locale)}</td>
                    <td className="py-3 text-center">{formatNumber(organization.pendingAlerts, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="warning" title="تنبيهات الانتهاء" subtitle="من مركز التنبيهات الموحد" />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label="منتهي" value={data.alerts.expired} tone="danger" locale={locale} />
              <MiniStat label="حرج" value={data.alerts.critical} tone="warning" locale={locale} />
              <MiniStat label="تحذير" value={data.alerts.warning} tone="default" locale={locale} />
            </div>
            <div className="mt-4 space-y-2">
              {data.alerts.nearest.map((alert) => (
                <Link key={alert.id} href={alert.href} className="block rounded-lg bg-background px-3 py-3 transition hover:bg-primary/5">
                  <p className="font-semibold text-navy">{alert.title}</p>
                  <p className="text-xs text-text-muted">
                    {alert.expiryDate} · {formatNumber(alert.daysRemaining, locale)} يوم
                  </p>
                </Link>
              ))}
              {data.alerts.nearest.length === 0 ? (
                <p className="rounded-lg bg-background px-3 py-4 text-sm text-text-muted">
                  لا توجد تنبيهات قريبة.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <SectionTitle icon="activity" title="الوقود المحلي" subtitle="لا يتم استدعاء Kafaratplus من الصفحة الرئيسية" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniStat label="عمليات" value={data.fuel.operations} locale={locale} />
              <MiniStat label="المبلغ" value={data.fuel.amountSar} locale={locale} />
              <MiniStat label="مناديب" value={data.fuel.matchedDrivers} locale={locale} />
            </div>
          </div>
        </div>
      </section>

      <details className="rounded-lg border border-border bg-surface p-5 text-sm text-text-muted shadow-sm">
        <summary className="cursor-pointer font-semibold text-navy">مصادر البيانات وتعريفات المؤشرات</summary>
        <ul className="mt-3 list-inside list-disc space-y-1">
          {data.definitions.map((definition) => (
            <li key={definition}>{definition}</li>
          ))}
        </ul>
        <p className="mt-3">
          أبطأ قسم: {data.slowestSectionMs.name} ({formatNumber(data.slowestSectionMs.duration, locale)}ms)
        </p>
      </details>
    </div>
  );
}

export function KpiCard({ metric }: { metric: ExecutiveDashboardProps["data"]["kpis"][number] }) {
  const icon = metricIcons[metric.id] ?? "activity";
  const toneClass =
    metric.tone === "danger"
      ? "border-danger/30 bg-danger/5"
      : metric.tone === "warning"
        ? "border-amber-300 bg-amber-50"
        : metric.tone === "success"
          ? "border-emerald-300 bg-emerald-50"
          : "border-border bg-surface";
  const iconClass =
    metric.tone === "danger"
      ? "bg-danger/10 text-danger"
      : metric.tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : metric.tone === "success"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-primary-soft text-primary";
  const content = (
    <div className={`min-h-32 rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${metric.href ? "cursor-pointer" : ""} ${toneClass}`}>
      <div className="flex items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <DashboardIcon name={icon} className="size-5" />
        </span>
        <p className="text-sm font-medium text-text-muted">{metric.label}</p>
      </div>
      <p className="mt-5 text-3xl font-bold leading-none tabular-nums text-navy">{metric.value.toLocaleString("ar-SA")}</p>
      {metric.helper ? <p className="mt-2 text-sm font-medium text-primary">{metric.helper}</p> : null}
    </div>
  );

  return metric.href ? <Link href={metric.href}>{content}</Link> : content;
}

export function SectionTitle({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon?: DashboardIconName;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <DashboardIcon name={icon} className="size-5" />
        </span>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold text-navy">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium text-navy">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 rounded-full bg-background">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      </div>
    </div>
  );
}

export function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background px-3 py-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <strong className="font-semibold text-navy">{value}</strong>
    </div>
  );
}

export function RankCard({
  title,
  subtitle,
  empty,
  children,
  icon,
}: {
  title: string;
  subtitle: string;
  empty: string;
  children: ReactNode;
  icon?: DashboardIconName;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <SectionTitle title={title} subtitle={subtitle} icon={icon} />
      <div className="mt-4 space-y-2">
        {hasChildren ? children : <p className="rounded-lg bg-background px-3 py-4 text-sm text-text-muted">{empty}</p>}
      </div>
    </div>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  const isMedalRank = rank <= 3;
  return (
    <span className={`flex size-10 items-center justify-center rounded-lg text-sm font-bold leading-none ${
      isMedalRank ? "bg-primary-soft text-primary" : "bg-background text-navy"
    }`}>
      {rank === 1 ? <DashboardIcon name="trophy" className="size-5" /> : `#${rank}`}
    </span>
  );
}

export function DashboardIcon({
  name,
  className,
}: {
  name: DashboardIconName;
  className?: string;
}) {
  const shared = {
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  return (
    <svg {...shared}>
      {name === "building" ? (
        <>
          <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          <path d="M16 8h2a2 2 0 0 1 2 2v11" />
          <path d="M8 7h4M8 11h4M8 15h4M3 21h18" />
        </>
      ) : name === "users" ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ) : name === "userCheck" ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="m16 11 2 2 4-4" />
        </>
      ) : name === "car" ? (
        <>
          <path d="M5 17h14M7 17v2M17 17v2M6 13l1.4-4.2A3 3 0 0 1 10.25 7h3.5a3 3 0 0 1 2.85 1.8L18 13" />
          <path d="M5 13h14v4H5z" />
          <path d="M8 15h.01M16 15h.01" />
        </>
      ) : name === "pause" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8v8M14 8v8" />
        </>
      ) : name === "home" ? (
        <>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </>
      ) : name === "bed" ? (
        <>
          <path d="M4 11V5M20 13v6M4 19v-8h16v8M4 15h16" />
          <path d="M8 11V9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
        </>
      ) : name === "clipboard" ? (
        <>
          <path d="M9 3h6l1 2h3v16H5V5h3l1-2Z" />
          <path d="M9 9h6M9 13h6M9 17h3" />
        </>
      ) : name === "clock" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : name === "warning" ? (
        <>
          <path d="m12 3 10 18H2L12 3Z" />
          <path d="M12 9v5M12 17h.01" />
        </>
      ) : name === "chart" ? (
        <>
          <path d="M4 19V5M4 19h16" />
          <path d="M8 16V9M12 16V6M16 16v-4" />
        </>
      ) : name === "trophy" ? (
        <>
          <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
          <path d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 12v5M9 21h6M10 17h4" />
        </>
      ) : (
        <>
          <path d="M4 12h4l2-6 4 12 2-6h4" />
          <path d="M4 19h16" />
        </>
      )}
    </svg>
  );
}

export function MiniStat({
  label,
  value,
  locale,
  tone = "default",
}: {
  label: string;
  value: number;
  locale: Locale;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-amber-700" : "text-navy";
  return (
    <div className="rounded-lg bg-background px-3 py-3 text-center">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className={`mt-2 text-xl font-bold leading-none tabular-nums ${toneClass}`}>{formatNumber(value, locale)}</p>
    </div>
  );
}

export function formatNumber(value: number, locale: Locale) {
  return value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
}

export function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
