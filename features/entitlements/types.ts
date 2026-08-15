export const entitlementTransactionTypes = [
  "salary",
  "bonus",
  "admin_deduction",
  "keeta_deduction",
  "violation",
  "absence",
] as const;

export type EntitlementTransactionType =
  (typeof entitlementTransactionTypes)[number];

export type EntitlementDriverOption = {
  id: string;
  fullName: string;
  iqamaNumber: string | null;
  mobileNumber: string | null;
};

export type EntitlementTransaction = {
  id: string;
  driverId: string;
  transactionType: EntitlementTransactionType;
  amount: number;
  signedAmount: number;
  reason: string | null;
  notes: string | null;
  orderCount: number | null;
  effectiveDate: string;
  createdByName: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversedByName: string | null;
  reversalReason: string | null;
};

export type EntitlementDriverSummary = {
  driverId: string;
  driverName: string;
  iqamaNumber: string | null;
  mobileNumber: string | null;
  salaryTotal: number;
  bonusTotal: number;
  adminDeductionTotal: number;
  keetaDeductionTotal: number;
  violationTotal: number;
  absenceTotal: number;
  totalPositive: number;
  totalDeductions: number;
  netEntitlement: number;
  activeTransactionCount: number;
  transactions: EntitlementTransaction[];
};

export type EntitlementsTotals = {
  salaryTotal: number;
  bonusTotal: number;
  adminDeductionTotal: number;
  keetaDeductionTotal: number;
  violationTotal: number;
  absenceTotal: number;
  totalPositive: number;
  totalDeductions: number;
  netEntitlement: number;
  activeTransactionCount: number;
};

export type EntitlementsManagementData = {
  organizationId: string;
  organizationCode: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  drivers: EntitlementDriverOption[];
  summaries: EntitlementDriverSummary[];
  totals: EntitlementsTotals;
  canCreateTransaction: boolean;
  canViewTransactions: boolean;
  canReverseTransaction: boolean;
};

export type EntitlementPublicationState =
  | "not_published"
  | "published"
  | "needs_republish";

export type EntitlementPublishedStatement = {
  id: string;
  sourceRevision: string;
  version: number;
  publishedAt: string;
  publishedByName: string | null;
  netAmount: number;
  status: string;
};

export type EntitlementPublishCard = EntitlementDriverSummary & {
  periodStart: string;
  periodEnd: string;
  sourceRevision: string;
  publicationState: EntitlementPublicationState;
  currentStatement: EntitlementPublishedStatement | null;
};

export type EntitlementsPublishTotals = {
  eligibleDrivers: number;
  published: number;
  needsRepublish: number;
  publishedNetTotal: number;
};

export type EntitlementsPublishData = {
  organizationId: string;
  organizationCode: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  search: string;
  statusFilter: "all" | EntitlementPublicationState;
  cards: EntitlementPublishCard[];
  totals: EntitlementsPublishTotals;
  canPublish: boolean;
};

export type EntitlementActionState = {
  status: "idle" | "success" | "validation_error" | "unauthorized" | "error";
  message?: string;
};

export const initialEntitlementActionState: EntitlementActionState = {
  status: "idle",
};
