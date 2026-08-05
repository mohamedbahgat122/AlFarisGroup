"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  issueDriverWarningAction,
  revokeDriverWarningAction,
} from "@/features/driver-warnings/actions";
import type {
  DriverWarningCategory,
  DriverWarningDriverOption,
  DriverWarningRow,
  DriverWarningSeverity,
  DriverWarningStatus,
  DriverWarningsDictionary,
} from "@/features/driver-warnings/types";
import type { Locale } from "@/types/locale";

type DriverWarningsPageClientProps = {
  locale: Locale;
  organization: {
    id: string;
    code: string;
    name: string;
  };
  dictionary: DriverWarningsDictionary;
  warnings: DriverWarningRow[];
  drivers: DriverWarningDriverOption[];
  filters: {
    status: DriverWarningStatus | "";
    severity: DriverWarningSeverity | "";
    driverId: string;
  };
  summary: {
    active: number;
    unseen: number;
    high: number;
    revoked: number;
  };
  canIssue: boolean;
  canRevoke: boolean;
};

const warningCategories: DriverWarningCategory[] = [
  "attendance",
  "behavior",
  "compliance",
  "documentation",
  "performance",
  "safety",
  "vehicle_care",
  "other",
];

const warningSeverities: DriverWarningSeverity[] = ["low", "medium", "high"];
const warningStatuses: DriverWarningStatus[] = ["active", "revoked"];

