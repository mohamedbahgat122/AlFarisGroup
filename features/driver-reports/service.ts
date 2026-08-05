import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import { parseKeetaReportFiles } from "@/features/driver-reports/parser";
import type {
  DriverReportImportResult,
  DriverReportImportRowPayload,
  DriverReportSummary,
} from "@/features/driver-reports/types";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Database, Json } from "@/types/database";

type ImportDriverDailyReportArgs =
  Database["public"]["Functions"]["import_driver_daily_report"]["Args"];

type OrganizationAccessResult =
  | {
      success: true;
      actorUserId: string;
      organization: AccessibleOrganization;
    }
  | {
      success: false;
      code: "unauthorized" | "organization_unavailable";
    };

type ActiveDriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "full_name" | "keeta_driver_id"
>;

export async function importKeetaReportsForOrganization({
  organizationCode,
  performanceFile,
  rankingFile,
  replaceExisting,
}: {
  organizationCode: string;
  performanceFile: File;
  rankingFile: File;
  replaceExisting: boolean;
}): Promise<DriverReportImportResult> {
  const access = await getOrganizationAccess(
    organizationCode,
    replaceExisting ? "driver_reports.replace" : "driver_reports.import",
  );

  if (!access.success) {
    return { success: false, code: access.code };
  }

  const admin = getAdminClientOrNull();
  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const { data: activeDrivers, error: driversError } = await admin
    .from("drivers")
    .select("id, full_name, keeta_driver_id")
    .eq("organization_id", access.organization.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (driversError) {
    logReportImportError("load_active_drivers", driversError);
    return { success: false, code: "import_failed" };
  }

  const parsed = await parseKeetaReportFiles({
    performanceFile,
    rankingFile,
    activeDrivers: (activeDrivers ?? []).map(mapActiveDriver),
  });

  if (!parsed.success) {
    return {
      success: false,
      code: parsed.code,
      field: parsed.field,
      details: parsed.details,
    };
  }

  const mergedRowsIdentity = validateMergedRowsIdentity({
    rows: parsed.data.rows,
    activeDriverIds: (activeDrivers ?? []).map((driver) => driver.id),
    registeredOrganizationDriverCount: activeDrivers?.length ?? 0,
  });

  if (!mergedRowsIdentity.success) {
    return { success: false, code: "import_failed" };
  }

  const { data: existingReport, error: existingReportError } = await admin
    .from("driver_daily_reports")
    .select("id")
    .eq("organization_id", access.organization.id)
    .eq("report_date", parsed.data.summary.reportDate)
    .maybeSingle();

  if (existingReportError) {
    logReportImportError("inspect_existing_report", existingReportError);
    return { success: false, code: "import_failed" };
  }

  const reportExists = Boolean(existingReport);

  if (reportExists && !replaceExisting) {
    return {
      success: false,
      code: "duplicate_saved_report",
      reportDate: parsed.data.summary.reportDate,
    };
  }

  const payload = {
    p_actor_user_id: access.actorUserId,
    p_organization_id: access.organization.id,
    p_report_date: parsed.data.summary.reportDate,
    p_summary: toJsonSummary(parsed.data.summary),
    p_rows: parsed.data.rows.map(toJsonRow),
    p_replace_existing: replaceExisting,
  } satisfies ImportDriverDailyReportArgs;

  const { error } = await admin.rpc("import_driver_daily_report", payload);

  if (error) {
    if (error.message.includes("duplicate saved report")) {
      return { success: false, code: "duplicate_saved_report" };
    }

    logReportImportError("import_driver_daily_report", error);
    return { success: false, code: "import_failed" };
  }

  return {
    success: true,
    reportDate: parsed.data.summary.reportDate,
  };
}

async function getOrganizationAccess(
  organizationCode: string,
  permissionKey: OrganizationPermissionKey,
): Promise<OrganizationAccessResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { success: false, code: "unauthorized" };
  }

  const organizations = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );

  if (organizations.status !== "success") {
    return { success: false, code: "organization_unavailable" };
  }

  const organization = organizations.organizations.find(
    (item) => item.code === organizationCode,
  );

  if (!organization) {
    return { success: false, code: "organization_unavailable" };
  }

  if (!organization.permissionKeys.includes(permissionKey)) {
    return { success: false, code: "unauthorized" };
  }

  return {
    success: true,
    actorUserId: admin.user.id,
    organization,
  };
}

function mapActiveDriver(driver: ActiveDriverRow) {
  return {
    id: driver.id,
    fullName: driver.full_name,
    keetaDriverId: driver.keeta_driver_id,
  };
}

function toJsonSummary(summary: DriverReportSummary): Json {
  return {
    registeredActiveDrivers: summary.registeredActiveDrivers,
    presentDrivers: summary.presentDrivers,
    absentDrivers: summary.absentDrivers,
    matchedRankingRows: summary.matchedRankingRows,
    unmatchedPerformanceIds: summary.unmatchedPerformanceIds,
    unmatchedRankingIds: summary.unmatchedRankingIds,
    driversMissingKeetaId: summary.driversMissingKeetaId,
  };
}

function toJsonRow(row: DriverReportImportRowPayload): Json {
  return {
    driver_id: row.driver_id,
    driver_full_name: row.driver_full_name,
    keeta_driver_id: row.keeta_driver_id,
    attendance_status: row.attendance_status,
    accepted_tasks: row.accepted_tasks,
    delivered_tasks: row.delivered_tasks,
    rejected_tasks: row.rejected_tasks,
    valid_online_seconds: row.valid_online_seconds,
    delivery_rate: row.delivery_rate,
    level: row.level,
    city_ranking: row.city_ranking,
    ranking_percentage: row.ranking_percentage,
    mandatory_assignment_score: row.mandatory_assignment_score,
    estimated_reward_amount: row.estimated_reward_amount,
    evaluation_on_time_rate: row.evaluation_on_time_rate,
    evaluation_completion_rate: row.evaluation_completion_rate,
    not_early_delivery_confirmation_rate:
      row.not_early_delivery_confirmation_rate,
    evaluation_total_orders: row.evaluation_total_orders,
    on_time_rate: row.on_time_rate,
    incomplete_orders: row.incomplete_orders,
    eligibility_status: row.eligibility_status,
  };
}

function validateMergedRowsIdentity({
  rows,
  activeDriverIds,
  registeredOrganizationDriverCount,
}: {
  rows: DriverReportImportRowPayload[];
  activeDriverIds: string[];
  registeredOrganizationDriverCount: number;
}) {
  const registeredDriverIds = new Set(activeDriverIds);
  const seenDriverIds = new Set<string>();
  let rowsMissingDriverId = 0;
  let duplicateDriverIds = 0;
  let rowsOutsideOrganization = 0;

  for (const row of rows) {
    if (!isUuid(row.driver_id)) {
      rowsMissingDriverId += 1;
      continue;
    }

    if (!registeredDriverIds.has(row.driver_id)) {
      rowsOutsideOrganization += 1;
    }

    if (seenDriverIds.has(row.driver_id)) {
      duplicateDriverIds += 1;
    } else {
      seenDriverIds.add(row.driver_id);
    }
  }

  return {
    success:
      rowsMissingDriverId === 0 &&
      duplicateDriverIds === 0 &&
      rowsOutsideOrganization === 0 &&
      rows.length === registeredOrganizationDriverCount,
  };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function getAdminClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function logReportImportError(
  stage:
    | "load_active_drivers"
    | "validate_merged_rows"
    | "inspect_existing_report"
    | "import_driver_daily_report",
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[drivers:reports:import_failed]", {
    stage,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}
