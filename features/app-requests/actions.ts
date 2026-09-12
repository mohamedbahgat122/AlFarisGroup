"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRequestActionState } from "@/features/app-requests/types";
import type { Database, Json } from "@/types/database";
import { isLocale } from "@/types/locale";

type AppRequestsActionDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      approve_and_assign_maintenance_request: {
        Args: {
          p_request_id: string;
          p_provider_id: string;
          p_notes: string | null;
        };
        Returns: Json;
      };
      complete_driver_oil_change_request: {
        Args: {
          p_request_id: string;
          p_interval_km: number;
          p_review_note?: string | null;
        };
        Returns: Json;
      };
      has_current_user_organization_permission: {
        Args: {
          target_organization_id: string;
          target_permission_key: string;
        };
        Returns: boolean;
      };
    };
  };
};

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
  const odometerReadingRaw = getString(formData, "odometerReading");
  const odometerReading = odometerReadingRaw ? parseInt(odometerReadingRaw, 10) : undefined;

  if (!isLocale(locale) || !organizationCode || !organizationId || !shiftId) {
    return { status: "error", code: "unauthorized" };
  }

  if ((phase !== "start" && phase !== "end") || (action !== "approved" && action !== "rejected")) {
    return { status: "validation_error", code: "invalid_action" };
  }

  if (action === "rejected" && !reviewNote) {
    return { status: "validation_error", code: "rejection_note_required" };
  }

  if (action === "approved" && (typeof odometerReading !== "number" || isNaN(odometerReading) || odometerReading < 0)) {
    return { status: "validation_error", code: "action_failed" };
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
    p_odometer_reading: odometerReading,
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
  const providerId = normalizeOptional(getString(formData, "providerId"));
  const scheduledAt = normalizeOptional(getString(formData, "scheduledAt"));
  const oilIntervalKm = parsePositiveInteger(getString(formData, "oilIntervalKm"));

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

    if (request.request_type === "oil_change") {
      if (oilIntervalKm === null) {
        return { status: "validation_error", code: "invalid_oil_interval" };
      }

      const oilMutationClient =
        admin.supabase as SupabaseClient<AppRequestsActionDatabase>;
      const { error } = await oilMutationClient.rpc(
        "complete_driver_oil_change_request",
        {
          p_request_id: requestId,
          p_interval_km: oilIntervalKm,
          p_review_note: reviewNote,
        },
      );

      if (error) {
        logReviewDiagnostic({
          stage: "update_request",
          decision,
          requestId,
          organizationId,
          actingUserId: admin.profile.id,
          currentStatus: request.status,
          requestedStatus: "completed",
          affectedRowCount: 0,
          error: toDiagnosticError(error),
        });
        return { status: "error", code: mapOilCompletionErrorCode(error) };
      }

      revalidatePath(
        `/${locale}/dashboard/organizations/${organizationCode}/app-requests`,
      );
      revalidatePath(
        `/${locale}/dashboard/organizations/${organizationCode}/app-requests/oil-change`,
      );

      return { status: "success", code: "complete_success" };
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

    const requiresProviderAssignment =
      decision === "approve" &&
      (request.request_type === "maintenance" ||
        request.request_type === "oil_change");

    if (request.request_type === "oil_change" && decision === "approve" && scheduledAt) {
      const { error: scheduleError } = await mutationClient
        .from("driver_app_oil_change_request_details")
        .update({ scheduled_at: scheduledAt })
        .eq("request_id", requestId);

      if (scheduleError) return { status: "error", code: "action_failed" };
    }

    if (requiresProviderAssignment) {
      if (!providerId) {
        return { status: "validation_error", code: "provider_required" };
      }

      const selectedProviderId = providerId;

      const assignmentClient =
        admin.supabase as SupabaseClient<AppRequestsActionDatabase>;
      const { error } = await assignmentClient.rpc(
        "approve_and_assign_maintenance_request",
        {
          p_request_id: requestId,
          p_provider_id: selectedProviderId,
          p_notes: reviewNote,
        },
      );

      if (error) {
        logReviewDiagnostic({
          stage: "update_request",
          decision,
          requestId,
          organizationId,
          actingUserId: admin.profile.id,
          currentStatus: request.status,
          requestedStatus: "approved",
          affectedRowCount: 0,
          error: toDiagnosticError(error),
        });
        return { status: "error", code: mapMaintenanceAssignmentErrorCode(error) };
      }

      revalidatePath(
        `/${locale}/dashboard/organizations/${organizationCode}/app-requests`,
      );
      revalidatePath(
        `/${locale}/dashboard/organizations/${organizationCode}/app-requests/${request.request_type === "oil_change" ? "oil-change" : "maintenance"}`,
      );

      return { status: "success", code: "approve_success" };
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
  _userId: string,
  organizationId: string,
  permissionKey: "app_requests.review" | "odometer.manage" | "maintenance_jobs.assign",
) {
  const permissionClient =
    supabase as SupabaseClient<AppRequestsActionDatabase>;
  const { data } = await permissionClient.rpc(
    "has_current_user_organization_permission",
    {
    target_organization_id: organizationId,
    target_permission_key: permissionKey,
    },
  );

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

function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function mapOilCompletionErrorCode(error: { code?: string; message: string }) {
  if (error.message.includes("APP_REQUEST_INVALID_OIL_INTERVAL")) {
    return "invalid_oil_interval";
  }
  if (error.message.includes("APP_REQUEST_INVALID_STATUS")) {
    return "invalid_action";
  }
  if (error.message.includes("APP_REQUEST_REVIEW_FORBIDDEN")) {
    return "review_permission_denied";
  }
  if (error.message.includes("APP_REQUEST_NOT_FOUND")) {
    return "request_not_found";
  }

  return mapReviewErrorCode(error);
}

function mapMaintenanceAssignmentErrorCode(error: { code?: string; message: string }) {
  if (error.message.includes("MAINTENANCE_ASSIGN_FORBIDDEN")) {
    return "maintenance_assignment_permission_denied";
  }
  if (error.message.includes("MAINTENANCE_PROVIDER_NOT_AVAILABLE")) {
    return "maintenance_provider_unavailable";
  }
  if (error.message.includes("MAINTENANCE_REQUEST_NOT_FOUND")) {
    return "request_not_found";
  }
  if (error.message.includes("MAINTENANCE_REQUEST_INVALID_STATUS")) {
    return "invalid_request_status";
  }
  if (error.message.includes("MAINTENANCE_REQUEST_VEHICLE_REQUIRED")) {
    return "maintenance_request_vehicle_required";
  }
  if (error.message.includes("MAINTENANCE_JOB_ALREADY_EXISTS")) {
    return "maintenance_job_already_exists";
  }

  return mapReviewErrorCode(error);
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
export async function updateOdometerShiftReadingAction(
  _previousState: AppRequestActionState,
  formData: FormData,
): Promise<AppRequestActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const shiftId = getString(formData, "shiftId");
  const phase = getString(formData, "phase");
  const readingStr = getString(formData, "odometerReading");
  const reading = readingStr ? parseInt(readingStr, 10) : undefined;
  const reason = normalizeOptional(getString(formData, "reason"));

  if (!isLocale(locale) || !organizationCode || !organizationId || !shiftId) {
    return { status: "error", code: "unauthorized" };
  }

  if (phase !== "start" && phase !== "end") {
    return { status: "validation_error", code: "invalid_phase" };
  }

  if (typeof reading !== "number" || isNaN(reading) || reading < 0) {
    return { status: "validation_error", code: "invalid_reading" };
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "error", code: "unauthorized" };
  }

  const canManage =
    admin.profile.role === "system_owner" ||
    (await hasPermission(admin.supabase, admin.profile.id, organizationId, "odometer.manage"));

  if (!canManage) {
    return { status: "error", code: "unauthorized" };
  }

  // @ts-ignore: Temporary bypass until types are regenerated
  const { error } = await admin.supabase.rpc("admin_update_shift_odometer_reading", {
    p_shift_id: shiftId,
    p_phase: phase,
    p_odometer_reading: reading,
    p_reason: reason ?? undefined,
  });

  if (error) {
    return { status: "error", code: error.message };
  }

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/app-requests/odometer`);
  return { status: "success" };
}

export async function resetVehicleOdometerBaselineAction(
  _previousState: AppRequestActionState,
  formData: FormData,
): Promise<AppRequestActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const vehicleId = getString(formData, "vehicleId");
  const baselineStr = getString(formData, "baselineReading");
  const baseline = baselineStr ? parseInt(baselineStr, 10) : undefined;
  const reason = getString(formData, "reason");
  const note = normalizeOptional(getString(formData, "note"));
  const resetAtStr = getString(formData, "resetAt");
  const resetAt = resetAtStr ? new Date(resetAtStr).toISOString() : new Date().toISOString();

  if (!isLocale(locale) || !organizationCode || !organizationId || !vehicleId || !reason) {
    return { status: "error", code: "unauthorized" };
  }

  if (typeof baseline !== "number" || isNaN(baseline) || baseline < 0) {
    return { status: "validation_error", code: "invalid_reading" };
  }

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { status: "error", code: "unauthorized" };
  }

  const canManage =
    admin.profile.role === "system_owner" ||
    (await hasPermission(admin.supabase, admin.profile.id, organizationId, "odometer.manage"));

  if (!canManage) {
    return { status: "error", code: "unauthorized" };
  }

  // @ts-ignore: Temporary bypass until types are regenerated
  const { error } = await admin.supabase.rpc("admin_set_vehicle_odometer_baseline", {
    p_vehicle_id: vehicleId,
    p_baseline_reading: baseline,
    p_reset_at: resetAt,
    p_reason: reason,
    p_note: note ?? undefined,
  });

  if (error) {
    return { status: "error", code: error.message };
  }

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/app-requests/odometer`);
  return { status: "success" };
}
