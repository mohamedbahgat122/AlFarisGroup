"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import { importKeetaReportsAction } from "@/features/driver-reports/actions";
import { initialDriverReportImportActionState } from "@/features/driver-reports/action-state";
import { getExpiryStatus, type ExpiryStatus } from "@/features/drivers/expiry";
import type {
  DriverReport,
  DriverReportDateOption,
  DriverReportRow,
  ReportAttendanceStatus,
  ReportEligibilityStatus,
} from "@/features/driver-reports/types";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type DriversDictionary = Dictionary["dashboard"]["drivers"];

type DriverReportsClientProps = {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  report: DriverReport | null;
  dates: DriverReportDateOption[];
  selectedDateUnavailable: boolean;
  today: string;
};

type AttendanceFilter = "all" | ReportAttendanceStatus;
type EligibilityFilter = "all" | ReportEligibilityStatus | "not_available";
type LevelFilter = "all" | "A" | "B" | "C" | "D" | "unranked";

const PAGE_SIZE = 12;

export function DriverReportsClient({
  locale,
  dictionary,
  organization,
  report,
  dates,
  selectedDateUnavailable,
  today,
}: DriverReportsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] =
    useState<AttendanceFilter>("all");
  const [eligibilityFilter, setEligibilityFilter] =
    useState<EligibilityFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [page, setPage] = useState(1);
  const [isChangingDate, startDateTransition] = useTransition();
  const permissions = new Set(organization.permissionKeys);
  const canImport = permissions.has("driver_reports.import");

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (report?.rows ?? []).filter((row) => {
      const matchesSearch =
        !query ||
        row.driverFullName.toLowerCase().includes(query) ||
        (row.keetaDriverId ?? "").toLowerCase().includes(query);
      const matchesAttendance =
        attendanceFilter === "all" ||
        row.attendanceStatus === attendanceFilter;
      const matchesEligibility =
        eligibilityFilter === "all" ||
        (eligibilityFilter === "not_available"
          ? row.eligibilityStatus === null
          : row.eligibilityStatus === eligibilityFilter);
      const matchesLevel =
        levelFilter === "all" ||
        (levelFilter === "unranked" ? row.level === null : row.level === levelFilter);

      return (
        matchesSearch &&
        matchesAttendance &&
        matchesEligibility &&
        matchesLevel
      );
    });
  }, [attendanceFilter, eligibilityFilter, levelFilter, report?.rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (visiblePage - 1) * PAGE_SIZE,
    visiblePage * PAGE_SIZE,
  );

  function resetReportViewState() {
    setSearch("");
    setAttendanceFilter("all");
    setEligibilityFilter("all");
    setLevelFilter("all");
    setPage(1);
  }

  function handleDateChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("date", value);
    } else {
      params.delete("date");
    }

    resetReportViewState();
    startDateTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const handleImportSuccess = useCallback((message: string, reportDate?: string) => {
    setImportOpen(false);
    setToast({ tone: "success", message });
    if (reportDate) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", reportDate);
      resetReportViewState();
      router.push(`${pathname}?${params.toString()}`);
      router.refresh();
      return;
    }

    router.refresh();
  }, [pathname, router, searchParams]);

  const handleImportError = useCallback((message: string) => {
    setToast({ tone: "error", message });
  }, []);

  return (
    <>
      <UserToast locale={locale} toast={toast} onDismiss={() => setToast(null)} />
      <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <AccessBadge>{dictionary.currentOrganization}</AccessBadge>
            {!canImport ? <AccessBadge>{dictionary.viewOnly}</AccessBadge> : null}
          </div>
          <p className="text-sm font-semibold text-muted">{organization.name}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal text-navy">
            {dictionary.reportsTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.reportsDescription}
          </p>
          {report ? (
            <ReportMetadata
              locale={locale}
              dictionary={dictionary}
              report={report}
              savedReportCount={dates.length}
            />
          ) : null}
          {selectedDateUnavailable ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              {dictionary.reportSelectedUnavailable}
            </p>
          ) : null}
          {report && !report.fuelMetricsAvailable ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              {dictionary.reportFuelDataUnavailable}
            </p>
          ) : null}
        </div>
        {canImport ? (
          <Button
            type="button"
            onClick={() => setImportOpen(true)}
            className="w-full gap-2 sm:w-auto"
          >
            <UploadIcon />
            {dictionary.reportImportButton}
          </Button>
        ) : null}
      </div>

      <div className="space-y-5 px-5 py-6 sm:px-7">
        {report ? (
          <>
            <ImportSummary
              dictionary={dictionary}
              locale={locale}
              report={report}
            />
            <ReportControls
              dictionary={dictionary}
              locale={locale}
              dates={dates}
              selectedDate={report.reportDate}
              search={search}
              attendanceFilter={attendanceFilter}
              eligibilityFilter={eligibilityFilter}
              levelFilter={levelFilter}
              disabled={isChangingDate}
              onDateChange={handleDateChange}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              onAttendanceChange={(value) => {
                setAttendanceFilter(value);
                setPage(1);
              }}
              onEligibilityChange={(value) => {
                setEligibilityFilter(value);
                setPage(1);
              }}
              onLevelChange={(value) => {
                setLevelFilter(value);
                setPage(1);
              }}
            />
            {pageRows.length === 0 ? (
              <EmptyState
                title={dictionary.reportEmptyFilteredTitle}
                description={dictionary.reportEmptyFilteredDescription}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {pageRows.map((row) => (
                  <DriverReportCard
                    key={row.id}
                    locale={locale}
                    dictionary={dictionary}
                    row={row}
                    today={today}
                    fuelMetricsAvailable={report.fuelMetricsAvailable}
                    distanceMetricsAvailable={report.distanceMetricsAvailable}
                  />
                ))}
              </div>
            )}
            <Pagination
              dictionary={dictionary}
              page={visiblePage}
              totalPages={totalPages}
              onPrevious={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            />
          </>
        ) : (
          <EmptyState
            title={dictionary.reportEmptyTitle}
            description={dictionary.reportEmptyDescription}
          />
        )}
      </div>

      {importOpen && canImport ? (
        <ImportDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          onClose={() => setImportOpen(false)}
          onSuccess={handleImportSuccess}
          onError={handleImportError}
        />
      ) : null}
    </>
  );
}

