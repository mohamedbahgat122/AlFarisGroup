"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ShiftTransferFormData, ShiftTransferResult } from "./types";

const transferBeforeCurrentStartMessage =
  "لا يمكن نقل المشرف بتاريخ يسبق بداية الشيفت الحالي.";

export async function transferSupervisorShift(data: ShiftTransferFormData): Promise<ShiftTransferResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return {
      success: false,
      code: "unauthorized",
      message: "غير مصرح بتنفيذ هذا الإجراء",
    };
  }

  if (!isUuid(data.supervisor_id) || !isUuid(data.new_shift_id) || !data.start_date) {
    return {
      success: false,
      code: "validation_error",
      message: "يرجى إدخال بيانات النقل المطلوبة",
    };
  }

  const { error } = await supabase.rpc("transfer_supervisor_shift", {
    p_supervisor_id: data.supervisor_id,
    p_new_shift_id: data.new_shift_id,
    p_start_date: data.start_date,
    p_notes: data.notes || "",
  });

  if (error) {
    console.error("Error transferring shift:", error);
    if (error.message === "SUPERVISOR_SHIFT_TRANSFER_BEFORE_CURRENT_START") {
      return {
        success: false,
        code: "before_current_start",
        message: transferBeforeCurrentStartMessage,
      };
    }

    return {
      success: false,
      code: "save_failed",
      message: "تعذر نقل المشرف. حاول مرة أخرى.",
    };
  }

  revalidatePath("/dashboard/supervisor-shifts");
  return { success: true };
}

