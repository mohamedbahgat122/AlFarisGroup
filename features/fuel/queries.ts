import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  KafaratplusFuelManagementResult,
  KafaratplusFuelManagementRow,
  KafaratplusFuelOperationRow,
  KafaratplusMatchDiagnostics,
  KafaratplusFuelReportResult,
  FuelManagementRow,
  FuelReportDetailDay,
  FuelReportDetails,
  FuelReportDetailItem,
  FuelReportRow,
  KafaratplusIntegrationStatus,
} from "@/features/fuel/types";
import { kafaratplusGet } from "@/features/fuel/kafaratplus-client";
import { normalizePlateForFleet } from "@/features/fleet/validation";
import type { Database } from "@/types/database";

type DriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "full_name"
  | "keeta_driver_id"
  | "keeta_vehicle_plate_number"
  | "organization_id"
  | "vehicle_id"
  | "vehicle_number"
  | "vehicle_type"
>;
type FuelReportDriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "full_name"
  | "keeta_driver_id"
  | "keeta_vehicle_plate_number"
  | "organization_id"
  | "vehicle_id"
  | "vehicle_number"
  | "vehicle_type"
>;
type FleetVehicleRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  | "id"
  | "vehicle_type"
  | "plate_number"
  | "normalized_plate_number"
  | "assigned_driver_id"
  | "authorized_driver_id"
  | "organization_id"
  | "assigned_organization_id"
>;
type KafaratplusDriverScopeRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "full_name"
  | "iqama_number"
  | "organization_id"
  | "vehicle_id"
  | "status"
  | "vehicle_number"
  | "vehicle_type"
  | "keeta_vehicle_plate_number"
>;
type FuelTransactionRow =
  Database["public"]["Tables"]["fuel_transactions"]["Row"];
type FuelRequestRow =
  Database["public"]["Tables"]["fuel_increase_requests"]["Row"];
type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "role" | "job_title"
>;

type KafaratplusOperationsResponse = Record<string, unknown>;

export type KafaratplusFuelOperationRowsResult =
  | {
      status: "success";
      rows: KafaratplusFuelOperationRow[];
    }
  | {
      status: Exclude<KafaratplusIntegrationStatus, "success">;
      rows: [];
      message: string;
    };

type FuelReportAccumulator = FuelReportRow & {
  fuelDates: Set<string>;
  vehiclePlates: Set<string>;
};

type LocalVehiclePlateScope =
  | {
      success: true;
      localVehiclesByPlate: Map<string, LocalVehicleInfo>;
      diagnostics: KafaratplusMatchDiagnostics;
    }
  | {
      success: false;
      diagnostics: KafaratplusMatchDiagnostics;
    };

type LocalVehicleInfo = {
  id: string;
  plate: string;
  normalizedPlate: string;
  vehicle: string | null;
  driver: string | null;
  driverId: string | null;
  driverIqama: string | null;
  dashPlate: string | null;
};

const fuelClassificationStrategy =
  "Fuel operations are identified from actual Kafaratplus items[].product/category/service/fuel descriptors; obvious maintenance/parts/oil-change services are excluded.";
const kafaratplusOperationsPageSize = 1000;
const kafaratplusMaxOperationsPages = 100;
const kafaratplusPaginationConcurrency = 4;

function toKafaratplusStartOfDay(date: string) {
  return date.includes("T") || date.includes(" ")
    ? date
    : `${date}T00:00:00`;
}

function toKafaratplusEndOfDay(date: string) {
  return date.includes("T") || date.includes(" ")
    ? date
    : `${date}T23:59:59`;
}

export async function getKafaratplusFuelOperationRowsForRange({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}): Promise<KafaratplusFuelOperationRowsResult> {
  const operations = await fetchAllKafaratplusOperations(
    toKafaratplusStartOfDay(fromDate),
    toKafaratplusEndOfDay(toDate),
  );

  if (!operations.success) {
    return {
      status: operations.code,
      rows: [],
      message: operations.message,
    };
  }

  return {
    status: "success",
    rows: operations.records
      .filter((record) => classifyOperation(record) === "fuel")
      .map((record) => mapKafaratplusOperation(record)),
  };
}

export function getKafaratplusFuelOperationDate(
  operation: Pick<KafaratplusFuelOperationRow, "date">,
) {
  const date = operation.date?.trim();

  if (!date) {
    return null;
  }

  return formatRiyadhDate(date);
}

