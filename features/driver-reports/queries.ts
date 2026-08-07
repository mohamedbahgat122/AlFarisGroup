import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getDriverFuelMetricsForReport, getMonthToDateRange } from "@/features/driver-reports/fuel-metrics";
import type {
  DriverReport,
  DriverReportDriverExpiries,
  DriverMonthlyReportMetrics,
  DriverReportRow,
  DriverReportsQueryResult,
} from "@/features/driver-reports/types";
import type { Database } from "@/types/database";

type ReportRow = Database["public"]["Tables"]["driver_daily_reports"]["Row"];
type ReportMetricRow =
  Database["public"]["Tables"]["driver_daily_report_rows"]["Row"];
type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name"
>;
type DriverExpiryRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "is_company_sponsored"
  | "keeta_vehicle_plate_number"
  | "vehicle_number"
  | "iqama_expiry_date"
  | "driving_license_expiry_date"
  | "driver_card_expiry_date"
  | "vehicle_authorization_expiry_date"
  | "operating_card_expiry_date"
>;
type MonthlyReportMetricRow = Pick<
  ReportMetricRow,
  | "driver_id"
  | "report_date"
  | "attendance_status"
  | "delivered_tasks"
  | "valid_online_seconds"
>;
type DriverFuelMetricSelection = {
  dailyFuelQuantityLitres: number;
  dailyFuelAmountSar: number;
  monthlyFuelAmountSar: number;
};

export async function getDriverReportsForOrganization({
  organizationId,
  selectedDate,
}: {
  organizationId: string;
  selectedDate?: string;
}): Promise<DriverReportsQueryResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return {
      status: "unauthorized",
      report: null,
      dates: [],
    };
  }

  const datesPromise = admin.supabase
    .from("driver_daily_reports")
    .select("report_date, imported_at, imported_by_user_id")
    .eq("organization_id", organizationId)
    .order("report_date", { ascending: false });

  let reportQuery = admin.supabase
    .from("driver_daily_reports")
    .select(
      `
      id,
      organization_id,
      report_date,
      imported_at,
      imported_by_user_id,
      registered_active_drivers,
      present_drivers,
      absent_drivers,
      matched_ranking_rows,
      unmatched_performance_ids,
      unmatched_ranking_ids,
      drivers_missing_keeta_id
    `,
    )
    .eq("organization_id", organizationId);

  if (selectedDate) {
    reportQuery = reportQuery.eq("report_date", selectedDate);
  } else {
    reportQuery = reportQuery.order("report_date", { ascending: false }).limit(1);
  }

  const [
    { data: dateRows, error: datesError },
    { data: report, error: reportError },
  ] = await Promise.all([
    datesPromise,
    reportQuery.maybeSingle(),
  ]);

  if (datesError || reportError) {
    return {
      status: "load_error",
      report: null,
      dates: [],
    };
  }

  const dates = (dateRows ?? []).map((row) => ({
    reportDate: row.report_date,
    importedAt: row.imported_at,
    importedByName: null,
  }));
  const selectedDateAvailable = selectedDate
    ? dates.some((date) => date.reportDate === selectedDate)
    : true;

  if (!report) {
    return {
      status: "success",
      report: null,
      dates,
      selectedDateUnavailable: selectedDate ? !selectedDateAvailable : false,
    };
  }

  const { data: rows, error: rowsError } = await admin.supabase
    .from("driver_daily_report_rows")
    .select(
      `
      id,
      driver_id,
      driver_full_name,
      keeta_driver_id,
      attendance_status,
      accepted_tasks,
      delivered_tasks,
      rejected_tasks,
      valid_online_seconds,
      delivery_rate,
      level,
      city_ranking,
      ranking_percentage,
      mandatory_assignment_score,
      estimated_reward_amount,
      evaluation_on_time_rate,
      evaluation_completion_rate,
      not_early_delivery_confirmation_rate,
      evaluation_total_orders,
      on_time_rate,
      incomplete_orders,
      eligibility_status
    `,
    )
    .eq("report_id", report.id)
    .order("driver_full_name", { ascending: true });

  if (rowsError) {
    return {
      status: "load_error",
      report: null,
      dates: [],
    };
  }

  const driverIds = (rows ?? []).map((row) => row.driver_id);
  const monthlyRange = getMonthToDateRange(report.report_date);

  const [
    driverExpiries,
    fuelMetrics,
    monthlyMetricsResponse,
    importedByFullName,
  ] = await Promise.all([
    getDriverExpiriesById({
      organizationId,
      driverIds,
      supabase: admin.supabase,
    }),
    getDriverFuelMetricsForReport({
      organizationId,
      reportDate: report.report_date,
      driverIds,
      supabase: admin.supabase,
    }),
    admin.supabase
      .from("driver_daily_report_rows")
      .select(
        "driver_id, report_date, attendance_status, delivered_tasks, valid_online_seconds",
      )
      .eq("organization_id", organizationId)
      .in("driver_id", driverIds)
      .gte("report_date", monthlyRange.fromDate)
      .lte("report_date", monthlyRange.toDate),
    getImportedByName(report.imported_by_user_id, admin.supabase),
  ]);

  const monthlyMetrics = processMonthlyMetrics({
    driverIds,
    fromDate: monthlyRange.fromDate,
    toDate: monthlyRange.toDate,
    fuelMetricsByDriverId: fuelMetrics.metricsByDriverId,
    rows: monthlyMetricsResponse.data as unknown as MonthlyReportMetricRow[] | null,
    error: monthlyMetricsResponse.error,
  });

  if (!monthlyMetrics.available) {
    return {
      status: "load_error",
      report: null,
      dates: [],
    };
  }

  return {
    status: "success",
    report: mapReport(
      report as unknown as ReportRow,
      (rows ?? []) as unknown as ReportMetricRow[],
      importedByFullName,
      driverExpiries,
      fuelMetrics.available,
      fuelMetrics.metricsByDriverId,
      monthlyMetrics.metricsByDriverId,
    ),
    dates,
    selectedDateUnavailable: selectedDate ? !selectedDateAvailable : false,
  };
}



