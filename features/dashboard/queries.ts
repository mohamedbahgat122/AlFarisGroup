import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBusinessDateString } from "@/features/drivers/expiry";
import { getSystemExpiryAlertsForDashboard } from "@/features/expiry-alerts/queries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import { getGlobalPermissions } from "@/features/permissions/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { Database } from "@/types/database";
import type { Locale } from "@/types/locale";
import type {
  DashboardActivityLeader,
  DashboardDriverPerformance,
  DashboardMetric,
  DashboardOrganizationOverview,
  DashboardTrendPoint,
  ExecutiveDashboardData,
  ExecutiveDashboardRange,
  OrganizationDashboardData,
} from "@/features/dashboard/types";

type Supabase = SupabaseClient<Database>;
type DriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "full_name"
  | "organization_id"
  | "status"
  | "deleted_at"
  | "is_company_sponsored"
  | "vehicle_number"
  | "iqama_expiry_date"
  | "driving_license_expiry_date"
  | "driver_card_expiry_date"
  | "vehicle_authorization_expiry_date"
  | "operating_card_expiry_date"
>;
type FleetVehicleRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  | "id"
  | "assigned_driver_id"
  | "assigned_organization_id"
  | "archived_at"
  | "technical_status"
  | "fault_location"
  | "operational_status"
  | "operating_card_expiry_date"
  | "vehicle_category"
>;
type HousingUnitRow = Pick<Database["public"]["Tables"]["housing_units"]["Row"], "id" | "capacity" | "status" | "archived_at">;
type HousingRoomRow = Pick<Database["public"]["Tables"]["housing_rooms"]["Row"], "id" | "housing_id" | "capacity" | "status" | "archived_at">;
type HousingAssignmentRow = Pick<Database["public"]["Tables"]["housing_driver_assignments"]["Row"], "driver_id" | "housing_id" | "unassigned_at">;
type HousingOrganizationAssignmentRow = Pick<Database["public"]["Tables"]["housing_organization_assignments"]["Row"], "housing_id" | "organization_id" | "active" | "unassigned_at">;
type AppRequestRow = Pick<Database["public"]["Tables"]["driver_app_requests"]["Row"], "driver_id" | "organization_id" | "request_type" | "status" | "submitted_at">;
type ShiftRow = Pick<
  Database["public"]["Tables"]["driver_shifts"]["Row"],
  | "driver_id"
  | "organization_id"
  | "status"
  | "started_at"
  | "ended_at"
  | "start_odometer_reading"
  | "end_odometer_reading"
  | "start_photo_path"
  | "end_photo_path"
>;
type ReportRow = Pick<
  Database["public"]["Tables"]["driver_daily_report_rows"]["Row"],
  | "driver_id"
  | "driver_full_name"
  | "organization_id"
  | "report_date"
  | "attendance_status"
  | "delivered_tasks"
  | "accepted_tasks"
  | "delivery_rate"
  | "evaluation_completion_rate"
  | "mandatory_assignment_score"
  | "not_early_delivery_confirmation_rate"
>;
type FuelTransactionRow = Pick<
  Database["public"]["Tables"]["fuel_transactions"]["Row"],
  "driver_id" | "driver_name_snapshot" | "organization_id" | "amount_sar" | "fuel_date"
>;

const rangeValues = new Set([1, 7, 30]);

