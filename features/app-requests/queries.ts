import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  AppRequestRow,
  DriverAppRequestStatus,
  DriverAppRequestType,
  OdometerShiftRow,
} from "@/features/app-requests/types";

type RequestRecord = {
  id: string;
  organization_id: string;
  driver_id: string;
  vehicle_id: string | null;
  vehicle_plate_snapshot: string | null;
  request_type: DriverAppRequestType;
  status: DriverAppRequestStatus;
  submitted_note: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  completed_at: string | null;
};

type DriverRecord = {
  id: string;
  full_name: string;
  keeta_driver_id: string | null;
  vehicle_type: string | null;
  keeta_vehicle_plate_number: string | null;
  vehicle_number: string | null;
  profile_photo_path: string | null;
};

type VehicleRecord = {
  id: string;
  vehicle_type: string;
  plate_number: string;
};

type ProfileRecord = {
  id: string;
  full_name: string | null;
  job_title?: string | null;
  status?: string | null;
};

type OrganizationRecord = {
  id: string;
  name: string;
};

export type RequestFilters = {
  from?: string;
  to?: string;
  driver?: string;
  driverId?: string;
  status?: string;
  leaveType?: string;
  requestId?: string;
  page?: number;
};

export type OdometerFilters = {
  date?: string;
  driver?: string;
  driverId?: string;
  plate?: string;
  status?: string;
  reviewStatus?: string;
  phase?: string;
  page?: number;
};

const pageSize = 25;
const riyadhUtcOffsetHours = 3;
const ibrahimDriverIdentifier = "1784563088060809";

type OdometerPhotoSignResult = {
  urls: Map<string, string>;
  failedPaths: Set<string>;
};

export async function getAppRequestPage({
  organizationId,
  requestType,
  filters,
}: {
  organizationId: string;
  requestType: DriverAppRequestType;
  filters: RequestFilters;
}): Promise<
  | {
      status: "success";
      rows: AppRequestRow[];
      page: number;
      totalPages: number;
      totalRows: number;
    }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const page = normalizePage(filters.page);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = admin.supabase
    .from("driver_app_requests")
    .select(
      "id, organization_id, driver_id, vehicle_id, vehicle_plate_snapshot, request_type, status, submitted_note, submitted_at, reviewed_by, reviewed_at, review_note, completed_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("request_type", requestType)
    .order("submitted_at", { ascending: false })
    .range(from, to);

  if (isDate(filters.from)) query = query.gte("submitted_at", filters.from);
  if (isDate(filters.to)) query = query.lte("submitted_at", `${filters.to}T23:59:59`);
  if (isRequestStatus(filters.status)) query = query.eq("status", filters.status);

  const { data, error, count } = await query;

  if (error) {
    await logAppRequestLoadDiagnostic(admin.supabase, {
      stage: "request_query",
      userId: admin.profile.id,
      organizationId,
      requestType,
      table: "driver_app_requests",
      returnedCount: 0,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    });
    return { status: "load_error", rows: [] };
  }

  const requests = (data ?? []) as RequestRecord[];
  const [drivers, vehicles, reviewers, organizations, detailResult] = await Promise.all([
    loadDrivers(admin.supabase, requests.map((request) => request.driver_id)),
    loadVehicles(
      admin.supabase,
      requests
        .map((request) => request.vehicle_id)
        .filter((value): value is string => Boolean(value)),
    ),
    loadProfiles(
      admin.supabase,
      requests
        .map((request) => request.reviewed_by)
        .filter((value): value is string => Boolean(value)),
    ),
    loadOrganizations(admin.supabase, requests.map((request) => request.organization_id)),
    loadDetails(admin.supabase, requestType, requests.map((request) => request.id)),
  ]);

  if (detailResult.error) {
    await logAppRequestLoadDiagnostic(admin.supabase, {
      stage: "detail_query",
      userId: admin.profile.id,
      organizationId,
      requestType,
      table: detailResult.table,
      returnedCount: requests.length,
      error: detailResult.error,
    });
    return { status: "load_error", rows: [] };
  }

  const driverPhotoUrls = await signDriverPhotos(
    admin.supabase,
    Array.from(drivers.values()).map((driver) => driver.profile_photo_path),
  );
  const requestedManagerIds =
    requestType === "meeting"
      ? Array.from(
          new Set(
            Array.from(detailResult.details.values())
              .map((detail) => detail.requested_manager_user_id)
              .filter((value): value is string => typeof value === "string"),
          ),
        )
      : [];
  const requestedManagers = await loadProfiles(
    admin.supabase,
    requestedManagerIds,
  );

  return {
    status: "success",
    page,
    totalRows: count ?? requests.length,
    totalPages: Math.max(1, Math.ceil((count ?? requests.length) / pageSize)),
    rows: requests
      .map((request) => {
        const driver = drivers.get(request.driver_id);
        const detail = detailResult.details.get(request.id) ?? {};
        const requestedManager =
          typeof detail.requested_manager_user_id === "string"
            ? requestedManagers.get(detail.requested_manager_user_id)
            : null;

        return {
          id: request.id,
          requestType: request.request_type,
          status: request.status,
          submittedAt: request.submitted_at,
          submittedNote: request.submitted_note,
          driverName: driver?.full_name ?? "",
          driverIdentifier: driver?.keeta_driver_id ?? null,
          driverPhotoUrl: driver?.profile_photo_path
            ? driverPhotoUrls.get(driver.profile_photo_path) ?? null
            : null,
          organizationName: organizations.get(request.organization_id)?.name ?? null,
          vehicleLabel:
            vehicles.get(request.vehicle_id ?? "")?.vehicle_type ??
            driver?.vehicle_type ??
            null,
          vehiclePlate:
            request.vehicle_plate_snapshot ??
            vehicles.get(request.vehicle_id ?? "")?.plate_number ??
            null,
          reviewerName: reviewers.get(request.reviewed_by ?? "")?.full_name ?? null,
          requestedManagerName: requestedManager?.full_name ?? null,
          requestedManagerJobTitle: requestedManager?.job_title ?? null,
          requestedManagerStatus: requestedManager?.status ?? null,
          reviewNote: request.review_note,
          reviewedAt: request.reviewed_at,
          completedAt: request.completed_at,
          detail,
        };
      })
      .filter((row) => matchesTextFilters(row, filters))
      .sort(compareAppRequestRows),
  };
}

