"use client";

import { Fragment, useState } from "react";
import { loadFuelReportDetailsAction } from "@/features/fuel/report-details-actions";
import type {
  FuelReportDetailDay,
  FuelReportDetailItem,
  FuelReportDetails,
  FuelReportRow,
} from "@/features/fuel/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type FuelDictionary = Dictionary["dashboard"]["fuel"];
type DetailsState =
  | { status: "loading" }
  | { status: "success"; details: FuelReportDetails }
  | { status: "error" };

export function FuelReportsTable({
  dictionary,
  fromDate,
  locale,
  organizationCode,
  rows,
  toDate,
}: {
  dictionary: FuelDictionary;
  fromDate: string;
  locale: Locale;
  organizationCode: string;
  rows: FuelReportRow[];
  toDate: string;
}) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [detailsByRowKey, setDetailsByRowKey] = useState<
    Record<string, DetailsState>
  >({});

  async function toggleRow(row: FuelReportRow) {
    if (openRowKey === row.key) {
      setOpenRowKey(null);
      return;
    }

    setOpenRowKey(row.key);
    await loadDetails(row, false);
  }

  async function loadDetails(row: FuelReportRow, force: boolean) {
    if (!force && detailsByRowKey[row.key]) {
      return;
    }

    setDetailsByRowKey((current) => ({
      ...current,
      [row.key]: { status: "loading" },
    }));

    const result = await loadFuelReportDetailsAction({
      driverId: row.driverId,
      fromDate,
      organizationCode,
      toDate,
    });

    setDetailsByRowKey((current) => ({
      ...current,
      [row.key]:
        result.status === "success"
          ? { status: "success", details: result.details }
          : { status: "error" },
    }));
  }

  return (
    <div className="overflow-x-auto border border-border bg-surface">
      <table className="w-full min-w-[1180px] border-collapse text-start">
        <thead className="bg-background text-xs font-bold uppercase text-muted">
          <tr>
            <th className="w-14 px-3 py-3 text-center">
              <span className="sr-only">{dictionary.details}</span>
            </th>
            {[
              dictionary.driver,
              dictionary.driverId,
              dictionary.vehicle,
              dictionary.plate,
              dictionary.activeFuelDays,
              dictionary.totalOpeningFuel,
              dictionary.totalApprovedIncreases,
              dictionary.pendingRequests,
              dictionary.periodTotal,
            ].map((heading) => (
              <th key={heading} className="px-4 py-3 text-start">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const isOpen = openRowKey === row.key;
            const details = detailsByRowKey[row.key];

            return (
              <Fragment key={row.key}>
                <tr>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? dictionary.collapseDetailsLabel
                          : dictionary.expandDetailsLabel
                      }
                      onClick={() => void toggleRow(row)}
                      className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-white text-muted transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <ChevronIcon open={isOpen} />
                    </button>
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-navy">
                    {row.driverName}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {row.driverIdentifier ?? dictionary.notAvailable}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {formatVehicleLabel(row.vehicleLabel, dictionary)}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    <span>{row.vehiclePlate ?? dictionary.notAvailable}</span>
                    {row.hasMultipleVehicles ? (
                      <span className="mt-1 block rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                        {dictionary.multipleVehicles}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {row.activeFuelDays}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {formatSar(row.totalOpeningAmountSar, locale)}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {formatSar(row.totalApprovedIncreaseAmountSar, locale)}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted">
                    {row.pendingRequestCount}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-navy">
                    {formatSar(row.periodTotalSar, locale)}
                  </td>
                </tr>
                {isOpen ? (
                  <tr>
                    <td colSpan={10} className="bg-background/60 px-4 py-4">
                      <DetailsPanel
                        dictionary={dictionary}
                        fromDate={fromDate}
                        locale={locale}
                        row={row}
                        state={details ?? { status: "loading" }}
                        toDate={toDate}
                        onRetry={() => void loadDetails(row, true)}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailsPanel({
  dictionary,
  fromDate,
  locale,
  row,
  state,
  toDate,
  onRetry,
}: {
  dictionary: FuelDictionary;
  fromDate: string;
  locale: Locale;
  row: FuelReportRow;
  state: DetailsState;
  toDate: string;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-5 text-sm font-semibold text-muted">
        {dictionary.loadingDetails}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
        <span>{dictionary.detailsLoadFailed}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"
        >
          {dictionary.retry}
        </button>
      </div>
    );
  }

  const days = state.details.days;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-bold text-navy">{dictionary.details}</h3>
          <p className="mt-1 text-xs font-semibold text-muted">
            {row.driverName} - {fromDate} / {toDate}
          </p>
        </div>
        <p className="text-sm font-bold text-navy">
          {dictionary.periodTotal}: {formatSar(row.periodTotalSar, locale)}
        </p>
      </div>
      {days.length === 0 ? (
        <p className="py-6 text-sm font-semibold text-muted">
          {dictionary.noDetails}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {days.map((day) => (
            <DayDetails
              key={day.fuelDate}
              day={day}
              dictionary={dictionary}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DayDetails({
  day,
  dictionary,
  locale,
}: {
  day: FuelReportDetailDay;
  dictionary: FuelDictionary;
  locale: Locale;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h4 className="text-sm font-bold text-navy">
            {formatDate(day.fuelDate, locale)}
          </h4>
          <p className="mt-1 text-xs font-semibold text-muted">
            {dictionary.plate}:{" "}
            {day.vehiclePlate ?? dictionary.vehicleSnapshotMissing}
          </p>
        </div>
        <div className="grid gap-2 text-sm font-semibold text-muted sm:grid-cols-3">
          <span>
            {dictionary.openingFuel}: {formatSar(day.openingAmountSar, locale)}
          </span>
          <span>
            {dictionary.approvedIncreases}:{" "}
            {formatSar(day.approvedIncreaseAmountSar, locale)}
          </span>
          <span className="font-bold text-navy">
            {dictionary.totalFuel}: {formatSar(day.dailyTotalSar, locale)}
          </span>
        </div>
      </div>
      <ol className="mt-3 space-y-3">
        {day.items.map((item) => (
          <TimelineItem
            key={item.id}
            dictionary={dictionary}
            item={item}
            locale={locale}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineItem({
  dictionary,
  item,
  locale,
}: {
  dictionary: FuelDictionary;
  item: FuelReportDetailItem;
  locale: Locale;
}) {
  const accentClass = getAccentClass(item.type);
  const actorName = item.actor?.displayName ?? dictionary.unknownActor;
  const actorMeta = item.actor?.jobTitle ?? item.actor?.role;

  return (
    <li className="grid gap-3 rounded-xl border border-border bg-background/50 p-4 sm:grid-cols-[auto_1fr]">
      <span
        className={`mt-1 flex size-9 items-center justify-center rounded-full border text-xs font-black ${accentClass}`}
        aria-hidden="true"
      >
        {getOperationMark(item.type)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h5 className="text-sm font-bold text-navy">
              {getOperationTitle(dictionary, item.type)}
            </h5>
            <p className="mt-1 text-xs font-semibold text-muted">
              {formatDateTime(item.occurredAt, locale)}
            </p>
          </div>
          <p className="text-sm font-bold text-navy">
            {formatOperationAmount(dictionary, item, locale)}
          </p>
        </div>
        <div className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
          <p>
            <span className="font-bold text-navy">
              {dictionary.performedBy}:{" "}
            </span>
            {actorName}
            {actorMeta ? (
              <span className="mt-1 block text-xs font-semibold">
                {actorMeta}
              </span>
            ) : null}
          </p>
          <p>
            <span className="font-bold text-navy">{dictionary.source}: </span>
            {getSourceLabel(dictionary, item)}
          </p>
          {item.reason ? (
            <p>
              <span className="font-bold text-navy">
                {dictionary.reason}:{" "}
              </span>
              {item.reason}
            </p>
          ) : null}
          {item.note ? (
            <p>
              <span className="font-bold text-navy">{dictionary.note}: </span>
              {item.note}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function formatOperationAmount(
  dictionary: FuelDictionary,
  item: FuelReportDetailItem,
  locale: Locale,
) {
  if (
    item.type === "requested_increase_approved" ||
    item.type === "requested_increase_rejected" ||
    item.type === "requested_increase_pending" ||
    item.type === "requested_increase_submitted"
  ) {
    const requested = `${dictionary.requestedAmount}: ${formatSar(
      item.requestedAmountSar ?? 0,
      locale,
    )}`;
    const approved =
      item.approvedAmountSar !== null
        ? ` - ${dictionary.approvedAmount}: ${formatSar(
            item.approvedAmountSar,
            locale,
          )}`
        : "";

    return `${requested}${approved}`;
  }

  return formatSar(item.amountSar ?? 0, locale);
}

function getOperationTitle(
  dictionary: FuelDictionary,
  type: FuelReportDetailItem["type"],
) {
  const titles: Record<FuelReportDetailItem["type"], string> = {
    opening: dictionary.openingOperation,
    manual_increase: dictionary.manualIncreaseOperation,
    requested_increase_submitted: dictionary.requestIncreaseOperation,
    requested_increase_approved: dictionary.approvedRequestOperation,
    requested_increase_rejected: dictionary.rejectedRequestOperation,
    requested_increase_pending: dictionary.requestIncreaseOperation,
  };

  return titles[type];
}

function getSourceLabel(
  dictionary: FuelDictionary,
  item: FuelReportDetailItem,
) {
  if (item.type === "manual_increase") {
    return dictionary.manualIncreaseSource;
  }

  if (item.type.startsWith("requested_increase")) {
    return dictionary.requestedIncreaseSource;
  }

  return dictionary.openingFuel;
}

function getAccentClass(type: FuelReportDetailItem["type"]) {
  if (type === "requested_increase_approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (type === "requested_increase_rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (type === "requested_increase_pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (type === "manual_increase") {
    return "border-navy/15 bg-navy/5 text-navy";
  }

  return "border-primary/20 bg-primary-soft text-primary";
}

function getOperationMark(type: FuelReportDetailItem["type"]) {
  if (type === "requested_increase_rejected") return "!";
  if (type === "requested_increase_pending") return "?";
  if (type === "requested_increase_approved") return "+";
  if (type === "manual_increase") return "+";
  return "✓";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-5 transition ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatSar(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`;
}

function formatVehicleLabel(
  value: string | null,
  dictionary: FuelDictionary,
) {
  if (!value) {
    return dictionary.notAvailable;
  }

  return dictionary.vehicleTypes[value as keyof typeof dictionary.vehicleTypes] ?? value;
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(new Date(`${value}T00:00:00+03:00`));
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
