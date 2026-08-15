import type { EntitlementTransactionType } from "@/features/entitlements/types";

const positiveTransactionTypes = new Set<EntitlementTransactionType>([
  "salary",
  "bonus",
]);

export function getEntitlementFinancialEffect({
  transactionType,
  amount,
}: {
  transactionType: EntitlementTransactionType;
  amount: number;
}) {
  return positiveTransactionTypes.has(transactionType) ? amount : -amount;
}

export function calculateEntitlementNet({
  incomeTotal,
  deductionTotal,
}: {
  incomeTotal: number;
  deductionTotal: number;
}) {
  return incomeTotal - deductionTotal;
}
