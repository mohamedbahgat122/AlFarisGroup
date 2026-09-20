import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getBusinessDateString } from "@/features/drivers/expiry";
import type {
  AppRequestSummary,
  AppRequestRow,
  DriverAppRequestStatus,
  DriverAppRequestType,
  MaintenanceJobExecution,
  MaintenanceProviderOption,
  OilMaintenanceAlertsResult,
  OilMaintenanceStatus,
  OilMaintenanceTrackingRow,
  OdometerShiftRow,
  OdometerSummary,
} from "@/features/app-requests/types";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Database } from "@/types/database";
import type { Locale } from "@/types/locale";
import { canViewRequestType } from "@/features/app-requests/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";

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
  organization_id?: string;
  full_name: string;
  keeta_driver_id: string | null;
  mobile_number: string | null;
  vehicle_id: string | null;
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
  order_period_template_id: string | null;
  shift_template_id: string | null;
  scheduled_business_date: string | null;
  applied_minimum_work_minutes: number | null;
};

type VehicleRecord = {
  id: string;
  organization_id?: string | null;
  assigned_organization_id?: string | null;
  vehicle_type: string;
  plate_number: string;
  assigned_driver_id?: string | null;
  authorized_driver_id?: string | null;
};

type OilChangeEventRecord = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  driver_id: string | null;
  request_id: string | null;
  odometer_reading: number;
  interval_km: number;
  completed_at: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type LatestOdometerRecord = {
  vehicle_id: string;
  driver_id: string;
  end_odometer_reading: number;
  ended_at: string | null;
  started_at: string;
  created_at: string;
};

type CumulativeDistanceRecord = {
  driver_id: string;
  total_distance_km: number;
};

type MaintenanceProviderRecord = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

type MaintenanceJobRecord = {
  id: string;
  request_id: string;
  job_type: MaintenanceJobExecution["jobType"];
  status: MaintenanceJobExecution["status"];
  provider_id: string;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  invoice_file_name: string | null;
  invoice_file_path: string | null;
  invoice_mime_type: string | null;
  invoice_uploaded_at: string | null;
};

type MaintenanceProviderOrganizationRecord = {
  provider_id: string;
  organization_id: string;
  is_active: boolean;
};

type AppRequestsLocalDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_providers: {
        Row: MaintenanceProviderRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_provider_organizations: {
        Row: MaintenanceProviderOrganizationRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      maintenance_jobs: {
        Row: MaintenanceJobRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      fleet_vehicle_oil_change_events: {
        Row: OilChangeEventRecord;
        Insert: {
          id?: string;
          organization_id: string;
          vehicle_id: string;
          driver_id?: string | null;
          request_id?: string | null;
          odometer_reading: number;
          interval_km: number;
          completed_at: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      has_current_user_organization_permission: {
        Args: {
          target_organization_id: string;
          target_permission_key: string;
        };
        Returns: boolean;
      };
      get_organization_driver_cumulative_distances: {
        Args: { p_organization_id: string };
        Returns: CumulativeDistanceRecord[];
      };
    };
  };
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

type OdometerShiftContextRecord = {
  shift_id: string | null;
  driver_id: string;
  vehicle_id: string | null;
  expected_previous_reading: number | null;
  latest_baseline_reading: number | null;
  latest_baseline_reset_at: string | null;
  latest_baseline_reason: string | null;
};

type OdometerVehicleBaselineContext = {
  vehicleId: string | null;
  expectedPreviousReading: number | null;
  baselineReading: number | null;
  baselineResetAt: string | null;
  baselineReason: string | null;
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

export async function getEligibleMaintenanceProvidersForOrganization(
  organizationId: string,
): Promise<MaintenanceProviderOption[]> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return [];
  }

  const supabase = admin.supabase as SupabaseClient<AppRequestsLocalDatabase>;
  const { data: mappings, error: mappingsError } = await supabase
    .from("maintenance_provider_organizations")
    .select("provider_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (mappingsError || !mappings || mappings.length === 0) {
    return [];
  }

  const providerIds = Array.from(
    new Set(mappings.map((mapping) => mapping.provider_id)),
  );
  const { data, error } = await supabase
    .from("maintenance_providers")
    .select("id, name, code")
    .in("id", providerIds)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []).map((provider) => ({
    id: provider.id,
    name: provider.name,
    code: provider.code,
  }));
}

export async function getOilMaintenanceAlertsForDashboard({
  supabase,
  organizations,
  locale,
}: {
  supabase: SupabaseClient<Database>;
  organizations: AccessibleOrganization[];
  locale: Locale;
}): Promise<OilMaintenanceAlertsResult> {
  const visibleOrganizations = organizations.filter(
    (organization) =>
      canViewRequestType(organization.permissionKeys, "oil_change"),
  );

  if (visibleOrganizations.length === 0) {
    return emptyOilMaintenanceAlertsResult("success");
  }

  const organizationIds = visibleOrganizations.map((organization) => organization.id);
  const organizationsById = new Map(
    visibleOrganizations.map((organization) => [organization.id, organization]),
  );
  const driversResult = await loadOilTrackingDriversForOrganizations(
    supabase,
    organizationIds,
  );

  if (driversResult.error) {
    return emptyOilMaintenanceAlertsResult("load_error");
  }

  const drivers = driversResult.drivers;
  const vehiclesByDriverId = await loadCurrentOilVehiclesForOrganizations(
    supabase,
    organizationIds,
    drivers,
  );
  const vehicleIds = Array.from(
    new Set(Array.from(vehiclesByDriverId.values()).map((vehicle) => vehicle.id)),
  );
  const oilSupabase = supabase as SupabaseClient<AppRequestsLocalDatabase>;
  const [eventsByVehicleId, latestOdometerByVehicleId] = await Promise.all([
    loadLatestOilEventsForOrganizations(oilSupabase, organizationIds, vehicleIds),
    loadLatestValidVehicleOdometersForOrganizations(
      supabase,
      organizationIds,
      vehicleIds,
    ),
  ]);

  const alerts = drivers.flatMap((driver) => {
    if (!driver.organization_id) return [];

    const organization = organizationsById.get(driver.organization_id);
    const vehicle = vehiclesByDriverId.get(driver.id) ?? null;
    const event = vehicle ? eventsByVehicleId.get(vehicle.id) ?? null : null;
    const latestOdometer =
      vehicle ? latestOdometerByVehicleId.get(vehicle.id) ?? null : null;
    const derived = deriveOilMetrics({
      event,
      latestOdometer: latestOdometer?.end_odometer_reading ?? null,
      vehicleId: vehicle?.id ?? null,
    });

    if (
      !organization ||
      !vehicle ||
      derived.remainingKm === null ||
      (derived.oilStatus !== "due" && derived.oilStatus !== "due_soon")
    ) {
      return [];
    }

    const search = encodeURIComponent(driver.full_name);

    return [
      {
        id: `${vehicle.id}:${event?.id ?? "oil"}`,
        organizationId: organization.id,
        organizationCode: organization.code,
        organizationName: organization.name,
        driverId: driver.id,
        driverName: driver.full_name,
        driverIdentifier: driver.keeta_driver_id ?? null,
        vehicleId: vehicle.id,
        vehicleLabel: vehicle.vehicle_type ?? driver.vehicle_type ?? null,
        vehiclePlate:
          vehicle.plate_number ??
          driver.keeta_vehicle_plate_number ??
          null,
        remainingKm: derived.remainingKm,
        oilStatus: derived.oilStatus,
        href: `/${locale}/dashboard/organizations/${organization.code}/app-requests/oil-change?search=${search}`,
      },
    ];
  });

  alerts.sort((a, b) => {
    if (a.oilStatus !== b.oilStatus) {
      return a.oilStatus === "due" ? -1 : 1;
    }

    return a.remainingKm - b.remainingKm || a.driverName.localeCompare(b.driverName);
  });

  const dueCount = alerts.filter((alert) => alert.oilStatus === "due").length;
  const dueSoonCount = alerts.length - dueCount;

  return {
    status: "success",
    alerts: alerts.slice(0, 50),
    totalCount: alerts.length,
    dueCount,
    dueSoonCount,
    hasDue: dueCount > 0,
    hasDueSoon: dueSoonCount > 0,
  };
}

export async function getOilMaintenanceTrackingPage({
  organizationId,
  filters,
}: {
  organizationId: string;
  filters: RequestFilters;
}): Promise<
  | {
      status: "success";
      rows: OilMaintenanceTrackingRow[];
    }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const driversResult = await loadOilTrackingDrivers(
    admin.supabase,
    organizationId,
    filters,
  );

  if (driversResult.error) {
    return { status: "load_error", rows: [] };
  }

  const drivers = driversResult.drivers;
  const driverIds = drivers.map((driver) => driver.id);
  const vehiclesByDriverId = await loadCurrentOilVehicles(
    admin.supabase,
    organizationId,
    drivers,
  );
  const vehicleIds = Array.from(
    new Set(
      Array.from(vehiclesByDriverId.values())
        .map((vehicle) => vehicle.id)
        .filter(Boolean),
    ),
  );
  const oilSupabase =
    admin.supabase as SupabaseClient<AppRequestsLocalDatabase>;
  const [
    eventsByVehicleId,
    latestOdometerByVehicleId,
    cumulativeMap,
    requestsByDriverId,
  ] = await Promise.all([
    loadLatestOilEvents(oilSupabase, organizationId, vehicleIds),
    loadLatestValidVehicleOdometers(admin.supabase, organizationId, vehicleIds),
    loadCumulativeDistances(oilSupabase, organizationId),
    loadLatestOilRequestsForDrivers(
      admin.supabase,
      organizationId,
      drivers,
      driverIds,
    ),
  ]);

  return {
    status: "success",
    rows: drivers.map((driver) => {
      const vehicle = vehiclesByDriverId.get(driver.id) ?? null;
      const event = vehicle ? eventsByVehicleId.get(vehicle.id) ?? null : null;
      const latestOdometer =
        vehicle ? latestOdometerByVehicleId.get(vehicle.id) ?? null : null;
      const derived = deriveOilMetrics({
        event,
        latestOdometer: latestOdometer?.end_odometer_reading ?? null,
        vehicleId: vehicle?.id ?? null,
      });

      return {
        driverId: driver.id,
        driverName: driver.full_name,
        driverIdentifier: driver.keeta_driver_id ?? null,
        vehicleId: vehicle?.id ?? null,
        vehicleLabel: vehicle?.vehicle_type ?? driver.vehicle_type ?? null,
        vehiclePlate:
          vehicle?.plate_number ??
          driver.keeta_vehicle_plate_number ??
          null,
        lastOilChangeOdometer: event?.odometer_reading ?? null,
        oilIntervalKm: event?.interval_km ?? null,
        nextOilChangeAt: derived.nextOilChangeAt,
        latestOdometer: latestOdometer?.end_odometer_reading ?? null,
        drivenSinceOilChange: derived.drivenSinceOilChange,
        remainingKm: derived.remainingKm,
        totalDistanceKm: cumulativeMap.get(driver.id) ?? null,
        oilStatus: derived.oilStatus,
        latestRequest: requestsByDriverId.get(driver.id) ?? null,
      };
    }),
  };
}

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

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organizationId,
  );
  if (!canViewRequestType(permissions, requestType)) {
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
  const [drivers, vehicles, reviewers, organizations, detailResult, maintenanceJobs] = await Promise.all([
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
    loadMaintenanceJobsForRequests(
      admin.supabase as SupabaseClient<AppRequestsLocalDatabase>,
      requestType,
      requests.map((request) => request.id),
    ),
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
          maintenanceJob: maintenanceJobs.get(request.id) ?? null,
          detail,
        };
      })
      .filter((row) => matchesTextFilters(row, filters))
      .sort(compareAppRequestRows),
  };
}

