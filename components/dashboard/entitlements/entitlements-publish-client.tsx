"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { publishEntitlementStatementAction } from "@/features/entitlements/actions";
import {
  initialEntitlementActionState,
  type EntitlementPublicationState,
  type EntitlementPublishCard,
  type EntitlementsPublishData,
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

const statusLabels: Record<EntitlementPublicationState, string> = {
  not_published: "غير منشور",
  published: "منشور",
  needs_republish: "يحتاج إعادة نشر",
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

export function EntitlementsPublishClient({
  locale,
  data,
}: {
  locale: Locale;
  data: EntitlementsPublishData;
}) {
  return (
    <div className="min-h-full bg-background px-5 py-6 sm:px-7">
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h1 className="text-2xl font-semibold leading-tight text-navy">
          إرسال المستحقات
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          مراجعة ونشر بيانات مستحقات المناديب للفترة المحددة. النشر لا يعني دفع
          أو تحويل الأموال.
        </p>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="المناديب الجاهزون للنشر"
          value={String(data.totals.eligibleDrivers)}
        />
        <MetricCard label="تم النشر" value={String(data.totals.published)} />
        <MetricCard
          label="يحتاج إعادة نشر"
          value={String(data.totals.needsRepublish)}
        />
        <NetMetricCard
          label="إجمالي صافي المستحقات المنشورة"
          value={data.totals.publishedNetTotal}
        />
      </section>

      <form
        method="get"
        className="mt-6 grid gap-x-6 gap-y-5 rounded-lg border border-border bg-surface p-5 shadow-sm lg:grid-cols-[minmax(260px,1.5fr)_minmax(180px,1fr)_minmax(210px,1fr)_auto]"
      >
        <label className="grid gap-2 text-sm font-medium text-muted">
          بحث
          <input
            name="search"
            defaultValue={data.search}
            placeholder="اسم المندوب / المعرف / الجوال"
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-muted">
          الحالة
          <select
            name="status"
            defaultValue={data.statusFilter}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
          >
            <option value="all">الكل</option>
            <option value="not_published">غير منشور</option>
            <option value="published">منشور</option>
            <option value="needs_republish">يحتاج إعادة نشر</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-muted">
          الفترة
          <input
            type="month"
            name="month"
            defaultValue={data.month}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-navy outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            عرض
          </button>
        </div>
      </form>

      <section className="mt-6 space-y-4">
        {data.cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-navy">
              لا توجد بيانات مستحقات للنشر
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted">
              لا يوجد مندوب لديه حركات مستحقات فعالة في الفترة والفلاتر المحددة.
            </p>
          </div>
        ) : (
          data.cards.map((card) => (
            <EntitlementPublishCardView
              key={card.driverId}
              locale={locale}
              organizationCode={data.organizationCode}
              month={data.month}
              card={card}
              canPublish={data.canPublish}
            />
          ))
        )}
      </section>
    </div>
  );
}

function EntitlementPublishCardView({
  locale,
  organizationCode,
  month,
  card,
  canPublish,
}: {
  locale: Locale;
  organizationCode: string;
  month: string;
  card: EntitlementPublishCard;
  canPublish: boolean;
}) {
  const shouldPublish = card.publicationState !== "published";

  return (
    <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-navy">{card.driverName}</h2>
          <p className="mt-1 text-sm text-muted">
            {card.iqamaNumber ?? "لا يوجد معرف"}
            {card.mobileNumber ? ` · ${card.mobileNumber}` : ""}
          </p>
          <p className="mt-1 text-xs font-medium text-muted">
            الفترة: {formatDate(card.periodStart)} - {formatDate(card.periodEnd)}
          </p>
        </div>
        <StatusBadge state={card.publicationState} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MiniTotal label="الراتب" value={card.salaryTotal} />
        <MiniTotal label="المكافآت" value={card.bonusTotal} />
        <MiniTotal label="الخصومات" value={card.totalDeductions} negative />
        <NetMiniTotal value={card.netEntitlement} />
        <MiniTotal label="الحركات الفعالة" value={card.activeTransactionCount} raw />
      </div>

      {card.currentStatement ? (
        <p className="mt-4 text-xs font-medium text-muted">
          آخر نشر: نسخة {card.currentStatement.version} في{" "}
          {formatDateTime(card.currentStatement.publishedAt)}
          {card.currentStatement.publishedByName
            ? ` بواسطة ${card.currentStatement.publishedByName}`
            : ""}
        </p>
      ) : null}

      <details className="mt-4 rounded-lg border border-border/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-primary">
          عرض تفاصيل المستحقات
        </summary>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="min-w-[860px] text-sm">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-3 text-start font-semibold">النوع</th>
                <th className="px-3 py-3 text-start font-semibold">الأثر المالي</th>
                <th className="px-3 py-3 text-start font-semibold">السبب</th>
                <th className="px-3 py-3 text-start font-semibold">التاريخ</th>
                <th className="px-3 py-3 text-start font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {card.transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-border/70">
                  <td className="px-3 py-3 text-navy">
                    {transactionLabels[transaction.transactionType]}
                  </td>
                  <td
                    className={`px-3 py-3 font-semibold ${
                      transaction.signedAmount < 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    {formatSignedMoney(transaction.signedAmount)}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {transaction.reason ?? "بدون سبب"}
                    {transaction.notes ? (
                      <span className="block text-xs">{transaction.notes}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-muted">
                    {transaction.effectiveDate}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {canPublish && shouldPublish ? (
        <PublishStatementForm
          locale={locale}
          organizationCode={organizationCode}
          month={month}
          card={card}
        />
      ) : null}
    </article>
  );
}

function PublishStatementForm({
  locale,
  organizationCode,
  month,
  card,
}: {
  locale: Locale;
  organizationCode: string;
  month: string;
  card: EntitlementPublishCard;
}) {
  const [state, action] = useActionState(
    publishEntitlementStatementAction,
    initialEntitlementActionState,
  );
  const label =
    card.publicationState === "needs_republish"
      ? "إعادة نشر المستحقات"
      : "نشر المستحقات";

  return (
    <form
      action={action}
      className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `سيتم نشر مستحقات هذا المندوب للفترة المحددة لتظهر له في تطبيق المندوب. هل تريد المتابعة؟\n\nالفترة: ${card.periodStart} - ${card.periodEnd}\nالدخل: ${formatMoney(card.totalPositive)}\nالخصومات: ${formatMoney(card.totalDeductions)}\nالصافي: ${formatSignedMoney(card.netEntitlement)}`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="organizationCode" value={organizationCode} />
      <input type="hidden" name="driverId" value={card.driverId} />
      <input type="hidden" name="month" value={month} />
      <PublishSubmitButton label={label} />
      <ActionMessage state={state} />
    </form>
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

function NetMetricCard({ label, value }: { label: string; value: number }) {
  const semantic = getNetSemantic(value);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold leading-tight ${semantic.textClassName}`}
      >
        {formatSignedMoney(value)}
      </p>
      <p className="mt-1 text-xs font-medium text-muted">{semantic.label}</p>
    </div>
  );
}

function MiniTotal({
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

function NetMiniTotal({ value }: { value: number }) {
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

function StatusBadge({ state }: { state: EntitlementPublicationState }) {
  const className =
    state === "published"
      ? "bg-success/10 text-success"
      : state === "needs_republish"
        ? "bg-amber-100 text-amber-700"
        : "bg-muted/10 text-muted";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {statusLabels[state]}
    </span>
  );
}

function PublishSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "جار النشر..." : label}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