async function getDriverExpiriesById({
  organizationId,
  driverIds,
  supabase,
}: {
  organizationId: string;
  driverIds: string[];
  supabase: Awaited<ReturnType<typeof getAuthenticatedAdmin>>["supabase"];
}) {
  const uniqueDriverIds = Array.from(new Set(driverIds));
  const expiries = new Map<string, DriverReportDriverExpiries>();

  if (uniqueDriverIds.length === 0) {
    return expiries;
  }

  const { data, error } = await supabase
    .from("drivers")
    .select(
      [
        "id",
        "is_company_sponsored",
        "keeta_vehicle_plate_number",
        "vehicle_number",
        "iqama_expiry_date",
        "driving_license_expiry_date",
        "driver_card_expiry_date",
        "vehicle_authorization_expiry_date",
        "operating_card_expiry_date",
      ].join(", "),
    )
    .eq("organization_id", organizationId)
    .in("id", uniqueDriverIds);

  if (error) {
    return expiries;
  }

  for (const driver of (data ?? []) as unknown as DriverExpiryRow[]) {
    expiries.set(driver.id, {
      isCompanySponsored: driver.is_company_sponsored,
      actualVehiclePlateNumber: driver.vehicle_number,
      keetaDashboardPlateNumber: driver.keeta_vehicle_plate_number,
      iqamaExpiryDate: driver.iqama_expiry_date,
      drivingLicenseExpiryDate: driver.driving_license_expiry_date,
      driverCardExpiryDate: driver.driver_card_expiry_date,
      vehicleAuthorizationExpiryDate: driver.vehicle_authorization_expiry_date,
      operatingCardExpiryDate: driver.operating_card_expiry_date,
    });
  }

  return expiries;
}

