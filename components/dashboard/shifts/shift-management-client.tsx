"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { DashboardMutationOverlay } from "@/components/dashboard/dashboard-loading-state";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import {
  archiveShiftTemplateAction,
  moveShiftDriverAction,
  publishShiftTemplateAction,
  replaceShiftWeekMembersAction,
  saveShiftAttendancePolicyAction,
  openDriverShiftAttendanceStartNowAction,
  saveShiftChangeRequestDaysAction,
  saveShiftTemplateAction,
  unpublishShiftTemplateAction,
} from "@/features/shifts/actions";
import { validateShiftTimes } from "@/features/shifts/time";
import type {
  ShiftActionResult,
  ShiftDriverOption,
  ShiftManagementDictionary,
  ScheduledShiftChangeRow,
  ShiftTemplateRow,
  ShiftWeekData,
  WeeklyShiftDriver,
  WeeklyShiftRow,
} from "@/features/shifts/types";
import type { ShiftManagementPermissions } from "@/features/shifts/queries";

type ShiftManagementClientProps = {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shifts: ShiftTemplateRow[];
  drivers: ShiftDriverOption[];
  scheduledChanges: ScheduledShiftChangeRow[];
  shiftChangeRequestDays: number[];
  weeks: { current: ShiftWeekData; next: ShiftWeekData };
  permissions: ShiftManagementPermissions;
};

const idleState: ShiftActionResult = { status: "idle" };
const inputClasses =
  "min-h-11 w-full rounded-lg border border-border bg-background px-4 text-sm font-semibold text-navy outline-none transition focus:border-primary";
const secondaryButtonClasses =
  "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-navy transition hover:border-primary/35 hover:text-primary";

