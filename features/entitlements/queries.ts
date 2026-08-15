import "server-only";

import { createHash } from "crypto";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type {
  EntitlementDriverOption,
  EntitlementDriverSummary,
  EntitlementsManagementData,
  EntitlementsPublishData,
  EntitlementsTotals,
  EntitlementPublishCard,
  EntitlementTransaction,
  EntitlementTransactionType,
} from "@/features/entitlements/types";
import {
  calculateEntitlementNet,
  getEntitlementFinancialEffect,
} from "@/features/entitlements/financial";
import type { Database } from "@/types/database";

type TransactionRow =
  Database["public"]["Tables"]["driver_entitlement_transactions"]["Row"];
type StatementRow =
  Database["public"]["Tables"]["driver_entitlement_statements"]["Row"];

type DriverRow = {
  id: string;
  full_name: string;
  iqama_number: string | null;
  mobile_number: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
};

const defaultTotals: EntitlementsTotals = {
  salaryTotal: 0,
  bonusTotal: 0,
  adminDeductionTotal: 0,
  keetaDeductionTotal: 0,
  violationTotal: 0,
  absenceTotal: 0,
  totalPositive: 0,
  totalDeductions: 0,
  netEntitlement: 0,
  activeTransactionCount: 0,
};

export type EntitlementsQueryResult =
  | {
      status: "success";
      data: EntitlementsManagementData;
    }
  | {
      status: "unauthorized" | "load_error";
    };

export type EntitlementsPublishQueryResult =
  | {
      status: "success";
      data: EntitlementsPublishData;
    }
  | {
      status: "unauthorized" | "load_error";
    };

export async function getEntitlementsManagementData({
  organization,
  month,
}: {
  organization: AccessibleOrganization;
  month: string | undefined;
}): Promise<EntitlementsQueryResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized" };
  }

  if (!organization.permissionKeys.includes("entitlements.view")) {
    return { status: "unauthorized" };
  }

  const normalizedMonth = normalizeMonth(month);
  const { periodStart, periodEnd } = getMonthRange(normalizedMonth);

  const [driversResult, transactionsResult] = await Promise.all([
    admin.supabase
      .from("drivers")
      .select("id, full_name, iqama_number, mobile_number")
      .eq("organization_id", organization.id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    admin.supabase
      .from("driver_entitlement_transactions")
      .select(
        "id, organization_id, driver_id, transaction_type, amount, reason, notes, order_count, effective_date, created_by, created_at, reversed_at, reversed_by, reversal_reason",
      )
      .eq("organization_id", organization.id)
      .gte("effective_date", periodStart)
      .lte("effective_date", periodEnd)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (driversResult.error || transactionsResult.error) {
    return { status: "load_error" };
  }

  const drivers = ((driversResult.data ?? []) as DriverRow[]).map(mapDriver);
  const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));
  const transactionRows = (transactionsResult.data ?? []) as TransactionRow[];
  const profileIds = Array.from(
    new Set(
      transactionRows.flatMap((row) =>
        [row.created_by, row.reversed_by].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        ),
      ),
    ),
  );

  let profilesById = new Map<string, string>();

  if (profileIds.length > 0) {
    const profilesResult = await admin.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    if (profilesResult.error) {
      return { status: "load_error" };
    }

    profilesById = new Map(
      ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile.full_name,
      ]),
    );
  }

  const summariesByDriver = new Map<string, EntitlementDriverSummary>();
  const totals = { ...defaultTotals };

  for (const row of transactionRows) {
    const driver = driverMap.get(row.driver_id);
    const transaction = mapTransaction(row, profilesById);
    const summary =
      summariesByDriver.get(row.driver_id) ??
      createEmptySummary({
        driverId: row.driver_id,
        driverName: driver?.fullName ?? "مندوب غير معروف",
        iqamaNumber: driver?.iqamaNumber ?? null,
        mobileNumber: driver?.mobileNumber ?? null,
      });

    summary.transactions.push(transaction);

    if (!row.reversed_at) {
      addTransactionToTotals(summary, transaction);
      addTransactionToTotals(totals, transaction);
    }

    summariesByDriver.set(row.driver_id, summary);
  }

  return {
    status: "success",
    data: {
      organizationId: organization.id,
      organizationCode: organization.code,
      month: normalizedMonth,
      periodStart,
      periodEnd,
      drivers,
      summaries: Array.from(summariesByDriver.values()).sort(
        (first, second) => second.netEntitlement - first.netEntitlement,
      ),
      totals,
      canCreateTransaction: organization.permissionKeys.includes(
        "entitlements.create_transaction",
      ),
      canViewTransactions:
        organization.permissionKeys.includes("entitlements.view_transactions") ||
        organization.permissionKeys.includes("entitlements.view"),
      canReverseTransaction: organization.permissionKeys.includes(
        "entitlements.reverse_transaction",
      ),
    },
  };
}