export async function getOrganizationDashboardData({
  locale,
  organization,
  range,
}: {
  locale: Locale;
  organization: AccessibleOrganization;
  range?: string;
}): Promise<OrganizationDashboardData> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized" };
  }

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  const selectedRange = parseRange(range);
  const today = getBusinessDateString();
  const period = buildPeriod(selectedRange, today);
  const organizationIds = [organization.id];
  const canViewDrivers = organization.permissionKeys.includes("drivers.view");
  const canViewRequests = organization.permissionKeys.includes("app_requests.view");
  const canViewShifts = organization.permissionKeys.includes("shifts.view");
  const canViewReports = organization.permissionKeys.includes("driver_reports.view");
  const canViewFleet =
    admin.profile.role === "system_owner" ||
    globalPermissions.has("fleet.view") ||
    organization.permissionKeys.includes("fleet.cars.view") ||
    organization.permissionKeys.includes("fleet.motorcycles.view");
  const canViewHousing = admin.profile.role === "system_owner" || globalPermissions.has("housing.view");

  const [
    drivers,
    fleet,
    housing,
    appRequests,
    shifts,
    reports,
    pendingRequests,
    alertsResult,
  ] = await Promise.all([
    loadDrivers(admin.supabase, canViewDrivers ? organizationIds : []),
    loadFleet(admin.supabase, organizationIds, canViewFleet, false, true),
    loadHousingForOrganization(admin.supabase, organization.id, canViewHousing),
    loadAppRequests(admin.supabase, canViewRequests ? organizationIds : [], period.from, period.to),
    loadShifts(admin.supabase, canViewShifts ? organizationIds : [], today),
    loadDriverReports(admin.supabase, canViewReports ? organizationIds : [], period.from, period.to),
    loadPendingRequests(admin.supabase, canViewRequests ? organizationIds : []),
    getSystemExpiryAlertsForDashboard({
      supabase: admin.supabase,
      profile: admin.profile,
      organizations: [organization],
      locale,
      today,
    }),
  ]);

  const activeDrivers = drivers.rows.filter((driver) => driver.status === "active" && !driver.deleted_at);
  const activeDriverIds = new Set(activeDrivers.map((driver) => driver.id));
  const driverNameById = new Map(drivers.rows.map((driver) => [driver.id, driver.full_name]));
  const organizationById = new Map([[organization.id, organization]]);
  const housingAssignmentsForOrganization = housing.assignments.filter((assignment) =>
    activeDriverIds.has(assignment.driver_id),
  );
  const housedDriverIds = new Set(housingAssignmentsForOrganization.map((assignment) => assignment.driver_id));
  const driverMetrics = buildDriverMetrics(drivers.rows, housedDriverIds, today);
  const fleetMetrics = buildFleetMetrics(fleet.rows, today);
  const housingMetrics = buildHousingMetrics(housing.units, housing.rooms, housingAssignmentsForOrganization);
  const requestMetrics = {
    ...buildRequestMetrics(appRequests.rows, period.dates, today),
    pending: pendingRequests.rows.length,
  };
  const shiftMetrics = buildShiftMetrics(shifts.rows);
  const topPerformanceDrivers = buildTopPerformanceDrivers(reports.rows, organizationById);
  const activityLeaders = buildActivityLeaders(reports.rows, shifts.rows, appRequests.rows, organizationById, driverNameById);
  const alerts = alertsResult.status === "success"
    ? {
        expired: alertsResult.summary.expired,
        critical: alertsResult.summary.critical,
        warning: alertsResult.summary.warning,
        total: alertsResult.totalCount,
        nearest: alertsResult.alerts.slice(0, 8),
      }
    : { expired: 0, critical: 0, warning: 0, total: 0, nearest: [] };

  return {
    status: "success",
    organization,
    range: selectedRange,
    lastUpdated: new Date().toISOString(),
    kpis: buildOrganizationKpis({
      locale,
      organization,
      driverMetrics,
      fleetMetrics,
      housingMetrics,
      requestMetrics,
      shiftMetrics,
      alerts,
      canViewFleet,
      canViewHousing,
    }),
    requests: requestMetrics,
    fleet: {
      status: canViewFleet ? "success" : "unavailable",
      ...fleetMetrics,
    },
    drivers: driverMetrics,
    shifts: shiftMetrics,
    housing: {
      status: canViewHousing ? "success" : "unavailable",
      ...housingMetrics,
    },
    alerts,
    topPerformanceDrivers,
    activityLeaders,
    quickActions: buildOrganizationQuickActions(locale, organization),
    definitions: [
      "Organization scope: every query is filtered to the current organization id or assigned organization id.",
      "Drivers: drivers.organization_id equals the current organization.",
      "Fleet: fleet_vehicles.assigned_organization_id equals the current organization.",
      "Requests: driver_app_requests.organization_id equals the current organization.",
      "Shifts: driver_shifts.organization_id equals the current organization and started today.",
      "Housing: active housing organization assignments plus active driver assignments for this organization.",
      "Alerts: centralized expiry alerts called with only the current organization.",
    ],
  };
}