export async function getOdometerPage({
  organizationId,
  filters,
}: {
  organizationId: string;
  filters: OdometerFilters;
}): Promise<
  | {
      status: "success";
      rows: OdometerShiftRow[];
      page: number;
      totalPages: number;
      totalRows: number;
    }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const page = normalizePage(filters.page);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const dateRange = isDate(filters.date)
    ? getRiyadhDayUtcRange(filters.date)
    : null;
  let query = admin.supabase
    .from("driver_shifts")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .range(from, to);

  if (dateRange) {
    query = query
      .gte("started_at", dateRange.startIso)
      .lte("started_at", dateRange.endIso);
  }

  if (filters.status === "open" || filters.status === "completed") {
    query = query.eq("status", filters.status);
  }

  const { data, error, count } = await query;

  if (error) {
    logOdometerLoadDiagnostic({
      organizationId,
      selectedDate: filters.date,
      dateRange,
      returnedShiftCount: 0,
      ibrahimShiftCount: 0,
      shiftIdSuffixes: [],
      error: { code: error.code, message: error.message },
    });
    return { status: "load_error", rows: [] };
  }

  const shifts = (data ?? []) as Array<{
    id: string;
    driver_id: string;
    vehicle_id: string | null;
    vehicle_plate_snapshot: string;
    status: "open" | "completed" | "cancelled";
    started_at: string;
    start_odometer_reading: number;
    start_photo_path: string;
    start_photo_captured_at: string;
    ended_at: string | null;
    end_odometer_reading: number | null;
    end_photo_path: string | null;
    end_photo_captured_at: string | null;
    start_review_status: "pending_review" | "approved" | "rejected" | null;
    start_reviewed_by: string | null;
    start_reviewed_at: string | null;
    start_review_note: string | null;
    end_review_status: "pending_review" | "approved" | "rejected" | null;
    end_reviewed_by: string | null;
    end_reviewed_at: string | null;
    end_review_note: string | null;
  }>;
  const [drivers, vehicles, reviewers, signedPhotos] = await Promise.all([
    loadDrivers(admin.supabase, shifts.map((shift) => shift.driver_id)),
    loadVehicles(
      admin.supabase,
      shifts
        .map((shift) => shift.vehicle_id)
        .filter((value): value is string => Boolean(value)),
    ),
    loadProfiles(
      admin.supabase,
      shifts
        .flatMap((shift) => [shift.start_reviewed_by, shift.end_reviewed_by])
        .filter((value): value is string => Boolean(value)),
    ),
    signOdometerPhotos(admin.supabase, shifts),
  ]);

  const driverPhotoUrls = await signDriverPhotos(
    admin.supabase,
    Array.from(drivers.values()).map((driver) => driver.profile_photo_path),
  );

  const shiftedRows = shifts.map((shift) => {
    const driver = drivers.get(shift.driver_id);
    const vehicle = vehicles.get(shift.vehicle_id ?? "");
    const endReading = shift.end_odometer_reading;

    return {
      id: shift.id,
      driverName: driver?.full_name ?? "",
      driverIdentifier: driver?.keeta_driver_id ?? null,
      organizationName: null,
      driverPhotoUrl: driver?.profile_photo_path ? driverPhotoUrls.get(driver.profile_photo_path) ?? null : null,
      vehicleLabel: vehicle?.vehicle_type ?? driver?.vehicle_type ?? null,
      vehiclePlate: shift.vehicle_plate_snapshot,
      status: shift.status,
      shiftDate: shift.started_at,
      startedAt: shift.started_at,
      startReading: shift.start_odometer_reading,
      startPhotoUrl: signedPhotos.urls.get(shift.start_photo_path) ?? null,
      startPhotoPathPresent: Boolean(shift.start_photo_path),
      startPhotoCapturedAt: shift.start_photo_captured_at,
      startReviewStatus: shift.start_review_status ?? "pending_review",
      startReviewerName: reviewers.get(shift.start_reviewed_by ?? "")?.full_name ?? null,
      startReviewedAt: shift.start_reviewed_at,
      startReviewNote: shift.start_review_note,
      endedAt: shift.ended_at,
      endReading,
      endPhotoUrl: shift.end_photo_path
        ? signedPhotos.urls.get(shift.end_photo_path) ?? null
        : null,
      endPhotoPathPresent: Boolean(shift.end_photo_path),
      endPhotoCapturedAt: shift.end_photo_captured_at,
      endReviewStatus: shift.end_review_status,
      endReviewerName: reviewers.get(shift.end_reviewed_by ?? "")?.full_name ?? null,
      endReviewedAt: shift.end_reviewed_at,
      endReviewNote: shift.end_review_note,
      distance:
        typeof endReading === "number"
          ? endReading - shift.start_odometer_reading
          : null,
    } satisfies OdometerShiftRow;
  });

  logOdometerLoadDiagnostic({
    organizationId,
    selectedDate: filters.date,
    dateRange,
    returnedShiftCount: shifts.length,
    ibrahimShiftCount: shiftedRows.filter(
      (row) => row.driverIdentifier === ibrahimDriverIdentifier,
    ).length,
    shiftIdSuffixes: shifts.map((shift) => safeSuffix(shift.id)),
    signedPhotoFailureCount: signedPhotos.failedPaths.size,
    error: null,
  });

  return {
    status: "success",
    page,
    totalRows: count ?? shifts.length,
    totalPages: Math.max(1, Math.ceil((count ?? shifts.length) / pageSize)),
    rows: shiftedRows
      .filter((row) => matchesOdometerFilters(row, filters))
      .sort(compareOdometerRows),
  };
}