async function loadMaintenanceJobsForRequests(
  supabase: SupabaseClient<AppRequestsLocalDatabase>,
  requestType: DriverAppRequestType,
  requestIds: string[],
) {
  const jobsByRequestId = new Map<string, MaintenanceJobExecution>();

  if (
    requestIds.length === 0 ||
    (requestType !== "maintenance" && requestType !== "oil_change")
  ) {
    return jobsByRequestId;
  }

  const { data: jobs } = await supabase
    .from("maintenance_jobs")
    .select(
      "id, request_id, job_type, status, provider_id, assigned_at, started_at, completed_at, cancelled_at, invoice_file_name, invoice_file_path, invoice_mime_type, invoice_uploaded_at",
    )
    .in("request_id", Array.from(new Set(requestIds)));

  const providerIds = Array.from(
    new Set((jobs ?? []).map((job) => job.provider_id)),
  );
  const providersById = new Map<string, MaintenanceProviderRecord>();

  if (providerIds.length > 0) {
    const { data: providers } = await supabase
      .from("maintenance_providers")
      .select("id, name, code")
      .in("id", providerIds);

    for (const provider of providers ?? []) {
      providersById.set(provider.id, {
        id: provider.id,
        name: provider.name,
        code: provider.code,
        is_active: true,
      });
    }
  }

  for (const job of jobs ?? []) {
    const provider = providersById.get(job.provider_id);
    jobsByRequestId.set(job.request_id, {
      id: job.id,
      jobType: job.job_type,
      status: job.status,
      providerId: job.provider_id,
      providerName: provider?.name ?? null,
      providerCode: provider?.code ?? null,
      assignedAt: job.assigned_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      cancelledAt: job.cancelled_at,
      invoiceFileName: job.invoice_file_name,
      invoiceFilePath: job.invoice_file_path,
      invoiceMimeType: job.invoice_mime_type,
      invoiceUploadedAt: job.invoice_uploaded_at,
      materials: [],
    });
  }

  return jobsByRequestId;
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
  const { data: cumulativeData } = await admin.supabase.rpc('get_organization_driver_cumulative_distances' as any, {
    p_organization_id: organizationId
  });
  const cumulativeMap = new Map<string, number>();
  if (cumulativeData) {
    (cumulativeData as unknown as { driver_id: string; total_distance_km: number }[]).forEach(row => {
      cumulativeMap.set(row.driver_id, row.total_distance_km ?? 0);
    });
  }
  const { data: shiftContextData } = await admin.supabase.rpc("get_odometer_page_shifts_context" as any, {
    p_organization_id: organizationId,
    p_date: selectedDate,
  });
  const shiftContextMap = new Map<string, OdometerVehicleBaselineContext>();
  const driverContextMap = new Map<string, OdometerVehicleBaselineContext>();
  if (shiftContextData) {
    (shiftContextData as unknown as OdometerShiftContextRecord[]).forEach((row) => {
      const context = {
        vehicleId: row.vehicle_id,
        expectedPreviousReading: row.expected_previous_reading,
        baselineReading: row.latest_baseline_reading,
        baselineResetAt: row.latest_baseline_reset_at,
        baselineReason: row.latest_baseline_reason,
      };
      if (row.shift_id) shiftContextMap.set(row.shift_id, context);
      driverContextMap.set(row.driver_id, context);
    });
  }
  const contextVehicleIds = Array.from(driverContextMap.values())
    .map((context) => context.vehicleId)
    .filter((value): value is string => Boolean(value));
  const vehicles = await loadVehicles(
    admin.supabase,
    [
      ...allShifts
        .map((shift) => shift.vehicle_id)
        .filter((value): value is string => Boolean(value)),
      ...contextVehicleIds,
    ],
  );

  const allRows = mapDriversToOdometerRows({
    cumulativeMap,
    shiftContextMap,
    driverContextMap,
    drivers: eligibleDrivers,
    shifts: allShifts,
    vehicles,
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
    .select("id, full_name, keeta_driver_id, mobile_number, vehicle_id, vehicle_type, keeta_vehicle_plate_number, vehicle_number")
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

  return (data ?? []) as unknown as OdometerShiftRecord[];
}

async function loadOilTrackingDriversForOrganizations(
  supabase: SupabaseClient<Database>,
  organizationIds: string[],
): Promise<
  | { drivers: DriverRecord[]; error: null }
  | { drivers: []; error: { code?: string; message: string } }
> {
  if (organizationIds.length === 0) {
    return { drivers: [], error: null };
  }

  const { data, error } = await supabase
    .from("drivers")
    .select(
      "id, organization_id, full_name, keeta_driver_id, mobile_number, vehicle_id, vehicle_type, keeta_vehicle_plate_number, vehicle_number",
    )
    .in("organization_id", organizationIds)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return { drivers: [], error: { code: error.code, message: error.message } };
  }

  return {
    drivers: (data ?? []) as DriverRecord[],
    error: null,
  };
}

async function loadOilTrackingDrivers(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  filters: RequestFilters,
): Promise<
  | { drivers: DriverRecord[]; error: null }
  | { drivers: []; error: { code?: string; message: string } }
> {
  let query = supabase
    .from("drivers")
    .select(
      "id, full_name, keeta_driver_id, mobile_number, vehicle_id, vehicle_type, keeta_vehicle_plate_number, vehicle_number",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const search = getRequestSearch(filters);
  if (search.length >= 2) {
    const like = `%${sanitizeSearchLike(search)}%`;
    query = query.or(
      [
        `full_name.ilike.${like}`,
        `keeta_driver_id.ilike.${like}`,
        `mobile_number.ilike.${like}`,
        `vehicle_number.ilike.${like}`,
      ].join(","),
    );
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

async function loadCurrentOilVehicles(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  drivers: DriverRecord[],
) {
  const vehiclesByDriverId = new Map<string, VehicleRecord>();

  if (drivers.length === 0) return vehiclesByDriverId;
  const vehicleIds = drivers.map((driver) => driver.vehicle_id).filter((id): id is string => Boolean(id));
  if (vehicleIds.length === 0) return vehiclesByDriverId;

  const { data } = await supabase
    .from("fleet_vehicles")
    .select("id, vehicle_type, plate_number")
    .in("id", vehicleIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const vehicles = (data ?? []) as VehicleRecord[];
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  for (const driver of drivers) {
    const vehicle = driver.vehicle_id ? vehiclesById.get(driver.vehicle_id) : undefined;

    if (vehicle) {
      vehiclesByDriverId.set(driver.id, vehicle);
    }
  }

  return vehiclesByDriverId;
}

async function loadCurrentOilVehiclesForOrganizations(
  supabase: SupabaseClient<Database>,
  organizationIds: string[],
  drivers: DriverRecord[],
) {
  const vehiclesByDriverId = new Map<string, VehicleRecord>();

  if (drivers.length === 0 || organizationIds.length === 0) return vehiclesByDriverId;
  const vehicleIds = drivers.map((driver) => driver.vehicle_id).filter((id): id is string => Boolean(id));
  if (vehicleIds.length === 0) return vehiclesByDriverId;

  const { data } = await supabase
    .from("fleet_vehicles")
    .select("id, organization_id, assigned_organization_id, vehicle_type, plate_number")
    .in("id", vehicleIds)
    .is("archived_at", null);

  const vehicles = (data ?? []) as VehicleRecord[];
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  for (const driver of drivers) {
    const vehicle = driver.vehicle_id ? vehiclesById.get(driver.vehicle_id) : undefined;

    if (vehicle) {
      vehiclesByDriverId.set(driver.id, vehicle);
    }
  }

  return vehiclesByDriverId;
}

async function loadLatestOilEvents(
  supabase: SupabaseClient<AppRequestsLocalDatabase>,
  organizationId: string,
  vehicleIds: string[],
) {
  const eventsByVehicleId = new Map<string, OilChangeEventRecord>();

  if (vehicleIds.length === 0) return eventsByVehicleId;

  const { data } = await supabase
    .from("fleet_vehicle_oil_change_events")
    .select(
      "id, organization_id, vehicle_id, driver_id, request_id, odometer_reading, interval_km, completed_at, note, created_by, created_at",
    )
    .eq("organization_id", organizationId)
    .in("vehicle_id", vehicleIds)
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false });

  for (const event of (data ?? []) as OilChangeEventRecord[]) {
    if (!eventsByVehicleId.has(event.vehicle_id)) {
      eventsByVehicleId.set(event.vehicle_id, event);
    }
  }

  return eventsByVehicleId;
}

async function loadLatestOilEventsForOrganizations(
  supabase: SupabaseClient<AppRequestsLocalDatabase>,
  organizationIds: string[],
  vehicleIds: string[],
) {
  const eventsByVehicleId = new Map<string, OilChangeEventRecord>();

  if (organizationIds.length === 0 || vehicleIds.length === 0) return eventsByVehicleId;

  const { data } = await supabase
    .from("fleet_vehicle_oil_change_events")
    .select(
      "id, organization_id, vehicle_id, driver_id, request_id, odometer_reading, interval_km, completed_at, note, created_by, created_at",
    )
    .in("organization_id", organizationIds)
    .in("vehicle_id", vehicleIds)
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false });

  for (const event of (data ?? []) as OilChangeEventRecord[]) {
    if (!eventsByVehicleId.has(event.vehicle_id)) {
      eventsByVehicleId.set(event.vehicle_id, event);
    }
  }

  return eventsByVehicleId;
}

async function loadLatestValidVehicleOdometers(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  vehicleIds: string[],
) {
  const odometersByVehicleId = new Map<string, LatestOdometerRecord>();

  if (vehicleIds.length === 0) return odometersByVehicleId;

  const { data } = await supabase
    .from("driver_shifts")
    .select(
      "id, driver_id, vehicle_id, vehicle_plate_snapshot, status, started_at, start_odometer_reading, start_photo_path, start_photo_captured_at, ended_at, end_odometer_reading, end_photo_path, end_photo_captured_at, start_review_status, start_reviewed_by, start_reviewed_at, start_review_note, end_review_status, end_reviewed_by, end_reviewed_at, end_review_note, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .in("vehicle_id", vehicleIds)
    .not("start_odometer_reading", "is", null)
    .not("end_odometer_reading", "is", null)
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .order("created_at", { ascending: false });

  for (const shift of (data ?? []) as Array<OdometerShiftRecord & { created_at: string }>) {
    if (!shift.vehicle_id || odometersByVehicleId.has(shift.vehicle_id)) continue;
    if (!isValidOdometerDistanceShift(shift)) continue;
    odometersByVehicleId.set(shift.vehicle_id, {
      vehicle_id: shift.vehicle_id,
      driver_id: shift.driver_id,
      end_odometer_reading: shift.end_odometer_reading,
      ended_at: shift.ended_at,
      started_at: shift.started_at,
      created_at: shift.created_at,
    });
  }

  return odometersByVehicleId;
}

async function loadLatestValidVehicleOdometersForOrganizations(
  supabase: SupabaseClient<Database>,
  organizationIds: string[],
  vehicleIds: string[],
) {
  const odometersByVehicleId = new Map<string, LatestOdometerRecord>();

  if (organizationIds.length === 0 || vehicleIds.length === 0) return odometersByVehicleId;

  const { data } = await supabase
    .from("driver_shifts")
    .select(
      "id, driver_id, vehicle_id, vehicle_plate_snapshot, status, started_at, start_odometer_reading, start_photo_path, start_photo_captured_at, ended_at, end_odometer_reading, end_photo_path, end_photo_captured_at, start_review_status, start_reviewed_by, start_reviewed_at, start_review_note, end_review_status, end_reviewed_by, end_reviewed_at, end_review_note, created_at",
    )
    .in("organization_id", organizationIds)
    .eq("status", "completed")
    .in("vehicle_id", vehicleIds)
    .not("start_odometer_reading", "is", null)
    .not("end_odometer_reading", "is", null)
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .order("created_at", { ascending: false });

  for (const shift of (data ?? []) as Array<OdometerShiftRecord & { created_at: string }>) {
    if (!shift.vehicle_id || odometersByVehicleId.has(shift.vehicle_id)) continue;
    if (!isValidOdometerDistanceShift(shift)) continue;
    odometersByVehicleId.set(shift.vehicle_id, {
      vehicle_id: shift.vehicle_id,
      driver_id: shift.driver_id,
      end_odometer_reading: shift.end_odometer_reading,
      ended_at: shift.ended_at,
      started_at: shift.started_at,
      created_at: shift.created_at,
    });
  }

  return odometersByVehicleId;
}

async function loadCumulativeDistances(
  supabase: SupabaseClient<AppRequestsLocalDatabase>,
  organizationId: string,
) {
  const cumulativeMap = new Map<string, number>();
  const { data } = await supabase.rpc("get_organization_driver_cumulative_distances", {
    p_organization_id: organizationId,
  });

  for (const row of (data ?? []) as CumulativeDistanceRecord[]) {
    cumulativeMap.set(row.driver_id, row.total_distance_km ?? 0);
  }

  return cumulativeMap;
}

async function loadLatestOilRequestsForDrivers(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  drivers: DriverRecord[],
  driverIds: string[],
) {
  const requestsByDriverId = new Map<string, AppRequestRow>();

  if (driverIds.length === 0) return requestsByDriverId;

  const { data } = await supabase
    .from("driver_app_requests")
    .select(
      "id, organization_id, driver_id, vehicle_id, vehicle_plate_snapshot, request_type, status, submitted_note, submitted_at, reviewed_by, reviewed_at, review_note, completed_at",
    )
    .eq("organization_id", organizationId)
    .eq("request_type", "oil_change")
    .in("driver_id", driverIds)
    .order("submitted_at", { ascending: false })
    .limit(Math.min(Math.max(driverIds.length * 3, 50), 1000));

  const requests = (data ?? []) as RequestRecord[];
  const details = await loadDetails(
    supabase,
    "oil_change",
    requests.map((request) => request.id),
  );
  const vehicles = await loadVehicles(
    supabase,
    requests
      .map((request) => request.vehicle_id)
      .filter((value): value is string => Boolean(value)),
  );
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));

  for (const request of requests) {
    if (requestsByDriverId.has(request.driver_id)) continue;
    const driver = driversById.get(request.driver_id);
    const vehicle = vehicles.get(request.vehicle_id ?? "");
    requestsByDriverId.set(request.driver_id, {
      id: request.id,
      requestType: request.request_type,
      status: request.status,
      submittedAt: request.submitted_at,
      submittedNote: request.submitted_note,
      driverName: driver?.full_name ?? "",
      driverIdentifier: driver?.keeta_driver_id ?? null,
      organizationName: null,
      vehicleLabel: vehicle?.vehicle_type ?? driver?.vehicle_type ?? null,
      vehiclePlate:
        request.vehicle_plate_snapshot ??
        vehicle?.plate_number ??
        driver?.keeta_vehicle_plate_number ??
        null,
      reviewerName: null,
      requestedManagerName: null,
      requestedManagerJobTitle: null,
      requestedManagerStatus: null,
      reviewNote: request.review_note,
      reviewedAt: request.reviewed_at,
      completedAt: request.completed_at,
      maintenanceJob: null,
      detail: details.details.get(request.id) ?? {},
    });
  }

  return requestsByDriverId;
}