export async function getExecutiveDashboardData({
  locale,
  organization,
  range,
}: {
  locale: Locale;
  organization?: string;
  range?: string;
}): Promise<ExecutiveDashboardData> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized" };
  }

  const organizationsResult = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );

  if (organizationsResult.status !== "success") {
    return { status: "load_error" };
  }

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  const selectedRange = parseRange(range);
  const selectedOrganizations = selectOrganizations(
    organizationsResult.organizations,
    organization,
  );
  const selectedOrganizationIds = selectedOrganizations.map((item) => item.id);
  const driverOrganizationIds = selectedOrganizations
    .filter((item) => item.permissionKeys.includes("drivers.view"))
    .map((item) => item.id);
  const appRequestOrganizationIds = selectedOrganizations
    .filter((item) => item.permissionKeys.includes("app_requests.view"))
    .map((item) => item.id);
  const shiftOrganizationIds = selectedOrganizations
    .filter((item) => item.permissionKeys.includes("shifts.view"))
    .map((item) => item.id);
  const reportOrganizationIds = selectedOrganizations
    .filter((item) => item.permissionKeys.includes("driver_reports.view"))
    .map((item) => item.id);
  const fuelOrganizationIds = selectedOrganizations
    .filter((item) => item.permissionKeys.includes("fuel.manage") || item.permissionKeys.includes("fuel.reports.view"))
    .map((item) => item.id);
  const canViewFleet = admin.profile.role === "system_owner" || globalPermissions.has("fleet.view");
  const canViewHousing = admin.profile.role === "system_owner" || globalPermissions.has("housing.view");
  const today = getBusinessDateString();
  const period = buildPeriod(selectedRange, today);
  const timings: Array<{ name: string; duration: number }> = [];

  const measure = async <T>(name: string, task: () => Promise<T>) => {
    const started = performance.now();
    const result = await task();
    timings.push({ name, duration: Math.round(performance.now() - started) });
    return result;
  };

  const [
    drivers,
    fleet,
    housing,
    appRequests,
    shifts,
    reports,
    fuel,
    pendingRequests,
    alertsResult,
  ] = await Promise.all([
    measure("drivers", () => loadDrivers(admin.supabase, driverOrganizationIds)),
    measure("fleet", () =>
      loadFleet(
        admin.supabase,
        selectedOrganizationIds,
        canViewFleet,
        admin.profile.role === "system_owner",
        Boolean(organization && organization !== "all"),
      ),
    ),
    measure("housing", () => loadHousing(admin.supabase, canViewHousing)),
    measure("app_requests", () => loadAppRequests(admin.supabase, appRequestOrganizationIds, period.from, period.to)),
    measure("shifts", () => loadShifts(admin.supabase, shiftOrganizationIds, today)),
    measure("driver_reports", () => loadDriverReports(admin.supabase, reportOrganizationIds, period.from, period.to)),
    measure("fuel_local", () => loadLocalFuel(admin.supabase, fuelOrganizationIds, period.from, period.to)),
    measure("pending_requests", () => loadPendingRequests(admin.supabase, appRequestOrganizationIds)),
    measure("expiry_alerts", () =>
      getSystemExpiryAlertsForDashboard({
        supabase: admin.supabase,
        profile: admin.profile,
        organizations: selectedOrganizations,
        locale,
        today,
      }),
    ),
  ]);

  const activeDrivers = drivers.rows.filter((driver) => driver.status === "active" && !driver.deleted_at);
  const activeDriverIds = new Set(activeDrivers.map((driver) => driver.id));
  const driverOrgById = new Map(drivers.rows.map((driver) => [driver.id, driver.organization_id]));
  const driverNameById = new Map(drivers.rows.map((driver) => [driver.id, driver.full_name]));
  const organizationById = new Map(selectedOrganizations.map((item) => [item.id, item]));
  const housingAssignmentsForSelectedDrivers = housing.assignments.filter((assignment) =>
    activeDriverIds.has(assignment.driver_id),
  );
  const housedDriverIds = new Set(housingAssignmentsForSelectedDrivers.map((assignment) => assignment.driver_id));
  const housingMetrics = buildHousingMetrics(housing.units, housing.rooms, housing.assignments);
  const driverMetrics = buildDriverMetrics(drivers.rows, housedDriverIds, today);
  const fleetMetrics = buildFleetMetrics(fleet.rows, today);
  const requestMetrics = {
    ...buildRequestMetrics(appRequests.rows, period.dates, today),
    pending: pendingRequests.rows.length,
  };
  const shiftMetrics = buildShiftMetrics(shifts.rows);
  const fuelMetrics = buildFuelMetrics(fuel.rows, organizationById);
  const topPerformanceDrivers = buildTopPerformanceDrivers(reports.rows, organizationById);
  const activityLeaders = buildActivityLeaders(reports.rows, shifts.rows, appRequests.rows, organizationById, driverNameById);
  const alerts = alertsResult.status === "success"
    ? {
        expired: alertsResult.summary.expired,
        critical: alertsResult.summary.critical,
        warning: alertsResult.summary.warning,
        total: alertsResult.totalCount,
        nearest: alertsResult.alerts.slice(0, 8),
      }
    : { expired: 0, critical: 0, warning: 0, total: 0, nearest: [] };
  const organizationOverview = buildOrganizationOverview({
    organizations: selectedOrganizations,
    drivers: activeDrivers,
    fleet: fleet.rows,
    housingAssignments: housingAssignmentsForSelectedDrivers,
    appRequests: appRequests.rows.filter((request) => request.submitted_at.slice(0, 10) === today),
    shifts: shifts.rows,
    alerts: alertsResult.status === "success" ? alertsResult.alerts : [],
    driverOrgById,
  });

  const kpis = buildKpis({
    locale,
    organizations: selectedOrganizations,
    driverMetrics,
    fleetMetrics,
    housingMetrics,
    requestMetrics,
    shiftMetrics,
    alerts,
    canViewFleet,
    canViewHousing,
  });
  const slowestSectionMs = timings.sort((first, second) => second.duration - first.duration)[0] ?? {
    name: "none",
    duration: 0,
  };

  return {
    status: "success",
    filters: {
      organization: organization ?? "all",
      range: selectedRange,
    },
    availableOrganizations: organizationsResult.organizations,
    selectedOrganizations,
    lastUpdated: new Date().toISOString(),
    kpis,
    organizationOverview,
    drivers: driverMetrics,
    fleet: {
      status: canViewFleet ? "success" : "unavailable",
      ...fleetMetrics,
    },
    housing: {
      status: canViewHousing ? "success" : "unavailable",
      ...housingMetrics,
    },
    requests: requestMetrics,
    shifts: shiftMetrics,
    fuel: {
      status: "success",
      ...fuelMetrics,
    },
    alerts,
    topPerformanceDrivers,
    activityLeaders,
    definitions: [
      "Active drivers: drivers.status = active and deleted_at is null.",
      "Archived drivers: drivers.deleted_at is not null.",
      "Active Global Fleet vehicles: fleet_vehicles.archived_at is null.",
      "Operational active/stopped vehicles: fleet_vehicles.operational_status values.",
      "Housing occupancy: active housing_driver_assignments where unassigned_at is null.",
      "Request metrics: driver_app_requests scoped by organization_id and submitted_at period.",
      "Shift metrics: driver_shifts started within the Riyadh business day.",
      "Fuel metrics: local fuel_transactions only; no Kafaratplus external calls during dashboard SSR.",
      "Top performance: average of available daily report rates: delivery_rate, evaluation_completion_rate, mandatory_assignment_score, not_early_delivery_confirmation_rate.",
    ],
    slowestSectionMs,
  };
}

function parseRange(value?: string): ExecutiveDashboardRange {
  const parsed = Number(value);
  return rangeValues.has(parsed) ? (parsed as ExecutiveDashboardRange) : 7;
}

function selectOrganizations(organizations: AccessibleOrganization[], selected?: string) {
  if (!selected || selected === "all") {
    return organizations;
  }

  const organization = organizations.find((item) => item.id === selected || item.code === selected);
  return organization ? [organization] : organizations;
}

