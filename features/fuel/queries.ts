import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  FuelManagementRow,
  FuelReportDetailDay,
  FuelReportDetails,
  FuelReportDetailItem,
  FuelReportRow,
} from "@/features/fuel/types";
import type { Database } from "@/types/database";

type DriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "full_name"
  | "keeta_driver_id"
  | "keeta_vehicle_plate_number"
  | "organization_id"
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
  | "vehicle_number"
  | "vehicle_type"
>;
type FleetVehicleRow = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  "id" | "vehicle_type" | "plate_number" | "assigned_driver_id" | "authorized_driver_id"
>;
type FuelTransactionRow =
  Database["public"]["Tables"]["fuel_transactions"]["Row"];
type FuelRequestRow =
  Database["public"]["Tables"]["fuel_increase_requests"]["Row"];
type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "role" | "job_title"
>;

type FuelReportAccumulator = FuelReportRow & {
  fuelDates: Set<string>;
  vehiclePlates: Set<string>;
};

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
          "id, full_name, keeta_driver_id, keeta_vehicle_plate_number, organization_id, vehicle_number, vehicle_type",
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
      "id, organization_id, full_name, keeta_driver_id, vehicle_type, vehicle_number, keeta_vehicle_plate_number",
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

  for (const row of rows) {
    const driver = driversById.get(row.driverId);

    if (!driver) {
      continue;
    }

    row.driverName = driver.full_name;
    row.driverIdentifier = driver.keeta_driver_id;
    const registeredVehicle = resolveRegisteredDriverVehicle(driver, {
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
    "keeta_vehicle_plate_number" | "vehicle_number" | "vehicle_type"
  >,
  fallback: {
    vehicleLabel: string | null;
    vehiclePlate: string | null;
  },
) {
  return {
    vehicleLabel: driver.vehicle_type ?? fallback.vehicleLabel,
    vehiclePlate:
      driver.keeta_vehicle_plate_number ??
      driver.vehicle_number ??
      fallback.vehiclePlate,
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

function mapVehiclesByDriver(vehicles: FleetVehicleRow[]) {
  const map = new Map<string, FleetVehicleRow>();

  for (const vehicle of vehicles) {
    for (const driverId of [
      vehicle.assigned_driver_id,
      vehicle.authorized_driver_id,
    ]) {
      if (driverId && !map.has(driverId)) {
        map.set(driverId, vehicle);
      }
    }
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
