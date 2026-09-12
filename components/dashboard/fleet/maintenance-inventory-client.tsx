"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import {
  archiveMaintenanceInventoryRecordAction,
  createMaintenanceInventoryRecordAction,
  updateMaintenanceInventoryRecordAction,
} from "@/features/maintenance-inventory/actions";
import { getMaintenanceInventoryLabels } from "@/features/maintenance-inventory/labels";
import type {
  MaintenanceInventoryActionState,
  MaintenanceInventoryJobOption,
  MaintenanceInventoryOrganizationOption,
  MaintenanceInventoryProviderOption,
  MaintenanceInventoryRecordType,
  MaintenanceInventoryRow,
} from "@/features/maintenance-inventory/types";
import type { Locale } from "@/types/locale";

type Labels = ReturnType<typeof getMaintenanceInventoryLabels>;

type MaintenanceInventoryClientProps = {
  locale: Locale;
  baseHref: string;
  rows: MaintenanceInventoryRow[];
  organizations: MaintenanceInventoryOrganizationOption[];
  providers: MaintenanceInventoryProviderOption[];
  jobs: MaintenanceInventoryJobOption[];
  summary: {
    totalRows: number;
    oilRows: number;
    sparePartRows: number;
    materialRows: number;
    returnedRows: number;
  };
  page: number;
  totalPages: number;
  selectedCategory: "all" | "oil" | "spare_part" | "material" | "returns";
  selectedRecordType: "all" | MaintenanceInventoryRecordType;
  filters: {
    organizationId?: string;
    providerId?: string;
    recordType?: string;
    search?: string;
  };
};

const idleState: MaintenanceInventoryActionState = { status: "idle" };

