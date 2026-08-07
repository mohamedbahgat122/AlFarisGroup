import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DriverFuelMetric = {
  dailyFuelQuantityLitres: number;
  dailyFuelAmountSar: number;
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

type FuelTransactionMetricRow = Pick<
  Database["public"]["Tables"]["fuel_transactions"]["Row"],
  "driver_id" | "amount_sar" | "fuel_date"
>;

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
  const dailyRange = { fromDate: reportDate, toDate: reportDate };
  const monthlyRange = getMonthToDateRange(reportDate);
  const metricsByDriverId = createEmptyMetrics(driverIds);

  if (driverIds.length === 0) {
    return { available: true, dailyRange, monthlyRange, metricsByDriverId };
  }

  const { data, error } = await supabase
    .from("fuel_transactions")
    .select("driver_id, amount_sar, fuel_date")
    .eq("organization_id", organizationId)
    .in("driver_id", driverIds)
    .gte("fuel_date", monthlyRange.fromDate)
    .lte("fuel_date", monthlyRange.toDate);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[driver-reports:fuel-metrics:internal-load-failed]", {
        code: error.code,
        message: error.message,
      });
    }

    return { available: false, dailyRange, monthlyRange, metricsByDriverId };
  }

  for (const row of (data ?? []) as FuelTransactionMetricRow[]) {
    const metric = metricsByDriverId.get(row.driver_id);

    if (!metric) {
      continue;
    }

    const amount = Number(row.amount_sar) || 0;
    metric.monthlyFuelAmountSar += amount;

    if (row.fuel_date === reportDate) {
      metric.dailyFuelAmountSar += amount;
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
      monthlyFuelAmountSar: 0,
    });
  }

  return metrics;
}

export function getMonthToDateRange(date: string): FuelPeriod {
  const [year, month] = date.split("-");
  const selectedMonth = `${year}-${month}`;
  const currentDate = getCurrentRiyadhDate();
  const currentMonth = currentDate.slice(0, 7);
  const toDate =
    selectedMonth === currentMonth
      ? currentDate
      : selectedMonth < currentMonth
        ? getLastDateOfMonth(Number(year), Number(month))
        : date;

  return {
    fromDate: `${selectedMonth}-01`,
    toDate,
  };
}

function getCurrentRiyadhDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getLastDateOfMonth(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 0));
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}