function buildPeriod(range: ExecutiveDashboardRange, today: string) {
  const dates: string[] = [];
  const todayDate = parseDate(today);
  for (let index = range - 1; index >= 0; index -= 1) {
    const date = new Date(todayDate);
    date.setUTCDate(todayDate.getUTCDate() - index);
    dates.push(date.toISOString().slice(0, 10));
  }

  return {
    from: dates[0],
    to: dates[dates.length - 1],
    dates,
  };
}

async function loadDrivers(supabase: Supabase, organizationIds: string[]) {
  if (organizationIds.length === 0) return { rows: [] as DriverRow[] };

  const { data, error } = await supabase
    .from("drivers")
    .select(
      "id, full_name, organization_id, status, deleted_at, is_company_sponsored, vehicle_number, iqama_expiry_date, driving_license_expiry_date, driver_card_expiry_date, vehicle_authorization_expiry_date, operating_card_expiry_date",
    )
    .in("organization_id", organizationIds);

  if (error) return { rows: [] as DriverRow[] };
  return { rows: (data ?? []) as DriverRow[] };
}

async function loadFleet(
  supabase: Supabase,
  organizationIds: string[],
  canViewFleet: boolean,
  isSystemOwner: boolean,
  isSpecificOrganization: boolean,
) {
  if (!canViewFleet) return { rows: [] as FleetVehicleRow[] };

  let query = supabase
    .from("fleet_vehicles")
    .select(
      "id, assigned_driver_id, assigned_organization_id, archived_at, technical_status, fault_location, operational_status, operating_card_expiry_date, vehicle_category",
    );

  if (!isSystemOwner || isSpecificOrganization) {
    if (organizationIds.length === 0) return { rows: [] as FleetVehicleRow[] };
    query = query.in("assigned_organization_id", organizationIds);
  }

  const { data, error } = await query;
  if (error) return { rows: [] as FleetVehicleRow[] };
  return { rows: (data ?? []) as FleetVehicleRow[] };
}

async function loadHousing(supabase: Supabase, canViewHousing: boolean) {
  if (!canViewHousing) {
    return {
      units: [] as HousingUnitRow[],
      rooms: [] as HousingRoomRow[],
      assignments: [] as HousingAssignmentRow[],
    };
  }

  const [units, rooms, assignments] = await Promise.all([
    supabase
      .from("housing_units")
      .select("id, capacity, status, archived_at"),
    supabase
      .from("housing_rooms")
      .select("id, housing_id, capacity, status, archived_at"),
    supabase
      .from("housing_driver_assignments")
      .select("driver_id, housing_id, unassigned_at")
      .is("unassigned_at", null),
  ]);

  return {
    units: units.error ? [] : ((units.data ?? []) as HousingUnitRow[]),
    rooms: rooms.error ? [] : ((rooms.data ?? []) as HousingRoomRow[]),
    assignments: assignments.error ? [] : ((assignments.data ?? []) as HousingAssignmentRow[]),
  };
}

async function loadHousingForOrganization(
  supabase: Supabase,
  organizationId: string,
  canViewHousing: boolean,
) {
  if (!canViewHousing) {
    return {
      units: [] as HousingUnitRow[],
      rooms: [] as HousingRoomRow[],
      assignments: [] as HousingAssignmentRow[],
    };
  }

  const { data: organizationAssignments, error: organizationAssignmentsError } = await supabase
    .from("housing_organization_assignments")
    .select("housing_id, organization_id, active, unassigned_at")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .is("unassigned_at", null);

  if (organizationAssignmentsError) {
    return {
      units: [] as HousingUnitRow[],
      rooms: [] as HousingRoomRow[],
      assignments: [] as HousingAssignmentRow[],
    };
  }

  const housingIds = Array.from(
    new Set(((organizationAssignments ?? []) as HousingOrganizationAssignmentRow[]).map((row) => row.housing_id)),
  );

  if (housingIds.length === 0) {
    return {
      units: [] as HousingUnitRow[],
      rooms: [] as HousingRoomRow[],
      assignments: [] as HousingAssignmentRow[],
    };
  }

  const [units, rooms, assignments] = await Promise.all([
    supabase
      .from("housing_units")
      .select("id, capacity, status, archived_at")
      .in("id", housingIds),
    supabase
      .from("housing_rooms")
      .select("id, housing_id, capacity, status, archived_at")
      .in("housing_id", housingIds),
    supabase
      .from("housing_driver_assignments")
      .select("driver_id, housing_id, unassigned_at")
      .in("housing_id", housingIds)
      .is("unassigned_at", null),
  ]);

  return {
    units: units.error ? [] : ((units.data ?? []) as HousingUnitRow[]),
    rooms: rooms.error ? [] : ((rooms.data ?? []) as HousingRoomRow[]),
    assignments: assignments.error ? [] : ((assignments.data ?? []) as HousingAssignmentRow[]),
  };
}

async function loadAppRequests(
  supabase: Supabase,
  organizationIds: string[],
  fromDate: string,
  toDate: string,
) {
  if (organizationIds.length === 0) return { rows: [] as AppRequestRow[] };

  const { data, error } = await supabase
    .from("driver_app_requests")
    .select("driver_id, organization_id, request_type, status, submitted_at")
    .in("organization_id", organizationIds)
    .gte("submitted_at", `${fromDate}T00:00:00+03:00`)
    .lte("submitted_at", `${toDate}T23:59:59+03:00`);

  if (error) return { rows: [] as AppRequestRow[] };
  return { rows: (data ?? []) as AppRequestRow[] };
}

