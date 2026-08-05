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

  return (
    <>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full min-w-[1100px] border-collapse text-start">
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              {requestType === "leave" && <Header>{dictionary.columns.driverPhoto}</Header>}
              <Header>{dictionary.driver}</Header>
              <Header>{dictionary.driverId}</Header>
              {requestType === "leave" && <Header>{dictionary.columns.organization}</Header>}
              {requestType !== "leave" && <Header>{dictionary.vehicle}</Header>}
              {requestType !== "leave" && <Header>{dictionary.plate}</Header>}
              {requestType === "leave" && (
                <>
                  <Header>{dictionary.columns.leaveType}</Header>
                  <Header>{dictionary.columns.startDate}</Header>
                  <Header>{dictionary.columns.endDate}</Header>
                  <Header>{dictionary.columns.days}</Header>
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
                  <Header>{dictionary.columns.meetingWith}</Header>
                  <Header>{dictionary.columns.subject}</Header>
                  <Header>{dictionary.columns.preferredDate}</Header>
                  <Header>{dictionary.columns.scheduledAt}</Header>
                </>
              )}
              {requestType === "oil_change" && (
                <>
                  <Header>{dictionary.columns.odometerReading}</Header>
                  <Header>{dictionary.columns.scheduledAt}</Header>
                </>
              )}
              <Header>{dictionary.requestDate}</Header>
              <Header>{dictionary.status}</Header>
              <Header>{dictionary.reviewer}</Header>
              <Header>{dictionary.actions}</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                {requestType === "leave" && (
                  <Cell>
                    {row.driverPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.driverPhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="inline-grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                        {row.driverName.slice(0, 1) || "-"}
                      </span>
                    )}
                  </Cell>
                )}
                <Cell strong>{row.driverName}</Cell>
                <Cell>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
                {requestType === "leave" && (
                  <Cell>{row.organizationName ?? dictionary.notAvailable}</Cell>
                )}
                {requestType !== "leave" && (
                  <>
                    <Cell>{row.vehicleLabel ?? dictionary.notAvailable}</Cell>
                    <Cell>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
                  </>
                )}
                {renderRequestCells(row, requestType, dictionary, locale)}
                <Cell>{formatDateTime(row.submittedAt, locale)}</Cell>
                <Cell>
                  <StatusBadge status={row.status} dictionary={dictionary} />
                </Cell>
                <Cell>{row.reviewerName ?? dictionary.notAvailable}</Cell>
                <Cell>
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
  const router = useRouter();

  return (
    <>
      <div className="overflow-x-auto border border-border bg-surface">
        <table className="w-full min-w-[1500px] border-collapse text-start">
          <thead className="bg-background text-xs font-bold uppercase text-muted">
            <tr>
              <Header>{dictionary.columns.driverPhoto}</Header>
              <Header>{dictionary.driver}</Header>
              <Header>{dictionary.driverId}</Header>
              <Header>{dictionary.vehicle}</Header>
              <Header>{dictionary.columns.actualPlate}</Header>
              <Header>{dictionary.columns.shiftDate}</Header>
              <Header>{dictionary.columns.startTime}</Header>
              <Header>{dictionary.columns.startReading}</Header>
              <Header>{dictionary.columns.startPhoto}</Header>
              <Header>{dictionary.columns.startReviewStatus}</Header>
              <Header>{dictionary.columns.endTime}</Header>
              <Header>{dictionary.columns.endReading}</Header>
              <Header>{dictionary.columns.endPhoto}</Header>
              <Header>{dictionary.columns.endReviewStatus}</Header>
              <Header>{dictionary.columns.distance}</Header>
              <Header>{dictionary.actions}</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <Cell>
                  {row.driverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.driverPhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="inline-grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                      {row.driverName.slice(0, 1) || "-"}
                    </span>
                  )}
                </Cell>
                <Cell strong>{row.driverName}</Cell>
                <Cell>{row.driverIdentifier ?? dictionary.notAvailable}</Cell>
                <Cell>{formatVehicleLabel(row.vehicleLabel, dictionary)}</Cell>
                <Cell>{row.vehiclePlate ?? dictionary.notAvailable}</Cell>
                <Cell>{formatDateTime(row.shiftDate, locale, "Asia/Riyadh")}</Cell>
                <Cell>{row.startedAt ? formatDateTime(row.startedAt, locale, "Asia/Riyadh") : dictionary.notAvailable}</Cell>
                <Cell>{row.startReading === null ? dictionary.notAvailable : row.startReading.toLocaleString(locale)}</Cell>
                <Cell>
                  <PhotoLink
                    url={row.startPhotoUrl}
                    hasPhoto={row.startPhotoPathPresent}
                    label={dictionary.columns.startPhoto}
                    dictionary={dictionary}
                  />
                </Cell>
                <Cell><ReviewBadge status={row.startReviewStatus} dictionary={dictionary} /></Cell>
                <Cell>{row.endedAt ? formatDateTime(row.endedAt, locale, "Asia/Riyadh") : dictionary.notAvailable}</Cell>
                <Cell>{row.endReading === null ? dictionary.notAvailable : row.endReading.toLocaleString(locale)}</Cell>
                <Cell>
                  <PhotoLink
                    url={row.endPhotoUrl}
                    hasPhoto={row.endPhotoPathPresent}
                    label={dictionary.columns.endPhoto}
                    dictionary={dictionary}
                  />
                </Cell>
                <Cell><ReviewBadge status={row.endReviewStatus} dictionary={dictionary} /></Cell>
                <Cell>{row.distance === null ? dictionary.notAvailable : row.distance.toLocaleString(locale)}</Cell>
                <Cell>
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
    </>
  );
}

