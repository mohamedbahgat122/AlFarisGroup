import "server-only";
import { createHash } from "node:crypto";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import { parseOrderReportFile } from "@/features/driver-order-reports/parser";
import type { DriverOrderReportEditableValues, DriverOrderReportImportResult, DriverOrderReportUpdateResult } from "@/features/driver-order-reports/types";

export async function importDriverOrderReportForOrganization({ organizationCode, file, replaceExisting }: { organizationCode: string; file: File; replaceExisting: boolean }): Promise<DriverOrderReportImportResult> {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return { success: false, code: "unauthorized" };
  const organizations = await getAccessibleOrganizationsForProfile(admin.supabase, admin.profile);
  const organization = organizations.status === "success" ? organizations.organizations.find((item) => item.code === organizationCode) : undefined;
  if (!organization || !organization.permissionKeys.includes(replaceExisting ? "driver_order_reports.replace" : "driver_order_reports.import")) return { success: false, code: "unauthorized" };
  const db = admin.supabase as any;
  const { data: drivers, error: driversError } = await db.from("drivers").select("id, full_name, keeta_driver_id").eq("organization_id", organization.id).eq("status", "active").is("deleted_at", null);
  if (driversError) {
    await logOrderReportImportFailure("load_active_drivers", file, { organizationCode, databaseError: driversError });
    return { success: false, code: "import_failed", details: databaseErrorDetails(driversError) };
  }
  const parsed = await parseOrderReportFile(file, drivers ?? []);
  if (!parsed.success) {
    await logOrderReportImportFailure("parse_workbook", file, {
      organizationCode,
      activeDriverCount: drivers?.length ?? 0,
      reportDate: parsed.reportDate ?? null,
      parserCode: parsed.code,
      parsedRowCount: parsed.diagnostics?.parsedRowCount ?? 0,
      invalidRowCount: parsed.diagnostics?.invalidRowCount ?? parsed.details?.length ?? 0,
      unmatchedDriverIds: parsed.diagnostics?.unmatchedDriverIds ?? [],
      firstIssue: parsed.details?.[0] ?? null,
    });
    return parsed;
  }
  const { data: existing, error: existingError } = await db.from("driver_order_daily_reports").select("id").eq("organization_id", organization.id).eq("report_date", parsed.data.reportDate).maybeSingle();
  if (existingError) {
    await logOrderReportImportFailure("inspect_existing_report", file, { organizationCode, parsedRowCount: parsed.data.rows.length, invalidRowCount: parsed.data.invalidRowCount, unmatchedDriverCount: parsed.data.unmatchedDriverIds.length, reportDate: parsed.data.reportDate, databaseError: existingError });
    return { success: false, code: "import_failed", details: databaseErrorDetails(existingError) };
  }
  if (existing && !replaceExisting) return { success: false, code: "duplicate_saved_report", reportDate: parsed.data.reportDate };
  const rows = parsed.data.rows.map((row) => ({
    driver_id: row.driverId,
    driver_full_name: row.driverFullName,
    keeta_driver_id: row.keetaDriverId,
    supervisor: row.supervisor,
    vehicle_type: row.vehicleType,
    courier_type: row.courierType,
    attendance_summary: row.attendanceSummary,
    on_shift: row.onShift,
    eligible_partner: row.eligiblePartner,
    driver_connection_duration: row.driverConnectionDuration,
    valid_online_duration: row.validOnlineDuration,
    peak_online_duration: row.peakOnlineDuration,
    accepted_tasks: row.acceptedTasks,
    restaurant_tasks: row.restaurantTasks,
    delivered_tasks: row.deliveredTasks,
    large_completed_tasks: row.largeCompletedTasks,
    rejected_tasks: row.rejectedTasks,
    driver_rejected_tasks: row.driverRejectedTasks,
    automatic_rejected_tasks: row.automaticRejectedTasks,
    delivery_cancellation_rate: row.deliveryCancellationRate,
    non_delivery_completion_rate: row.nonDeliveryCompletionRate,
    on_time_delivery_rate: row.onTimeDeliveryRate,
    large_order_on_time_rate: row.largeOrderOnTimeRate,
    average_delivery_duration: row.averageDeliveryDuration,
    over_55_minutes_rate: row.over55MinutesRate,
    late_tasks: row.lateTasks,
    very_late_tasks: row.veryLateTasks,
    source_data: row.sourceData,
  }));
  const { error } = await (createAdminClient() as any).rpc("import_driver_order_daily_report", { p_actor_user_id: admin.user.id, p_organization_id: organization.id, p_report_date: parsed.data.reportDate, p_rows: rows, p_unmatched_driver_ids: parsed.data.unmatchedDriverIds, p_invalid_row_count: parsed.data.invalidRowCount, p_replace_existing: replaceExisting });
  if (error) {
    await logOrderReportImportFailure("import_driver_order_daily_report", file, { organizationCode, parsedRowCount: parsed.data.rows.length, invalidRowCount: parsed.data.invalidRowCount, unmatchedDriverCount: parsed.data.unmatchedDriverIds.length, reportDate: parsed.data.reportDate, databaseError: error });
    return { success: false, code: "import_failed", reportDate: parsed.data.reportDate, details: databaseErrorDetails(error) };
  }
  return { success: true, reportDate: parsed.data.reportDate };
}