export function ShiftManagementClient({
  locale,
  organizationCode,
  dictionary,
  shifts,
  drivers,
  scheduledChanges,
  shiftChangeRequestDays,
  weeks,
  permissions,
}: ShiftManagementClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingShift, setEditingShift] = useState<ShiftTemplateRow | null>(null);
  const [assigningShift, setAssigningShift] = useState<{
    shift: ShiftTemplateRow;
    week: ShiftWeekData;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [savingShiftForm, setSavingShiftForm] = useState(false);
  const [hideShiftFormDialog, setHideShiftFormDialog] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [hideAssignmentDialog, setHideAssignmentDialog] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [movingDriver, setMovingDriver] = useState<{
    week: ShiftWeekData;
    row: WeeklyShiftRow;
    driver: WeeklyShiftDriver;
  } | null>(null);
  const [openingDriver, setOpeningDriver] = useState<{
    week: ShiftWeekData;
    row: WeeklyShiftRow;
    driver: WeeklyShiftDriver;
  } | null>(null);
  const [shiftChangeDaysOpen, setShiftChangeDaysOpen] = useState(false);
  const [selectedShiftChangeDays, setSelectedShiftChangeDays] = useState<number[]>(shiftChangeRequestDays);
  const [isSavingShiftChangeDays, startSavingShiftChangeDays] = useTransition();
  const router = useRouter();
  const dismissToast = useCallback(() => setToast(null), []);
  const handleShiftSaved = useCallback(
    (message: string) => {
      setSavingShiftForm(false);
      setHideShiftFormDialog(false);
      setCreating(false);
      setEditingShift(null);
      setToast({ tone: "success", message });
      router.refresh();
    },
    [router],
  );
  const handleAssignmentsSaved = useCallback(
    (message: string) => {
      setSavingAssignments(false);
      setHideAssignmentDialog(false);
      setAssigningShift(null);
      setToast({ tone: "success", message });
      router.refresh();
    },
    [router],
  );
  const handleShiftPublished = useCallback(
    (message: string) => {
      setToast({ tone: "success", message });
      router.refresh();
    },
    [router],
  );
  const handleShiftPublicationError = useCallback((message: string) => {
    setToast({ tone: "error", message });
  }, []);
  const handleShiftFormSubmit = useCallback(() => {
    setSavingShiftForm(true);
    setHideShiftFormDialog(true);
  }, []);
  const handleShiftFormError = useCallback((message: string) => {
    setSavingShiftForm(false);
    setHideShiftFormDialog(false);
    setToast({ tone: "error", message });
  }, []);
  const handleAssignmentsSubmit = useCallback(() => {
    setSavingAssignments(true);
    setHideAssignmentDialog(true);
  }, []);
  const handleAssignmentsError = useCallback((message: string) => {
    setSavingAssignments(false);
    setHideAssignmentDialog(false);
    setToast({ tone: "error", message });
  }, []);
  const handleDriverAttendanceOpened = useCallback((message: string) => {
    setOpeningDriver(null);
    setToast({ tone: "success", message });
    router.refresh();
  }, [router]);
  const handleShiftChangeDaysSave = useCallback((days: number[]) => {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("organizationCode", organizationCode);
    days.forEach((day) => formData.append("allowedWeekdays", String(day)));

    startSavingShiftChangeDays(async () => {
      const result = await saveShiftChangeRequestDaysAction(idleState, formData);
      if (result.status === "success") {
        setSelectedShiftChangeDays(days);
        setShiftChangeDaysOpen(false);
        setToast({ tone: "success", message: result.message });
        router.refresh();
      } else if (result.status === "error") {
        setToast({ tone: "error", message: result.message });
      }
    });
  }, [locale, organizationCode, router]);

  const filteredShifts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return shifts.filter((shift) => {
      const matchesSearch =
        !normalizedSearch ||
        shift.name.toLocaleLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && shift.isActive) ||
        (statusFilter === "inactive" && !shift.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [search, shifts, statusFilter]);

  const assignedDriverCount = drivers.filter((driver) => driver.currentShiftId).length;
  const stats = [
    { label: dictionary.totalShifts, value: shifts.length },
    { label: dictionary.activeShifts, value: shifts.filter((shift) => shift.isActive).length },
    { label: dictionary.assignedDrivers, value: assignedDriverCount },
    { label: dictionary.unassignedDrivers, value: drivers.length - assignedDriverCount },
  ];

  return (
    <div className="min-h-full bg-background">
      <DashboardMutationOverlay active={savingShiftForm || savingAssignments || isSavingShiftChangeDays || Boolean(movingDriver) || Boolean(openingDriver)} />
      <UserToast locale={locale} toast={toast} onDismiss={dismissToast} />

      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">{dictionary.title}</h1>
            <p className="mt-2 text-sm font-medium text-muted">
              {dictionary.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {permissions.update ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedShiftChangeDays(shiftChangeRequestDays);
                  setShiftChangeDaysOpen(true);
                }}
                className={secondaryButtonClasses}
              >
                {dictionary.shiftChangeRequestDays}
              </button>
            ) : null}
            {permissions.create ? (
              <button
                type="button"
                onClick={() => {
                  setHideShiftFormDialog(false);
                  setCreating(true);
                }}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
              >
                {dictionary.addShift}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border bg-surface p-4 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-navy">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={dictionary.search}
            className="min-h-11 flex-1 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-navy outline-none transition focus:border-primary"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-navy outline-none transition focus:border-primary"
          >
            <option value="all">{dictionary.allStatuses}</option>
            <option value="active">{dictionary.active}</option>
            <option value="inactive">{dictionary.inactive}</option>
          </select>
        </div>

        <div className="space-y-5">
          {[weeks.current, weeks.next].map((week) => (
            <WeeklyShiftSection
              key={week.range.key}
              locale={locale}
              organizationCode={organizationCode}
              dictionary={dictionary}
              week={week}
              drivers={drivers}
              search={search}
              permissions={permissions}
              expandedRows={expandedRows}
              onToggleRow={(rowKey) => {
                setExpandedRows((current) => {
                  const next = new Set(current);
                  if (next.has(rowKey)) next.delete(rowKey);
                  else next.add(rowKey);
                  return next;
                });
              }}
              onEdit={(shift) => {
                setHideShiftFormDialog(false);
                setEditingShift(shift);
              }}
              onAssign={(shift) => {
                setHideAssignmentDialog(false);
                setAssigningShift({ shift, week });
              }}
              onMoveDriver={(row, driver) => setMovingDriver({ week, row, driver })}
              onOpenDriver={(row, driver) => setOpeningDriver({ week, row, driver })}
              onUpdated={router.refresh}
              onCopy={(message) => setToast({ tone: "success", message })}
            />
          ))}
        </div>
      </div>

      {creating ? (
        <ShiftFormDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={null}
          onClose={() => setCreating(false)}
          onSuccess={handleShiftSaved}
          onError={handleShiftFormError}
          onSubmit={handleShiftFormSubmit}
          hidden={hideShiftFormDialog}
        />
      ) : null}

      {editingShift ? (
        <ShiftFormDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onSuccess={handleShiftSaved}
          onError={handleShiftFormError}
          onSubmit={handleShiftFormSubmit}
          hidden={hideShiftFormDialog}
        />
      ) : null}

      {assigningShift ? (
        <AssignmentDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={assigningShift.shift}
          week={assigningShift.week}
          drivers={drivers}
          onClose={() => setAssigningShift(null)}
          onSuccess={handleAssignmentsSaved}
          onError={handleAssignmentsError}
          onSubmit={handleAssignmentsSubmit}
          hidden={hideAssignmentDialog}
        />
      ) : null}
      {movingDriver ? (
        <MoveDriverDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          week={movingDriver.week}
          sourceRow={movingDriver.row}
          driver={movingDriver.driver}
          onClose={() => setMovingDriver(null)}
          onSuccess={(message) => {
            setMovingDriver(null);
            setToast({ tone: "success", message });
            router.refresh();
          }}
          onError={(message) => setToast({ tone: "error", message })}
        />
      ) : null}
      {openingDriver ? (
        <DriverAttendanceOpenDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={openingDriver.row.shift}
          driver={openingDriver.driver}
          onClose={() => setOpeningDriver(null)}
          onSuccess={handleDriverAttendanceOpened}
        />
      ) : null}
      {shiftChangeDaysOpen ? (
        <ShiftChangeDaysDialog
          locale={locale}
          dictionary={dictionary}
          selectedDays={selectedShiftChangeDays}
          isPending={isSavingShiftChangeDays}
          onClose={() => setShiftChangeDaysOpen(false)}
          onSave={handleShiftChangeDaysSave}
        />
      ) : null}
    </div>
  );
}

function ShiftChangeDaysDialog({
  locale,
  dictionary,
  selectedDays,
  isPending,
  onClose,
  onSave,
}: {
  locale: "ar" | "en";
  dictionary: ShiftManagementDictionary;
  selectedDays: number[];
  isPending: boolean;
  onClose: () => void;
  onSave: (days: number[]) => void;
}) {
  const [days, setDays] = useState<number[]>(selectedDays);
  const weekdays = dictionary.shiftChangeWeekdays;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-navy">{dictionary.shiftChangeRequestDays}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{dictionary.shiftChangeRequestDaysDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-muted hover:text-navy" aria-label={dictionary.shiftChangeRequestDaysCancel}>
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {weekdays.map((label, day) => (
            <label key={day} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-navy">
              <input
                type="checkbox"
                checked={days.includes(day)}
                onChange={(event) => {
                  setDays((current) => event.target.checked ? [...current, day].sort((a, b) => a - b) : current.filter((value) => value !== day));
                }}
                className="h-4 w-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
        {days.length === 0 ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{dictionary.shiftChangeRequestDaysClosed}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isPending} className={secondaryButtonClasses}>{dictionary.shiftChangeRequestDaysCancel}</button>
          <button type="button" onClick={() => onSave(days)} disabled={isPending} className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-60">{dictionary.shiftChangeRequestDaysSave}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WeeklyShiftSection({
  locale,
  organizationCode,
  dictionary,
  week,
  drivers,
  search,
  permissions,
  expandedRows,
  onToggleRow,
  onEdit,
  onAssign,
  onMoveDriver,
  onOpenDriver,
  onUpdated,
  onCopy,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  week: ShiftWeekData;
  drivers: ShiftDriverOption[];
  search: string;
  permissions: ShiftManagementPermissions;
  expandedRows: Set<string>;
  onToggleRow: (key: string) => void;
  onEdit: (shift: ShiftTemplateRow) => void;
  onAssign: (shift: ShiftTemplateRow) => void;
  onMoveDriver: (row: WeeklyShiftRow, driver: WeeklyShiftDriver) => void;
  onOpenDriver: (row: WeeklyShiftRow, driver: WeeklyShiftDriver) => void;
  onUpdated: () => void;
  onCopy: (message: string) => void;
}) {
  const title = week.range.key === "current"
    ? weeklyText(dictionary, "currentWeek", locale === "ar" ? "شيفتات الأسبوع الحالي" : "Current week shifts")
    : weeklyText(dictionary, "nextWeek", locale === "ar" ? "شيفتات الأسبوع القادم" : "Next week shifts");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const rows = week.shifts.filter((row) => {
    if (!normalizedSearch) return true;
    return row.shift.name.toLocaleLowerCase().includes(normalizedSearch) ||
      row.assignedDrivers.some((driver) =>
        `${driver.fullName} ${driver.identifier ?? ""}`.toLocaleLowerCase().includes(normalizedSearch),
      );
  });
  const unassignedDrivers = useMemo(() => {
    const assignedDriverIds = new Set(
      week.shifts.flatMap((row) => row.assignedDrivers.map((driver) => driver.driverId)),
    );

    return drivers.filter((driver) => !assignedDriverIds.has(driver.id));
  }, [drivers, week.shifts]);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          <p className="text-xs font-semibold text-muted">{week.range.startDate} - {week.range.endDate}</p>
        </div>
        <span className="text-sm font-bold text-muted">{rows.length} {dictionary.totalShifts}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-muted">{dictionary.emptyMessage}</p>
        ) : null}
        {rows.map((row) => {
            const rowKey = `${week.range.key}:${row.shift.id}`;
            const expanded = expandedRows.has(rowKey);
            return (
              <div key={rowKey} className="px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <button type="button" onClick={() => onToggleRow(rowKey)} className="flex min-w-0 items-center gap-3 text-start">
                    <span className="text-lg text-muted" aria-hidden="true">{expanded ? "−" : "+"}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-navy">{row.shift.name}</span>
                      <span className="block text-xs font-semibold text-muted">{row.shift.startTime} -&gt; {row.shift.endTime}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-background px-3 py-1 text-xs font-bold text-muted">
                      {row.assignedDrivers.length} {dictionary.assignedDrivers}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={row.shift.publishedAt ? "success" : "warning"}>
                      {row.shift.publishedAt ? dictionary.published : dictionary.unpublished}
                    </Badge>
                    <AttendanceControls
                      locale={locale}
                      organizationCode={organizationCode}
                      dictionary={dictionary}
                      shift={row.shift}
                      canUpdate={permissions.update}
                      onUpdated={onUpdated}
                      onNotify={onCopy}
                    />
                    <WeeklyCopyButton row={row} locale={locale} dictionary={dictionary} onCopy={onCopy} />
                    {permissions.assign ? <button type="button" onClick={() => onAssign(row.shift)} className={secondaryButtonClasses}>{dictionary.manageDrivers}</button> : null}
                    <ShiftOverflowActions
                      locale={locale}
                      organizationCode={organizationCode}
                      dictionary={dictionary}
                      shift={row.shift}
                      permissions={permissions}
                      onEdit={() => onEdit(row.shift)}
                      onUpdated={onUpdated}
                    />
                  </div>
                </div>
                {expanded ? (
                  <div className="mt-3 grid gap-2 border-s border-border ps-5 sm:grid-cols-2 xl:grid-cols-3">
                    {row.assignedDrivers.length === 0 ? <p className="text-sm font-semibold text-muted">{weeklyText(dictionary, "noAssignments", locale === "ar" ? "لا يوجد مناديب مرتبطون" : "No drivers assigned")}</p> : null}
                    {row.assignedDrivers.map((driver) => (
                      <div key={driver.assignmentId} className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy">{driver.fullName}</p>
                          <p className="truncate text-xs font-semibold text-muted">{driver.identifier ?? "-"}{driver.vehicleLabel ? ` - ${driver.vehicleLabel}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={!driver.identifier}
                            onClick={() => void copyDriverIdentifier(driver.identifier, locale, dictionary, onCopy)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm font-bold text-navy transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                            title={weeklyText(dictionary, "copyDriverIdentifier", locale === "ar" ? "نسخ معرف المندوب" : "Copy driver identifier")}
                            aria-label={weeklyText(dictionary, "copyDriverIdentifier", locale === "ar" ? "نسخ معرف المندوب" : "Copy driver identifier")}
                          >
                            ⧉
                          </button>
                          {week.range.key === "current" && permissions.update ? (
                            <button
                              type="button"
                              onClick={() => onOpenDriver(row, driver)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 text-sm font-bold text-primary transition hover:bg-primary hover:text-white"
                              title={weeklyText(dictionary, "attendanceOpenDriver", locale === "ar" ? "فتح بدء الدوام لهذا المندوب" : "Open attendance start for this driver")}
                              aria-label={weeklyText(dictionary, "attendanceOpenDriver", locale === "ar" ? "فتح بدء الدوام لهذا المندوب" : "Open attendance start for this driver")}
                            >
                              ▶
                            </button>
                          ) : null}
                          {permissions.assign ? <button type="button" onClick={() => onMoveDriver(row, driver)} className="shrink-0 text-xs font-bold text-primary hover:underline">{weeklyText(dictionary, "moveDriver", locale === "ar" ? "نقل" : "Move")}</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
        })}
        <UnassignedDriversRow
          locale={locale}
          dictionary={dictionary}
          week={week}
          drivers={unassignedDrivers}
        />
      </div>
    </section>
  );
}

function AttendanceControls({
  locale,
  organizationCode,
  dictionary,
  shift,
  canUpdate,
  onUpdated,
  onNotify,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  canUpdate: boolean;
  onUpdated: () => void;
  onNotify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [policyState, policyAction] = useActionState(saveShiftAttendancePolicyAction, idleState);
  const [start, setStart] = useState(String(shift.attendancePolicy.startOpenBeforeMinutes ?? ""));
  const currentHours = shift.attendancePolicy.minimumWorkMinutes === null ? "" : String(Math.floor(shift.attendancePolicy.minimumWorkMinutes / 60));
  const currentMinutes = shift.attendancePolicy.minimumWorkMinutes === null ? "" : String(shift.attendancePolicy.minimumWorkMinutes % 60);
  const [hours, setHours] = useState(currentHours);
  const [minutes, setMinutes] = useState(currentMinutes);
  const handledSuccessState = useRef<ShiftActionResult | null>(null);
  const startMinutes = Number(start);
  const endMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const startPreview = start.trim() !== "" && Number.isInteger(startMinutes) && startMinutes >= 0 && startMinutes <= 1440
    ? formatClockFromShiftStart(shift.startTime, startMinutes)
    : null;
  const endPreview = (hours.trim() !== "" || minutes.trim() !== "") && Number.isInteger(endMinutes) && endMinutes >= 1 && endMinutes <= 1440
    ? formatAttendanceDuration(endMinutes, locale)
    : null;

  useEffect(() => {
    if (policyState.status === "success" && handledSuccessState.current !== policyState) {
      handledSuccessState.current = policyState;
      setOpen(false);
      onNotify(policyState.message);
      onUpdated();
    }
  }, [onNotify, onUpdated, policyState]);

  const startLabel = shift.attendancePolicy.startOpenBeforeMinutes === null
    ? dictionary.attendanceConfigureStart
    : replaceText(dictionary.attendanceStartRowLabel, {
        minutes: String(shift.attendancePolicy.startOpenBeforeMinutes),
      });
  const endLabel = shift.attendancePolicy.minimumWorkMinutes === null
    ? dictionary.attendanceConfigureEnd
    : replaceText(dictionary.attendanceEndRowLabel, {
        duration: formatAttendanceDuration(shift.attendancePolicy.minimumWorkMinutes, locale),
      });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={!canUpdate} onClick={() => setOpen(true)} className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-bold text-navy disabled:opacity-50">{startLabel}</button>
      <button type="button" disabled={!canUpdate} onClick={() => setOpen(true)} className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-bold text-navy disabled:opacity-50">{endLabel}</button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" dir={locale === "ar" ? "rtl" : "ltr"}>
          <form action={policyAction} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xl">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="organizationCode" value={organizationCode} />
            <input type="hidden" name="shiftId" value={shift.id} />
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-navy">{dictionary.attendanceSettingsTitle}</h2><p className="mt-1 text-sm font-bold text-primary">{dictionary.attendanceShiftContext}: {shift.name}</p><p className="text-xs font-semibold text-muted">{shift.startTime} -&gt; {shift.endTime}{shift.crossesMidnight ? ` (${dictionary.attendanceOvernight})` : ""}</p></div><button type="button" onClick={() => setOpen(false)} className="text-xl text-muted" aria-label={dictionary.close}>x</button></div>
            <label className="block text-sm font-semibold text-navy">{dictionary.attendanceStartBeforeLabel}<div className="mt-1 flex items-center gap-2"><input name="startOpenBeforeMinutes" type="number" min="0" max="1440" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3" /><span className="shrink-0 text-sm font-bold text-muted">{dictionary.attendanceStartUnit}</span></div></label>
            <p className="text-xs leading-5 text-muted">{dictionary.attendanceStartHelper}</p>
            {startPreview ? <p className="rounded-lg bg-background px-3 py-2 text-sm font-bold text-primary">{replaceText(dictionary.attendanceStartPreview, { time: startPreview })}</p> : null}
            <div><p className="text-sm font-semibold text-navy">{dictionary.attendanceEndAfterLabel}</p><div className="mt-1 grid grid-cols-2 gap-2"><label className="flex items-center gap-2"><input name="minimumWorkHours" type="number" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3" /><span className="text-xs font-bold text-muted">{dictionary.attendanceHoursUnit}</span></label><label className="flex items-center gap-2"><input name="minimumWorkMinutesRemainder" type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3" /><span className="text-xs font-bold text-muted">{dictionary.attendanceMinutesUnit}</span></label></div></div>
            <p className="text-xs leading-5 text-muted">{dictionary.attendanceEndHelper}</p>
            <p className="text-xs leading-5 text-muted">{dictionary.attendanceEndExample}</p>
            {endPreview ? <p className="rounded-lg bg-background px-3 py-2 text-sm font-bold text-primary">{replaceText(dictionary.attendanceEndPreview, { duration: endPreview })}</p> : null}
            {policyState.status === "error" ? <p role="alert" className="text-sm font-semibold text-red-600">{policyState.message}</p> : null}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className={secondaryButtonClasses}>{dictionary.cancel}</button><button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">{dictionary.save}</button></div>
          </form>
        </div>, document.body,
      ) : null}
    </div>
  );
}

function formatAttendanceDuration(minutes: number, locale: "ar" | "en") {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours}${locale === "ar" ? " س" : "h"}`;
  return `${hours}${locale === "ar" ? " س " : "h "}${remainder}${locale === "ar" ? " د" : "m"}`;
}

function formatClockFromShiftStart(startTime: string, minutesBefore: number) {
  const [hours, minutes] = startTime.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return startTime;
  const total = (hours * 60 + minutes - minutesBefore + 1440 * 2) % (1440);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function replaceText(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template,
  );
}

async function copyDriverIdentifier(
  identifier: string | null,
  locale: "ar" | "en",
  dictionary: ShiftManagementDictionary,
  onCopy: (message: string) => void,
) {
  if (!identifier || !navigator.clipboard?.writeText) return;

  try {
    await navigator.clipboard.writeText(identifier);
    onCopy(weeklyText(dictionary, "copiedDriverIdentifier", locale === "ar" ? "تم نسخ معرف المندوب" : "Driver identifier copied"));
  } catch {
    onCopy(weeklyText(dictionary, "copyDriverIdentifierFailed", locale === "ar" ? "تعذر نسخ معرف المندوب" : "Could not copy driver identifier"));
  }
}

function DriverAttendanceOpenDialog({
  locale,
  organizationCode,
  dictionary,
  shift,
  driver,
  onClose,
  onSuccess,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  driver: WeeklyShiftDriver;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(openDriverShiftAttendanceStartNowAction, idleState);

  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
  }, [onSuccess, state]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" dir={locale === "ar" ? "rtl" : "ltr"}>
      <form action={action} className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-xl">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="shiftId" value={shift.id} />
        <input type="hidden" name="driverId" value={driver.driverId} />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy">{weeklyText(dictionary, "attendanceOpenDriver", locale === "ar" ? "فتح بدء الدوام لهذا المندوب" : "Open attendance start for this driver")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {weeklyText(dictionary, "attendanceOpenDriverConfirmation", locale === "ar" ? "هل تريد فتح بدء الدوام الآن لهذا المندوب فقط؟ لن يتم فتح بدء الدوام لباقي مناديب الشيفت." : "Open attendance start now for this driver only? Other drivers on this shift will remain unchanged.")}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="text-xl text-muted" aria-label={dictionary.close}>x</button>
        </div>
        <dl className="grid gap-2 rounded-lg bg-background p-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="font-semibold text-muted">{weeklyText(dictionary, "driverName", locale === "ar" ? "المندوب" : "Driver")}</dt><dd className="font-bold text-navy">{driver.fullName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-semibold text-muted">{dictionary.driverIdentifier}</dt><dd className="font-bold text-navy">{driver.identifier ?? "-"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-semibold text-muted">{dictionary.name}</dt><dd className="font-bold text-navy">{shift.name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="font-semibold text-muted">{dictionary.startTime}</dt><dd className="font-bold text-navy">{shift.startTime} -&gt; {shift.endTime}</dd></div>
          {driver.vehicleLabel ? <div className="flex justify-between gap-3"><dt className="font-semibold text-muted">{dictionary.vehicle}</dt><dd className="font-bold text-navy">{driver.vehicleLabel}</dd></div> : null}
        </dl>
        {state.status === "error" ? <p role="alert" className="text-sm font-semibold text-red-600">{state.message}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClasses}>{dictionary.cancel}</button>
          <SubmitButton label={weeklyText(dictionary, "attendanceOpenDriverConfirm", locale === "ar" ? "فتح بدء الدوام الآن" : "Open attendance start now")} pendingLabel={dictionary.saving} />
        </div>
      </form>
    </div>,
    document.body,
  );
}

function UnassignedDriversRow({
  locale,
  dictionary,
  week,
  drivers,
}: {
  locale: "ar" | "en";
  dictionary: ShiftManagementDictionary;
  week: ShiftWeekData;
  drivers: ShiftDriverOption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const rowKey = `unassigned:${week.range.key}`;

  return (
    <div className="bg-background/45 px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full min-w-0 items-center gap-3 text-start"
        aria-expanded={expanded}
        aria-controls={rowKey}
      >
        <span className="text-lg text-muted" aria-hidden="true">{expanded ? "−" : "+"}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-navy">
            {weeklyText(dictionary, "noShiftAssigned", locale === "ar" ? "لا يوجد شيفت" : "No Shift Assigned")}
          </span>
          <span className="block text-xs font-semibold text-muted">
            {weeklyText(
              dictionary,
              "notAssignedThisWeek",
              locale === "ar" ? "غير مرتبطين بأي شيفت في هذا الأسبوع" : "Not assigned to any shift this week",
            )}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-muted">
          {drivers.length} {dictionary.unassignedDrivers}
        </span>
      </button>
      {expanded ? (
        <div id={rowKey} className="mt-3 grid gap-2 border-s border-border ps-5 sm:grid-cols-2 xl:grid-cols-3">
          {drivers.length === 0 ? (
            <p className="text-sm font-semibold text-muted">
              {weeklyText(
                dictionary,
                "noUnassignedDriversThisWeek",
                locale === "ar" ? "لا يوجد مناديب بدون شيفت هذا الأسبوع" : "No drivers are unassigned this week.",
              )}
            </p>
          ) : (
            drivers.map((driver) => (
              <div key={driver.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-navy">{driver.fullName}</p>
                  <p className="truncate text-xs font-semibold text-muted">
                    {driver.identifier ?? "-"}{driver.vehicleLabel ? ` - ${driver.vehicleLabel}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function WeeklyCopyButton({
  row,
  locale,
  dictionary,
  onCopy,
}: {
  row: WeeklyShiftRow;
  locale: "ar" | "en";
  dictionary: ShiftManagementDictionary;
  onCopy: (message: string) => void;
}) {
  return (
    <button
      type="button"
      className={secondaryButtonClasses}
      onClick={async () => {
        const ids = Array.from(new Set(row.assignedDrivers.map((driver) => driver.identifier).filter((id): id is string => Boolean(id))));
        if (!ids.length) {
          onCopy(weeklyText(dictionary, "noIds", locale === "ar" ? "لا توجد معرفات كييتا" : "No Keeta IDs available"));
          return;
        }
        await navigator.clipboard.writeText(ids.join("\n"));
        onCopy(weeklyText(dictionary, "copiedIds", locale === "ar" ? `تم نسخ ${ids.length} معرف` : `Copied ${ids.length} IDs`).replace("{count}", String(ids.length)));
      }}
    >
      {weeklyText(dictionary, "copyIds", locale === "ar" ? "نسخ المعرفات" : "Copy IDs")}
    </button>
  );
}

function ShiftOverflowActions({
  locale,
  organizationCode,
  dictionary,
  shift,
  permissions,
  onEdit,
  onUpdated,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  permissions: ShiftManagementPermissions;
  onEdit: () => void;
  onUpdated: () => void;
}) {
  const [archiveState, archiveAction] = useActionState(archiveShiftTemplateAction, idleState);
  const [publishState, publishAction] = useActionState(shift.publishedAt ? unpublishShiftTemplateAction : publishShiftTemplateAction, idleState);
  const [statusState, statusAction] = useActionState(saveShiftTemplateAction, idleState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  useRefreshOnUnauthorized(archiveState);
  useRefreshOnUnauthorized(publishState);
  useRefreshOnUnauthorized(statusState);
  useEffect(() => {
    if (archiveState.status === "success" || publishState.status === "success" || statusState.status === "success") onUpdated();
  }, [archiveState, onUpdated, publishState, statusState]);
  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const closeMenu = () => setIsOpen(false);
    const positionMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 190;
      const menuHeight = 210;
      const gap = 6;
      const padding = 8;
      const openUp = rect.bottom + gap + menuHeight > window.innerHeight - padding;
      const top = openUp ? rect.top - gap - menuHeight : rect.bottom + gap;
      const left = Math.min(
        Math.max(padding, rect.right - menuWidth),
        window.innerWidth - menuWidth - padding,
      );
      setMenuPosition({ left, top: Math.max(padding, top) });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest("[data-shift-overflow-menu]")) closeMenu();
    };
    positionMenu();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [isOpen]);
  const runAndClose = (handler: () => void) => {
    handler();
    setIsOpen(false);
  };
  return (
    <div className="relative" data-shift-overflow-menu>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-bold text-navy"
      >
        ...
      </button>
      {isOpen && menuPosition
        ? createPortal(
            <div
              role="menu"
              data-shift-overflow-menu
              style={{ left: menuPosition.left, top: menuPosition.top }}
              className="fixed z-[100] flex min-w-48 flex-col gap-2 rounded-lg border border-border bg-surface p-2 shadow-xl"
            >
              {permissions.update ? <button type="button" role="menuitem" onClick={() => runAndClose(onEdit)} className="rounded px-3 py-2 text-start text-sm font-bold text-navy hover:bg-background">{dictionary.editShift}</button> : null}
              {permissions.update ? <form action={publishAction} onSubmit={() => setIsOpen(false)}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organizationCode} /><input type="hidden" name="shiftId" value={shift.id} /><SubmitButton label={shift.publishedAt ? dictionary.unpublish : dictionary.publish} pendingLabel={dictionary.saving} variant={shift.publishedAt ? "warning" : "primary"} /></form> : null}
              {permissions.update ? <form action={statusAction} onSubmit={() => setIsOpen(false)}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organizationCode} /><input type="hidden" name="shiftId" value={shift.id} /><input type="hidden" name="name" value={shift.name} /><input type="hidden" name="driverNote" value={shift.driverNote ?? ""} /><input type="hidden" name="startTime" value={shift.startTime} /><input type="hidden" name="endTime" value={shift.endTime} />{shift.hasBreak ? <input type="hidden" name="hasBreak" value="on" /> : null}{shift.breakStartTime ? <input type="hidden" name="breakStartTime" value={shift.breakStartTime} /> : null}{shift.breakEndTime ? <input type="hidden" name="breakEndTime" value={shift.breakEndTime} /> : null}{!shift.isActive ? <input type="hidden" name="isActive" value="on" /> : null}<SubmitButton label={shift.isActive ? dictionary.deactivate : dictionary.activate} pendingLabel={dictionary.saving} /></form> : null}
              {permissions.archive ? <form action={archiveAction} onSubmit={() => setIsOpen(false)}><input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organizationCode} /><input type="hidden" name="shiftId" value={shift.id} /><SubmitButton label={dictionary.archive} pendingLabel={dictionary.saving} danger /></form> : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function MoveDriverDialog({
  locale,
  organizationCode,
  dictionary,
  week,
  sourceRow,
  driver,
  onClose,
  onSuccess,
  onError,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  week: ShiftWeekData;
  sourceRow: WeeklyShiftRow;
  driver: WeeklyShiftDriver;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [state, action] = useActionState(moveShiftDriverAction, idleState);
  useRefreshOnUnauthorized(state);
  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
    if (state.status === "error") onError(state.message);
  }, [onError, onSuccess, state]);
  return (
    <Dialog title={weeklyText(dictionary, "moveDriver", locale === "ar" ? "نقل المندوب" : "Move driver")} onClose={onClose}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="sourceShiftId" value={sourceRow.shift.id} /><input type="hidden" name="driverId" value={driver.driverId} />
        <input type="hidden" name="assignmentStartDate" value={week.range.startDate} /><input type="hidden" name="assignmentEndDate" value={week.range.endDate} />
        <p className="text-sm font-bold text-navy">{driver.fullName} - {sourceRow.shift.name}</p>
        <Field label={weeklyText(dictionary, "moveToShift", locale === "ar" ? "النقل إلى الشيفت" : "Move to shift")}>
          <select name="targetShiftId" required className={inputClasses} defaultValue="">
            <option value="" disabled>{weeklyText(dictionary, "chooseShift", locale === "ar" ? "اختر الشيفت" : "Choose shift")}</option>
            {week.shifts.filter((row) => row.shift.id !== sourceRow.shift.id).map((row) => <option key={row.shift.id} value={row.shift.id}>{row.shift.name} ({row.shift.startTime} -&gt; {row.shift.endTime})</option>)}
          </select>
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className={secondaryButtonClasses}>{dictionary.cancel}</button><SubmitButton label={weeklyText(dictionary, "moveDriver", locale === "ar" ? "نقل المندوب" : "Move driver")} pendingLabel={dictionary.saving} /></div>
        <ActionMessage state={state} />
      </form>
    </Dialog>
  );
}

function weeklyText(dictionary: ShiftManagementDictionary, key: string, fallback: string) {
  const value = (dictionary as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

function ScheduledShiftChangesPanel({
  changes,
}: {
  changes: ScheduledShiftChangeRow[];
}) {
  const upcoming = changes.filter((change) => change.status === "upcoming");
  const completed = changes.filter((change) => change.status !== "upcoming");

  if (changes.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-navy">تغييرات الشيفتات المجدولة</h2>
        <span className="text-xs font-bold text-muted">{changes.length}</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ScheduledShiftChangeGroup title="القادمة" changes={upcoming} />
        <ScheduledShiftChangeGroup title="تم الوصول لتاريخها" changes={completed} />
      </div>
    </section>
  );
}

function ScheduledShiftChangeGroup({
  title,
  changes,
}: {
  title: string;
  changes: ScheduledShiftChangeRow[];
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-muted">{title}</h3>
      <div className="mt-2 space-y-2">
        {changes.length === 0 ? (
          <p className="rounded-lg bg-background p-3 text-sm font-semibold text-muted">
            لا توجد تغييرات.
          </p>
        ) : (
          changes.map((change) => (
            <div key={change.id} className="rounded-lg bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-bold text-navy">{change.driverName}</p>
                <Badge
                  tone={change.status === "completed" ? "success" : "warning"}
                >
                  {change.statusLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs font-semibold text-muted">
                {change.fromShiftName || "-"} -&gt; {change.toShiftName || "-"}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-600">
                {formatBusinessDate(change.executionDate)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ShiftCard({
  locale,
  organizationCode,
  dictionary,
  shift,
  permissions,
  onEdit,
  onAssign,
  onPublishSuccess,
  onPublicationError,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  permissions: ShiftManagementPermissions;
  onEdit: () => void;
  onAssign: () => void;
  onPublishSuccess: (message: string) => void;
  onPublicationError: (message: string) => void;
}) {
  const [archiveState, archiveAction] = useActionState(
    archiveShiftTemplateAction,
    idleState,
  );
  const [statusState, statusAction] = useActionState(
    saveShiftTemplateAction,
    idleState,
  );
  const [publishState, publishAction] = useActionState(
    publishShiftTemplateAction,
    idleState,
  );
  const [unpublishState, unpublishAction] = useActionState(
    unpublishShiftTemplateAction,
    idleState,
  );
  useRefreshOnUnauthorized(archiveState);
  useRefreshOnUnauthorized(statusState);
  useRefreshOnUnauthorized(publishState);
  useRefreshOnUnauthorized(unpublishState);

  useEffect(() => {
    if (publishState.status === "success") {
      onPublishSuccess(publishState.message);
    } else if (publishState.status === "error") {
      onPublicationError(publishState.message);
    }
  }, [onPublicationError, onPublishSuccess, publishState]);

  useEffect(() => {
    if (unpublishState.status === "success") {
      onPublishSuccess(unpublishState.message);
    } else if (unpublishState.status === "error") {
      onPublicationError(unpublishState.message);
    }
  }, [onPublicationError, onPublishSuccess, unpublishState]);

  return (
    <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy">{shift.name}</h2>
          <p className="mt-1 text-sm font-bold text-muted">
            {shift.startTime} -&gt; {shift.endTime}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={shift.isActive ? "success" : "muted"}>
            {shift.isActive ? dictionary.active : dictionary.inactive}
          </Badge>
          <Badge tone={shift.publishedAt ? "success" : "warning"}>
            {shift.publishedAt ? dictionary.published : dictionary.unpublished}
          </Badge>
          {shift.crossesMidnight ? (
            <Badge tone="warning">{dictionary.overnight}</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label={dictionary.totalDuration} value={formatMinutes(shift.totalMinutes, locale)} />
        <Metric label={dictionary.breakDuration} value={formatMinutes(shift.breakMinutes, locale)} />
        <Metric label={dictionary.effectiveDuration} value={formatMinutes(shift.effectiveMinutes, locale)} />
      </div>

      <div className="mt-4 rounded-lg bg-background p-3 text-sm font-semibold text-muted">
        {shift.hasBreak && shift.breakStartTime && shift.breakEndTime
          ? `${dictionary.breakLabel}: ${shift.breakStartTime} -> ${shift.breakEndTime}`
          : dictionary.noBreak}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold text-navy">
          {dictionary.assignedCount.replace(
            "{count}",
            String(shift.assignedDriverCount),
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          {permissions.update ? (
            <button type="button" onClick={onEdit} className={secondaryButtonClasses}>
              {dictionary.editShift}
            </button>
          ) : null}
          {permissions.assign ? (
            <button type="button" onClick={onAssign} className={secondaryButtonClasses}>
              {dictionary.manageDrivers}
            </button>
          ) : null}
          {permissions.update ? (
            <form action={shift.publishedAt ? unpublishAction : publishAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="organizationCode" value={organizationCode} />
              <input type="hidden" name="shiftId" value={shift.id} />
              <SubmitButton
                label={shift.publishedAt ? dictionary.unpublish : dictionary.publish}
                pendingLabel={dictionary.saving}
                variant={shift.publishedAt ? "warning" : "primary"}
              />
            </form>
          ) : null}
          {permissions.update ? (
            <form action={statusAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="organizationCode" value={organizationCode} />
              <input type="hidden" name="shiftId" value={shift.id} />
              <input type="hidden" name="name" value={shift.name} />
              <input type="hidden" name="driverNote" value={shift.driverNote ?? ""} />
              <input type="hidden" name="startTime" value={shift.startTime} />
              <input type="hidden" name="endTime" value={shift.endTime} />
              {shift.hasBreak ? <input type="hidden" name="hasBreak" value="on" /> : null}
              {shift.breakStartTime ? <input type="hidden" name="breakStartTime" value={shift.breakStartTime} /> : null}
              {shift.breakEndTime ? <input type="hidden" name="breakEndTime" value={shift.breakEndTime} /> : null}
              {!shift.isActive ? <input type="hidden" name="isActive" value="on" /> : null}
              <SubmitButton label={shift.isActive ? dictionary.deactivate : dictionary.activate} pendingLabel={dictionary.saving} />
            </form>
          ) : null}
          {permissions.archive ? (
            <form action={archiveAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="organizationCode" value={organizationCode} />
              <input type="hidden" name="shiftId" value={shift.id} />
              <SubmitButton label={dictionary.archive} pendingLabel={dictionary.saving} danger />
            </form>
          ) : null}
        </div>
      </div>

      <ActionMessage state={statusState} />
      <ActionMessage state={archiveState} />
    </article>
  );
}

function ShiftFormDialog({
  locale,
  organizationCode,
  dictionary,
  shift,
  onClose,
  onSuccess,
  onError,
  onSubmit,
  hidden,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onSubmit: () => void;
  hidden: boolean;
}) {
  const [state, action] = useActionState(saveShiftTemplateAction, idleState);
  useRefreshOnUnauthorized(state);
  const [startTime, setStartTime] = useState(shift?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(shift?.endTime ?? "20:00");
  const [hasBreak, setHasBreak] = useState(shift?.hasBreak ?? false);
  const [breakStartTime, setBreakStartTime] = useState(shift?.breakStartTime ?? "");
  const [breakEndTime, setBreakEndTime] = useState(shift?.breakEndTime ?? "");
  const summary = validateShiftTimes({
    startTime,
    endTime,
    hasBreak,
    breakStartTime,
    breakEndTime,
  });

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message);
    } else if (state.status === "error") {
      onError(state.message);
    }
  }, [onError, onSuccess, state]);

  return (
    <Dialog title={shift ? dictionary.editShift : dictionary.addShift} onClose={onClose} hidden={hidden}>
      <form action={action} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        {shift ? <input type="hidden" name="shiftId" value={shift.id} /> : null}

        <Field label={dictionary.name}>
          <input name="name" defaultValue={shift?.name ?? ""} required className={inputClasses} />
        </Field>

        <Field label={dictionary.driverNote}>
          <textarea
            name="driverNote"
            defaultValue={shift?.driverNote ?? ""}
            maxLength={500}
            rows={4}
            className={`${inputClasses} py-3`}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={dictionary.startTime}>
            <input name="startTime" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required className={inputClasses} />
          </Field>
          <Field label={dictionary.endTime}>
            <input name="endTime" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required className={inputClasses} />
          </Field>
        </div>

        <label className="flex items-center gap-3 text-sm font-bold text-navy">
          <input
            name="hasBreak"
            type="checkbox"
            checked={hasBreak}
            onChange={(event) => {
              setHasBreak(event.target.checked);
              if (!event.target.checked) {
                setBreakStartTime("");
                setBreakEndTime("");
              }
            }}
            className="h-4 w-4 accent-primary"
          />
          {dictionary.hasBreak}
        </label>

        {hasBreak ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={dictionary.breakStartTime}>
              <input name="breakStartTime" type="time" value={breakStartTime} onChange={(event) => setBreakStartTime(event.target.value)} required className={inputClasses} />
            </Field>
            <Field label={dictionary.breakEndTime}>
              <input name="breakEndTime" type="time" value={breakEndTime} onChange={(event) => setBreakEndTime(event.target.value)} required className={inputClasses} />
            </Field>
          </div>
        ) : null}

        <label className="flex items-center gap-3 text-sm font-bold text-navy">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={shift?.isActive ?? true}
            className="h-4 w-4 accent-primary"
          />
          {dictionary.status}: {dictionary.active}
        </label>

        <div className="grid gap-3 rounded-lg bg-background p-3 text-sm font-semibold text-muted sm:grid-cols-2">
          <span>{dictionary.totalDuration}: {summary.ok ? formatMinutes(summary.totalMinutes, locale) : "-"}</span>
          <span>{dictionary.breakDuration}: {summary.ok ? formatMinutes(summary.breakMinutes, locale) : "-"}</span>
          <span>{dictionary.effectiveDuration}: {summary.ok ? formatMinutes(summary.effectiveMinutes, locale) : "-"}</span>
          <span>{summary.ok && summary.crossesMidnight ? dictionary.extendsNextDay : dictionary.sameDay}</span>
        </div>

        <ActionMessage state={state} />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClasses}>
            {dictionary.cancel}
          </button>
          <SubmitButton label={dictionary.save} pendingLabel={dictionary.saving} />
        </div>
      </form>
    </Dialog>
  );
}

function AssignmentDialog({
  locale,
  organizationCode,
  dictionary,
  shift,
  week,
  drivers,
  onClose,
  onSuccess,
  onError,
  onSubmit,
  hidden,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  week: ShiftWeekData;
  drivers: ShiftDriverOption[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onSubmit: () => void;
  hidden: boolean;
}) {
  const [state, action] = useActionState(replaceShiftWeekMembersAction, idleState);
  useRefreshOnUnauthorized(state);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const assignedToThisShift = useMemo(() => {
    const row = week.shifts.find((item) => item.shift.id === shift.id);
    return new Set(row?.assignedDrivers.map((driver) => driver.driverId) ?? []);
  }, [shift.id, week.shifts]);
  const assignedToOtherShift = useMemo(() => {
    const ids = new Set<string>();
    for (const row of week.shifts) {
      if (row.shift.id === shift.id) continue;
      for (const driver of row.assignedDrivers) ids.add(driver.driverId);
    }
    return ids;
  }, [shift.id, week.shifts]);
  const assignmentSignature = Array.from(assignedToThisShift).sort().join(",") + "|" + Array.from(assignedToOtherShift).sort().join(",");
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [copyMessage, setCopyMessage] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);
  const candidateDrivers = drivers.filter((driver) =>
    assignedToThisShift.has(driver.id) || !assignedToOtherShift.has(driver.id),
  );
  const selectedDrivers = candidateDrivers.filter((driver) =>
    selectedDriverIds.has(driver.id),
  );
  const filteredDrivers = candidateDrivers.filter((driver) => {
    const normalized = query.trim().toLocaleLowerCase();
    const matchesQuery =
      !normalized ||
      driver.fullName.toLocaleLowerCase().includes(normalized) ||
      (driver.identifier ?? "").toLocaleLowerCase().includes(normalized);
    const isAssigned = assignedToThisShift.has(driver.id);
    const matchesFilter =
      filter === "all" ||
      (filter === "assigned" && isAssigned) ||
      (filter === "unassigned" && !isAssigned && !assignedToOtherShift.has(driver.id));

    return matchesQuery && matchesFilter;
  });

  useEffect(() => {
    setSelectedDriverIds(new Set(assignedToThisShift));
  }, [assignmentSignature, assignedToThisShift]);

  async function copySelectedKeetaIds() {
    const seenKeetaIds = new Set<string>();
    const keetaIds: string[] = [];
    let missingCount = 0;

    for (const driver of selectedDrivers) {
      const keetaId = driver.identifier?.trim();

      if (!keetaId) {
        missingCount += 1;
        continue;
      }

      if (seenKeetaIds.has(keetaId)) {
        continue;
      }

      seenKeetaIds.add(keetaId);
      keetaIds.push(keetaId);
    }

    if (keetaIds.length === 0) {
      setCopyMessage({
        tone: "error",
        text:
          locale === "ar"
            ? "لا توجد معرفات كيتا للمناديب المحددين"
            : "No Keeta IDs are available for the selected drivers.",
      });
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCopyMessage({
        tone: "error",
        text:
          locale === "ar"
            ? "تعذر نسخ معرفات كيتا"
            : "Unable to copy Keeta IDs.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(keetaIds.join("\n"));
      setCopyMessage({
        tone: missingCount > 0 ? "warning" : "success",
        text: formatKeetaCopyMessage({
          copiedCount: keetaIds.length,
          missingCount,
          locale,
        }),
      });
    } catch {
      setCopyMessage({
        tone: "error",
        text:
          locale === "ar"
            ? "تعذر نسخ معرفات كيتا"
            : "Unable to copy Keeta IDs.",
      });
    }
  }

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message);
    } else if (state.status === "error") {
      onError(state.message);
    }
  }, [onError, onSuccess, state]);

  return (
    <Dialog title={`${dictionary.manageDrivers}: ${shift.name}`} onClose={onClose} hidden={hidden}>
      <form action={action} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="shiftId" value={shift.id} />
        <input type="hidden" name="weekStart" value={week.range.startDate} />
        <input type="hidden" name="weekEnd" value={week.range.endDate} />

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
          <Badge tone="muted">
            {weeklyText(dictionary, week.range.key === "current" ? "currentWeek" : "nextWeek", week.range.key === "current" ? "Current week" : "Next week")}
          </Badge>
          <span>{week.range.startDate} - {week.range.endDate}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dictionary.searchDrivers}
            className={inputClasses}
          />
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className={inputClasses}>
            <option value="all">{dictionary.allDrivers}</option>
            <option value="assigned">{dictionary.assigned}</option>
            <option value="unassigned">{dictionary.unassigned}</option>
          </select>
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pe-1">
          {filteredDrivers.length === 0 ? (
            <p className="rounded-lg bg-background p-4 text-sm font-semibold text-muted">
              {dictionary.noDrivers}
            </p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-bold text-navy">{weeklyText(dictionary, "membersThisShift", locale === "ar" ? "المناديب المرتبطون بهذا الشيفت" : "Drivers assigned to this shift")}</p>
                <div className="space-y-2">
                {filteredDrivers.filter((driver) => assignedToThisShift.has(driver.id)).map((driver) => (
                  <AssignmentDriverOption
                    key={driver.id}
                    driver={driver}
                    checked={selectedDriverIds.has(driver.id)}
                    assignedLabel={weeklyText(dictionary, "assignedToThisShift", locale === "ar" ? "مرتبط بهذا الشيفت" : "Assigned to this shift")}
                    dictionary={dictionary}
                    onChange={(checked) => {
                      setSelectedDriverIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(driver.id); else next.delete(driver.id);
                        return next;
                      });
                      setCopyMessage(null);
                    }}
                  />
                ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-bold text-navy">{weeklyText(dictionary, "unassignedThisWeek", locale === "ar" ? "المناديب غير المرتبطين هذا الأسبوع" : "Drivers unassigned this week")}</p>
                <div className="space-y-2">
                {filteredDrivers.filter((driver) => !assignedToThisShift.has(driver.id) && !assignedToOtherShift.has(driver.id)).map((driver) => (
                  <AssignmentDriverOption
                    key={driver.id}
                    driver={driver}
                    checked={selectedDriverIds.has(driver.id)}
                    dictionary={dictionary}
                    onChange={(checked) => {
                      setSelectedDriverIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(driver.id); else next.delete(driver.id);
                        return next;
                      });
                      setCopyMessage(null);
                    }}
                  />
                ))}
                </div>
              </div>
            </>
          )}
        </div>
        <ActionMessage state={state} />
        {copyMessage ? <CopyMessage message={copyMessage} /> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={copySelectedKeetaIds}
            className={secondaryButtonClasses}
          >
            {locale === "ar"
              ? `نسخ معرفات كيتا (${selectedDriverIds.size})`
              : `Copy Keeta IDs (${selectedDriverIds.size})`}
          </button>
          <button type="button" onClick={onClose} className={secondaryButtonClasses}>
            {dictionary.close}
          </button>
          <SubmitButton label={dictionary.saveAssignments} pendingLabel={dictionary.saving} />
        </div>
      </form>
    </Dialog>
  );
}

function AssignmentDriverOption({
  driver,
  checked,
  assignedLabel,
  dictionary,
  onChange,
}: {
  driver: ShiftDriverOption;
  checked: boolean;
  assignedLabel?: string;
  dictionary: ShiftManagementDictionary;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
      <input
        type="checkbox"
        name="driverIds"
        value={driver.id}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-navy">{driver.fullName}</span>
        <span className="mt-1 block text-xs font-semibold text-muted">
          {dictionary.driverIdentifier}: {driver.identifier ?? "-"}
          {driver.vehicleLabel ? ` - ${dictionary.vehicle}: ${driver.vehicleLabel}` : ""}
        </span>
        {assignedLabel ? <span className="mt-1 block text-[11px] font-bold text-primary">{assignedLabel}</span> : null}
      </span>
    </label>
  );
}

function Dialog({
  title,
  children,
  onClose,
  hidden = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  hidden?: boolean;
}) {
  return (
    <div
      className={`fixed inset-0 z-[90] items-center justify-center bg-black/35 p-4 ${
        hidden ? "hidden" : "flex"
      }`}
      aria-hidden={hidden}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-navy">{title}</h2>
          <button type="button" onClick={onClose} className={secondaryButtonClasses}>
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyMessage({
  message,
}: {
  message: { tone: "success" | "warning" | "error"; text: string };
}) {
  const classes = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-700",
  };

  return (
    <p className={`rounded-lg px-3 py-2 text-sm font-bold ${classes[message.tone]}`}>
      {message.text}
    </p>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-navy">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 text-sm font-bold text-navy">{value}</p>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "warning" | "muted";
}) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    muted: "border-border bg-background text-muted",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${classes[tone]}`}>
      {children}
    </span>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  danger = false,
  variant = danger ? "danger" : "primary",
}: {
  label: string;
  pendingLabel: string;
  danger?: boolean;
  variant?: "primary" | "warning" | "danger";
}) {
  const { pending } = useFormStatus();
  const variantClasses = {
    primary:
      "bg-primary text-white hover:bg-primary/90",
    warning:
      "border border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100",
    danger:
      "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ActionMessage({ state }: { state: ShiftActionResult }) {
  if (state.status === "idle") return null;

  return (
    <p
      className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${
        state.status === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </p>
  );
}

function useRefreshOnUnauthorized(state: ShiftActionResult) {
  const router = useRouter();

  useEffect(() => {
    if (
      state.status === "error" &&
      "code" in state &&
      state.code === "unauthorized"
    ) {
      router.refresh();
    }
  }, [router, state]);
}

function formatMinutes(minutes: number, locale: "ar" | "en") {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (locale === "ar") {
    return remainingMinutes === 0
      ? `${hours} ساعة`
      : `${hours} ساعة ${remainingMinutes} دقيقة`;
  }

  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}

function formatBusinessDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatKeetaCopyMessage({
  copiedCount,
  missingCount,
  locale,
}: {
  copiedCount: number;
  missingCount: number;
  locale: "ar" | "en";
}) {
  if (locale !== "ar") {
    const copiedLabel = copiedCount === 1 ? "Keeta ID" : "Keeta IDs";

    if (missingCount === 0) {
      return `Copied ${copiedCount} ${copiedLabel}.`;
    }

    const missingLabel = missingCount === 1 ? "driver is" : "drivers are";
    return `Copied ${copiedCount} ${copiedLabel}; ${missingCount} selected ${missingLabel} missing Keeta IDs.`;
  }

  const copiedLabel =
    copiedCount === 1
      ? "معرف كيتا"
      : copiedCount === 2
        ? "معرفي كيتا"
        : "معرفات كيتا";

  if (missingCount === 0) {
    return `تم نسخ ${copiedCount} ${copiedLabel}`;
  }

  const missingLabel =
    missingCount === 1
      ? "مندوب واحد بدون معرف كيتا"
      : missingCount === 2
        ? "مندوبان بدون معرف كيتا"
        : `${missingCount} مناديب بدون معرف كيتا`;

  return `تم نسخ ${copiedCount} ${copiedLabel} - ${missingLabel}`;
}
