import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getKafaratplusFuelOperationDate,
  getKafaratplusFuelOperationRowsForRange,
} from "@/features/fuel/queries";
import { normalizePlateForFleet } from "@/features/fleet/validation";
import type { Database } from "@/types/database";

type DriverFuelMetric = {
  dailyFuelQuantityLitres: number;
  dailyFuelAmountSar: number;
  monthlyFuelQuantityLitres: number;
  monthlyFuelAmountSar: number;
};

export type DriverFuelMetricsResult =
  | {
      available: true;
      dailyRange: FuelPeriod;
      monthlyRange: FuelPeriod;
      metricsByDriverId: Map<string, DriverFuelMetric>;
    }
  | {
      available: false;
      dailyRange: FuelPeriod;
      monthlyRange: FuelPeriod;
      metricsByDriverId: Map<string, DriverFuelMetric>;
    };

export type FuelPeriod = {
  fromDate: string;
  toDate: string;
};

type DriverFuelPlateRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "vehicle_number" | "nfc_number"
>;

type DriverIdentityLookups = {
  driverIdsByPlate: Map<string, string>;
  driverIdsByNfc: Map<string, string>;
};

const riyadhUtcOffsetHours = 3;
const millisecondsPerDay = 86_400_000;

export async function getDriverFuelMetricsForReport({
  organizationId,
  reportDate,
  driverIds,
  supabase,
}: {
  organizationId: string;
  reportDate: string;
  driverIds: string[];
  supabase: SupabaseClient<Database>;
}): Promise<DriverFuelMetricsResult> {
  const dailyRange = getRiyadhDayUtcRange(reportDate);
  const monthlyRange = getFuelMonthToReportDateRange(reportDate);
  const metricsByDriverId = createEmptyMetrics(driverIds);

  if (driverIds.length === 0) {
    return { available: true, dailyRange, monthlyRange, metricsByDriverId };
  }

  const uniqueDriverIds = Array.from(new Set(driverIds));
  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id, vehicle_number, nfc_number")
    .eq("organization_id", organizationId)
    .in("id", uniqueDriverIds)
    .is("deleted_at", null);

  if (driversError) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[driver-reports:fuel-metrics:driver-plates-load-failed]", {
        code: driversError.code,
        message: driversError.message,
      });
    }

    return { available: false, dailyRange, monthlyRange, metricsByDriverId };
  }

  const { driverIdsByPlate, driverIdsByNfc } = createDriverIdentityLookups(
    (drivers ?? []) as DriverFuelPlateRow[],
  );

  if (driverIdsByPlate.size === 0 && driverIdsByNfc.size === 0) {
    return { available: true, dailyRange, monthlyRange, metricsByDriverId };
  }

  const fuelRows = await getKafaratplusFuelOperationRowsForRange({
    fromDate: monthlyRange.fromDate,
    toDate: monthlyRange.toDate,
  });

  if (fuelRows.status !== "success") {
    if (process.env.NODE_ENV !== "production") {
      console.error("[driver-reports:fuel-metrics:kafaratplus-load-failed]", {
        status: fuelRows.status,
        message: fuelRows.message,
      });
    }

    return { available: false, dailyRange, monthlyRange, metricsByDriverId };
  }

  for (const row of fuelRows.rows) {
    const driverId = resolveDriverIdForFuelOperation(row, {
      driverIdsByPlate,
      driverIdsByNfc,
    });

    if (!driverId) {
      continue;
    }

    const metric = metricsByDriverId.get(driverId);

    if (!metric) {
      continue;
    }

    const amount = row.total ?? 0;
    const quantity = row.quantity ?? 0;
    metric.monthlyFuelAmountSar += amount;
    metric.monthlyFuelQuantityLitres += quantity;

    if (getKafaratplusFuelOperationDate(row) === reportDate) {
      metric.dailyFuelAmountSar += amount;
      metric.dailyFuelQuantityLitres += quantity;
    }
  }

  return { available: true, dailyRange, monthlyRange, metricsByDriverId };
}

function createEmptyMetrics(driverIds: string[]) {
  const metrics = new Map<string, DriverFuelMetric>();

  for (const driverId of driverIds) {
    metrics.set(driverId, {
      dailyFuelQuantityLitres: 0,
      dailyFuelAmountSar: 0,
      monthlyFuelQuantityLitres: 0,
      monthlyFuelAmountSar: 0,
    });
  }

  return metrics;
}

function createDriverIdentityLookups(
  drivers: DriverFuelPlateRow[],
): DriverIdentityLookups {
  const driverIdsByPlate = new Map<string, string>();
  const ambiguousPlates = new Set<string>();
  const driverIdsByNfc = new Map<string, string>();
  const ambiguousNfcs = new Set<string>();

  for (const driver of drivers) {
    const normalizedPlate = normalizePlateForFleet(driver.vehicle_number);
    const normalizedNfc = normalizeNfcIdentifier(driver.nfc_number);

    addUniqueLookupValue({
      ambiguousValues: ambiguousPlates,
      driverId: driver.id,
      lookup: driverIdsByPlate,
      value: normalizedPlate,
    });
    addUniqueLookupValue({
      ambiguousValues: ambiguousNfcs,
      driverId: driver.id,
      lookup: driverIdsByNfc,
      value: normalizedNfc,
    });
  }

  return { driverIdsByPlate, driverIdsByNfc };
}

function addUniqueLookupValue({
  ambiguousValues,
  driverId,
  lookup,
  value,
}: {
  ambiguousValues: Set<string>;
  driverId: string;
  lookup: Map<string, string>;
  value: string;
}) {
  if (!value || ambiguousValues.has(value)) {
    return;
  }

  const existingDriverId = lookup.get(value);

  if (!existingDriverId) {
    lookup.set(value, driverId);
    return;
  }

  if (existingDriverId !== driverId) {
    lookup.delete(value);
    ambiguousValues.add(value);
  }
}

function resolveDriverIdForFuelOperation(
  operation: {
    licencePlate: string | null;
    nfcIdentifier: string | null;
  },
  lookups: DriverIdentityLookups,
) {
  const plateMatch = lookups.driverIdsByPlate.get(
    normalizePlateForFleet(operation.licencePlate),
  );
  const nfcMatch = lookups.driverIdsByNfc.get(
    normalizeNfcIdentifier(operation.nfcIdentifier),
  );

  if (plateMatch && nfcMatch) {
    return plateMatch === nfcMatch ? plateMatch : null;
  }

  return plateMatch ?? nfcMatch ?? null;
}

function normalizeNfcIdentifier(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).normalize("NFKC").trim();
}

export function getMonthToDateRange(date: string): FuelPeriod {
  const [year, month] = date.split("-");
  const selectedMonth = `${year}-${month}`;

  return {
    fromDate: `${selectedMonth}-01`,
    toDate: getLastDateOfMonth(Number(year), Number(month)),
  };
}

function getLastDateOfMonth(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 0));
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

function getFuelMonthToReportDateRange(date: string): FuelPeriod {
  const [year, month] = date.split("-");
  const selectedMonth = `${year}-${month}`;

  return {
    fromDate: getRiyadhDayUtcRange(`${selectedMonth}-01`).fromDate,
    toDate: getRiyadhDayUtcRange(date).toDate,
  };
}

function getRiyadhDayUtcRange(date: string): FuelPeriod {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(
    Date.UTC(year, month - 1, day, -riyadhUtcOffsetHours, 0, 0, 0),
  );
  const end = new Date(start.getTime() + millisecondsPerDay - 1);

  return {
    fromDate: start.toISOString(),
    toDate: end.toISOString(),
  };
}