export async function updateDriverOrderReportRowForOrganization({
  organizationCode,
  reportId,
  rowId,
  expectedUpdatedAt,
  editNote,
  values,
}: {
  organizationCode: string;
  reportId: string;
  rowId: string;
  expectedUpdatedAt: string;
  editNote: string;
  values: DriverOrderReportEditableValues;
}): Promise<DriverOrderReportUpdateResult> {
  const normalizedEditNote = editNote.trim();
  if (normalizedEditNote.length < 3) return { success: false, code: "edit_note_required" };
  if (normalizedEditNote.length > 500) return { success: false, code: "edit_note_too_long" };
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return { success: false, code: "unauthorized" };
  const organizations = await getAccessibleOrganizationsForProfile(admin.supabase, admin.profile);
  const organization = organizations.status === "success" ? organizations.organizations.find((item) => item.code === organizationCode) : undefined;
  if (!organization || !organization.permissionKeys.includes("driver_order_reports.edit")) return { success: false, code: "unauthorized" };

  const { error } = await (createAdminClient() as any).rpc("update_driver_order_daily_report_row", {
    p_actor_user_id: admin.user.id,
    p_organization_id: organization.id,
    p_report_id: reportId,
    p_row_id: rowId,
    p_expected_updated_at: expectedUpdatedAt,
    p_edit_note: normalizedEditNote,
    p_valid_online_duration: values.validOnlineDuration,
    p_peak_online_duration: values.peakOnlineDuration,
    p_accepted_tasks: values.acceptedTasks,
    p_restaurant_tasks: values.restaurantTasks,
    p_delivered_tasks: values.deliveredTasks,
    p_large_completed_tasks: values.largeCompletedTasks,
    p_rejected_tasks: values.rejectedTasks,
    p_driver_rejected_tasks: values.driverRejectedTasks,
    p_automatic_rejected_tasks: values.automaticRejectedTasks,
    p_delivery_cancellation_rate: values.deliveryCancellationRate,
    p_non_delivery_completion_rate: values.nonDeliveryCompletionRate,
    p_on_time_delivery_rate: values.onTimeDeliveryRate,
    p_large_order_on_time_rate: values.largeOrderOnTimeRate,
    p_average_delivery_duration: values.averageDeliveryDuration,
    p_over_55_minutes_rate: values.over55MinutesRate,
    p_late_tasks: values.lateTasks,
    p_very_late_tasks: values.veryLateTasks,
  });

  if (!error) return { success: true };
  if (process.env.NODE_ENV !== "production") console.error("[drivers:order-reports:update_failed]", { code: error.code, message: error.message, details: error.details, hint: error.hint });
  if (error.code === "42501" || error.message?.includes("UNAUTHORIZED")) return { success: false, code: "unauthorized" };
  if (error.code === "P0002" || error.message?.includes("NOT_FOUND")) return { success: false, code: "row_not_found" };
  if (error.code === "40001" || error.message?.includes("STALE")) return { success: false, code: "stale_row" };
  if (error.message?.includes("EDIT_NOTE_REQUIRED")) return { success: false, code: "edit_note_required" };
  if (error.message?.includes("EDIT_NOTE_TOO_LONG")) return { success: false, code: "edit_note_too_long" };
  if (error.code === "22023" || error.code === "23503" || error.message?.includes("INVALID") || error.message?.includes("MISMATCH")) return { success: false, code: "invalid_input" };
  return { success: false, code: "update_failed" };
}

type DatabaseError = { code?: string; message?: string; details?: string; hint?: string };

function databaseErrorDetails(error: DatabaseError): string[] {
  return [error.code && `code: ${error.code}`, error.message && `message: ${error.message}`, error.details && `details: ${error.details}`, error.hint && `hint: ${error.hint}`].filter((value): value is string => Boolean(value));
}

async function logOrderReportImportFailure(stage: string, file: File, context: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const bytes = Buffer.from(await file.arrayBuffer());
  console.error("[drivers:order-reports:import_failed]", {
    stage,
    file: { name: file.name, type: file.type, size: file.size, sha256: createHash("sha256").update(bytes).digest("hex") },
    ...context,
  });
}
