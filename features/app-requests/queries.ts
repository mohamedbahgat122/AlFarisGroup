import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getBusinessDateString } from "@/features/drivers/expiry";
import type {
  AppRequestSummary,
  AppRequestRow,
  DriverAppRequestStatus,
  DriverAppRequestType,
  OdometerShiftRow,
  OdometerSummary,
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
  mobile_number: string | null;
  vehicle_type: string | null;
  keeta_vehicle_plate_number: string | null;
  vehicle_number: string | null;
};

type OdometerShiftRecord = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  vehicle_plate_snapshot: string | null;
  status: "open" | "completed" | "cancelled";
  started_at: string;
  start_odometer_reading: number;
  start_photo_path: string | null;
  start_photo_captured_at: string | null;
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
  search?: string;
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
const odometerPageSize = 20;
const riyadhUtcOffsetHours = 3;

export async function getAppRequestPage({
  organizationId,
  organizationName,
  requestType,
  filters,
}: {
  organizationId: string;
  organizationName?: string;
  requestType: DriverAppRequestType;
  filters: RequestFilters;
}): Promise<
  | {
      status: "success";
      rows: AppRequestRow[];
      page: number;
      totalPages: number;
      totalRows: number;
      summary: AppRequestSummary;
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
  const search = getRequestSearch(filters);
  const [matchedDriverIds, matchedLeaveRequestIds, summary] = await Promise.all([
    findMatchingRequestDriverIds({
      supabase: admin.supabase,
      organizationId,
      organizationName,
      search,
    }),
    findMatchingLeaveRequestIds({
      supabase: admin.supabase,
      search,
      leaveType: requestType === "leave" ? filters.leaveType : undefined,
    }),
    getRequestSummary({
          supabase: admin.supabase,
          organizationId,
      requestType,
        })
  ]);

  if (matchedDriverIds.status === "load_error" || matchedLeaveRequestIds.status === "load_error") {
    return { status: "load_error", rows: [] };
  }

  let query = admin.supabase
    .from("driver_app_requests")
    .select(
      "id, organization_id, driver_id, vehicle_id, vehicle_plate_snapshot, request_type, status, submitted_note, submitted_at, reviewed_by, reviewed_at, review_note, completed_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("request_type", requestType)
    .order("submitted_at", { ascending: false });

  if (isDate(filters.from)) query = query.gte("submitted_at", filters.from);
  if (isDate(filters.to)) query = query.lte("submitted_at", `${filters.to}T23:59:59`);
  if (isRequestStatus(filters.status)) query = query.eq("status", filters.status);
  if (matchedDriverIds.driverIds) {
    if (matchedDriverIds.driverIds.length === 0) {
      return {
        status: "success",
        page,
        totalRows: 0,
        totalPages: 1,
        summary,
        rows: [],
      };
    }
    query = query.in("driver_id", matchedDriverIds.driverIds);
  }
  if (matchedLeaveRequestIds.requestIds) {
    if (matchedLeaveRequestIds.requestIds.length === 0) {
      return {
        status: "success",
        page,
        totalRows: 0,
        totalPages: 1,
        summary,
        rows: [],
      };
    }
    query = query.in("id", matchedLeaveRequestIds.requestIds);
  }

  query = query.range(from, to);

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
    summary,
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
      summary: OdometerSummary;
    }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const requestedPage = normalizePage(filters.page);
  const selectedDate = isDate(filters.date) ? filters.date : getBusinessDateString();
  const dateRange = isDate(filters.date)
    ? getRiyadhDayUtcRange(filters.date)
    : getRiyadhDayUtcRange(selectedDate);
  const eligibleDriversResult = await loadEligibleOdometerDrivers(admin.supabase, organizationId, filters);

  if (eligibleDriversResult.error) {
    logOdometerLoadDiagnostic({
      organizationId,
      selectedDate,
      dateRange,
      eligibleDriverCount: 0,
      visibleDriverCount: 0,
      matchedShiftCount: 0,
      error: {
        code: eligibleDriversResult.error.code,
        message: eligibleDriversResult.error.message,
      },
    });
    return { status: "load_error", rows: [] };
  }

  const eligibleDrivers = eligibleDriversResult.drivers;
  const allDriverIds = eligibleDrivers.map((driver) => driver.id);
  const allShifts = await loadDailyOdometerShifts(
    admin.supabase,
    organizationId,
    allDriverIds,
    dateRange,
  );
  const allRows = mapDriversToOdometerRows({
    drivers: eligibleDrivers,
    shifts: allShifts,
    vehicles: await loadVehicles(
      admin.supabase,
      allShifts
        .map((shift) => shift.vehicle_id)
        .filter((value): value is string => Boolean(value)),
    ),
    reviewers: await loadProfiles(
      admin.supabase,
      allShifts
        .flatMap((shift) => [shift.start_reviewed_by, shift.end_reviewed_by])
        .filter((value): value is string => Boolean(value)),
    ),
    selectedDate,
  });
  const statusFilteredRows = allRows.filter((row) => matchesOdometerDailyStatus(row, filters.status));
  const totalRows = statusFilteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / odometerPageSize));
  const page = Math.min(requestedPage, totalPages);
  const visibleRows = statusFilteredRows
    .sort(compareOdometerRows)
    .slice((page - 1) * odometerPageSize, page * odometerPageSize);
  const summary = summarizeOdometerDailyRows(allRows);

  logOdometerLoadDiagnostic({
    organizationId,
    selectedDate,
    dateRange,
    eligibleDriverCount: eligibleDrivers.length,
    visibleDriverCount: visibleRows.length,
    matchedShiftCount: allShifts.length,
    error: null,
  });

  return {
    status: "success",
    page,
    totalRows,
    totalPages,
    summary,
    rows: visibleRows,
  };
}

