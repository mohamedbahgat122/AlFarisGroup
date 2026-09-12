"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { reviewDriverAppRequestAction, updateOdometerShiftReadingAction, resetVehicleOdometerBaselineAction } from "@/features/app-requests/actions";
import {
  createMaintenanceJobMaterialAction,
  deleteMaintenanceJobMaterialAction,
  updateMaintenanceJobMaterialAction,
} from "@/features/maintenance-materials/actions";
import type {
  AppRequestActionState,
  AppRequestsDictionary,
  AppRequestRow,
  DriverAppRequestType,
  MaintenanceJobExecution,
  MaintenanceProviderOption,
  OdometerShiftRow,
} from "@/features/app-requests/types";
import type {
  MaintenanceJobMaterial,
  MaintenanceMaterialActionState,
  MaintenanceMaterialCategory,
  MaintenanceMaterialUnit,
} from "@/features/maintenance-materials/types";
import type { Locale } from "@/types/locale";

const initialState: AppRequestActionState = { status: "idle" };
const initialMaterialState: MaintenanceMaterialActionState = { status: "idle" };

type ImagePreviewState = {
  url: string;
  title: string;
  subtitle: string;
};

export function AppRequestsTable({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  requestType,
  rows,
  canReview,
  canAssignMaintenance = false,
  maintenanceProviderOptions = [],
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  requestType: DriverAppRequestType;
  rows: AppRequestRow[];
  canReview: boolean;
  canAssignMaintenance?: boolean;
  maintenanceProviderOptions?: MaintenanceProviderOption[];
}) {
  const [selected, setSelected] = useState<AppRequestRow | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<ImagePreviewState | null>(null);
  const router = useRouter();
  const isMeeting = requestType === "meeting";
  const showsExecutionStatus =
    requestType === "maintenance" || requestType === "oil_change";
  const tableClassName = isMeeting
    ? "min-w-[1780px] border-collapse text-start"
    : requestType === "leave"
      ? "table-fixed w-full min-w-[1460px] border-collapse text-start"
      : showsExecutionStatus
        ? "table-auto w-max min-w-full border-collapse text-start"
        : "table-fixed w-full min-w-[1100px] border-collapse text-start";

  useEffect(() => {
    setSelected((current) =>
      current ? rows.find((row) => row.id === current.id) ?? current : null,
    );
  }, [rows]);

  return (
    <>
      <div className="w-full overflow-x-auto border border-border bg-surface">
        <table className={tableClassName}>
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <Header className={isMeeting ? "w-[260px] min-w-[260px] whitespace-nowrap" : requestType === "maintenance" ? "w-[170px] min-w-[150px] whitespace-nowrap" : requestType === "leave" ? "w-72 whitespace-nowrap" : undefined}>{dictionary.driver}</Header>
              <Header className={isMeeting ? "w-[180px] min-w-[180px] whitespace-nowrap" : requestType === "maintenance" ? "w-[180px] min-w-[180px] whitespace-nowrap pe-4" : requestType === "leave" ? "w-44 whitespace-nowrap" : undefined}>{dictionary.driverId}</Header>
              {requestType === "leave" && <Header className="w-48 whitespace-nowrap">{dictionary.columns.organization}</Header>}
              {requestType !== "leave" && <Header className={isMeeting ? "w-[150px] min-w-[150px]" : requestType === "maintenance" ? "w-[110px] min-w-[110px] whitespace-nowrap ps-4" : undefined}>{dictionary.vehicle}</Header>}
              {requestType !== "leave" && <Header className={isMeeting ? "w-[130px] min-w-[130px] whitespace-nowrap" : requestType === "maintenance" ? "w-[100px] min-w-[100px] whitespace-nowrap" : undefined}>{dictionary.plate}</Header>}
              {requestType === "leave" && (
                <>
                  <Header className="w-36 whitespace-nowrap">{dictionary.columns.leaveType}</Header>
                  <Header className="w-36 whitespace-nowrap">{dictionary.columns.startDate}</Header>
                  <Header className="w-36 whitespace-nowrap">{dictionary.columns.endDate}</Header>
                  <Header className="w-24 whitespace-nowrap">{dictionary.columns.days}</Header>
                </>
              )}
              {requestType === "maintenance" && (
                <>
                  <Header className="w-[120px] min-w-[110px]">{dictionary.columns.category}</Header>
                  <Header className="w-[90px] min-w-[80px] whitespace-nowrap">{dictionary.columns.urgency}</Header>
                  <Header className="w-[220px] min-w-[160px] max-w-[240px]">{dictionary.columns.description}</Header>
                </>
              )}
              {requestType === "meeting" && (
                <>
                  <Header className="w-[220px] min-w-[220px]">{dictionary.columns.meetingWith}</Header>
                  <Header className="w-[220px] min-w-[220px]">{dictionary.columns.subject}</Header>
                  <Header className="w-[150px] min-w-[150px] whitespace-nowrap">{dictionary.columns.preferredDate}</Header>
                  <Header className="w-[190px] min-w-[190px] whitespace-nowrap">{dictionary.columns.scheduledAt}</Header>
                </>
              )}
              {requestType === "oil_change" && (
                <>
                  <Header className="min-w-[130px] whitespace-nowrap">{dictionary.columns.odometerReading}</Header>
                  <Header className="min-w-[160px] whitespace-nowrap">{dictionary.columns.scheduledAt}</Header>
                </>
              )}
              <Header className={isMeeting ? "w-[190px] min-w-[190px] whitespace-nowrap" : requestType === "leave" ? "w-44 whitespace-nowrap" : showsExecutionStatus ? "w-[180px] min-w-[180px] whitespace-nowrap" : undefined}>{dictionary.requestDate}</Header>
              {showsExecutionStatus ? (
                <Header className={requestType === "maintenance" ? "w-[150px] min-w-[140px] whitespace-nowrap ps-6" : "w-44 whitespace-nowrap"}>
                  {dictionary.columns.executionStatus}
                </Header>
              ) : null}
              {showsExecutionStatus ? (
                <Header className={requestType === "maintenance" ? "w-[90px] min-w-[90px] whitespace-nowrap" : "w-36 whitespace-nowrap"}>
                  {dictionary.columns.invoice}
                </Header>
              ) : null}
              <Header className={isMeeting ? "w-[150px] min-w-[150px] whitespace-nowrap" : requestType === "maintenance" ? "w-[150px] min-w-[140px] whitespace-nowrap ps-4 pe-4" : requestType === "leave" ? "w-36 whitespace-nowrap" : undefined}>{dictionary.status}</Header>
              <Header className={isMeeting ? "w-[190px] min-w-[190px]" : requestType === "maintenance" ? "w-[130px] min-w-[130px] whitespace-nowrap ps-4 pe-4" : requestType === "leave" ? "w-40 whitespace-nowrap" : undefined}>{dictionary.reviewer}</Header>
              <Header className={isMeeting ? "w-[120px] min-w-[120px] whitespace-nowrap" : requestType === "maintenance" ? "w-[100px] min-w-[100px] whitespace-nowrap" : requestType === "leave" ? "w-32 whitespace-nowrap" : undefined}>{dictionary.actions}</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell strong>
                  <DriverNameCell name={row.driverName} identifier={requestType === "maintenance" ? null : row.driverIdentifier} />
                </Cell>
                <Cell nowrap className={requestType === "maintenance" ? "pe-4" : undefined}>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
                {requestType === "leave" && (
                  <Cell truncate title={row.organizationName ?? dictionary.notAvailable}>{row.organizationName ?? dictionary.notAvailable}</Cell>
                )}
                {requestType !== "leave" && (
                  <>
                    <Cell nowrap={requestType === "maintenance"} className={isMeeting ? "whitespace-normal leading-5" : requestType === "maintenance" ? "ps-4" : undefined}>{row.vehicleLabel ?? dictionary.notAvailable}</Cell>
                    <Cell nowrap>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
                  </>
                )}
                {renderRequestCells(row, requestType, dictionary, locale)}
                <Cell nowrap>{formatDateTime(row.submittedAt, locale)}</Cell>
                {showsExecutionStatus ? (
                  <Cell nowrap className={requestType === "maintenance" ? "ps-6" : undefined}>
                    <ExecutionStatusBadge
                      job={row.maintenanceJob}
                      requestType={requestType}
                      dictionary={dictionary}
                    />
                  </Cell>
                ) : null}
                {showsExecutionStatus ? (
                  <Cell nowrap>
                    <InvoiceCell
                      job={row.maintenanceJob}
                      dictionary={dictionary}
                      onPreview={() => {
                        const invoiceUrl = getMaintenanceInvoiceUrl(row.maintenanceJob);
                        if (!invoiceUrl) return;
                        setInvoicePreview({
                          url: invoiceUrl,
                          title: dictionary.columns.invoice,
                          subtitle: row.maintenanceJob?.invoiceFileName ?? row.driverName,
                        });
                      }}
                    />
                  </Cell>
                ) : null}
                <Cell nowrap className={requestType === "maintenance" ? "ps-4 pe-4" : undefined}>
                  <StatusBadge status={row.status} dictionary={dictionary} />
                </Cell>
                <Cell truncate={!isMeeting} title={row.reviewerName ?? dictionary.notAvailable} className={isMeeting ? "whitespace-normal leading-5" : requestType === "maintenance" ? "ps-4 pe-4 whitespace-nowrap" : undefined}>{row.reviewerName ?? dictionary.notAvailable}</Cell>
                <Cell nowrap>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-navy hover:bg-primary-soft"
                  >
                    {dictionary.details}
                  </button>
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <ReviewDialog
          locale={locale}
          dictionary={dictionary}
          organizationCode={organizationCode}
          organizationId={organizationId}
          request={selected}
          canReview={canReview}
          canAssignMaintenance={canAssignMaintenance}
          maintenanceProviderOptions={maintenanceProviderOptions}
          onPreviewInvoice={(job, subtitle) => {
            const invoiceUrl = getMaintenanceInvoiceUrl(job);
            if (!invoiceUrl) return;
            setInvoicePreview({
              url: invoiceUrl,
              title: dictionary.columns.invoice,
              subtitle,
            });
          }}
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      ) : null}
      {invoicePreview ? (
        <SecureImagePreviewDialog
          imageUrl={invoicePreview.url}
          title={invoicePreview.title}
          subtitle={invoicePreview.subtitle}
          errorText={dictionary.imageLoadFailed}
          onClose={() => setInvoicePreview(null)}
        />
      ) : null}
    </>
  );
}

