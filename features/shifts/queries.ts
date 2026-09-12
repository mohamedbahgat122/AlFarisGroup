import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateShiftTimes } from "@/features/shifts/time";
import type {
  ScheduledShiftChangeRow,
  ShiftDriverOption,
  ShiftManagementQueryResult,
  ShiftWeekData,
  ShiftWeekRange,
  WeeklyShiftDriver,
  WeeklyShiftRow,
  ShiftTemplateRow,
} from "@/features/shifts/types";
import type { Database } from "@/types/database";

type ShiftTemplateTableRow =
  Database["public"]["Tables"]["organization_shift_templates"]["Row"];
type ShiftAssignmentTableRow =
  Database["public"]["Tables"]["organization_shift_assignments"]["Row"];

type DriverOptionRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "full_name"
  | "keeta_driver_id"
  | "mobile_number"
  | "status"
  | "settlement_type"
>;

type VehicleRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  "plate_number" | "vehicle_type" | "assigned_driver_id" | "authorized_driver_id"
>;

type ShiftAssignmentLookupRow = Pick<
  ShiftAssignmentTableRow,
  | "id"
  | "organization_id"
  | "shift_template_id"
  | "driver_id"
  | "is_active"
  | "assignment_start_date"
  | "assignment_end_date"
  | "created_at"
>;

export type ShiftManagementPermissions = {
  create: boolean;
  update: boolean;
  assign: boolean;
  archive: boolean;
};