async function loadEligibleOdometerDrivers(
  supabase: Parameters<typeof loadDrivers>[0],
  organizationId: string,
  filters: OdometerFilters,
): Promise<
  | { drivers: DriverRecord[]; error: null }
  | { drivers: []; error: { code?: string; message: string } }
> {
  let query = supabase
    .from("drivers")
    .select("id, full_name, keeta_driver_id, mobile_number, vehicle_type, keeta_vehicle_plate_number, vehicle_number")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const driver = filters.driver?.trim();
  if (driver) {
    const searchTerm = `%${sanitizeSearchValue(driver)}%`;
    query = query.or(
      `full_name.ilike.${searchTerm},keeta_driver_id.ilike.${searchTerm},mobile_number.ilike.${searchTerm},vehicle_number.ilike.${searchTerm}`,
    );
  }

  const driverId = filters.driverId?.trim();
  if (driverId) {
    query = query.ilike("keeta_driver_id", `%${sanitizeSearchValue(driverId)}%`);
  }

  const plate = filters.plate?.trim();
  if (plate) {
    query = query.ilike("vehicle_number", `%${sanitizeSearchValue(plate)}%`);
  }

  const { data, error } = await query;
  if (error) {
    return { drivers: [], error: { code: error.code, message: error.message } };
  }

  return {
    drivers: (data ?? []) as DriverRecord[],
    error: null,
  };
}