export async function getEntitlementsPublishData({
  organization,
  month,
  search,
  statusFilter,
}: {
  organization: AccessibleOrganization;
  month: string | undefined;
  search: string | undefined;
  statusFilter: string | undefined;
}): Promise<EntitlementsPublishQueryResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized" };
  }

  if (!organization.permissionKeys.includes("entitlements.view")) {
    return { status: "unauthorized" };
  }

  const normalizedMonth = normalizeMonth(month);
  const { periodStart, periodEnd } = getMonthRange(normalizedMonth);
  const normalizedSearch = (search ?? "").trim().toLocaleLowerCase("ar-SA");
  const normalizedStatus = normalizePublicationStatus(statusFilter);

  const [managementResult, statementsResult] = await Promise.all([
    getEntitlementsManagementData({ organization, month: normalizedMonth }),
    admin.supabase
      .from("driver_entitlement_statements")
      .select(
        "id, organization_id, driver_id, period_start, period_end, source_revision, version, published_at, published_by, net_amount, status",
      )
      .eq("organization_id", organization.id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .eq("status", "published"),
  ]);

  if (managementResult.status !== "success") {
    return managementResult.status === "unauthorized"
      ? { status: "unauthorized" }
      : { status: "load_error" };
  }

  if (statementsResult.error) {
    return { status: "load_error" };
  }

  const statementRows = (statementsResult.data ?? []) as StatementRow[];
  const publisherIds = Array.from(new Set(statementRows.map((row) => row.published_by)));
  let publishersById = new Map<string, string>();

  if (publisherIds.length > 0) {
    const publishersResult = await admin.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", publisherIds);

    if (publishersResult.error) {
      return { status: "load_error" };
    }

    publishersById = new Map(
      ((publishersResult.data ?? []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile.full_name,
      ]),
    );
  }

  const statementsByDriver = new Map(
    statementRows.map((row) => [row.driver_id, row]),
  );

  const cards = managementResult.data.summaries
    .filter((summary) => summary.activeTransactionCount > 0)
    .map((summary): EntitlementPublishCard => {
      const sourceRevision = createSourceRevision(summary.transactions);
      const statement = statementsByDriver.get(summary.driverId) ?? null;
      const publicationState = !statement
        ? "not_published"
        : statement.source_revision === sourceRevision
          ? "published"
          : "needs_republish";

      return {
        ...summary,
        periodStart,
        periodEnd,
        sourceRevision,
        publicationState,
        currentStatement: statement
          ? {
              id: statement.id,
              sourceRevision: statement.source_revision,
              version: statement.version,
              publishedAt: statement.published_at,
              publishedByName: publishersById.get(statement.published_by) ?? null,
              netAmount: Number(statement.net_amount),
              status: statement.status,
            }
          : null,
      };
    })
    .filter((card) => {
      if (!normalizedSearch) return true;
      return [card.driverName, card.iqamaNumber, card.mobileNumber]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("ar-SA").includes(normalizedSearch),
        );
    })
    .filter((card) =>
      normalizedStatus === "all" ? true : card.publicationState === normalizedStatus,
    );

  const allCards = managementResult.data.summaries
    .filter((summary) => summary.activeTransactionCount > 0)
    .map((summary) => {
      const sourceRevision = createSourceRevision(summary.transactions);
      const statement = statementsByDriver.get(summary.driverId) ?? null;
      return {
        state: !statement
          ? "not_published"
          : statement.source_revision === sourceRevision
            ? "published"
            : "needs_republish",
        statement,
      };
    });

  return {
    status: "success",
    data: {
      organizationId: organization.id,
      organizationCode: organization.code,
      month: normalizedMonth,
      periodStart,
      periodEnd,
      search: search ?? "",
      statusFilter: normalizedStatus,
      cards,
      totals: {
        eligibleDrivers: allCards.length,
        published: allCards.filter((card) => card.state === "published").length,
        needsRepublish: allCards.filter((card) => card.state === "needs_republish")
          .length,
        publishedNetTotal: allCards.reduce(
          (total, card) => total + (card.statement ? Number(card.statement.net_amount) : 0),
          0,
        ),
      },
      canPublish: organization.permissionKeys.includes("entitlements.publish"),
    },
  };
}