async function loadDrivers(
  supabase: ReturnType<typeof getAuthenticatedAdmin> extends Promise<infer R>
    ? R extends { supabase: infer S }
      ? S
      : never
    : never,
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids));
  const drivers = new Map<string, DriverRecord>();

  if (uniqueIds.length === 0) return drivers;

  const { data } = await supabase
    .from("drivers")
    .select("id, full_name, keeta_driver_id, vehicle_type, keeta_vehicle_plate_number, vehicle_number, profile_photo_path")
    .in("id", uniqueIds);

  for (const driver of (data ?? []) as DriverRecord[]) {
    drivers.set(driver.id, driver);
  }

  return drivers;
}

async function loadVehicles(
  supabase: Parameters<typeof loadDrivers>[0],
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids));
  const vehicles = new Map<string, VehicleRecord>();

  if (uniqueIds.length === 0) return vehicles;

  const { data } = await supabase
    .from("fleet_vehicles")
    .select("id, vehicle_type, plate_number")
    .in("id", uniqueIds);

  for (const vehicle of (data ?? []) as VehicleRecord[]) {
    vehicles.set(vehicle.id, vehicle);
  }

  return vehicles;
}

async function loadProfiles(
  supabase: Parameters<typeof loadDrivers>[0],
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids));
  const profiles = new Map<string, ProfileRecord>();

  if (uniqueIds.length === 0) return profiles;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, job_title, status")
    .in("id", uniqueIds);

  for (const profile of (data ?? []) as ProfileRecord[]) {
    profiles.set(profile.id, profile);
  }

  return profiles;
}

