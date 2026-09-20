"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";

const approvalErrorMessages: Record<string, string> = {
  SHIFT_CHANGE_DATE_BEFORE_ACTIVE_ASSIGNMENT:
    "لا يمكن اعتماد طلب تغيير الشيفت لأن تاريخ الطلب يسبق بداية ربط الشيفت الحالي.",
  SHIFT_CHANGE_REQUEST_OUTSIDE_SUBMISSION_WINDOW:
    "لا يمكن اعتماد الطلب لأنه لم يتم إنشاؤه داخل نافذة السبت أو الأحد أو الاثنين.",
  SHIFT_CHANGE_INVALID_EXECUTION_WEEK:
    "لا يمكن اعتماد الطلب لأن تاريخ التنفيذ لا يطابق الأحد المعتمد لنافذة الطلب.",
  SHIFT_CHANGE_DUPLICATE_TARGET_WEEK:
    "يوجد طلب معلق أو مقبول بالفعل لنفس المندوب وتاريخ التنفيذ.",
  SHIFT_CHANGE_FUTURE_ASSIGNMENT_CONFLICT:
    "يوجد تغيير شيفت مستقبلي لهذا المندوب. راجع الجدولة قبل الاعتماد.",
  SHIFT_CHANGE_CURRENT_ASSIGNMENT_CHANGED:
    "تم تغيير الشيفت الحالي للمندوب. حدث الصفحة وراجع الطلب مرة أخرى.",
  SHIFT_CHANGE_NO_ACTIVE_ASSIGNMENT:
    "لا يوجد ربط شيفت فعال لهذا المندوب. حدث الصفحة وراجع الطلب مرة أخرى.",
};

const shiftChangeApprovalFailedMessage =
  "تعذر اعتماد طلب تغيير الشيفت. حاول مرة أخرى.";
const shiftChangeRejectionFailedMessage =
  "تعذر رفض طلب تغيير الشيفت. حاول مرة أخرى.";

export async function approveShiftChangeRequestAction(
  requestId: string,
  reviewNote: string | null,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "غير مصرح بتنفيذ هذا الإجراء." };
  }

  const { data, error } = await admin.supabase.rpc(
    "approve_shift_change_request",
    {
      p_request_id: requestId,
      p_user_id: admin.user.id,
      p_review_note: reviewNote || undefined,
    },
  );

  if (error) {
    console.error("approveShiftChangeRequestAction RPC error:", error);
    return { success: false, error: shiftChangeApprovalFailedMessage };
  }

  const result = data as { success: boolean; error?: string };
  if (!result || !result.success) {
    return {
      success: false,
      error: mapShiftChangeApprovalError(result?.error),
    };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function rejectShiftChangeRequestAction(
  requestId: string,
  reviewNote: string | null,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "غير مصرح بتنفيذ هذا الإجراء." };
  }

  const { data: request } = await admin.supabase
    .from("driver_shift_change_requests")
    .select("organization_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { success: false, error: shiftChangeRejectionFailedMessage };
  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    request.organization_id,
  );
  if (
    admin.profile.role !== "system_owner" &&
    !permissions.has("app_requests.review") &&
    !permissions.has("app_requests.shift_change.review")
  ) {
    return { success: false, error: shiftChangeRejectionFailedMessage };
  }

  const { error } = await admin.supabase
    .from("driver_shift_change_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    console.error("rejectShiftChangeRequestAction error:", error);
    return { success: false, error: shiftChangeRejectionFailedMessage };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

function mapShiftChangeApprovalError(error: string | undefined) {
  if (error && error in approvalErrorMessages) {
    return approvalErrorMessages[error];
  }

  return shiftChangeApprovalFailedMessage;
}
