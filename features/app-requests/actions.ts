"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRequestActionState } from "@/features/app-requests/types";
import { isLocale } from "@/types/locale";

export async function reviewOdometerShiftAction(
  _previousState: AppRequestActionState,
  formData: FormData,
): Promise<AppRequestActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const shiftId = getString(formData, "shiftId");
  const phase = getString(formData, "phase");
  const action = getString(formData, "action");
  const reviewNote = normalizeOptional(getString(formData, "reviewNote"));

  if (!isLocale(locale) || !organizationCode || !organizationId || !shiftId) {
    return { status: "error", code: "unauthorized" };
  }

  if ((phase !== "start" && phase !== "end") || (action !== "approved" && action !== "rejected")) {
    return { status: "validation_error", code: "invalid_action" };
  }

  if (action === "rejected" && !reviewNote) {
    return { status: "validation_error", code: "rejection_note_required" };
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "error", code: "unauthorized" };
  }

  const canReview =
    admin.profile.role === "system_owner" ||
    (await hasPermission(admin.supabase, admin.profile.id, organizationId, "odometer.manage"));

  if (!canReview) {
    return { status: "error", code: "unauthorized" };
  }

  const { error } = await admin.supabase.rpc("review_driver_shift_odometer", {
    p_shift_id: shiftId,
    p_phase: phase,
    p_decision: action,
    p_review_note: reviewNote ?? undefined,
  });

  if (error) {
    const rejectionNoteRequired = error.message.includes("REJECTION_NOTE_REQUIRED");
    return {
      status: rejectionNoteRequired ? "validation_error" : "error",
      code: rejectionNoteRequired ? "rejection_note_required" : "action_failed",
    };
  }

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/app-requests/odometer`);

  return { status: "success", code: "success" };
}
export async function reviewDriverAppRequestAction(
  _previousState: AppRequestActionState,
  formData: FormData,
): Promise<AppRequestActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const requestId = getString(formData, "requestId");
  const decision = normalizeDecision(
    getString(formData, "decision") || getString(formData, "action"),
  );
  const reviewNote = normalizeOptional(getString(formData, "reviewNote"));
  const scheduledAt = normalizeOptional(getString(formData, "scheduledAt"));

  if (!isLocale(locale) || !organizationCode || !organizationId || !requestId) {
    return { status: "error", code: "unauthorized" };
  }

  if (!decision) {
    return { status: "validation_error", code: "invalid_action" };
  }

  if (decision === "reject" && !reviewNote) {
    return { status: "validation_error", code: "rejection_note_required" };
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "error", code: "unauthorized" };
  }

  const canReview =
    admin.profile.role === "system_owner" ||
    (await hasPermission(admin.supabase, admin.profile.id, organizationId, "app_requests.review"));

  if (!canReview) {
    logReviewDiagnostic({
      stage: "authorization",
      decision,
      requestId,
      organizationId,
      actingUserId: admin.profile.id,
      requestedStatus: decisionToStatus(decision),
      affectedRowCount: 0,
      error: { message: "review permission denied" },
    });
    return { status: "error", code: "review_permission_denied" };
  }

  let mutationClient;

  try {
    mutationClient = createAdminClient();
  } catch {
    return { status: "error", code: "request_update_failed" };
  }

  const { data: request, error: requestError } = await mutationClient
    .from("driver_app_requests")
    .select("id, organization_id, driver_id, request_type, status, reviewed_by, reviewed_at")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (requestError) {
    logReviewDiagnostic({
      stage: "load_request",
      decision,
      requestId,
      organizationId,
      actingUserId: admin.profile.id,
      requestedStatus: decisionToStatus(decision),
      affectedRowCount: 0,
      error: toDiagnosticError(requestError),
    });
    return { status: "error", code: mapReviewErrorCode(requestError) };
  }

  if (!request) {
    logReviewDiagnostic({
      stage: "load_request",
      decision,
      requestId,
      organizationId,
      actingUserId: admin.profile.id,
      requestedStatus: decisionToStatus(decision),
      affectedRowCount: 0,
      error: { message: "request not found" },
    });
    return { status: "error", code: "request_not_found" };
  }

  if (decision === "complete") {
    if (request.status !== "approved") {
      return { status: "validation_error", code: "invalid_action" };
    }

    const { data: updatedRequest, error } = await mutationClient
      .from("driver_app_requests")
      .update({
        status: "completed",
        completed_by: admin.profile.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("organization_id", organizationId)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();

    if (error || !updatedRequest) {
      logReviewDiagnostic({
        stage: "update_request",
        decision,
        requestId,
        organizationId,
        actingUserId: admin.profile.id,
        currentStatus: request.status,
        requestedStatus: "completed",
        affectedRowCount: updatedRequest ? 1 : 0,
        error: error ? toDiagnosticError(error) : { message: "concurrent request update" },
      });
      return {
        status: error ? "error" : "validation_error",
        code: error ? mapReviewErrorCode(error) : "concurrent_request_update",
      };
    }
  } else {
    if (request.status !== "pending" || request.reviewed_by || request.reviewed_at) {
      logReviewDiagnostic({
        stage: "validate_status",
        decision,
        requestId,
        organizationId,
        actingUserId: admin.profile.id,
        currentStatus: request.status,
        requestedStatus: decisionToStatus(decision),
        affectedRowCount: 0,
        error: { message: "request already reviewed or not pending" },
      });
      return { status: "validation_error", code: "already_reviewed" };
    }

    if (request.request_type === "meeting" && decision === "approve" && !scheduledAt) {
      return { status: "validation_error", code: "schedule_required" };
    }

    if (request.request_type === "meeting" && decision === "approve") {
      const { error: scheduleError } = await mutationClient
        .from("driver_app_meeting_request_details")
        .update({ scheduled_at: scheduledAt })
        .eq("request_id", requestId);

      if (scheduleError) return { status: "error", code: "action_failed" };
    }

    if (request.request_type === "oil_change" && decision === "approve" && scheduledAt) {
      const { error: scheduleError } = await mutationClient
        .from("driver_app_oil_change_request_details")
        .update({ scheduled_at: scheduledAt })
        .eq("request_id", requestId);

      if (scheduleError) return { status: "error", code: "action_failed" };
    }

    const reviewedAt = new Date().toISOString();
    const requestedStatus = decisionToStatus(decision);
    const { data: updatedRequest, error } = await mutationClient
      .from("driver_app_requests")
      .update({
        status: requestedStatus,
        reviewed_by: admin.profile.id,
        reviewed_at: reviewedAt,
        review_note: reviewNote,
        updated_at: reviewedAt,
      })
      .eq("id", requestId)
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .select("id, status, reviewed_by, reviewed_at, review_note")
      .maybeSingle();

    if (error || !updatedRequest) {
      logReviewDiagnostic({
        stage: "update_request",
        decision,
        requestId,
        organizationId,
        actingUserId: admin.profile.id,
        currentStatus: request.status,
        requestedStatus,
        affectedRowCount: updatedRequest ? 1 : 0,
        error: error ? toDiagnosticError(error) : { message: "concurrent request update" },
      });
      return {
        status: error ? "error" : "validation_error",
        code: error ? mapReviewErrorCode(error) : "concurrent_request_update",
      };
    }
  }

  await mutationClient.from("activity_logs").insert({
    actor_user_id: admin.profile.id,
    target_user_id: null,
    organization_id: organizationId,
    action:
      decision === "complete"
        ? "driver_app_request_completed"
        : `driver_app_request_${decisionToStatus(decision)}`,
    entity_type: "driver_app_request",
    entity_id: requestId,
    after_data: {
      driver_id: request.driver_id,
      request_type: request.request_type,
      status: decisionToStatus(decision),
    },
    metadata: { source: "dashboard" },
  });

  revalidatePath(
    `/${locale}/dashboard/organizations/${organizationCode}/app-requests`,
  );

  return { status: "success", code: `${decision}_success` };
}

async function hasPermission(
  supabase: Awaited<ReturnType<typeof getAuthenticatedAdmin>>["supabase"],
  userId: string,
  organizationId: string,
  permissionKey: "app_requests.review" | "odometer.manage",
) {
  const { data } = await supabase.rpc("has_organization_permission", {
    target_user_id: userId,
    target_organization_id: organizationId,
    target_permission_key: permissionKey,
  });

  return Boolean(data);
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function normalizeOptional(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type ReviewDecision = "approve" | "reject" | "complete";

function normalizeDecision(value: string): ReviewDecision | null {
  if (value === "approve" || value === "approved") return "approve";
  if (value === "reject" || value === "rejected") return "reject";
  if (value === "complete" || value === "completed") return "complete";
  return null;
}

function decisionToStatus(decision: ReviewDecision) {
  return decision === "approve"
    ? "approved"
    : decision === "reject"
      ? "rejected"
      : "completed";
}

function mapReviewErrorCode(error: { code?: string; message: string }) {
  if (error.code === "PGRST204" || error.code === "42703") {
    return "review_columns_missing";
  }

  return "request_update_failed";
}

function toDiagnosticError(error: {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

function logReviewDiagnostic({
  stage,
  decision,
  requestId,
  organizationId,
  actingUserId,
  currentStatus,
  requestedStatus,
  affectedRowCount,
  error,
}: {
  stage: "authorization" | "load_request" | "validate_status" | "update_request";
  decision: ReviewDecision;
  requestId: string;
  organizationId: string;
  actingUserId: string;
  currentStatus?: string;
  requestedStatus: string;
  affectedRowCount: number;
  error: {
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  };
}) {
  if (process.env.NODE_ENV === "production") return;

  console.error("[app-requests:review]", {
    stage,
    action: decision,
    requestIdSuffix: safeSuffix(requestId),
    organizationIdSuffix: safeSuffix(organizationId),
    actingUserIdSuffix: safeSuffix(actingUserId),
    currentRequestStatus: currentStatus,
    requestedNewStatus: requestedStatus,
    affectedRowCount,
    error,
  });
}

function safeSuffix(value: string | null | undefined) {
  return value ? value.slice(-8) : "";
}