export function MaintenanceInventoryClient({
  locale,
  baseHref,
  rows,
  organizations,
  providers,
  jobs,
  summary,
  page,
  totalPages,
  selectedCategory,
  selectedRecordType,
  filters,
}: MaintenanceInventoryClientProps) {
  const labels = getMaintenanceInventoryLabels(locale);
  const [editingRecord, setEditingRecord] = useState<MaintenanceInventoryRow | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const canCreate = organizations.some((organization) => organization.canManage);

  return (
    <div className="space-y-6 px-5 py-6 sm:px-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { key: "all", label: labels.tabs.all, value: summary.totalRows },
          { key: "oil", label: labels.tabs.oil, value: summary.oilRows },
          { key: "spare_part", label: labels.tabs.sparePart, value: summary.sparePartRows },
          { key: "material", label: labels.tabs.material, value: summary.materialRows },
          { key: "returns", label: labels.tabs.returns, value: summary.returnedRows },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={buildHref(baseHref, { ...filters, category: tab.key, page: undefined })}
            className={`border border-border bg-surface p-4 transition hover:border-primary/40 ${
              selectedCategory === tab.key ? "border-primary/50" : ""
            }`}
          >
            <div className="text-sm font-bold text-muted">{tab.label}</div>
            <div className="mt-2 text-2xl font-bold text-navy">
              {tab.value.toLocaleString(locale)}
            </div>
          </Link>
        ))}
      </div>

      <form className="grid gap-3 border border-border bg-surface p-4 lg:grid-cols-[1fr_200px_200px_180px_auto]">
        <input type="hidden" name="category" value={selectedCategory} />
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.search}</span>
          <input
            name="search"
            defaultValue={filters.search ?? ""}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.organization}</span>
          <select
            name="organizationId"
            defaultValue={filters.organizationId ?? ""}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="">{labels.all}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.provider}</span>
          <select
            name="providerId"
            defaultValue={filters.providerId ?? ""}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="">{labels.all}</option>
            {providers.map((provider) => (
              <option key={`${provider.organizationId}:${provider.id}`} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.recordType}</span>
          <select
            name="recordType"
            defaultValue={selectedRecordType}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="all">{labels.all}</option>
            <option value="leftover">{labels.recordTypes.leftover}</option>
            <option value="returned">{labels.recordTypes.returned}</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-white"
          >
            {labels.apply}
          </button>
          <Link
            href={baseHref}
            className="grid min-h-11 place-items-center rounded-xl border border-border px-4 text-sm font-bold text-navy"
          >
            {labels.reset}
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy">{labels.tableTitle}</h2>
          <p className="mt-1 text-sm text-muted">{labels.resultCount(rows.length, summary.totalRows)}</p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
          >
            {labels.addRecord}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-border bg-surface p-8 text-center text-sm font-bold text-muted">
          {labels.empty}
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="min-w-[1200px] table-fixed border-collapse text-start">
            <thead className="bg-background text-xs font-bold uppercase text-muted">
              <tr>
                <Header className="w-56">{labels.item}</Header>
                <Header className="w-36">{labels.category}</Header>
                <Header className="w-32">{labels.recordType}</Header>
                <Header className="w-28">{labels.quantity}</Header>
                <Header className="w-28">{labels.unit}</Header>
                <Header className="w-48">{labels.organization}</Header>
                <Header className="w-56">{labels.provider}</Header>
                <Header className="w-60">{labels.job}</Header>
                <Header className="w-44">{labels.createdAt}</Header>
                <Header className="w-40">{labels.actions}</Header>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const canManage = organizations.some(
                  (organization) =>
                    organization.id === row.organizationId && organization.canManage,
                );

                return (
                  <tr key={row.id}>
                    <Cell strong>{row.itemName}</Cell>
                    <Cell>{labels.categories[row.category]}</Cell>
                    <Cell>{labels.recordTypes[row.recordType]}</Cell>
                    <Cell>{formatQuantity(row.quantity, locale)}</Cell>
                    <Cell>{labels.units[row.unit]}</Cell>
                    <Cell>{row.organizationName ?? labels.notAvailable}</Cell>
                    <Cell>{formatProvider(row, labels)}</Cell>
                    <Cell>{row.jobLabel ?? labels.notLinked}</Cell>
                    <Cell>{formatDateTime(row.createdAt, locale)}</Cell>
                    <Cell>
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingRecord(row)}
                            className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-navy hover:bg-primary-soft"
                          >
                            {labels.edit}
                          </button>
                          <ArchiveRecordForm
                            locale={locale}
                            recordId={row.id}
                            labels={labels}
                          />
                        </div>
                      ) : (
                        labels.notAvailable
                      )}
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex justify-end gap-2">
          {page > 1 ? (
            <Link
              href={buildHref(baseHref, { ...filters, category: selectedCategory, recordType: selectedRecordType, page: String(page - 1) })}
              className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-navy"
            >
              {labels.previous}
            </Link>
          ) : null}
          <span className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-muted">
            {labels.page(page, totalPages)}
          </span>
          {page < totalPages ? (
            <Link
              href={buildHref(baseHref, { ...filters, category: selectedCategory, recordType: selectedRecordType, page: String(page + 1) })}
              className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-navy"
            >
              {labels.next}
            </Link>
          ) : null}
        </div>
      ) : null}

      {isCreateOpen ? (
        <InventoryRecordDialog
          locale={locale}
          labels={labels}
          organizations={organizations.filter((organization) => organization.canManage)}
          providers={providers}
          jobs={jobs}
          mode="create"
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
      {editingRecord ? (
        <InventoryRecordDialog
          locale={locale}
          labels={labels}
          organizations={organizations.filter((organization) => organization.canManage)}
          providers={providers}
          jobs={jobs}
          mode="edit"
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
        />
      ) : null}
    </div>
  );
}