function PhotoLink({
  url,
  hasPhoto,
  label,
  dictionary,
}: {
  url: string | null;
  hasPhoto: boolean;
  label: string;
  dictionary: AppRequestsDictionary;
}) {
  if (!hasPhoto) return <span>{dictionary.notAvailable}</span>;
  if (!url) return <span className="text-xs font-bold text-red-600">{dictionary.imageLoadFailed}</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary">
      {label}
    </a>
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
  return <span className="rounded-full border border-border px-2 py-1 text-xs font-bold">{dictionary.reviewStatuses[status]}</span>;
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

  useEffect(() => {
    if (state.status === "success") onSuccess();
  }, [onSuccess, state.status]);

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
        <Detail label={dictionary.status} value={reviewStatus ? dictionary.reviewStatuses[reviewStatus] : dictionary.notAvailable} />
        <Detail label={dictionary.reviewer} value={reviewerName ?? dictionary.notAvailable} />
        <Detail label={dictionary.columns.reviewTime} value={reviewedAt ? formatDateTime(reviewedAt, locale, "Asia/Riyadh") : dictionary.notAvailable} />
        <Detail label={dictionary.reviewNote} value={reviewNote ?? dictionary.notAvailable} />
      </dl>
      <div className="mt-3">
        <PhotoLink
          url={photoUrl}
          hasPhoto={isStart ? shift.startPhotoPathPresent : shift.endPhotoPathPresent}
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

  useEffect(() => {
    if (state.status === "success") onSuccess();
  }, [onSuccess, state.status]);

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
        <Cell>{dictionary.leaveTypes[asLeaveType(row.detail.leave_type)]}</Cell>
        <Cell>{start}</Cell>
        <Cell>{end}</Cell>
        <Cell>{start && end ? countDays(start, end).toLocaleString(locale) : dictionary.notAvailable}</Cell>
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
        <Cell>{formatRequestedManager(row, dictionary)}</Cell>
        <Cell>{row.detail.subject ?? dictionary.notAvailable}</Cell>
        <Cell>{row.detail.preferred_date ?? dictionary.notAvailable}</Cell>
        <Cell>{row.detail.scheduled_at ?? dictionary.notAvailable}</Cell>
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

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-start">{children}</th>;
}

function Cell({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-sm ${strong ? "font-bold text-navy" : "text-muted"}`}
    >
      {children}
    </td>
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
    <span className="rounded-full border border-border px-2 py-1 text-xs font-bold">
      {dictionary.statuses[status]}
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