async function loadOrganizations(
  supabase: Parameters<typeof loadDrivers>[0],
  ids: string[],
) {
  const uniqueIds = Array.from(new Set(ids));
  const organizations = new Map<string, OrganizationRecord>();

  if (uniqueIds.length === 0) return organizations;

  const { data } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", uniqueIds);

  for (const organization of (data ?? []) as OrganizationRecord[]) {
    organizations.set(organization.id, organization);
  }

  return organizations;
}

async function loadDetails(
  supabase: Parameters<typeof loadDrivers>[0],
  requestType: DriverAppRequestType,
  ids: string[],
) {
  const details = new Map<string, Record<string, string | number | null>>();

  if (ids.length === 0) {
    return { details, table: "", error: null };
  }

  const table =
    requestType === "leave"
      ? "driver_app_leave_request_details"
      : requestType === "maintenance"
        ? "driver_app_maintenance_request_details"
        : requestType === "meeting"
          ? "driver_app_meeting_request_details"
          : "driver_app_oil_change_request_details";

  const { data, error } = await supabase.from(table).select("*").in("request_id", ids);

  if (error) {
    return {
      details,
      table,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    };
  }

  for (const detail of (data ?? []) as Array<Record<string, string | number | null>>) {
    const requestId = detail.request_id;
    if (typeof requestId === "string") {
      details.set(requestId, detail);
    }
  }

  return { details, table, error: null };
}

async function signOdometerPhotos(
  supabase: Parameters<typeof loadDrivers>[0],
  shifts: Array<{ start_photo_path: string; end_photo_path: string | null }>,
): Promise<OdometerPhotoSignResult> {
  const urls = new Map<string, string>();
  const failedPaths = new Set<string>();
  const paths = Array.from(
    new Set(
      shifts.flatMap((shift) =>
        [shift.start_photo_path, shift.end_photo_path].filter(
          (path): path is string => Boolean(path),
        ),
      ),
    ),
  );

  await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from("driver-odometer")
        .createSignedUrl(path, 300);

      if (data?.signedUrl) urls.set(path, data.signedUrl);
      if (error || !data?.signedUrl) failedPaths.add(path);
    }),
  );

  return { urls, failedPaths };
}

async function signDriverPhotos(
  supabase: Parameters<typeof loadDrivers>[0],
  paths: Array<string | null>,
) {
  const urls = new Map<string, string>();
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))));

  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data } = await supabase.storage
        .from("driver-documents")
        .createSignedUrl(path, 300);

      if (data?.signedUrl) urls.set(path, data.signedUrl);
    }),
  );

  return urls;
}
function matchesTextFilters(row: AppRequestRow, filters: RequestFilters) {
  const driver = filters.driver?.trim().toLowerCase();
  const driverId = filters.driverId?.trim().toLowerCase();

  return (
    (!driver || row.driverName.toLowerCase().includes(driver)) &&
    (!driverId || row.driverIdentifier?.toLowerCase().includes(driverId)) &&
    (!filters.leaveType ||
      filters.leaveType === "all" ||
      row.detail.leave_type === filters.leaveType)
  );
}

