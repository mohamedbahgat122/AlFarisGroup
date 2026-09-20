"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import { importDriverOrderReportAction, updateDriverOrderReportRowAction } from "@/features/driver-order-reports/actions";
import { initialDriverOrderReportActionState, initialDriverOrderReportUpdateActionState } from "@/features/driver-order-reports/action-state";
import type { DriverOrderReport, OrderReportRow } from "@/features/driver-order-reports/types";
import { getExpiryStatus, type ExpiryStatus } from "@/features/drivers/expiry";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type Labels = Dictionary["dashboard"]["drivers"];
const PAGE_SIZE = 8;

type Props = {
  locale: Locale;
  organization: AccessibleOrganization;
  report: DriverOrderReport | null;
  dates: string[];
  selectedDateUnavailable: boolean;
  labels: Labels;
  today: string;
};

export function DriverOrderReportsClient({ locale, organization, report, dates, selectedDateUnavailable, labels, today }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const [editRow, setEditRow] = useState<OrderReportRow | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [vehicleType, setVehicleType] = useState("all");
  const [courierType, setCourierType] = useState("all");
  const [page, setPage] = useState(1);
  const [isChangingDate, startDateTransition] = useTransition();
  const permissions = new Set(organization.permissionKeys);
  const canImport = permissions.has("driver_order_reports.import");
  const canReplace = permissions.has("driver_order_reports.replace");
  const canViewDetails = permissions.has("driver_order_reports.details.view");
  const canEdit = permissions.has("driver_order_reports.edit");
  const vehicleTypes = useMemo(() => uniqueValues(report?.rows.map((row) => row.vehicleType) ?? []), [report?.rows]);
  const courierTypes = useMemo(() => uniqueValues(report?.rows.map((row) => row.courierType) ?? []), [report?.rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (report?.rows ?? []).filter((row) =>
      (!query || row.driverFullName.toLowerCase().includes(query) || row.keetaDriverId.toLowerCase().includes(query)) &&
      (vehicleType === "all" || row.vehicleType === vehicleType) &&
      (courierType === "all" || row.courierType === courierType));
  }, [courierType, report?.rows, search, vehicleType]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);

  function handleDateChange(date: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", date);
    setSearch(""); setVehicleType("all"); setCourierType("all"); setPage(1);
    startDateTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const handleImportSuccess = useCallback((message: string, reportDate: string) => {
    setImportOpen(false);
    setToast({ tone: "success", message });
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", reportDate);
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }, [pathname, router, searchParams]);

  const handleEditSuccess = useCallback((message: string) => {
    setEditRow(null);
    setToast({ tone: "success", message });
    router.refresh();
  }, [router]);

  return <>
    <UserToast locale={locale} toast={toast} onDismiss={() => setToast(null)} />
    <div className="flex flex-col gap-4 border-b border-border bg-surface px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2"><AccessBadge>{labels.currentOrganization}</AccessBadge>{!canImport ? <AccessBadge>{labels.viewOnly}</AccessBadge> : null}</div>
        <p className="text-sm font-semibold text-muted">{organization.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-navy">{labels.orderReportsTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{labels.orderReportsDescription}</p>
        {report ? <ReportMetadata locale={locale} labels={labels} report={report} savedCount={dates.length} /> : null}
        {selectedDateUnavailable ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{labels.orderReportSelectedUnavailable}</p> : null}
      </div>
      {canImport ? <Button type="button" onClick={() => setImportOpen(true)} className="w-full gap-2 sm:w-auto"><UploadIcon />{labels.orderReportImportButton}</Button> : null}
    </div>

    <div className="space-y-5 px-5 py-6 sm:px-7">
      {report ? <>
        <ImportSummary report={report} labels={labels} />
        <ReportControls locale={locale} labels={labels} dates={dates} selectedDate={report.reportDate} search={search} vehicleType={vehicleType} courierType={courierType} vehicleTypes={vehicleTypes} courierTypes={courierTypes} disabled={isChangingDate} onDateChange={handleDateChange} onSearchChange={(value) => { setSearch(value); setPage(1); }} onVehicleTypeChange={(value) => { setVehicleType(value); setPage(1); }} onCourierTypeChange={(value) => { setCourierType(value); setPage(1); }} />
         {pageRows.length ? <div className="grid grid-cols-1 gap-4">{pageRows.map((row) => <OrderReportCard key={row.id} locale={locale} labels={labels} row={row} today={today} fuelAvailable={report.fuelMetricsAvailable} distanceAvailable={report.distanceMetricsAvailable} monthlyOrdersAvailable={report.monthlyOrderMetricsAvailable} canViewDetails={canViewDetails} canEdit={canEdit} onEdit={() => setEditRow(row)} />)}</div> : <EmptyState title={labels.orderReportEmptyFilteredTitle} description={labels.orderReportEmptyFilteredDescription} />}
        <Pagination labels={labels} page={visiblePage} totalPages={totalPages} onPrevious={() => setPage((current) => Math.max(1, current - 1))} onNext={() => setPage((current) => Math.min(totalPages, current + 1))} />
      </> : <EmptyState title={labels.orderReportEmptyTitle} description={labels.orderReportEmptyDescription} />}
    </div>

    {importOpen && canImport ? <ImportDialog locale={locale} labels={labels} organization={organization} canReplace={canReplace} onClose={() => setImportOpen(false)} onSuccess={handleImportSuccess} /> : null}
    {editRow && report && canEdit ? <EditReportRowDialog locale={locale} labels={labels} organization={organization} report={report} row={editRow} onClose={() => setEditRow(null)} onSuccess={handleEditSuccess} /> : null}
  </>;
}

function ReportMetadata({ locale, labels, report, savedCount }: { locale: Locale; labels: Labels; report: DriverOrderReport; savedCount: number }) {
  return <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted">
    <div className="flex gap-1"><dt>{labels.orderReportDate}:</dt><dd className="text-navy">{formatDate(report.reportDate, locale)}</dd></div>
    <div className="flex gap-1"><dt>{labels.orderReportImportedAt}:</dt><dd className="text-navy">{formatDateTime(report.importedAt, locale)}</dd></div>
    <div className="flex gap-1"><dt>{labels.orderReportImportedBy}:</dt><dd className="text-navy">{report.importedByFullName ?? labels.notAvailable}</dd></div>
    <div className="flex gap-1"><dd className="text-navy">{labels.orderReportSavedCount.replace("{count}", String(savedCount))}</dd></div>
  </dl>;
}

function ImportSummary({ report, labels }: { report: DriverOrderReport; labels: Labels }) {
  if (!report.invalidRowCount && !report.unmatchedDriverIds.length) return null;
  return <section className="border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
    <div className="flex flex-wrap gap-5"><strong>{labels.orderReportInvalidRows}: {report.invalidRowCount}</strong><strong>{labels.orderReportUnmatchedIds}: {report.unmatchedDriverIds.length}</strong></div>
    {report.unmatchedDriverIds.length ? <p className="mt-2 break-words text-xs" dir="ltr">{report.unmatchedDriverIds.join(", ")}</p> : null}
  </section>;
}

function ReportControls({ locale, labels, dates, selectedDate, search, vehicleType, courierType, vehicleTypes, courierTypes, disabled, onDateChange, onSearchChange, onVehicleTypeChange, onCourierTypeChange }: { locale: Locale; labels: Labels; dates: string[]; selectedDate: string; search: string; vehicleType: string; courierType: string; vehicleTypes: string[]; courierTypes: string[]; disabled: boolean; onDateChange: (value: string) => void; onSearchChange: (value: string) => void; onVehicleTypeChange: (value: string) => void; onCourierTypeChange: (value: string) => void }) {
  const selectedIndex = dates.indexOf(selectedDate); const latest = dates[0] ?? ""; const previous = selectedIndex >= 0 ? dates[selectedIndex + 1] ?? "" : ""; const next = selectedIndex > 0 ? dates[selectedIndex - 1] : "";
  return <section className="grid gap-3 border border-border bg-surface p-4 shadow-[0_16px_45px_rgba(16,35,63,0.05)] md:grid-cols-2 xl:grid-cols-5">
    <SelectControl label={labels.reportDateSelector} value={selectedDate} disabled={disabled} onChange={onDateChange}>{dates.map((date) => <option key={date} value={date}>{formatDate(date, locale)}</option>)}</SelectControl>
    <div className="grid grid-cols-3 gap-2 md:col-span-2 xl:col-span-1 xl:self-end"><DateButton label={labels.reportLatestAction} disabled={disabled || selectedDate === latest} onClick={() => onDateChange(latest)} /><DateButton label={labels.reportPreviousAction} disabled={disabled || !previous} onClick={() => onDateChange(previous)} /><DateButton label={labels.reportNextAction} disabled={disabled || !next} onClick={() => onDateChange(next)} /></div>
    <label className="space-y-2"><span className="block text-sm font-semibold text-navy">{labels.reportSearch}</span><input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={labels.orderReportSearchPlaceholder} className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></label>
    <SelectControl label={labels.orderReportMetrics.vehicleType} value={vehicleType} onChange={onVehicleTypeChange}><option value="all">{labels.reportFilterAll}</option>{vehicleTypes.map((value) => <option key={value} value={value}>{value}</option>)}</SelectControl>
    <SelectControl label={labels.orderReportMetrics.courierType} value={courierType} onChange={onCourierTypeChange}><option value="all">{labels.reportFilterAll}</option>{courierTypes.map((value) => <option key={value} value={value}>{value}</option>)}</SelectControl>
  </section>;
}

function SelectControl({ label, value, disabled = false, onChange, children }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void; children: React.ReactNode }) { return <label className="space-y-2"><span className="block text-sm font-semibold text-navy">{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60">{children}</select></label>; }
function DateButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="min-h-12 rounded-xl border border-border px-2 text-xs font-bold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">{label}</button>; }

function OrderReportCard({ locale, labels, row, today, fuelAvailable, distanceAvailable, monthlyOrdersAvailable, canViewDetails, canEdit, onEdit }: { locale: Locale; labels: Labels; row: OrderReportRow; today: string; fuelAvailable: boolean; distanceAvailable: boolean; monthlyOrdersAvailable: boolean; canViewDetails: boolean; canEdit: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false); const contentId = `order-report-card-${row.id}`;
  return <article className="w-full overflow-hidden rounded-xl border border-border bg-surface shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-bold text-navy">{row.driverFullName}</h2><p className="mt-1 break-all text-xs font-semibold text-muted">{labels.keetaDriverId}: <span dir="ltr">{row.keetaDriverId}</span></p></div>
      <div className="flex items-center gap-3"><MetricBadge label={labels.orderReportMetrics.delivered} value={formatNumber(row.deliveredTasks, locale)} /><MetricBadge label={labels.orderReportMetrics.accepted} value={formatNumber(row.acceptedTasks, locale)} />{canEdit ? <button type="button" title={labels.orderReportEditAction} aria-label={labels.orderReportEditAction} onClick={(event) => { event.stopPropagation(); onEdit(); }} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"><EditIcon /></button> : null}{canViewDetails ? <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)} className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"><ChevronIcon open={open} /></button> : null}</div>
    </div>
    {open && canViewDetails ? <div id={contentId} className="border-t border-border px-5 py-5">
      <IdentitySection row={row} labels={labels} />
      <ExpirySummary locale={locale} labels={labels} expiries={row.driverExpiries} today={today} />
       <MetricSection title={labels.orderReportMetrics.internal} metrics={[
         [labels.orderReportMetrics.fuelQuantity, fuelAvailable ? formatDecimal(row.dailyFuelQuantityLitres, locale) : labels.notAvailable, FuelIcon],
         [labels.orderReportMetrics.fuelAmount, fuelAvailable ? formatMoney(row.dailyFuelAmountSar, locale) : labels.notAvailable, FuelIcon],
         [labels.orderReportMetrics.distance, distanceAvailable && row.dailyDistanceKm != null ? formatDecimal(row.dailyDistanceKm, locale) : labels.notAvailable, DistanceIcon],
         [labels.orderReportMetrics.monthlyFuel, row.monthlyFuelAmountSar == null ? labels.notAvailable : formatMoney(row.monthlyFuelAmountSar, locale), FuelIcon],
         [labels.orderReportMetrics.monthlyDistance, row.monthlyDistanceKm == null ? labels.notAvailable : formatDecimal(row.monthlyDistanceKm, locale), DistanceIcon],
         [labels.orderReportMetrics.monthlyOrders, monthlyOrdersAvailable && row.monthlyDeliveredOrders != null ? formatNumber(row.monthlyDeliveredOrders, locale) : labels.notAvailable, OrdersIcon],
       ]} />
      <MetricSection title={labels.orderReportMetrics.performance} metrics={performanceMetrics(row, labels, locale)} />
    </div> : null}
  </article>;
}

function IdentitySection({ row, labels }: { row: OrderReportRow; labels: Labels }) { return <section><h3 className="text-sm font-bold text-navy">{labels.orderReportMetrics.identity}</h3><div className="mt-3 flex flex-wrap gap-2"><MetadataBadge label={labels.keetaDriverId} value={row.keetaDriverId} /><MetadataBadge label={labels.orderReportNfcNumber} value={row.driverExpiries.nfcNumber ?? labels.notAvailable} /><MetadataBadge label={labels.driverMetadata.actualPlateNumber} value={row.driverExpiries.actualVehiclePlateNumber ?? labels.notAvailable} /><MetadataBadge label={labels.driverMetadata.keetaDashboardPlate} value={row.driverExpiries.keetaDashboardPlateNumber ?? labels.notAvailable} /></div></section>; }
function MetadataBadge({ label, value }: { label: string; value: string }) { return <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-primary-soft/50 px-3 py-2 text-xs text-muted shadow-sm"><span className="font-semibold">{label}</span><span className="font-bold text-navy" dir="auto">{value}</span></span>; }
function MetricBadge({ label, value }: { label: string; value: string }) { return <span className="hidden rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted sm:inline-flex sm:gap-2"><span>{label}</span><strong className="text-navy">{value}</strong></span>; }

function ExpirySummary({ locale, labels, expiries, today }: { locale: Locale; labels: Labels; expiries: OrderReportRow["driverExpiries"]; today: string }) {
  const items = [[labels.iqama, expiries.iqamaExpiryDate], [labels.drivingLicense, expiries.drivingLicenseExpiryDate], [labels.driverCard, expiries.driverCardExpiryDate], [labels.vehicleAuthorization, expiries.vehicleAuthorizationExpiryDate], [labels.operatingCard, expiries.operatingCardExpiryDate]] as const;
  return <section className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-bold text-navy">{labels.orderReportMetrics.documents}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{items.map(([title, date]) => <ExpiryCard key={title} locale={locale} labels={labels} title={title} date={date} today={today} />)}</div></section>;
}
function ExpiryCard({ locale, labels, title, date, today }: { locale: Locale; labels: Labels; title: string; date: string | null; today: string }) { const status = date ? getExpiryStatus(date, today) : null; const visual = expiryVisual(status); return <div className={`min-h-28 rounded-lg border p-3.5 ${visual.card}`}><h4 className="text-xs font-bold text-muted">{title}</h4><p className="mt-3 whitespace-nowrap text-sm font-bold text-navy">{date ? formatDate(date, locale) : labels.notAvailable}</p><p className={`mt-1 text-xs font-bold ${visual.text}`}>{status ? expiryText(status, labels) : labels.notAvailable}</p></div>; }
function expiryVisual(status: ExpiryStatus | null) { if (!status) return { card: "border-border bg-background", text: "text-muted" }; if (status.state === "expired") return { card: "border-danger/25 bg-danger/5", text: "text-danger" }; if (status.state === "today" || status.days <= 30) return { card: "border-amber-200 bg-amber-50/70", text: "text-amber-700" }; return { card: "border-emerald-200 bg-emerald-50/60", text: "text-emerald-700" }; }
function expiryText(status: ExpiryStatus, labels: Labels) { if (status.state === "today") return labels.expiresToday; if (status.state === "expired") return labels.daysExpired.replace("{days}", String(status.days)); return labels.daysRemaining.replace("{days}", String(status.days)); }

function MetricSection({ title, metrics }: { title: string; metrics: [string, string, () => React.ReactNode][] }) { return <section className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-bold text-navy">{title}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{metrics.map(([label, value, Icon]) => <div key={label} className="min-h-20 rounded-lg border border-border bg-background p-2.5"><div className="flex items-center gap-2 text-muted"><Icon /><p className="text-[11px] font-bold leading-4">{label}</p></div><p className="mt-2 break-words text-base font-bold text-navy" dir="auto">{value}</p></div>)}</div></section>; }
function performanceMetrics(row: OrderReportRow, labels: Labels, locale: Locale): [string, string, () => React.ReactNode][] { const m = labels.orderReportMetrics; return [[m.validDuration, value(row.validOnlineDuration, labels), DurationIcon], [m.peakDuration, value(row.peakOnlineDuration, labels), DurationIcon], [m.accepted, formatNumber(row.acceptedTasks, locale), OrdersIcon], [m.restaurantTasks, formatNumber(row.restaurantTasks, locale), OrdersIcon], [m.delivered, formatNumber(row.deliveredTasks, locale), OrdersIcon], [m.averageDelivery, row.averageDeliveryDuration == null ? labels.notAvailable : formatDecimal(row.averageDeliveryDuration, locale), DurationIcon]]; }

function EditReportRowDialog({ locale, labels, organization, report, row, onClose, onSuccess }: { locale: Locale; labels: Labels; organization: AccessibleOrganization; report: DriverOrderReport; row: OrderReportRow; onClose: () => void; onSuccess: (message: string) => void }) {
  const [state, action] = useActionState(updateDriverOrderReportRowAction, initialDriverOrderReportUpdateActionState);
  const [editNote, setEditNote] = useState("");
  const [editNoteTouched, setEditNoteTouched] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null); const handled = useRef<string | null>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus(); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [close]);
  useEffect(() => { if (state.status !== "success" || handled.current === state.submissionId) return; handled.current = state.submissionId; onSuccess(state.message); }, [onSuccess, state]);
  const error = state.status === "error" ? labels.orderReportEditErrors[state.code] : null;
  const editNoteLength = editNote.trim().length;
  const editNoteValid = editNoteLength >= 3 && editNoteLength <= 500;
  const editNoteError = editNoteTouched && !editNoteValid
    ? editNoteLength > 500 ? labels.orderReportEditNoteTooLong : labels.orderReportEditNoteRequired
    : null;
  const m = labels.orderReportMetrics;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="order-report-edit-title" className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]">
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4"><div><h2 id="order-report-edit-title" className="text-xl font-bold text-navy">{labels.orderReportEditTitle}</h2><p className="mt-1 text-sm font-semibold text-navy">{row.driverFullName}</p><p className="mt-1 text-xs text-muted">{labels.orderReportDate}: {formatDate(report.reportDate, locale)}</p></div><button type="button" aria-label={labels.closeDialog} onClick={close} className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary"><CloseIcon /></button></div>
    <form action={action} className="space-y-5 px-5 py-5" onSubmit={(event) => { if (editNoteValid) return; event.preventDefault(); setEditNoteTouched(true); }}>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organization.code} /><input type="hidden" name="reportId" value={report.id} /><input type="hidden" name="rowId" value={row.id} /><input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
      <div className="grid gap-4 sm:grid-cols-2"><EditTextField name="validOnlineDuration" label={m.validDuration} value={row.validOnlineDuration} /><EditTextField name="peakOnlineDuration" label={m.peakDuration} value={row.peakOnlineDuration} /></div>
       <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
         <EditNumberField name="acceptedTasks" label={m.accepted} value={row.acceptedTasks} required />
         <EditNumberField name="restaurantTasks" label={m.restaurantTasks} value={row.restaurantTasks} required />
         <EditNumberField name="deliveredTasks" label={m.delivered} value={row.deliveredTasks} required />
        <EditNumberField name="averageDeliveryDuration" label={m.averageDelivery} value={row.averageDeliveryDuration} />
      </div>
      <input type="hidden" name="largeCompletedTasks" value={row.largeCompletedTasks} />
      <input type="hidden" name="rejectedTasks" value={row.rejectedTasks} />
      <input type="hidden" name="driverRejectedTasks" value={row.driverRejectedTasks} />
      <input type="hidden" name="automaticRejectedTasks" value={row.automaticRejectedTasks} />
      <input type="hidden" name="lateTasks" value={row.lateTasks} />
      <input type="hidden" name="veryLateTasks" value={row.veryLateTasks} />
      <input type="hidden" name="deliveryCancellationRate" value={row.deliveryCancellationRate ?? ""} />
      <input type="hidden" name="nonDeliveryCompletionRate" value={row.nonDeliveryCompletionRate ?? ""} />
      <input type="hidden" name="onTimeDeliveryRate" value={row.onTimeDeliveryRate ?? ""} />
      <input type="hidden" name="largeOrderOnTimeRate" value={row.largeOrderOnTimeRate ?? ""} />
      <input type="hidden" name="over55MinutesRate" value={row.over55MinutesRate ?? ""} />
      <label className="block space-y-2 border-t border-border pt-5 text-sm font-semibold text-navy">
        <span className="block">{labels.orderReportEditNoteLabel}</span>
        <textarea
          name="editNote"
          value={editNote}
          onChange={(event) => setEditNote(event.target.value)}
          onBlur={() => setEditNoteTouched(true)}
          required
          minLength={3}
          maxLength={500}
          rows={4}
          placeholder={labels.orderReportEditNotePlaceholder}
          aria-invalid={Boolean(editNoteError)}
          aria-describedby={editNoteError ? "order-report-edit-note-error" : undefined}
          className="min-h-28 w-full resize-y rounded-lg border border-border bg-white px-3 py-3 text-sm font-normal text-navy outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10"
        />
        {editNoteError ? <span id="order-report-edit-note-error" className="block text-xs font-semibold text-danger">{editNoteError}</span> : null}
      </label>
      {error ? <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null}
      <EditDialogActions labels={labels} onCancel={close} noteValid={editNoteValid} />
    </form>
  </div></div>;
}