export function OdometerTable({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  rows,
  canReview,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  rows: OdometerShiftRow[];
  canReview: boolean;
}) {
  const [selected, setSelected] = useState<OdometerShiftRow | null>(null);
  const [selectedEdit, setSelectedEdit] = useState<OdometerShiftRow | null>(null);
  const [selectedReset, setSelectedReset] = useState<OdometerShiftRow | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string; subtitle: string } | null>(null);
  const router = useRouter();

  return (
    <>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="min-w-[2080px] table-fixed border-collapse text-start">
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <Header className="w-72 whitespace-nowrap">{dictionary.driver}</Header>
              <Header className="w-48 whitespace-nowrap">{dictionary.driverId}</Header>
              <Header className="w-60 whitespace-nowrap">{dictionary.vehicle}</Header>
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.actualPlate}</Header>
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.shiftDate}</Header>
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.startTime}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.startReading}</Header>
              <Header className="w-32 whitespace-nowrap">{dictionary.columns.startPhoto}</Header>
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.endTime}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.endReading}</Header>
              <Header className="w-32 whitespace-nowrap">{dictionary.columns.endPhoto}</Header>
              <Header className="w-32 whitespace-nowrap">{dictionary.columns.alerts}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.odometerBaseline}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.shiftDistance}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.dailyTotal}</Header>
              <Header className="w-40 whitespace-nowrap">{dictionary.columns.totalDistance}</Header>
              <Header className="w-32 whitespace-nowrap">{dictionary.actions}</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell strong>
                  <DriverNameCell name={row.driverName} identifier={row.driverIdentifier} />
                </Cell>
                <Cell nowrap>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
                <Cell truncate title={formatVehicleLabel(row.vehicleLabel, dictionary)}>
                  {formatVehicleLabel(row.vehicleLabel, dictionary)}
                </Cell>
                <Cell nowrap>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
                <Cell>
                  <DateTimeStack value={row.shiftDate} locale={locale} timeZone="Asia/Riyadh" fallback={dictionary.notAvailable} />
                </Cell>
                <Cell>
                  <DateTimeStack value={row.startedAt} locale={locale} timeZone="Asia/Riyadh" fallback={dictionary.notAvailable} />
                </Cell>
                <Cell nowrap>{row.startReading === null ? dictionary.notAvailable : row.startReading.toLocaleString(locale)}</Cell>
                <Cell>
                  <PhotoLink
                    url={row.startPhotoUrl}
                    hasPhoto={row.startPhotoPathPresent}
                    label={dictionary.columns.startPhoto}
                    dictionary={dictionary}
                    thumbnail
                    onPreview={() => {
                      if (!row.startPhotoUrl) return;
                      setPreview({
                        url: row.startPhotoUrl,
                        title: locale === "ar" ? "صورة بداية العداد" : "Start odometer photo",
                        subtitle: row.driverName,
                      });
                    }}
                  />
                </Cell>
                <Cell>
                  <DateTimeStack value={row.endedAt} locale={locale} timeZone="Asia/Riyadh" fallback={dictionary.notAvailable} />
                </Cell>
                <Cell nowrap>{row.endReading === null ? dictionary.notAvailable : row.endReading.toLocaleString(locale)}</Cell>
                <Cell>
                  <PhotoLink
                    url={row.endPhotoUrl}
                    hasPhoto={row.endPhotoPathPresent}
                    label={dictionary.columns.endPhoto}
                    dictionary={dictionary}
                    thumbnail
                    onPreview={() => {
                      if (!row.endPhotoUrl) return;
                      setPreview({
                        url: row.endPhotoUrl,
                        title: locale === "ar" ? "صورة نهاية العداد" : "End odometer photo",
                        subtitle: row.driverName,
                      });
                    }}
                  />
                </Cell>
                <Cell nowrap>
                  <OdometerAlertsIndicator alerts={row.alerts} />
                </Cell>
                <Cell nowrap>
                  <OdometerBaselineIndicator shift={row} locale={locale} />
                </Cell>
                <Cell nowrap>{formatNullableNumber(row.distance, locale, dictionary.notAvailable)}</Cell>
                <Cell nowrap>{formatNullableNumber(row.dailyDistanceKm, locale, dictionary.notAvailable)}</Cell>
                <Cell nowrap>{formatNullableNumber(row.totalDistanceKm, locale, dictionary.notAvailable)}</Cell>
                <Cell nowrap>
                  <div className="flex items-center gap-2">
                        {row.status !== "not_started" ? (
                          <button type="button" onClick={() => setSelectedEdit(row)} title="تعديل قراءة العداد" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-navy hover:bg-primary-soft">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                        ) : null}
                        {row.vehicleId ? (
                          <button type="button" onClick={() => setSelectedReset(row)} title="تعيين قراءة أساس للمركبة" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-navy hover:bg-primary-soft">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          </button>
                        ) : null}
                      </div>
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview ? (
        <SecureImagePreviewDialog
          imageUrl={preview.url}
          title={preview.title}
          subtitle={preview.subtitle}
          errorText={dictionary.imageLoadFailed}
          onClose={() => setPreview(null)}
        />
      ) : null}

        {selectedEdit ? (
          <OdometerCorrectionDialog
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            organizationId={organizationId}
            shift={selectedEdit}
            onClose={() => setSelectedEdit(null)}
            onSuccess={() => {
              setSelectedEdit(null);
            }}
          />
        ) : null}
        {selectedReset ? (
          <OdometerResetDialog
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            organizationId={organizationId}
            shift={selectedReset}
            onClose={() => setSelectedReset(null)}
            onSuccess={() => {
              setSelectedReset(null);
            }}
          />
        ) : null}
    </>
  );
}

