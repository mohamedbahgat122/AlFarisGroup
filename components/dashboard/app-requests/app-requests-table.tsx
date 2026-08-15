"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { reviewDriverAppRequestAction, reviewOdometerShiftAction } from "@/features/app-requests/actions";
import type {
  AppRequestActionState,
  AppRequestsDictionary,
  AppRequestRow,
  DriverAppRequestType,
  OdometerShiftRow,
} from "@/features/app-requests/types";
import type { Locale } from "@/types/locale";

const initialState: AppRequestActionState = { status: "idle" };

export function AppRequestsTable({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  requestType,
  rows,
  canReview,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  requestType: DriverAppRequestType;
  rows: AppRequestRow[];
  canReview: boolean;
}) {
  const [selected, setSelected] = useState<AppRequestRow | null>(null);
  const router = useRouter();
  const isMeeting = requestType === "meeting";

  return (
    <>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className={isMeeting ? "min-w-[1780px] border-collapse text-start" : `table-fixed border-collapse text-start ${requestType === "leave" ? "min-w-[1460px]" : "w-full min-w-[1100px]"}`}>
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <Header className={isMeeting ? "w-[260px] min-w-[260px] whitespace-nowrap" : requestType === "leave" || requestType === "maintenance" ? "w-72 whitespace-nowrap" : undefined}>{dictionary.driver}</Header>
              <Header className={isMeeting ? "w-[180px] min-w-[180px] whitespace-nowrap" : requestType === "leave" ? "w-44 whitespace-nowrap" : undefined}>{dictionary.driverId}</Header>
              {requestType === "leave" && <Header className="w-48 whitespace-nowrap">{dictionary.columns.organization}</Header>}
              {requestType !== "leave" && <Header className={isMeeting ? "w-[150px] min-w-[150px]" : undefined}>{dictionary.vehicle}</Header>}
              {requestType !== "leave" && <Header className={isMeeting ? "w-[130px] min-w-[130px] whitespace-nowrap" : undefined}>{dictionary.plate}</Header>}
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
                  <Header>{dictionary.columns.category}</Header>
                  <Header>{dictionary.columns.urgency}</Header>
                  <Header>{dictionary.columns.description}</Header>
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
                  <Header>{dictionary.columns.odometerReading}</Header>
                  <Header>{dictionary.columns.scheduledAt}</Header>
                </>
              )}
              <Header className={isMeeting ? "w-[190px] min-w-[190px] whitespace-nowrap" : requestType === "leave" ? "w-44 whitespace-nowrap" : undefined}>{dictionary.requestDate}</Header>
              <Header className={isMeeting ? "w-[150px] min-w-[150px] whitespace-nowrap" : requestType === "leave" ? "w-36 whitespace-nowrap" : undefined}>{dictionary.status}</Header>
              <Header className={isMeeting ? "w-[190px] min-w-[190px]" : requestType === "leave" ? "w-40 whitespace-nowrap" : undefined}>{dictionary.reviewer}</Header>
              <Header className={isMeeting ? "w-[120px] min-w-[120px] whitespace-nowrap" : requestType === "leave" ? "w-32 whitespace-nowrap" : undefined}>{dictionary.actions}</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell strong>
                  <DriverNameCell name={row.driverName} identifier={row.driverIdentifier} />
                </Cell>
                <Cell nowrap>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
                {requestType === "leave" && (
                  <Cell truncate title={row.organizationName ?? dictionary.notAvailable}>{row.organizationName ?? dictionary.notAvailable}</Cell>
                )}
                {requestType !== "leave" && (
                  <>
                    <Cell className={isMeeting ? "whitespace-normal leading-5" : undefined}>{row.vehicleLabel ?? dictionary.notAvailable}</Cell>
                    <Cell nowrap>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
                  </>
                )}
                {renderRequestCells(row, requestType, dictionary, locale)}
                <Cell nowrap>{formatDateTime(row.submittedAt, locale)}</Cell>
                <Cell nowrap>
                  <StatusBadge status={row.status} dictionary={dictionary} />
                </Cell>
                <Cell truncate={!isMeeting} title={row.reviewerName ?? dictionary.notAvailable} className={isMeeting ? "whitespace-normal leading-5" : undefined}>{row.reviewerName ?? dictionary.notAvailable}</Cell>
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
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setSelected(null);
            router.refresh();
          }}
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
  const [preview, setPreview] = useState<{ url: string; title: string; subtitle: string } | null>(null);
  const router = useRouter();

  return (
    <>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="min-w-[2220px] table-fixed border-collapse text-start">
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
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.startReviewStatus}</Header>
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.endTime}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.endReading}</Header>
              <Header className="w-32 whitespace-nowrap">{dictionary.columns.endPhoto}</Header>
              <Header className="w-44 whitespace-nowrap">{dictionary.columns.endReviewStatus}</Header>
              <Header className="w-36 whitespace-nowrap">{dictionary.columns.distance}</Header>
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
                <Cell nowrap><ReviewBadge status={row.startReviewStatus} dictionary={dictionary} /></Cell>
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
                <Cell nowrap><ReviewBadge status={row.endReviewStatus} dictionary={dictionary} /></Cell>
                <Cell nowrap>{row.distance === null ? dictionary.notAvailable : row.distance.toLocaleString(locale)}</Cell>
                <Cell nowrap>
                  {row.status === "not_started" ? null : (
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-navy hover:bg-primary-soft"
                    >
                      {dictionary.details}
                    </button>
                  )}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <OdometerReviewDialog
          locale={locale}
          dictionary={dictionary}
          organizationCode={organizationCode}
          organizationId={organizationId}
          shift={selected}
          canReview={canReview}
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      ) : null}
      {preview ? (
        <SecureImagePreviewDialog
          imageUrl={preview.url}
          title={preview.title}
          subtitle={preview.subtitle}
          errorText={dictionary.imageLoadFailed}
          onClose={() => setPreview(null)}
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

function OdometerReviewDialog({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  shift,
  canReview,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  shift: OdometerShiftRow;
  canReview: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState(reviewOdometerShiftAction, initialState);
  const router = useRouter();

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
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-navy">{dictionary.odometerTitle}</h2>
            <p className="mt-1 text-sm text-muted">{shift.driverName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-sm font-bold">
            {dictionary.cancel}
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ReviewPhasePanel
            locale={locale}
            dictionary={dictionary}
            organizationCode={organizationCode}
            organizationId={organizationId}
            shift={shift}
            phase="start"
            canReview={canReview && shift.startReviewStatus === "pending_review"}
            state={state}
            formAction={formAction}
          />
          {shift.endReading !== null ? (
            <ReviewPhasePanel
              locale={locale}
              dictionary={dictionary}
              organizationCode={organizationCode}
              organizationId={organizationId}
              shift={shift}
              phase="end"
              canReview={canReview && shift.endReviewStatus === "pending_review"}
              state={state}
              formAction={formAction}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewPhasePanel({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  shift,
  phase,
  canReview,
  state,
  formAction,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  shift: OdometerShiftRow;
  phase: "start" | "end";
  canReview: boolean;
  state: AppRequestActionState;
  formAction: (payload: FormData) => void;
}) {
  const isStart = phase === "start";
  const reading = isStart ? shift.startReading : shift.endReading;
  const submittedAt = isStart ? shift.startPhotoCapturedAt : shift.endPhotoCapturedAt;
  const photoUrl = isStart ? shift.startPhotoUrl : shift.endPhotoUrl;
  const hasPhoto = isStart ? shift.startPhotoPathPresent : shift.endPhotoPathPresent;
  const reviewStatus = isStart ? shift.startReviewStatus : shift.endReviewStatus;
  const reviewerName = isStart ? shift.startReviewerName : shift.endReviewerName;
  const reviewedAt = isStart ? shift.startReviewedAt : shift.endReviewedAt;
  const reviewNote = isStart ? shift.startReviewNote : shift.endReviewNote;

  return (
    <section className="border border-border bg-background p-4">
      <h3 className="text-base font-bold text-navy">{isStart ? dictionary.start : dictionary.end}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <Detail label={dictionary.columns.odometerReading} value={reading === null ? dictionary.notAvailable : reading.toLocaleString(locale)} />
        <Detail label={dictionary.columns.captureTime} value={submittedAt ? formatDateTime(submittedAt, locale, "Asia/Riyadh") : dictionary.notAvailable} />
        <Detail label={isStart ? dictionary.startPhotoEvidence : dictionary.endPhotoEvidence} value={hasPhoto ? dictionary.photoUploaded : dictionary.photoNotUploaded} />
        <Detail label={dictionary.status} value={reviewStatus ? dictionary.reviewStatuses[reviewStatus] : dictionary.notAvailable} />
        <Detail label={dictionary.reviewer} value={reviewerName ?? dictionary.notAvailable} />
        <Detail label={dictionary.columns.reviewTime} value={reviewedAt ? formatDateTime(reviewedAt, locale, "Asia/Riyadh") : dictionary.notAvailable} />
        <Detail label={dictionary.reviewNote} value={reviewNote ?? dictionary.notAvailable} />
      </dl>
      <div className="mt-3">
        <PhotoLink
          url={photoUrl}
          hasPhoto={hasPhoto}
          label={dictionary.openImage}
          dictionary={dictionary}
        />
      </div>
      {state.status === "error" || state.status === "validation_error" ? (
        <p className="mt-3 text-sm font-bold text-red-600">
          {getActionErrorMessage(dictionary, state.code)}
        </p>
      ) : null}
      {canReview ? (
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="organizationCode" value={organizationCode} />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="shiftId" value={shift.id} />
          <input type="hidden" name="phase" value={phase} />
          <textarea name="reviewNote" placeholder={dictionary.reviewNote} className="min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy" />
          <div className="flex flex-wrap gap-2">
            <ActionButton action="approved">{dictionary.approve}</ActionButton>
            <ActionButton action="rejected">{dictionary.reject}</ActionButton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-muted">{label}</dt>
      <dd className="mt-1 font-semibold text-navy">{value}</dd>
    </div>
  );
}

function renderRequestDetails(
  request: AppRequestRow,
  dictionary: AppRequestsDictionary,
) {
  if (request.requestType === "leave") {
    const leaveType = asLeaveType(request.detail.leave_type);

    return (
      <>
        <Detail
          label={dictionary.columns.leaveType}
          value={dictionary.leaveTypes[leaveType]}
        />
        <Detail
          label={dictionary.columns.startDate}
          value={request.detail.start_date ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.columns.endDate}
          value={request.detail.end_date ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.columns.reason}
          value={request.detail.reason ?? dictionary.notAvailable}
        />
      </>
    );
  }

  if (request.requestType === "meeting") {
    return (
      <>
        <Detail
          label={dictionary.columns.meetingWith}
          value={formatRequestedManager(request, dictionary)}
        />
        <Detail
          label={dictionary.columns.managerStatus}
          value={
            request.requestedManagerStatus
              ? dictionary.accountStatuses[
                  asAccountStatus(request.requestedManagerStatus)
                ]
              : dictionary.notSpecified
          }
        />
        <Detail
          label={dictionary.columns.subject}
          value={request.detail.subject ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.columns.reason}
          value={request.detail.reason ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.columns.preferredDate}
          value={request.detail.preferred_date ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.columns.preferredTime}
          value={request.detail.preferred_time ?? dictionary.notAvailable}
        />
        <Detail
          label={dictionary.columns.scheduledAt}
          value={request.detail.scheduled_at ?? dictionary.notAvailable}
        />
      </>
    );
  }

  const detailLabels = getDetailLabels(dictionary);

  return Object.entries(request.detail).map(([key, value]) => (
    <Detail
      key={key}
      label={detailLabels[key] ?? key}
      value={value ?? dictionary.notAvailable}
    />
  ));
}

function getDetailLabels(dictionary: AppRequestsDictionary): Record<string, string> {
  return {
    maintenance_category: dictionary.columns.category,
    problem_description: dictionary.columns.description,
    urgency: dictionary.columns.urgency,
    subject: dictionary.columns.subject,
    preferred_date: dictionary.columns.preferredDate,
    preferred_time: dictionary.columns.preferredTime,
    scheduled_at: dictionary.columns.scheduledAt,
    requested_manager_user_id: dictionary.columns.meetingWith,
    current_odometer_reading: dictionary.columns.odometerReading,
    note: dictionary.reviewNote,
  } satisfies Record<string, string>;
}

function asAccountStatus(status: string) {
  return status === "active" || status === "suspended" ? status : "suspended";
}

function ReviewDialog({
  locale,
  dictionary,
  organizationCode,
  organizationId,
  request,
  canReview,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: AppRequestsDictionary;
  organizationCode: string;
  organizationId: string;
  request: AppRequestRow;
  canReview: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState(
    reviewDriverAppRequestAction,
    initialState,
  );
  const router = useRouter();

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
            {request.status === "pending" ? (
              <textarea
                name="reviewNote"
                placeholder={dictionary.reviewNote}
                className="min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {request.status === "pending" ? (
                <>
                  <ActionButton action="approve" fieldName="decision">
                    {request.requestType === "meeting"
                      ? dictionary.scheduleAndApprove
                      : dictionary.approve}
                  </ActionButton>
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
  children,
}: {
  action: string;
  fieldName?: "action" | "decision";
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={fieldName}
      value={action}
      disabled={pending}
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
        <Cell>{row.detail.maintenance_category ?? dictionary.notAvailable}</Cell>
        <Cell>{dictionary.urgency[asUrgency(row.detail.urgency)]}</Cell>
        <Cell>{row.detail.problem_description ?? dictionary.notAvailable}</Cell>
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
