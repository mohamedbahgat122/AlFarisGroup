"use client";

import { useActionState, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  archiveShiftTemplateAction,
  replaceShiftAssignmentsAction,
  saveShiftTemplateAction,
} from "@/features/shifts/actions";
import { validateShiftTimes } from "@/features/shifts/time";
import type {
  ShiftActionResult,
  ShiftDriverOption,
  ShiftManagementDictionary,
  ShiftTemplateRow,
} from "@/features/shifts/types";
import type { ShiftManagementPermissions } from "@/features/shifts/queries";

type ShiftManagementClientProps = {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shifts: ShiftTemplateRow[];
  drivers: ShiftDriverOption[];
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
  permissions,
}: ShiftManagementClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingShift, setEditingShift] = useState<ShiftTemplateRow | null>(null);
  const [assigningShift, setAssigningShift] = useState<ShiftTemplateRow | null>(null);
  const [creating, setCreating] = useState(false);

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
      <div className="border-b border-border bg-surface px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy">{dictionary.title}</h1>
            <p className="mt-2 text-sm font-medium text-muted">
              {dictionary.description}
            </p>
          </div>
          {permissions.create ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90"
            >
              {dictionary.addShift}
            </button>
          ) : null}
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

        {filteredShifts.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center shadow-sm">
            <h2 className="text-lg font-bold text-navy">{dictionary.emptyTitle}</h2>
            <p className="mt-2 text-sm font-semibold text-muted">
              {dictionary.emptyMessage}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredShifts.map((shift) => (
              <ShiftCard
                key={shift.id}
                locale={locale}
                organizationCode={organizationCode}
                dictionary={dictionary}
                shift={shift}
                permissions={permissions}
                onEdit={() => setEditingShift(shift)}
                onAssign={() => setAssigningShift(shift)}
              />
            ))}
          </div>
        )}
      </div>

      {creating ? (
        <ShiftFormDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={null}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {editingShift ? (
        <ShiftFormDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={editingShift}
          onClose={() => setEditingShift(null)}
        />
      ) : null}

      {assigningShift ? (
        <AssignmentDialog
          locale={locale}
          organizationCode={organizationCode}
          dictionary={dictionary}
          shift={assigningShift}
          drivers={drivers}
          onClose={() => setAssigningShift(null)}
        />
      ) : null}
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
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  permissions: ShiftManagementPermissions;
  onEdit: () => void;
  onAssign: () => void;
}) {
  const [archiveState, archiveAction] = useActionState(
    archiveShiftTemplateAction,
    idleState,
  );
  const [statusState, statusAction] = useActionState(
    saveShiftTemplateAction,
    idleState,
  );

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
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow | null;
  onClose: () => void;
}) {
  const [state, action] = useActionState(saveShiftTemplateAction, idleState);
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

  return (
    <Dialog title={shift ? dictionary.editShift : dictionary.addShift} onClose={onClose}>
      <form action={action} className="space-y-4">
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
  drivers,
  onClose,
}: {
  locale: "ar" | "en";
  organizationCode: string;
  dictionary: ShiftManagementDictionary;
  shift: ShiftTemplateRow;
  drivers: ShiftDriverOption[];
  onClose: () => void;
}) {
  const [state, action] = useActionState(replaceShiftAssignmentsAction, idleState);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filteredDrivers = drivers.filter((driver) => {
    const normalized = query.trim().toLocaleLowerCase();
    const matchesQuery =
      !normalized ||
      driver.fullName.toLocaleLowerCase().includes(normalized) ||
      (driver.identifier ?? "").toLocaleLowerCase().includes(normalized);
    const isAssigned = driver.currentShiftId === shift.id;
    const matchesFilter =
      filter === "all" ||
      (filter === "assigned" && isAssigned) ||
      (filter === "unassigned" && !driver.currentShiftId);

    return matchesQuery && matchesFilter;
  });

  return (
    <Dialog title={`${dictionary.manageDrivers}: ${shift.name}`} onClose={onClose}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="shiftId" value={shift.id} />

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

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pe-1">
          {filteredDrivers.length === 0 ? (
            <p className="rounded-lg bg-background p-4 text-sm font-semibold text-muted">
              {dictionary.noDrivers}
            </p>
          ) : (
            filteredDrivers.map((driver) => (
              <label
                key={driver.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
              >
                <input
                  type="checkbox"
                  name="driverIds"
                  value={driver.id}
                  defaultChecked={driver.currentShiftId === shift.id}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">
                    {driver.fullName}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-muted">
                    {dictionary.driverIdentifier}: {driver.identifier ?? "-"}
                    {driver.currentShiftName ? ` - ${dictionary.currentShift}: ${driver.currentShiftName}` : ""}
                    {driver.vehicleLabel ? ` - ${dictionary.vehicle}: ${driver.vehicleLabel}` : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        <ActionMessage state={state} />

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClasses}>
            {dictionary.close}
          </button>
          <SubmitButton label={dictionary.saveAssignments} pendingLabel={dictionary.saving} />
        </div>
      </form>
    </Dialog>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4">
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
}: {
  label: string;
  pendingLabel: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        danger
          ? "inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      }
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
