import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";
import { validateShiftTimes } from "@/features/shifts/time";
import type {
  ShiftDriverOption,
  ShiftManagementQueryResult,
  ShiftTemplateRow,
} from "@/features/shifts/types";
import type { Database } from "@/types/database";

type ShiftTemplateTableRow =
  Database["public"]["Tables"]["organization_shift_templates"]["Row"];
type ShiftAssignmentTableRow =
  Database["public"]["Tables"]["organization_shift_assignments"]["Row"];

type DriverOptionRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "full_name" | "keeta_driver_id" | "mobile_number" | "status"
>;

type VehicleRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  "plate_number" | "vehicle_type" | "assigned_driver_id" | "authorized_driver_id"
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

  if (!permissionSet.has("shifts.view")) {
    return {
      status: "unauthorized",
      shifts: [],
      drivers: [],
      permissions,
    };
  }

  const [
    shiftsResult,
    assignmentsResult,
    driversResult,
    vehiclesResult,
  ] = await Promise.all([
    admin.supabase
      .from("organization_shift_templates")
      .select(
        "id, organization_id, name, start_time, end_time, crosses_midnight, has_break, break_start_time, break_end_time, is_active, driver_note, archived_at, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("start_time", { ascending: true }),
    admin.supabase
      .from("organization_shift_assignments")
      .select("id, organization_id, shift_template_id, driver_id, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    admin.supabase
      .from("drivers")
      .select("id, full_name, keeta_driver_id, mobile_number, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    admin.supabase
      .from("fleet_vehicles")
      .select("plate_number, vehicle_type, assigned_driver_id, authorized_driver_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
  ]);

  if (
    shiftsResult.error ||
    assignmentsResult.error ||
    driversResult.error ||
    vehiclesResult.error
  ) {
    return {
      status: "load_error",
      shifts: [],
      drivers: [],
      permissions,
    };
  }

  const shifts = (shiftsResult.data ?? []) as ShiftTemplateTableRow[];
  const assignments = (assignmentsResult.data ?? []) as Pick<
    ShiftAssignmentTableRow,
    "id" | "organization_id" | "shift_template_id" | "driver_id" | "is_active"
  >[];
  const drivers = (driversResult.data ?? []) as DriverOptionRow[];
  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[];

  return {
    status: "success",
    shifts: mapShifts(shifts, assignments),
    drivers: mapDrivers(drivers, assignments, shifts, vehicles),
    permissions,
  };
}

function mapShifts(
  shifts: ShiftTemplateTableRow[],
  assignments: Pick<ShiftAssignmentTableRow, "shift_template_id">[],
): ShiftTemplateRow[] {
  const assignedCounts = new Map<string, number>();

  for (const assignment of assignments) {
    assignedCounts.set(
      assignment.shift_template_id,
      (assignedCounts.get(assignment.shift_template_id) ?? 0) + 1,
    );
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
      archivedAt: shift.archived_at,
      assignedDriverCount: assignedCounts.get(shift.id) ?? 0,
      totalMinutes: summary.ok ? summary.totalMinutes : 0,
      breakMinutes: summary.ok ? summary.breakMinutes : 0,
      effectiveMinutes: summary.ok ? summary.effectiveMinutes : 0,
      createdAt: shift.created_at,
      updatedAt: shift.updated_at,
    };
  });
}

function mapDrivers(
  drivers: DriverOptionRow[],
  assignments: Pick<
    ShiftAssignmentTableRow,
    "shift_template_id" | "driver_id" | "is_active"
  >[],
  shifts: ShiftTemplateTableRow[],
  vehicles: VehicleRow[],
): ShiftDriverOption[] {
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const assignmentByDriverId = new Map(
    assignments.map((assignment) => [assignment.driver_id, assignment]),
  );
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

function unauthorizedResult(): ShiftManagementQueryResult & {
  permissions: ShiftManagementPermissions;
} {
  return {
    status: "unauthorized",
    shifts: [],
    drivers: [],
    permissions: {
      create: false,
      update: false,
      assign: false,
      archive: false,
    },
  };
}
