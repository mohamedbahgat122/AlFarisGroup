"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  addManualFuelIncreaseAction,
  openDriverFuelAction,
  reviewFuelIncreaseRequestAction,
} from "@/features/fuel/actions";
import type { FuelActionState, FuelManagementRow } from "@/features/fuel/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Locale } from "@/types/locale";

type FuelDictionary = Dictionary["dashboard"]["fuel"];
type DialogState =
  | { mode: "open"; row: FuelManagementRow }
  | { mode: "increase"; row: FuelManagementRow }
  | { mode: "review"; row: FuelManagementRow }
  | null;

const initialState: FuelActionState = { status: "idle" };

export function FuelManagementClient({
  locale,
  dictionary,
  organization,
  rows,
  fuelDate,
}: {
  locale: Locale;
  dictionary: FuelDictionary;
  organization: AccessibleOrganization;
  rows: FuelManagementRow[];
  fuelDate: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const canManage = organization.permissionKeys.includes("fuel.manage");
  const canReview = organization.permissionKeys.includes("fuel.increase.review");

  function handleSuccess() {
    setDialog(null);
    setToast(dictionary.success);
    router.refresh();
  }

  async function handleExport() {
    if (exporting) {
      return;
    }

    setErrorToast(null);
    setExporting(true);

    try {
      const response = await fetch(
        `/${locale}/dashboard/organizations/${organization.code}/fuel/manage/export?date=${encodeURIComponent(
          fuelDate,
        )}`,
      );

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = getDownloadFilename(response) ?? `fuel-management-${fuelDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      setErrorToast(dictionary.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {toast ? (
        <div className="fixed bottom-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 shadow-lg ltr:right-5 rtl:left-5">
          {toast}
        </div>
      ) : null}
      {errorToast ? (
        <div className="fixed bottom-5 z-50 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-lg ltr:right-5 rtl:left-5">
          {errorToast}
        </div>
      ) : null}
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <h1 className="text-2xl font-bold text-navy">
          {dictionary.managementTitle}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {dictionary.managementDescription}
        </p>
        <form className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            name="date"
            defaultValue={fuelDate}
            className="min-h-11 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
          <Button type="submit">{dictionary.filters.apply}</Button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-white px-5 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-70"
          >
            <DownloadIcon />
            {exporting ? dictionary.exportingExcel : dictionary.exportExcel}
          </button>
        </form>
      </div>
      <div className="px-5 py-6 sm:px-7">
        {rows.length === 0 ? (
          <div className="border border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm font-semibold text-muted">
              {dictionary.emptyManagement}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[1180px] border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  <Header>{dictionary.driver}</Header>
                  <Header>{dictionary.driverId}</Header>
                  <Header>{dictionary.vehicle}</Header>
                  <Header>{dictionary.plate}</Header>
                  <Header>{dictionary.openingFuel}</Header>
                  <Header>{dictionary.approvedIncreases}</Header>
                  <Header>{dictionary.pendingRequest}</Header>
                  <Header>{dictionary.totalFuel}</Header>
                  <Header>{dictionary.actions}</Header>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.driverId}>
                    <Cell strong>{row.driverName}</Cell>
                    <Cell>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
                    <Cell>{formatVehicleLabel(row.vehicleLabel, dictionary)}</Cell>
                    <Cell>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
                    <Cell>
                      {row.openingAmountSar > 0
                        ? `${dictionary.fuelOpened}: ${formatSar(row.openingAmountSar, locale)}`
                        : dictionary.fuelNotOpened}
                    </Cell>
                    <Cell>
                      {formatSar(row.approvedIncreaseAmountSar, locale)}
                    </Cell>
                    <Cell>
                      {row.pendingRequest ? (
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                            {dictionary.pendingReview}
                          </span>
                          <p className="text-xs text-muted">
                            {formatSar(row.pendingRequest.requestedAmountSar, locale)}
                          </p>
                          <p className="max-w-48 truncate text-xs text-muted">
                            {row.pendingRequest.reason}
                          </p>
                        </div>
                      ) : (
                        dictionary.notAvailable
                      )}
                    </Cell>
                    <Cell strong>{formatSar(row.dailyTotalSar, locale)}</Cell>
                    <Cell>
                      <div className="flex flex-wrap gap-2">
                        {canManage && row.openingAmountSar <= 0 ? (
                          <SmallButton onClick={() => setDialog({ mode: "open", row })}>
                            {dictionary.openFuel}
                          </SmallButton>
                        ) : null}
                        {canManage && row.openingAmountSar > 0 ? (
                          <SmallButton onClick={() => setDialog({ mode: "increase", row })}>
                            {dictionary.addIncrease}
                          </SmallButton>
                        ) : null}
                        {canReview && row.pendingRequest ? (
                          <SmallButton onClick={() => setDialog({ mode: "review", row })}>
                            {dictionary.reviewRequest}
                          </SmallButton>
                        ) : null}
                      </div>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog ? (
        <FuelDialog
          locale={locale}
          dictionary={dictionary}
          organization={organization}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSuccess={handleSuccess}
        />
      ) : null}
    </>
  );
}

function FuelDialog({
  locale,
  dictionary,
  organization,
  dialog,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: FuelDictionary;
  organization: AccessibleOrganization;
  dialog: Exclude<DialogState, null>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, action] = useActionState(
    dialog.mode === "open"
      ? openDriverFuelAction
      : dialog.mode === "increase"
        ? addManualFuelIncreaseAction
        : reviewFuelIncreaseRequestAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
    }
  }, [onSuccess, state.status]);

  const row = dialog.row;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-navy">
            {dialog.mode === "open"
              ? dictionary.openFuelTitle
              : dialog.mode === "increase"
                ? dictionary.addIncrease
                : dictionary.reviewRequest}
          </h2>
          <p className="mt-1 text-sm text-muted">{row.driverName}</p>
        </div>
        <form ref={formRef} action={action} className="space-y-4 p-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="organizationCode" value={organization.code} />
          <input type="hidden" name="driverId" value={row.driverId} />
          <input type="hidden" name="fuelDate" value={row.fuelDate} />
          {dialog.mode === "review" && row.pendingRequest ? (
            <input type="hidden" name="requestId" value={row.pendingRequest.id} />
          ) : null}
          <ReadOnly label={dictionary.driverId} value={row.driverIdentifier ?? "-"} />
          <ReadOnly label={dictionary.vehicle} value={formatVehicleLabel(row.vehicleLabel, dictionary)} />
          <ReadOnly label={dictionary.plate} value={row.vehiclePlate ?? dictionary.notAvailable} />
          <ReadOnly label={dictionary.date} value={row.fuelDate} />
          {dialog.mode === "review" && row.pendingRequest ? (
            <>
              <ReadOnly
                label={dictionary.requestedAmount}
                value={formatSar(row.pendingRequest.requestedAmountSar, locale)}
              />
              <ReadOnly label={dictionary.reason} value={row.pendingRequest.reason} />
              <ReadOnly
                label={dictionary.currentDailyTotal}
                value={formatSar(row.dailyTotalSar, locale)}
              />
              <FormField
                id="approvedAmountSar"
                name="approvedAmountSar"
                label={dictionary.approvedAmount}
                type="number"
                min="0.01"
                step="0.01"
              />
              <FormField
                id="reviewNote"
                name="reviewNote"
                label={dictionary.reviewNote}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                  {dictionary.cancel}
                </button>
                <SubmitButton name="decision" value="rejected">
                  {dictionary.reject}
                </SubmitButton>
                <SubmitButton name="decision" value="approved">
                  {dictionary.approve}
                </SubmitButton>
              </div>
            </>
          ) : (
            <>
              <FormField
                id="amountSar"
                name="amountSar"
                label={
                  dialog.mode === "open"
                    ? dictionary.openingAmount
                    : dictionary.increaseAmount
                }
                type="number"
                min="0.01"
                step="0.01"
                required
              />
              <FormField
                id="note"
                name="note"
                label={dictionary.note}
                required={dialog.mode === "increase"}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
                  {dictionary.cancel}
                </button>
                <SubmitButton>
                  {dialog.mode === "open"
                    ? dictionary.confirmOpenFuel
                    : dictionary.addIncrease}
                </SubmitButton>
              </div>
            </>
          )}
          {state.status === "error" || state.status === "validation_error" ? (
            <p className="text-sm font-semibold text-danger">
              {dictionary.errors[state.code as keyof typeof dictionary.errors] ??
                dictionary.errors.action_failed}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function SubmitButton({
  children,
  name,
  value,
}: {
  children: ReactNode;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" name={name} value={value} disabled={pending}>
      {pending ? "..." : children}
    </Button>
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

function SmallButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
    >
      {children}
    </button>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-navy">{value}</p>
    </div>
  );
}

function formatSar(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
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

function getDownloadFilename(response: Response) {
  const disposition = response.headers.get("Content-Disposition");
  const encodedFilename = disposition?.match(/filename\*=UTF-8''([^;]+)/)?.[1];

  if (encodedFilename) {
    return decodeURIComponent(encodedFilename);
  }

  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? null;
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
    </svg>
  );
}