function PhotoLink({
  url,
  hasPhoto,
  label,
  dictionary,
  thumbnail = false,
  onPreview,
}: {
  url: string | null;
  hasPhoto: boolean;
  label: string;
  dictionary: AppRequestsDictionary;
  thumbnail?: boolean;
  onPreview?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!hasPhoto) {
    return (
      <span className={thumbnail ? "inline-flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-border bg-background text-center text-[10px] font-bold leading-tight text-muted" : ""}>
        {dictionary.photoNotUploaded}
      </span>
    );
  }
  if (!url) return <span className="text-xs font-bold text-red-600">{dictionary.imageLoadFailed}</span>;
  if (thumbnail) {
    const content = (
      <>
        {!loaded && !failed ? (
          <span className="absolute inset-0 grid place-items-center bg-background px-1 text-center leading-tight">
            {label}
          </span>
        ) : null}
        {failed ? (
          <span className="px-1 text-center leading-tight text-red-600">{dictionary.imageLoadFailed}</span>
        ) : (
          // Authenticated internal image endpoint; keep native img to avoid optimizer/proxy issues.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(true);
              setFailed(true);
            }}
            className={`h-full w-full object-cover transition ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </>
    );

    if (onPreview) {
      return (
        <button
          type="button"
          onClick={onPreview}
          aria-label={label}
          title={label}
          className="group relative inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-[10px] font-bold text-muted transition hover:border-primary hover:shadow-sm"
        >
          {content}
        </button>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        title={label}
        className="group relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-[10px] font-bold text-muted transition hover:border-primary"
      >
        {content}
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary">
      {label}
    </a>
  );
}

function OdometerAlertsIndicator({
  alerts,
}: {
  alerts: OdometerShiftRow["alerts"];
}) {
  if (alerts.length === 0) return null;

  const hasCritical = alerts.some((alert) => alert.severity === "critical");
  const toneClass = hasCritical
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
  const panelClass = hasCritical
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <details className="group relative inline-block">
      <summary
        className={`flex h-8 min-w-8 cursor-pointer list-none items-center justify-center gap-1 rounded-lg border px-2 text-xs font-bold [&::-webkit-details-marker]:hidden ${toneClass}`}
        aria-label={alerts.map((alert) => alert.message).join("، ")}
      >
        <AlertTriangleIcon />
        <span>{alerts.length}</span>
      </summary>
      <div className={`absolute end-0 z-30 mt-2 hidden w-72 rounded-lg border p-3 text-xs font-bold leading-6 shadow-xl group-open:block group-hover:block ${panelClass}`}>
        <ul className="space-y-1">
          {alerts.map((alert) => (
            <li key={`${alert.code}-${alert.message}`} className="flex gap-2">
              <span aria-hidden="true">-</span>
              <span>{alert.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function OdometerBaselineIndicator({
  shift,
  locale,
}: {
  shift: OdometerShiftRow;
  locale: Locale;
}) {
  if (shift.vehicleBaselineReading === null) {
    return <span className="text-xs font-bold text-muted">غير محدد</span>;
  }

  const baselineText = `${shift.vehicleBaselineReading.toLocaleString(locale)} كم`;
  const resetAtText = shift.vehicleBaselineResetAt
    ? formatDateTime(shift.vehicleBaselineResetAt, locale, "Asia/Riyadh")
    : "غير محدد";
  const reasonText = formatBaselineReason(shift.vehicleBaselineReason, locale);

  return (
    <details className="group relative inline-block">
      <summary className="cursor-pointer list-none rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold text-navy hover:bg-primary-soft [&::-webkit-details-marker]:hidden">
        {baselineText}
      </summary>
      <div className="absolute end-0 z-30 mt-2 hidden w-72 rounded-lg border border-border bg-surface p-3 text-xs font-bold leading-6 text-navy shadow-xl group-open:block group-hover:block">
        <p>مرجع العداد الحالي: {baselineText}</p>
        <p>تاريخ التعيين: {resetAtText}</p>
        <p>السبب: {reasonText}</p>
      </div>
    </details>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function SecureImagePreviewDialog({
  imageUrl,
  title,
  subtitle,
  errorText,
  onClose,
}: {
  imageUrl: string;
  title: string;
  subtitle: string;
  errorText: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-[92vw] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-navy">{title}</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-xl font-bold text-navy hover:bg-primary-soft"
          >
            X
          </button>
        </div>
        <div className="relative grid min-h-[280px] place-items-center bg-black p-3">
          {!loaded && !failed ? (
            <div className="absolute inset-0 grid place-items-center text-sm font-bold text-white">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            </div>
          ) : null}
          {failed ? (
            <div className="grid min-h-[280px] place-items-center text-sm font-bold text-white">
              {errorText}
            </div>
          ) : (
            // Authenticated internal image endpoint; keep native img to avoid optimizer/proxy issues.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(true);
                setFailed(true);
              }}
              className={`max-h-[85vh] max-w-[90vw] object-contain transition ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewBadge({
  status,
  dictionary,
}: {
  status: OdometerShiftRow["startReviewStatus"];
  dictionary: AppRequestsDictionary;
}) {
  if (!status) return <span>{dictionary.notAvailable}</span>;
  return <span className="whitespace-nowrap rounded-full border border-border px-2 py-1 text-xs font-bold">{dictionary.reviewStatuses[status]}</span>;
}

function OdometerCorrectionDialog({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  shift,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  shift: OdometerShiftRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState(updateOdometerShiftReadingAction, { status: "idle" });
  const [preview, setPreview] = useState<{ url: string; title: string; subtitle: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
      router.refresh();
    }
    if (state.status === "error" && (state.code === "unauthorized" || state.code === "review_permission_denied")) {
      router.refresh();
    }
  }, [onSuccess, router, state.code, state.status]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-navy">{dictionary.odometerTitle ?? "تعديل قراءة العداد"}</h2>
            <p className="mt-1 text-sm text-muted">{shift.driverName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-sm font-bold">
            {dictionary.cancel}
          </button>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <CorrectionPanel locale={locale} dictionary={dictionary} organizationCode={organizationCode} organizationId={organizationId} shift={shift} phase="start" formAction={formAction} state={state} onPreview={setPreview} />
          {shift.endReading !== null || shift.status === 'completed' ? (
            <CorrectionPanel locale={locale} dictionary={dictionary} organizationCode={organizationCode} organizationId={organizationId} shift={shift} phase="end" formAction={formAction} state={state} onPreview={setPreview} />
          ) : null}
        </div>
      </div>
      {preview ? (
        <SecureImagePreviewDialog
          imageUrl={preview.url}
          title={preview.title}
          subtitle={preview.subtitle}
          errorText={dictionary.imageLoadFailed}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

function CorrectionPanel({
    locale,
    dictionary,
    organizationCode,
    organizationId,
    shift,
    phase,
    formAction,
    state,
    onPreview,
  }: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  shift: OdometerShiftRow;
  phase: "start" | "end";
    formAction: (payload: FormData) => void;
    state: any;
    onPreview: (preview: { url: string; title: string; subtitle: string }) => void;
  }) {
  const isStart = phase === "start";
  const reading = isStart ? shift.startReading : shift.endReading;
  const photoUrl = isStart ? shift.startPhotoUrl : shift.endPhotoUrl;
  const hasPhoto = isStart ? shift.startPhotoPathPresent : shift.endPhotoPathPresent;
  const photoLabel = isStart ? dictionary.columns.startPhoto : dictionary.columns.endPhoto;

  return (
    <section className="border border-border bg-background p-4">
      <h3 className="text-base font-bold text-navy">{isStart ? dictionary.start : dictionary.end}</h3>
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <PhotoLink
          url={photoUrl}
          hasPhoto={hasPhoto}
          label={photoLabel}
          dictionary={dictionary}
          thumbnail
          onPreview={() => {
            if (!photoUrl) return;
            onPreview({
              url: photoUrl,
              title: isStart ? "صورة بداية العداد" : "صورة نهاية العداد",
              subtitle: shift.driverName,
            });
          }}
        />
        <div className="min-w-0 text-sm">
          <p className="font-bold text-navy">{photoLabel}</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            القراءة الحالية: {reading === null ? "ناقصة" : reading.toLocaleString(locale)}
          </p>
        </div>
      </div>
      {(state.status === "error" || state.status === "validation_error") && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            {state.code === "SHIFT_START_ABOVE_END" ? "قراءة البداية لا يمكن أن تكون أكبر من قراءة النهاية" :
             state.code === "SHIFT_END_BELOW_START" ? "قراءة النهاية لا يمكن أن تكون أقل من قراءة البداية" :
             state.code === "SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING" ? "قراءة البداية لا يمكن أن تكون أقل من القراءة السابقة للمركبة" :
             state.code === "SHIFT_END_ABOVE_NEXT_VEHICLE_READING" ? "قراءة النهاية لا يمكن أن تكون أكبر من القراءة اللاحقة للمركبة" :
             state.code === "SHIFT_INVALID_READING" ? "القراءة غير صالحة" :
             state.code === "unauthorized" ? "غير مصرح" :
             state.code}
          </div>
        )}
        <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="shiftId" value={shift.id} />
        <input type="hidden" name="phase" value={phase} />

        <div>
          <label className="mb-1 block text-sm font-bold text-navy">القراءة الحالية: {reading ?? "ناقصة"}</label>
          <input type="number" min="0" name="odometerReading" defaultValue={reading ?? ""} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy" placeholder="القراءة الصحيحة" required />
        </div>
        <button type="submit" className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary-hover">
          {isStart ? "حفظ قراءة البداية" : "حفظ قراءة النهاية"}
        </button>
      </form>
    </section>
  );
}

function OdometerResetDialog({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  shift,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  shift: OdometerShiftRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState(resetVehicleOdometerBaselineAction, { status: "idle" });
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      onSuccess();
      router.refresh();
    }
  }, [onSuccess, router, state.status]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-lg border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
              <h2 className="text-lg font-bold text-navy">تعيين قراءة أساس للمركبة</h2>
              <p className="mt-1 text-sm text-muted">{shift.vehicleLabel} {shift.vehiclePlate ? `(${shift.vehiclePlate})` : ""}</p>
            </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-sm font-bold">
            {dictionary.cancel}
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          استخدم هذا الإجراء عند استلام مركبة بقراءة مختلفة أو عند تغيير/تصفير عداد المركبة. لن يتم حذف المسافات التاريخية.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm font-bold text-navy">
          {shift.vehicleBaselineReading === null ? (
            <p>لا يوجد مرجع عداد محدد</p>
          ) : (
            <>
              <p>مرجع العداد الحالي: {shift.vehicleBaselineReading.toLocaleString(locale)} كم</p>
              {shift.vehicleBaselineResetAt ? (
                <p className="mt-1 text-xs text-muted">
                  تاريخ التعيين: {formatDateTime(shift.vehicleBaselineResetAt, locale, "Asia/Riyadh")}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted">
                السبب: {formatBaselineReason(shift.vehicleBaselineReason, locale)}
              </p>
            </>
          )}
        </div>
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="organizationCode" value={organizationCode} />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="vehicleId" value={shift.vehicleId!} />

          <div>
            <label className="mb-1 block text-sm font-bold text-navy">قراءة الأساس الجديدة</label>
            <input type="number" min="0" name="baselineReading" required className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-navy">السبب</label>
            <select name="reason" required className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy">
              <option value="vehicle_initial_baseline">إدخال المركبة للنظام لأول مرة</option>
              <option value="odometer_cluster_replaced">تغيير عداد المركبة</option>
              <option value="continuity_correction">تصحيح مرجع العداد</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary-hover">
            حفظ مرجع العداد
          </button>
        </form>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-border last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-bold text-navy text-end">{value}</dd>
    </div>
  );
}

function renderRequestDetails(request: AppRequestRow, dictionary: AppRequestsDictionary) {
  return null;
}

function ReviewDialog({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  request,
  canReview,
  canAssignMaintenance,
  maintenanceProviderOptions,
  onPreviewInvoice,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  request: AppRequestRow;
  canReview: boolean;
  canAssignMaintenance: boolean;
  maintenanceProviderOptions: MaintenanceProviderOption[];
  onPreviewInvoice: (job: MaintenanceJobExecution | null, subtitle: string) => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState(
    reviewDriverAppRequestAction,
    initialState,
  );
  const [approvalIntent, setApprovalIntent] = useState(false);
  const router = useRouter();
  const requiresProviderAssignment =
    request.status === "pending" &&
    (request.requestType === "maintenance" ||
      request.requestType === "oil_change");
  const canApproveWithProvider =
    !requiresProviderAssignment ||
    (canAssignMaintenance && maintenanceProviderOptions.length > 0);

  useEffect(() => {
    if (state.status === "success") onSuccess();
    if (
      state.status === "error" &&
      (state.code === "unauthorized" ||
        state.code === "review_permission_denied")
    ) {
      router.refresh();
    }
  }, [onSuccess, router, state.code, state.status]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-navy">
              {dictionary.requestTypes[request.requestType]}
            </h2>
            <p className="mt-1 text-sm text-muted">{request.driverName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm font-bold"
          >
            {dictionary.cancel}
          </button>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <Detail label={dictionary.columns.requestId} value={<span dir="ltr">{request.id}</span>} />
          <Detail label={dictionary.requestDate} value={formatDateTime(request.submittedAt, locale)} />
          <Detail label={dictionary.columns.reviewTime} value={request.reviewedAt ? formatDateTime(request.reviewedAt, locale) : dictionary.notAvailable} />
          <Detail label={dictionary.reviewNote} value={request.reviewNote ?? dictionary.notAvailable} />
          {renderRequestDetails(request, dictionary)}
        </dl>
        {request.maintenanceJob ? (
          <MaintenanceExecutionDetails
            job={request.maintenanceJob}
            requestType={request.requestType}
            dictionary={dictionary}
            locale={locale}
            onPreviewInvoice={() =>
              onPreviewInvoice(
                request.maintenanceJob,
                request.maintenanceJob?.invoiceFileName ?? request.driverName,
              )
            }
          />
        ) : null}
        {request.reviewNote ? (
          <p className="mt-4 rounded-xl bg-primary-soft p-3 text-sm font-semibold text-navy">
            {dictionary.reviewNote}: {request.reviewNote}
          </p>
        ) : null}
        {state.status === "error" || state.status === "validation_error" ? (
          <p className="mt-4 text-sm font-bold text-red-600">
            {getActionErrorMessage(dictionary, state.code)}
          </p>
        ) : null}
        {canReview ? (
          <form action={formAction} className="mt-5 space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="organizationCode" value={organizationCode} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="requestId" value={request.id} />
            {(request.requestType === "meeting" ||
              request.requestType === "oil_change") &&
            request.status === "pending" ? (
              <input
                type="datetime-local"
                name="scheduledAt"
                className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              />
            ) : null}
            {request.requestType === "oil_change" &&
            request.status === "approved" ? (
              <label className="block space-y-2">
                <span className="block text-sm font-bold text-navy">
                  {dictionary.columns.oilIntervalKm}
                </span>
                <input
                  type="number"
                  name="oilIntervalKm"
                  min="1"
                  step="1"
                  required
                  inputMode="numeric"
                  className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
                />
              </label>
            ) : null}
            {request.status === "pending" ? (
              <textarea
                name="reviewNote"
                placeholder={dictionary.reviewNote}
                className="min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
              />
            ) : null}
            {requiresProviderAssignment && approvalIntent ? (
              canAssignMaintenance ? (
                maintenanceProviderOptions.length > 0 ? (
                  <label className="block space-y-2">
                    <span className="block text-sm font-bold text-navy">
                      {dictionary.maintenanceProvider}
                    </span>
                    <select
                      name="providerId"
                      required
                      className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
                      defaultValue={
                        maintenanceProviderOptions.length === 1
                          ? maintenanceProviderOptions[0].id
                          : ""
                      }
                    >
                      {maintenanceProviderOptions.length === 1 ? null : (
                        <option value="">{dictionary.selectMaintenanceProvider}</option>
                      )}
                      {maintenanceProviderOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} ({provider.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                    {dictionary.noMaintenanceProviderAvailable}
                  </p>
                )
              ) : (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {dictionary.errors.maintenance_assignment_permission_denied}
                </p>
              )
            ) : null}
            <div className="flex flex-wrap gap-2">
              {request.status === "pending" ? (
                <>
                  {requiresProviderAssignment && !approvalIntent ? (
                    <button
                      type="button"
                      onClick={() => setApprovalIntent(true)}
                      disabled={!canApproveWithProvider}
                      className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-70"
                    >
                      {dictionary.approve}
                    </button>
                  ) : (
                    <ActionButton
                      action="approve"
                      fieldName="decision"
                      disabled={!canApproveWithProvider}
                    >
                      {request.requestType === "meeting"
                        ? dictionary.scheduleAndApprove
                        : dictionary.approve}
                    </ActionButton>
                  )}
                  <ActionButton action="reject" fieldName="decision">{dictionary.reject}</ActionButton>
                </>
              ) : null}
              {request.status === "approved" &&
              request.requestType !== "leave" ? (
                <ActionButton action="complete" fieldName="decision">
                  {dictionary.complete}
                </ActionButton>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  fieldName = "action",
  disabled = false,
  children,
}: {
  action: string;
  fieldName?: "action" | "decision";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={fieldName}
      value={action}
      disabled={pending || disabled}
      className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function renderRequestCells(
  row: AppRequestRow,
  requestType: DriverAppRequestType,
  dictionary: AppRequestsDictionary,
  locale: Locale,
) {
  if (requestType === "leave") {
    const start = asString(row.detail.start_date);
    const end = asString(row.detail.end_date);

    return (
      <>
        <Cell nowrap>{dictionary.leaveTypes[asLeaveType(row.detail.leave_type)]}</Cell>
        <Cell nowrap>{start}</Cell>
        <Cell nowrap>{end}</Cell>
        <Cell nowrap>{start && end ? countDays(start, end).toLocaleString(locale) : dictionary.notAvailable}</Cell>
      </>
    );
  }

  if (requestType === "maintenance") {
    return (
      <>
        <Cell className="whitespace-normal break-words leading-5">{row.detail.maintenance_category ?? dictionary.notAvailable}</Cell>
        <Cell nowrap>{dictionary.urgency[asUrgency(row.detail.urgency)]}</Cell>
        <Cell className="max-w-[240px] whitespace-normal break-words leading-5">{row.detail.problem_description ?? dictionary.notAvailable}</Cell>
      </>
    );
  }

  if (requestType === "meeting") {
    return (
      <>
        <Cell className="whitespace-normal leading-5">{formatRequestedManager(row, dictionary)}</Cell>
        <Cell className="whitespace-normal leading-5">{row.detail.subject ?? dictionary.notAvailable}</Cell>
        <Cell nowrap>{row.detail.preferred_date ?? dictionary.notAvailable}</Cell>
        <Cell nowrap>{row.detail.scheduled_at ?? dictionary.notAvailable}</Cell>
      </>
    );
  }

  return (
    <>
      <Cell>{row.detail.current_odometer_reading ?? dictionary.notAvailable}</Cell>
      <Cell>{row.detail.scheduled_at ?? dictionary.notAvailable}</Cell>
    </>
  );
}

function Header({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 text-start ${className}`}>{children}</th>;
}

function Cell({
  children,
  strong,
  nowrap,
  truncate,
  title,
  className = "",
}: {
  children: React.ReactNode;
  strong?: boolean;
  nowrap?: boolean;
  truncate?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <td
      title={title}
      className={`px-4 py-3 text-sm ${strong ? "font-bold text-navy" : "text-muted"} ${nowrap ? "whitespace-nowrap" : ""} ${truncate ? "truncate" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

function DriverNameCell({
  name,
  identifier,
}: {
  name: string;
  identifier: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="whitespace-normal leading-5" title={name}>{name}</div>
      {identifier ? (
        <div className="mt-0.5 whitespace-nowrap text-xs font-semibold text-muted" dir="ltr">
          {identifier}
        </div>
      ) : null}
    </div>
  );
}

function formatRequestedManager(
  row: AppRequestRow,
  dictionary: AppRequestsDictionary,
) {
  if (!row.requestedManagerName) {
    return dictionary.notSpecified;
  }

  return row.requestedManagerJobTitle
    ? `${row.requestedManagerName} - ${row.requestedManagerJobTitle}`
    : row.requestedManagerName;
}

function StatusBadge({
  status,
  dictionary,
}: {
  status: AppRequestRow["status"];
  dictionary: AppRequestsDictionary;
}) {
  return (
    <span className="whitespace-nowrap rounded-full border border-border px-2 py-1 text-xs font-bold">
      {dictionary.statuses[status]}
    </span>
  );
}

function ExecutionStatusBadge({
  job,
  requestType,
  dictionary,
}: {
  job: MaintenanceJobExecution | null;
  requestType: DriverAppRequestType;
  dictionary: AppRequestsDictionary;
}) {
  if (!job) {
    return (
      <span className="whitespace-nowrap rounded-full border border-border px-2 py-1 text-xs font-bold text-muted">
        {dictionary.notAvailable}
      </span>
    );
  }

  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-1 text-xs font-bold ${getExecutionStatusClassName(
        job.status,
      )}`}
    >
      {getExecutionStatusLabel(job, requestType, dictionary)}
    </span>
  );
}

function InvoiceThumbnail({
  imageUrl,
  label,
  onPreview,
  size = "compact",
}: {
  imageUrl: string;
  label: string;
  onPreview: () => void;
  size?: "compact" | "large";
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sizeClass = size === "large" ? "h-16 w-16" : "h-12 w-12";

  return (
    <button
      type="button"
      onClick={onPreview}
      aria-label={label}
      title={label}
      className={`relative inline-flex ${sizeClass} shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-[10px] font-bold leading-tight text-muted transition hover:border-primary hover:shadow-sm`}
    >
      {!loaded && !failed ? (
        <span className="absolute h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      ) : null}
      {failed ? (
        <span className="px-1 text-center text-red-600">{label}</span>
      ) : (
        // Authenticated internal image endpoint; keep native img to avoid optimizer/proxy issues.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={label}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(true);
            setFailed(true);
          }}
          className={`h-full w-full object-cover transition ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </button>
  );
}

function InvoiceCell({
  job,
  dictionary,
  onPreview,
}: {
  job: MaintenanceJobExecution | null;
  dictionary: AppRequestsDictionary;
  onPreview: () => void;
}) {
  if (!job?.invoiceFilePath) {
    return <span className="text-xs font-bold text-muted">{dictionary.notAvailable}</span>;
  }

  const invoiceUrl = getMaintenanceInvoiceUrl(job);

  if (!invoiceUrl) {
    return <span className="text-xs font-bold text-muted">{dictionary.notAvailable}</span>;
  }

  return (
    <InvoiceThumbnail
      imageUrl={invoiceUrl}
      label={dictionary.execution.viewInvoice}
      onPreview={onPreview}
    />
  );
}

function getMaintenanceInvoiceUrl(job: MaintenanceJobExecution | null) {
  if (!job?.invoiceFilePath) return null;
  return `/api/dashboard/app-requests/photo?type=maintenance-invoice&jobId=${encodeURIComponent(job.id)}`;
}

function MaintenanceExecutionDetails({
  job,
  requestType,
  dictionary,
  locale,
  onPreviewInvoice,
}: {
  job: MaintenanceJobExecution;
  requestType: DriverAppRequestType;
  dictionary: AppRequestsDictionary;
  locale: Locale;
  onPreviewInvoice: () => void;
}) {
  const provider =
    [job.providerName, job.providerCode ? `(${job.providerCode})` : null]
      .filter(Boolean)
      .join(" ") || dictionary.notAvailable;
  const invoiceUrl = getMaintenanceInvoiceUrl(job);

  return (
    <section className="mt-5 rounded-xl border border-border bg-background p-4">
      <h3 className="text-sm font-bold text-navy">
        {dictionary.execution.title}
      </h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <Detail
          label={dictionary.columns.executionStatus}
          value={
            <ExecutionStatusBadge
              job={job}
              requestType={requestType}
              dictionary={dictionary}
            />
          }
        />
        <Detail label={dictionary.execution.provider} value={provider} />
        <Detail
          label={dictionary.execution.assignedAt}
          value={formatNullableDateTime(job.assignedAt, locale, dictionary)}
        />
        <Detail
          label={dictionary.execution.startedAt}
          value={formatNullableDateTime(job.startedAt, locale, dictionary)}
        />
        <Detail
          label={dictionary.execution.completedAt}
          value={formatNullableDateTime(job.completedAt, locale, dictionary)}
        />
        {job.status === "cancelled" ? (
          <Detail
            label={dictionary.execution.cancelledAt}
            value={formatNullableDateTime(job.cancelledAt, locale, dictionary)}
          />
        ) : null}
        <Detail
          label={dictionary.columns.invoice}
          value={
            invoiceUrl ? (
              <InvoiceThumbnail
                imageUrl={invoiceUrl}
                label={dictionary.execution.viewInvoice}
                onPreview={onPreviewInvoice}
                size="large"
              />
            ) : (
              dictionary.notAvailable
            )
          }
        />
      </dl>
    </section>
  );
}

function MaintenanceMaterialsPanel({
  job,
  locale,
  organizationCode,
  canManage,
}: {
  job: MaintenanceJobExecution;
  locale: Locale;
  organizationCode: string;
  canManage: boolean;
}) {
  const labels = getMaintenanceMaterialLabels(locale);
  const isEditable = canManage && (job.status === "ready" || job.status === "in_progress");

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-navy">{labels.title}</h4>
        {!isEditable ? (
          <span className="rounded-full border border-border px-2 py-1 text-xs font-bold text-muted">
            {labels.readOnly}
          </span>
        ) : null}
      </div>

      {job.materials.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-white p-3 text-sm font-semibold text-muted">
          {labels.empty}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {job.materials.map((material) => (
            <MaintenanceMaterialRowForm
              key={material.id}
              material={material}
              locale={locale}
              organizationCode={organizationCode}
              canManage={isEditable}
              labels={labels}
            />
          ))}
        </div>
      )}

      {isEditable ? (
        <MaintenanceMaterialCreateForm
          maintenanceJobId={job.id}
          locale={locale}
          organizationCode={organizationCode}
          labels={labels}
        />
      ) : null}
    </div>
  );
}

function MaintenanceMaterialCreateForm({
  maintenanceJobId,
  locale,
  organizationCode,
  labels,
}: {
  maintenanceJobId: string;
  locale: Locale;
  organizationCode: string;
  labels: ReturnType<typeof getMaintenanceMaterialLabels>;
}) {
  const [state, formAction] = useActionState(
    createMaintenanceJobMaterialAction,
    initialMaterialState,
  );
  useRefreshOnMaterialSuccess(state);

  return (
    <form action={formAction} className="mt-4 grid gap-3 rounded-xl border border-border bg-white p-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="organizationCode" value={organizationCode} />
      <input type="hidden" name="maintenanceJobId" value={maintenanceJobId} />
      <MaterialFields labels={labels} />
      <div className="sm:col-span-2">
        <MaterialSubmitButton>{labels.add}</MaterialSubmitButton>
      </div>
      <MaterialActionFeedback state={state} labels={labels} />
    </form>
  );
}

function MaintenanceMaterialRowForm({
  material,
  locale,
  organizationCode,
  canManage,
  labels,
}: {
  material: MaintenanceJobMaterial;
  locale: Locale;
  organizationCode: string;
  canManage: boolean;
  labels: ReturnType<typeof getMaintenanceMaterialLabels>;
}) {
  const [updateState, updateAction] = useActionState(
    updateMaintenanceJobMaterialAction,
    initialMaterialState,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteMaintenanceJobMaterialAction,
    initialMaterialState,
  );
  useRefreshOnMaterialSuccess(updateState);
  useRefreshOnMaterialSuccess(deleteState);

  if (!canManage) {
    return (
      <div className="grid gap-2 rounded-xl border border-border bg-white p-3 text-sm sm:grid-cols-6">
        <MaterialStatic label={labels.itemName} value={material.itemName} />
        <MaterialStatic label={labels.category} value={labels.categories[material.category]} />
        <MaterialStatic label={labels.issued} value={formatMaterialQuantity(material.issuedQuantity, locale)} />
        <MaterialStatic label={labels.used} value={formatNullableMaterialQuantity(material.usedQuantity, locale, labels)} />
        <MaterialStatic label={labels.returned} value={formatNullableMaterialQuantity(material.returnedQuantity, locale, labels)} />
        <MaterialStatic label={labels.unit} value={labels.units[material.unit]} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3">
      <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="maintenanceJobId" value={material.maintenanceJobId} />
        <input type="hidden" name="materialId" value={material.id} />
        <MaterialFields labels={labels} material={material} />
        <div className="grid gap-2 text-xs font-bold text-muted sm:col-span-2 sm:grid-cols-2">
          <span>{labels.used}: {formatNullableMaterialQuantity(material.usedQuantity, locale, labels)}</span>
          <span>{labels.returned}: {formatNullableMaterialQuantity(material.returnedQuantity, locale, labels)}</span>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <MaterialSubmitButton>{labels.save}</MaterialSubmitButton>
        </div>
        <MaterialActionFeedback state={updateState} labels={labels} />
      </form>
      <form action={deleteAction} className="mt-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="maintenanceJobId" value={material.maintenanceJobId} />
        <input type="hidden" name="materialId" value={material.id} />
        <MaterialDeleteButton
          disabled={material.usedQuantity !== null}
          confirmMessage={labels.deleteConfirm}
        >
          {labels.delete}
        </MaterialDeleteButton>
        {material.usedQuantity !== null ? (
          <p className="mt-2 text-xs font-bold text-muted">{labels.deleteBlocked}</p>
        ) : null}
        <MaterialActionFeedback state={deleteState} labels={labels} />
      </form>
    </div>
  );
}

function MaterialFields({
  labels,
  material,
}: {
  labels: ReturnType<typeof getMaintenanceMaterialLabels>;
  material?: MaintenanceJobMaterial;
}) {
  return (
    <>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.itemName}</span>
        <input
          name="itemName"
          required
          maxLength={160}
          defaultValue={material?.itemName ?? ""}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.category}</span>
        <select
          name="category"
          required
          defaultValue={material?.category ?? "oil"}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        >
          {(["oil", "spare_part", "material"] as MaintenanceMaterialCategory[]).map((category) => (
            <option key={category} value={category}>
              {labels.categories[category]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.unit}</span>
        <select
          name="unit"
          required
          defaultValue={material?.unit ?? "liter"}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        >
          {(["liter", "piece", "set", "kg", "meter", "other"] as MaintenanceMaterialUnit[]).map((unit) => (
            <option key={unit} value={unit}>
              {labels.units[unit]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.issued}</span>
        <input
          name="issuedQuantity"
          required
          type="number"
          min="0.001"
          step="0.001"
          inputMode="decimal"
          defaultValue={material?.issuedQuantity ?? ""}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        />
      </label>
    </>
  );
}

function MaterialStatic({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold text-muted">{label}</div>
      <div className="mt-1 font-bold text-navy">{value}</div>
    </div>
  );
}

function MaterialSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function MaterialDeleteButton({
  children,
  disabled,
  confirmMessage,
}: {
  children: React.ReactNode;
  disabled: boolean;
  confirmMessage: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="min-h-10 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function MaterialActionFeedback({
  state,
  labels,
}: {
  state: MaintenanceMaterialActionState;
  labels: ReturnType<typeof getMaintenanceMaterialLabels>;
}) {
  if (state.status === "idle") return null;

  return (
    <p
      className={`sm:col-span-2 text-xs font-bold ${
        state.status === "success" ? "text-emerald-700" : "text-red-600"
      }`}
    >
      {state.status === "success" ? labels.success : labels.error}
    </p>
  );
}

function useRefreshOnMaterialSuccess(state: MaintenanceMaterialActionState) {
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);
}

function formatMaterialQuantity(value: number, locale: Locale) {
  return value.toLocaleString(locale, { maximumFractionDigits: 3 });
}

function formatNullableMaterialQuantity(
  value: number | null,
  locale: Locale,
  labels: ReturnType<typeof getMaintenanceMaterialLabels>,
) {
  return value === null ? labels.notAvailable : formatMaterialQuantity(value, locale);
}

function getMaintenanceMaterialLabels(locale: Locale) {
  const ar = locale === "ar";

  return {
    title: ar ? "مواد الصيانة" : "Maintenance materials",
    empty: ar ? "لا توجد مواد مصروفة لهذه المهمة." : "No materials issued for this job.",
    readOnly: ar ? "للقراءة فقط" : "Read only",
    itemName: ar ? "اسم الصنف" : "Item name",
    category: ar ? "التصنيف" : "Category",
    unit: ar ? "الوحدة" : "Unit",
    issued: ar ? "الكمية المصروفة" : "Issued quantity",
    used: ar ? "المستخدم" : "Used",
    returned: ar ? "المرتجع" : "Returned",
    add: ar ? "إضافة مادة" : "Add material",
    save: ar ? "حفظ المادة" : "Save material",
    delete: ar ? "حذف" : "Delete",
    deleteConfirm: ar ? "هل تريد حذف مادة الصيانة؟" : "Delete this maintenance material?",
    deleteBlocked: ar ? "لا يمكن حذف مادة تم تسجيل استخدامها." : "Used materials cannot be deleted.",
    success: ar ? "تم حفظ مواد الصيانة." : "Maintenance material saved.",
    error: ar ? "تعذر حفظ مواد الصيانة." : "Maintenance material could not be saved.",
    notAvailable: ar ? "غير متاح" : "Not available",
    categories: {
      oil: ar ? "زيوت" : "Oils",
      spare_part: ar ? "قطع غيار" : "Spare parts",
      material: ar ? "مواد" : "Materials",
    } satisfies Record<MaintenanceMaterialCategory, string>,
    units: {
      liter: ar ? "لتر" : "Liter",
      piece: ar ? "قطعة" : "Piece",
      set: ar ? "طقم" : "Set",
      kg: ar ? "كجم" : "Kg",
      meter: ar ? "متر" : "Meter",
      other: ar ? "أخرى" : "Other",
    } satisfies Record<MaintenanceMaterialUnit, string>,
  };
}

function getExecutionStatusLabel(
  job: MaintenanceJobExecution,
  requestType: DriverAppRequestType,
  dictionary: AppRequestsDictionary,
) {
  const labels =
    job.jobType === "oil_change" || requestType === "oil_change"
      ? dictionary.execution.oilStatuses
      : dictionary.execution.maintenanceStatuses;

  return labels[job.status];
}

function getExecutionStatusClassName(status: MaintenanceJobExecution["status"]) {
  if (status === "ready") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (status === "in_progress") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-red-200 bg-red-50 text-danger";
}

function formatNullableDateTime(
  value: string | null,
  locale: Locale,
  dictionary: AppRequestsDictionary,
) {
  return value ? formatDateTime(value, locale) : dictionary.notAvailable;
}

function DateTimeStack({
  value,
  locale,
  timeZone,
  fallback,
}: {
  value: string | null;
  locale: Locale;
  timeZone: string;
  fallback: string;
}) {
  if (!value) return <span>{fallback}</span>;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{fallback}</span>;

  const dateText = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).format(date);
  const timeText = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);

  return (
    <span className="flex flex-col gap-0.5 whitespace-nowrap leading-tight">
      <span className="font-semibold text-navy">{dateText}</span>
      <span className="text-xs font-semibold text-muted" dir="ltr">{timeText}</span>
    </span>
  );
}

function formatDateTime(
  value: string,
  locale: Locale,
  timeZone?: string,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

function formatVehicleLabel(
  value: string | null,
  dictionary: AppRequestsDictionary,
) {
  if (!value) return dictionary.notAvailable;

  return dictionary.vehicleTypes[value as keyof typeof dictionary.vehicleTypes] ?? value;
}

function formatNullableNumber(
  value: number | null,
  locale: Locale,
  fallback: string,
) {
  return value === null ? fallback : value.toLocaleString(locale);
}

function formatBaselineReason(value: string | null, locale: Locale) {
  const labels = locale === "ar"
    ? {
        vehicle_initial_baseline: "إدخال المركبة للنظام لأول مرة",
        odometer_cluster_replaced: "تغيير عداد المركبة",
        continuity_correction: "تصحيح مرجع العداد",
        other: "أخرى",
      }
    : {
        vehicle_initial_baseline: "Initial vehicle baseline",
        odometer_cluster_replaced: "Odometer replaced",
        continuity_correction: "Odometer reference correction",
        other: "Other",
      };

  if (
    value === "vehicle_initial_baseline" ||
    value === "odometer_cluster_replaced" ||
    value === "continuity_correction" ||
    value === "other"
  ) {
    return labels[value];
  }

  return locale === "ar" ? "غير محدد" : "Not specified";
}

function countDays(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asLeaveType(value: unknown) {
  return value === "annual" ||
    value === "sick" ||
    value === "weekly" ||
    value === "emergency" ||
    value === "unpaid" ||
    value === "other"
    ? value
    : "other";
}

function asUrgency(value: unknown) {
  return value === "urgent" ? "urgent" : "normal";
}

function getActionErrorMessage(
  dictionary: AppRequestsDictionary,
  code: string | undefined,
) {
  return (
    dictionary.errors[code as keyof typeof dictionary.errors] ??
    dictionary.errors.action_failed
  );
}