async function loadPendingRequests(supabase: Supabase, organizationIds: string[]) {
  if (organizationIds.length === 0) return { rows: [] as Pick<AppRequestRow, "organization_id" | "status">[] };

  const { data, error } = await supabase
    .from("driver_app_requests")
    .select("organization_id, status")
    .in("organization_id", organizationIds)
    .eq("status", "pending");

  if (error) return { rows: [] as Pick<AppRequestRow, "organization_id" | "status">[] };
  return { rows: data ?? [] };
}

async function loadShifts(supabase: Supabase, organizationIds: string[], today: string) {
  if (organizationIds.length === 0) return { rows: [] as ShiftRow[] };

  const { data, error } = await supabase
    .from("driver_shifts")
    .select(
      "driver_id, organization_id, status, started_at, ended_at, start_odometer_reading, end_odometer_reading, start_photo_path, end_photo_path",
    )
    .in("organization_id", organizationIds)
    .gte("started_at", `${today}T00:00:00+03:00`)
    .lte("started_at", `${today}T23:59:59+03:00`);

  if (error) return { rows: [] as ShiftRow[] };
  return { rows: (data ?? []) as ShiftRow[] };
}

async function loadDriverReports(
  supabase: Supabase,
  organizationIds: string[],
  fromDate: string,
  toDate: string,
) {
  if (organizationIds.length === 0) return { rows: [] as ReportRow[] };

  const { data, error } = await supabase
    .from("driver_daily_report_rows")
    .select(
      "driver_id, driver_full_name, organization_id, report_date, attendance_status, delivered_tasks, accepted_tasks, delivery_rate, evaluation_completion_rate, mandatory_assignment_score, not_early_delivery_confirmation_rate",
    )
    .in("organization_id", organizationIds)
    .gte("report_date", fromDate)
    .lte("report_date", toDate);

  if (error) return { rows: [] as ReportRow[] };
  return { rows: (data ?? []) as ReportRow[] };
}

async function loadLocalFuel(
  supabase: Supabase,
  organizationIds: string[],
  fromDate: string,
  toDate: string,
) {
  if (organizationIds.length === 0) return { rows: [] as FuelTransactionRow[] };

  const { data, error } = await supabase
    .from("fuel_transactions")
    .select("driver_id, driver_name_snapshot, organization_id, amount_sar, fuel_date")
    .in("organization_id", organizationIds)
    .gte("fuel_date", fromDate)
    .lte("fuel_date", toDate);

  if (error) return { rows: [] as FuelTransactionRow[] };
  return { rows: (data ?? []) as FuelTransactionRow[] };
}

function buildDriverMetrics(rows: DriverRow[], housedDriverIds: Set<string>, today: string) {
  const active = rows.filter((driver) => driver.status === "active" && !driver.deleted_at);
  return {
    total: rows.filter((driver) => !driver.deleted_at).length,
    active: active.length,
    inactive: rows.filter((driver) => driver.status !== "active" && !driver.deleted_at).length,
    archived: rows.filter((driver) => Boolean(driver.deleted_at)).length,
    companySponsored: active.filter((driver) => driver.is_company_sponsored).length,
    nonSponsored: active.filter((driver) => !driver.is_company_sponsored).length,
    withoutAssignedVehicle: active.filter((driver) => !driver.vehicle_number?.trim()).length,
    withoutHousing: active.filter((driver) => !housedDriverIds.has(driver.id)).length,
    expiringDocuments: active.filter((driver) =>
      [
        driver.iqama_expiry_date,
        driver.driving_license_expiry_date,
        driver.driver_card_expiry_date,
        driver.vehicle_authorization_expiry_date,
        driver.operating_card_expiry_date,
      ].some((date) => date && daysBetween(today, date) <= 10),
    ).length,
  };
}

function buildFleetMetrics(rows: FleetVehicleRow[], today: string) {
  const active = rows.filter((vehicle) => !vehicle.archived_at);
  return {
    totalActive: active.length,
    healthy: active.filter((vehicle) => vehicle.technical_status === "healthy").length,
    damaged: active.filter((vehicle) => vehicle.technical_status === "accident").length,
    maintenance: active.filter((vehicle) => vehicle.fault_location === "in_maintenance").length,
    operationalActive: active.filter((vehicle) => vehicle.operational_status === "active").length,
    operationalStopped: active.filter((vehicle) => vehicle.operational_status !== "active").length,
    archived: rows.filter((vehicle) => Boolean(vehicle.archived_at)).length,
    withoutDriver: active.filter((vehicle) => !vehicle.assigned_driver_id).length,
    withoutOrganization: active.filter((vehicle) => !vehicle.assigned_organization_id).length,
    expiringOperatingCards: active.filter((vehicle) =>
      vehicle.operating_card_expiry_date && daysBetween(today, vehicle.operating_card_expiry_date) <= 10,
    ).length,
  };
}

function buildHousingMetrics(
  units: HousingUnitRow[],
  rooms: HousingRoomRow[],
  assignments: HousingAssignmentRow[],
) {
  const activeUnits = units.filter((unit) => !unit.archived_at);
  const activeRooms = rooms.filter((room) => !room.archived_at);
  const housingIdsWithRooms = new Set(activeRooms.map((room) => room.housing_id));
  const roomCapacity = activeRooms.reduce((total, room) => total + room.capacity, 0);
  const unitCapacity = activeUnits
    .filter((unit) => !housingIdsWithRooms.has(unit.id))
    .reduce((total, unit) => total + unit.capacity, 0);
  const capacity = roomCapacity + unitCapacity;
  const occupied = assignments.filter((assignment) => !assignment.unassigned_at).length;
  const occupancyByHousing = countBy(assignments.filter((assignment) => !assignment.unassigned_at), "housing_id");
  const fullUnits = activeUnits.filter((unit) => (occupancyByHousing.get(unit.id) ?? 0) >= getHousingCapacity(unit.id, unit.capacity, activeRooms)).length;

  return {
    units: activeUnits.length,
    rooms: activeRooms.length,
    capacity,
    occupied,
    available: Math.max(capacity - occupied, 0),
    utilizationPercent: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
    fullUnits,
    availableUnits: Math.max(activeUnits.length - fullUnits, 0),
  };
}