function deriveOilMetrics({
  event,
  latestOdometer,
  vehicleId,
}: {
  event: OilChangeEventRecord | null;
  latestOdometer: number | null;
  vehicleId: string | null;
}): {
  nextOilChangeAt: number | null;
  drivenSinceOilChange: number | null;
  remainingKm: number | null;
  oilStatus: OilMaintenanceStatus;
} {
  if (!vehicleId) {
    return {
      nextOilChangeAt: null,
      drivenSinceOilChange: null,
      remainingKm: null,
      oilStatus: "no_vehicle",
    };
  }

  if (!event) {
    return {
      nextOilChangeAt: null,
      drivenSinceOilChange: null,
      remainingKm: null,
      oilStatus: "incomplete",
    };
  }

  const nextOilChangeAt = event.odometer_reading + event.interval_km;

  if (latestOdometer === null) {
    return {
      nextOilChangeAt,
      drivenSinceOilChange: null,
      remainingKm: null,
      oilStatus: "incomplete",
    };
  }

  const drivenSinceOilChange = Math.max(latestOdometer - event.odometer_reading, 0);
  const remainingKm = nextOilChangeAt - latestOdometer;
  const oilStatus =
    remainingKm <= 0 ? "due" : remainingKm <= 500 ? "due_soon" : "ok";

  return {
    nextOilChangeAt,
    drivenSinceOilChange,
    remainingKm,
    oilStatus,
  };
}

