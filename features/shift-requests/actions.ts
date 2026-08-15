"use server";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { revalidatePath } from "next/cache";

export async function approveShiftChangeRequestAction(
  requestId: string,
  reviewNote: string | null
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "Unauthorized" };
  }

  const { data, error } = await admin.supabase.rpc("approve_shift_change_request", {
    p_request_id: requestId,
    p_user_id: admin.user.id,
    p_review_note: reviewNote || undefined,
  });

  if (error) {
    console.error("approveShiftChangeRequestAction RPC error:", error);
    return { success: false, error: error.message };
  }

  const result = data as { success: boolean; error?: string };
  if (!result || !result.success) {
    return { success: false, error: result?.error || "Failed to process request" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function rejectShiftChangeRequestAction(
  requestId: string,
  reviewNote: string | null
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, error: "Unauthorized" };
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
    return { success: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
