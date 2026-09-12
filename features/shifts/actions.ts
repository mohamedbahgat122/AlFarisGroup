"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getOrganizationPermissions } from "@/features/permissions/server";
import { rangesOverlap, validateShiftTimes } from "@/features/shifts/time";
import type { ShiftActionResult } from "@/features/shifts/types";
import { isLocale } from "@/types/locale";
import type { Database } from "@/types/database";

type ShiftTemplateRow =
  Database["public"]["Tables"]["organization_shift_templates"]["Row"];
type ShiftAssignmentRow =
  Database["public"]["Tables"]["organization_shift_assignments"]["Row"];

export async function saveShiftTemplateAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.create");
  const shiftId = getString(formData, "shiftId");

  if (shiftId) {
    const updateContext = await getActionContext(formData, "shifts.update");
    if (updateContext.status !== "success") return updateContext.result;
    return saveShift(updateContext, formData, shiftId);
  }

  if (context.status !== "success") return context.result;
  return saveShift(context, formData, null);
}

export async function saveShiftChangeRequestDaysAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.update");
  if (context.status !== "success") return context.result;

  const allowedWeekdays = formData
    .getAll("allowedWeekdays")
    .filter((value): value is string => typeof value === "string")
    .map((value) => Number(value));

  if (allowedWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return errorResult("shift_change_days_invalid", context.messages.shiftChangeDaysInvalid);
  }

  const { data, error } = await (context.admin.supabase as typeof context.admin.supabase & {
    rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
      data: { success?: boolean; error?: string } | null;
      error: { message: string } | null;
    }>;
  }).rpc("set_shift_change_request_days", {
    p_organization_id: context.organization.id,
    p_allowed_weekdays: allowedWeekdays,
  });

  if (error || !data?.success) {
    if (data?.error === "SHIFT_CHANGE_DAYS_INVALID") {
      return errorResult("shift_change_days_invalid", context.messages.shiftChangeDaysInvalid);
    }
    return errorResult("shift_change_days_save_failed", context.messages.shiftChangeDaysFailed);
  }

  revalidatePath(context.path);
  return { status: "success", message: context.messages.shiftChangeDaysSaved };
}

export async function saveShiftAttendancePolicyAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.update");
  if (context.status !== "success") return context.result;

  const shiftId = getString(formData, "shiftId");
  const startValue = getString(formData, "startOpenBeforeMinutes");
  const hoursValue = getString(formData, "minimumWorkHours");
  const minutesValue = getString(formData, "minimumWorkMinutesRemainder");
  const start = startValue === "" ? null : Number(startValue);
  const hours = hoursValue === "" ? null : Number(hoursValue);
  const minutes = minutesValue === "" ? null : Number(minutesValue);
  const minimum = hours === null && minutes === null ? null : (hours ?? 0) * 60 + (minutes ?? 0);

  if (!shiftId || (start !== null && (!Number.isInteger(start) || start < 0 || start > 1440)) ||
      (hours !== null && (!Number.isInteger(hours) || hours < 0)) ||
      (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)) ||
      (minimum !== null && (minimum < 1 || minimum > 1440))) {
    return errorResult("attendance_policy_invalid", attendanceMessage(context.locale, "attendancePolicyInvalid"));
  }

  const { data, error } = await (context.admin.supabase as typeof context.admin.supabase & {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: { id?: string } | null;
      error: { code?: string; message: string; details?: string; hint?: string } | null;
    }>;
  }).rpc("set_organization_shift_attendance_policy", {
    p_organization_id: context.organization.id,
    p_shift_template_id: shiftId,
    p_start_open_before_minutes: start,
    p_minimum_work_minutes: minimum,
  });

  if (error) {
    console.error("[shifts] attendance policy save RPC failed", {
      operation: "save_shift_attendance_policy",
      code: error.code ?? null,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
      organizationId: context.organization.id,
      shiftTemplateId: shiftId,
    });
    return errorResult("attendance_policy_save_failed", attendanceMessage(context.locale, "attendancePolicySaveFailed"));
  }

  if (!data?.id) {
    return errorResult("attendance_policy_save_failed", attendanceMessage(context.locale, "attendancePolicySaveFailed"));
  }

  revalidatePath(context.path);
  return { status: "success", message: attendanceMessage(context.locale, "attendancePolicySaved") };
}

export async function openDriverShiftAttendanceStartNowAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.update");
  if (context.status !== "success") return context.result;
  const shiftId = getString(formData, "shiftId");
  const driverId = getString(formData, "driverId");
  if (!shiftId) return errorResult("shift_required", context.messages.shiftRequired);
  if (!driverId) return errorResult("driver_required", context.messages.driverRequired);

  const { data, error } = await (context.admin.supabase as typeof context.admin.supabase & {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("open_driver_shift_attendance_start_now", {
    p_organization_id: context.organization.id,
    p_shift_template_id: shiftId,
    p_driver_id: driverId,
  });
  if (error) {
    const mapped = mapDriverAttendanceOpenError(error.message, context.locale, context.messages);
    return errorResult(mapped.code, mapped.text);
  }

  const status = (data as { status?: string } | null)?.status;
  revalidatePath(context.path);
  if (status === "already_in_window") return { status: "success", message: attendanceMessage(context.locale, "attendanceAlreadyOpen") };
  if (status === "opened") return { status: "success", message: attendanceMessage(context.locale, "attendanceOpened") };
  return { status: "error", code: "attendance_not_applicable", message: attendanceMessage(context.locale, "attendanceNotApplicable") };
}

export async function archiveShiftTemplateAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.archive");
  if (context.status !== "success") return context.result;

  const shiftId = getString(formData, "shiftId");
  if (!shiftId) return errorResult("shift_required", context.messages.shiftRequired);

  const service = createAdminClient();
  const existing = await loadShift(service, context.organization.id, shiftId);

  if (!existing) return errorResult("shift_not_found", context.messages.shiftNotFound);

  const { error: shiftError } = await service
    .from("organization_shift_templates")
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      archived_by: context.admin.user.id,
      updated_by: context.admin.user.id,
    })
    .eq("id", shiftId)
    .eq("organization_id", context.organization.id)
    .is("archived_at", null);

  if (shiftError) {
    return errorResult("save_failed", context.messages.saveFailed);
  }

  await service
    .from("organization_shift_assignments")
    .update({
      is_active: false,
      updated_by: context.admin.user.id,
    })
    .eq("organization_id", context.organization.id)
    .eq("shift_template_id", shiftId)
    .eq("is_active", true);

  await writeShiftActivity(service, {
    action: "shift_archived",
    actorId: context.admin.user.id,
    organizationId: context.organization.id,
    shift: existing,
    beforeData: existing,
    afterData: { archived_at: new Date().toISOString(), is_active: false },
  });

  revalidatePath(context.path);
  return { status: "success", message: context.messages.archived };
}

export async function publishShiftTemplateAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.update");
  if (context.status !== "success") return context.result;

  const shiftId = getString(formData, "shiftId");
  if (!shiftId) return errorResult("shift_required", context.messages.shiftRequired);

  const service = createAdminClient();
  const existing = await loadShift(service, context.organization.id, shiftId);

  if (!existing || existing.archived_at) {
    return errorResult("shift_not_found", context.messages.shiftNotFound);
  }

  if (existing.published_at) {
    revalidatePath(context.path);
    return { status: "success", message: context.messages.published };
  }

  const publishedAt = new Date().toISOString();
  const { data, error } = await service
    .from("organization_shift_templates")
    .update({
      published_at: publishedAt,
      published_by: context.admin.user.id,
      updated_by: context.admin.user.id,
    })
    .eq("id", shiftId)
    .eq("organization_id", context.organization.id)
    .is("archived_at", null)
    .is("published_at", null)
    .select("id, name, published_at, published_by")
    .maybeSingle();

  if (error) {
    return errorResult("publish_failed", context.messages.publishFailed);
  }

  if (data) {
    await writeShiftActivity(service, {
      action: "shift_published",
      actorId: context.admin.user.id,
      organizationId: context.organization.id,
      shift: existing,
      beforeData: {
        published_at: existing.published_at,
        published_by: existing.published_by,
      },
      afterData: {
        published_at: data.published_at,
        published_by: data.published_by,
      },
    });
  }

  revalidatePath(context.path);
  return { status: "success", message: context.messages.published };
}

export async function unpublishShiftTemplateAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.update");
  if (context.status !== "success") return context.result;

  const shiftId = getString(formData, "shiftId");
  if (!shiftId) return errorResult("shift_required", context.messages.shiftRequired);

  const service = createAdminClient();
  const existing = await loadShift(service, context.organization.id, shiftId);

  if (!existing || existing.archived_at) {
    return errorResult("shift_not_found", context.messages.shiftNotFound);
  }

  if (!existing.published_at) {
    revalidatePath(context.path);
    return { status: "success", message: context.messages.unpublished };
  }

  const { data, error } = await service
    .from("organization_shift_templates")
    .update({
      published_at: null,
      published_by: null,
      updated_by: context.admin.user.id,
    })
    .eq("id", shiftId)
    .eq("organization_id", context.organization.id)
    .is("archived_at", null)
    .not("published_at", "is", null)
    .select("id, name, published_at, published_by")
    .maybeSingle();

  if (error) {
    return errorResult("unpublish_failed", context.messages.unpublishFailed);
  }

  if (data) {
    await writeShiftActivity(service, {
      action: "shift_unpublished",
      actorId: context.admin.user.id,
      organizationId: context.organization.id,
      shift: existing,
      beforeData: {
        published_at: existing.published_at,
        published_by: existing.published_by,
      },
      afterData: {
        published_at: data.published_at,
        published_by: data.published_by,
      },
    });
  }

  revalidatePath(context.path);
  return { status: "success", message: context.messages.unpublished };
}

export async function replaceShiftAssignmentsAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.assign");
  if (context.status !== "success") return context.result;

  const shiftId = getString(formData, "shiftId");
  const selectedDriverIds = Array.from(
    new Set(
      formData
        .getAll("driverIds")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (!shiftId) return errorResult("shift_required", context.messages.shiftRequired);

  const service = createAdminClient();
  const shift = await loadShift(service, context.organization.id, shiftId);

  if (!shift) return errorResult("shift_not_found", context.messages.shiftNotFound);
  if (!shift.is_active || shift.archived_at) {
    return errorResult("inactive_shift", context.messages.inactiveShift);
  }

  const today = getRiyadhDateString();

  if (selectedDriverIds.length > 0) {
    const { data: selectedDrivers, error: selectedDriversError } = await service
      .from("drivers")
      .select("id, full_name, keeta_driver_id, status, deleted_at, settlement_type")
      .eq("organization_id", context.organization.id)
      .in("id", selectedDriverIds);

    if (selectedDriversError || (selectedDrivers ?? []).length !== selectedDriverIds.length) {
      return errorResult("inactive_driver", context.messages.inactiveDriver);
    }

    const invalidDriver = (selectedDrivers ?? []).find(
      (driver) =>
        driver.status !== "active" ||
        driver.deleted_at ||
        driver.settlement_type !== "tiers",
    );

    if (invalidDriver) {
      return errorResult("inactive_driver", context.messages.inactiveDriver);
    }
  }

  const { data: currentAssignments, error: currentAssignmentsError } =
    await service
      .from("organization_shift_assignments")
      .select("id, shift_template_id, driver_id, is_active, assignment_start_date, assignment_end_date")
      .eq("organization_id", context.organization.id)
      .eq("shift_template_id", shiftId)
      .eq("is_active", true)
      .or(`assignment_start_date.is.null,assignment_start_date.lte.${today}`)
      .or(`assignment_end_date.is.null,assignment_end_date.gte.${today}`);

  if (currentAssignmentsError) {
    return errorResult("save_failed", context.messages.saveFailed);
  }

  const { data: driverAssignments, error: driverAssignmentsError } =
    selectedDriverIds.length === 0
      ? {
          data: [] as Pick<
            ShiftAssignmentRow,
            | "id"
            | "shift_template_id"
            | "driver_id"
            | "assignment_start_date"
            | "assignment_end_date"
            | "created_at"
          >[],
          error: null,
        }
      : await service
          .from("organization_shift_assignments")
          .select("id, shift_template_id, driver_id, assignment_start_date, assignment_end_date, created_at")
          .eq("organization_id", context.organization.id)
          .eq("is_active", true)
          .in("driver_id", selectedDriverIds);

  if (driverAssignmentsError) {
    return errorResult("save_failed", context.messages.saveFailed);
  }

  const selected = new Set(selectedDriverIds);
  const activeCurrent = (currentAssignments ?? []) as Pick<
    ShiftAssignmentRow,
    | "id"
    | "shift_template_id"
    | "driver_id"
    | "is_active"
    | "assignment_start_date"
    | "assignment_end_date"
  >[];
  const currentDriverIds = new Set(activeCurrent.map((assignment) => assignment.driver_id));
  const toRemove = activeCurrent.filter((assignment) => !selected.has(assignment.driver_id));
  const toAdd = selectedDriverIds.filter((driverId) => !currentDriverIds.has(driverId));
  const toAddSet = new Set(toAdd);

  const futureScheduledAssignment = (driverAssignments ?? [])
    .filter((assignment) => toAddSet.has(assignment.driver_id))
    .filter((assignment) => isFutureAssignment(assignment, today))
    .sort(compareAssignmentsByStartDate)[0];

  if (futureScheduledAssignment) {
    return errorResult(
      "future_assignment_conflict",
      getFutureAssignmentConflictMessage(
        context.locale,
        formatDisplayDate(futureScheduledAssignment.assignment_start_date),
      ),
    );
  }

  const otherShiftIds = Array.from(
    new Set(
      (driverAssignments ?? [])
        .filter((assignment) => toAddSet.has(assignment.driver_id))
        .filter((assignment) => isAssignmentEffectiveOn(assignment, today))
        .filter((assignment) => assignment.shift_template_id !== shiftId)
        .map((assignment) => assignment.shift_template_id),
    ),
  );

  if (otherShiftIds.length > 0) {
    const { data: otherShifts, error: otherShiftsError } = await service
      .from("organization_shift_templates")
      .select("id, name, start_time, end_time, is_active, archived_at")
      .eq("organization_id", context.organization.id)
      .in("id", otherShiftIds);

    if (otherShiftsError) {
      return errorResult("save_failed", context.messages.saveFailed);
    }

    const overlappingShift = (otherShifts ?? []).find(
      (otherShift) =>
        otherShift.is_active &&
        !otherShift.archived_at &&
        rangesOverlap(
          shift.start_time,
          shift.end_time,
          otherShift.start_time,
          otherShift.end_time,
        ),
    );

    if (overlappingShift) {
      return errorResult("overlapping_shift", context.messages.overlappingShift);
    }
  }

  if (toRemove.length > 0) {
    await service
      .from("organization_shift_assignments")
      .update({ is_active: false, updated_by: context.admin.user.id })
      .in("id", toRemove.map((assignment) => assignment.id));
  }

  if (toAdd.length > 0) {
    const { error: insertError } = await service
      .from("organization_shift_assignments")
      .insert(
        toAdd.map((driverId) => ({
          organization_id: context.organization.id,
          shift_template_id: shiftId,
          driver_id: driverId,
          assignment_start_date: today,
          created_by: context.admin.user.id,
          updated_by: context.admin.user.id,
        })),
      );

    if (insertError) {
      return errorResult(
        insertError.message.includes("organization_shift_assignments_active_driver_shift_key")
          ? "duplicate_assignment"
          : "save_failed",
        insertError.message.includes("organization_shift_assignments_active_driver_shift_key")
          ? context.messages.duplicateAssignment
          : context.messages.saveFailed,
      );
    }
  }

  await Promise.all([
    ...toAdd.map((driverId) =>
      writeShiftActivity(service, {
        action: "driver_assigned",
        actorId: context.admin.user.id,
        organizationId: context.organization.id,
        shift,
        driverId,
      }),
    ),
    ...toRemove.map((assignment) =>
      writeShiftActivity(service, {
        action: "driver_unassigned",
        actorId: context.admin.user.id,
        organizationId: context.organization.id,
        shift,
        driverId: assignment.driver_id,
      }),
    ),
  ]);

  revalidatePath(context.path);
  return { status: "success", message: context.messages.assignmentsSaved };
}

export async function moveShiftDriverAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.assign");
  if (context.status !== "success") return context.result;

  const sourceShiftId = getString(formData, "sourceShiftId");
  const targetShiftId = getString(formData, "targetShiftId");
  const driverId = getString(formData, "driverId");
  const assignmentStartDate = getString(formData, "assignmentStartDate");
  const assignmentEndDate = getString(formData, "assignmentEndDate");

  if (
    !sourceShiftId ||
    !targetShiftId ||
    !driverId ||
    !assignmentStartDate ||
    !assignmentEndDate ||
    assignmentStartDate > assignmentEndDate
  ) {
    return errorResult("invalid_move", moveMessage(context.messages, "invalidMove", "Invalid driver move."));
  }

  const { data: driver, error: driverError } = await context.admin.supabase
    .from("drivers")
    .select("id, status, deleted_at, settlement_type")
    .eq("id", driverId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (
    driverError ||
    !driver ||
    driver.status !== "active" ||
    driver.deleted_at ||
    driver.settlement_type !== "tiers"
  ) {
    return errorResult("inactive_driver", context.messages.inactiveDriver);
  }

  const { data, error } = await (context.admin.supabase as typeof context.admin.supabase & {
    rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  }).rpc(
    "move_organization_shift_driver",
    {
      p_organization_id: context.organization.id,
      p_source_shift_id: sourceShiftId,
      p_target_shift_id: targetShiftId,
      p_driver_id: driverId,
      p_assignment_start_date: assignmentStartDate,
      p_assignment_end_date: assignmentEndDate,
    },
  );

  if (error) {
    const message = mapMoveRpcError(error.message, context.messages);
    return errorResult(message.code, message.text);
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) {
    const message = mapMoveRpcError(result?.error ?? "MOVE_FAILED", context.messages);
    return errorResult(message.code, message.text);
  }

  revalidatePath(context.path);
  return { status: "success", message: moveMessage(context.messages, "moveSuccess", "Driver moved successfully.") };
}

export async function replaceShiftWeekMembersAction(
  _previousState: ShiftActionResult,
  formData: FormData,
): Promise<ShiftActionResult> {
  const context = await getActionContext(formData, "shifts.assign");
  if (context.status !== "success") return context.result;

  const shiftId = getString(formData, "shiftId");
  const weekStart = getString(formData, "weekStart");
  const weekEnd = getString(formData, "weekEnd");
  const driverIds = Array.from(
    new Set(
      formData
        .getAll("driverIds")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (!shiftId || !weekStart || !weekEnd || weekStart > weekEnd) {
    return errorResult("invalid_week_range", moveMessage(context.messages, "invalidWeekRange", "Invalid week range."));
  }

  const { data, error } = await (context.admin.supabase as typeof context.admin.supabase & {
    rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
  }).rpc("replace_organization_shift_week_members", {
    p_organization_id: context.organization.id,
    p_shift_template_id: shiftId,
    p_week_start: weekStart,
    p_week_end: weekEnd,
    p_driver_ids: driverIds,
  });

  if (error) {
    const message = mapMembershipRpcError(error.message, context.messages);
    return errorResult(message.code, message.text);
  }

  const result = data as { success?: boolean; error?: string } | null;
  if (!result?.success) {
    const message = mapMembershipRpcError(result?.error ?? "MEMBERSHIP_FAILED", context.messages);
    return errorResult(message.code, message.text);
  }

  revalidatePath(context.path);
  return {
    status: "success",
    message: moveMessage(context.messages, "membershipSaved", "Weekly driver membership saved successfully."),
  };
}

async function saveShift(
  context: Extract<ActionContext, { status: "success" }>,
  formData: FormData,
  shiftId: string | null,
): Promise<ShiftActionResult> {
  const name = getString(formData, "name");
  const startTime = getString(formData, "startTime");
  const endTime = getString(formData, "endTime");
  const hasBreak = formData.get("hasBreak") === "on";
  const breakStartTime = hasBreak ? getString(formData, "breakStartTime") : null;
  const breakEndTime = hasBreak ? getString(formData, "breakEndTime") : null;
  const isActive = formData.get("isActive") === "on";
  const driverNote = normalizeOptionalString(getString(formData, "driverNote"));

  if (!name) return errorResult("name_required", context.messages.nameRequired);
  if (driverNote && driverNote.length > 500) {
    return errorResult("driver_note_too_long", context.messages.invalidTimes);
  }

  const summary = validateShiftTimes({
    startTime,
    endTime,
    hasBreak,
    breakStartTime,
    breakEndTime,
  });

  if (!summary.ok) {
    return errorResult(summary.code, context.messages.validation[summary.code] ?? context.messages.invalidTimes);
  }

  const service = createAdminClient();
  const existing = shiftId
    ? await loadShift(service, context.organization.id, shiftId)
    : null;

  if (shiftId && !existing) {
    return errorResult("shift_not_found", context.messages.shiftNotFound);
  }

  const record = {
    organization_id: context.organization.id,
    name,
    start_time: startTime,
    end_time: endTime,
    crosses_midnight: summary.crossesMidnight,
    has_break: hasBreak,
    break_start_time: hasBreak ? breakStartTime : null,
    break_end_time: hasBreak ? breakEndTime : null,
    is_active: isActive,
    driver_note: driverNote,
    updated_by: context.admin.user.id,
  };

  if (shiftId) {
    const { error } = await service
      .from("organization_shift_templates")
      .update(record)
      .eq("id", shiftId)
      .eq("organization_id", context.organization.id)
      .is("archived_at", null);

    if (error) return errorResult("save_failed", context.messages.saveFailed);

    await writeShiftActivity(service, {
      action:
        existing?.is_active !== isActive
          ? isActive
            ? "shift_activated"
            : "shift_deactivated"
          : "shift_updated",
      actorId: context.admin.user.id,
      organizationId: context.organization.id,
      shift: existing ?? ({ id: shiftId, name } as ShiftTemplateRow),
      beforeData: existing,
      afterData: record,
    });
  } else {
    const { data, error } = await service
      .from("organization_shift_templates")
      .insert({
        ...record,
        created_by: context.admin.user.id,
      })
      .select("id, name")
      .single();

    if (error) return errorResult("save_failed", context.messages.saveFailed);

    await writeShiftActivity(service, {
      action: "shift_created",
      actorId: context.admin.user.id,
      organizationId: context.organization.id,
      shift: { id: data.id, name: data.name } as ShiftTemplateRow,
      afterData: record,
    });
  }

  revalidatePath(context.path);
  return { status: "success", message: context.messages.saved };
}

type ActionContext =
  | {
      status: "success";
      admin: Extract<Awaited<ReturnType<typeof getAuthenticatedAdmin>>, { status: "authorized" }>;
      organization: { id: string; code: string };
      path: string;
      locale: "ar" | "en";
      messages: ActionMessages;
    }
  | { status: "error"; result: ShiftActionResult };

async function getActionContext(
  formData: FormData,
  permissionKey: "shifts.create" | "shifts.update" | "shifts.assign" | "shifts.archive",
): Promise<ActionContext> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const messages = getActionMessages(locale === "en" ? "en" : "ar");

  if (!isLocale(locale) || !organizationCode) {
    return { status: "error", result: errorResult("invalid_context", messages.invalidContext) };
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "error", result: errorResult("unauthorized", messages.unauthorized) };
  }

  const organization = await getAccessibleOrganizationByCode(organizationCode);

  if (!organization) {
    return { status: "error", result: errorResult("organization_not_found", messages.organizationNotFound) };
  }

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organization.id,
  );

  if (!permissions.has(permissionKey)) {
    return { status: "error", result: errorResult("unauthorized", messages.unauthorized) };
  }

  return {
    status: "success",
    admin,
    organization,
    path: `/${locale}/dashboard/organizations/${organizationCode}/shifts/manage`,
    locale: locale === "en" ? "en" : "ar",
    messages,
  };
}