function ReportMetadata({
  locale,
  dictionary,
  report,
  savedReportCount,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  report: DriverReport;
  savedReportCount: number;
}) {
  return (
    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted">
      <div>
        <dt className="inline">{dictionary.reportDate}: </dt>
        <dd className="inline text-navy">{formatDate(report.reportDate, locale)}</dd>
      </div>
      <div>
        <dt className="inline">{dictionary.reportImportedAt}: </dt>
        <dd className="inline text-navy">
          {formatDateTime(report.importedAt, locale)}
        </dd>
      </div>
      <div>
        <dt className="inline">{dictionary.reportImportedBy}: </dt>
        <dd className="inline text-navy">
          {report.importedByFullName ?? dictionary.notAvailable}
        </dd>
      </div>
      <div>
        <dt className="sr-only">{dictionary.reportSavedCount}</dt>
        <dd className="inline text-navy">
          {dictionary.reportSavedCount.replace(
            "{count}",
            formatNumber(savedReportCount, locale),
          )}
        </dd>
      </div>
    </dl>
  );
}

function ImportSummary({
  dictionary,
  locale,
  report,
}: {
  dictionary: DriversDictionary;
  locale: Locale;
  report: DriverReport;
}) {
  const items = [
    [dictionary.reportDate, formatDate(report.reportDate, locale)],
    [dictionary.reportRegisteredDrivers, report.registeredActiveDrivers],
    [dictionary.reportPresentDrivers, report.presentDrivers],
    [dictionary.reportAbsentDrivers, report.absentDrivers],
    [dictionary.reportMatchedRankingRows, report.matchedRankingRows],
    [dictionary.reportUnmatchedPerformanceIds, report.unmatchedPerformanceIds.length],
    [dictionary.reportUnmatchedRankingIds, report.unmatchedRankingIds.length],
    [dictionary.reportDriversMissingKeetaId, report.driversMissingKeetaId],
  ] as const;

  return (
    <section className="border border-emerald-200 bg-emerald-50/70 p-4">
      <h2 className="text-sm font-bold text-emerald-800">
        {dictionary.reportImportSummary}
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface px-3 py-2">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="mt-1 text-sm font-bold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      {report.unmatchedPerformanceIds.length > 0 ||
      report.unmatchedRankingIds.length > 0 ? (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer font-semibold text-navy">
            {dictionary.reportUnmatchedDetails}
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <UnknownIdList
              title={dictionary.reportUnmatchedPerformanceIds}
              ids={report.unmatchedPerformanceIds}
            />
            <UnknownIdList
              title={dictionary.reportUnmatchedRankingIds}
              ids={report.unmatchedRankingIds}
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function UnknownIdList({ title, ids }: { title: string; ids: string[] }) {
  return (
    <div>
      <p className="font-semibold text-navy">{title}</p>
      <p className="mt-1 break-words text-xs leading-5">
        {ids.length > 0 ? ids.join(", ") : "-"}
      </p>
    </div>
  );
}

function ReportControls({
  dictionary,
  locale,
  dates,
  selectedDate,
  search,
  attendanceFilter,
  eligibilityFilter,
  levelFilter,
  disabled,
  onDateChange,
  onSearchChange,
  onAttendanceChange,
  onEligibilityChange,
  onLevelChange,
}: {
  dictionary: DriversDictionary;
  locale: Locale;
  dates: DriverReportDateOption[];
  selectedDate: string;
  search: string;
  attendanceFilter: AttendanceFilter;
  eligibilityFilter: EligibilityFilter;
  levelFilter: LevelFilter;
  disabled: boolean;
  onDateChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onAttendanceChange: (value: AttendanceFilter) => void;
  onEligibilityChange: (value: EligibilityFilter) => void;
  onLevelChange: (value: LevelFilter) => void;
}) {
  const selectedIndex = dates.findIndex((date) => date.reportDate === selectedDate);
  const latestDate = dates[0]?.reportDate ?? "";
  const previousDate =
    selectedIndex >= 0 && selectedIndex + 1 < dates.length
      ? dates[selectedIndex + 1].reportDate
      : "";
  const nextDate =
    selectedIndex > 0 ? dates[selectedIndex - 1].reportDate : "";

  return (
    <section className="grid gap-3 border border-border bg-surface p-4 shadow-[0_16px_45px_rgba(16,35,63,0.05)] md:grid-cols-2 xl:grid-cols-6">
      <SelectControl
        label={dictionary.reportDateSelector}
        value={selectedDate}
        disabled={disabled}
        onChange={onDateChange}
      >
        {dates.map((date) => (
          <option key={date.reportDate} value={date.reportDate}>
            {formatDate(date.reportDate, locale)}
          </option>
        ))}
      </SelectControl>
      <div className="grid grid-cols-3 gap-2 md:col-span-2 xl:col-span-1 xl:self-end">
        <ReportDateNavButton
          label={dictionary.reportLatestAction}
          disabled={disabled || !latestDate || selectedDate === latestDate}
          onClick={() => onDateChange(latestDate)}
        />
        <ReportDateNavButton
          label={dictionary.reportPreviousAction}
          disabled={disabled || !previousDate}
          onClick={() => onDateChange(previousDate)}
        />
        <ReportDateNavButton
          label={dictionary.reportNextAction}
          disabled={disabled || !nextDate}
          onClick={() => onDateChange(nextDate)}
        />
      </div>
      <label className="space-y-2 md:col-span-2 xl:col-span-1">
        <span className="block text-sm font-semibold text-navy">
          {dictionary.reportSearch}
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={dictionary.reportSearchPlaceholder}
          className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
        />
      </label>
      <SelectControl
        label={dictionary.reportAttendanceFilter}
        value={attendanceFilter}
        onChange={(value) => onAttendanceChange(value as AttendanceFilter)}
      >
        <option value="all">{dictionary.reportFilterAll}</option>
        <option value="present">{dictionary.reportAttendance.present}</option>
        <option value="absent">{dictionary.reportAttendance.absent}</option>
      </SelectControl>
      <SelectControl
        label={dictionary.reportEligibilityFilter}
        value={eligibilityFilter}
        onChange={(value) => onEligibilityChange(value as EligibilityFilter)}
      >
        <option value="all">{dictionary.reportFilterAll}</option>
        <option value="eligible">{dictionary.reportEligibility.eligible}</option>
        <option value="not_eligible">
          {dictionary.reportEligibility.not_eligible}
        </option>
        <option value="not_available">{dictionary.notAvailable}</option>
      </SelectControl>
      <SelectControl
        label={dictionary.reportLevelFilter}
        value={levelFilter}
        onChange={(value) => onLevelChange(value as LevelFilter)}
      >
        <option value="all">{dictionary.reportFilterAll}</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
        <option value="D">D</option>
        <option value="unranked">{dictionary.reportUnranked}</option>
      </SelectControl>
    </section>
  );
}

function SelectControl({
  label,
  value,
  disabled = false,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-semibold text-navy">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
      >
        {children}
      </select>
    </label>
  );
}

function ReportDateNavButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-12 rounded-xl border border-border px-2 text-xs font-bold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function DriverReportCard({
  locale,
  dictionary,
  row,
  today,
  fuelMetricsAvailable,
  distanceMetricsAvailable,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  row: DriverReportRow;
  today: string;
  fuelMetricsAvailable: boolean;
  distanceMetricsAvailable: boolean;
}) {
  const [cardOpen, setCardOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const contentId = `driver-report-card-content-${row.id}`;
  const detailsId = `driver-report-ranking-details-${row.id}`;
  const labels = getDriverAnalyticsLabels(locale);
  const metrics = [
    {
      title: dictionary.reportMetrics.todayOrders,
      value: formatNumber(row.deliveredTasks, locale),
      icon: "packageCheck" as const,
    },
    {
      title: dictionary.reportMetrics.attendance,
      value: dictionary.reportAttendance[row.attendanceStatus],
      icon: row.attendanceStatus === "present" ? "userCheck" as const : "userX" as const,
    },
    {
      title: dictionary.reportMetrics.rejectedOrders,
      value: formatNumber(row.rejectedTasks, locale),
      icon: "ban" as const,
    },
    {
      title: dictionary.reportMetrics.onlineHours,
      value: formatDuration(row.validOnlineSeconds, locale),
      icon: "clock" as const,
      valueDir: "auto" as const,
    },
    {
      title: dictionary.reportMetrics.dailyFuelRate,
      value: formatFuelRate(
        row.dailyFuelAmountSar,
        row.deliveredTasks,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "gauge" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.dailyFuelCost,
      value: formatFuelAmount(
        row.dailyFuelAmountSar,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "fuel" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.deliveryRate,
      value: formatPercentage(row.deliveryRate, locale, dictionary.notAvailable),
      icon: "gauge" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.level,
      value: row.level ?? dictionary.reportUnranked,
      icon: "award" as const,
    },
    {
      title: dictionary.reportMetrics.cityRanking,
      value: formatPercentage(
        row.rankingPercentage,
        locale,
        dictionary.notAvailable,
      ),
      icon: "trophy" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.onTimeRate,
      value: formatPercentage(row.onTimeRate, locale, dictionary.notAvailable),
      icon: "clockCheck" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.incompleteOrders,
      value: formatNumber(row.incompleteOrders, locale),
      icon: "alertTriangle" as const,
    },
    {
      title: dictionary.reportMetrics.eligibility,
      value: row.eligibilityStatus
        ? dictionary.reportEligibility[row.eligibilityStatus]
        : dictionary.notAvailable,
      icon: row.eligibilityStatus === "eligible" ? "shieldCheck" as const : "shieldX" as const,
    },
  ];
  const monthlyMetrics = [
    {
      title: dictionary.reportMonthlyMetrics.monthlyOrders,
      value: formatNumber(row.monthlyMetrics.monthlyOrders, locale),
      icon: "packageCheck" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyAbsenceDays,
      value: formatNumber(row.monthlyMetrics.monthlyAbsenceDays, locale),
      icon: "userX" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyAttendanceDays,
      value: formatNumber(row.monthlyMetrics.monthlyAttendanceDays, locale),
      icon: "userCheck" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyFuel,
      value: formatFuelAmount(
        row.monthlyMetrics.monthlyFuelAmountSar,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "fuel" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.averageDailyFuel,
      value: formatOptionalFuelAmountWithUnit(
        row.monthlyMetrics.averageDailyFuelAmountSar,
        dictionary.reportMonthlyMetrics.fuelPerDayUnit,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "gauge" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyWorkingHours,
      value: formatDuration(row.monthlyMetrics.monthlyWorkingSeconds, locale),
      icon: "clock" as const,
      valueDir: "auto" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.averageDailyWorkingHours,
      value: formatOptionalDuration(
        row.monthlyMetrics.averageDailyWorkingSeconds,
        locale,
        dictionary,
        locale === "ar" ? "/ يوم" : "/ day",
      ),
      icon: "timer" as const,
      valueDir: "auto" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyFuelRate,
      value: formatOptionalFuelAmountWithUnit(
        row.monthlyMetrics.monthlyFuelRateSar,
        dictionary.fuelRateUnit,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "percent" as const,
      valueDir: "ltr" as const,
    },
  ];
  const todayAnalytics = [
    {
      title: dictionary.reportMetrics.todayOrders,
      value: formatNumber(row.deliveredTasks, locale),
      icon: "packageCheck" as const,
    },
    {
      title: dictionary.reportMetrics.onlineHours,
      value: formatDuration(row.validOnlineSeconds, locale),
      icon: "clock" as const,
      valueDir: "auto" as const,
    },
    {
      title: labels.todayDistance,
      value: formatDistance(row.dailyDistanceKm, locale, dictionary, distanceMetricsAvailable),
      icon: "gauge" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.dailyFuelCost,
      value: formatFuelAmount(
        row.dailyFuelAmountSar,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "fuel" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.dailyFuelRate,
      value: formatFuelRate(
        row.dailyFuelAmountSar,
        row.deliveredTasks,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "percent" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.attendance,
      value: dictionary.reportAttendance[row.attendanceStatus],
      icon: row.attendanceStatus === "present" ? "userCheck" as const : "userX" as const,
    },
  ];
  const monthAnalytics = [
    {
      title: dictionary.reportMonthlyMetrics.monthlyOrders,
      value: formatNumber(row.monthlyMetrics.monthlyOrders, locale),
      icon: "packageCheck" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyWorkingHours,
      value: formatDuration(row.monthlyMetrics.monthlyWorkingSeconds, locale),
      icon: "clock" as const,
      valueDir: "auto" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyAttendanceDays,
      value: formatNumber(row.monthlyMetrics.monthlyAttendanceDays, locale),
      icon: "userCheck" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyAbsenceDays,
      value: formatNumber(row.monthlyMetrics.monthlyAbsenceDays, locale),
      icon: "userX" as const,
    },
    {
      title: labels.monthDistance,
      value: formatDistance(
        row.monthlyMetrics.monthlyDistanceKm,
        locale,
        dictionary,
        distanceMetricsAvailable,
      ),
      icon: "gauge" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyFuel,
      value: formatFuelAmount(
        row.monthlyMetrics.monthlyFuelAmountSar,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "fuel" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.monthlyFuelRate,
      value: formatOptionalFuelAmountWithUnit(
        row.monthlyMetrics.monthlyFuelRateSar,
        dictionary.fuelRateUnit,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "percent" as const,
      valueDir: "ltr" as const,
    },
  ];
  const ratingAnalytics = [
    {
      title: dictionary.reportMetrics.level,
      value: row.level ?? dictionary.reportUnranked,
      icon: "award" as const,
    },
    {
      title: getRankingMetricLabel(row, labels),
      value: formatRankingMetric(row, locale, dictionary),
      icon: "trophy" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.deliveryRate,
      value: formatPercentage(row.deliveryRate, locale, dictionary.notAvailable),
      icon: "circleCheck" as const,
      valueDir: "ltr" as const,
    },
  ];
  const detailMetrics = [
    {
      title: dictionary.reportMetrics.rejectedOrders,
      value: formatNumber(row.rejectedTasks, locale),
      icon: "ban" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.averageDailyFuel,
      value: formatOptionalFuelAmountWithUnit(
        row.monthlyMetrics.averageDailyFuelAmountSar,
        dictionary.reportMonthlyMetrics.fuelPerDayUnit,
        locale,
        dictionary,
        fuelMetricsAvailable,
      ),
      icon: "fuel" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMonthlyMetrics.averageDailyWorkingHours,
      value: formatOptionalDuration(
        row.monthlyMetrics.averageDailyWorkingSeconds,
        locale,
        dictionary,
        labels.perDaySuffix,
      ),
      icon: "timer" as const,
      valueDir: "auto" as const,
    },
    {
      title: dictionary.reportMetrics.onTimeRate,
      value: formatPercentage(row.onTimeRate, locale, dictionary.notAvailable),
      icon: "clockCheck" as const,
      valueDir: "ltr" as const,
    },
    {
      title: dictionary.reportMetrics.incompleteOrders,
      value: formatNumber(row.incompleteOrders, locale),
      icon: "alertTriangle" as const,
    },
    {
      title: dictionary.reportMetrics.eligibility,
      value: row.eligibilityStatus
        ? dictionary.reportEligibility[row.eligibilityStatus]
        : dictionary.notAvailable,
      icon: row.eligibilityStatus === "eligible" ? "shieldCheck" as const : "shieldX" as const,
    },
  ];

  return (
    <article className="w-full overflow-hidden rounded-xl border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold text-navy">
            {row.driverFullName}
          </h2>
          <p className="mt-1 break-all text-xs font-semibold text-muted">
            {dictionary.keetaDriverId}:{" "}
            <span dir="ltr">
              {row.keetaDriverId ?? dictionary.notAvailable}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-row-reverse rtl:sm:flex-row">
          <button
            type="button"
            aria-expanded={cardOpen}
            aria-controls={contentId}
            aria-label={
              cardOpen
                ? dictionary.reportCardDetailsHide
                : dictionary.reportCardDetailsShow
            }
            onClick={() => setCardOpen((current) => !current)}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-navy transition hover:border-primary/35 hover:bg-primary-soft/50 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ChevronIcon open={cardOpen} />
          </button>
          <StatusBadge status={row.attendanceStatus} dictionary={dictionary} />
        </div>
      </div>
      {cardOpen ? (
        <div
          id={contentId}
          className="border-t border-border px-5 pb-5 motion-safe:animate-[driverReportAccordion_220ms_ease-out]"
        >
          <div className="pt-4">
            <DriverMetadataBadges dictionary={dictionary} locale={locale} row={row} />
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <ExpirySummary
              locale={locale}
              dictionary={dictionary}
              expiries={row.driverExpiries}
              today={today}
            />
          </div>
          <div className="mt-5 space-y-5">
            <AnalyticsSection title={labels.todaySection} metrics={todayAnalytics} />
            <AnalyticsSection title={labels.monthSection} metrics={monthAnalytics} />
            <AnalyticsSection
              title={labels.ratingSection}
              metrics={ratingAnalytics}
              columnsClassName="sm:grid-cols-2 lg:grid-cols-3"
            />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              aria-label={
                detailsOpen
                  ? dictionary.reportFullDetailsHide
                  : dictionary.reportFullDetailsShow
              }
              onClick={() => setDetailsOpen((current) => !current)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 text-sm font-bold text-navy transition hover:border-primary/35 hover:bg-primary-soft/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary">
                  <ReportIcon name="chartBar" />
                </span>
                <span className="truncate">
                  {detailsOpen
                    ? dictionary.reportFullDetailsHide
                    : dictionary.reportFullDetailsShow}
                </span>
              </span>
              <ChevronIcon open={detailsOpen} />
            </button>
            {detailsOpen ? (
              <div
                id={detailsId}
                className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                {detailMetrics.map((metric) => (
                  <RankingDetailCard
                    key={metric.title}
                    title={metric.title}
                    value={metric.value}
                    icon={metric.icon}
                    valueDir={metric.valueDir}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DriverMetadataBadges({
  dictionary,
  locale,
  row,
}: {
  dictionary: DriversDictionary;
  locale: Locale;
  row: DriverReportRow;
}) {
  const nfcLabel = locale === "ar" ? "رقم NFC" : "NFC Number";

  return (
    <div className="flex flex-wrap gap-2 xl:justify-end">
      <MetadataBadge
        label={dictionary.driverMetadata.companySponsored}
        value={
          row.isCompanySponsored === null
            ? dictionary.notAvailable
            : row.isCompanySponsored
              ? dictionary.yes
              : dictionary.no
        }
        tone={row.isCompanySponsored ? "positive" : "neutral"}
      />
      <MetadataBadge
        label={dictionary.driverMetadata.actualPlateNumber}
        value={row.actualVehiclePlateNumber ?? dictionary.notAvailable}
        valueDir={row.actualVehiclePlateNumber ? "ltr" : undefined}
      />
      <MetadataBadge
        label={nfcLabel}
        value={row.nfcNumber?.trim() ? row.nfcNumber : dictionary.notAvailable}
        valueDir={row.nfcNumber?.trim() ? "ltr" : undefined}
      />
      <MetadataBadge
        label={dictionary.driverMetadata.keetaDashboardPlate}
        value={row.keetaDashboardPlateNumber ?? dictionary.notAvailable}
        valueDir={row.keetaDashboardPlateNumber ? "ltr" : undefined}
      />
    </div>
  );
}

function MetadataBadge({
  label,
  tone = "neutral",
  value,
  valueDir,
}: {
  label: string;
  tone?: "neutral" | "positive";
  value: string;
  valueDir?: "ltr";
}) {
  return (
    <span
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm ${
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-primary-soft/50 text-muted"
      }`}
    >
      <MetadataIcon />
      <span className="font-semibold">{label}</span>
      <span dir={valueDir} className="font-bold text-navy">
        {value}
      </span>
    </span>
  );
}

function MetadataIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 7h16M7 4h10l2 3H5l2-3Zm-1 7h12v7H6v-7Zm3 3h6" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-5 shrink-0 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function RankingDetailCard({
  title,
  value,
  icon,
  valueDir,
}: {
  title: string;
  value: string;
  icon: ReportIconName;
  valueDir?: "ltr" | "rtl" | "auto";
}) {
  return (
    <div className="min-h-28 rounded-lg border border-border bg-background p-3.5 transition-colors hover:border-primary/25 hover:bg-primary-soft/40">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold leading-5 text-muted">{title}</h3>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary">
          <ReportIcon name={icon} />
        </span>
      </div>
      <p
        dir={valueDir}
        className="mt-4 break-words text-xl font-bold leading-7 text-navy"
      >
        {value}
      </p>
    </div>
  );
}

function AnalyticsSection({
  title,
  metrics,
  columnsClassName = "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
}: {
  title: string;
  metrics: {
    title: string;
    value: string;
    icon: ReportIconName;
    valueDir?: "ltr" | "rtl" | "auto";
  }[];
  columnsClassName?: string;
}) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      <div className={`mt-3 grid gap-3 ${columnsClassName}`}>
        {metrics.map((metric) => (
          <div
            key={metric.title}
            className="min-h-28 rounded-lg border border-border bg-background p-3.5 transition-colors hover:border-primary/25 hover:bg-primary-soft/40"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold leading-5 text-muted">
                {metric.title}
              </h4>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-primary">
                <ReportIcon name={metric.icon} />
              </span>
            </div>
            <p
              dir={metric.valueDir}
              className="mt-4 break-words text-2xl font-bold leading-8 text-navy"
            >
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExpirySummary({
  locale,
  dictionary,
  expiries,
  today,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  expiries: DriverReportRow["driverExpiries"];
  today: string;
}) {
  const items = [
    {
      title: dictionary.iqama,
      date: expiries.iqamaExpiryDate,
      icon: "idCard" as const,
    },
    {
      title: dictionary.drivingLicense,
      date: expiries.drivingLicenseExpiryDate,
      icon: "badgeCheck" as const,
    },
    {
      title: dictionary.driverCard,
      date: expiries.driverCardExpiryDate,
      icon: "creditCard" as const,
    },
    {
      title: dictionary.vehicleAuthorization,
      date: expiries.vehicleAuthorizationExpiryDate,
      icon: "fileCheck" as const,
    },
    {
      title: dictionary.operatingCard,
      date: expiries.operatingCardExpiryDate,
      icon: "fileCheck" as const,
    },
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <ExpiryCard
          key={item.title}
          locale={locale}
          dictionary={dictionary}
          today={today}
          title={item.title}
          date={item.date}
          icon={item.icon}
        />
      ))}
    </div>
  );
}

function ExpiryCard({
  locale,
  dictionary,
  today,
  title,
  date,
  icon,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  today: string;
  title: string;
  date: string | null;
  icon: ReportIconName;
}) {
  const status = date ? getExpiryStatus(date, today) : null;
  const state = getExpiryVisualState(status);

  return (
    <div
      className={`min-h-28 rounded-lg border p-3.5 ${state.cardClassName}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${state.iconClassName}`}
        >
          <ReportIcon name={icon} />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-xs font-bold text-muted">{title}</h3>
          <p className="mt-2 whitespace-nowrap text-sm font-bold text-navy">
            {date ? formatDate(date, locale) : dictionary.notAvailable}
          </p>
          <p className={`mt-1 whitespace-nowrap text-xs font-bold ${state.textClassName}`}>
            {status
              ? formatExpiryStatus(status, dictionary)
              : dictionary.notAvailable}
          </p>
        </div>
      </div>
    </div>
  );
}

function getExpiryVisualState(status: ExpiryStatus | null) {
  if (!status) {
    return {
      cardClassName: "border-border bg-background",
      iconClassName: "border-border bg-surface text-muted",
      textClassName: "text-muted",
    };
  }

  if (status.state === "expired") {
    return {
      cardClassName: "border-danger/25 bg-danger/5",
      iconClassName: "border-danger/20 bg-surface text-danger",
      textClassName: "text-danger",
    };
  }

  if (status.state === "today" || status.days <= 30) {
    return {
      cardClassName: "border-amber-200 bg-amber-50/70",
      iconClassName: "border-amber-200 bg-surface text-amber-700",
      textClassName: "text-amber-700",
    };
  }

  return {
    cardClassName: "border-emerald-200 bg-emerald-50/60",
    iconClassName: "border-emerald-200 bg-surface text-emerald-700",
    textClassName: "text-emerald-700",
  };
}

function StatusBadge({
  status,
  dictionary,
}: {
  status: ReportAttendanceStatus;
  dictionary: DriversDictionary;
}) {
  const present = status === "present";
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
        present
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {dictionary.reportAttendance[status]}
    </span>
  );
}

function Pagination({
  dictionary,
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  dictionary: DriversDictionary;
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-muted">
        {dictionary.reportPagination
          .replace("{page}", String(page))
          .replace("{total}", String(totalPages))}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-navy transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dictionary.previous}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-navy transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dictionary.next}
        </button>
      </div>
    </div>
  );
}

function ImportDialog({
  locale,
  dictionary,
  organization,
  onClose,
  onSuccess,
  onError,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  organization: AccessibleOrganization;
  onClose: () => void;
  onSuccess: (message: string, reportDate?: string) => void;
  onError: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    importKeetaReportsAction,
    initialDriverReportImportActionState,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const performanceInputRef = useRef<HTMLInputElement>(null);
  const rankingInputRef = useRef<HTMLInputElement>(null);
  const lastHandledSubmissionIdRef = useRef<string | null>(null);
  const [performanceFile, setPerformanceFile] = useState<File | null>(null);
  const [rankingFile, setRankingFile] = useState<File | null>(null);
  const [fileVersions, setFileVersions] = useState({
    performanceFile: 0,
    rankingFile: 0,
  });
  const [submittedFileVersions, setSubmittedFileVersions] = useState({
    performanceFile: 0,
    rankingFile: 0,
  });
  const [replacementConfirmationDismissed, setReplacementConfirmationDismissed] =
    useState(false);
  const [isReplacementPending, startReplacementTransition] = useTransition();
  const replacementConfirmationOpen =
    Boolean(state.requiresReplacement) && !replacementConfirmationDismissed;

  const clearFiles = useCallback(() => {
    setPerformanceFile(null);
    setRankingFile(null);
    setFileVersions({ performanceFile: 0, rankingFile: 0 });
    setSubmittedFileVersions({ performanceFile: 0, rankingFile: 0 });

    if (performanceInputRef.current) {
      performanceInputRef.current.value = "";
    }
    if (rankingInputRef.current) {
      rankingInputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    clearFiles();
    onClose();
  }, [clearFiles, onClose]);

  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLElement>("input, select, button, a")
      ?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const actionSubmissionId = state.submissionId;
  const actionStatus = state.status;
  const actionCode = state.status === "idle" ? undefined : state.code;
  const actionMessage = state.status === "idle" ? undefined : state.message;
  const actionReportDate =
    state.status === "success" || state.status === "validation_error"
      ? state.reportDate
      : undefined;

  useEffect(() => {
    if (
      !actionSubmissionId ||
      actionSubmissionId === lastHandledSubmissionIdRef.current
    ) {
      return;
    }

    lastHandledSubmissionIdRef.current = actionSubmissionId;

    if (actionCode === "duplicate_saved_report") {
      return;
    }

    if (actionStatus === "success" && actionReportDate) {
      onSuccess(actionMessage ?? dictionary.reportImportSuccess, actionReportDate);
      return;
    }

    if (actionStatus === "error") {
      onError(actionMessage ?? dictionary.reportErrors.import_failed);
    }
  }, [
    actionCode,
    actionMessage,
    actionReportDate,
    actionStatus,
    actionSubmissionId,
    dictionary.reportErrors.import_failed,
    dictionary.reportImportSuccess,
    onError,
    onSuccess,
  ]);

  function submitWithStoredFiles(formData: FormData) {
    setReplacementConfirmationDismissed(false);
    setSubmittedFileVersions(fileVersions);
    formData.delete("performanceFile");
    formData.delete("rankingFile");

    if (performanceFile) {
      formData.append("performanceFile", performanceFile);
    }
    if (rankingFile) {
      formData.append("rankingFile", rankingFile);
    }

    formAction(formData);
  }

  function submitReplacementWithStoredFiles() {
    if (!performanceFile || !rankingFile) {
      return;
    }

    setReplacementConfirmationDismissed(false);
    setSubmittedFileVersions(fileVersions);
    const formData = new FormData();
    formData.append("locale", locale);
    formData.append("organizationCode", organization.code);
    formData.append("replaceExisting", "true");
    formData.append("performanceFile", performanceFile);
    formData.append("rankingFile", rankingFile);

    startReplacementTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-report-import-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2
              id="driver-report-import-title"
              className="text-xl font-bold text-navy"
            >
              {dictionary.reportImportButton}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {organization.name}
            </p>
          </div>
          <button
            type="button"
            aria-label={dictionary.closeDialog}
            onClick={handleClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        </div>
        <form action={submitWithStoredFiles} className="space-y-5 px-5 py-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="organizationCode" value={organization.code} />
          <input
            type="hidden"
            name="replaceExisting"
            value="false"
          />
          {state.requiresReplacement && replacementConfirmationOpen ? (
            <ReplacementConfirmation
              locale={locale}
              dictionary={dictionary}
              reportDate={state.reportDate}
              disabled={
                isReplacementPending || !performanceFile || !rankingFile
              }
              onConfirm={submitReplacementWithStoredFiles}
              onCancel={() => setReplacementConfirmationDismissed(true)}
            />
          ) : null}
          <ReportFileField
            id="performanceFile"
            name="performanceFile"
            label={dictionary.reportPerformanceFile}
            description={dictionary.reportPerformanceFileDescription}
            locale={locale}
            file={performanceFile}
            inputRef={performanceInputRef}
            error={
              fileVersions.performanceFile >
              submittedFileVersions.performanceFile
                ? undefined
                : state.fieldErrors?.performanceFile
            }
            onFileChange={(file) => {
              setPerformanceFile(file);
              setReplacementConfirmationDismissed(false);
              setFileVersions((current) => ({
                ...current,
                performanceFile: current.performanceFile + 1,
              }));
            }}
            onRemove={() => {
              setPerformanceFile(null);
              setReplacementConfirmationDismissed(false);
              setFileVersions((current) => ({
                ...current,
                performanceFile: current.performanceFile + 1,
              }));
              if (performanceInputRef.current) {
                performanceInputRef.current.value = "";
              }
            }}
          />
          <ReportFileField
            id="rankingFile"
            name="rankingFile"
            label={dictionary.reportRankingFile}
            description={dictionary.reportRankingFileDescription}
            locale={locale}
            file={rankingFile}
            inputRef={rankingInputRef}
            error={
              fileVersions.rankingFile > submittedFileVersions.rankingFile
                ? undefined
                : state.fieldErrors?.rankingFile
            }
            onFileChange={(file) => {
              setRankingFile(file);
              setReplacementConfirmationDismissed(false);
              setFileVersions((current) => ({
                ...current,
                rankingFile: current.rankingFile + 1,
              }));
            }}
            onRemove={() => {
              setRankingFile(null);
              setReplacementConfirmationDismissed(false);
              setFileVersions((current) => ({
                ...current,
                rankingFile: current.rankingFile + 1,
              }));
              if (rankingInputRef.current) {
                rankingInputRef.current.value = "";
              }
            }}
          />
          <DialogActions
            cancel={dictionary.cancel}
            submit={dictionary.reportProcessAction}
            onCancel={handleClose}
          />
        </form>
      </div>
    </div>
  );
}

function ReplacementConfirmation({
  locale,
  dictionary,
  reportDate,
  disabled,
  onConfirm,
  onCancel,
}: {
  locale: Locale;
  dictionary: DriversDictionary;
  reportDate?: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const formattedDate = reportDate
    ? formatDate(reportDate, locale)
    : dictionary.notAvailable;

  return (
    <section
      aria-labelledby="driver-report-replace-title"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-900"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-surface text-amber-700">
          <ReportIcon name="alertTriangle" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="driver-report-replace-title"
            className="text-base font-bold text-amber-950"
          >
            {dictionary.reportReplaceTitle}
          </h3>
          <p className="mt-2 text-sm font-semibold leading-6">
            {dictionary.reportReplaceMessage.replace("{date}", formattedDate)}
          </p>
          <p className="mt-2 rounded-lg border border-amber-200 bg-surface/75 px-3 py-2 text-sm font-semibold leading-6">
            {dictionary.reportReplaceWarning}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-200 bg-surface px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {dictionary.cancel}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onConfirm}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-bold text-white transition hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dictionary.reportReplaceConfirmAction}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportFileField({
  id,
  name,
  label,
  description,
  locale,
  file,
  inputRef,
  error,
  onFileChange,
  onRemove,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  locale: Locale;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  error?: string;
  onFileChange: (file: File | null) => void;
  onRemove: () => void;
}) {
  const errorId = error ? `${id}-error` : undefined;
  const chooseText = locale === "ar" ? "اختيار ملف Excel" : "Choose Excel File";
  const removeText = locale === "ar" ? "إزالة" : "Remove";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-4">
      <label htmlFor={id} className="block text-sm font-bold text-navy">
        {label}
      </label>
      <p className="text-sm leading-6 text-muted">{description}</p>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept=".xlsx"
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={(event) => {
          onFileChange(event.currentTarget.files?.item(0) ?? null);
        }}
        className="sr-only"
      />
      <div
        className={`rounded-xl border bg-white px-4 py-3 text-sm text-navy ${
          error
            ? "border-danger"
            : "border-border"
        }`}
      >
        {file ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy">{file.name}</p>
              <p className="mt-1 text-xs font-semibold text-muted">
                {formatFileSize(file.size, locale)}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-navy transition hover:border-danger/35 hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {removeText}
            </button>
          </div>
        ) : (
          <label
            htmlFor={id}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-primary-soft px-4 text-sm font-bold text-primary transition hover:bg-primary/15 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
          >
            {chooseText}
          </label>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DialogActions({
  cancel,
  submit,
  onCancel,
}: {
  cancel: string;
  submit: string;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cancel}
      </button>
      <Button type="submit" disabled={pending}>
        {pending ? `${submit}...` : submit}
      </Button>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted">
        {description}
      </p>
    </div>
  );
}

function AccessBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted">
      {children}
    </span>
  );
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(value);
}

function getDriverAnalyticsLabels(locale: Locale) {
  return locale === "ar"
    ? {
        todaySection: "أداء اليوم",
        monthSection: "أداء الشهر",
        ratingSection: "التقييم والترتيب",
        todayDistance: "كيلومترات اليوم",
        monthDistance: "كيلومترات الشهر",
        cityRanking: "ترتيب المدينة",
        rankingPercentage: "نسبة ترتيب المدينة",
        perDaySuffix: "/ يوم",
        kmUnit: "كم",
      }
    : {
        todaySection: "Today's Performance",
        monthSection: "Monthly Performance",
        ratingSection: "Rating and Ranking",
        todayDistance: "Today's Kilometers",
        monthDistance: "Monthly Kilometers",
        cityRanking: "City Ranking",
        rankingPercentage: "City Ranking Percentage",
        perDaySuffix: "/ day",
        kmUnit: "km",
      };
}

function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getNumberLocale(locale: Locale) {
  return locale === "ar" ? "ar-SA" : "en-US";
}

function formatFuelAmount(
  value: number,
  locale: Locale,
  dictionary: DriversDictionary,
  available: boolean,
) {
  if (!available) {
    return dictionary.fuelMetricUnavailable;
  }

  return `${new Intl.NumberFormat(getNumberLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${dictionary.fuelSarUnit}`;
}

function formatDistance(
  value: number | null,
  locale: Locale,
  dictionary: DriversDictionary,
  available: boolean,
) {
  if (!available || !isValidFiniteNumber(value)) {
    return dictionary.notAvailable;
  }

  return `${new Intl.NumberFormat(getNumberLocale(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)} ${getDriverAnalyticsLabels(locale).kmUnit}`;
}

function getRankingMetricLabel(
  row: DriverReportRow,
  labels: ReturnType<typeof getDriverAnalyticsLabels>,
) {
  return row.cityRanking === null ? labels.rankingPercentage : labels.cityRanking;
}

function formatRankingMetric(
  row: DriverReportRow,
  locale: Locale,
  dictionary: DriversDictionary,
) {
  if (row.cityRanking !== null) {
    return `#${formatNumber(row.cityRanking, locale)}`;
  }

  return formatPercentage(row.rankingPercentage, locale, dictionary.notAvailable);
}

function formatOptionalFuelAmountWithUnit(
  value: number | null,
  unit: string,
  locale: Locale,
  dictionary: DriversDictionary,
  available: boolean,
) {
  if (!available || !isValidFiniteNumber(value)) {
    return dictionary.notAvailable;
  }

  return `${new Intl.NumberFormat(getNumberLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} ${unit}`;
}

function formatFuelRate(
  dailyFuelAmountSar: number,
  dailyOrdersCount: number,
  locale: Locale,
  dictionary: DriversDictionary,
  available: boolean,
) {
  if (!available || dailyOrdersCount <= 0) {
    return dictionary.fuelMetricUnavailable;
  }

  const rate = dailyFuelAmountSar / dailyOrdersCount;

  if (!Number.isFinite(rate)) {
    return dictionary.fuelMetricUnavailable;
  }

  return `${new Intl.NumberFormat(getNumberLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate)} ${dictionary.fuelRateUnit}`;
}

function formatOptionalDuration(
  seconds: number | null,
  locale: Locale,
  dictionary: DriversDictionary,
  suffix?: string,
) {
  if (!isValidFiniteNumber(seconds)) {
    return dictionary.notAvailable;
  }

  const value = formatDuration(Math.round(seconds), locale);
  return suffix ? `${value} ${suffix}` : value;
}

function formatFileSize(bytes: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    style: "unit",
    unit: "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: bytes < 1024 * 1024 ? 0 : 1,
  }).format(bytes / 1024);
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPercentage(
  value: number | null,
  locale: Locale,
  fallback: string,
) {
  if (value === null) {
    return fallback;
  }

  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDuration(seconds: number, locale: Locale) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (locale === "en") {
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return "<1m";
  }

  if (hours > 0 && minutes > 0) {
    return `${hours} ساعة و${minutes} دقيقة`;
  }
  if (hours > 0) {
    return `${hours} ساعات`;
  }
  if (minutes > 0) {
    return `${minutes} دقيقة`;
  }
  return "أقل من دقيقة";
}

function formatExpiryStatus(status: ExpiryStatus, dictionary: DriversDictionary) {
  switch (status.state) {
    case "valid":
      return dictionary.daysRemaining.replace("{days}", String(status.days));
    case "today":
      return dictionary.expiresToday;
    case "expired":
      return dictionary.daysExpired.replace("{days}", String(status.days));
  }
}

type ReportIconName =
  | "alertTriangle"
  | "award"
  | "badgeCheck"
  | "ban"
  | "chartBar"
  | "circleCheck"
  | "clock"
  | "clockCheck"
  | "creditCard"
  | "fileCheck"
  | "fuel"
  | "gauge"
  | "idCard"
  | "packageCheck"
  | "percent"
  | "shieldCheck"
  | "shieldX"
  | "timer"
  | "trophy"
  | "userCheck"
  | "userX";

function ReportIcon({ name }: { name: ReportIconName }) {
  const paths: Record<ReportIconName, React.ReactNode> = {
    alertTriangle: <path d="M12 4 3 20h18L12 4Zm0 6v4m0 3h.01" />,
    award: <path d="M8 21l4-2 4 2v-6M7 8a5 5 0 1 0 10 0A5 5 0 0 0 7 8Z" />,
    badgeCheck: <path d="m8.5 12 2.2 2.2L15.8 9M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7l7-4Z" />,
    ban: <path d="M6 6l12 12M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    chartBar: <path d="M4 19h16M7 16V9m5 7V5m5 11v-4" />,
    circleCheck: <path d="m8.5 12 2.2 2.2L15.8 9M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    clock: <path d="M12 7v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    clockCheck: <path d="M12 7v5l2 1M9 18l2 2 4-4M20 12a8 8 0 1 0-8 8" />,
    creditCard: <path d="M4 7h16v10H4V7Zm0 3h16M7 14h4" />,
    fileCheck: <path d="M7 3h7l4 4v14H7V3Zm7 0v5h5M9 15l2 2 4-5" />,
    fuel: <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M8 7h4m3 1h2l2 2v7a2 2 0 0 0 4 0v-5l-3-3" />,
    gauge: <path d="M5 16a7 7 0 1 1 14 0M12 16l4-5M8 20h8" />,
    idCard: <path d="M4 6h16v12H4V6Zm3 4h4M7 14h4M14 11h3M14 15h3" />,
    packageCheck: <path d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M9 15l2 2 4-5" />,
    percent: <path d="M19 5 5 19M7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
    shieldCheck: <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-3 8 2 2 4-5" />,
    shieldX: <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-2 6 4 4m0-4-4 4" />,
    timer: <path d="M10 2h4M12 14l3-3M18 5l2 2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    trophy: <path d="M8 4h8v4a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 3m8-3h3a3 3 0 0 1-3 3M12 12v5m-3 4h6m-8 0h10" />,
    userCheck: <path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-5 9a5 5 0 0 1 10 0m3-5 2 2 4-5" />,
    userX: <path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-5 9a5 5 0 0 1 10 0m4-6 4 4m0-4-4 4" />,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 4v11m0-11 4 4m-4-4-4 4M5 15v3h14v-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