export function normalizeMonth(value: string | undefined) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function signedEntitlementAmount(
  transactionType: EntitlementTransactionType,
  amount: number,
) {
  return getEntitlementFinancialEffect({ transactionType, amount });
}

function getMonthRange(month: string) {
  const [yearValue, monthValue] = month.split("-").map(Number);
  const periodStart = `${month}-01`;
  const periodEnd = new Date(Date.UTC(yearValue, monthValue, 0))
    .toISOString()
    .slice(0, 10);

  return { periodStart, periodEnd };
}

export function createSourceRevision(transactions: EntitlementTransaction[]) {
  const canonical = transactions
    .map((transaction) => ({
      id: transaction.id,
      type: transaction.transactionType,
      amount: transaction.amount.toFixed(2),
      effectiveDate: transaction.effectiveDate,
      reversedAt: transaction.reversedAt ?? "",
      reversalReason: transaction.reversalReason ?? "",
    }))
    .sort((first, second) => first.id.localeCompare(second.id));

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function normalizePublicationStatus(value: string | undefined) {
  if (
    value === "not_published" ||
    value === "published" ||
    value === "needs_republish"
  ) {
    return value;
  }

  return "all";
}

function mapDriver(row: DriverRow): EntitlementDriverOption {
  return {
    id: row.id,
    fullName: row.full_name,
    iqamaNumber: row.iqama_number,
    mobileNumber: row.mobile_number,
  };
}

function mapTransaction(
  row: TransactionRow,
  profilesById: Map<string, string>,
): EntitlementTransaction {
  const transactionType = row.transaction_type as EntitlementTransactionType;
  const amount = Number(row.amount);

  return {
    id: row.id,
    driverId: row.driver_id,
    transactionType,
    amount,
    signedAmount: signedEntitlementAmount(transactionType, amount),
    reason: row.reason,
    notes: row.notes,
    orderCount: row.order_count,
    effectiveDate: row.effective_date,
    createdByName: profilesById.get(row.created_by) ?? null,
    createdAt: row.created_at,
    reversedAt: row.reversed_at,
    reversedByName: row.reversed_by ? profilesById.get(row.reversed_by) ?? null : null,
    reversalReason: row.reversal_reason,
  };
}

function createEmptySummary({
  driverId,
  driverName,
  iqamaNumber,
  mobileNumber,
}: {
  driverId: string;
  driverName: string;
  iqamaNumber: string | null;
  mobileNumber: string | null;
}): EntitlementDriverSummary {
  return {
    driverId,
    driverName,
    iqamaNumber,
    mobileNumber,
    ...defaultTotals,
    transactions: [],
  };
}

function addTransactionToTotals(
  target: EntitlementsTotals | EntitlementDriverSummary,
  transaction: EntitlementTransaction,
) {
  switch (transaction.transactionType) {
    case "salary":
      target.salaryTotal += transaction.amount;
      target.totalPositive += transaction.amount;
      break;
    case "bonus":
      target.bonusTotal += transaction.amount;
      target.totalPositive += transaction.amount;
      break;
    case "admin_deduction":
      target.adminDeductionTotal += transaction.amount;
      target.totalDeductions += transaction.amount;
      break;
    case "keeta_deduction":
      target.keetaDeductionTotal += transaction.amount;
      target.totalDeductions += transaction.amount;
      break;
    case "violation":
      target.violationTotal += transaction.amount;
      target.totalDeductions += transaction.amount;
      break;
    case "absence":
      target.absenceTotal += transaction.amount;
      target.totalDeductions += transaction.amount;
      break;
  }

  target.netEntitlement = calculateEntitlementNet({
    incomeTotal: target.totalPositive,
    deductionTotal: target.totalDeductions,
  });
  target.activeTransactionCount += 1;
}