async function loadShift(
  service: ReturnType<typeof createAdminClient>,
  organizationId: string,
  shiftId: string,
) {
  const { data, error } = await service
    .from("organization_shift_templates")
    .select("*")
    .eq("id", shiftId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) return null;
  return data as ShiftTemplateRow | null;
}

async function writeShiftActivity(
  service: ReturnType<typeof createAdminClient>,
  {
    action,
    actorId,
    organizationId,
    shift,
    driverId,
    beforeData = null,
    afterData = null,
  }: {
    action: string;
    actorId: string;
    organizationId: string;
    shift: Pick<ShiftTemplateRow, "id" | "name">;
    driverId?: string;
    beforeData?: unknown;
    afterData?: unknown;
  },
) {
  await service.from("activity_logs").insert({
    action,
    actor_user_id: actorId,
    organization_id: organizationId,
    entity_type: driverId ? "organization_shift_assignment" : "organization_shift_template",
    entity_id: shift.id,
    target_user_id: null,
    before_data: beforeData as Database["public"]["Tables"]["activity_logs"]["Insert"]["before_data"],
    after_data: afterData as Database["public"]["Tables"]["activity_logs"]["Insert"]["after_data"],
    metadata: {
      shiftId: shift.id,
      shiftName: shift.name,
      driverId: driverId ?? null,
    },
  });
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: string) {
  return value.length > 0 ? value : null;
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

function isAssignmentEffectiveOn(
  assignment: Pick<ShiftAssignmentRow, "assignment_start_date" | "assignment_end_date">,
  date: string,
) {
  return (
    (!assignment.assignment_start_date || assignment.assignment_start_date <= date) &&
    (!assignment.assignment_end_date || assignment.assignment_end_date >= date)
  );
}

function isFutureAssignment(
  assignment: Pick<ShiftAssignmentRow, "assignment_start_date">,
  date: string,
) {
  return Boolean(assignment.assignment_start_date && assignment.assignment_start_date > date);
}

function compareAssignmentsByStartDate(
  first: Pick<ShiftAssignmentRow, "assignment_start_date" | "created_at">,
  second: Pick<ShiftAssignmentRow, "assignment_start_date" | "created_at">,
) {
  return (
    (first.assignment_start_date ?? "").localeCompare(second.assignment_start_date ?? "") ||
    first.created_at.localeCompare(second.created_at)
  );
}

function formatDisplayDate(date: string | null) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function getFutureAssignmentConflictMessage(locale: "ar" | "en", date: string) {
  if (locale === "en") {
    return `This driver has a scheduled shift change starting on ${date}.`;
  }

  return `\u064a\u0648\u062c\u062f \u0644\u0644\u0645\u0646\u062f\u0648\u0628 \u062a\u063a\u064a\u064a\u0631 \u0634\u064a\u0641\u062a \u0645\u062c\u062f\u0648\u0644 \u064a\u0628\u062f\u0623 \u0628\u062a\u0627\u0631\u064a\u062e ${date}.`;
}

function errorResult(code: string, message: string): ShiftActionResult {
  return { status: "error", code, message };
}

function mapMoveRpcError(message: string, messages: ActionMessages) {
  if (message.includes("DRIVER_NOT_TIERS")) {
    return { code: "inactive_driver", text: messages.inactiveDriver };
  }
  if (message.includes("SHIFT_ASSIGNMENT_OVERLAP")) {
    return { code: "move_overlap", text: moveMessage(messages, "moveOverlap", "The driver already has another shift in this period.") };
  }
  if (message.includes("SHIFT_ASSIGNMENT_NOT_FOUND")) {
    return { code: "move_not_found", text: moveMessage(messages, "moveNotFound", "The selected assignment or shift was not found.") };
  }
  if (message.includes("SHIFT_MOVE_UNAUTHORIZED")) {
    return { code: "unauthorized", text: moveMessage(messages, "movePermission", "You are not authorized to move this driver.") };
  }
  return { code: "move_failed", text: moveMessage(messages, "moveFailed", "Driver could not be moved.") };
}

function mapMembershipRpcError(message: string, messages: ActionMessages) {
  if (message.includes("DRIVER_NOT_TIERS")) {
    return { code: "inactive_driver", text: messages.inactiveDriver };
  }
  if (message.includes("DRIVER_ALREADY_ASSIGNED_THIS_WEEK")) {
    return { code: "driver_already_assigned_this_week", text: moveMessage(messages, "driverAlreadyAssigned", "This driver is assigned to another shift in this week.") };
  }
  if (message.includes("INVALID_WEEK_RANGE")) {
    return { code: "invalid_week_range", text: moveMessage(messages, "invalidWeekRange", "Invalid week range.") };
  }
  if (message.includes("SHIFT_NOT_FOUND")) {
    return { code: "shift_not_found", text: messages.shiftNotFound };
  }
  if (message.includes("DRIVER_NOT_IN_ORGANIZATION")) {
    return { code: "driver_not_in_organization", text: moveMessage(messages, "driverNotInOrganization", "The driver does not belong to this organization.") };
  }
  if (message.includes("SHIFT_MEMBERSHIP_UNAUTHORIZED")) {
    return { code: "unauthorized", text: messages.unauthorized };
  }
  return { code: "membership_failed", text: moveMessage(messages, "membershipFailed", "Weekly driver membership could not be saved.") };
}

function moveMessage(messages: ActionMessages, key: string, fallback: string) {
  const value = (messages as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

function attendanceMessage(
  locale: "ar" | "en",
  key: "attendancePolicyInvalid" | "attendancePolicySaveFailed" | "attendancePolicySaved" | "attendanceOpenFailed" | "attendanceAlreadyOpen" | "attendanceOpened" | "attendanceNotApplicable" | "attendanceDriverNotAssigned" | "attendanceOccurrenceExpired" | "attendanceDriverUnavailable" | "attendancePolicyUnconfigured",
) {
  const messages = {
    en: {
      attendancePolicyInvalid: "Enter a start window from 0 to 1440 minutes and an end duration from 1 to 1440 minutes.",
      attendancePolicySaveFailed: "Attendance settings could not be saved.",
      attendancePolicySaved: "Attendance settings updated.",
      attendanceOpenFailed: "The shift could not be opened now.",
      attendanceAlreadyOpen: "Attendance is already open for this shift.",
      attendanceOpened: "Attendance opened for this shift.",
      attendanceNotApplicable: "This shift has no eligible occurrence right now.",
      attendanceDriverNotAssigned: "This driver is not assigned to this shift occurrence.",
      attendanceOccurrenceExpired: "This shift has ended and Start can no longer be opened.",
      attendanceDriverUnavailable: "This driver is no longer eligible for attendance.",
      attendancePolicyUnconfigured: "Configure the attendance policy before opening Start.",
    },
    ar: {
      attendanceOccurrenceExpired: "انتهى وقت هذا الشيفت ولا يمكن فتح بدء الدوام الآن.",
      attendancePolicyInvalid: "أدخل وقت فتح من 0 إلى 1440 دقيقة ومدة نهاية من 1 إلى 1440 دقيقة.",
      attendancePolicySaveFailed: "تعذر حفظ إعدادات الحضور.",
      attendancePolicySaved: "تم تحديث إعدادات الحضور.",
      attendanceOpenFailed: "تعذر فتح الحضور لهذا الشيفت الآن.",
      attendanceAlreadyOpen: "الحضور مفتوح بالفعل لهذا الشيفت.",
      attendanceOpened: "تم فتح الحضور لهذا الشيفت.",
      attendanceNotApplicable: "لا توجد فترة مؤهلة لهذا الشيفت الآن.",
      attendanceDriverNotAssigned: "هذا المندوب غير مرتبط بهذا الشيفت في هذه الفترة.",
      attendanceDriverUnavailable: "لا يمكن فتح البداية لهذا المندوب حاليا.",
      attendancePolicyUnconfigured: "يرجى تحديد إعدادات الحضور قبل فتح البداية.",
    },
  } as const;
  return messages[locale][key];
}

function mapDriverAttendanceOpenError(message: string, locale: "ar" | "en", messages: ActionMessages) {
  if (message.includes("SHIFT_ATTENDANCE_POLICY_UNCONFIGURED")) {
    return { code: "attendance_policy_unconfigured", text: attendanceMessage(locale, "attendancePolicyUnconfigured") };
  }
  if (message.includes("SHIFT_ATTENDANCE_OCCURRENCE_ENDED")) {
    return { code: "attendance_occurrence_expired", text: attendanceMessage(locale, "attendanceOccurrenceExpired") };
  }
  if (message.includes("SHIFT_DRIVER_NOT_ASSIGNED")) {
    return { code: "attendance_driver_not_assigned", text: attendanceMessage(locale, "attendanceDriverNotAssigned") };
  }
  if (message.includes("SHIFT_DRIVER_NOT_ELIGIBLE")) {
    return { code: "attendance_driver_unavailable", text: attendanceMessage(locale, "attendanceDriverUnavailable") };
  }
  if (message.includes("SHIFT_OVERRIDE_FORBIDDEN")) {
    return { code: "unauthorized", text: messages.unauthorized };
  }
  return { code: "attendance_open_failed", text: attendanceMessage(locale, "attendanceOpenFailed") };
}

type ActionMessages = ReturnType<typeof getActionMessages>;

function getActionMessages(locale: "ar" | "en") {
  if (locale === "en") {
    return {
      invalidContext: "The organization context is invalid.",
      unauthorized: "You are not authorized for this action.",
      organizationNotFound: "The selected organization could not be found.",
      nameRequired: "Shift name is required.",
      invalidTimes: "Check the shift times and try again.",
      shiftRequired: "Choose a shift first.",
      driverRequired: "Choose a driver first.",
      shiftNotFound: "The selected shift could not be found.",
      inactiveShift: "Cannot assign drivers to an inactive shift.",
      inactiveDriver: "Cannot assign an inactive driver.",
      overlappingShift: "This driver is assigned to another conflicting shift.",
      duplicateAssignment: "This driver is already assigned to this shift.",
      saveFailed: "Shift changes could not be saved. Try again.",
      publishFailed: "Shift could not be published. Try again.",
      unpublishFailed: "Shift could not be unpublished. Try again.",
      saved: "Shift saved successfully.",
      archived: "Shift archived successfully.",
      published: "Shift published to drivers successfully.",
      unpublished: "Shift unpublished and hidden from drivers successfully.",
      assignmentsSaved: "Driver assignments saved successfully.",
      invalidMove: "Choose a valid source, target, driver, and date range.",
      moveSuccess: "Driver moved successfully.",
      moveFailed: "Driver could not be moved. Try again.",
      moveOverlap: "This driver already has another shift in the selected period.",
      moveNotFound: "The selected assignment or shift could not be found.",
      movePermission: "You are not authorized to move this driver.",
      invalidWeekRange: "Invalid week range.",
      driverAlreadyAssigned: "This driver is assigned to another shift in this week.",
      driverNotInOrganization: "The driver does not belong to this organization.",
      membershipFailed: "Weekly driver membership could not be saved.",
      membershipSaved: "Weekly driver membership saved successfully.",
      shiftChangeDaysSaved: "Shift request days saved successfully.",
      shiftChangeDaysFailed: "Shift request days could not be saved. Try again.",
      shiftChangeDaysInvalid: "Choose valid weekdays.",
      validation: {
        time_required: "Start and end time are required.",
        zero_duration: "Start and end time cannot be the same.",
        break_required: "Break start and end time are required.",
        break_zero_duration: "Break start and end time cannot be the same.",
        break_outside_shift: "Break time must be inside the shift.",
        break_consumes_shift: "Break duration cannot consume the full shift.",
      } as Record<string, string>,
    };
  }

  return {
    invalidContext: "سياق المؤسسة غير صالح.",
    unauthorized: "ليست لديك صلاحية لهذا الإجراء.",
    organizationNotFound: "تعذر العثور على المؤسسة المحددة.",
    nameRequired: "اسم الشيفت مطلوب.",
    invalidTimes: "تحقق من أوقات الشيفت وحاول مرة أخرى.",
    shiftRequired: "اختر شيفت أولًا.",
    driverRequired: "اختر مندوبًا أولًا.",
    shiftNotFound: "تعذر العثور على الشيفت المحدد.",
    inactiveShift: "لا يمكن ربط مندوب بشيفت غير مفعّل.",
    inactiveDriver: "لا يمكن ربط مندوب غير نشط.",
    overlappingShift: "هذا المندوب مرتبط بشيفت آخر متعارض في نفس الفترة.",
    duplicateAssignment: "هذا المندوب مرتبط بالفعل بهذا الشيفت.",
    saveFailed: "تعذر حفظ تغييرات الشيفت. حاول مرة أخرى.",
    publishFailed: "تعذر نشر الشيفت. حاول مرة أخرى.",
    unpublishFailed: "تعذر إلغاء نشر الشيفت. حاول مرة أخرى.",
    saved: "تم حفظ الشيفت بنجاح.",
    archived: "تمت أرشفة الشيفت بنجاح.",
    published: "تم نشر الشيفت للمناديب بنجاح",
    unpublished: "تم إلغاء نشر الشيفت وإخفاؤه عن المناديب بنجاح",
    assignmentsSaved: "تم حفظ ربط المناديب بنجاح.",
    shiftChangeDaysSaved: "\u062a\u0645 \u062d\u0641\u0638 \u0623\u064a\u0627\u0645 \u0637\u0644\u0628 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0634\u064a\u0641\u062a \u0628\u0646\u062c\u0627\u062d.",
    shiftChangeDaysFailed: "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0623\u064a\u0627\u0645 \u0637\u0644\u0628 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0634\u064a\u0641\u062a. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    shiftChangeDaysInvalid: "\u0627\u062e\u062a\u0631 \u0623\u064a\u0627\u0645\u064b\u0627 \u0635\u0627\u0644\u062d\u0629.",
    validation: {
      time_required: "وقت البداية والنهاية مطلوبان.",
      zero_duration: "وقت البداية والنهاية لا يمكن أن يكونا متطابقين.",
      break_required: "بداية ونهاية البريك مطلوبتان.",
      break_zero_duration: "بداية ونهاية البريك لا يمكن أن تكونا متطابقتين.",
      break_outside_shift: "يجب أن يكون البريك داخل وقت الشيفت.",
      break_consumes_shift: "مدة البريك لا يمكن أن تستهلك الشيفت بالكامل.",
    } as Record<string, string>,
  };
}
