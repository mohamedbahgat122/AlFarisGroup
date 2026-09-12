"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal, useFormStatus } from "react-dom";
import {
  allocateMaintenanceStockToOrganizationAction,
  archiveMaintenanceStockItemAction,
  createMaintenanceStockItemAction,
  createMaintenanceStockMovementAction,
  releaseMaintenanceStockFromOrganizationAction,
  updateMaintenanceStockItemAction,
} from "@/features/maintenance-stock/actions";
import { getMaintenanceStockLabels } from "@/features/maintenance-stock/labels";
import type {
  AdminMaintenanceStockMovementType,
  MaintenanceStockActionState,
  MaintenanceStockAllocation,
  MaintenanceStockAllocationMovement,
  MaintenanceStockAllocationMovementType,
  MaintenanceStockAllocationOrganizationOption,
  MaintenanceStockCategory,
  MaintenanceStockMovement,
  MaintenanceStockOrganizationOption,
  MaintenanceStockProviderOption,
  MaintenanceStockRow,
  MaintenanceStockUnit,
} from "@/features/maintenance-stock/types";
import type { Locale } from "@/types/locale";

type Labels = ReturnType<typeof getMaintenanceStockLabels>;

type MaintenanceStockClientProps = {
  locale: Locale;
  baseHref: string;
  rows: MaintenanceStockRow[];
  movements: MaintenanceStockMovement[];
  allocations: MaintenanceStockAllocation[];
  allocationMovements: MaintenanceStockAllocationMovement[];
  allocationOrganizationOptions: MaintenanceStockAllocationOrganizationOption[];
  organizations: MaintenanceStockOrganizationOption[];
  providers: MaintenanceStockProviderOption[];
  summary: {
    totalItems: number;
    physicalQuantity: number;
    allocatedQuantity: number;
    unallocatedQuantity: number;
    lowOrOutItems: number;
    archivedItems: number;
  };
  page: number;
  totalRows: number;
  totalPages: number;
  selectedCategory: "all" | MaintenanceStockCategory;
  selectedStatus: "active" | "archived" | "low_stock" | "out_of_stock";
  filters: {
    category?: string;
    organizationId?: string;
    providerId?: string;
    search?: string;
    status?: string;
  };
};