function formatRiyadhDate(value: string) {
  const parsedDate = new Date(value);

  if (!Number.isFinite(parsedDate.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(parsedDate)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function getLocalVehiclePlateScope(
  organizationId: string,
): Promise<LocalVehiclePlateScope> {
  const emptyDiagnostics = createDiagnostics([], [], []);
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false, diagnostics: emptyDiagnostics };
  }

  const { data: drivers, error: driversError } = await admin.supabase
    .from("drivers")
    .select(
      "id, full_name, iqama_number, organization_id, status, vehicle_id, vehicle_number, vehicle_type, keeta_vehicle_plate_number",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (driversError) {
    return { success: false, diagnostics: emptyDiagnostics };
  }

  const driverRows = (drivers ?? []) as KafaratplusDriverScopeRow[];
  const vehicleIds = Array.from(new Set(driverRows.map((driver) => driver.vehicle_id).filter(Boolean))) as string[];
  const vehicleMetadataById = await getFleetVehicleMetadataById(vehicleIds, admin.supabase);
  const actualPlates = Array.from(new Set(Array.from(vehicleMetadataById.values()).map((vehicle) => normalizePlateForFleet(vehicle.plate_number)).filter(Boolean)));
  const localVehiclesByPlate = new Map<string, LocalVehicleInfo>();
  const diagnostics = createDiagnostics(actualPlates, [], []);
  diagnostics.driversFound = driverRows.map((driver) => ({
    driver: driver.full_name,
    actualPlate: driver.vehicle_id ? vehicleMetadataById.get(driver.vehicle_id)?.plate_number ?? null : null,
    dashPlate: driver.keeta_vehicle_plate_number || null,
  }));
  diagnostics.actualPlatesUsed = actualPlates.sort();
  diagnostics.unmatchedDrivers = driverRows
    .filter((driver) => !driver.vehicle_id || !vehicleMetadataById.has(driver.vehicle_id))
    .map((driver) => ({
      driver: driver.full_name,
      actualPlate: driver.vehicle_id ? vehicleMetadataById.get(driver.vehicle_id)?.plate_number ?? null : null,
      reason: "missing actual plate number",
    }));

  for (const driver of driverRows) {
    const vehicle = driver.vehicle_id ? vehicleMetadataById.get(driver.vehicle_id) : undefined;
    const normalizedPlate = vehicle ? normalizePlateForFleet(vehicle.plate_number) : null;
    if (!normalizedPlate) continue;
    if (localVehiclesByPlate.has(normalizedPlate)) {
      diagnostics.unmatchedDrivers = [
        ...(diagnostics.unmatchedDrivers ?? []),
        {
          driver: driver.full_name,
          actualPlate: vehicle?.plate_number ?? null,
          reason: "actual plate is shared with another active driver; fuel operations are attributed once to avoid duplicate totals",
        },
      ];
      continue;
    }

    localVehiclesByPlate.set(normalizedPlate, {
      id: vehicle?.id ?? driver.id,
      plate: vehicle?.plate_number ?? normalizedPlate,
      normalizedPlate,
      vehicle: vehicle?.vehicle_type ?? driver.vehicle_type ?? null,
      driver: driver.full_name,
      driverId: driver.id,
      driverIqama: driver.iqama_number,
      dashPlate: driver.keeta_vehicle_plate_number,
    });
  }

  return {
    success: true,
    localVehiclesByPlate,
    diagnostics,
  };
}

async function getFleetVehicleMetadataByPlate(
  normalizedPlates: string[],
  supabase: SupabaseClient<Database>,
) {
  const vehiclesByPlate = new Map<string, FleetVehicleRow>();
  if (normalizedPlates.length === 0) return vehiclesByPlate;

  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select(
      "id, vehicle_type, plate_number, normalized_plate_number, assigned_driver_id, authorized_driver_id, organization_id, assigned_organization_id",
    )
    .in("normalized_plate_number", normalizedPlates)
    .is("archived_at", null);

  if (error) return vehiclesByPlate;

  for (const vehicle of (data ?? []) as FleetVehicleRow[]) {
    const normalizedPlate =
      vehicle.normalized_plate_number || normalizePlateForFleet(vehicle.plate_number);
    if (normalizedPlate && !vehiclesByPlate.has(normalizedPlate)) {
      vehiclesByPlate.set(normalizedPlate, vehicle);
    }
  }

  return vehiclesByPlate;
}

async function getFleetVehicleMetadataById(
  ids: string[],
  supabase: SupabaseClient<Database>,
) {
  const vehiclesById = new Map<string, FleetVehicleRow>();
  if (ids.length === 0) return vehiclesById;

  const { data, error } = await supabase
    .from("fleet_vehicles")
    .select("id, vehicle_type, plate_number, normalized_plate_number, assigned_driver_id, authorized_driver_id, organization_id, assigned_organization_id")
    .in("id", ids)
    .is("archived_at", null);

  if (!error) {
    for (const vehicle of (data ?? []) as FleetVehicleRow[]) {
      vehiclesById.set(vehicle.id, vehicle);
    }
  }

  return vehiclesById;
}

const fetchAllKafaratplusOperations = cache(
  async (
    fromDate: string,
    toDate: string,
  ): Promise<
    | { success: true; records: Record<string, unknown>[]; requestCount: number; durationMs: number }
    | {
        success: false;
        code: Exclude<KafaratplusIntegrationStatus, "success">;
        message: string;
        requestCount: number;
        durationMs: number;
      }
  > => fetchAllKafaratplusOperationsUncached({ fromDate, toDate }),
);

async function fetchAllKafaratplusOperationsUncached({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}): Promise<
  | { success: true; records: Record<string, unknown>[]; requestCount: number; durationMs: number }
  | {
      success: false;
      code: Exclude<KafaratplusIntegrationStatus, "success">;
      message: string;
      requestCount: number;
      durationMs: number;
    }
> {
  const startedAt = performance.now();
  let requestCount = 0;
  const first = await fetchKafaratplusOperationsPage({
    fromDate,
    toDate,
    skip: 0,
    count: kafaratplusOperationsPageSize,
    page: 1,
  });
  requestCount += 1;

  if (!first.success) {
    return {
      success: false,
      code: first.code,
      message: first.message,
      requestCount,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  const totalCount = extractTotalCount(first.data);
  const records = [...first.records];
  if (totalCount !== null && totalCount > kafaratplusOperationsPageSize * kafaratplusMaxOperationsPages) {
    console.error("[kafaratplus:fuel:pagination_limit_exceeded]", {
      totalCount,
      pageSize: kafaratplusOperationsPageSize,
      maxPages: kafaratplusMaxOperationsPages,
    });
    return {
      success: false,
      code: "api_error",
      message: "Kafaratplus returned more operations than the configured safe report limit.",
      requestCount,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  const totalPages = totalCount === null
    ? null
    : Math.max(Math.ceil(totalCount / kafaratplusOperationsPageSize), 1);

  if (totalPages !== null) {
    const remainingPages = Array.from(
      { length: Math.max(totalPages - 1, 0) },
      (_, index) => index + 2,
    );
    const remaining = await fetchKafaratplusOperationPagesWithConcurrency({
      fromDate,
      toDate,
      pages: remainingPages,
    });
    requestCount += remaining.requestCount;

    if (!remaining.success) {
      return {
        success: false,
        code: remaining.code,
        message: remaining.message,
        requestCount,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    return {
      success: true,
      records: records.concat(remaining.records),
      requestCount,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  for (let page = 2; page <= kafaratplusMaxOperationsPages; page += 1) {
    const result = await fetchKafaratplusOperationsPage({
      fromDate,
      toDate,
      skip: (page - 1) * kafaratplusOperationsPageSize,
      count: kafaratplusOperationsPageSize,
      page,
    });
    requestCount += 1;

    if (!result.success) {
      return {
        success: false,
        code: result.code,
        message: result.message,
        requestCount,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    records.push(...result.records);
    if (result.records.length < kafaratplusOperationsPageSize) {
      return {
        success: true,
        records,
        requestCount,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }
  }

  console.error("[kafaratplus:fuel:pagination_limit_reached]", {
    pageSize: kafaratplusOperationsPageSize,
    maxPages: kafaratplusMaxOperationsPages,
  });
  return {
    success: false,
    code: "api_error",
    message: "Kafaratplus pagination reached the configured safe report limit.",
    requestCount,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function fetchKafaratplusOperationsPage({
  fromDate,
  toDate,
  skip,
  count,
  page,
}: {
  fromDate: string;
  toDate: string;
  skip: number;
  count: number;
  page: number;
}): Promise<
  | { success: true; data: KafaratplusOperationsResponse; records: Record<string, unknown>[] }
  | {
      success: false;
      code: Exclude<KafaratplusIntegrationStatus, "success">;
      message: string;
    }
> {
  const startedAt = performance.now();
  const result = await kafaratplusGet<KafaratplusOperationsResponse>(
    "/api/customer/setup/integration/vehicle/operations",
    {
      fromDate,
      toDate,
      skip,
      count,
    },
  );

  if (!result.success) {
    console.error("[kafaratplus:fuel:page_failed]", {
      page,
      skip,
      count,
      durationMs: Math.round(performance.now() - startedAt),
      code: result.code,
      status: result.status,
    });
    return { success: false, code: result.code, message: result.message };
  }

  return {
    success: true,
    data: result.data,
    records: extractRecords(result.data),
  };
}

async function fetchKafaratplusOperationPagesWithConcurrency({
  fromDate,
  toDate,
  pages,
}: {
  fromDate: string;
  toDate: string;
  pages: number[];
}): Promise<
  | { success: true; records: Record<string, unknown>[]; requestCount: number }
  | {
      success: false;
      code: Exclude<KafaratplusIntegrationStatus, "success">;
      message: string;
      requestCount: number;
    }
> {
  const recordsByPage = new Map<number, Record<string, unknown>[]>();
  let nextIndex = 0;
  let requestCount = 0;

  async function worker() {
    while (nextIndex < pages.length) {
      const page = pages[nextIndex];
      nextIndex += 1;
      const result = await fetchKafaratplusOperationsPage({
        fromDate,
        toDate,
        skip: (page - 1) * kafaratplusOperationsPageSize,
        count: kafaratplusOperationsPageSize,
        page,
      });
      requestCount += 1;

      if (!result.success) return result;
      recordsByPage.set(page, result.records);
    }

    return { success: true as const };
  }

  const workers = Array.from(
    { length: Math.min(kafaratplusPaginationConcurrency, pages.length) },
    () => worker(),
  );
  const results = await Promise.all(workers);
  const failure = results.find((result) => !result.success);
  if (failure && !failure.success) {
    return {
      success: false,
      code: failure.code,
      message: failure.message,
      requestCount,
    };
  }

  return {
    success: true,
    records: pages.flatMap((page) => recordsByPage.get(page) ?? []),
    requestCount,
  };
}

function matchAndClassifyOperations(
  records: Record<string, unknown>[],
  scope: Extract<LocalVehiclePlateScope, { success: true }>,
) {
  const kafaratplusPlates = new Set<string>();
  const matchedPlates = new Set<string>();
  const unmatchedKafaratplusPlates = new Set<string>();
  const fuelOperations: Record<string, unknown>[] = [];
  let nonFuelCount = 0;
  let unverifiedCount = 0;

  for (const record of records) {
    const normalizedPlate = getOperationNormalizedPlate(record);
    if (!normalizedPlate) continue;

    kafaratplusPlates.add(normalizedPlate);
    if (!scope.localVehiclesByPlate.has(normalizedPlate)) {
      unmatchedKafaratplusPlates.add(normalizedPlate);
      continue;
    }

    matchedPlates.add(normalizedPlate);
    const classification = classifyOperation(record);
    if (classification === "fuel") {
      fuelOperations.push(record);
    } else if (classification === "non_fuel") {
      nonFuelCount += 1;
    } else {
      unverifiedCount += 1;
    }
  }

  const localPlates = Array.from(scope.localVehiclesByPlate.keys()).sort();
  const matched = Array.from(matchedPlates).sort();
  const diagnostics = createDiagnostics(localPlates, Array.from(kafaratplusPlates).sort(), matched);
  diagnostics.unmatchedKafaratplusPlates = Array.from(unmatchedKafaratplusPlates).sort();
  diagnostics.fuelDescriptors = Array.from(
    new Set(fuelOperations.map((record) => getOperationDescriptor(record)).filter(Boolean) as string[]),
  ).sort();
  diagnostics.driversFound = scope.diagnostics.driversFound;
  diagnostics.actualPlatesUsed = scope.diagnostics.actualPlatesUsed ?? localPlates;
  diagnostics.matchedDrivers = matched.flatMap((normalizedPlate) => {
    const local = scope.localVehiclesByPlate.get(normalizedPlate);
    if (!local?.driver) return [];
    return [{
      driver: local.driver,
      actualPlate: local.plate,
      kafaratplusPlate: normalizedPlate,
    }];
  });
  diagnostics.unmatchedDrivers = [
    ...(scope.diagnostics.unmatchedDrivers ?? []),
    ...localPlates
      .filter((plate) => !matchedPlates.has(plate))
      .map((plate) => {
        const local = scope.localVehiclesByPlate.get(plate);
        return {
          driver: local?.driver ?? plate,
          actualPlate: local?.plate ?? plate,
          reason: "no Kafaratplus vehicle/operation matched",
        };
      }),
  ];

  if (process.env.NODE_ENV !== "production") {
    console.log("[kafaratplus:fuel:plate_matching]", diagnostics);
  }

  return {
    fuelOperations,
    nonFuelCount,
    unverifiedCount,
    diagnostics,
  };
}

function createDiagnostics(
  localPlates: string[],
  kafaratplusPlates: string[],
  matchedPlates: string[],
): KafaratplusMatchDiagnostics {
  const matched = new Set(matchedPlates);
  const local = new Set(localPlates);

  return {
    localPlates,
    kafaratplusPlates,
    matchedPlates,
    unmatchedLocalPlates: localPlates.filter((plate) => !matched.has(plate)),
    unmatchedKafaratplusPlates: kafaratplusPlates.filter((plate) => !local.has(plate)),
    fuelDescriptors: [],
  };
}

export async function getKafaratplusFuelManagementData({
  organizationId,
  fuelDate,
}: {
  organizationId: string;
  fuelDate: string;
}): Promise<KafaratplusFuelManagementResult> {
  const scope = await getLocalVehiclePlateScope(organizationId);
  if (!scope.success) {
    return integrationState("load_error", scope.diagnostics);
  }

  if (scope.localVehiclesByPlate.size === 0) {
    return {
      status: "success",
      source: "kafaratplus",
      diagnostics: scope.diagnostics,
      rows: [],
    };
  }

  const operations = await fetchAllKafaratplusOperations(
    toKafaratplusStartOfDay(fuelDate),
    toKafaratplusEndOfDay(fuelDate),
  );
  if (!operations.success) {
    return integrationState(operations.code, scope.diagnostics, operations.message);
  }

  const matched = matchAndClassifyOperations(operations.records, scope);
  const rows = createManagementRows(matched.fuelOperations, scope);
  return {
    status: "success",
    source: "kafaratplus",
    diagnostics: matched.diagnostics,
    rows,
  };
}

export async function getKafaratplusFuelReportData({
  organizationId,
  fromDate,
  toDate,
  page = 1,
  pageSize = 50,
}: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  page?: number;
  pageSize?: number;
}): Promise<KafaratplusFuelReportResult> {
  const scope = await getLocalVehiclePlateScope(organizationId);
  if (!scope.success) {
    return integrationState("load_error", scope.diagnostics);
  }

  if (scope.localVehiclesByPlate.size === 0) {
    const diagnostics = scope.diagnostics;
    return {
      status: "success",
      source: "kafaratplus",
      rows: [],
      vehicleSummaries: [],
      totals: { totalQuantity: 0, total: 0, totalPreTax: 0, totalTax: 0 },
      operationsCount: 0,
      diagnostics,
      pagination: { page: 1, pageSize, totalRows: 0, totalPages: 1 },
      fuelClassification: {
        strategy: fuelClassificationStrategy,
        excludedNonFuelCount: 0,
        unverifiedCount: 0,
        totalsAreMatchedOperationsOnly: true,
      },
    };
  }

  const operations = await fetchAllKafaratplusOperations(
    toKafaratplusStartOfDay(fromDate),
    toKafaratplusEndOfDay(toDate),
  );
  if (!operations.success) {
    return integrationState(operations.code, scope.diagnostics, operations.message);
  }

  const matched = matchAndClassifyOperations(operations.records, scope);
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 100);
  const mappedRows = matched.fuelOperations.map((record) =>
    mapKafaratplusOperation(record, scope),
  );
  const totalRows = mappedRows.length;
  const totalPages = Math.max(Math.ceil(totalRows / normalizedPageSize), 1);
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const start = (normalizedPage - 1) * normalizedPageSize;
  const vehicleSummaries = createVehicleSummaries(mappedRows, scope);
  const totals = calculateMatchedTotals(mappedRows);
  return {
    status: "success",
    source: "kafaratplus",
    rows: mappedRows.slice(start, start + normalizedPageSize),
    vehicleSummaries,
    totals,
    operationsCount: totalRows,
    diagnostics: matched.diagnostics,
    pagination: {
      page: Math.min(normalizedPage, totalPages),
      pageSize: normalizedPageSize,
      totalRows,
      totalPages,
    },
    fuelClassification: {
      strategy: fuelClassificationStrategy,
      excludedNonFuelCount: matched.nonFuelCount,
      unverifiedCount: matched.unverifiedCount,
      totalsAreMatchedOperationsOnly: true,
    },
  };
}

export async function getFuelManagementData({
  organizationId,
  fuelDate,
}: {
  organizationId: string;
  fuelDate: string;
}): Promise<
  | { status: "success"; rows: FuelManagementRow[] }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const [driversResult, vehiclesResult, transactionsResult, requestsResult] =
    await Promise.all([
      admin.supabase
        .from("drivers")
        .select(
          "id, full_name, keeta_driver_id, keeta_vehicle_plate_number, organization_id, vehicle_id, vehicle_number, vehicle_type",
        )
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("full_name", { ascending: true }),
      admin.supabase
        .from("fleet_vehicles")
        .select("id, vehicle_type, plate_number, assigned_driver_id, authorized_driver_id")
        .eq("organization_id", organizationId)
        .is("archived_at", null),
      admin.supabase
        .from("fuel_transactions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("fuel_date", fuelDate),
      admin.supabase
        .from("fuel_increase_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("request_date", fuelDate)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

  if (
    driversResult.error ||
    vehiclesResult.error ||
    transactionsResult.error ||
    requestsResult.error
  ) {
    return { status: "load_error", rows: [] };
  }

  const vehiclesByDriverId = mapVehiclesByDriver(
    (vehiclesResult.data ?? []) as FleetVehicleRow[],
    (driversResult.data ?? []) as DriverRow[],
  );
  const transactionsByDriverId = groupByDriver(
    (transactionsResult.data ?? []) as FuelTransactionRow[],
  );
  const pendingRequestsByDriverId = new Map<string, FuelRequestRow>();

  for (const request of (requestsResult.data ?? []) as FuelRequestRow[]) {
    if (!pendingRequestsByDriverId.has(request.driver_id)) {
      pendingRequestsByDriverId.set(request.driver_id, request);
    }
  }

  return {
    status: "success",
    rows: ((driversResult.data ?? []) as DriverRow[]).map((driver) => {
      const vehicle = vehiclesByDriverId.get(driver.id);
      const registeredVehicle = resolveRegisteredDriverVehicle(driver, {
        vehicle: vehicle ?? null,
        vehicleLabel: vehicle?.vehicle_type ?? null,
        vehiclePlate: vehicle?.plate_number ?? null,
      });
      const transactions = transactionsByDriverId.get(driver.id) ?? [];
      const opening = transactions.find(
        (transaction) => transaction.transaction_type === "opening",
      );
      const increases = transactions.filter(
        (transaction) => transaction.transaction_type === "increase",
      );
      const openingAmountSar = amount(opening?.amount_sar);
      const approvedIncreaseAmountSar = increases.reduce(
        (total, transaction) => total + amount(transaction.amount_sar),
        0,
      );
      const pendingRequest = pendingRequestsByDriverId.get(driver.id);

      return {
        driverId: driver.id,
        driverName: driver.full_name,
        driverIdentifier: driver.keeta_driver_id,
        vehicleId: vehicle?.id ?? null,
        vehicleLabel: registeredVehicle.vehicleLabel,
        vehiclePlate: registeredVehicle.vehiclePlate,
        fuelDate,
        openingAmountSar,
        openingCreatedAt: opening?.created_at ?? null,
        approvedIncreaseAmountSar,
        increaseCount: increases.length,
        dailyTotalSar: openingAmountSar + approvedIncreaseAmountSar,
        pendingRequest: pendingRequest
          ? {
              id: pendingRequest.id,
              requestedAmountSar: amount(pendingRequest.requested_amount_sar),
              reason: pendingRequest.reason,
              createdAt: pendingRequest.created_at,
            }
          : null,
      };
    }),
  };
}

export async function getFuelReportData({
  organizationId,
  fromDate,
  toDate,
  page = 1,
  pageSize = 50,
}: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  page?: number;
  pageSize?: number;
}): Promise<
  | {
      status: "success";
      rows: FuelReportRow[];
      pagination: {
        page: number;
        pageSize: number;
        totalRows: number;
        totalPages: number;
      };
    }
  | { status: "unauthorized" | "load_error"; rows: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", rows: [] };
  }

  const [transactionsResult, requestsResult, vehiclesResult] = await Promise.all([
    admin.supabase
      .from("fuel_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("fuel_date", fromDate)
      .lte("fuel_date", toDate)
      .order("fuel_date", { ascending: false })
      .limit(5000),
    admin.supabase
      .from("fuel_increase_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("request_date", fromDate)
      .lte("request_date", toDate)
      .limit(5000),
    admin.supabase
      .from("fleet_vehicles")
      .select("id, vehicle_type, plate_number, assigned_driver_id, authorized_driver_id")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
  ]);

  if (transactionsResult.error || requestsResult.error || vehiclesResult.error) {
    return { status: "load_error", rows: [] };
  }

  const vehiclesById = new Map(
    ((vehiclesResult.data ?? []) as FleetVehicleRow[]).map((vehicle) => [
      vehicle.id,
      vehicle,
    ]),
  );
  const rows = new Map<string, FuelReportAccumulator>();

  for (const transaction of (transactionsResult.data ?? []) as FuelTransactionRow[]) {
    const row =
      rows.get(transaction.driver_id) ?? createReportAccumulator(transaction);

    if (transaction.transaction_type === "opening") {
      row.totalOpeningAmountSar += amount(transaction.amount_sar);
    } else {
      row.totalApprovedIncreaseAmountSar += amount(transaction.amount_sar);
      row.increaseCount += 1;
    }

    row.periodTotalSar =
      row.totalOpeningAmountSar + row.totalApprovedIncreaseAmountSar;
    row.fuelDates.add(transaction.fuel_date);

    if (transaction.vehicle_plate_snapshot) {
      row.vehiclePlate = transaction.vehicle_plate_snapshot;
      row.vehiclePlates.add(transaction.vehicle_plate_snapshot);
      row.hasMultipleVehicles = row.vehiclePlates.size > 1;
    }

    if (transaction.vehicle_id) {
      row.vehicleLabel = vehiclesById.get(transaction.vehicle_id)?.vehicle_type ?? row.vehicleLabel;
    }

    row.activeFuelDays = row.fuelDates.size;
    rows.set(transaction.driver_id, row);
  }

  for (const request of (requestsResult.data ?? []) as FuelRequestRow[]) {
    const row =
      rows.get(request.driver_id) ?? createRequestOnlyAccumulator(request);

    if (request.status === "pending") row.pendingRequestCount += 1;
    if (request.status === "rejected") row.rejectedRequestCount += 1;

    if (request.vehicle_plate_snapshot) {
      row.vehiclePlate = request.vehicle_plate_snapshot;
      row.vehiclePlates.add(request.vehicle_plate_snapshot);
      row.hasMultipleVehicles = row.vehiclePlates.size > 1;
    }

    if (request.vehicle_id) {
      row.vehicleLabel = vehiclesById.get(request.vehicle_id)?.vehicle_type ?? row.vehicleLabel;
    }

    rows.set(request.driver_id, row);
  }

  const reportRows = Array.from(rows.values());
  await applyCurrentDriverVehicles(admin.supabase, organizationId, reportRows);

  const sortedRows = reportRows
    .map(stripAccumulatorFields)
    .sort((first, second) => first.driverName.localeCompare(second.driverName));
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 100);
  const totalRows = sortedRows.length;
  const totalPages = Math.max(Math.ceil(totalRows / normalizedPageSize), 1);
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const start = (normalizedPage - 1) * normalizedPageSize;

  return {
    status: "success",
    rows: sortedRows.slice(start, start + normalizedPageSize),
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalRows,
      totalPages,
    },
  };
}

export async function getFuelReportDetailsData({
  organizationId,
  driverId,
  fromDate,
  toDate,
}: {
  organizationId: string;
  driverId: string;
  fromDate: string;
  toDate: string;
}): Promise<
  | { status: "success"; details: FuelReportDetails }
  | { status: "unauthorized" | "load_error"; details: null }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", details: null };
  }

  const [transactionsResult, requestsResult] = await Promise.all([
    admin.supabase
      .from("fuel_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .gte("fuel_date", fromDate)
      .lte("fuel_date", toDate)
      .order("created_at", { ascending: true }),
    admin.supabase
      .from("fuel_increase_requests")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("driver_id", driverId)
      .gte("request_date", fromDate)
      .lte("request_date", toDate)
      .order("created_at", { ascending: true }),
  ]);

  if (transactionsResult.error || requestsResult.error) {
    return { status: "load_error", details: null };
  }

  const transactions = (transactionsResult.data ?? []) as FuelTransactionRow[];
  const requests = (requestsResult.data ?? []) as FuelRequestRow[];
  const actorIds = new Set<string>();

  for (const transaction of transactions) {
    actorIds.add(transaction.created_by);
  }

  for (const request of requests) {
    if (request.reviewed_by) {
      actorIds.add(request.reviewed_by);
    }
  }

  const actorsById = await getActorsById(admin.supabase, actorIds);
  const transactionByRequestId = new Map<string, FuelTransactionRow>();

  for (const transaction of transactions) {
    if (transaction.related_request_id) {
      transactionByRequestId.set(transaction.related_request_id, transaction);
    }
  }

  const itemsByDate = new Map<string, FuelReportDetailItem[]>();

  for (const request of requests) {
    const approvedTransaction = transactionByRequestId.get(request.id);

    pushDetailItem(itemsByDate, request.request_date, {
      id: `${request.id}:submitted`,
      type:
        request.status === "pending"
          ? "requested_increase_pending"
          : "requested_increase_submitted",
      amountSar: null,
      requestedAmountSar: amount(request.requested_amount_sar),
      approvedAmountSar: null,
      reason: request.reason,
      note: null,
      source: "request",
      occurredAt: request.created_at,
      actor: null,
    });

    if (request.status === "approved" && request.reviewed_at) {
      pushDetailItem(itemsByDate, request.request_date, {
        id: `${request.id}:approved`,
        type: "requested_increase_approved",
        amountSar: amount(approvedTransaction?.amount_sar),
        requestedAmountSar: amount(request.requested_amount_sar),
        approvedAmountSar: amount(request.approved_amount_sar),
        reason: request.reason,
        note: request.review_note,
        source: "request",
        occurredAt: request.reviewed_at,
        actor: getActor(actorsById, request.reviewed_by),
      });
    }

    if (request.status === "rejected" && request.reviewed_at) {
      pushDetailItem(itemsByDate, request.request_date, {
        id: `${request.id}:rejected`,
        type: "requested_increase_rejected",
        amountSar: null,
        requestedAmountSar: amount(request.requested_amount_sar),
        approvedAmountSar: null,
        reason: request.reason,
        note: request.review_note,
        source: "request",
        occurredAt: request.reviewed_at,
        actor: getActor(actorsById, request.reviewed_by),
      });
    }
  }

  for (const transaction of transactions) {
    if (transaction.related_request_id) {
      continue;
    }

    pushDetailItem(itemsByDate, transaction.fuel_date, {
      id: transaction.id,
      type:
        transaction.transaction_type === "opening"
          ? "opening"
          : "manual_increase",
      amountSar: amount(transaction.amount_sar),
      requestedAmountSar: null,
      approvedAmountSar: null,
      reason: null,
      note: transaction.note,
      source: "transaction",
      occurredAt: transaction.created_at,
      actor: getActor(actorsById, transaction.created_by),
    });
  }

  const days = Array.from(itemsByDate.entries())
    .map(([fuelDate, items]) =>
      createDetailDay(
        fuelDate,
        items,
        transactions.filter((transaction) => transaction.fuel_date === fuelDate),
      ),
    )
    .sort((first, second) => second.fuelDate.localeCompare(first.fuelDate));

  const periodTotal = days.reduce(
    (total, day) => total + day.dailyTotalSar,
    0,
  );

  if (process.env.NODE_ENV !== "production") {
    const transactionTotal = transactions.reduce(
      (total, transaction) => total + amount(transaction.amount_sar),
      0,
    );

    if (Math.abs(periodTotal - transactionTotal) > 0.001) {
      console.error("[fuel:report-details:total-mismatch]", {
        driverId,
        fromDate,
        toDate,
        periodTotal,
        transactionTotal,
      });
    }
  }

  return {
    status: "success",
    details: {
      organizationId,
      driverId,
      fromDate,
      toDate,
      days,
    },
  };
}

function pushDetailItem(
  itemsByDate: Map<string, FuelReportDetailItem[]>,
  fuelDate: string,
  item: FuelReportDetailItem,
) {
  const items = itemsByDate.get(fuelDate) ?? [];
  items.push(item);
  itemsByDate.set(fuelDate, items);
}

function createDetailDay(
  fuelDate: string,
  items: FuelReportDetailItem[],
  transactions: FuelTransactionRow[],
): FuelReportDetailDay {
  const openingAmountSar = transactions
    .filter((transaction) => transaction.transaction_type === "opening")
    .reduce((total, transaction) => total + amount(transaction.amount_sar), 0);
  const approvedIncreaseAmountSar = transactions
    .filter((transaction) => transaction.transaction_type === "increase")
    .reduce((total, transaction) => total + amount(transaction.amount_sar), 0);
  const vehiclePlate =
    transactions.find((transaction) => transaction.vehicle_plate_snapshot)
      ?.vehicle_plate_snapshot ?? null;

  return {
    fuelDate,
    vehiclePlate,
    openingAmountSar,
    approvedIncreaseAmountSar,
    dailyTotalSar: openingAmountSar + approvedIncreaseAmountSar,
    items: items.sort(
      (first, second) =>
        new Date(first.occurredAt).getTime() -
        new Date(second.occurredAt).getTime(),
    ),
  };
}

function createReportAccumulator(
  transaction: FuelTransactionRow,
): FuelReportAccumulator {
  const vehiclePlates = new Set<string>();

  if (transaction.vehicle_plate_snapshot) {
    vehiclePlates.add(transaction.vehicle_plate_snapshot);
  }

  return {
    key: transaction.driver_id,
    driverId: transaction.driver_id,
    driverName: transaction.driver_name_snapshot,
    driverIdentifier: transaction.driver_identifier_snapshot,
    vehicleLabel: null,
    vehiclePlate: transaction.vehicle_plate_snapshot,
    hasMultipleVehicles: false,
    activeFuelDays: 0,
    totalOpeningAmountSar: 0,
    totalApprovedIncreaseAmountSar: 0,
    increaseCount: 0,
    pendingRequestCount: 0,
    rejectedRequestCount: 0,
    periodTotalSar: 0,
    fuelDates: new Set<string>(),
    vehiclePlates,
  };
}

async function applyCurrentDriverVehicles(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  rows: FuelReportAccumulator[],
) {
  const driverIds = Array.from(new Set(rows.map((row) => row.driverId)));

  if (driverIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("drivers")
    .select(
        "id, organization_id, full_name, keeta_driver_id, vehicle_id, vehicle_type, vehicle_number, keeta_vehicle_plate_number",
    )
    .eq("organization_id", organizationId)
    .in("id", driverIds);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[fuel:reports:driver-vehicle-load-failed]", {
        code: error.code,
        message: error.message,
      });
    }

    return;
  }

  const driversById = new Map(
    ((data ?? []) as FuelReportDriverRow[]).map((driver) => [
      driver.id,
      driver,
    ]),
  );
  const vehicleIds = Array.from(new Set(Array.from(driversById.values()).map((driver) => driver.vehicle_id).filter(Boolean))) as string[];
  const { data: vehicleRows } = vehicleIds.length
    ? await supabase.from("fleet_vehicles").select("id, vehicle_type, plate_number, normalized_plate_number, assigned_driver_id, authorized_driver_id, organization_id, assigned_organization_id").in("id", vehicleIds).is("archived_at", null)
    : { data: [] };
  const vehiclesById = new Map(((vehicleRows ?? []) as FleetVehicleRow[]).map((vehicle) => [vehicle.id, vehicle]));

  for (const row of rows) {
    const driver = driversById.get(row.driverId);

    if (!driver) {
      continue;
    }

    row.driverName = driver.full_name;
    row.driverIdentifier = driver.keeta_driver_id;
    const registeredVehicle = resolveRegisteredDriverVehicle(driver, {
      vehicle: driver.vehicle_id ? vehiclesById.get(driver.vehicle_id) ?? null : null,
      vehicleLabel: row.vehicleLabel,
      vehiclePlate: row.vehiclePlate,
    });

    row.vehicleLabel = registeredVehicle.vehicleLabel;
    row.vehiclePlate = registeredVehicle.vehiclePlate;
  }
}

function resolveRegisteredDriverVehicle(
  driver: Pick<
    FuelReportDriverRow,
    "keeta_vehicle_plate_number" | "vehicle_type"
  >,
  fallback: {
    vehicle: FleetVehicleRow | null;
    vehicleLabel: string | null;
    vehiclePlate: string | null;
  },
) {
  return {
    vehicleLabel: fallback.vehicle?.vehicle_type ?? fallback.vehicleLabel ?? driver.vehicle_type,
    vehiclePlate:
      fallback.vehicle?.plate_number ?? driver.keeta_vehicle_plate_number ?? fallback.vehiclePlate,
  };
}

function createRequestOnlyAccumulator(
  request: FuelRequestRow,
): FuelReportAccumulator {
  const vehiclePlates = new Set<string>();

  if (request.vehicle_plate_snapshot) {
    vehiclePlates.add(request.vehicle_plate_snapshot);
  }

  return {
    key: request.driver_id,
    driverId: request.driver_id,
    driverName: "-",
    driverIdentifier: null,
    vehicleLabel: null,
    vehiclePlate: request.vehicle_plate_snapshot,
    hasMultipleVehicles: false,
    activeFuelDays: 0,
    totalOpeningAmountSar: 0,
    totalApprovedIncreaseAmountSar: 0,
    increaseCount: 0,
    pendingRequestCount: 0,
    rejectedRequestCount: 0,
    periodTotalSar: 0,
    fuelDates: new Set<string>(),
    vehiclePlates,
  };
}

function stripAccumulatorFields(row: FuelReportAccumulator): FuelReportRow {
  return {
    key: row.key,
    driverId: row.driverId,
    driverName: row.driverName,
    driverIdentifier: row.driverIdentifier,
    vehicleLabel: row.vehicleLabel,
    vehiclePlate: row.vehiclePlate,
    hasMultipleVehicles: row.hasMultipleVehicles,
    activeFuelDays: row.activeFuelDays,
    totalOpeningAmountSar: row.totalOpeningAmountSar,
    totalApprovedIncreaseAmountSar: row.totalApprovedIncreaseAmountSar,
    increaseCount: row.increaseCount,
    pendingRequestCount: row.pendingRequestCount,
    rejectedRequestCount: row.rejectedRequestCount,
    periodTotalSar: row.periodTotalSar,
  };
}

function mapVehiclesByDriver(vehicles: FleetVehicleRow[], drivers: DriverRow[]) {
  const map = new Map<string, FleetVehicleRow>();
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  for (const driver of drivers) {
    const vehicle = driver.vehicle_id ? vehiclesById.get(driver.vehicle_id) : undefined;
    if (vehicle) map.set(driver.id, vehicle);
  }

  return map;
}

function groupByDriver(transactions: FuelTransactionRow[]) {
  const map = new Map<string, FuelTransactionRow[]>();

  for (const transaction of transactions) {
    const group = map.get(transaction.driver_id) ?? [];
    group.push(transaction);
    map.set(transaction.driver_id, group);
  }

  return map;
}

function amount(value: string | number | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function getActorsById(
  supabase: SupabaseClient<Database>,
  actorIds: Set<string>,
) {
  if (actorIds.size === 0) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, job_title")
    .in("id", Array.from(actorIds));

  if (error) {
    return new Map<string, ProfileRow>();
  }

  return new Map((data as ProfileRow[]).map((profile) => [profile.id, profile]));
}

function getActor(actorsById: Map<string, ProfileRow>, actorId: string | null) {
  if (!actorId) {
    return null;
  }

  const actor = actorsById.get(actorId);

  if (!actor) {
    return null;
  }

  return {
    displayName: actor.full_name,
    role: actor.role,
    jobTitle: actor.job_title,
  };
}

function integrationState(
  status: Exclude<KafaratplusFuelManagementResult["status"], "success">,
  diagnostics?: KafaratplusMatchDiagnostics,
  message = getIntegrationMessage(status),
) {
  return {
    status,
    source: "kafaratplus" as const,
    diagnostics,
    rows: [] as [],
    message,
  };
}

function getIntegrationMessage(status: Exclude<KafaratplusFuelManagementResult["status"], "success">) {
  const messages: Record<typeof status, string> = {
    not_configured: "لم يتم العثور على مركبات محلية مطابقة لهذا النطاق.",
    missing_credentials: "إعدادات تكامل Kafaratplus غير مكتملة على الخادم.",
    unauthorized: "بيانات تكامل Kafaratplus غير صحيحة أو غير مفعلة.",
    bad_request: "رفض Kafaratplus الطلب. تحقق من إعدادات التكامل.",
    timeout: "انتهت مهلة الاتصال مع Kafaratplus. حاول مرة أخرى.",
    network_error: "تعذر الاتصال بخدمة Kafaratplus.",
    malformed_response: "استجابة Kafaratplus غير قابلة للقراءة.",
    api_error: "تعذر تحميل بيانات Kafaratplus.",
    load_error: "تعذر تحميل بيانات الوقود.",
  };

  return messages[status];
}

function extractRecords(response: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    response.data,
    getNested(response, ["data", "items"]),
    getNested(response, ["data", "records"]),
    getNested(response, ["data", "rows"]),
    getNested(response, ["items"]),
    getNested(response, ["records"]),
    getNested(response, ["rows"]),
    getNested(response, ["result"]),
    getNested(response, ["result", "items"]),
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  return [];
}

function extractTotalCount(response: Record<string, unknown>) {
  const candidates = [
    response.count,
    response.total,
    response.totalCount,
    response.recordsTotal,
    getNested(response, ["data", "count"]),
    getNested(response, ["data", "total"]),
    getNested(response, ["data", "totalCount"]),
    getNested(response, ["result", "count"]),
    getNested(response, ["result", "total"]),
    getNested(response, ["result", "totalCount"]),
    getNested(response, ["pagination", "total"]),
    getNested(response, ["pagination", "totalCount"]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      return candidate;
    }
    if (
      typeof candidate === "string" &&
      candidate.trim() &&
      Number.isFinite(Number(candidate)) &&
      Number(candidate) >= 0
    ) {
      return Number(candidate);
    }
  }

  return null;
}

function mapKafaratplusOperation(
  record: Record<string, unknown>,
  scope?: Extract<LocalVehiclePlateScope, { success: true }>,
): KafaratplusFuelOperationRow {
  const item = getFirstItem(record);
  const local = scope?.localVehiclesByPlate.get(getOperationNormalizedPlate(record));
  const kafaratplusDriver = stringFrom(record, [
    "customerEmployee.name",
    "customerEmployee.fullName",
    "driver",
    "driverName",
    "customerEmployee",
  ]);
  return {
    key: stringFrom(record, ["_id", "id", "operationId", "orderId", "orderNumber", "operationNumber"]) ?? stableKey(record),
    operationNumber: stringFrom(record, ["operationNumber", "orderNumber", "invoiceNumber", "_id", "id"]),
    date: stringFrom(record, ["createdTime", "date", "createdAt", "deliveredAt", "operationDate", "orderDate"]),
    driver: local?.driver ?? kafaratplusDriver,
    localDriverId: local?.driverId ?? null,
    localDriverIqama: local?.driverIqama ?? null,
    kafaratplusDriver,
    vehicle: stringFrom(record, ["customerVehicle.name", "customerVehicle.number", "vehicle", "vehicleName", "vehicleNumber", "vehicle.name"]) ?? local?.vehicle ?? null,
    nfcIdentifier: stringFrom(record, [
      "customerVehicle.NFCSerialNumber",
      "customerVehicle.nfcIdentifier",
      "NFCSerialNumber",
      "nfcIdentifier",
    ]),
    licencePlate: local?.plate ?? getOperationDisplayPlate(record),
    brandModel: joinNonEmpty([
      stringFrom(record, ["customerVehicle.brand.name", "customerVehicle.brand", "brand", "vehicleBrand", "vehicle.brand"]),
      stringFrom(record, ["customerVehicle.model.name", "customerVehicle.model", "model", "vehicleModel", "vehicle.model"]),
    ]),
    odometer: stringFrom(record, ["odometer", "odometerReading", "operationOdometer", "customerVehicle.odometer"]),
    branch: stringFrom(record, ["customerBranch.name", "customerBranch", "branch", "branchName", "branch.name"]),
    provider: stringFrom(record, ["provider.name", "provider", "providerName", "station", "stationName"]),
    paymentMethod: stringFrom(record, ["paymentMethod.name", "paymentMethod", "paymentType", "paymentMethodName"]),
    item: getOperationDescriptor(record),
    quantity: getOperationQuantity(record),
    unitPrice: numberFrom(item, ["unitPrice", "price", "unit_price"]) ?? numberFrom(record, ["unitPrice", "price", "unit_price"]),
    total: numberFrom(record, ["total", "totalMoney", "amount", "totalAmount"]),
    tax: numberFrom(record, ["tax", "vat", "taxAmount", "vatAmount"]),
    invoiceAvailable: booleanFrom(record, ["hasInvoice", "invoiceAvailable", "invoiceUrl", "invoiceId"]),
  };
}

function createManagementRows(
  records: Record<string, unknown>[],
  scope: Extract<LocalVehiclePlateScope, { success: true }>,
): KafaratplusFuelManagementRow[] {
  const byPlate = groupRecordsByNormalizedPlate(records);

  return Array.from(byPlate.entries())
    .map(([normalizedPlate, plateRecords]) => {
      const local = scope.localVehiclesByPlate.get(normalizedPlate);
      const operations = plateRecords
        .map((record) => mapKafaratplusOperation(record, scope))
        .sort(compareOperationRowsDescending);
      const latest = operations[0] ?? null;

      return {
        key: normalizedPlate,
        localDriver: local?.driver ?? null,
        localDriverId: local?.driverId ?? null,
        localDriverIqama: local?.driverIqama ?? null,
        kafaratplusDriver: latest?.kafaratplusDriver ?? null,
        vehicle: latest?.vehicle ?? local?.vehicle ?? null,
        licencePlate: latest?.licencePlate ?? local?.plate ?? normalizedPlate,
        branch: latest?.branch ?? null,
        brandModel: latest?.brandModel ?? null,
        operationCount: operations.length,
        totalQuantity: sumRows(operations, "quantity"),
        total: sumRows(operations, "total"),
        fuelProducts: Array.from(new Set(operations.map((operation) => operation.item).filter(Boolean) as string[])),
        latestOdometer: latest?.odometer ?? null,
        latestProvider: latest?.provider ?? null,
        nfcIdentifier: stringFrom(plateRecords[0], [
          "customerVehicle.NFCSerialNumber",
          "customerVehicle.nfcIdentifier",
          "NFCSerialNumber",
          "nfcIdentifier",
        ]),
        operations,
      };
    })
    .sort((first, second) => first.licencePlate.localeCompare(second.licencePlate));
}

function createVehicleSummaries(
  rows: KafaratplusFuelOperationRow[],
  scope: Extract<LocalVehiclePlateScope, { success: true }>,
) {
  const byPlate = new Map<string, KafaratplusFuelOperationRow[]>();

  for (const row of rows) {
    const normalizedPlate = normalizePlateForFleet(row.licencePlate ?? "");
    if (!normalizedPlate) continue;

    const group = byPlate.get(normalizedPlate) ?? [];
    group.push(row);
    byPlate.set(normalizedPlate, group);
  }

  return Array.from(byPlate.entries())
    .map(([normalizedPlate, operations]) => {
      const local = scope.localVehiclesByPlate.get(normalizedPlate);
      const total = sumRows(operations, "total");
      return {
        key: normalizedPlate,
        driver: local?.driver ?? operations[0]?.driver ?? null,
        driverId: local?.driverId ?? operations[0]?.localDriverId ?? null,
        driverIqama: local?.driverIqama ?? operations[0]?.localDriverIqama ?? null,
        plate: operations[0]?.licencePlate ?? local?.plate ?? normalizedPlate,
        vehicle: operations[0]?.vehicle ?? local?.vehicle ?? null,
        operationCount: operations.length,
        totalQuantity: sumRows(operations, "quantity"),
        total,
        averageCostPerOperation: operations.length > 0 ? total / operations.length : null,
      };
    })
    .sort((first, second) => first.plate.localeCompare(second.plate));
}

function calculateMatchedTotals(rows: KafaratplusFuelOperationRow[]) {
  const total = sumRows(rows, "total");
  const totalTax = sumRows(rows, "tax");
  const itemPreTax = rows.reduce((sum, row) => {
    if (row.total !== null && row.tax !== null) return sum + row.total - row.tax;
    return sum;
  }, 0);

  return {
    totalQuantity: sumRows(rows, "quantity"),
    total,
    totalPreTax: itemPreTax || total,
    totalTax,
  };
}

function groupRecordsByNormalizedPlate(records: Record<string, unknown>[]) {
  const byPlate = new Map<string, Record<string, unknown>[]>();

  for (const record of records) {
    const normalizedPlate = getOperationNormalizedPlate(record);
    if (!normalizedPlate) continue;

    const group = byPlate.get(normalizedPlate) ?? [];
    group.push(record);
    byPlate.set(normalizedPlate, group);
  }

  return byPlate;
}

function getOperationNormalizedPlate(record: Record<string, unknown>) {
  return normalizePlateForFleet(getOperationDisplayPlate(record) ?? "");
}

function getOperationDisplayPlate(record: Record<string, unknown>) {
  return stringFrom(record, [
    "customerVehicle.licencePlateNumber.en",
    "customerVehicle.licencePlateNumber.ar",
    "customerVehicle.licencePlateNumber",
    "customerVehicle.licencePlate",
    "licencePlateNumber.en",
    "licencePlateNumber.ar",
    "licencePlateNumber",
    "licencePlate",
    "licensePlate",
    "plateNumber",
    "plate",
    "vehiclePlate",
  ]);
}

function getOperationQuantity(record: Record<string, unknown>) {
  const items = record.items;
  if (Array.isArray(items)) {
    const total = items.reduce((sum, item) => {
      return isRecord(item)
        ? sum + (numberFrom(item, ["quantity", "qty", "totalQuantity"]) ?? 0)
        : sum;
    }, 0);

    if (total > 0) return total;
  }

  return numberFrom(record, ["quantity", "qty", "totalQuantity"]);
}

function sumRows(
  rows: KafaratplusFuelOperationRow[],
  key: "quantity" | "total" | "tax",
) {
  return rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
}

function compareOperationRowsDescending(
  first: KafaratplusFuelOperationRow,
  second: KafaratplusFuelOperationRow,
) {
  return getOperationTime(second) - getOperationTime(first);
}

function getOperationTime(row: KafaratplusFuelOperationRow) {
  if (!row.date) return 0;
  const time = new Date(row.date).getTime();
  return Number.isFinite(time) ? time : 0;
}

function classifyOperation(record: Record<string, unknown>) {
  const descriptor = getOperationDescriptor(record)?.toLowerCase() ?? "";
  if (!descriptor) return "unknown";

  const nonFuelTerms = ["maintenance", "oil change", "parts", "repair", "غيار", "صيانة", "زيت"];
  if (nonFuelTerms.some((term) => descriptor.includes(term))) {
    return "non_fuel";
  }

  const fuelTerms = ["fuel", "gasoline", "petrol", "diesel", "بنزين", "ديزل", "وقود"];
  if (fuelTerms.some((term) => descriptor.includes(term))) {
    return "fuel";
  }

  return "unknown";
}

function getOperationDescriptor(record: Record<string, unknown>) {
  const item = getFirstItem(record);
  return joinNonEmpty([
    stringFrom(item, ["product.name.en", "product.name.ar", "item.name.en", "item.name.ar", "name.en", "name.ar"]),
    stringFrom(item, ["product.category.name.en", "product.category.name.ar"]),
    stringFrom(item, ["product.category.code.en", "product.category.code.ar", "product.category.code"]),
    stringFrom(item, ["product.category.parent.name.en", "product.category.parent.name.ar"]),
    stringFrom(item, ["product.category.type.name.en", "product.category.type.name.ar", "product.category.type.code"]),
    stringFrom(record, ["item", "itemName", "product", "productName", "service", "serviceName"]),
    stringFrom(item, ["item.name", "item", "product.name", "product", "name", "productName", "serviceName"]),
    stringFrom(record, ["category", "categoryName", "productCategory", "product.category"]),
    stringFrom(item, ["category.name", "category", "productCategory.name", "product.category.name"]),
    stringFrom(record, ["fuelType", "fuelTypeName"]),
    stringFrom(item, ["fuelType", "fuelTypeName"]),
  ]);
}

function getFirstItem(record: Record<string, unknown>) {
  const items = record.items;
  if (Array.isArray(items) && isRecord(items[0])) {
    return items[0];
  }

  return {};
}

function stringFrom(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getNested(record, key.split("."));
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }

  return null;
}

function numberFrom(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getNested(record, key.split("."));
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function booleanFrom(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getNested(record, key.split("."));
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && value.trim()) return true;
    if (typeof value === "number") return value > 0;
  }

  return null;
}

function getNested(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;

  for (const part of path) {
    if (!isRecord(current)) return null;
    current = current[part];
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableKey(record: Record<string, unknown>) {
  return JSON.stringify(record).slice(0, 160);
}

function joinNonEmpty(values: Array<string | null>) {
  const joined = values.filter(Boolean).join(" / ");
  return joined || null;
}