function buildRequestMetrics(rows: AppRequestRow[], dates: string[], today: string) {
  const byStatus = countBy(rows, "status");
  const byTypeToday: Record<string, number> = {};
  for (const request of rows) {
    if (request.submitted_at.slice(0, 10) === today) {
      byTypeToday[request.request_type] = (byTypeToday[request.request_type] ?? 0) + 1;
    }
  }

  const trend = dates.map<DashboardTrendPoint>((date) => {
    const dayRows = rows.filter((request) => request.submitted_at.slice(0, 10) === date);
    return {
      date,
      total: dayRows.length,
      leave: dayRows.filter((request) => request.request_type === "leave").length,
      maintenance: dayRows.filter((request) => request.request_type === "maintenance").length,
      meeting: dayRows.filter((request) => request.request_type === "meeting").length,
      oilChange: dayRows.filter((request) => request.request_type === "oil_change").length,
      odometer: dayRows.filter((request) => request.request_type === "odometer").length,
      other: dayRows.filter((request) =>
        !["leave", "maintenance", "meeting", "oil_change", "odometer"].includes(request.request_type),
      ).length,
    };
  });

  return {
    todayTotal: rows.filter((request) => request.submitted_at.slice(0, 10) === today).length,
    pending: byStatus.get("pending") ?? 0,
    approved: byStatus.get("approved") ?? 0,
    rejected: byStatus.get("rejected") ?? 0,
    byTypeToday,
    trend,
  };
}

function buildShiftMetrics(rows: ShiftRow[]) {
  return {
    todayTotal: rows.length,
    started: rows.filter((shift) => Boolean(shift.started_at)).length,
    completed: rows.filter((shift) => Boolean(shift.ended_at)).length,
    activeNow: rows.filter((shift) => Boolean(shift.started_at) && !shift.ended_at).length,
    incomplete: rows.filter((shift) => !shift.ended_at).length,
    totalDistanceToday: rows.reduce((total, shift) => {
      if (shift.end_odometer_reading === null) return total;
      return total + Math.max(shift.end_odometer_reading - shift.start_odometer_reading, 0);
    }, 0),
    missingStartProof: rows.filter((shift) => !shift.start_photo_path).length,
    missingEndProof: rows.filter((shift) => Boolean(shift.ended_at) && !shift.end_photo_path).length,
  };
}

function buildFuelMetrics(rows: FuelTransactionRow[], organizationById: Map<string, AccessibleOrganization>) {
  const byDriver = new Map<string, { driverName: string; organizationName: string; amountSar: number; operations: number }>();
  for (const row of rows) {
    const current = byDriver.get(row.driver_id) ?? {
      driverName: row.driver_name_snapshot,
      organizationName: organizationById.get(row.organization_id)?.name ?? "",
      amountSar: 0,
      operations: 0,
    };
    current.amountSar += Number(row.amount_sar);
    current.operations += 1;
    byDriver.set(row.driver_id, current);
  }

  return {
    operations: rows.length,
    amountSar: Math.round(rows.reduce((total, row) => total + Number(row.amount_sar), 0)),
    matchedDrivers: byDriver.size,
    topDrivers: Array.from(byDriver.entries())
      .map(([driverId, value]) => ({ driverId, ...value, amountSar: Math.round(value.amountSar) }))
      .sort((first, second) => second.amountSar - first.amountSar)
      .slice(0, 5),
  };
}

function buildTopPerformanceDrivers(
  rows: ReportRow[],
  organizationById: Map<string, AccessibleOrganization>,
): DashboardDriverPerformance[] {
  const grouped = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.driver_id) ?? [];
    current.push(row);
    grouped.set(row.driver_id, current);
  }

  return Array.from(grouped.entries())
    .map(([driverId, driverRows]) => {
      const scores = driverRows.flatMap((row) =>
        [
          row.delivery_rate,
          row.evaluation_completion_rate,
          row.mandatory_assignment_score,
          row.not_early_delivery_confirmation_rate,
        ].filter((value): value is number => typeof value === "number"),
      );
      return {
        driverId,
        driverName: driverRows[0]?.driver_full_name ?? "",
        organizationName: organizationById.get(driverRows[0]?.organization_id ?? "")?.name ?? "",
        score: scores.length > 0 ? Math.round(scores.reduce((total, value) => total + value, 0) / scores.length) : 0,
        deliveredTasks: sum(driverRows, "delivered_tasks"),
        acceptedTasks: sum(driverRows, "accepted_tasks"),
        reportDays: new Set(driverRows.map((row) => row.report_date)).size,
        deliveryRate: average(driverRows.map((row) => row.delivery_rate)),
        completionRate: average(driverRows.map((row) => row.evaluation_completion_rate)),
        attendanceDays: driverRows.filter((row) => row.attendance_status === "present").length,
      };
    })
    .filter((row) => row.score > 0)
    .sort((first, second) => second.score - first.score || second.deliveredTasks - first.deliveredTasks)
    .slice(0, 10);
}