async function loadDailyOdometerShifts(
  supabase: Parameters<typeof loadDrivers>[0],
  organizationId: string,
  driverIds: string[],
  dateRange: { startIso: string; endIso: string },
) {
  if (driverIds.length === 0) return [];

  const { data } = await supabase
    .from("driver_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .in("driver_id", driverIds)
    .gte("started_at", dateRange.startIso)
    .lte("started_at", dateRange.endIso)
    .order("started_at", { ascending: false });

  return (data ?? []) as OdometerShiftRecord[];
}

function mapDriversToOdometerRows({
  drivers,
  shifts,
  vehicles,
  reviewers,
  selectedDate,
}: {
  drivers: DriverRecord[];
  shifts: OdometerShiftRecord[];
  vehicles: Map<string, VehicleRecord>;
  reviewers: Map<string, ProfileRecord>;
  selectedDate: string;
}) {
  const shiftsByDriver = new Map<string, OdometerShiftRecord>();
  for (const shift of shifts) {
    if (!shiftsByDriver.has(shift.driver_id)) {
      shiftsByDriver.set(shift.driver_id, shift);
    }
  }

  return drivers.map((driver) => {
    const shift = shiftsByDriver.get(driver.id);
    if (!shift) {
      return {
        id: `driver-${driver.id}-${selectedDate}`,
        driverName: driver.full_name,
        driverIdentifier: driver.keeta_driver_id ?? null,
        organizationName: null,
        vehicleLabel: driver.vehicle_type ?? null,
        vehiclePlate: driver.vehicle_number ?? driver.keeta_vehicle_plate_number ?? null,
        status: "not_started",
        shiftDate: `${selectedDate}T00:00:00+03:00`,
        startedAt: null,
        startReading: null,
        startPhotoUrl: null,
        startPhotoPathPresent: false,
        startPhotoCapturedAt: null,
        startReviewStatus: null,
        startReviewerName: null,
        startReviewedAt: null,
        startReviewNote: null,
        endedAt: null,
        endReading: null,
        endPhotoUrl: null,
        endPhotoPathPresent: false,
        endPhotoCapturedAt: null,
        endReviewStatus: null,
        endReviewerName: null,
        endReviewedAt: null,
        endReviewNote: null,
        distance: null,
      } satisfies OdometerShiftRow;
    }

    const vehicle = vehicles.get(shift.vehicle_id ?? "");
    const endReading = shift.end_odometer_reading;

    return {
      id: shift.id,
      driverName: driver.full_name,
      driverIdentifier: driver.keeta_driver_id ?? null,
      organizationName: null,
      vehicleLabel: vehicle?.vehicle_type ?? driver.vehicle_type ?? null,
      vehiclePlate: shift.vehicle_plate_snapshot ?? driver.vehicle_number ?? driver.keeta_vehicle_plate_number ?? null,
      status: endReading === null ? "open" : "completed",
      shiftDate: shift.started_at,
      startedAt: shift.started_at,
      startReading: shift.start_odometer_reading,
      startPhotoUrl: shift.start_photo_path
        ? getAppRequestPhotoUrl({ shiftId: shift.id, type: "odometer-start" })
        : null,
      startPhotoPathPresent: Boolean(shift.start_photo_path),
      startPhotoCapturedAt: shift.start_photo_captured_at,
      startReviewStatus: shift.start_review_status ?? "pending_review",
      startReviewerName: reviewers.get(shift.start_reviewed_by ?? "")?.full_name ?? null,
      startReviewedAt: shift.start_reviewed_at,
      startReviewNote: shift.start_review_note,
      endedAt: shift.ended_at,
      endReading,
      endPhotoUrl: shift.end_photo_path
        ? getAppRequestPhotoUrl({ shiftId: shift.id, type: "odometer-end" })
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
}

function summarizeOdometerDailyRows(rows: OdometerShiftRow[]): OdometerSummary {
  return {
    total: rows.length,
    notStarted: rows.filter((row) => row.status === "not_started").length,
    startedOnly: rows.filter((row) => row.status === "open").length,
    completed: rows.filter((row) => row.status === "completed").length,
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
    .select("id, full_name, keeta_driver_id, mobile_number, vehicle_type, keeta_vehicle_plate_number, vehicle_number")
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

async function findMatchingRequestDriverIds({
  supabase,
  organizationId,
  organizationName,
  search,
}: {
  supabase: Parameters<typeof loadDrivers>[0];
  organizationId: string;
  organizationName: string | undefined;
  search: string;
}): Promise<
  | { status: "success"; driverIds: string[] | null }
  | { status: "load_error"; driverIds: null }
> {
  if (search.length < 2) {
    return { status: "success", driverIds: null };
  }

  if (organizationName && organizationName.normalize("NFKC").toLowerCase().includes(search.normalize("NFKC").toLowerCase())) {
    return { status: "success", driverIds: null };
  }

  const like = `%${sanitizeSearchLike(search)}%`;
  const { data, error } = await supabase
    .from("drivers")
    .select("id")
    .eq("organization_id", organizationId)
    .or(
      [
        `full_name.ilike.${like}`,
        `keeta_driver_id.ilike.${like}`,
        `iqama_number.ilike.${like}`,
        `mobile_number.ilike.${like}`,
      ].join(","),
    )
    .limit(500);

  if (error) {
    return { status: "load_error", driverIds: null };
  }

  return {
    status: "success",
    driverIds: (data ?? []).map((driver) => driver.id),
  };
}

async function findMatchingLeaveRequestIds({
  supabase,
  search,
  leaveType,
}: {
  supabase: Parameters<typeof loadDrivers>[0];
  search: string;
  leaveType: string | undefined;
}): Promise<
  | { status: "success"; requestIds: string[] | null }
  | { status: "load_error"; requestIds: null }
> {
  const normalizedLeaveType = isLeaveTypeFilter(leaveType) ? leaveType : "";
  const searchLeaveTypes = getLeaveTypesMatchingSearch(search);

  if (!normalizedLeaveType && searchLeaveTypes === null) {
    return { status: "success", requestIds: null };
  }

  let query = supabase
    .from("driver_app_leave_request_details")
    .select("request_id");

  if (normalizedLeaveType) {
    query = query.eq("leave_type", normalizedLeaveType);
  }

  if (searchLeaveTypes) {
    if (searchLeaveTypes.length === 0) {
      return { status: "success", requestIds: [] };
    }
    query = query.in("leave_type", searchLeaveTypes);
  }

  const { data, error } = await query.limit(1000);

  if (error) {
    return { status: "load_error", requestIds: null };
  }

  return {
    status: "success",
    requestIds: (data ?? [])
      .map((detail) => detail.request_id)
      .filter((id): id is string => typeof id === "string"),
  };
}

async function getRequestSummary({
  supabase,
  organizationId,
  requestType,
}: {
  supabase: Parameters<typeof loadDrivers>[0];
  organizationId: string;
  requestType: DriverAppRequestType;
}): Promise<AppRequestSummary> {
  const today = getBusinessDateString();
  const todayRange = getRiyadhDayUtcRange(today);
  const activeLeaveRequestIds =
    requestType === "leave"
      ? await getActiveLeaveRequestIds({ supabase, today })
      : [];

  const base = () =>
    supabase
      .from("driver_app_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("request_type", requestType);

  const [
    total,
    pending,
    approved,
    rejected,
    todayCount,
    activeToday,
  ] = await Promise.all([
    base(),
    base().eq("status", "pending"),
    base().eq("status", "approved"),
    base().eq("status", "rejected"),
    base().gte("submitted_at", todayRange.startIso).lte("submitted_at", todayRange.endIso),
    activeLeaveRequestIds.length > 0
      ? base().eq("status", "approved").in("id", activeLeaveRequestIds)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  return {
    total: total.error ? 0 : total.count ?? 0,
    pending: pending.error ? 0 : pending.count ?? 0,
    approved: approved.error ? 0 : approved.count ?? 0,
    rejected: rejected.error ? 0 : rejected.count ?? 0,
    today: todayCount.error ? 0 : todayCount.count ?? 0,
    activeToday: activeToday.error ? 0 : activeToday.count ?? 0,
  };
}

async function getActiveLeaveRequestIds({
  supabase,
  today,
}: {
  supabase: Parameters<typeof loadDrivers>[0];
  today: string;
}) {
  const { data } = await supabase
    .from("driver_app_leave_request_details")
    .select("request_id")
    .lte("start_date", today)
    .gte("end_date", today)
    .limit(1000);

  return (data ?? [])
    .map((row) => row.request_id)
    .filter((id): id is string => typeof id === "string");
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

function getAppRequestPhotoUrl(
  input:
    | { type: "request-driver"; requestId: string }
    | { type: "odometer-driver" | "odometer-start" | "odometer-end"; shiftId: string },
) {
  const params = new URLSearchParams({ type: input.type });
  if ("requestId" in input) params.set("requestId", input.requestId);
  if ("shiftId" in input) params.set("shiftId", input.shiftId);
  return `/api/dashboard/app-requests/photo?${params.toString()}`;
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

function getRequestSearch(filters: RequestFilters) {
  return (filters.search || filters.driver || filters.driverId || "").trim();
}

function sanitizeSearchLike(value: string) {
  return value.normalize("NFKC").trim().replace(/[%,*()"]/g, " ").replace(/\s+/g, "%");
}

function isLeaveTypeFilter(value: string | undefined) {
  return (
    value === "annual" ||
    value === "sick" ||
    value === "weekly" ||
    value === "emergency" ||
    value === "unpaid" ||
    value === "other"
  );
}

function getLeaveTypesMatchingSearch(search: string) {
  if (search.trim().length < 2) {
    return null;
  }

  const normalized = search.normalize("NFKC").trim().toLowerCase();
  const pairs = [
    ["annual", ["annual", "سنوية"]],
    ["sick", ["sick", "مرضية"]],
    ["weekly", ["weekly", "أسبوعية", "اسبوعية"]],
    ["emergency", ["emergency", "طارئة"]],
    ["unpaid", ["unpaid", "بدون راتب"]],
    ["other", ["other", "أخرى", "اخرى"]],
  ] as const;

  return pairs
    .filter(([, labels]) => labels.some((label) => label.includes(normalized) || normalized.includes(label)))
    .map(([value]) => value);
}

function matchesOdometerDailyStatus(row: OdometerShiftRow, status: string | undefined) {
  if (!status || status === "all") return true;
  if (status === "not_started") return row.status === "not_started";
  if (status === "started") return row.status === "open";
  if (status === "completed") return row.status === "completed";
  return true;
}

function compareOdometerRows(a: OdometerShiftRow, b: OdometerShiftRow) {
  if (a.status !== b.status) {
    const rank = { open: 0, completed: 1, not_started: 2, cancelled: 3 };
    return rank[a.status] - rank[b.status];
  }

  return a.driverName.localeCompare(b.driverName, "ar");
}

function sanitizeSearchValue(value: string) {
  return value.replace(/[%_,]/g, "").trim();
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
  eligibleDriverCount,
  visibleDriverCount,
  matchedShiftCount,
  error,
}: {
  organizationId: string;
  selectedDate: string | undefined;
  dateRange: { startIso: string; endIso: string } | null;
  eligibleDriverCount: number;
  visibleDriverCount: number;
  matchedShiftCount: number;
  error: { code?: string; message: string } | null;
}) {
  if (process.env.NODE_ENV === "production") return;

  console.info("[app-requests:odometer:load]", {
    organizationIdSuffix: safeSuffix(organizationId),
    selectedDate,
    utcRange: dateRange,
    eligibleDriverCount,
    visibleDriverCount,
    matchedShiftCount,
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