export function DriverWarningsPageClient({
  locale,
  organization,
  dictionary,
  warnings,
  drivers,
  filters,
  summary,
  canIssue,
  canRevoke,
}: DriverWarningsPageClientProps) {
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedWarning, setSelectedWarning] = useState<DriverWarningRow | null>(null);
  const resetHref = `/${locale}/dashboard/organizations/${organization.code}/driver-warnings`;
  const hasFilters = Boolean(filters.status || filters.severity || filters.driverId);

  return (
    <div className="flex w-full max-w-none flex-col gap-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-sm font-bold text-primary">{organization.name}</p>
          <h1 className="mt-1 text-2xl font-black text-navy md:text-3xl">
            {dictionary.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {dictionary.description}
          </p>
        </div>
        {canIssue ? (
          <button
            type="button"
            className="inline-flex h-10 w-auto shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-[0_10px_22px_rgba(11,108,251,0.18)] transition hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={() => setIssueOpen(true)}
          >
            <PlusIcon />
            {dictionary.issue.title}
          </button>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={dictionary.summary.active} value={summary.active} icon={<StatusIcon />} />
        <SummaryCard label={dictionary.summary.unseen} value={summary.unseen} icon={<EyeOffIcon />} />
        <SummaryCard label={dictionary.summary.high} value={summary.high} icon={<SeverityIcon />} />
        <SummaryCard label={dictionary.summary.revoked} value={summary.revoked} icon={<ArchiveIcon />} />
      </section>

      <FilterToolbar
        dictionary={dictionary}
        drivers={drivers}
        filters={filters}
        resetHref={resetHref}
      />

      <WarningsList
        locale={locale}
        dictionary={dictionary}
        warnings={warnings}
        hasFilters={hasFilters}
        onSelect={setSelectedWarning}
      />

      {issueOpen ? (
        <IssueWarningDialog
          locale={locale}
          organization={organization}
          dictionary={dictionary}
          drivers={drivers}
          onClose={() => setIssueOpen(false)}
        />
      ) : null}

      {selectedWarning ? (
        <WarningDetailsDialog
          locale={locale}
          organizationCode={organization.code}
          dictionary={dictionary}
          warning={selectedWarning}
          canRevoke={canRevoke}
          onClose={() => setSelectedWarning(null)}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-h-28 items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4 shadow-[0_12px_28px_rgba(16,35,63,0.05)]">
      <div>
        <p className="text-sm font-bold text-muted">{label}</p>
        <p className="mt-2 text-3xl font-black text-navy">{value}</p>
      </div>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        {icon}
      </div>
    </div>
  );
}

function FilterToolbar({
  dictionary,
  drivers,
  filters,
  resetHref,
}: {
  dictionary: DriverWarningsDictionary;
  drivers: DriverWarningDriverOption[];
  filters: DriverWarningsPageClientProps["filters"];
  resetHref: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-[0_12px_28px_rgba(16,35,63,0.05)]">
      <form className="flex flex-wrap items-end gap-3">
        <FilterSelect
          name="status"
          label={dictionary.filters.status}
          value={filters.status}
          allLabel={dictionary.filters.all}
          entries={warningStatuses.map((status) => ({
            value: status,
            label: dictionary.statuses[status],
          }))}
        />
        <FilterSelect
          name="severity"
          label={dictionary.filters.severity}
          value={filters.severity}
          allLabel={dictionary.filters.all}
          entries={warningSeverities.map((severity) => ({
            value: severity,
            label: dictionary.severities[severity],
          }))}
        />
        <FilterSelect
          name="driverId"
          label={dictionary.filters.driver}
          value={filters.driverId}
          allLabel={dictionary.filters.all}
          entries={drivers.map((driver) => ({
            value: driver.id,
            label: driver.identifier
              ? `${driver.fullName} - ${driver.identifier}`
              : driver.fullName,
          }))}
          className="min-w-64 flex-1"
        />
        <button className="inline-flex h-10 w-auto items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90">
          {dictionary.filters.apply}
        </button>
        <Link
          href={resetHref}
          className="inline-flex h-10 w-auto items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-muted transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
        >
          {dictionary.filters.reset}
        </Link>
      </form>
    </section>
  );
}

function FilterSelect({
  name,
  label,
  value,
  allLabel,
  entries,
  className = "min-w-44",
}: {
  name: string;
  label: string;
  value: string;
  allLabel: string;
  entries: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="text-xs font-bold text-muted">{label}</span>
      <select name={name} defaultValue={value} className={inputClassName}>
        <option value="">{allLabel}</option>
        {entries.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function WarningsList({
  locale,
  dictionary,
  warnings,
  hasFilters,
  onSelect,
}: {
  locale: Locale;
  dictionary: DriverWarningsDictionary;
  warnings: DriverWarningRow[];
  hasFilters: boolean;
  onSelect: (warning: DriverWarningRow) => void;
}) {
  if (warnings.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface px-5 py-12 text-center shadow-[0_12px_28px_rgba(16,35,63,0.05)]">
        <h2 className="text-base font-bold text-navy">
          {hasFilters ? dictionary.emptyFilteredTitle : dictionary.emptyTitle}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {hasFilters ? dictionary.emptyFilteredDescription : dictionary.emptyDescription}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_12px_28px_rgba(16,35,63,0.05)]">
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full table-fixed divide-y divide-border text-sm">
          <thead className="bg-primary-soft/45 text-xs uppercase text-muted">
            <tr>
              <TableHeader className="w-[17%]">{dictionary.table.driver}</TableHeader>
              <TableHeader className="w-[20%]">{dictionary.table.warning}</TableHeader>
              <TableHeader className="w-[11%]">{dictionary.table.category}</TableHeader>
              <TableHeader className="w-[11%]">{dictionary.table.severity}</TableHeader>
              <TableHeader className="w-[10%]">{dictionary.table.status}</TableHeader>
              <TableHeader className="w-[11%]">{dictionary.table.incidentAt}</TableHeader>
              <TableHeader className="w-[11%]">{dictionary.table.issuedAt}</TableHeader>
              <TableHeader className="w-[11%]">{dictionary.table.seen}</TableHeader>
              <TableHeader className="w-[8%]">{dictionary.table.actions}</TableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {warnings.map((warning) => (
              <tr key={warning.id} className="align-middle transition hover:bg-primary-soft/25">
                <td className="px-4 py-4">
                  <DriverCell warning={warning} />
                </td>
                <td className="px-4 py-4">
                  <p className="line-clamp-2 font-bold text-navy">{warning.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                    {warning.description}
                  </p>
                </td>
                <td className="px-4 py-4 text-muted">{dictionary.categories[warning.category]}</td>
                <td className="px-4 py-4">
                  <Badge tone={warning.severity}>{dictionary.severities[warning.severity]}</Badge>
                </td>
                <td className="px-4 py-4">
                  <Badge tone={warning.status}>{dictionary.statuses[warning.status]}</Badge>
                </td>
                <td className="px-4 py-4 text-muted">
                  {formatDate(warning.incidentAt, locale, dictionary.notAvailable)}
                </td>
                <td className="px-4 py-4 text-muted">
                  {formatDate(warning.issuedAt, locale, dictionary.notAvailable)}
                </td>
                <td className="px-4 py-4 text-muted">
                  {warning.driverSeenAt ? dictionary.seen : dictionary.notSeen}
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    aria-label={dictionary.details.open}
                    title={dictionary.details.open}
                    onClick={() => onSelect(warning)}
                    className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-primary transition hover:border-primary/40 hover:bg-primary-soft"
                  >
                    <EyeIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-3 lg:hidden">
        {warnings.map((warning) => (
          <article key={warning.id} className="rounded-lg border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <DriverCell warning={warning} />
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Badge tone={warning.severity}>{dictionary.severities[warning.severity]}</Badge>
                <Badge tone={warning.status}>{dictionary.statuses[warning.status]}</Badge>
              </div>
            </div>
            <h2 className="mt-4 text-base font-bold text-navy">{warning.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
              {warning.description}
            </p>
            <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
              <MetaLine label={dictionary.table.category} value={dictionary.categories[warning.category]} />
              <MetaLine
                label={dictionary.table.incidentAt}
                value={formatDate(warning.incidentAt, locale, dictionary.notAvailable)}
              />
              <MetaLine
                label={dictionary.table.issuedAt}
                value={formatDate(warning.issuedAt, locale, dictionary.notAvailable)}
              />
              <MetaLine
                label={dictionary.table.seen}
                value={warning.driverSeenAt ? dictionary.seen : dictionary.notSeen}
              />
            </div>
            <button
              type="button"
              onClick={() => onSelect(warning)}
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-bold text-primary transition hover:bg-primary-soft"
            >
              <EyeIcon />
              {dictionary.details.open}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function IssueWarningDialog({
  locale,
  organization,
  dictionary,
  drivers,
  onClose,
}: {
  locale: Locale;
  organization: DriverWarningsPageClientProps["organization"];
  dictionary: DriverWarningsDictionary;
  drivers: DriverWarningDriverOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(dialogRef, onClose);

  async function formAction(formData: FormData) {
    await issueDriverWarningAction(formData);
    onClose();
    router.refresh();
  }

  return (
    <ModalFrame
      title={dictionary.issue.title}
      description={dictionary.description}
          closeLabel={dictionary.close}
          onClose={onClose}
          dialogRef={dialogRef}
          maxWidthClassName="sm:max-w-[760px]"
        >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationId" value={organization.id} />
        <input type="hidden" name="organizationCode" value={organization.code} />
        <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <label>
            <span className="text-xs font-bold text-muted">{dictionary.issue.driver}</span>
            <select name="driverId" required className={inputClassName}>
              <option value="">{dictionary.issue.selectDriver}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.identifier
                    ? `${driver.fullName} - ${driver.identifier}`
                    : driver.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-bold text-muted">{dictionary.issue.category}</span>
            <select name="category" required className={inputClassName}>
              {warningCategories.map((category) => (
                <option key={category} value={category}>
                  {dictionary.categories[category]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-bold text-muted">{dictionary.issue.severity}</span>
            <select name="severity" required className={inputClassName}>
              {warningSeverities.map((severity) => (
                <option key={severity} value={severity}>
                  {dictionary.severities[severity]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-bold text-muted">{dictionary.issue.incidentAt}</span>
            <input name="incidentAt" type="datetime-local" required className={inputClassName} />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-bold text-muted">{dictionary.issue.warningTitle}</span>
            <input name="title" required maxLength={180} className={inputClassName} />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs font-bold text-muted">{dictionary.issue.description}</span>
            <textarea name="description" required rows={4} className={`${inputClassName} min-h-28 resize-y`} />
          </label>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-bold text-muted transition hover:bg-primary-soft hover:text-primary sm:w-auto"
          >
            {dictionary.cancel}
          </button>
          <SubmitButton label={dictionary.issue.submit} />
        </div>
      </form>
    </ModalFrame>
  );
}

function WarningDetailsDialog({
  locale,
  organizationCode,
  dictionary,
  warning,
  canRevoke,
  onClose,
}: {
  locale: Locale;
  organizationCode: string;
  dictionary: DriverWarningsDictionary;
  warning: DriverWarningRow;
  canRevoke: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(dialogRef, onClose);

  async function formAction(formData: FormData) {
    await revokeDriverWarningAction(formData);
    onClose();
    router.refresh();
  }

  return (
    <ModalFrame
      title={warning.title}
      description={dictionary.details.title}
      closeLabel={dictionary.close}
      onClose={onClose}
      dialogRef={dialogRef}
      maxWidthClassName="sm:max-w-[800px]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="space-y-4">
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-primary-soft/25 p-4 sm:flex-row sm:items-center sm:justify-between">
          <DriverCell warning={warning} />
          <div className="flex flex-wrap gap-2">
            <Badge tone={warning.status}>{dictionary.statuses[warning.status]}</Badge>
            <Badge tone={warning.severity}>{dictionary.severities[warning.severity]}</Badge>
          </div>
        </section>
        <div className="grid gap-3 md:grid-cols-2">
          <DetailItem label={dictionary.table.category} value={dictionary.categories[warning.category]} />
          <DetailItem label={dictionary.table.severity} value={dictionary.severities[warning.severity]} />
          <DetailItem label={dictionary.table.status} value={dictionary.statuses[warning.status]} />
          <DetailItem
            label={dictionary.table.seen}
            value={
              warning.driverSeenAt
                ? `${dictionary.seen} - ${formatDate(warning.driverSeenAt, locale, dictionary.notAvailable)}`
                : dictionary.notSeen
            }
          />
          <DetailItem
            label={dictionary.table.incidentAt}
            value={formatDate(warning.incidentAt, locale, dictionary.notAvailable)}
          />
          <DetailItem
            label={dictionary.table.issuedAt}
            value={formatDate(warning.issuedAt, locale, dictionary.notAvailable)}
          />
          <DetailItem label={dictionary.issuedBy} value={warning.issuedByName ?? dictionary.notAvailable} />
          {warning.revokedByName ? (
            <DetailItem label={dictionary.details.revokedBy} value={warning.revokedByName} />
          ) : null}
        </div>
        <DetailItem label={dictionary.issue.warningTitle} value={warning.title} />
        <DetailItem label={dictionary.issue.description} value={warning.description} multiline />
        {warning.revokeReason ? (
          <DetailItem label={dictionary.revoke.reason} value={warning.revokeReason} multiline />
        ) : null}

        {canRevoke && warning.status === "active" ? (
          <form action={formAction} className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="organizationCode" value={organizationCode} />
            <input type="hidden" name="warningId" value={warning.id} />
            <div>
              <h3 className="text-sm font-bold text-danger">{dictionary.revoke.submit}</h3>
              <p className="mt-1 text-sm leading-6 text-navy">
                {dictionary.details.revokeHelper}
              </p>
            </div>
            <label>
              <span className="text-xs font-bold text-danger">{dictionary.revoke.reason}</span>
              <textarea
                name="revokeReason"
                required
                maxLength={500}
                placeholder={dictionary.revoke.placeholder}
                rows={3}
                className={`${inputClassName} min-h-20 resize-y`}
              />
            </label>
            <SubmitButton
              label={dictionary.revoke.submit}
              className="border-danger bg-white text-danger hover:bg-danger/10"
            />
          </form>
        ) : null}
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  description,
  closeLabel,
  onClose,
  dialogRef,
  maxWidthClassName,
  children,
}: {
  title: string;
  description: string;
  closeLabel: string;
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
  maxWidthClassName: string;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-2 sm:p-4 md:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-warning-dialog-title"
        className={`flex max-h-[90vh] w-[calc(100vw-20px)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_24px_80px_rgba(16,35,63,0.22)] sm:max-h-[85vh] sm:w-[calc(100vw-32px)] ${maxWidthClassName}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4">
          <div>
            <h2 id="driver-warning-dialog-title" className="text-xl font-bold text-navy">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SubmitButton({ label, className = "" }: { label: string; className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-10 w-full items-center justify-center rounded-lg border border-primary bg-primary px-4 text-sm font-bold text-white shadow-[0_10px_22px_rgba(11,108,251,0.16)] transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70 sm:w-auto ${className}`}
    >
      {pending ? "..." : label}
    </button>
  );
}

function DriverCell({ warning }: { warning: DriverWarningRow }) {
  return (
    <div>
      <p className="font-bold text-navy">{warning.driverName}</p>
      <p className="mt-1 text-xs text-muted">
        {warning.driverIdentifier ?? warning.driverMobileNumber}
      </p>
    </div>
  );
}

function DetailItem({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <p className="text-xs font-bold text-slate-600">{label}</p>
      <p className={`mt-1 text-sm font-semibold leading-6 text-navy ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-bold text-navy">{label}: </span>
      {value}
    </p>
  );
}

function TableHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-start font-bold ${className}`}>{children}</th>;
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: DriverWarningSeverity | DriverWarningStatus;
}) {
  const className =
    tone === "high"
      ? "bg-danger/10 text-danger"
      : tone === "medium"
        ? "bg-amber-100 text-amber-800"
        : tone === "revoked"
          ? "bg-muted/10 text-muted"
          : "bg-primary-soft text-primary";

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

function useModalFocus(dialogRef: RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const firstField = dialogRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button",
    );
    firstField?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialogRef, onClose]);
}

function formatDate(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m4 4 16 16M9.5 5.6A10.5 10.5 0 0 1 12 5c6.1 0 9.5 7 9.5 7a18.3 18.3 0 0 1-3 4.1M6.8 6.8C3.9 8.7 2.5 12 2.5 12s3.4 7 9.5 7a9.8 9.8 0 0 0 4-.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M9 12.5 11 15l4.5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SeverityIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M12 8v5M12 17h.01M10.3 4.7 2.8 18a1.6 1.6 0 0 0 1.4 2.4h15.6a1.6 1.6 0 0 0 1.4-2.4L13.7 4.7a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M4 7h16M6 7v12h12V7M9 11h6M7 4h10l1 3H6l1-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const inputClassName =
  "mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy outline-none transition focus:border-primary";