export async function getShiftManagementData({
  organizationId,
}: {
  organizationId: string;
}): Promise<ShiftManagementQueryResult & { permissions: ShiftManagementPermissions }> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return unauthorizedResult();
  }

  const permissionSet = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organizationId,
  );

  const permissions = {
    create: permissionSet.has("shifts.create"),
    update: permissionSet.has("shifts.update"),
    assign: permissionSet.has("shifts.assign"),
    archive: permissionSet.has("shifts.archive"),
  };

  const weeks = getShiftWeekRanges();

  if (!permissionSet.has("shifts.view")) {
    return {
      status: "unauthorized",
      shifts: [],
      drivers: [],
      scheduledChanges: [],
      shiftChangeRequestDays: [],
      weeks: emptyWeeks(weeks),
      permissions,
    };
  }

  let shiftChangeRequestDays = [0, 1, 6];
  if (permissions.update) {
    const { data: configuredDays, error: configuredDaysError } = await (admin.supabase as typeof admin.supabase & {
      rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    }).rpc("get_effective_shift_change_request_days", {
      p_organization_id: organizationId,
    });

    if (!configuredDaysError && Array.isArray(configuredDays)) {
      shiftChangeRequestDays = configuredDays.map(Number).filter((day) => day >= 0 && day <= 6);
    }
  }

  const [
    shiftsResult,
    assignmentsResult,
    driversResult,
    vehiclesResult,
    scheduledChangesResult,
    attendancePoliciesResult,
  ] = await Promise.all([
    admin.supabase
      .from("organization_shift_templates")
      .select(
        "id, organization_id, name, start_time, end_time, crosses_midnight, has_break, break_start_time, break_end_time, is_active, driver_note, published_at, published_by, archived_at, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("start_time", { ascending: true }),
    admin.supabase
      .from("organization_shift_assignments")
      .select("id, organization_id, shift_template_id, driver_id, is_active, assignment_start_date, assignment_end_date, created_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .or(`assignment_start_date.is.null,assignment_start_date.lte.${weeks.next.endDate}`)
      .or(`assignment_end_date.is.null,assignment_end_date.gte.${weeks.current.startDate}`)
      .order("assignment_start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin.supabase
      .from("drivers")
      .select("id, full_name, keeta_driver_id, mobile_number, status, settlement_type")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("settlement_type", "tiers")
      .order("full_name", { ascending: true }),
    admin.supabase
      .from("fleet_vehicles")
      .select("plate_number, vehicle_type, assigned_driver_id, authorized_driver_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    admin.supabase
      .from("driver_shift_change_requests")
      .select(
        `
        id,
        driver_id,
        current_shift_id,
        requested_shift_id,
        requested_week_start_date,
        driver:drivers!inner(full_name),
        current_shift:organization_shift_templates!driver_shift_change_requests_current_shift_id_fkey(name),
        requested_shift:organization_shift_templates!driver_shift_change_requests_requested_shift_id_fkey(name)
      `,
      )
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .eq("driver.settlement_type", "tiers")
      .order("requested_week_start_date", { ascending: false })
      .limit(20),
    (createAdminClient() as any)
      .from("organization_shift_attendance_policies")
      .select("shift_template_id, start_open_before_minutes, minimum_work_minutes")
      .eq("organization_id", organizationId),
  ]);

  if (
    shiftsResult.error ||
    assignmentsResult.error ||
    driversResult.error ||
    vehiclesResult.error ||
    scheduledChangesResult.error ||
    attendancePoliciesResult.error
  ) {
    return {
      status: "load_error",
      shifts: [],
      drivers: [],
      scheduledChanges: [],
      shiftChangeRequestDays: [],
      permissions,
      weeks: emptyWeeks(weeks),
    };
  }

  const shifts = (shiftsResult.data ?? []) as ShiftTemplateTableRow[];
  const assignments = (assignmentsResult.data ?? []) as ShiftAssignmentLookupRow[];
  const drivers = (driversResult.data ?? []) as DriverOptionRow[];
  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[];
  const attendancePolicies = new Map(
    ((attendancePoliciesResult.data ?? []) as {
      shift_template_id: string;
      start_open_before_minutes: number | null;
      minimum_work_minutes: number | null;
    }[]).map((policy) => [policy.shift_template_id, policy]),
  );

  return {
    status: "success",
    shifts: mapShifts(shifts, assignments, attendancePolicies),
    drivers: mapDrivers(drivers, assignments, shifts, vehicles),
    scheduledChanges: mapScheduledChanges(
      scheduledChangesResult.data ?? [],
      assignments,
      weeks.current.startDate,
    ),
    shiftChangeRequestDays,
    weeks: mapWeeks(weeks, shifts, assignments, drivers, vehicles, attendancePolicies),
    permissions,
  };
}

function mapScheduledChanges(
  rows: {
    id: string;
    driver_id: string;
    requested_shift_id: string;
    requested_week_start_date: string;
    driver: { full_name: string } | null;
    current_shift: { name: string } | null;
    requested_shift: { name: string } | null;
  }[],
  assignments: ShiftAssignmentLookupRow[],
  today: string,
): ScheduledShiftChangeRow[] {
  const currentAssignmentByDriverId = new Map<string, ShiftAssignmentLookupRow>();

  for (const assignment of assignments) {
    if (!currentAssignmentByDriverId.has(assignment.driver_id)) {
      currentAssignmentByDriverId.set(assignment.driver_id, assignment);
    }
  }

  return rows.map((row) => {
    const currentAssignment = currentAssignmentByDriverId.get(row.driver_id);
    const status =
      today < row.requested_week_start_date
        ? "upcoming"
        : currentAssignment?.shift_template_id === row.requested_shift_id
          ? "completed"
          : "review_needed";

    return {
      id: row.id,
      driverName: row.driver?.full_name ?? "",
      fromShiftName: row.current_shift?.name ?? "",
      toShiftName: row.requested_shift?.name ?? "",
      executionDate: row.requested_week_start_date,
      status,
      statusLabel:
        status === "upcoming"
          ? "مجدول"
          : status === "completed"
            ? "تم التنفيذ"
            : "يحتاج مراجعة",
    };
  });
}

function mapShifts(
  shifts: ShiftTemplateTableRow[],
  assignments: Pick<ShiftAssignmentTableRow, "shift_template_id" | "driver_id">[],
  attendancePolicies: Map<string, { start_open_before_minutes: number | null; minimum_work_minutes: number | null }>,
): ShiftTemplateRow[] {
  const assignedDriverIdsByShiftId = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const driverIds =
      assignedDriverIdsByShiftId.get(assignment.shift_template_id) ?? new Set<string>();
    driverIds.add(assignment.driver_id);
    assignedDriverIdsByShiftId.set(assignment.shift_template_id, driverIds);
  }

  return shifts.map((shift) => {
    const summary = validateShiftTimes({
      startTime: shift.start_time,
      endTime: shift.end_time,
      hasBreak: shift.has_break,
      breakStartTime: shift.break_start_time,
      breakEndTime: shift.break_end_time,
    });

    return {
      id: shift.id,
      organizationId: shift.organization_id,
      name: shift.name,
      startTime: normalizeDisplayTime(shift.start_time),
      endTime: normalizeDisplayTime(shift.end_time),
      crossesMidnight:
        summary.ok ? summary.crossesMidnight : shift.crosses_midnight,
      hasBreak: shift.has_break,
      breakStartTime: normalizeNullableDisplayTime(shift.break_start_time),
      breakEndTime: normalizeNullableDisplayTime(shift.break_end_time),
      isActive: shift.is_active,
      driverNote: shift.driver_note,
      publishedAt: shift.published_at,
      publishedBy: shift.published_by,
      archivedAt: shift.archived_at,
      assignedDriverCount: assignedDriverIdsByShiftId.get(shift.id)?.size ?? 0,
      totalMinutes: summary.ok ? summary.totalMinutes : 0,
      breakMinutes: summary.ok ? summary.breakMinutes : 0,
      effectiveMinutes: summary.ok ? summary.effectiveMinutes : 0,
      createdAt: shift.created_at,
      updatedAt: shift.updated_at,
      attendancePolicy: {
        startOpenBeforeMinutes: attendancePolicies.get(shift.id)?.start_open_before_minutes ?? null,
        minimumWorkMinutes: attendancePolicies.get(shift.id)?.minimum_work_minutes ?? null,
      },
    };
  });
}

function mapWeeks(
  ranges: { current: ShiftWeekRange; next: ShiftWeekRange },
  shifts: ShiftTemplateTableRow[],
  assignments: ShiftAssignmentLookupRow[],
  drivers: DriverOptionRow[],
  vehicles: VehicleRow[],
  attendancePolicies: Map<string, { start_open_before_minutes: number | null; minimum_work_minutes: number | null }>,
): { current: ShiftWeekData; next: ShiftWeekData } {
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const vehicleByDriverId = new Map<string, VehicleRow>();

  for (const vehicle of vehicles) {
    if (vehicle.assigned_driver_id) vehicleByDriverId.set(vehicle.assigned_driver_id, vehicle);
    if (vehicle.authorized_driver_id) vehicleByDriverId.set(vehicle.authorized_driver_id, vehicle);
  }

  return {
    current: mapWeek(ranges.current, shifts, assignments, driverById, vehicleByDriverId, attendancePolicies),
    next: mapWeek(ranges.next, shifts, assignments, driverById, vehicleByDriverId, attendancePolicies),
  };
}

function mapWeek(
  range: ShiftWeekRange,
  shifts: ShiftTemplateTableRow[],
  assignments: ShiftAssignmentLookupRow[],
  driverById: Map<string, DriverOptionRow>,
  vehicleByDriverId: Map<string, VehicleRow>,
  attendancePolicies: Map<string, { start_open_before_minutes: number | null; minimum_work_minutes: number | null }>,
): ShiftWeekData {
  const assignmentByDriverId = new Map<string, ShiftAssignmentLookupRow>();

  for (const assignment of assignments) {
    if (!intersectsWeek(assignment, range)) continue;

    const existing = assignmentByDriverId.get(assignment.driver_id);
    if (!existing || compareAssignmentPriority(assignment, existing) > 0) {
      assignmentByDriverId.set(assignment.driver_id, assignment);
    }
  }

  const rows: WeeklyShiftRow[] = shifts.map((shift) => ({
    shift: mapShift(shift, [], attendancePolicies),
    assignedDrivers: [],
  }));
  const rowByShiftId = new Map(rows.map((row) => [row.shift.id, row]));

  for (const assignment of assignmentByDriverId.values()) {
    const row = rowByShiftId.get(assignment.shift_template_id);
    const driver = driverById.get(assignment.driver_id);
    if (!row || !driver) continue;

    const vehicle = vehicleByDriverId.get(driver.id);
    row.assignedDrivers.push({
      assignmentId: assignment.id,
      driverId: driver.id,
      fullName: driver.full_name,
      identifier: driver.keeta_driver_id,
      vehicleLabel: vehicle
        ? `${vehicle.vehicle_type} ${vehicle.plate_number}`.trim()
        : null,
      assignmentStartDate: assignment.assignment_start_date,
      assignmentEndDate: assignment.assignment_end_date,
    });
  }

  for (const row of rows) {
    row.assignedDrivers.sort((a, b) => a.fullName.localeCompare(b.fullName));
    row.shift.assignedDriverCount = row.assignedDrivers.length;
  }

  return { range, shifts: rows };
}

function mapShift(
  shift: ShiftTemplateTableRow,
  assignments: Pick<ShiftAssignmentTableRow, "shift_template_id" | "driver_id">[],
  attendancePolicies: Map<string, { start_open_before_minutes: number | null; minimum_work_minutes: number | null }>,
): ShiftTemplateRow {
  return mapShifts([shift], assignments, attendancePolicies)[0];
}

function intersectsWeek(
  assignment: ShiftAssignmentLookupRow,
  range: ShiftWeekRange,
) {
  const startsBeforeWeekEnds =
    !assignment.assignment_start_date || assignment.assignment_start_date <= range.endDate;
  const endsAfterWeekStarts =
    !assignment.assignment_end_date || assignment.assignment_end_date >= range.startDate;

  return startsBeforeWeekEnds && endsAfterWeekStarts;
}

function compareAssignmentPriority(
  left: ShiftAssignmentLookupRow,
  right: ShiftAssignmentLookupRow,
) {
  const leftDate = left.assignment_start_date ?? "0000-01-01";
  const rightDate = right.assignment_start_date ?? "0000-01-01";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return left.created_at.localeCompare(right.created_at);
}

function mapDrivers(
  drivers: DriverOptionRow[],
  assignments: ShiftAssignmentLookupRow[],
  shifts: ShiftTemplateTableRow[],
  vehicles: VehicleRow[],
): ShiftDriverOption[] {
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const assignmentByDriverId = new Map<string, ShiftAssignmentLookupRow>();

  for (const assignment of assignments) {
    if (!assignmentByDriverId.has(assignment.driver_id)) {
      assignmentByDriverId.set(assignment.driver_id, assignment);
    }
  }
  const vehicleByDriverId = new Map<string, VehicleRow>();

  for (const vehicle of vehicles) {
    if (vehicle.assigned_driver_id) {
      vehicleByDriverId.set(vehicle.assigned_driver_id, vehicle);
    }

    if (vehicle.authorized_driver_id) {
      vehicleByDriverId.set(vehicle.authorized_driver_id, vehicle);
    }
  }

  return drivers.map((driver) => {
    const assignment = assignmentByDriverId.get(driver.id);
    const shift = assignment
      ? shiftById.get(assignment.shift_template_id)
      : null;
    const vehicle = vehicleByDriverId.get(driver.id);

    return {
      id: driver.id,
      fullName: driver.full_name,
      identifier: driver.keeta_driver_id,
      mobileNumber: driver.mobile_number,
      status: driver.status,
      currentShiftId: assignment?.shift_template_id ?? null,
      currentShiftName: shift?.name ?? null,
      vehicleLabel: vehicle
        ? `${vehicle.vehicle_type} ${vehicle.plate_number}`.trim()
        : null,
    };
  });
}

function normalizeDisplayTime(value: string) {
  return value.slice(0, 5);
}

function normalizeNullableDisplayTime(value: string | null) {
  return value ? normalizeDisplayTime(value) : null;
}

function getShiftWeekRanges(date = new Date()): {
  current: ShiftWeekRange;
  next: ShiftWeekRange;
} {
  const today = getRiyadhDateString(date);
  const dayOfWeek = getRiyadhDayOfWeek(date);
  const currentStart = addDays(today, -dayOfWeek);
  const nextStart = addDays(currentStart, 7);

  return {
    current: {
      key: "current",
      startDate: currentStart,
      endDate: addDays(currentStart, 6),
    },
    next: {
      key: "next",
      startDate: nextStart,
      endDate: addDays(nextStart, 6),
    },
  };
}

function emptyWeeks(ranges: { current: ShiftWeekRange; next: ShiftWeekRange }) {
  return {
    current: { range: ranges.current, shifts: [] },
    next: { range: ranges.next, shifts: [] },
  };
}

function getRiyadhDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getRiyadhDayOfWeek(date: Date) {
  const weekday = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
  }).format(date);
  return new Map([
    ["Sun", 0],
    ["Mon", 1],
    ["Tue", 2],
    ["Wed", 3],
    ["Thu", 4],
    ["Fri", 5],
    ["Sat", 6],
  ]).get(weekday) ?? date.getDay();
}

function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function unauthorizedResult(): ShiftManagementQueryResult & {
  permissions: ShiftManagementPermissions;
} {
  return {
    status: "unauthorized",
    shifts: [],
    drivers: [],
    scheduledChanges: [],
    shiftChangeRequestDays: [],
    weeks: emptyWeeks(getShiftWeekRanges()),
    permissions: {
      create: false,
      update: false,
      assign: false,
      archive: false,
    },
  };
}
