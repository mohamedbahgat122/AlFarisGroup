"use client";

import type { ReactNode } from "react";
import type {
  KafaratplusFuelOperationRow,
  KafaratplusFuelReportTotals,
  KafaratplusVehicleFuelSummary,
} from "@/features/fuel/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type FuelDictionary = Dictionary["dashboard"]["fuel"];

export function FuelReportsTable({
  dictionary,
  locale,
  rows,
  vehicleSummaries,
  totals,
}: {
  dictionary: FuelDictionary;
  locale: Locale;
  rows: KafaratplusFuelOperationRow[];
  vehicleSummaries: KafaratplusVehicleFuelSummary[];
  totals: KafaratplusFuelReportTotals;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="إجمالي الكمية" value={formatQuantity(totals.totalQuantity, locale)} />
        <Metric label="الإجمالي شامل الضريبة" value={formatMoney(totals.total, locale)} />
        <Metric label="الإجمالي قبل الضريبة" value={formatMoney(totals.totalPreTax, locale)} />
        <Metric label="إجمالي الضريبة" value={formatMoney(totals.totalTax, locale)} />
      </div>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full min-w-[1100px] border-collapse text-start">
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <Header>السائق</Header>
              <Header>رقم اللوحة</Header>
              <Header>المركبة</Header>
              <Header>عدد العمليات</Header>
              <Header>إجمالي اللترات</Header>
              <Header>إجمالي التكلفة</Header>
              <Header>متوسط العملية</Header>
              <Header>Iqama / ID</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vehicleSummaries.map((summary) => (
              <tr key={summary.key}>
                <Cell strong>{summary.driver ?? dictionary.notAvailable}</Cell>
                <Cell>{summary.plate}</Cell>
                <Cell>{summary.vehicle ?? dictionary.notAvailable}</Cell>
                <Cell>{summary.operationCount}</Cell>
                <Cell>{formatQuantity(summary.totalQuantity, locale)}</Cell>
                <Cell strong>{formatMoney(summary.total, locale)}</Cell>
                <Cell>{summary.averageCostPerOperation === null ? dictionary.notAvailable : formatMoney(summary.averageCostPerOperation, locale)}</Cell>
                <Cell>{summary.driverIqama ?? summary.driverId ?? dictionary.notAvailable}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full min-w-[1700px] border-collapse text-start">
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <Header>رقم العملية</Header>
              <Header>التاريخ</Header>
              <Header>السائق</Header>
              <Header>المركبة</Header>
              <Header>رقم اللوحة</Header>
              <Header>الماركة / الموديل</Header>
              <Header>العداد</Header>
              <Header>الفرع</Header>
              <Header>المزود</Header>
              <Header>طريقة الدفع</Header>
              <Header>المنتج</Header>
              <Header>الكمية</Header>
              <Header>سعر الوحدة</Header>
              <Header>الإجمالي</Header>
              <Header>الضريبة</Header>
              <Header>الفاتورة</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                <Cell strong>{row.operationNumber ?? dictionary.notAvailable}</Cell>
                <Cell>{formatDate(row.date, locale, dictionary)}</Cell>
                <Cell>{row.driver ?? dictionary.notAvailable}</Cell>
                <Cell>{row.vehicle ?? dictionary.notAvailable}</Cell>
                <Cell>{row.licencePlate ?? dictionary.notAvailable}</Cell>
                <Cell>{row.brandModel ?? dictionary.notAvailable}</Cell>
                <Cell>{row.odometer ?? dictionary.notAvailable}</Cell>
                <Cell>{row.branch ?? dictionary.notAvailable}</Cell>
                <Cell>{row.provider ?? dictionary.notAvailable}</Cell>
                <Cell>{row.paymentMethod ?? dictionary.notAvailable}</Cell>
                <Cell>{row.item ?? dictionary.notAvailable}</Cell>
                <Cell>{formatNullableQuantity(row.quantity, locale, dictionary)}</Cell>
                <Cell>{formatNullableMoney(row.unitPrice, locale, dictionary)}</Cell>
                <Cell strong>{formatNullableMoney(row.total, locale, dictionary)}</Cell>
                <Cell>{formatNullableMoney(row.tax, locale, dictionary)}</Cell>
                <Cell>{row.invoiceAvailable === null ? dictionary.notAvailable : row.invoiceAvailable ? "متاحة" : "غير متاحة"}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-surface px-4 py-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-2 text-xl font-bold text-navy">{value}</p>
    </div>
  );
}

function Header({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-start">{children}</th>;
}

function Cell({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td className={`px-4 py-4 text-sm ${strong ? "font-bold text-navy" : "font-medium text-muted"}`}>
      {children}
    </td>
  );
}

function formatDate(value: string | null, locale: Locale, dictionary: FuelDictionary) {
  if (!value) return dictionary.notAvailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

function formatNullableMoney(value: number | null, locale: Locale, dictionary: FuelDictionary) {
  if (value === null) return dictionary.notAvailable;
  return formatMoney(value, locale);
}

function formatMoney(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`;
}

function formatNullableQuantity(value: number | null, locale: Locale, dictionary: FuelDictionary) {
  if (value === null) return dictionary.notAvailable;
  return formatQuantity(value, locale);
}

function formatQuantity(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}