function InventoryRecordDialog({
  locale,
  labels,
  organizations,
  providers,
  jobs,
  mode,
  record,
  onClose,
}: {
  locale: Locale;
  labels: Labels;
  organizations: MaintenanceInventoryOrganizationOption[];
  providers: MaintenanceInventoryProviderOption[];
  jobs: MaintenanceInventoryJobOption[];
  mode: "create" | "edit";
  record?: MaintenanceInventoryRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const action =
    mode === "create"
      ? createMaintenanceInventoryRecordAction
      : updateMaintenanceInventoryRecordAction;
  const [state, formAction] = useActionState(action, idleState);
  const [organizationId, setOrganizationId] = useState(
    record?.organizationId ?? organizations[0]?.id ?? "",
  );
  const [providerId, setProviderId] = useState(record?.providerId ?? "");

  const organizationProviders = useMemo(
    () => providers.filter((provider) => provider.organizationId === organizationId),
    [organizationId, providers],
  );
  const providerJobs = useMemo(
    () =>
      jobs.filter(
        (job) => job.organizationId === organizationId && job.providerId === providerId,
      ),
    [jobs, organizationId, providerId],
  );

  useEffect(() => {
    if (providerId && organizationProviders.some((provider) => provider.id === providerId)) {
      return;
    }

    setProviderId(organizationProviders[0]?.id ?? "");
  }, [organizationProviders, providerId]);

  useEffect(() => {
    if (state.status !== "success") return;

    onClose();
    router.refresh();
  }, [onClose, router, state.status]);

  return (
    <div className="fixed inset-0 z-80 grid place-items-center bg-navy/45 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-navy">
              {mode === "create" ? labels.createTitle : labels.editTitle}
            </h3>
            <p className="mt-1 text-sm text-muted">{labels.dialogDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-navy"
          >
            {labels.close}
          </button>
        </div>

        {state.status === "error" || state.status === "validation_error" ? (
          <div className="mb-4 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
            {labels.error}
          </div>
        ) : null}

        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="locale" value={locale} />
          {record ? <input type="hidden" name="recordId" value={record.id} /> : null}

          <label className="space-y-1">
            <span className="text-xs font-bold text-muted">{labels.organization}</span>
            <select
              name="organizationId"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-muted">{labels.provider}</span>
            <select
              name="providerId"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            >
              {organizationProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-bold text-muted">{labels.item}</span>
            <input
              name="itemName"
              defaultValue={record?.itemName ?? ""}
              maxLength={160}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-muted">{labels.category}</span>
            <select
              name="category"
              defaultValue={record?.category ?? "material"}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            >
              <option value="oil">{labels.categories.oil}</option>
              <option value="spare_part">{labels.categories.spare_part}</option>
              <option value="material">{labels.categories.material}</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-muted">{labels.recordType}</span>
            <select
              name="recordType"
              defaultValue={record?.recordType ?? "leftover"}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            >
              <option value="leftover">{labels.recordTypes.leftover}</option>
              <option value="returned">{labels.recordTypes.returned}</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-muted">{labels.quantity}</span>
            <input
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              defaultValue={record?.quantity ?? ""}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-muted">{labels.unit}</span>
            <select
              name="unit"
              defaultValue={record?.unit ?? "piece"}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
              required
            >
              <option value="liter">{labels.units.liter}</option>
              <option value="piece">{labels.units.piece}</option>
              <option value="set">{labels.units.set}</option>
              <option value="kg">{labels.units.kg}</option>
              <option value="meter">{labels.units.meter}</option>
              <option value="other">{labels.units.other}</option>
            </select>
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-bold text-muted">{labels.job}</span>
            <select
              name="maintenanceJobId"
              defaultValue={record?.maintenanceJobId ?? ""}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            >
              <option value="">{labels.notLinked}</option>
              {providerJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.label || job.id}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-bold text-muted">{labels.note}</span>
            <textarea
              name="note"
              defaultValue={record?.note ?? ""}
              rows={3}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-navy"
            />
          </label>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-navy"
            >
              {labels.cancel}
            </button>
            <SubmitButton label={labels.save} pendingLabel={labels.saving} />
          </div>
        </form>
      </div>
    </div>
  );
}

function ArchiveRecordForm({
  locale,
  recordId,
  labels,
}: {
  locale: Locale;
  recordId: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    archiveMaintenanceInventoryRecordAction,
    idleState,
  );

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(labels.archiveConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="recordId" value={recordId} />
      <SubmitButton
        label={labels.archive}
        pendingLabel={labels.saving}
        variant="danger"
      />
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "danger"
      ? "rounded-xl border border-danger/30 px-3 py-2 text-xs font-bold text-danger disabled:opacity-60"
      : "rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60";

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
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
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td className={`px-4 py-3 text-sm ${strong ? "font-bold text-navy" : "text-muted"}`}>
      {children}
    </td>
  );
}

function buildHref(baseHref: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (!value || value === "all") continue;
    params.set(key, value);
  }

  const search = params.toString();
  return `${baseHref}${search ? `?${search}` : ""}`;
}

function formatProvider(row: MaintenanceInventoryRow, labels: Labels) {
  return (
    [row.providerName, row.providerCode ? `(${row.providerCode})` : null]
      .filter(Boolean)
      .join(" ") || labels.notAvailable
  );
}

function formatQuantity(value: number, locale: Locale) {
  return value.toLocaleString(locale, { maximumFractionDigits: 3 });
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}