async function getImportedByName(
  profileId: string | null,
  supabase: Awaited<ReturnType<typeof getAuthenticatedAdmin>>["supabase"],
) {
  if (!profileId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const profile = data as ProfileRow;
  return profile.full_name;
}

function processMonthlyMetrics({
  driverIds,
  fromDate,
  toDate,
  fuelMetricsByDriverId,
  rows,
  error,
}: {
  driverIds: string[];
  fromDate: string;
  toDate: string;
  fuelMetricsByDriverId: Map<string, DriverFuelMetricSelection>;
  rows: MonthlyReportMetricRow[] | null;
  error: unknown;
}): {
  available: boolean;
  metricsByDriverId: Map<string, DriverMonthlyReportMetrics>;
} {
  const uniqueDriverIds = Array.from(new Set(driverIds));
  const elapsedCalendarDays = countInclusiveDays(fromDate, toDate);
  const metricsByDriverId = new Map<string, DriverMonthlyReportMetrics>();

  for (const driverId of uniqueDriverIds) {
    const monthlyFuelAmountSar =
      fuelMetricsByDriverId.get(driverId)?.monthlyFuelAmountSar ?? 0;

    metricsByDriverId.set(
      driverId,
      createMonthlyMetrics({
        monthlyFuelAmountSar,
        elapsedCalendarDays,
      }),
    );
  }

  if (uniqueDriverIds.length === 0) {
    return { available: true, metricsByDriverId };
  }

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      const e = error as Record<string, unknown>;
      console.error("[driver-reports:monthly-metrics:load-failed]", {
        code: e?.code,
        message: e?.message,
      });
    }

    return { available: false, metricsByDriverId };
  }

  const absenceDatesByDriverId = new Map<string, Set<string>>();

  for (const row of (rows ?? [])) {
    const metric = metricsByDriverId.get(row.driver_id);

    if (!metric) {
      continue;
    }

    metric.monthlyOrders += row.delivered_tasks;
    metric.monthlyWorkingSeconds += row.valid_online_seconds;

    if (row.attendance_status === "absent") {
      const absenceDates =
        absenceDatesByDriverId.get(row.driver_id) ?? new Set<string>();
      absenceDates.add(row.report_date);
      absenceDatesByDriverId.set(row.driver_id, absenceDates);
    }
  }

  for (const [driverId, metric] of metricsByDriverId) {
    metric.monthlyAbsenceDays = absenceDatesByDriverId.get(driverId)?.size ?? 0;
    metric.monthlyAttendanceDays = Math.max(
      0,
      elapsedCalendarDays - metric.monthlyAbsenceDays,
    );
    metric.averageDailyFuelAmountSar =
      metric.monthlyAttendanceDays > 0
        ? metric.monthlyFuelAmountSar / metric.monthlyAttendanceDays
        : null;
    metric.averageDailyWorkingSeconds =
      metric.monthlyAttendanceDays > 0
        ? metric.monthlyWorkingSeconds / metric.monthlyAttendanceDays
        : null;
    metric.monthlyFuelRateSar =
      metric.monthlyOrders > 0
        ? metric.monthlyFuelAmountSar / metric.monthlyOrders
        : null;
  }

  return { available: true, metricsByDriverId };
}

function createMonthlyMetrics({
  monthlyFuelAmountSar,
  elapsedCalendarDays,
}: {
  monthlyFuelAmountSar: number;
  elapsedCalendarDays: number;
}): DriverMonthlyReportMetrics {
  return {
    monthlyOrders: 0,
    monthlyAbsenceDays: 0,
    monthlyAttendanceDays: elapsedCalendarDays,
    monthlyFuelAmountSar,
    averageDailyFuelAmountSar:
      elapsedCalendarDays > 0 ? monthlyFuelAmountSar / elapsedCalendarDays : null,
    monthlyWorkingSeconds: 0,
    averageDailyWorkingSeconds: elapsedCalendarDays > 0 ? 0 : null,
    monthlyFuelRateSar: null,
  };
}

function countInclusiveDays(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);

  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return 0;
  }

  return Math.floor((to - from) / 86_400_000) + 1;
}

function mapReport(
  report: ReportRow,
  rows: ReportMetricRow[],
  importedByFullName: string | null,
  driverExpiries: Map<string, DriverReportDriverExpiries>,
  fuelMetricsAvailable: boolean,
  fuelMetricsByDriverId: Map<string, DriverFuelMetricSelection>,
  monthlyMetricsByDriverId: Map<string, DriverMonthlyReportMetrics>,
): DriverReport {
  return {
    id: report.id,
    organizationId: report.organization_id,
    reportDate: report.report_date,
    importedAt: report.imported_at,
    importedByFullName,
    fuelMetricsAvailable,
    registeredActiveDrivers: report.registered_active_drivers,
    presentDrivers: report.present_drivers,
    absentDrivers: report.absent_drivers,
    matchedRankingRows: report.matched_ranking_rows,
    unmatchedPerformanceIds: report.unmatched_performance_ids,
    unmatchedRankingIds: report.unmatched_ranking_ids,
    driversMissingKeetaId: report.drivers_missing_keeta_id,
    rows: rows.map((row) =>
      mapReportRow(row, driverExpiries, fuelMetricsByDriverId, monthlyMetricsByDriverId),
    ),
  };
}