function EditTextField({ name, label, value }: { name: string; label: string; value: string | null }) { return <label className="space-y-2 text-sm font-semibold text-navy"><span className="block">{label}</span><input name={name} type="text" maxLength={200} defaultValue={value ?? ""} className="min-h-12 w-full rounded-lg border border-border bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></label>; }
function EditNumberField({ name, label, value, required = false }: { name: string; label: string; value: number | null; required?: boolean }) { return <label className="space-y-2 text-sm font-semibold text-navy"><span className="block">{label}</span><input name={name} type="number" min="0" step="any" required={required} defaultValue={value ?? ""} className="min-h-12 w-full rounded-lg border border-border bg-white px-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" /></label>; }
function EditDialogActions({ labels, onCancel, noteValid }: { labels: Labels; onCancel: () => void; noteValid: boolean }) { const { pending } = useFormStatus(); return <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={pending} className="min-h-12 rounded-lg border border-border bg-surface px-5 text-sm font-semibold text-navy disabled:opacity-60">{labels.cancel}</button><Button type="submit" disabled={pending || !noteValid}>{pending ? labels.orderReportEditSaving : labels.save}</Button></div>; }

function ImportDialog({ locale, labels, organization, canReplace, onClose, onSuccess }: { locale: Locale; labels: Labels; organization: AccessibleOrganization; canReplace: boolean; onClose: () => void; onSuccess: (message: string, reportDate: string) => void }) {
  const [state, action] = useActionState(importDriverOrderReportAction, initialDriverOrderReportActionState);
  const [file, setFile] = useState<File | null>(null); const [replacementDismissed, setReplacementDismissed] = useState(false); const [replacementPending, startReplacement] = useTransition(); const dialogRef = useRef<HTMLDivElement>(null); const inputRef = useRef<HTMLInputElement>(null); const handled = useRef<string | null>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus(); const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [close]);
  useEffect(() => { if (state.status !== "success" || handled.current === state.submissionId) return; handled.current = state.submissionId; onSuccess(state.message ?? labels.orderReportImportSuccess, state.reportDate); }, [labels.orderReportImportSuccess, onSuccess, state]);
  const error = state.status === "error" ? labels.orderReportErrors[state.code as keyof typeof labels.orderReportErrors] ?? labels.orderReportErrors.import_failed : null;
  const showReplacement = state.status === "error" && state.code === "duplicate_saved_report" && canReplace && !replacementDismissed;
  function submit(data: FormData) { setReplacementDismissed(false); action(data); }
  function replace() { if (!file) return; const data = new FormData(); data.append("locale", locale); data.append("organizationCode", organization.code); data.append("replaceExisting", "true"); data.append("file", file); startReplacement(() => action(data)); }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="order-report-import-title" className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)]">
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4"><div><h2 id="order-report-import-title" className="text-xl font-bold text-navy">{labels.orderReportImportButton}</h2><p className="mt-1 text-sm text-muted">{organization.name}</p></div><button type="button" aria-label={labels.closeDialog} onClick={close} className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary"><CloseIcon /></button></div>
    <form action={submit} className="space-y-5 px-5 py-5"><input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organization.code} />
      {showReplacement ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><h3 className="font-bold">{labels.orderReportReplaceTitle}</h3><p className="mt-2 text-sm">{labels.orderReportReplaceMessage.replace("{date}", state.reportDate ? formatDate(state.reportDate, locale) : labels.notAvailable)}</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" disabled={replacementPending} onClick={replace}>{labels.orderReportReplaceConfirmAction}</Button><button type="button" onClick={() => setReplacementDismissed(true)} className="min-h-12 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy">{labels.cancel}</button></div></section> : null}
      <label className="block rounded-xl border border-dashed border-border bg-background p-5"><span className="block text-sm font-bold text-navy">{labels.orderReportFile}</span><span className="mt-1 block text-xs leading-5 text-muted">{labels.orderReportFileDescription}</span><input ref={inputRef} type="file" name="file" accept=".xlsx" required className="mt-4 block w-full text-sm" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReplacementDismissed(true); }} /></label>
      {error && !showReplacement ? <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm font-semibold text-danger">{error}{state.status === "error" && state.details?.length ? `: ${state.details.join(", ")}` : ""}</p> : null}
      <DialogActions cancel={labels.cancel} submit={labels.orderReportProcessAction} onCancel={close} />
    </form>
  </div></div>;
}

