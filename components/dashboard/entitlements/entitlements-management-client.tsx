"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createEntitlementTransactionAction,
  reverseEntitlementTransactionAction,
} from "@/features/entitlements/actions";
import {
  initialEntitlementActionState,
  type EntitlementDriverSummary,
  type EntitlementsManagementData,
  type EntitlementTransaction,
  type EntitlementTransactionType,
} from "@/features/entitlements/types";
import type { Locale } from "@/types/locale";

const transactionLabels: Record<EntitlementTransactionType, string> = {
  salary: "راتب",
  bonus: "مكافأة",
  admin_deduction: "خصم إداري",
  keeta_deduction: "خصم كيتا",
  violation: "مخالفة",
  absence: "غياب",
};

const moneyFormatter = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
});

const signedMoneyFormatter = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function EntitlementsManagementClient({
  locale,
  data,
}: {
  locale: Locale;
  data: EntitlementsManagementData;
}) {
  const [createState, createAction] = useActionState(
    createEntitlementTransactionAction,
    initialEntitlementActionState,
  );

  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold leading-tight text-navy">
              إدارة المستحقات
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              دفتر مالي تراكمي غير قابل للحذف لحركات مستحقات المناديب داخل
              المؤسسة.
            </p>
          </div>
          <form method="get" className="flex items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-muted">
              الشهر
              <input
                type="month"
                name="month"
                defaultValue={data.month}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              عرض
            </button>
          </form>
        </div>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="إجمالي الرواتب" value={formatMoney(data.totals.salaryTotal)} />
        <MetricCard label="إجمالي المكافآت" value={formatMoney(data.totals.bonusTotal)} />
        <MetricCard
          label="إجمالي الخصومات"
          value={formatMoney(data.totals.totalDeductions)}
        />
        <NetMetricCard value={data.totals.netEntitlement} />
      </section>

      {data.canCreateTransaction ? (
        <section className="mt-6 rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">إضافة حركة مستحقات</h2>
          <form action={createAction} className="mt-5 space-y-5">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="organizationCode" value={data.organizationCode} />
            <input type="hidden" name="organizationId" value={data.organizationId} />

            <div className="grid gap-x-6 gap-y-5 lg:grid-cols-[minmax(260px,2fr)_minmax(160px,1fr)_minmax(150px,1fr)] xl:grid-cols-[minmax(300px,2fr)_minmax(170px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(190px,1fr)]">
              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              المندوب
              <select
                name="driverId"
                required
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              >
                <option value="">اختر المندوب</option>
                {data.drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName}
                    {driver.iqamaNumber ? ` - ${driver.iqamaNumber}` : ""}
                  </option>
                ))}
              </select>
            </label>
              </div>

              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              النوع
              <select
                name="transactionType"
                required
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              >
                {Object.entries(transactionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
              </div>

              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              المبلغ
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              />
            </label>
              </div>

              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              عدد الطلبات
              <input
                name="orderCount"
                type="number"
                min="0"
                step="1"
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              />
            </label>
              </div>

              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              تاريخ الاستحقاق
              <input
                name="effectiveDate"
                type="date"
                required
                defaultValue={data.periodStart}
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              />
            </label>
              </div>

            </div>

            <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2">
              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              السبب
              <input
                name="reason"
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              />
            </label>
              </div>

              <div className="min-w-0 space-y-2">
            <label className="grid min-w-0 gap-2 text-sm font-medium text-muted">
              ملاحظات
              <input
                name="notes"
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
              />
            </label>
              </div>

            </div>

            <div className="flex items-center gap-3 pt-1">
              <SubmitButton label="إضافة الحركة" pendingLabel="جار الإضافة..." />
              <ActionMessage state={createState} />
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-6 space-y-4">
        {data.summaries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-navy">لا توجد حركات مستحقات</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted">
              لم يتم تسجيل أي حركة مالية في الفترة المحددة.
            </p>
          </div>
        ) : (
          data.summaries.map((summary) => (
            <DriverEntitlementCard
              key={summary.driverId}
              locale={locale}
              organizationId={data.organizationId}
              organizationCode={data.organizationCode}
              summary={summary}
              canViewTransactions={data.canViewTransactions}
              canReverseTransaction={data.canReverseTransaction}
            />
          ))
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-tight text-navy">{value}</p>
    </div>
  );
}

function NetMetricCard({ value }: { value: number }) {
  const semantic = getNetSemantic(value);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-medium text-muted">صافي المستحقات</p>
      <p
        className={`mt-2 text-2xl font-semibold leading-tight ${semantic.textClassName}`}
      >
        {formatSignedMoney(value)}
      </p>
      <p className="mt-1 text-xs font-medium text-muted">{semantic.label}</p>
    </div>
  );
}