function matchesOdometerFilters(row: OdometerShiftRow, filters: OdometerFilters) {
  const driver = filters.driver?.trim().toLowerCase();
  const driverId = filters.driverId?.trim().toLowerCase();
  const plate = filters.plate?.trim().toLowerCase();
  const reviewStatus = filters.reviewStatus;
  const phase = filters.phase;

  const matchesReviewStatus =
    !reviewStatus ||
    reviewStatus === "all" ||
    (phase !== "end" && row.startReviewStatus === reviewStatus) ||
    (phase !== "start" && row.endReviewStatus === reviewStatus);

  const matchesPhase =
    !phase ||
    phase === "all" ||
    (phase === "start" && row.startReading !== null) ||
    (phase === "end" && row.endReading !== null);

  return (
    (!driver || row.driverName.toLowerCase().includes(driver)) &&
    (!driverId || row.driverIdentifier?.toLowerCase().includes(driverId)) &&
    (!plate || row.vehiclePlate?.toLowerCase().includes(plate)) &&
    matchesReviewStatus &&
    matchesPhase
  );
}

function compareOdometerRows(a: OdometerShiftRow, b: OdometerShiftRow) {
  const aPending = a.startReviewStatus === "pending_review" || a.endReviewStatus === "pending_review";
  const bPending = b.startReviewStatus === "pending_review" || b.endReviewStatus === "pending_review";
  if (aPending !== bPending) return aPending ? -1 : 1;
  return new Date(b.shiftDate).getTime() - new Date(a.shiftDate).getTime();
}

function compareAppRequestRows(a: AppRequestRow, b: AppRequestRow) {
  if (a.status === "pending" && b.status !== "pending") return -1;
  if (a.status !== "pending" && b.status === "pending") return 1;
  return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
}

function getRiyadhDayUtcRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(
    Date.UTC(year, month - 1, day, -riyadhUtcOffsetHours, 0, 0, 0),
  );
  const end = new Date(start.getTime() + 86_400_000 - 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function logOdometerLoadDiagnostic({
  organizationId,
  selectedDate,
  dateRange,
  returnedShiftCount,
  ibrahimShiftCount,
  shiftIdSuffixes,
  signedPhotoFailureCount,
  error,
}: {
  organizationId: string;
  selectedDate: string | undefined;
  dateRange: { startIso: string; endIso: string } | null;
  returnedShiftCount: number;
  ibrahimShiftCount: number;
  shiftIdSuffixes: string[];
  signedPhotoFailureCount?: number;
  error: { code?: string; message: string } | null;
}) {
  if (process.env.NODE_ENV === "production") return;

  console.info("[app-requests:odometer:load]", {
    organizationIdSuffix: safeSuffix(organizationId),
    selectedDate,
    utcRange: dateRange,
    returnedShiftCount,
    ibrahimShiftCount,
    shiftIdSuffixes,
    signedPhotoFailureCount,
    error,
  });
}

async function logAppRequestLoadDiagnostic(
  supabase: Parameters<typeof loadDrivers>[0],
  {
    stage,
    userId,
    organizationId,
    requestType,
    table,
    returnedCount,
    error,
  }: {
    stage: "request_query" | "detail_query";
    userId: string;
    organizationId: string;
    requestType: DriverAppRequestType;
    table: string;
    returnedCount: number;
    error: {
      code?: string;
      message: string;
      details?: string | null;
      hint?: string | null;
    };
  },
) {
  if (process.env.NODE_ENV === "production") return;

  const [{ data: canView }, { data: canReview }] = await Promise.all([
    supabase.rpc("has_organization_permission", {
      target_user_id: userId,
      target_organization_id: organizationId,
      target_permission_key: "app_requests.view",
    }),
    supabase.rpc("has_organization_permission", {
      target_user_id: userId,
      target_organization_id: organizationId,
      target_permission_key: "app_requests.review",
    }),
  ]);

  console.error("[app-requests:load]", {
    stage,
    table,
    requestType,
    organizationIdSuffix: safeSuffix(organizationId),
    returnedCount,
    permission: {
      canView: Boolean(canView),
      canReview: Boolean(canReview),
    },
    error,
  });
}

function safeSuffix(value: string | null | undefined) {
  return value ? value.slice(-8) : "";
}

function isDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isRequestStatus(value: string | undefined): value is DriverAppRequestStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "completed" ||
    value === "cancelled"
  );
}

function normalizePage(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}