export async function removeSupervisorFromShiftAction(supervisorId: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  if (!isUuid(supervisorId)) {
    throw new Error("معرف المشرف غير صالح");
  }

  const { data: actorProfile, error: actorError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (actorError || !actorProfile) {
    throw new Error("Unauthorized");
  }

  if (actorProfile.role !== "system_owner") {
    const { data: hasPermission, error: permissionError } = await supabase.rpc(
      "actor_has_global_permission",
      {
        p_actor_user_id: authData.user.id,
        p_permission_key: "supervisor_shifts.manage",
      },
    );

    if (permissionError || !hasPermission) {
      throw new Error("Unauthorized");
    }
  }

  const { data: supervisor, error: supervisorError } = await supabase
    .from("profiles")
    .select("id, role, status, deleted_at")
    .eq("id", supervisorId)
    .maybeSingle();

  if (
    supervisorError ||
    !supervisor ||
    supervisor.role !== "supervisor" ||
    supervisor.status !== "active" ||
    supervisor.deleted_at
  ) {
    throw new Error("المشرف غير متاح");
  }

  const { data: activeAssignment, error: assignmentError } = await supabase
    .from("supervisor_shift_assignments")
    .select("id, start_date")
    .eq("supervisor_id", supervisorId)
    .is("end_date", null)
    .maybeSingle();

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (!activeAssignment) {
    throw new Error("لا يوجد شيفت حالي لهذا المشرف");
  }

  const effectiveEndDate = getImmediateAssignmentEndDate(activeAssignment.start_date);

  const { data: updatedAssignment, error: updateError } = await supabase
    .from("supervisor_shift_assignments")
    .update({
      end_date: effectiveEndDate,
      updated_by: authData.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", activeAssignment.id)
    .is("end_date", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (!updatedAssignment) {
    throw new Error("لا يوجد شيفت حالي لهذا المشرف");
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function updateSupervisorOrganizations(
  supervisorId: string,
  organizationIds: string[],
  startDate: string
) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("update_supervisor_organizations", {
    p_supervisor_id: supervisorId,
    p_organization_ids: organizationIds,
    p_start_date: startDate,
    p_notes: "",
  });

  if (error) {
    console.error("Error updating organizations:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function createSupervisorLeave(data: {
  supervisor_id: string;
  start_date: string;
  end_date: string;
  leave_type?: string;
  reason?: string;
  notes?: string;
  covered_by_supervisor_id?: string;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.from("supervisor_leaves").insert({
    ...data,
    created_by: authData.user.id,
  });

  if (error) {
    console.error("Error creating leave:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function cancelSupervisorLeave(leaveId: string, reason: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("cancel_supervisor_leave", {
    p_leave_id: leaveId,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function assignSupervisorAction(data: {
  supervisor_id: string;
  shift_id: string;
  start_date: string;
  organization_ids: string[];
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  if (!data.supervisor_id || !data.shift_id || !data.start_date) {
    throw new Error("Missing required fields");
  }
  if (!data.organization_ids || data.organization_ids.length === 0) {
    throw new Error("يجب اختيار مؤسسة واحدة على الأقل");
  }

  // 1. Assign shift (transfer_supervisor_shift)
  // This RPC internally verifies the supervisor_shifts.manage permission.
  const { error: shiftError } = await supabase.rpc("transfer_supervisor_shift", {
    p_supervisor_id: data.supervisor_id,
    p_new_shift_id: data.shift_id,
    p_start_date: data.start_date,
    p_notes: "Initial assignment",
  });

  if (shiftError) {
    console.error("Error assigning supervisor shift:", shiftError);
    throw new Error(shiftError.message);
  }

  // 2. Assign organizations (update_supervisor_organizations)
  // This RPC internally verifies the supervisor_shifts.manage permission.
  // Note: These two RPC calls are NOT atomic together. If this second call fails, 
  // the shift assignment will have already succeeded.
  const { error: orgError } = await supabase.rpc("update_supervisor_organizations", {
    p_supervisor_id: data.supervisor_id,
    p_organization_ids: data.organization_ids,
    p_start_date: data.start_date,
    p_notes: "Initial organization assignment",
  });

  if (orgError) {
    console.error("Error assigning supervisor organizations:", orgError);
    // Explicitly mention the atomicity limitation in the error thrown.
    throw new Error(`تم تعيين الشيفت بنجاح، ولكن فشل تعيين المؤسسات: ${orgError.message}`);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function createShiftTemplate(data: {
  name: string;
  start_time: string;
  end_time: string;
  work_days: number[];
  is_active: boolean;
  break_start_time?: string | null;
  break_end_time?: string | null;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.from("supervisor_shifts").insert({
    name: data.name,
    start_time: data.start_time,
    end_time: data.end_time,
    work_days: data.work_days,
    is_active: data.is_active,
    break_start_time: data.break_start_time === undefined ? null : data.break_start_time,
    break_end_time: data.break_end_time === undefined ? null : data.break_end_time,
    created_by: authData.user.id,
  });

  if (error) {
    console.error("Error creating shift template:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function updateShiftTemplate(id: string, data: {
  name: string;
  start_time: string;
  end_time: string;
  work_days: number[];
  is_active: boolean;
  break_start_time?: string | null;
  break_end_time?: string | null;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.from("supervisor_shifts").update({
    name: data.name,
    start_time: data.start_time,
    end_time: data.end_time,
    work_days: data.work_days,
    is_active: data.is_active,
    break_start_time: data.break_start_time === undefined ? null : data.break_start_time,
    break_end_time: data.break_end_time === undefined ? null : data.break_end_time,
    updated_by: authData.user.id,
  }).eq("id", id);

  if (error) {
    console.error("Error updating shift template:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function toggleShiftTemplateStatus(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.from("supervisor_shifts").update({
    is_active: isActive,
    updated_by: authData.user.id,
  }).eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function setSupervisorWeeklyOff(data: {
  supervisor_id: string;
  day_of_week: number;
  coverage_supervisor_id: string | null;
  effective_from: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("set_supervisor_weekly_off", {
    p_supervisor_id: data.supervisor_id,
    p_day_of_week: data.day_of_week,
    p_coverage_supervisor_id: data.coverage_supervisor_id as string,
    p_start_date: data.effective_from,
    p_notes: data.notes || undefined,
  });

  if (error) {
    console.error("Error setting weekly off:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function startSupervisorWorkSession(supervisorId: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("start_supervisor_work_session", {
    p_supervisor_id: supervisorId,
  });

  if (error) {
    console.error("Error starting work session:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

export async function endSupervisorWorkSession(supervisorId: string, notes?: string) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("end_supervisor_work_session", {
    p_supervisor_id: supervisorId,
    p_notes: notes || undefined,
  });

  if (error) {
    console.error("Error ending work session:", error);
    throw new Error(error.message);
  }

  revalidatePath("/dashboard/supervisor-shifts");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getImmediateAssignmentEndDate(startDate: string) {
  const today = getRiyadhDate();
  const yesterday = addDays(today, -1);

  return startDate <= yesterday ? yesterday : startDate;
}

function getRiyadhDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
