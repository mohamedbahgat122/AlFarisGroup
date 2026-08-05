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

  if (selectedDriverIds.length > 0) {
    const { data: selectedDrivers, error: selectedDriversError } = await service
      .from("drivers")
      .select("id, full_name, keeta_driver_id, status, deleted_at")
      .eq("organization_id", context.organization.id)
      .in("id", selectedDriverIds);

    if (selectedDriversError || (selectedDrivers ?? []).length !== selectedDriverIds.length) {
      return errorResult("inactive_driver", context.messages.inactiveDriver);
    }

    const invalidDriver = (selectedDrivers ?? []).find(
      (driver) => driver.status !== "active" || driver.deleted_at,
    );

    if (invalidDriver) {
      return errorResult("inactive_driver", context.messages.inactiveDriver);
    }
  }

  const { data: currentAssignments, error: currentAssignmentsError } =
    await service
      .from("organization_shift_assignments")
      .select("id, shift_template_id, driver_id, is_active")
      .eq("organization_id", context.organization.id)
      .eq("shift_template_id", shiftId)
      .eq("is_active", true);

  if (currentAssignmentsError) {
    return errorResult("save_failed", context.messages.saveFailed);
  }

  const { data: driverAssignments, error: driverAssignmentsError } =
    selectedDriverIds.length === 0
      ? { data: [] as Pick<ShiftAssignmentRow, "id" | "shift_template_id" | "driver_id">[], error: null }
      : await service
          .from("organization_shift_assignments")
          .select("id, shift_template_id, driver_id")
          .eq("organization_id", context.organization.id)
          .eq("is_active", true)
          .in("driver_id", selectedDriverIds);

  if (driverAssignmentsError) {
    return errorResult("save_failed", context.messages.saveFailed);
  }

  const otherShiftIds = Array.from(
    new Set(
      (driverAssignments ?? [])
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

  const selected = new Set(selectedDriverIds);
  const activeCurrent = (currentAssignments ?? []) as Pick<
    ShiftAssignmentRow,
    "id" | "shift_template_id" | "driver_id" | "is_active"
  >[];
  const currentDriverIds = new Set(activeCurrent.map((assignment) => assignment.driver_id));
  const toRemove = activeCurrent.filter((assignment) => !selected.has(assignment.driver_id));
  const toAdd = selectedDriverIds.filter((driverId) => !currentDriverIds.has(driverId));

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

function errorResult(code: string, message: string): ShiftActionResult {
  return { status: "error", code, message };
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
      shiftNotFound: "The selected shift could not be found.",
      inactiveShift: "Cannot assign drivers to an inactive shift.",
      inactiveDriver: "Cannot assign an inactive driver.",
      overlappingShift: "This driver is assigned to another conflicting shift.",
      duplicateAssignment: "This driver is already assigned to this shift.",
      saveFailed: "Shift changes could not be saved. Try again.",
      saved: "Shift saved successfully.",
      archived: "Shift archived successfully.",
      assignmentsSaved: "Driver assignments saved successfully.",
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
    shiftNotFound: "تعذر العثور على الشيفت المحدد.",
    inactiveShift: "لا يمكن ربط مندوب بشيفت غير مفعّل.",
    inactiveDriver: "لا يمكن ربط مندوب غير نشط.",
    overlappingShift: "هذا المندوب مرتبط بشيفت آخر متعارض في نفس الفترة.",
    duplicateAssignment: "هذا المندوب مرتبط بالفعل بهذا الشيفت.",
    saveFailed: "تعذر حفظ تغييرات الشيفت. حاول مرة أخرى.",
    saved: "تم حفظ الشيفت بنجاح.",
    archived: "تمت أرشفة الشيفت بنجاح.",
    assignmentsSaved: "تم حفظ ربط المناديب بنجاح.",
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