function buildActivityLeaders(
  reports: ReportRow[],
  shifts: ShiftRow[],
  requests: AppRequestRow[],
  organizationById: Map<string, AccessibleOrganization>,
  driverNameById: Map<string, string>,
): DashboardActivityLeader[] {
  const rows = new Map<string, DashboardActivityLeader>();

  for (const report of reports) {
    const current = getActivityRow(rows, report.driver_id, report.driver_full_name, organizationById.get(report.organization_id)?.name ?? "");
    current.deliveredTasks += report.delivered_tasks;
    current.activityCount += report.delivered_tasks;
  }

  for (const shift of shifts) {
    const current = getActivityRow(rows, shift.driver_id, driverNameById.get(shift.driver_id) ?? "", organizationById.get(shift.organization_id)?.name ?? "");
    current.shifts += 1;
    current.activityCount += 1;
  }

  for (const request of requests) {
    const current = getActivityRow(rows, request.driver_id, driverNameById.get(request.driver_id) ?? "", organizationById.get(request.organization_id)?.name ?? "");
    current.requests += 1;
    current.activityCount += 1;
  }

  return Array.from(rows.values())
    .filter((row) => row.activityCount > 0)
    .sort((first, second) => second.activityCount - first.activityCount)
    .slice(0, 10);
}

function getActivityRow(
  rows: Map<string, DashboardActivityLeader>,
  driverId: string,
  driverName: string,
  organizationName: string,
) {
  const current = rows.get(driverId) ?? {
    driverId,
    driverName: driverName || driverId.slice(-6),
    organizationName,
    activityCount: 0,
    deliveredTasks: 0,
    shifts: 0,
    requests: 0,
  };
  if (!current.driverName || current.driverName === driverId.slice(-6)) current.driverName = driverName || current.driverName;
  if (!current.organizationName) current.organizationName = organizationName;
  rows.set(driverId, current);
  return current;
}

function buildOrganizationOverview({
  organizations,
  drivers,
  fleet,
  housingAssignments,
  appRequests,
  shifts,
  alerts,
  driverOrgById,
}: {
  organizations: AccessibleOrganization[];
  drivers: DriverRow[];
  fleet: FleetVehicleRow[];
  housingAssignments: HousingAssignmentRow[];
  appRequests: AppRequestRow[];
  shifts: ShiftRow[];
  alerts: Array<{ organizationId: string | null }>;
  driverOrgById: Map<string, string>;
}) {
  const rows = new Map<string, DashboardOrganizationOverview>(
    organizations.map((organization) => [
      organization.id,
      {
        id: organization.id,
        name: organization.name,
        code: organization.code,
        activeDrivers: 0,
        vehicles: 0,
        housingLinkedDrivers: 0,
        todayRequests: 0,
        todayShifts: 0,
        pendingAlerts: 0,
      },
    ]),
  );

  for (const driver of drivers) rows.get(driver.organization_id)!.activeDrivers += 1;
  for (const vehicle of fleet) {
    if (!vehicle.archived_at && vehicle.assigned_organization_id) {
      const row = rows.get(vehicle.assigned_organization_id);
      if (row) row.vehicles += 1;
    }
  }
  for (const assignment of housingAssignments) {
    const organizationId = driverOrgById.get(assignment.driver_id);
    const row = organizationId ? rows.get(organizationId) : null;
    if (row) row.housingLinkedDrivers += 1;
  }
  for (const request of appRequests) {
    const row = rows.get(request.organization_id);
    if (row) row.todayRequests += 1;
  }
  for (const shift of shifts) {
    const row = rows.get(shift.organization_id);
    if (row) row.todayShifts += 1;
  }
  for (const alert of alerts) {
    if (alert.organizationId && rows.has(alert.organizationId)) {
      rows.get(alert.organizationId)!.pendingAlerts += 1;
    }
  }

  return Array.from(rows.values()).sort((first, second) => second.activeDrivers - first.activeDrivers).slice(0, 20);
}

function buildKpis({
  locale,
  organizations,
  driverMetrics,
  fleetMetrics,
  housingMetrics,
  requestMetrics,
  shiftMetrics,
  alerts,
  canViewFleet,
  canViewHousing,
}: {
  locale: Locale;
  organizations: AccessibleOrganization[];
  driverMetrics: ReturnType<typeof buildDriverMetrics>;
  fleetMetrics: ReturnType<typeof buildFleetMetrics>;
  housingMetrics: ReturnType<typeof buildHousingMetrics>;
  requestMetrics: ReturnType<typeof buildRequestMetrics>;
  shiftMetrics: ReturnType<typeof buildShiftMetrics>;
  alerts: { critical: number };
  canViewFleet: boolean;
  canViewHousing: boolean;
}) {
  const orgHref = `/${locale}/dashboard/organizations`;
  const kpis: DashboardMetric[] = [
    { id: "organizations", label: "إجمالي المؤسسات", value: organizations.length, href: orgHref },
    { id: "drivers", label: "إجمالي المناديب", value: driverMetrics.total, href: orgHref },
    { id: "active-drivers", label: "المناديب النشطون", value: driverMetrics.active, href: orgHref, tone: "success" },
    { id: "active-vehicles", label: "المركبات النشطة", value: canViewFleet ? fleetMetrics.operationalActive : 0, href: `/${locale}/dashboard/fleet/cars` },
    { id: "stopped-vehicles", label: "المركبات المتوقفة", value: canViewFleet ? fleetMetrics.operationalStopped : 0, href: `/${locale}/dashboard/fleet/cars`, tone: "warning" },
    { id: "housing", label: "السكن", value: canViewHousing ? housingMetrics.units : 0, href: `/${locale}/dashboard/housing` },
    { id: "housing-capacity", label: "إجمالي سعة السكن", value: canViewHousing ? housingMetrics.capacity : 0, href: `/${locale}/dashboard/housing` },
    { id: "housing-occupied", label: "إشغال السكن", value: canViewHousing ? housingMetrics.occupied : 0, href: `/${locale}/dashboard/housing`, helper: `${housingMetrics.utilizationPercent}%` },
    { id: "requests-today", label: "الطلبات اليوم", value: requestMetrics.todayTotal, href: orgHref },
    { id: "pending-requests", label: "الطلبات المعلقة", value: requestMetrics.pending, href: orgHref, tone: "warning" },
    { id: "shifts-today", label: "الورديات اليوم", value: shiftMetrics.todayTotal, href: orgHref },
    { id: "critical-alerts", label: "التنبيهات الحرجة", value: alerts.critical, href: `/${locale}/dashboard/organizations`, tone: "danger" },
  ];
  return kpis;
}