function mapReportRow(
  row: ReportMetricRow,
  driverExpiries: Map<string, DriverReportDriverExpiries>,
  fuelMetricsByDriverId: Map<string, DriverFuelMetricSelection>,
  monthlyMetricsByDriverId: Map<string, DriverMonthlyReportMetrics>,
): DriverReportRow {
  const fuelMetrics = fuelMetricsByDriverId.get(row.driver_id);
  const driverMetadata = driverExpiries.get(row.driver_id);
  const baseMonthlyMetrics = monthlyMetricsByDriverId.get(row.driver_id);
  const evaluationTotalOrders = toNullableInteger(row.evaluation_total_orders);
  const monthlyMetrics =
    baseMonthlyMetrics && evaluationTotalOrders !== null
      ? {
          ...baseMonthlyMetrics,
          monthlyOrders: evaluationTotalOrders,
          monthlyFuelRateSar:
            evaluationTotalOrders > 0
              ? baseMonthlyMetrics.monthlyFuelAmountSar / evaluationTotalOrders
              : null,
        }
      : baseMonthlyMetrics;

  return {
    id: row.id,
    driverId: row.driver_id,
    driverFullName: row.driver_full_name,
    keetaDriverId: row.keeta_driver_id,
    isCompanySponsored: driverMetadata?.isCompanySponsored ?? null,
    actualVehiclePlateNumber: driverMetadata?.actualVehiclePlateNumber ?? null,
    keetaDashboardPlateNumber: driverMetadata?.keetaDashboardPlateNumber ?? null,
    driverExpiries: driverMetadata ?? {
      isCompanySponsored: null,
      actualVehiclePlateNumber: null,
      keetaDashboardPlateNumber: null,
      iqamaExpiryDate: null,
      drivingLicenseExpiryDate: null,
      driverCardExpiryDate: null,
      vehicleAuthorizationExpiryDate: null,
      operatingCardExpiryDate: null,
    },
    attendanceStatus: row.attendance_status,
    acceptedTasks: row.accepted_tasks,
    deliveredTasks: row.delivered_tasks,
    rejectedTasks: row.rejected_tasks,
    validOnlineSeconds: row.valid_online_seconds,
    deliveryRate: row.delivery_rate === null ? null : Number(row.delivery_rate),
    level: row.level,
    cityRanking: row.city_ranking,
    rankingPercentage: toNullableNumber(row.ranking_percentage),
    mandatoryAssignmentScore: toNullableNumber(row.mandatory_assignment_score),
    estimatedRewardAmount: toNullableNumber(row.estimated_reward_amount),
    evaluationOnTimeRate: toNullableNumber(row.evaluation_on_time_rate),
    evaluationCompletionRate: toNullableNumber(row.evaluation_completion_rate),
    notEarlyDeliveryConfirmationRate: toNullableNumber(
      row.not_early_delivery_confirmation_rate,
    ),
    evaluationTotalOrders,
    onTimeRate: row.on_time_rate === null ? null : Number(row.on_time_rate),
    incompleteOrders: row.incomplete_orders,
    eligibilityStatus: row.eligibility_status,
    dailyFuelQuantityLitres: fuelMetrics?.dailyFuelQuantityLitres ?? 0,
    dailyFuelAmountSar: fuelMetrics?.dailyFuelAmountSar ?? 0,
    monthlyMetrics: monthlyMetrics ?? createMonthlyMetrics({
      monthlyFuelAmountSar: fuelMetrics?.monthlyFuelAmountSar ?? 0,
      elapsedCalendarDays: 0,
    }),
  };
}

function toNullableNumber(value: unknown) {
  if (value == null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNullableInteger(value: unknown) {
  const number = toNullableNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}