const idleState: MaintenanceStockActionState = { status: "idle" };
const stockMovementSubmissionKey = "maintenance-stock:movement:submission-id";
const allocationSubmissionKey = "maintenance-stock:allocation:submission-id";
const releaseSubmissionKey = "maintenance-stock:release:submission-id";
const submissionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function MaintenanceStockClient({
  locale,
  baseHref,
  rows,
  movements,
  allocations,
  allocationMovements,
  allocationOrganizationOptions,
  organizations,
  providers,
  summary,
  page,
  totalRows,
  totalPages,
  selectedCategory,
  selectedStatus,
  filters,
}: MaintenanceStockClientProps) {
  const labels = getMaintenanceStockLabels(locale);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaintenanceStockRow | null>(null);
  const [movementItem, setMovementItem] = useState<MaintenanceStockRow | null | "select">(null);
  const [allocationItem, setAllocationItem] = useState<MaintenanceStockRow | null>(null);
  const [historyItem, setHistoryItem] = useState<MaintenanceStockRow | null>(null);
  const [openActionsRowId, setOpenActionsRowId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const canCreate = organizations.some((organization) => organization.canManage);

  const showSuccessToast = useCallback(() => {
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2800);
  }, []);

  useEffect(() => {
    if (!openActionsRowId) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-stock-action-menu]")) return;
      setOpenActionsRowId(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActionsRowId(null);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionsRowId]);

  return (
    <div className="space-y-6 px-5 py-6 sm:px-7">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { key: "all", label: labels.tabs.all, value: summary.totalItems },
          { key: "physical", label: labels.physicalQuantity, value: summary.physicalQuantity },
          { key: "allocated", label: labels.allocatedQuantity, value: summary.allocatedQuantity },
          { key: "unallocated", label: labels.unallocatedQuantity, value: summary.unallocatedQuantity },
          { key: "low_stock", label: labels.tabs.lowOrOut, value: summary.lowOrOutItems },
          { key: "archived", label: labels.tabs.archived, value: summary.archivedItems },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={buildHref(baseHref, {
              ...filters,
              status: tab.key === "all" ? undefined : tab.key === "low_stock" ? "low_stock" : filters.status,
              page: undefined,
            })}
            className={`border border-border bg-surface p-4 transition hover:border-primary/40 ${
              (tab.key === "all" && !filters.status) || selectedStatus === tab.key
                ? "border-primary/50"
                : ""
            }`}
          >
            <div className="text-sm font-bold text-muted">{tab.label}</div>
            <div className="mt-2 text-2xl font-bold text-navy">
              {formatQuantity(tab.value, locale)}
            </div>
          </Link>
        ))}
      </div>

      <form className="grid gap-3 border border-border bg-surface p-4 xl:grid-cols-[1fr_190px_190px_160px_150px_auto]">
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
          <span className="text-xs font-bold text-muted">{labels.category}</span>
          <select
            name="category"
            defaultValue={selectedCategory}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="all">{labels.all}</option>
            {(["oil", "spare_part", "material"] as MaintenanceStockCategory[]).map(
              (category) => (
                <option key={category} value={category}>
                  {labels.categories[category]}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.status}</span>
          <select
            name="status"
            defaultValue={selectedStatus}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          >
            <option value="active">{labels.active}</option>
            <option value="low_stock">{labels.lowStock}</option>
            <option value="out_of_stock">{labels.outOfStock}</option>
            <option value="archived">{labels.archived}</option>
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
          <h2 className="text-lg font-bold text-navy">{labels.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {labels.resultCount(rows.length, totalRows)}
          </p>
        </div>
        {canCreate ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
            >
              {labels.createItem}
            </button>
            <button
              type="button"
              onClick={() => setMovementItem("select")}
              disabled={rows.length === 0}
              className="rounded-xl border border-primary/30 px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
            >
              {labels.addQuantity}
            </button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-border bg-surface p-8 text-center text-sm font-bold text-muted">
          {labels.empty}
        </div>
      ) : (
        <div className="w-full overflow-x-auto border border-border bg-surface">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-start">
            <thead className="bg-background text-xs font-bold uppercase text-muted">
              <tr>
                <Header className="w-[20%]">{labels.item}</Header>
                <Header className="w-[9%]">{labels.category}</Header>
                <Header className="w-[7%]">{labels.unit}</Header>
                <Header className="w-[15%]">{labels.provider}</Header>
                <Header className="w-[19%]">{labels.currentQuantity}</Header>
                <Header className="w-[9%]">{labels.minimumQuantity}</Header>
                <Header className="w-[11%]">{labels.lastMovement}</Header>
                <Header className="w-[10%]">{labels.actions}</Header>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <Cell strong>
                    <div>{row.itemName}</div>
                    {row.sku ? (
                      <div className="mt-1 text-xs font-bold text-muted">{row.sku}</div>
                    ) : null}
                  </Cell>
                  <Cell>{labels.categories[row.category]}</Cell>
                  <Cell>{labels.units[row.unit]}</Cell>
                  <Cell>
                    <ProviderCell row={row} labels={labels} />
                  </Cell>
                  <Cell>
                    <StockBalanceCell row={row} labels={labels} locale={locale} />
                  </Cell>
                  <Cell>
                    {row.minimumQuantity === null
                      ? labels.notAvailable
                      : `${formatQuantity(row.minimumQuantity, locale)} ${labels.units[row.unit]}`}
                  </Cell>
                  <Cell className="whitespace-nowrap">
                    {row.lastMovementAt ? formatDateTime(row.lastMovementAt, locale) : labels.notAvailable}
                  </Cell>
                  <Cell>
                    <StockRowActions
                      row={row}
                      labels={labels}
                      locale={locale}
                      isOpen={openActionsRowId === row.id}
                      onToggle={() =>
                        setOpenActionsRowId((current) =>
                          current === row.id ? null : row.id,
                        )
                      }
                      onClose={() => setOpenActionsRowId(null)}
                      onAllocate={() => setAllocationItem(row)}
                      onMovement={() => setMovementItem(row)}
                      onHistory={() => setHistoryItem(row)}
                      onEdit={() => setEditingItem(row)}
                      onSaved={showSuccessToast}
                    />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex justify-end gap-2">
          {page > 1 ? (
            <Link
              href={buildHref(baseHref, {
                ...filters,
                category: selectedCategory,
                status: selectedStatus,
                page: String(page - 1),
              })}
              className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-navy"
            >
              {locale === "ar" ? "السابق" : "Previous"}
            </Link>
          ) : null}
          <span className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-muted">
            {labels.page(page, totalPages)}
          </span>
          {page < totalPages ? (
            <Link
              href={buildHref(baseHref, {
                ...filters,
                category: selectedCategory,
                status: selectedStatus,
                page: String(page + 1),
              })}
              className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-navy"
            >
              {locale === "ar" ? "التالي" : "Next"}
            </Link>
          ) : null}
        </div>
      ) : null}

      {isCreateOpen ? (
        <StockItemDialog
          locale={locale}
          labels={labels}
          organizations={organizations.filter((organization) => organization.canManage)}
          providers={providers}
          mode="create"
          onSaved={showSuccessToast}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
      {editingItem ? (
        <StockItemDialog
          locale={locale}
          labels={labels}
          organizations={organizations.filter((organization) => organization.canManage)}
          providers={providers}
          mode="edit"
          item={editingItem}
          onSaved={showSuccessToast}
          onClose={() => setEditingItem(null)}
        />
      ) : null}
      {movementItem ? (
        <StockMovementDialog
          locale={locale}
          labels={labels}
          rows={rows.filter((row) => row.canManage && row.archivedAt === null)}
          item={movementItem === "select" ? null : movementItem}
          onSaved={showSuccessToast}
          onClose={() => setMovementItem(null)}
        />
      ) : null}
      {allocationItem ? (
        <StockAllocationDialog
          locale={locale}
          labels={labels}
          item={allocationItem}
          organizationOptions={allocationOrganizationOptions.filter(
            (option) => option.stockItemId === allocationItem.id,
          )}
          allocations={allocations.filter(
            (allocation) => allocation.stockItemId === allocationItem.id,
          )}
          onSaved={showSuccessToast}
          onClose={() => setAllocationItem(null)}
        />
      ) : null}
      {historyItem ? (
        <StockHistoryDialog
          locale={locale}
          labels={labels}
          item={historyItem}
          movements={movements.filter((movement) => movement.stockItemId === historyItem.id)}
          allocationMovements={allocationMovements.filter(
            (movement) => movement.stockItemId === historyItem.id,
          )}
          onClose={() => setHistoryItem(null)}
        />
      ) : null}
      {toastVisible ? (
        <div className="fixed bottom-5 inset-e-5 z-80 rounded-xl border border-primary/20 bg-surface px-4 py-3 text-sm font-bold text-navy shadow-xl">
          {labels.success}
        </div>
      ) : null}
    </div>
  );
}

function StockItemDialog({
  locale,
  labels,
  organizations,
  providers,
  mode,
  item,
  onSaved,
  onClose,
}: {
  locale: Locale;
  labels: Labels;
  organizations: MaintenanceStockOrganizationOption[];
  providers: MaintenanceStockProviderOption[];
  mode: "create" | "edit";
  item?: MaintenanceStockRow;
  onSaved: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const action =
    mode === "create"
      ? createMaintenanceStockItemAction
      : updateMaintenanceStockItemAction;
  const [state, formAction] = useActionState(action, idleState);
  const [organizationId, setOrganizationId] = useState(
    item?.organizationId ?? organizations[0]?.id ?? "",
  );
  const [providerId, setProviderId] = useState(item?.providerId ?? "");

  const organizationProviders = useMemo(
    () => providers.filter((provider) => provider.organizationId === organizationId),
    [organizationId, providers],
  );

  useEffect(() => {
    if (providerId && organizationProviders.some((provider) => provider.id === providerId)) {
      return;
    }

    setProviderId(organizationProviders[0]?.id ?? "");
  }, [organizationProviders, providerId]);

  useEffect(() => {
    if (state.status !== "success") return;
    onSaved();
    onClose();
    router.refresh();
  }, [onClose, onSaved, router, state.status]);

  return (
    <DialogFrame title={mode === "create" ? labels.createTitle : labels.editTitle} onClose={onClose}>
      <p className="mb-4 text-sm leading-6 text-muted">{labels.createDescription}</p>
      <ActionFeedback state={state} labels={labels} />
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="locale" value={locale} />
        {item ? <input type="hidden" name="itemId" value={item.id} /> : null}

        {mode === "create" ? (
          <>
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
          </>
        ) : null}

        <ItemFields labels={labels} item={item} />

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
    </DialogFrame>
  );
}

function ItemFields({
  labels,
  item,
}: {
  labels: Labels;
  item?: MaintenanceStockRow;
}) {
  return (
    <>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-xs font-bold text-muted">{labels.item}</span>
        <input
          name="itemName"
          defaultValue={item?.itemName ?? ""}
          maxLength={160}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          required
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.category}</span>
        <select
          name="category"
          defaultValue={item?.category ?? "material"}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          required
        >
          {(["oil", "spare_part", "material"] as MaintenanceStockCategory[]).map(
            (category) => (
              <option key={category} value={category}>
                {labels.categories[category]}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.unit}</span>
        <select
          name="unit"
          defaultValue={item?.unit ?? "piece"}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          required
        >
          {(["liter", "piece", "set", "kg", "meter", "other"] as MaintenanceStockUnit[]).map(
            (unit) => (
              <option key={unit} value={unit}>
                {labels.units[unit]}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.sku}</span>
        <input
          name="sku"
          defaultValue={item?.sku ?? ""}
          maxLength={80}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-bold text-muted">{labels.minimumQuantity}</span>
        <input
          name="minimumQuantity"
          type="number"
          min="0"
          step="0.001"
          defaultValue={item?.minimumQuantity ?? ""}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        />
      </label>
    </>
  );
}

function StockMovementDialog({
  locale,
  labels,
  rows,
  item,
  onSaved,
  onClose,
}: {
  locale: Locale;
  labels: Labels;
  rows: MaintenanceStockRow[];
  item: MaintenanceStockRow | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    createMaintenanceStockMovementAction,
    idleState,
  );
  const [selectedItemId, setSelectedItemId] = useState(item?.id ?? rows[0]?.id ?? "");
  const [clientSubmissionId, setClientSubmissionId] = useState(() =>
    createStoredClientSubmissionId(stockMovementSubmissionKey),
  );
  const selectedItem = rows.find((row) => row.id === selectedItemId) ?? null;
  const movementTypes = getAllowedMovementTypes(selectedItem);

  const handleClose = useCallback(() => {
    clearStoredClientSubmissionId(stockMovementSubmissionKey);
    setClientSubmissionId("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (state.status !== "success") return;
    clearStoredClientSubmissionId(stockMovementSubmissionKey);
    setClientSubmissionId("");
    onSaved();
    onClose();
    router.refresh();
  }, [onClose, onSaved, router, state.status]);

  return (
    <DialogFrame title={labels.movementTitle} onClose={handleClose}>
      <p className="mb-4 text-sm leading-6 text-muted">{labels.movementDescription}</p>
      <ActionFeedback state={state} labels={labels} />
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="clientSubmissionId" value={clientSubmissionId} />
        {item ? <input type="hidden" name="stockItemId" value={item.id} /> : null}
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-bold text-muted">{labels.item}</span>
          <select
            name="stockItemId"
            value={selectedItemId}
            onChange={(event) => setSelectedItemId(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            required
            disabled={Boolean(item)}
          >
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.itemName} - {formatProvider(row, labels)}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl border border-border bg-background p-3 text-sm font-bold text-muted">
          <span>{labels.currentQuantity}</span>
          <div className="mt-1 text-xl text-navy">
            {selectedItem
              ? `${formatQuantity(selectedItem.currentQuantity, locale)} ${labels.units[selectedItem.unit]}`
              : labels.notAvailable}
          </div>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.movementType}</span>
          <select
            name="movementType"
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            required
          >
            {movementTypes.map((movementType) => (
              <option key={movementType} value={movementType}>
                {labels.movementTypes[movementType]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.quantity}</span>
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            inputMode="decimal"
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            required
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-bold text-muted">{labels.note}</span>
          <textarea
            name="note"
            rows={3}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-navy"
          />
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-navy"
          >
            {labels.cancel}
          </button>
          <SubmitButton label={labels.save} pendingLabel={labels.saving} />
        </div>
      </form>
    </DialogFrame>
  );
}

function StockAllocationDialog({
  locale,
  labels,
  item,
  organizationOptions,
  allocations,
  onSaved,
  onClose,
}: {
  locale: Locale;
  labels: Labels;
  item: MaintenanceStockRow;
  organizationOptions: MaintenanceStockAllocationOrganizationOption[];
  allocations: MaintenanceStockAllocation[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [allocationState, allocationAction] = useActionState(
    allocateMaintenanceStockToOrganizationAction,
    idleState,
  );
  const [releaseState, releaseAction] = useActionState(
    releaseMaintenanceStockFromOrganizationAction,
    idleState,
  );
  const allocationSubmissionRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    clearStoredClientSubmissionId(allocationSubmissionKey);
    clearStoredClientSubmissionId(releaseSubmissionKey);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (allocationState.status !== "success" && releaseState.status !== "success") {
      return;
    }

    clearStoredClientSubmissionId(allocationSubmissionKey);
    clearStoredClientSubmissionId(releaseSubmissionKey);
    onSaved();
    onClose();
    router.refresh();
  }, [allocationState.status, onClose, onSaved, releaseState.status, router]);

  return (
    <DialogFrame title={labels.allocationTitle} onClose={handleClose} width="max-w-5xl">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-3 text-sm font-bold text-muted">
          <span className="text-navy">{item.itemName}</span>
          <div className="mt-1 text-xs">{labels.units[item.unit]}</div>
        </div>
        <QuantitySummaryCard
          label={labels.physicalQuantity}
          value={item.currentQuantity}
          locale={locale}
          unitLabel={labels.units[item.unit]}
        />
        <QuantitySummaryCard
          label={labels.unallocatedQuantity}
          value={item.unallocatedQuantity}
          locale={locale}
          unitLabel={labels.units[item.unit]}
        />
      </div>

      <ActionFeedback state={allocationState} labels={labels} />
      <form
        action={allocationAction}
        onSubmit={() => {
          if (allocationSubmissionRef.current) {
            allocationSubmissionRef.current.value =
              createStoredClientSubmissionId(allocationSubmissionKey);
          }
        }}
        className="mb-6 grid gap-4 border border-border bg-background p-4 sm:grid-cols-[1fr_160px] lg:grid-cols-[1fr_160px_1fr_auto]"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="stockItemId" value={item.id} />
        <input ref={allocationSubmissionRef} type="hidden" name="clientSubmissionId" />
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.organization}</span>
          <select
            name="organizationId"
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            required
            disabled={organizationOptions.length === 0}
          >
            {organizationOptions.length === 0 ? (
              <option value="">{labels.notAvailable}</option>
            ) : null}
            {organizationOptions.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {formatOrganization(organization.name, organization.code)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.quantity}</span>
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            max={item.unallocatedQuantity > 0 ? item.unallocatedQuantity : undefined}
            inputMode="decimal"
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted">{labels.note}</span>
          <input
            name="note"
            className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
          />
        </label>
        <div className="flex items-end">
          <SubmitButton
            label={labels.allocateToOrganizations}
            pendingLabel={labels.saving}
            disabled={organizationOptions.length === 0 || item.unallocatedQuantity <= 0}
          />
        </div>
      </form>

      <div className="space-y-3">
        <h4 className="text-sm font-bold text-navy">{labels.currentAllocations}</h4>
        {allocations.length === 0 ? (
          <div className="border border-dashed border-border bg-surface p-5 text-center text-sm font-bold text-muted">
            {labels.noAllocations}
          </div>
        ) : (
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="min-w-[760px] table-fixed border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  <Header className="w-64">{labels.organization}</Header>
                  <Header className="w-40">{labels.allocatedQuantity}</Header>
                  <Header className="w-96">{labels.releaseFromAllocation}</Header>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <Cell strong>
                      {formatOrganization(
                        allocation.organizationName ?? labels.notAvailable,
                        allocation.organizationCode,
                      )}
                    </Cell>
                    <Cell>
                      {formatQuantity(allocation.availableQuantity, locale)}{" "}
                      {labels.units[item.unit]}
                    </Cell>
                    <Cell>
                      <ActionFeedback state={releaseState} labels={labels} compact />
                      <ReleaseAllocationForm
                        locale={locale}
                        labels={labels}
                        itemId={item.id}
                        allocation={allocation}
                        action={releaseAction}
                      />
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DialogFrame>
  );
}

function ReleaseAllocationForm({
  locale,
  labels,
  itemId,
  allocation,
  action,
}: {
  locale: Locale;
  labels: Labels;
  itemId: string;
  allocation: MaintenanceStockAllocation;
  action: (payload: FormData) => void;
}) {
  const submissionRef = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      onSubmit={() => {
        if (submissionRef.current) {
          submissionRef.current.value =
            createStoredClientSubmissionId(releaseSubmissionKey);
        }
      }}
      className="grid gap-2 sm:grid-cols-[120px_1fr_auto]"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="stockItemId" value={itemId} />
      <input type="hidden" name="organizationId" value={allocation.organizationId} />
      <input ref={submissionRef} type="hidden" name="clientSubmissionId" />
      <input
        name="quantity"
        type="number"
        min="0.001"
        max={allocation.availableQuantity}
        step="0.001"
        inputMode="decimal"
        className="min-h-10 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        required
      />
      <input
        name="note"
        className="min-h-10 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy"
        placeholder={labels.note}
      />
      <SubmitButton
        label={labels.releaseFromAllocation}
        pendingLabel={labels.saving}
        disabled={allocation.availableQuantity <= 0}
      />
    </form>
  );
}

function StockHistoryDialog({
  locale,
  labels,
  item,
  movements,
  allocationMovements,
  onClose,
}: {
  locale: Locale;
  labels: Labels;
  item: MaintenanceStockRow;
  movements: MaintenanceStockMovement[];
  allocationMovements: MaintenanceStockAllocationMovement[];
  onClose: () => void;
}) {
  return (
    <DialogFrame title={labels.historyTitle} onClose={onClose} width="max-w-5xl">
      <div className="mb-4 rounded-xl border border-border bg-background p-3 text-sm font-bold text-muted">
        <span className="text-navy">{item.itemName}</span>
        <span className="mx-2">-</span>
        <span>
          {labels.currentQuantity}: {formatQuantity(item.currentQuantity, locale)}{" "}
          {labels.units[item.unit]}
        </span>
      </div>

      <h4 className="mb-2 text-sm font-bold text-navy">{labels.stockMovements}</h4>
      {movements.length === 0 ? (
        <div className="border border-dashed border-border bg-surface p-6 text-center text-sm font-bold text-muted">
          {labels.noHistory}
        </div>
      ) : (
        <div className="max-h-[55vh] overflow-auto border border-border">
          <table className="min-w-[980px] table-fixed border-collapse text-start">
            <thead className="bg-background text-xs font-bold uppercase text-muted">
              <tr>
                <Header className="w-40">{labels.date}</Header>
                <Header className="w-36">{labels.movementType}</Header>
                <Header className="w-28">{labels.quantity}</Header>
                <Header className="w-28">{labels.before}</Header>
                <Header className="w-28">{labels.after}</Header>
                <Header className="w-44">{labels.job}</Header>
                <Header className="w-40">{labels.actor}</Header>
                <Header className="w-56">{labels.note}</Header>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <Cell>{formatDateTime(movement.createdAt, locale)}</Cell>
                  <Cell>{labels.movementTypes[movement.movementType]}</Cell>
                  <Cell>{formatQuantity(movement.quantity, locale)}</Cell>
                  <Cell>{formatQuantity(movement.quantityBefore, locale)}</Cell>
                  <Cell>{formatQuantity(movement.quantityAfter, locale)}</Cell>
                  <Cell>{movement.jobLabel ?? labels.notLinked}</Cell>
                  <Cell>{movement.actorName ?? labels.notAvailable}</Cell>
                  <Cell>{movement.note ?? labels.notAvailable}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="mb-2 mt-5 text-sm font-bold text-navy">{labels.allocationMovements}</h4>
      {allocationMovements.length === 0 ? (
        <div className="border border-dashed border-border bg-surface p-6 text-center text-sm font-bold text-muted">
          {labels.noHistory}
        </div>
      ) : (
        <div className="max-h-[55vh] overflow-auto border border-border">
          <table className="min-w-[1100px] table-fixed border-collapse text-start">
            <thead className="bg-background text-xs font-bold uppercase text-muted">
              <tr>
                <Header className="w-40">{labels.date}</Header>
                <Header className="w-36">{labels.movementType}</Header>
                <Header className="w-52">{labels.organization}</Header>
                <Header className="w-28">{labels.quantity}</Header>
                <Header className="w-28">{labels.before}</Header>
                <Header className="w-28">{labels.after}</Header>
                <Header className="w-44">{labels.job}</Header>
                <Header className="w-40">{labels.actor}</Header>
                <Header className="w-56">{labels.note}</Header>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allocationMovements.map((movement) => (
                <tr key={movement.id}>
                  <Cell>{formatDateTime(movement.createdAt, locale)}</Cell>
                  <Cell>{labels.allocationMovementTypes[movement.movementType]}</Cell>
                  <Cell>
                    {formatOrganization(
                      movement.organizationName ?? labels.notAvailable,
                      movement.organizationCode,
                    )}
                  </Cell>
                  <Cell>{formatQuantity(movement.quantity, locale)}</Cell>
                  <Cell>{formatQuantity(movement.quantityBefore, locale)}</Cell>
                  <Cell>{formatQuantity(movement.quantityAfter, locale)}</Cell>
                  <Cell>{movement.jobLabel ?? labels.notLinked}</Cell>
                  <Cell>{movement.actorName ?? labels.notAvailable}</Cell>
                  <Cell>{movement.note ?? labels.notAvailable}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DialogFrame>
  );
}

function ArchiveItemForm({
  locale,
  itemId,
  labels,
  onSaved,
  onSubmitStart,
}: {
  locale: Locale;
  itemId: string;
  labels: Labels;
  onSaved: () => void;
  onSubmitStart?: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    archiveMaintenanceStockItemAction,
    idleState,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    onSaved();
    router.refresh();
  }, [onSaved, router, state.status]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(labels.archiveConfirm)) {
          event.preventDefault();
          return;
        }

        onSubmitStart?.();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton
        label={labels.archive}
        pendingLabel={labels.saving}
        variant="danger"
      />
    </form>
  );
}

function StockBalanceCell({
  row,
  labels,
  locale,
}: {
  row: MaintenanceStockRow;
  labels: Labels;
  locale: Locale;
}) {
  const unitLabel = labels.units[row.unit];
  const isOutOfStock = row.currentQuantity === 0;
  const isLowStock =
    !isOutOfStock &&
    row.minimumQuantity !== null &&
    row.currentQuantity <= row.minimumQuantity;

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-bold text-navy">
        {formatQuantity(row.currentQuantity, locale)} {unitLabel}
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
          {labels.allocatedQuantity} {formatQuantity(row.allocatedQuantity, locale)}
        </span>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-bold text-muted">
          {labels.unallocatedQuantity} {formatQuantity(row.unallocatedQuantity, locale)}
        </span>
      </div>
      {isOutOfStock || isLowStock ? (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
            isOutOfStock
              ? "bg-danger/10 text-danger"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {isOutOfStock ? labels.outOfStock : labels.lowStock}
        </span>
      ) : null}
    </div>
  );
}

function ProviderCell({
  row,
  labels,
}: {
  row: MaintenanceStockRow;
  labels: Labels;
}) {
  if (!row.providerName && !row.providerCode) return labels.notAvailable;

  return (
    <div className="min-w-0">
      <div className="truncate font-bold text-navy">
        {row.providerName ?? labels.notAvailable}
      </div>
      {row.providerCode ? (
        <div className="mt-0.5 truncate text-xs font-bold text-muted">
          {row.providerCode}
        </div>
      ) : null}
    </div>
  );
}

function StockRowActions({
  row,
  labels,
  locale,
  isOpen,
  onToggle,
  onClose,
  onAllocate,
  onMovement,
  onHistory,
  onEdit,
  onSaved,
}: {
  row: MaintenanceStockRow;
  labels: Labels;
  locale: Locale;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAllocate: () => void;
  onMovement: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const canMutate = row.canManage && row.archivedAt === null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const positionMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 176;
      const menuHeight = canMutate ? 178 : 54;
      const gap = 6;
      const viewportPadding = 8;
      const hasBottomSpace = rect.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;
      const hasTopSpace = rect.top - gap - menuHeight >= viewportPadding;
      const top =
        !hasBottomSpace && hasTopSpace
          ? rect.top - gap - menuHeight
          : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding);
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
      );

      setMenuPosition({
        left,
        top: Math.max(viewportPadding, top),
      });
    };

    positionMenu();
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [canMutate, isOpen, onClose]);

  const runAndClose = (handler: () => void) => {
    handler();
    onClose();
  };

  return (
    <div className="relative flex items-center gap-2" data-stock-action-menu>
      {canMutate ? (
        <button
          type="button"
          onClick={() => runAndClose(onAllocate)}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:bg-primary/90"
        >
          {labels.allocationMovementTypes.allocate}
        </button>
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={labels.actions}
        title={labels.actions}
        className="grid size-9 place-items-center rounded-lg border border-border bg-white text-lg font-bold leading-none text-navy hover:bg-primary-soft"
      >
        ⋯
      </button>
      {isOpen && menuPosition
        ? createPortal(
        <div
          role="menu"
          data-stock-action-menu
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
          }}
          className="fixed z-100 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 text-start shadow-[0_18px_50px_rgba(16,35,63,0.18)]"
        >
          {canMutate ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAndClose(onMovement)}
              className="block w-full px-3 py-2 text-start text-xs font-bold text-navy hover:bg-primary-soft"
            >
              {labels.addQuantity}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onHistory)}
            className="block w-full px-3 py-2 text-start text-xs font-bold text-navy hover:bg-primary-soft"
          >
            {labels.history}
          </button>
          {canMutate ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAndClose(onEdit)}
                className="block w-full px-3 py-2 text-start text-xs font-bold text-navy hover:bg-primary-soft"
              >
                {labels.edit}
              </button>
              <div className="border-t border-border px-2 py-1">
                <ArchiveItemForm
                  locale={locale}
                  itemId={row.id}
                  labels={labels}
                  onSaved={onSaved}
                  onSubmitStart={onClose}
                />
              </div>
            </>
          ) : null}
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}

function DialogFrame({
  title,
  children,
  onClose,
  width = "max-w-3xl",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-80 grid place-items-center bg-navy/45 p-4">
      <div className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-navy">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-navy"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionFeedback({
  state,
  labels,
  compact = false,
}: {
  state: MaintenanceStockActionState;
  labels: Labels;
  compact?: boolean;
}) {
  if (state.status !== "error" && state.status !== "validation_error") return null;

  return (
    <div
      className={`rounded-xl border border-danger/25 bg-danger/10 text-sm font-bold text-danger ${
        compact ? "mb-2 px-3 py-2" : "mb-4 px-4 py-3"
      }`}
    >
      {labels.errorForCode(state.code)}
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "danger"
      ? "rounded-xl border border-danger/30 px-3 py-2 text-xs font-bold text-danger disabled:opacity-60"
      : "rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60";

  return (
    <button type="submit" disabled={pending || disabled} className={className}>
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
  return <th className={`px-3 py-2 text-start ${className}`}>{children}</th>;
}

function Cell({
  children,
  strong = false,
  className = "",
}: {
  children: React.ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 text-sm ${strong ? "font-bold text-navy" : "text-muted"} ${className}`}>
      {children}
    </td>
  );
}

function QuantitySummaryCard({
  label,
  value,
  locale,
  unitLabel,
}: {
  label: string;
  value: number;
  locale: Locale;
  unitLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-sm font-bold text-muted">
      <span>{label}</span>
      <div className="mt-1 text-xl text-navy">
        {formatQuantity(value, locale)} {unitLabel}
      </div>
    </div>
  );
}

function getAllowedMovementTypes(
  item: MaintenanceStockRow | null,
): AdminMaintenanceStockMovementType[] {
  if (item && item.currentQuantity === 0 && item.movementCount === 0) {
    return ["opening_balance", "stock_in", "adjustment_in", "adjustment_out"];
  }

  return ["stock_in", "adjustment_in", "adjustment_out"];
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

function formatProvider(row: MaintenanceStockRow, labels: Labels) {
  return (
    [row.providerName, row.providerCode ? `(${row.providerCode})` : null]
      .filter(Boolean)
      .join(" ") || labels.notAvailable
  );
}

function formatOrganization(name: string, code: string | null) {
  return [name, code ? `(${code})` : null].filter(Boolean).join(" ");
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

function createStoredClientSubmissionId(storageKey: string) {
  if (typeof window === "undefined") {
    return createClientSubmissionId();
  }

  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing && submissionIdPattern.test(existing)) return existing;

    const submissionId = createClientSubmissionId();
    window.sessionStorage.setItem(storageKey, submissionId);
    return submissionId;
  } catch {
    return createClientSubmissionId();
  }
}

function clearStoredClientSubmissionId(storageKey: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // sessionStorage can be unavailable in locked-down browser modes.
  }
}

function createClientSubmissionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const value = char === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const value = Number(char);
    const random = crypto.getRandomValues(new Uint8Array(1))[0];
    return (value ^ (random & (15 >> (value / 4)))).toString(16);
  });
}
