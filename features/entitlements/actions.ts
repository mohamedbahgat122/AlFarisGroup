"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { hasOrganizationPermission } from "@/features/permissions/server";
import {
  createSourceRevision,
  getEntitlementsManagementData,
} from "@/features/entitlements/queries";
import {
  entitlementTransactionTypes,
  type EntitlementActionState,
  type EntitlementTransactionType,
} from "@/features/entitlements/types";
import { getOrganizationPageAccessByCode } from "@/features/organizations/queries";
import { isLocale } from "@/types/locale";

const validTransactionTypes = new Set<string>(entitlementTransactionTypes);

export async function createEntitlementTransactionAction(
  _prevState: EntitlementActionState,
  formData: FormData,
): Promise<EntitlementActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const driverId = getString(formData, "driverId");
  const transactionType = getString(formData, "transactionType");
  const amount = parsePositiveMoney(getString(formData, "amount"));
  const reason = normalizeOptionalString(getString(formData, "reason"));
  const notes = normalizeOptionalString(getString(formData, "notes"));
  const orderCount = parseOptionalNonNegativeInteger(getString(formData, "orderCount"));
  const effectiveDate = getString(formData, "effectiveDate");

  if (
    !isLocale(locale) ||
    !organizationCode ||
    !organizationId ||
    !driverId ||
    !isTransactionType(transactionType) ||
    amount === null ||
    orderCount === "invalid" ||
    !isDateOnly(effectiveDate)
  ) {
    return validationError();
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return unauthorizedError();
  }

  const canCreate = await hasOrganizationPermission({
    organizationId,
    permissionKey: "entitlements.create_transaction",
  });

  if (!canCreate) {
    return unauthorizedError();
  }

  const { data: driver, error: driverError } = await admin.supabase
    .from("drivers")
    .select("id")
    .eq("id", driverId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (driverError || !driver) {
    return validationError();
  }

  const { error } = await admin.supabase
    .from("driver_entitlement_transactions")
    .insert({
      organization_id: organizationId,
      driver_id: driverId,
      transaction_type: transactionType,
      amount,
      reason,
      notes,
      order_count: orderCount,
      effective_date: effectiveDate,
      created_by: admin.user.id,
    });

  if (error) {
    console.error("[entitlements:create] Failed to insert ledger transaction", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return {
      status: "error",
      message: "تعذر إضافة حركة المستحقات. حاول مرة أخرى.",
    };
  }

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/entitlements`);

  return {
    status: "success",
    message: "تمت إضافة حركة المستحقات.",
  };
}

export async function reverseEntitlementTransactionAction(
  _prevState: EntitlementActionState,
  formData: FormData,
): Promise<EntitlementActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const organizationId = getString(formData, "organizationId");
  const transactionId = getString(formData, "transactionId");
  const reversalReason = normalizeOptionalString(getString(formData, "reversalReason"));

  if (
    !isLocale(locale) ||
    !organizationCode ||
    !organizationId ||
    !transactionId ||
    !reversalReason
  ) {
    return validationError();
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return unauthorizedError();
  }

  const canReverse = await hasOrganizationPermission({
    organizationId,
    permissionKey: "entitlements.reverse_transaction",
  });

  if (!canReverse) {
    return unauthorizedError();
  }

  const { data: transaction, error: loadError } = await admin.supabase
    .from("driver_entitlement_transactions")
    .select("id, organization_id, reversed_at")
    .eq("id", transactionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (loadError || !transaction || transaction.reversed_at) {
    return validationError();
  }

  const { error } = await admin.supabase
    .from("driver_entitlement_transactions")
    .update({
      reversed_at: new Date().toISOString(),
      reversed_by: admin.user.id,
      reversal_reason: reversalReason,
    })
    .eq("id", transactionId)
    .eq("organization_id", organizationId)
    .is("reversed_at", null);

  if (error) {
    console.error("[entitlements:cancel] Failed to cancel ledger transaction", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return {
      status: "error",
      message: "تعذر إلغاء معاملة المستحقات. حاول مرة أخرى.",
    };
  }

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/entitlements`);

  return {
    status: "success",
    message: "تم إلغاء معاملة المستحقات.",
  };
}