function buildOrganizationKpis({
  locale,
  organization,
  driverMetrics,
  fleetMetrics,
  housingMetrics,
  requestMetrics,
  shiftMetrics,
  alerts,
  canViewFleet,
  canViewHousing,
}: {
  locale: Locale;
  organization: AccessibleOrganization;
  driverMetrics: ReturnType<typeof buildDriverMetrics>;
  fleetMetrics: ReturnType<typeof buildFleetMetrics>;
  housingMetrics: ReturnType<typeof buildHousingMetrics>;
  requestMetrics: ReturnType<typeof buildRequestMetrics>;
  shiftMetrics: ReturnType<typeof buildShiftMetrics>;
  alerts: { critical: number };
  canViewFleet: boolean;
  canViewHousing: boolean;
}) {
  const baseHref = `/${locale}/dashboard/organizations/${organization.code}`;
  const kpis: DashboardMetric[] = [
    { id: "drivers", label: "إجمالي المناديب", value: driverMetrics.total, href: `${baseHref}/drivers` },
    { id: "active-drivers", label: "المناديب النشطون", value: driverMetrics.active, href: `${baseHref}/drivers?status=active`, tone: "success" },
    { id: "vehicles", label: "إجمالي المركبات", value: canViewFleet ? fleetMetrics.totalActive : 0, href: `${baseHref}/fleet/cars` },
    { id: "active-vehicles", label: "المركبات النشطة", value: canViewFleet ? fleetMetrics.operationalActive : 0, href: `${baseHref}/fleet/cars`, tone: "success" },
    { id: "stopped-vehicles", label: "المركبات المتوقفة", value: canViewFleet ? fleetMetrics.operationalStopped : 0, href: `${baseHref}/fleet/cars`, tone: "warning" },
    { id: "housing", label: "السكن", value: canViewHousing ? housingMetrics.units : 0, href: `/${locale}/dashboard/housing` },
    { id: "housing-occupied", label: "إشغال السكن", value: canViewHousing ? housingMetrics.occupied : 0, href: `/${locale}/dashboard/housing`, helper: `${housingMetrics.utilizationPercent}%` },
    { id: "requests-today", label: "الطلبات اليوم", value: requestMetrics.todayTotal, href: `${baseHref}/app-requests/leave` },
    { id: "pending-requests", label: "الطلبات المعلقة", value: requestMetrics.pending, href: `${baseHref}/app-requests/leave`, tone: "warning" },
    { id: "shifts-today", label: "الورديات اليوم", value: shiftMetrics.todayTotal, href: `${baseHref}/shifts/manage` },
    { id: "critical-alerts", label: "التنبيهات الحرجة", value: alerts.critical, href: `${baseHref}/driver-warnings`, tone: "danger" },
  ];

  return kpis;
}

function buildOrganizationQuickActions(locale: Locale, organization: AccessibleOrganization) {
  const baseHref = `/${locale}/dashboard/organizations/${organization.code}`;
  return [
    { label: "بيانات المناديب", href: `${baseHref}/drivers`, icon: "users" },
    { label: "السيارات", href: `${baseHref}/fleet/cars`, icon: "car" },
    { label: "إدارة العداد", href: `${baseHref}/app-requests/odometer`, icon: "clock" },
    { label: "طلبات الصيانة", href: `${baseHref}/app-requests/maintenance`, icon: "clipboard" },
    { label: "الإجازات", href: `${baseHref}/app-requests/leave`, icon: "clipboard" },
    { label: "السكن", href: `/${locale}/dashboard/housing`, icon: "home" },
    { label: "تنبيهات المناديب", href: `${baseHref}/driver-warnings`, icon: "warning" },
  ];
}

function countBy<T, K extends keyof T>(rows: T[], key: K) {
  const counts = new Map<T[K], number>();
  for (const row of rows) {
    counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  }
  return counts;
}

function getHousingCapacity(housingId: string, fallbackCapacity: number, rooms: HousingRoomRow[]) {
  const roomCapacity = rooms
    .filter((room) => room.housing_id === housingId)
    .reduce((total, room) => total + room.capacity, 0);
  return roomCapacity > 0 ? roomCapacity : fallbackCapacity;
}

function sum<T>(rows: T[], key: keyof T) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (numbers.length === 0) return null;
  return Math.round(numbers.reduce((total, value) => total + value, 0) / numbers.length);
}

function parseDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysBetween(from: string, to: string) {
  return Math.ceil((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}