function DriverEntitlementCard({
  locale,
  organizationId,
  organizationCode,
  summary,
  canViewTransactions,
  canReverseTransaction,
}: {
  locale: Locale;
  organizationId: string;
  organizationCode: string;
  summary: EntitlementDriverSummary;
  canViewTransactions: boolean;
  canReverseTransaction: boolean;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(120px,1fr))]">
        <div>
          <h2 className="text-lg font-semibold text-navy">{summary.driverName}</h2>
          <p className="mt-1 text-sm text-muted">
            {summary.iqamaNumber ?? "لا يوجد رقم إقامة"}
            {summary.mobileNumber ? ` · ${summary.mobileNumber}` : ""}
          </p>
        </div>
        <CompactTotal label="دخل" value={summary.totalPositive} />
        <CompactTotal label="خصومات" value={summary.totalDeductions} negative />
        <NetCompactTotal value={summary.netEntitlement} />
        <CompactTotal label="الحركات الفعالة" value={summary.activeTransactionCount} raw />
      </div>

      {canViewTransactions ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-primary">
            عرض سجل الحركات
          </summary>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="min-w-[1180px] text-sm">
              <thead className="text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-3 text-start font-semibold">النوع</th>
                  <th className="px-3 py-3 text-start font-semibold">المبلغ</th>
                  <th className="px-3 py-3 text-start font-semibold">الأثر</th>
                  <th className="px-3 py-3 text-start font-semibold">السبب</th>
                  <th className="px-3 py-3 text-start font-semibold">الطلبات</th>
                  <th className="px-3 py-3 text-start font-semibold">تاريخ الاستحقاق</th>
                  <th className="px-3 py-3 text-start font-semibold">أنشئت بواسطة</th>
                  <th className="px-3 py-3 text-start font-semibold">الحالة</th>
                  <th className="px-3 py-3 text-start font-semibold">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {summary.transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b border-border/70">
                    <td className="px-3 py-3 text-navy">
                      {transactionLabels[transaction.transactionType]}
                    </td>
                    <td className="px-3 py-3 text-navy">{formatMoney(transaction.amount)}</td>
                    <td
                      className={`px-3 py-3 font-semibold ${
                        transaction.signedAmount < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {formatSignedMoney(transaction.signedAmount)}
                    </td>
                    <td className="max-w-[220px] px-3 py-3 text-muted">
                      {transaction.reason ?? "بدون سبب"}
                      {transaction.notes ? (
                        <span className="block text-xs">{transaction.notes}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {transaction.orderCount ?? "-"}
                    </td>
                    <td className="px-3 py-3 text-muted">{transaction.effectiveDate}</td>
                    <td className="px-3 py-3 text-muted">
                      {transaction.createdByName ?? "-"}
                    </td>
                    <td className="px-3 py-3">
                      {transaction.reversedAt ? (
                        <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
                          ملغاة
                        </span>
                      ) : (
                        <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                          فعالة
                        </span>
                      )}
                      {transaction.reversalReason ? (
                        <span className="mt-1 block max-w-[180px] text-xs text-muted">
                          سبب الإلغاء: {transaction.reversalReason}
                        </span>
                      ) : null}
                      {transaction.reversedByName ? (
                        <span className="mt-1 block max-w-[180px] text-xs text-muted">
                          ألغيت بواسطة: {transaction.reversedByName}
                        </span>
                      ) : null}
                      {transaction.reversedAt ? (
                        <span className="mt-1 block max-w-[180px] text-xs text-muted">
                          تاريخ الإلغاء: {formatDateTime(transaction.reversedAt)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {canReverseTransaction && !transaction.reversedAt ? (
                        <ReverseTransactionForm
                          locale={locale}
                          organizationId={organizationId}
                          organizationCode={organizationCode}
                          transaction={transaction}
                        />
                      ) : transaction.reversedAt ? (
                        <span className="text-xs font-semibold text-danger">ملغاة</span>
                      ) : (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </article>
  );
}

function CompactTotal({
  label,
  value,
  negative = false,
  raw = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
  raw?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          negative ? "text-danger" : "text-navy"
        }`}
      >
        {raw ? value : formatMoney(value)}
      </p>
    </div>
  );
}

function NetCompactTotal({ value }: { value: number }) {
  const semantic = getNetSemantic(value);

  return (
    <div>
      <p className="text-xs font-medium text-muted">صافي المستحق</p>
      <p className={`mt-1 text-lg font-semibold ${semantic.textClassName}`}>
        {formatSignedMoney(value)}
      </p>
      <p className="mt-1 text-xs font-medium text-muted">{semantic.label}</p>
    </div>
  );
}

function ReverseTransactionForm({
  locale,
  organizationId,
  organizationCode,
  transaction,
}: {
  locale: Locale;
  organizationId: string;
  organizationCode: string;
  transaction: EntitlementTransaction;
}) {
  const [state, action] = useActionState(
    reverseEntitlementTransactionAction,
    initialEntitlementActionState,
  );

  return (
    <form
      action={action}
      className="grid min-w-[220px] gap-2"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "هل أنت متأكد من إلغاء هذه المعاملة؟ ستبقى الحركة محفوظة في السجل ولن تدخل في حساب المستحقات.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="organizationCode" value={organizationCode} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="transactionId" value={transaction.id} />
      <input
        name="reversalReason"
        required
        placeholder="سبب الإلغاء"
        className="h-9 rounded-md border border-border bg-background px-3 text-xs text-navy outline-none focus:border-primary"
      />
      <SubmitButton
        label="إلغاء المعاملة"
        pendingLabel="..."
        small
        tone="danger"
      />
      <ActionMessage state={state} />
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  small = false,
  tone = "primary",
}: {
  label: string;
  pendingLabel: string;
  small?: boolean;
  tone?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const toneClassName =
    tone === "danger"
      ? "border border-danger/25 bg-surface text-danger hover:bg-danger/10"
      : "bg-primary text-white hover:bg-primary/90";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${toneClassName} ${
        small ? "h-8 px-3 text-xs" : "h-11 px-5 text-sm"
      }`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ActionMessage({ state }: { state: { status: string; message?: string } }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <p
      className={`text-sm font-medium ${
        state.status === "success" ? "text-success" : "text-danger"
      }`}
    >
      {state.message}
    </p>
  );
}

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function formatSignedMoney(value: number) {
  return signedMoneyFormatter.format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getNetSemantic(value: number) {
  if (value > 0) {
    return {
      label: `له ${formatMoney(value)}`,
      textClassName: "text-success",
    };
  }

  if (value < 0) {
    return {
      label: `عليه ${formatMoney(Math.abs(value))}`,
      textClassName: "text-danger",
    };
  }

  return {
    label: "لا له ولا عليه",
    textClassName: "text-navy",
  };
}