function DialogActions({ cancel, submit, onCancel }: { cancel: string; submit: string; onCancel: () => void }) { const { pending } = useFormStatus(); return <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={pending} className="min-h-12 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy disabled:opacity-60">{cancel}</button><Button type="submit" disabled={pending}>{pending ? `${submit}...` : submit}</Button></div>; }
function Pagination({ labels, page, totalPages, onPrevious, onNext }: { labels: Labels; page: number; totalPages: number; onPrevious: () => void; onNext: () => void }) { return <div className="flex flex-col gap-3 border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-muted">{labels.reportPagination.replace("{page}", String(page)).replace("{total}", String(totalPages))}</p><div className="flex gap-2"><button type="button" onClick={onPrevious} disabled={page <= 1} className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-navy disabled:opacity-50">{labels.previous}</button><button type="button" onClick={onNext} disabled={page >= totalPages} className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-navy disabled:opacity-50">{labels.next}</button></div></div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="border border-border bg-surface px-6 py-10 text-center shadow-[0_16px_45px_rgba(16,35,63,0.06)]"><h2 className="text-lg font-bold text-navy">{title}</h2><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>; }
function AccessBadge({ children }: { children: React.ReactNode }) { return <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted">{children}</span>; }
function ChevronIcon({ open }: { open: boolean }) { return <svg viewBox="0 0 24 24" className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>; }
function FuelIcon() { return <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M4 20h14M9 7h4M18 8h1.5A1.5 1.5 0 0 1 21 9.5V16a2 2 0 0 0 2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function DistanceIcon() { return <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 19c3-8 5-12 8-12 2.5 0 3 3 5 3 1.2 0 2.2-1 3-3" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 19h3M17 7h3v3" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function OrdersIcon() { return <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h3" strokeLinecap="round" strokeLinejoin="round" /><path d="m15 16 1.5 1.5L19 15" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function DurationIcon() { return <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function UploadIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 15v4h16v-4" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function EditIcon() { return <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function uniqueValues(values: (string | null)[]) { return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].sort((a, b) => a.localeCompare(b)); }
function value(input: string | null, labels: Labels) { return input?.trim() || labels.notAvailable; }
function formatNumber(input: number, locale: Locale) { return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(input); }
function formatDecimal(input: number, locale: Locale) { return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 2 }).format(input); }
function formatMoney(input: number, locale: Locale) { return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(input); }
function formatPercent(input: number | null, locale: Locale) { return input == null ? "-" : `${formatDecimal(input, locale)}%`; }
function formatDate(input: string, locale: Locale) { return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Riyadh" }).format(new Date(`${input}T12:00:00+03:00`)); }
function formatDateTime(input: string, locale: Locale) { return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(input)); }
