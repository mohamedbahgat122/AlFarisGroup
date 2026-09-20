import "server-only";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverFuelMetricsForReport } from "@/features/driver-reports/fuel-metrics";
import type { DriverOrderReportExpiries, DriverOrderReportsQueryResult, DriverOrderReport } from "@/features/driver-order-reports/types";

export async function getDriverOrderReportsForOrganization({ organizationId, selectedDate }: { organizationId: string; selectedDate?: string }): Promise<DriverOrderReportsQueryResult> {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return { status: "unauthorized", report: null, dates: [] };
  const db = admin.supabase as any;
  const [{ data: dateRows, error: datesError }, { data: report, error: reportError }] = await Promise.all([
    db.from("driver_order_daily_reports").select("report_date").eq("organization_id", organizationId).order("report_date", { ascending: false }),
    selectedDate ? db.from("driver_order_daily_reports").select("*").eq("organization_id", organizationId).eq("report_date", selectedDate).maybeSingle() : db.from("driver_order_daily_reports").select("*").eq("organization_id", organizationId).order("report_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (datesError || reportError) return { status: "load_error", report: null, dates: [] };
  const dates = (dateRows ?? []).map((row: any) => row.report_date as string);
  if (!report) return { status: "success", report: null, dates, selectedDateUnavailable: Boolean(selectedDate && !dates.includes(selectedDate)) };
  const { data: rows, error: rowsError } = await db.from("driver_order_daily_report_rows").select("*").eq("report_id", report.id).order("driver_full_name", { ascending: true });
  if (rowsError) return { status: "load_error", report: null, dates: [] };
  const { data: importedBy } = report.imported_by_user_id
    ? await db.from("profiles").select("full_name").eq("id", report.imported_by_user_id).maybeSingle()
    : { data: null };
  const driverIds = (rows ?? []).map((row: any) => row.driver_id);
  const monthlyRange = getMonthToReportDateRange(report.report_date);
  const [{ data: drivers }, fuel, { data: monthlyOrderRows, error: monthlyOrderError }, { data: shifts, error: shiftsError }] = await Promise.all([
    db.from("drivers").select("id, is_company_sponsored, nfc_number, vehicle_id, keeta_vehicle_plate_number, iqama_expiry_date, driving_license_expiry_date, driver_card_expiry_date").eq("organization_id", organizationId).in("id", driverIds),
    getDriverFuelMetricsForReport({ organizationId, reportDate: report.report_date, driverIds, supabase: admin.supabase }),
    db.from("driver_order_daily_report_rows").select("driver_id, report_date, delivered_tasks").eq("organization_id", organizationId).in("driver_id", driverIds).gte("report_date", monthlyRange.fromDate).lte("report_date", monthlyRange.toDate),
    db.from("driver_shifts").select("driver_id, started_at, status, start_odometer_reading, end_odometer_reading, start_review_status, end_review_status").eq("organization_id", organizationId).in("driver_id", driverIds).gte("started_at", `${monthlyRange.fromDate}T00:00:00+03:00`).lt("started_at", `${nextDate(monthlyRange.toDate)}T00:00:00+03:00`),
  ]);
  const vehicleIds = Array.from(new Set((drivers ?? []).map((driver: any) => driver.vehicle_id).filter(Boolean))) as string[];
  let vehicles: Array<{ id: string; plate_number: string; authorization_expiry_date: string | null; operating_card_expiry_date: string | null }> = [];
  if (vehicleIds.length > 0) {
    try {
      const serviceClient = createAdminClient();
      const result = await serviceClient.from("fleet_vehicles").select("id, plate_number, authorization_expiry_date, operating_card_expiry_date").in("id", vehicleIds);
      vehicles = result.data ?? [];
    } catch {
      // Keep report data available when server credentials are not configured.
    }
  }
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const expiryMap = new Map<string, DriverOrderReportExpiries>((drivers ?? []).map((driver: any) => {
    const vehicle = driver.vehicle_id ? vehicleById.get(driver.vehicle_id) : undefined;
    return [driver.id, { isCompanySponsored: driver.is_company_sponsored, nfcNumber: driver.nfc_number, actualVehiclePlateNumber: vehicle?.plate_number ?? null, keetaDashboardPlateNumber: driver.keeta_vehicle_plate_number, iqamaExpiryDate: driver.iqama_expiry_date, drivingLicenseExpiryDate: driver.driving_license_expiry_date, driverCardExpiryDate: driver.driver_card_expiry_date, vehicleAuthorizationExpiryDate: vehicle?.authorization_expiry_date ?? null, operatingCardExpiryDate: vehicle?.operating_card_expiry_date ?? null }];
  }));
  const monthlyOrders = new Map<string, number>();
  for (const row of monthlyOrderRows ?? []) monthlyOrders.set(row.driver_id, (monthlyOrders.get(row.driver_id) ?? 0) + Number(row.delivered_tasks ?? 0));
  const distance = new Map<string, { daily: number; monthly: number }>();
  for (const shift of shifts ?? []) if (shift.status === "completed" && shift.start_odometer_reading != null && shift.end_odometer_reading != null && shift.end_odometer_reading >= shift.start_odometer_reading && shift.start_review_status !== "rejected" && shift.end_review_status !== "rejected") {
    const distanceKm = Number(shift.end_odometer_reading) - Number(shift.start_odometer_reading);
    const current = distance.get(shift.driver_id) ?? { daily: 0, monthly: 0 };
    current.monthly += distanceKm;
    if (formatRiyadhDate(shift.started_at) === report.report_date) current.daily += distanceKm;
    distance.set(shift.driver_id, current);
  }
  const mapped: DriverOrderReport = { id: report.id, organizationId: report.organization_id, reportDate: report.report_date, importedAt: report.imported_at, importedByFullName: importedBy?.full_name ?? null, unmatchedDriverIds: report.unmatched_driver_ids ?? [], invalidRowCount: report.invalid_row_count ?? 0, fuelMetricsAvailable: fuel.available, distanceMetricsAvailable: !shiftsError, monthlyOrderMetricsAvailable: !monthlyOrderError, rows: (rows ?? []).map((row: any) => ({ id: row.id, updatedAt: row.updated_at, driverId: row.driver_id, driverFullName: row.driver_full_name, keetaDriverId: row.keeta_driver_id, supervisor: row.supervisor, vehicleType: row.vehicle_type, courierType: row.courier_type, attendanceSummary: row.attendance_summary, onShift: row.on_shift, eligiblePartner: row.eligible_partner, driverConnectionDuration: row.driver_connection_duration, validOnlineDuration: row.valid_online_duration, peakOnlineDuration: row.peak_online_duration, acceptedTasks: Number(row.accepted_tasks ?? 0), restaurantTasks: Number(row.restaurant_tasks ?? 0), deliveredTasks: Number(row.delivered_tasks ?? 0), largeCompletedTasks: Number(row.large_completed_tasks ?? 0), rejectedTasks: Number(row.rejected_tasks ?? 0), driverRejectedTasks: Number(row.driver_rejected_tasks ?? 0), automaticRejectedTasks: Number(row.automatic_rejected_tasks ?? 0), deliveryCancellationRate: row.delivery_cancellation_rate == null ? null : Number(row.delivery_cancellation_rate), nonDeliveryCompletionRate: row.non_delivery_completion_rate == null ? null : Number(row.non_delivery_completion_rate), onTimeDeliveryRate: row.on_time_delivery_rate == null ? null : Number(row.on_time_delivery_rate), largeOrderOnTimeRate: row.large_order_on_time_rate == null ? null : Number(row.large_order_on_time_rate), averageDeliveryDuration: row.average_delivery_duration == null ? null : Number(row.average_delivery_duration), over55MinutesRate: row.over_55_minutes_rate == null ? null : Number(row.over_55_minutes_rate), lateTasks: Number(row.late_tasks ?? 0), veryLateTasks: Number(row.very_late_tasks ?? 0), sourceData: row.source_data ?? {}, driverExpiries: expiryMap.get(row.driver_id) ?? emptyExpiries(), dailyFuelQuantityLitres: fuel.metricsByDriverId.get(row.driver_id)?.dailyFuelQuantityLitres ?? 0, dailyFuelAmountSar: fuel.metricsByDriverId.get(row.driver_id)?.dailyFuelAmountSar ?? 0, dailyDistanceKm: !shiftsError ? distance.get(row.driver_id)?.daily ?? 0 : null, monthlyDeliveredOrders: !monthlyOrderError ? monthlyOrders.get(row.driver_id) ?? 0 : null, monthlyFuelAmountSar: fuel.available ? fuel.metricsByDriverId.get(row.driver_id)?.monthlyFuelAmountSar ?? 0 : null, monthlyDistanceKm: !shiftsError ? distance.get(row.driver_id)?.monthly ?? 0 : null })) };
  return { status: "success", report: mapped, dates, selectedDateUnavailable: Boolean(selectedDate && !dates.includes(selectedDate)) };
}
function nextDate(date: string) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
function getMonthToReportDateRange(date: string) { const [year, month] = date.split("-").map(Number); return { fromDate: `${year}-${String(month).padStart(2, "0")}-01`, toDate: date }; }
function formatRiyadhDate(value: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function emptyExpiries(): DriverOrderReportExpiries { return { isCompanySponsored: null, nfcNumber: null, actualVehiclePlateNumber: null, keetaDashboardPlateNumber: null, iqamaExpiryDate: null, drivingLicenseExpiryDate: null, driverCardExpiryDate: null, vehicleAuthorizationExpiryDate: null, operatingCardExpiryDate: null }; }
