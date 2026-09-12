import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";
import type { OrderPeriodQueryResult, OrderPeriodDriver, OrderPeriodTemplate, OrderPeriodWeek, OrderShiftChangeRequest } from "@/features/order-periods/types";

type RawTemplate = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  is_published: boolean;
  is_active: boolean;
  archived_at: string | null;
};
type RawPolicy = { order_period_template_id: string; open_before_minutes: number | null; close_after_minutes: number | null; minimum_work_minutes: number | null };
type RawAssignment = {
  id: string;
  order_period_template_id: string;
  driver_id: string;
  assignment_start_date: string;
  assignment_end_date: string | null;
};
type RawDriver = {
  id: string;
  full_name: string;
  keeta_driver_id: string | null;
  mobile_number: string | null;
};
type RawVehicle = {
  plate_number: string | null;
  vehicle_type: string | null;
  assigned_driver_id: string | null;
  authorized_driver_id: string | null;
};
type RawOrderShiftChangeRequest = {
  id: string;
  driver_id: string;
  current_order_period_template_id: string;
  requested_order_period_template_id: string;
  requested_week_start_date: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const RIYADH_TIME_ZONE = "Asia/Riyadh";

export async function getOrderPeriodManagementData({
  organizationId,
}: {
  organizationId: string;
}): Promise<OrderPeriodQueryResult> {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return emptyResult("unauthorized");

  const permissionSet = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organizationId,
  );
  const permissions = {
    manage: permissionSet.has("order_periods.manage"),
    assign: permissionSet.has("order_periods.assign"),
  };
  const ranges = getOrderWeekRanges();

  if (!permissionSet.has("order_periods.view")) {
    return { ...emptyResult("unauthorized"), permissions };
  }

  const db = admin.supabase as any;
  const [templatesResult, assignmentsResult, driversResult, vehiclesResult] =
    await Promise.all([
      db
        .from("organization_order_period_templates")
        .select("id, name, start_time, end_time, crosses_midnight, is_published, is_active, archived_at")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("start_time", { ascending: true }),
      db
        .from("organization_order_period_assignments")
        .select("id, order_period_template_id, driver_id, assignment_start_date, assignment_end_date")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .lte("assignment_start_date", ranges.next.endDate)
        .or(`assignment_end_date.is.null,assignment_end_date.gte.${ranges.current.startDate}`)
        .order("assignment_start_date", { ascending: false }),
      db
        .from("drivers")
        .select("id, full_name, keeta_driver_id, mobile_number")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .eq("settlement_type", "per_order")
        .is("deleted_at", null)
        .order("full_name", { ascending: true }),
      db
        .from("fleet_vehicles")
        .select("plate_number, vehicle_type, assigned_driver_id, authorized_driver_id")
        .eq("organization_id", organizationId)
        .is("archived_at", null),
    ]);

  const queryResults = [
    ["templates", templatesResult],
    ["assignments", assignmentsResult],
    ["drivers", driversResult],
    ["fleet_vehicles", vehiclesResult],
  ] as const;

  for (const [query, result] of queryResults) {
    if (!result.error) continue;

    console.error("[order-periods] management query failed", {
      query,
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      organizationId,
      weekStart: ranges.current.startDate,
      weekEnd: ranges.next.endDate,
    });
  }

  if (templatesResult.error || assignmentsResult.error || driversResult.error || vehiclesResult.error) {
    return { ...emptyResult("load_error"), permissions };
  }

  const templates = (templatesResult.data ?? []) as RawTemplate[];
  const assignments = (assignmentsResult.data ?? []) as RawAssignment[];
  const drivers = (driversResult.data ?? []) as RawDriver[];
  const vehicles = (vehiclesResult.data ?? []) as RawVehicle[];
  const vehicleByDriverId = new Map<string, string>();

  for (const vehicle of vehicles) {
    const label = vehicle.plate_number ?? vehicle.vehicle_type;
    if (!label) continue;
    for (const driverId of [vehicle.assigned_driver_id, vehicle.authorized_driver_id]) {
      if (driverId && !vehicleByDriverId.has(driverId)) vehicleByDriverId.set(driverId, label);
    }
  }

  const driverById = new Map<string, OrderPeriodDriver>(
    drivers.map((driver) => [driver.id, {
      id: driver.id,
      fullName: driver.full_name,
      keetaDriverId: driver.keeta_driver_id,
      mobileNumber: driver.mobile_number,
      vehicleLabel: vehicleByDriverId.get(driver.id) ?? null,
    }]),
  );
  const templateRows = templates.map((template): OrderPeriodTemplate => ({
    id: template.id,
    name: template.name,
    startTime: displayTime(template.start_time),
    endTime: displayTime(template.end_time),
    crossesMidnight: template.crosses_midnight,
    isPublished: template.is_published,
    isActive: template.is_active,
    archivedAt: template.archived_at,
    openBeforeMinutes: null,
    closeAfterMinutes: null,
    minimumWorkMinutes: null,
  }));
  const driverNames = new Map(drivers.map((driver) => [driver.id, {
    name: driver.full_name,
    identifier: driver.keeta_driver_id,
  }]));
  const templateNames = new Map(templateRows.map((template) => [template.id, template.name]));

  const [settingsResult, requestsResult, policiesResult] = await Promise.all([
    permissions.manage
      ? db
        .from("organization_order_shift_change_settings")
        .select("allowed_weekdays")
        .eq("organization_id", organizationId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("driver_order_shift_change_requests")
      .select("id, driver_id, current_order_period_template_id, requested_order_period_template_id, requested_week_start_date, status, reason, review_note, reviewed_by, reviewed_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    permissions.manage
      ? db.from("organization_order_period_operational_policies")
        .select("order_period_template_id, open_before_minutes, close_after_minutes, minimum_work_minutes")
        .eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [query, result] of [["order_shift_change_settings", settingsResult], ["order_shift_change_requests", requestsResult], ["order_period_operational_policies", policiesResult]] as const) {
    if (!result.error) continue;
    console.error("[order-periods] auxiliary query failed", {
      query,
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      organizationId,
      weekStart: ranges.current.startDate,
      weekEnd: ranges.next.endDate,
    });
  }

  const settings = settingsResult.error ? [] : (settingsResult.data?.allowed_weekdays ?? []) as number[];
  const policies = new Map<string, RawPolicy>(((policiesResult.data ?? []) as RawPolicy[]).map((policy) => [policy.order_period_template_id, policy]));
  for (const template of templateRows) {
    const policy = policies.get(template.id);
    template.openBeforeMinutes = policy?.open_before_minutes ?? null;
    template.closeAfterMinutes = policy?.close_after_minutes ?? null;
    template.minimumWorkMinutes = policy?.minimum_work_minutes ?? null;
  }
  const requestRows = requestsResult.error ? [] : (requestsResult.data ?? []) as RawOrderShiftChangeRequest[];
  const reviewerIds = Array.from(new Set(
    requestRows
      .map((row) => row.reviewed_by)
      .filter((reviewerId): reviewerId is string => Boolean(reviewerId)),
  ));
  const reviewersResult = reviewerIds.length > 0
    ? await db
      .from("profiles")
      .select("id, full_name")
      .in("id", reviewerIds)
    : { data: [], error: null };

  if (reviewersResult.error) {
    console.error("[order-periods] auxiliary query failed", {
      query: "reviewer_profiles",
      code: reviewersResult.error.code,
      message: reviewersResult.error.message,
      details: reviewersResult.error.details,
      hint: reviewersResult.error.hint,
      organizationId,
      weekStart: ranges.current.startDate,
      weekEnd: ranges.next.endDate,
    });
  }

  const reviewerNames = new Map<string, string>(
    ((reviewersResult.data ?? []) as Array<{ id: string; full_name: string | null }>)
      .filter((profile) => Boolean(profile.full_name))
      .map((profile) => [profile.id, profile.full_name as string]),
  );
  const orderShiftChangeRequests = requestsResult.error ? [] : requestRows.map((row: RawOrderShiftChangeRequest): OrderShiftChangeRequest => {
    const driver = driverNames.get(row.driver_id);
    return {
      id: row.id,
      driverName: driver?.name ?? "",
      driverIdentifier: driver?.identifier ?? null,
      currentTemplateName: templateNames.get(row.current_order_period_template_id) ?? "",
      requestedTemplateName: templateNames.get(row.requested_order_period_template_id) ?? "",
      requestedWeekStartDate: row.requested_week_start_date,
      status: row.status,
      reason: row.reason ?? null,
      reviewNote: row.review_note ?? null,
      reviewerName: row.reviewed_by ? reviewerNames.get(row.reviewed_by) ?? null : null,
      reviewedAt: row.reviewed_at ?? null,
      createdAt: row.created_at,
    };
  });

  return {
    status: "success",
    templates: templateRows,
    drivers: Array.from(driverById.values()),
    permissions,
    orderShiftChangeSettings: settings,
    orderShiftChangeRequests,
    weeks: {
      current: buildWeek("current", ranges.current, templateRows, assignments, driverById),
      next: buildWeek("next", ranges.next, templateRows, assignments, driverById),
    },
  };
}

function buildWeek(
  key: "current" | "next",
  range: { startDate: string; endDate: string },
  templates: OrderPeriodTemplate[],
  assignments: RawAssignment[],
  driverById: Map<string, OrderPeriodDriver>,
): OrderPeriodWeek {
  const active = assignments.filter((assignment) =>
    assignment.assignment_start_date <= range.endDate &&
    (!assignment.assignment_end_date || assignment.assignment_end_date >= range.startDate),
  );
  const rows = templates.map((template) => ({
    template,
    drivers: active
      .filter((assignment) => assignment.order_period_template_id === template.id)
      .map((assignment) => {
        const driver = driverById.get(assignment.driver_id);
        return driver ? { ...driver, assignmentId: assignment.id, templateId: template.id } : null;
      })
      .filter((driver): driver is OrderPeriodWeek["rows"][number]["drivers"][number] => Boolean(driver)),
  }));
  const assignedIds = new Set(active.map((assignment) => assignment.driver_id));

  return {
    key,
    label: `${range.startDate} - ${range.endDate}`,
    startDate: range.startDate,
    endDate: range.endDate,
    rows,
    unassignedDrivers: Array.from(driverById.values()).filter((driver) => !assignedIds.has(driver.id)),
  };
}

function getOrderWeekRanges() {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: RIYADH_TIME_ZONE }));
  const day = today.getDay();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - day);
  sunday.setHours(0, 0, 0, 0);
  const next = new Date(sunday);
  next.setDate(sunday.getDate() + 7);
  return { current: toRange(sunday), next: toRange(next) };
}

function toRange(start: Date) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayTime(value: string) {
  return value.slice(0, 5);
}

function emptyResult(status: "unauthorized" | "load_error"): OrderPeriodQueryResult {
  return {
    status,
    weeks: null,
    templates: [],
    drivers: [],
    permissions: { manage: false, assign: false },
    orderShiftChangeSettings: [],
    orderShiftChangeRequests: [],
  };
}
