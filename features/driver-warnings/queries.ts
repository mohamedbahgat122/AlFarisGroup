import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  DriverWarningCategory,
  DriverWarningDriverOption,
  DriverWarningRow,
  DriverWarningsQueryResult,
  DriverWarningSeverity,
  DriverWarningStatus,
} from "@/features/driver-warnings/types";
import type { Database } from "@/types/database";

type DriverWarningTableRow = Database["public"]["Tables"]["driver_warnings"]["Row"];

type DriverWarningQueryRow = DriverWarningTableRow & {
  drivers:
    | {
        id: string;
        full_name: string;
        keeta_driver_id: string | null;
        mobile_number: string;
      }
    | null;
  issuer: { full_name: string } | null;
  revoker: { full_name: string } | null;
};

type DriverOptionRow = {
  id: string;
  full_name: string;
  keeta_driver_id: string | null;
  mobile_number: string;
};

export type DriverWarningsFilters = {
  status?: string;
  severity?: string;
  driverId?: string;
};

export async function getDriverWarningsForOrganization({
  organizationId,
  filters,
}: {
  organizationId: string;
  filters: DriverWarningsFilters;
}): Promise<DriverWarningsQueryResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return {
      status: "unauthorized",
      warnings: [],
      drivers: [],
    };
  }

  let warningsQuery = admin.supabase
    .from("driver_warnings")
    .select(
      `
      id,
      organization_id,
      driver_id,
      category,
      severity,
      title,
      description,
      incident_at,
      status,
      issued_by_user_id,
      issued_at,
      driver_seen_at,
      revoked_by_user_id,
      revoked_at,
      revoke_reason,
      created_at,
      drivers!driver_warnings_driver_id_fkey (
        id,
        full_name,
        keeta_driver_id,
        mobile_number
      ),
      issuer:profiles!driver_warnings_issued_by_user_id_fkey (
        full_name
      ),
      revoker:profiles!driver_warnings_revoked_by_user_id_fkey (
        full_name
      )
    `,
    )
    .eq("organization_id", organizationId)
    .order("issued_at", { ascending: false });

  if (isWarningStatus(filters.status)) {
    warningsQuery = warningsQuery.eq("status", filters.status);
  }

  if (isWarningSeverity(filters.severity)) {
    warningsQuery = warningsQuery.eq("severity", filters.severity);
  }

  if (filters.driverId) {
    warningsQuery = warningsQuery.eq("driver_id", filters.driverId);
  }

  const [warningsResult, driversResult] = await Promise.all([
    warningsQuery,
    admin.supabase
      .from("drivers")
      .select("id, full_name, keeta_driver_id, mobile_number")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .is("deleted_at", null)
      .not("auth_user_id", "is", null)
      .order("full_name", { ascending: true }),
  ]);

  if (warningsResult.error || driversResult.error) {
    return {
      status: "load_error",
      warnings: [],
      drivers: [],
    };
  }

  return {
    status: "success",
    warnings: ((warningsResult.data ?? []) as unknown as DriverWarningQueryRow[]).map(
      mapWarning,
    ),
    drivers: ((driversResult.data ?? []) as DriverOptionRow[]).map(mapDriverOption),
  };
}

function mapWarning(row: DriverWarningQueryRow): DriverWarningRow {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.drivers?.full_name ?? "Driver",
    driverIdentifier: row.drivers?.keeta_driver_id ?? null,
    driverMobileNumber: row.drivers?.mobile_number ?? "",
    category: row.category as DriverWarningCategory,
    severity: row.severity as DriverWarningSeverity,
    title: row.title,
    description: row.description,
    incidentAt: row.incident_at,
    status: row.status as DriverWarningStatus,
    issuedAt: row.issued_at,
    issuedByName: row.issuer?.full_name ?? null,
    driverSeenAt: row.driver_seen_at,
    revokedAt: row.revoked_at,
    revokedByName: row.revoker?.full_name ?? null,
    revokeReason: row.revoke_reason,
    createdAt: row.created_at,
  };
}

function mapDriverOption(row: DriverOptionRow): DriverWarningDriverOption {
  return {
    id: row.id,
    fullName: row.full_name,
    identifier: row.keeta_driver_id ?? null,
    mobileNumber: row.mobile_number,
  };
}

function isWarningStatus(value: string | undefined): value is DriverWarningStatus {
  return value === "active" || value === "revoked";
}

function isWarningSeverity(value: string | undefined): value is DriverWarningSeverity {
  return value === "low" || value === "medium" || value === "high";
}
