"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { KafaratplusFuelManagementRow } from "@/features/fuel/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Locale } from "@/types/locale";

type FuelDictionary = Dictionary["dashboard"]["fuel"];

export function FuelManagementClient({
  dictionary,
  fuelDate,
  integrationMessage,
  locale,
  organization,
  rows,
}: {
  dictionary: FuelDictionary;
  fuelDate: string;
  integrationMessage?: string;
  locale: Locale;
  organization: AccessibleOrganization;
  rows: KafaratplusFuelManagementRow[];
}) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);

    try {
      const response = await fetch(
        `/${locale}/dashboard/organizations/${organization.code}/fuel/manage/export?date=${encodeURIComponent(fuelDate)}`,
      );
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = getDownloadFilename(response) ?? `kafaratplus-fuel-${fuelDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">
          {dictionary.managementTitle}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {dictionary.managementDescription}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-muted">
          <span className="rounded-full border border-border bg-background px-3 py-1">
            {organization.name}
          </span>
          <span className="rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-primary">
            {fuelDate}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
            Kafaratplus
          </span>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-full border border-primary/20 bg-white px-3 py-1 text-primary transition hover:bg-primary-soft disabled:opacity-60"
          >
            {exporting ? dictionary.exportingExcel : dictionary.exportExcel}
          </button>
        </div>
      </div>
      <div className="px-5 py-6 sm:px-7">
        {integrationMessage ? (
          <IntegrationNotice message={integrationMessage} />
        ) : rows.length === 0 ? (
          <div className="border border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm font-semibold text-muted">
              {dictionary.emptyManagement}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[1600px] border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  <Header>{dictionary.table.localDriver}</Header><Header>{dictionary.table.externalDriver}</Header><Header>{dictionary.table.plate}</Header><Header>{dictionary.table.vehicle}</Header><Header>{dictionary.table.brandModel}</Header><Header>{dictionary.table.operations}</Header><Header>{dictionary.table.litres}</Header><Header>{dictionary.table.cost}</Header><Header>{dictionary.table.product}</Header><Header>{dictionary.table.provider}</Header><Header>{dictionary.table.odometer}</Header><Header>{dictionary.table.branch}</Header><Header>{dictionary.table.id}</Header><Header>{dictionary.table.nfc}</Header>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <Cell strong>{row.localDriver ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.kafaratplusDriver ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.licencePlate ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.vehicle ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.brandModel ?? dictionary.notAvailable}</Cell>
                    <Cell>{formatNumber(row.operationCount, locale, dictionary)}</Cell>
                    <Cell>{formatQuantity(row.totalQuantity, locale)}</Cell>
                    <Cell strong>{formatMoney(row.total, locale, dictionary)}</Cell>
                    <Cell>{row.fuelProducts.join(" / ") || dictionary.notAvailable}</Cell>
                    <Cell>{row.latestProvider ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.latestOdometer ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.branch ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.localDriverIqama ?? row.localDriverId ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.nfcIdentifier ?? dictionary.notAvailable}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function IntegrationNotice({ message }: { message: string }) {
  return (
    <div className="border border-amber-200 bg-amber-50 px-6 py-10 text-center">
      <p className="text-sm font-bold text-amber-800">{message}</p>
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

function formatMoney(value: number | null, locale: Locale, dictionary: FuelDictionary) {
  if (value === null) return dictionary.notAvailable;
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`;
}

function formatNumber(value: number | null, locale: Locale, dictionary: FuelDictionary) {
  if (value === null) return dictionary.notAvailable;
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(value);
}

function formatQuantity(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}

function getDownloadFilename(response: Response) {
  const disposition = response.headers.get("Content-Disposition");
  const encodedFilename = disposition?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  if (encodedFilename) return decodeURIComponent(encodedFilename);
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? null;
}