export async function publishEntitlementStatementAction(
  _prevState: EntitlementActionState,
  formData: FormData,
): Promise<EntitlementActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const driverId = getString(formData, "driverId");
  const month = getString(formData, "month");

  if (!isLocale(locale) || !organizationCode || !driverId || !/^\d{4}-\d{2}$/.test(month)) {
    return validationError();
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return unauthorizedError();
  }

  const access = await getOrganizationPageAccessByCode(organizationCode);

  if (access.status !== "success") {
    return unauthorizedError();
  }

  const canPublish = await hasOrganizationPermission({
    organizationId: access.organization.id,
    permissionKey: "entitlements.publish",
  });

  if (!canPublish) {
    return unauthorizedError();
  }

  const entitlements = await getEntitlementsManagementData({
    organization: access.organization,
    month,
  });

  if (entitlements.status !== "success") {
    return {
      status: entitlements.status === "unauthorized" ? "unauthorized" : "error",
      message:
        entitlements.status === "unauthorized"
          ? "ليس لديك صلاحية لتنفيذ هذا الإجراء."
          : "تعذر تحميل بيانات المستحقات للنشر.",
    };
  }

  const summary = entitlements.data.summaries.find(
    (item) => item.driverId === driverId,
  );

  if (!summary || summary.activeTransactionCount <= 0) {
    return validationError();
  }

  const activeTransactions = summary.transactions.filter(
    (transaction) => !transaction.reversedAt,
  );

  const { error } = await admin.supabase.rpc(
    "publish_driver_entitlement_statement",
    {
      p_organization_id: access.organization.id,
      p_driver_id: summary.driverId,
      p_period_start: entitlements.data.periodStart,
      p_period_end: entitlements.data.periodEnd,
      p_salary_total: summary.salaryTotal,
      p_bonus_total: summary.bonusTotal,
      p_admin_deduction_total: summary.adminDeductionTotal,
      p_keeta_deduction_total: summary.keetaDeductionTotal,
      p_violation_total: summary.violationTotal,
      p_absence_total: summary.absenceTotal,
      p_deduction_total: summary.totalDeductions,
      p_net_amount: summary.netEntitlement,
      p_transaction_count: summary.activeTransactionCount,
      p_source_revision: createSourceRevision(summary.transactions),
      p_items: activeTransactions.map((transaction) => ({
        sourceTransactionId: transaction.id,
        transactionType: transaction.transactionType,
        amount: transaction.amount,
        financialEffect: transaction.signedAmount,
        reason: transaction.reason,
        notes: transaction.notes,
        orderCount: transaction.orderCount,
        effectiveDate: transaction.effectiveDate,
      })),
    },
  );

  if (error) {
    console.error("[entitlements:publish] Failed to publish statement", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return {
      status: "error",
      message: "تعذر نشر المستحقات. حاول مرة أخرى.",
    };
  }

  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/entitlements/send`);

  return {
    status: "success",
    message: "تم نشر المستحقات لهذا المندوب.",
  };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: string) {
  return value.length > 0 ? value : null;
}

function parsePositiveMoney(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function parseOptionalNonNegativeInteger(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return "invalid" as const;
  return parsed;
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
}

function isTransactionType(value: string): value is EntitlementTransactionType {
  return validTransactionTypes.has(value);
}

function validationError(): EntitlementActionState {
  return {
    status: "validation_error",
    message: "تحقق من البيانات المدخلة وحاول مرة أخرى.",
  };
}

function unauthorizedError(): EntitlementActionState {
  return {
    status: "unauthorized",
    message: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
  };
}