function dedupeVehicles(vehicles: VehicleRecord[]) {
  const vehiclesById = new Map<string, VehicleRecord>();

  for (const vehicle of vehicles) {
    if (!vehiclesById.has(vehicle.id)) {
      vehiclesById.set(vehicle.id, vehicle);
    }
  }

  return Array.from(vehiclesById.values());
}

function emptyOilMaintenanceAlertsResult(
  status: OilMaintenanceAlertsResult["status"],
): OilMaintenanceAlertsResult {
  return {
    status,
    alerts: [],
    totalCount: 0,
    dueCount: 0,
    dueSoonCount: 0,
    hasDue: false,
    hasDueSoon: false,
  };
}

function mapDriversToOdometerRows({
  cumulativeMap,
  shiftContextMap,
  driverContextMap,
  drivers,
  shifts,
  vehicles,
  reviewers,
  selectedDate,
}: {
  cumulativeMap: Map<string, number>;
  shiftContextMap: Map<string, OdometerVehicleBaselineContext>;
  driverContextMap: Map<string, OdometerVehicleBaselineContext>;
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


  // Calculate daily distances per driver
  const dailyDistances = new Map<string, number>();
  for (const shift of shifts) {
    if (isValidOdometerDistanceShift(shift)) {
      const dist = shift.end_odometer_reading - shift.start_odometer_reading;
      dailyDistances.set(shift.driver_id, (dailyDistances.get(shift.driver_id) ?? 0) + dist);
    }
  }

  return drivers.map((driver) => {
    const shift = shiftsByDriver.get(driver.id);
    const dailyDistanceKm = dailyDistances.get(driver.id) ?? null;
    const driverContext = driverContextMap.get(driver.id);
    const assignedVehicle = vehicles.get(driverContext?.vehicleId ?? "");
    if (!shift) {
      return {
        id: `driver-${driver.id}-${selectedDate}`,
        driverName: driver.full_name,
        driverIdentifier: driver.keeta_driver_id ?? null,
        organizationName: null,
        vehicleLabel: assignedVehicle?.vehicle_type ?? driver.vehicle_type ?? null,
      vehiclePlate: assignedVehicle?.plate_number ?? driver.keeta_vehicle_plate_number ?? null,
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
          startOcrReading: null,
          startOcrStatus: null,
          endOcrReading: null,
          endOcrStatus: null,
          distance: null,
          totalDistanceKm: cumulativeMap.get(driver.id) ?? null,
          driverId: driver.id,
          vehicleId: driverContext?.vehicleId ?? null,
          dailyDistanceKm,
          expectedPreviousReading: null,
          vehicleBaselineReading: driverContext?.baselineReading ?? null,
          vehicleBaselineResetAt: driverContext?.baselineResetAt ?? null,
          vehicleBaselineReason: driverContext?.baselineReason ?? null,
          alerts: buildOdometerAlerts({
            hasStarted: false,
            shouldHaveEnd: false,
            startReading: null,
            endReading: null,
            startPhotoPathPresent: false,
            endPhotoPathPresent: false,
            expectedPreviousReading: null,
            dailyDistanceKm,
          }),
      } satisfies OdometerShiftRow;
    }

    const vehicle = vehicles.get(shift.vehicle_id ?? "");
    const endReading = shift.end_odometer_reading;
    const status = endReading === null ? "open" : "completed";
    const shiftContext = shiftContextMap.get(shift.id) ?? driverContext;
    const expectedPreviousReading = shiftContext?.expectedPreviousReading ?? null;
    const distance = isValidOdometerDistanceShift(shift)
      ? shift.end_odometer_reading - shift.start_odometer_reading
      : null;

    return {
      id: shift.id,
      driverName: driver.full_name,
      driverIdentifier: driver.keeta_driver_id ?? null,
      organizationName: null,
      vehicleLabel: vehicle?.vehicle_type ?? driver.vehicle_type ?? null,
        vehiclePlate: shift.vehicle_plate_snapshot ?? driver.keeta_vehicle_plate_number ?? null,
      status,
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
        startOcrReading: null,
        startOcrStatus: null,
        endOcrReading: null,
        endOcrStatus: null,
        distance,
        totalDistanceKm: cumulativeMap.get(driver.id) ?? null,
        driverId: driver.id,
        vehicleId: shift.vehicle_id,
        dailyDistanceKm,
        expectedPreviousReading,
        vehicleBaselineReading: shiftContext?.baselineReading ?? null,
        vehicleBaselineResetAt: shiftContext?.baselineResetAt ?? null,
        vehicleBaselineReason: shiftContext?.baselineReason ?? null,
        alerts: buildOdometerAlerts({
          hasStarted: true,
          shouldHaveEnd: shift.status === "completed" || shift.ended_at !== null,
          startReading: shift.start_odometer_reading,
          endReading,
          startPhotoPathPresent: Boolean(shift.start_photo_path),
          endPhotoPathPresent: Boolean(shift.end_photo_path),
          expectedPreviousReading,
          dailyDistanceKm,
        }),
    } satisfies OdometerShiftRow;
  });
}

function summarizeOdometerDailyRows(rows: OdometerShiftRow[]): OdometerSummary {
  return {
    total: rows.length,
    notStarted: rows.filter((row) => row.status === "not_started").length,
    startedOnly: rows.filter((row) => row.status === "open").length,
    completed: rows.filter((row) => row.status === "completed").length,
      selectedDateDistanceKm: rows.reduce((acc, row) => acc + (row.distance ?? 0), 0),
    alertRows: rows.filter((row) => row.alerts.length > 0).length,
  };
}

function isValidOdometerDistanceShift(
  shift: OdometerShiftRecord,
): shift is OdometerShiftRecord & {
  start_odometer_reading: number;
  end_odometer_reading: number;
} {
  return (
    shift.status === "completed" &&
    shift.start_odometer_reading !== null &&
    shift.end_odometer_reading !== null &&
    shift.end_odometer_reading >= shift.start_odometer_reading &&
    shift.start_review_status !== "rejected" &&
    shift.end_review_status !== "rejected"
  );
}

function buildOdometerAlerts({
  hasStarted,
  shouldHaveEnd,
  startReading,
  endReading,
  startPhotoPathPresent,
  endPhotoPathPresent,
  expectedPreviousReading,
  dailyDistanceKm,
}: {
  hasStarted: boolean;
  shouldHaveEnd: boolean;
  startReading: number | null;
  endReading: number | null;
  startPhotoPathPresent: boolean;
  endPhotoPathPresent: boolean;
  expectedPreviousReading: number | null;
  dailyDistanceKm: number | null;
}) {
  const alerts: OdometerShiftRow["alerts"] = [];

  if (hasStarted && startReading === null) {
    alerts.push({
      code: "MISSING_START_READING",
      severity: "critical",
    });
  }

  if (shouldHaveEnd && endReading === null) {
    alerts.push({
      code: "MISSING_END_READING",
      severity: "critical",
    });
  }

  if (hasStarted && !startPhotoPathPresent) {
    alerts.push({
      code: "MISSING_START_PHOTO",
      severity: "warning",
    });
  }

  if (shouldHaveEnd && !endPhotoPathPresent) {
    alerts.push({
      code: "MISSING_END_PHOTO",
      severity: "warning",
    });
  }

  if (
    typeof startReading === "number" &&
    typeof expectedPreviousReading === "number" &&
    startReading !== expectedPreviousReading
  ) {
    const differenceKm = startReading - expectedPreviousReading;
    alerts.push({
      code: "CONTINUITY_MISMATCH",
      severity: "warning",
      meta: {
        expected: expectedPreviousReading,
        actual: startReading,
        differenceKm,
      },
    });
  }

  if (hasStarted && typeof dailyDistanceKm === "number" && dailyDistanceKm > 0 && dailyDistanceKm < 200) {
    alerts.push({
      code: "LOW_DAILY_DISTANCE",
      severity: "warning",
      meta: { dailyDistanceKm },
    });
  }

  if (typeof dailyDistanceKm === "number" && dailyDistanceKm > 450) {
    alerts.push({
      code: "HIGH_DAILY_DISTANCE",
      severity: "warning",
      meta: { dailyDistanceKm },
    });
  }

  return alerts;
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
    .select("id, full_name, keeta_driver_id, mobile_number, vehicle_id, vehicle_type, keeta_vehicle_plate_number, vehicle_number")
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
    ["annual", ["annual", "ط³ظ†ظˆظٹط©"]],
    ["sick", ["sick", "ظ…ط±ط¶ظٹط©"]],
    ["weekly", ["weekly", "ط£ط³ط¨ظˆط¹ظٹط©", "ط§ط³ط¨ظˆط¹ظٹط©"]],
    ["emergency", ["emergency", "ط·ط§ط±ط¦ط©"]],
    ["unpaid", ["unpaid", "ط¨ط¯ظˆظ† ط±ط§طھط¨"]],
    ["other", ["other", "ط£ط®ط±ظ‰", "ط§ط®ط±ظ‰"]],
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

  const permissionClient = supabase as SupabaseClient<AppRequestsLocalDatabase>;
  const [{ data: canView }, { data: canReview }] = await Promise.all([
    permissionClient.rpc("has_current_user_organization_permission", {
      target_organization_id: organizationId,
      target_permission_key: "app_requests.view",
    }),
    permissionClient.rpc("has_current_user_organization_permission", {
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
