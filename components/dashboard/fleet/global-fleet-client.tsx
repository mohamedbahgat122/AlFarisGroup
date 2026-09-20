"use client";

import { useActionState, useState, useTransition, useEffect, useRef, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { UserToast, type ToastState } from "@/components/dashboard/users/user-toast";
import { RealtimeRefresh } from "@/components/dashboard/realtime-refresh";
import {
  createGlobalFleetVehicleAction,
  setGlobalFleetArchiveStatusAction,
  setGlobalFleetOperationalStatusAction,
  updateGlobalFleetTechnicalStatusAction,
  updateGlobalFleetVehicleAction,
  getGlobalFleetActivityLogsAction,
  getGlobalFleetBaselinePhotoUrlsAction,
  getGlobalFleetDocumentPreviewUrlAction,
  searchGlobalDriversAction,
} from "@/features/fleet/global-actions";
import { getFleetDownloadUrlAction } from "@/features/fleet/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  DialogActions,
  EntityContent,
  EntityEmptyState,
  EntityFormBody,
  EntityFormDialog,
  EntityPageHeader,
  EntityTableContainer,
  FormSection,
  RowActionButton,
  SelectField,
  TableHeader,
  TextAreaField,
} from "@/components/dashboard/entity-management-ui";
import { initialFleetActionState } from "@/features/fleet/types";
import type {
  FleetActivityLog,
  FleetBaselinePhotoSlot,
  FleetBaselinePhotoUrls,
  FleetDriverOption,
  FleetListFilters,
  FleetOwnershipType,
  FleetSummaryCounts,
  FleetVehicle,
  FleetVehicleCategory,
  FleetTechnicalStatus,
} from "@/features/fleet/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type FleetDictionary = Dictionary["dashboard"]["fleet"];
const baselinePhotoSectionTitle = "\u0635\u0648\u0631 \u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0631\u0643\u0628\u0629";
const baselinePhotoLoadingLabel = "\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0635\u0648\u0631\u0629...";
const baselinePhotoEmptyLabel = "\u0644\u0627 \u062a\u0648\u062c\u062f \u0635\u0648\u0631\u0629";
const baselinePhotoRemoveSelectionLabel = "\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u062d\u062f\u062f\u0629";
const documentPreviewLabel = "\u0639\u0631\u0636";
const documentPreviewLoadingLabel = "\u062c\u0627\u0631\u064a \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629...";
const documentPreviewErrorLabel = "\u062a\u0639\u0630\u0631 \u062a\u062c\u0647\u064a\u0632 \u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0645\u0644\u0641";
const documentPreviewCloseLabel = "\u0625\u063a\u0644\u0627\u0642";
const pdfFileLabel = "PDF";
const acceptedFleetDocumentTypes = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";
const baselinePhotoSlots: {
  slot: FleetBaselinePhotoSlot;
  name: string;
  label: string;
}[] = [
  { slot: "front", name: "baselineFrontPhoto", label: "\u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0645\u0646 \u0627\u0644\u0623\u0645\u0627\u0645" },
  { slot: "rear", name: "baselineRearPhoto", label: "\u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0645\u0646 \u0627\u0644\u062e\u0644\u0641" },
  { slot: "right", name: "baselineRightPhoto", label: "\u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646" },
  { slot: "left", name: "baselineLeftPhoto", label: "\u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0645\u0646 \u0627\u0644\u064a\u0633\u0627\u0631" },
];
const ownershipTypeLabel = "\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0643\u064a\u0629";
const ownerLabel = "\u0627\u0644\u0645\u0627\u0644\u0643";
const assignedOrganizationLabel = "\u0627\u0644\u0645\u0624\u0633\u0633\u0629 \u0627\u0644\u0645\u0634\u063a\u0644\u0629";
const assignedDriverLabel = "\u0627\u0644\u0645\u0646\u062f\u0648\u0628 \u0627\u0644\u0645\u0639\u064a\u0646";
const unclassifiedOwnershipLabel = "\u063a\u064a\u0631 \u0645\u0635\u0646\u0641";
const ownershipTypeOptions: Array<{ value: FleetOwnershipType; label: string }> = [
  { value: "company_owned", label: "\u0645\u0645\u0644\u0648\u0643\u0629 \u0644\u0644\u0634\u0631\u0643\u0629" },
  { value: "rental", label: "\u0625\u064a\u062c\u0627\u0631" },
  { value: "external_office", label: "\u0645\u0643\u062a\u0628 \u062e\u0627\u0631\u062c\u064a" },
  { value: "individual", label: "\u0645\u0644\u0643 \u0634\u062e\u0635" },
  { value: "driver_owned", label: "\u0645\u0644\u0643 \u0645\u0646\u062f\u0648\u0628" },
  { value: "other", label: "\u0623\u062e\u0631\u0649" },
];

export type GlobalFleetClientProps = {
  locale: Locale;
  dictionary: FleetDictionary;
  category: FleetVehicleCategory;
  vehicles: FleetVehicle[];
  drivers?: FleetDriverOption[]; // Global fleet might not have organization drivers loaded yet, or it loads all? We didn't load them in page.
  summary: FleetSummaryCounts;
  pagination?: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  today: string;
  filters: FleetListFilters;
  organizationsMap: Record<string, string>;
  vehicleTypeOptions: string[];
  permissions: {
    create: boolean;
    update: boolean;
    technicalStatus: boolean;
    operationalStatus: boolean;
    archive: boolean;
    activity: boolean;
    operatingCard: boolean;
  };
};

export function GlobalFleetClient({
  locale,
  dictionary,
  category,
  vehicles,
  drivers = [],
  summary,
  pagination,
  today,
  filters,
  organizationsMap,
  vehicleTypeOptions,
  permissions,
}: GlobalFleetClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [conditionVehicle, setConditionVehicle] = useState<FleetVehicle | null>(null);
  const [activityVehicle, setActivityVehicle] = useState<FleetVehicle | null>(null);
  const [activityLogs, setActivityLogs] = useState<FleetActivityLog[]>([]);
  const [isActivityPending, startActivityTransition] = useTransition();
  const [isFilterPending, startFilterTransition] = useTransition();
  const actionPermissions = {
    create: permissions.create,
    update: permissions.update,
    technicalStatus: permissions.technicalStatus,
    operationalStatus: permissions.operationalStatus,
    archive: permissions.archive,
    downloadOperatingCard: permissions.operatingCard,
    activity: permissions.activity,
  };
  const title = category === "car" ? dictionary.carsTitle : dictionary.motorcyclesTitle;
  const fleetPath = `/${locale}/dashboard/fleet/${category === "car" ? "cars" : "motorcycles"}`;

  function openCreate() {
    setEditingVehicle(null);
    setShowForm(true);
  }

  function openEdit(vehicle: FleetVehicle) {
    setEditingVehicle(vehicle);
    setShowForm(true);
  }

  function handleSuccess(message: string) {
    setShowForm(false);
    setConditionVehicle(null);
    setToast({ tone: "success", message });
    router.refresh();
  }

  function openActivity(vehicle: FleetVehicle) {
    setActivityVehicle(vehicle);
    setActivityLogs([]);
    const formData = new FormData();
    formData.set("vehicleId", vehicle.id);
    startActivityTransition(async () => {
      setActivityLogs(await getGlobalFleetActivityLogsAction(formData));
    });
  }

  return (
    <>
      <RealtimeRefresh 
        channelName={`fleet-vehicles-${category}`}
        table="fleet_vehicles" 
        filter={`vehicle_category=eq.${category}`} 
        toast={locale === "ar" ? "تم تحديث البيانات تلقائياً" : "Data updated automatically"}
      />
      <UserToast locale={locale} toast={toast} onDismiss={() => setToast(null)} />
      <EntityPageHeader
        title={title}
        description={dictionary.description}
        viewOnlyLabel={actionPermissions.create ? undefined : dictionary.viewOnly}
        secondaryAction={
          <a
            href={filters.archive === "all" ? `${fleetPath}?archive=active` : `${fleetPath}?archive=all`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {filters.archive === "all" ? dictionary.hideArchived : dictionary.showArchived}
          </a>
        }
        primaryAction={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {actionPermissions.create ? (
              <Button
                type="button"
                onClick={openCreate}
                className="w-full gap-2 sm:w-auto"
              >
                <PlusIcon />
                {dictionary.addVehicle}
              </Button>
            ) : null}
            <div className="relative group">
              <button type="button" className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary">
                <DownloadIcon />
                {/* @ts-ignore */}
                {dictionary.exportExcel}
              </button>
              <div className="absolute top-full right-0 mt-2 w-48 rounded-xl border border-border bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 p-2 space-y-1">
                <a
                  href={`${fleetPath}/export?${searchParams.toString()}`}
                  download
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-navy hover:bg-surface transition"
                >
                  <DownloadIcon />
                  {/* @ts-ignore */}
                  {dictionary.exportFiltered}
                </a>
                <a
                  href={`${fleetPath}/export`}
                  download
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-navy hover:bg-surface transition"
                >
                  <DownloadIcon />
                  {/* @ts-ignore */}
                  {dictionary.exportAll}
                </a>
              </div>
            </div>
          </div>
        }
      />

      <EntityContent>
        <FleetSummaryCards dictionary={dictionary} summary={summary} />
        <FleetFilterBar
          dictionary={dictionary}
          filters={filters}
          organizationsMap={organizationsMap}
          vehicleTypeOptions={vehicleTypeOptions}
          pending={isFilterPending}
          onApply={(nextFilters) => {
            startFilterTransition(() => {
              router.replace(buildFleetFilterHref(fleetPath, nextFilters));
            });
          }}
        />
        {vehicles.length === 0 ? (
          <EntityEmptyState
            icon={<VehicleSectionIcon />}
            title={dictionary.emptyTitle}
            description={dictionary.emptyDescription}
            action={
              actionPermissions.create ? (
                <Button type="button" onClick={openCreate} className="gap-2">
                  <PlusIcon />
                  {dictionary.addVehicle}
                </Button>
              ) : null
            }
          />
        ) : (
          <EntityTableContainer>
            <table className="min-w-[1760px] table-fixed border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  <TableHeader className="w-40 whitespace-nowrap">{dictionary.vehicleType}</TableHeader>
                  <TableHeader className="w-36 whitespace-nowrap">{dictionary.plateNumber}</TableHeader>
                  <TableHeader className="w-36 whitespace-nowrap">{ownershipTypeLabel}</TableHeader>
                  <TableHeader className="w-44 whitespace-nowrap">{ownerLabel}</TableHeader>
                  <TableHeader className="w-52 whitespace-nowrap">{assignedOrganizationLabel}</TableHeader>
                  <TableHeader className="w-56 whitespace-nowrap">{assignedDriverLabel}</TableHeader>
                  <TableHeader className="w-56 whitespace-nowrap">{dictionary.authorizedPersonSection}</TableHeader>
                  <TableHeader className="w-40 whitespace-nowrap">{dictionary.operatingCardNumber}</TableHeader>
                  <TableHeader className="w-40 whitespace-nowrap">{dictionary.operatingCardExpiryDate}</TableHeader>
                  <TableHeader className="w-40 whitespace-nowrap">{dictionary.authorizationExpiryDate}</TableHeader>
                  <TableHeader className="w-32 whitespace-nowrap">{dictionary.operationalStatuses.active}</TableHeader>
                  <TableHeader className="w-32 whitespace-nowrap">{dictionary.technicalStatus}</TableHeader>
                  <TableHeader className="w-44 whitespace-nowrap">{dictionary.columns.at(-1) ?? ""}</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehicles.map((vehicle) => (
                  <FleetRow
                    key={vehicle.id}
                    locale={locale}
                    dictionary={dictionary}
                    organizationsMap={organizationsMap}
                    vehicle={vehicle}
                    today={today}
                    permissions={actionPermissions}
                    onEdit={openEdit}
                    onCondition={setConditionVehicle}
                    onActivity={openActivity}
                  />
                ))}
              </tbody>
            </table>
          </EntityTableContainer>
        )}
        {pagination && <PaginationControls pagination={pagination} />}
      </EntityContent>

      {showForm ? (
        <VehicleDialog
          locale={locale}
          dictionary={dictionary}
          organizationsMap={organizationsMap}
          category={category}
          drivers={drivers}
          vehicle={editingVehicle}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      ) : null}

      {conditionVehicle ? (
        <ConditionDialog
          locale={locale}
          dictionary={dictionary}
          vehicle={conditionVehicle}
          onClose={() => setConditionVehicle(null)}
          onSuccess={handleSuccess}
        />
      ) : null}

      {activityVehicle ? (
        <ActivityDialog
          dictionary={dictionary}
          vehicle={activityVehicle}
          logs={activityLogs}
          loading={isActivityPending}
          onClose={() => setActivityVehicle(null)}
        />
      ) : null}
    </>
  );
}

function FleetSummaryCards({
  dictionary,
  summary,
}: {
  dictionary: FleetDictionary;
  summary: FleetSummaryCounts;
}) {
  const cards = [
    { label: dictionary.summaryTotal, value: summary.total, tone: "border-slate-200 bg-slate-50 text-slate-700" },
    { label: dictionary.summaryHealthy, value: summary.healthy, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { label: dictionary.summaryAccident, value: summary.accident, tone: "border-red-200 bg-red-50 text-red-700" },
    { label: dictionary.summaryMaintenance, value: summary.maintenance, tone: "border-amber-200 bg-amber-50 text-amber-800" },
    { label: dictionary.summaryOperationalActive, value: summary.operationalActive, tone: "border-sky-200 bg-sky-50 text-sky-700" },
    { label: dictionary.summaryOperationalSuspended, value: summary.operationalSuspended, tone: "border-orange-200 bg-orange-50 text-orange-800" },
    { label: dictionary.summaryArchived, value: summary.archived, tone: "border-slate-300 bg-white text-muted" },
  ];

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-lg border px-4 py-3 ${card.tone}`}>
          <p className="text-xs font-bold leading-5">{card.label}</p>
          <p className="mt-1 text-2xl font-bold leading-none" dir="ltr">
            {card.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function FleetFilterBar({
  dictionary,
  filters,
  organizationsMap,
  vehicleTypeOptions,
  pending,
  onApply,
}: {
  dictionary: FleetDictionary;
  filters: FleetListFilters;
  organizationsMap: Record<string, string>;
  vehicleTypeOptions: string[];
  pending: boolean;
  onApply: (filters: FleetListFilters) => void;
}) {
  const filterFormRef = useRef<HTMLFormElement>(null);

  function applyPatch(patch: Partial<FleetListFilters>) {
    const formSearch =
      filterFormRef.current instanceof HTMLFormElement
        ? String(new FormData(filterFormRef.current).get("search") ?? "")
        : filters.search;
    onApply({ ...filters, search: formSearch, ...patch });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyPatch({});
  }

  return (
    <section className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-[0_16px_45px_rgba(16,35,63,0.04)]">
      <form ref={filterFormRef} onSubmit={handleSearchSubmit} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto]">
        <FormField
          key={filters.search}
          id="fleetSearch"
          name="search"
          label={dictionary.searchLabel}
          placeholder={dictionary.searchPlaceholder}
          defaultValue={filters.search}
          autoComplete="off"
        />
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={pending} className="min-h-12 whitespace-nowrap">
            {pending ? dictionary.loading : dictionary.applyFilters}
          </Button>
          <button
            type="button"
            onClick={() =>
              onApply({
                search: "",
                technicalStatus: "all",
                operationalStatus: "all",
                assignedOrganizationId: "",
                vehicleType: "",
                ownershipType: "all",
                archive: "active",
                page: 1,
                pageSize: 25,
                driver: "",
                authorization: "all",
                linkedDriver: "all",
              })
            }
            className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {dictionary.resetFilters}
          </button>
        </div>
      </form>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <FilterSelect
          id="fleetTechnicalFilter"
          label={dictionary.technicalStatus}
          value={filters.technicalStatus}
          onChange={(value) => applyPatch({ technicalStatus: value as FleetListFilters["technicalStatus"] })}
        >
          <option value="all">{dictionary.all}</option>
          {renderOptions(dictionary.technicalStatuses)}
        </FilterSelect>
        <FilterSelect
          id="fleetOperationalFilter"
          label={dictionary.operationalStatusFilter}
          value={filters.operationalStatus}
          onChange={(value) => applyPatch({ operationalStatus: value as FleetListFilters["operationalStatus"] })}
        >
          <option value="all">{dictionary.all}</option>
          {renderOptions(dictionary.operationalStatuses)}
        </FilterSelect>
        <FilterSelect
          id="fleetOrganizationFilter"
          label={assignedOrganizationLabel}
          value={filters.assignedOrganizationId}
          onChange={(value) => applyPatch({ assignedOrganizationId: value })}
        >
          <option value="">{dictionary.all}</option>
          {Object.entries(organizationsMap).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="fleetVehicleTypeFilter"
          label={dictionary.vehicleType}
          value={filters.vehicleType}
          onChange={(value) => applyPatch({ vehicleType: value })}
        >
          <option value="">{dictionary.all}</option>
          {vehicleTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="fleetOwnershipFilter"
          label={ownershipTypeLabel}
          value={filters.ownershipType}
          onChange={(value) => applyPatch({ ownershipType: value as FleetListFilters["ownershipType"] })}
        >
          <option value="all">{dictionary.all}</option>
          {ownershipTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="fleetArchiveFilter"
          label={dictionary.archiveFilter}
          value={filters.archive}
          onChange={(value) => applyPatch({ archive: value as FleetListFilters["archive"] })}
        >
          <option value="active">{dictionary.notArchivedFilter}</option>
          <option value="archived">{dictionary.archivedOnlyFilter}</option>
          <option value="all">{dictionary.all}</option>
        </FilterSelect>
      </div>
    </section>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="space-y-2">
      <span className="block text-sm font-semibold text-navy">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        {children}
      </select>
    </label>
  );
}

function buildFleetFilterHref(path: string, filters: FleetListFilters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.technicalStatus !== "all") params.set("technical", filters.technicalStatus);
  if (filters.operationalStatus !== "all") params.set("operational", filters.operationalStatus);
  if (filters.assignedOrganizationId) params.set("organization", filters.assignedOrganizationId);
  if (filters.vehicleType) params.set("vehicleType", filters.vehicleType);
  if (filters.ownershipType !== "all") params.set("ownership", filters.ownershipType);
  if (filters.archive !== "active") params.set("archive", filters.archive);
  
  if (filters.driver?.trim()) params.set("driver", filters.driver.trim());
  if (filters.authorization && filters.authorization !== "all") params.set("authorization", filters.authorization);
  if (filters.linkedDriver && filters.linkedDriver !== "all") params.set("linkedDriver", filters.linkedDriver);
  
  // reset page to 1 on any filter change
  params.set("page", "1");

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function FleetRow({
  locale,
  dictionary,
  organizationsMap,
  vehicle,
  today,
  permissions,
  onEdit,
  onCondition,
  onActivity,
}: {
  locale: Locale;
  dictionary: FleetDictionary;
  organizationsMap: Record<string, string>;
  vehicle: FleetVehicle;
  today: string;
  permissions: {
    update: boolean;
    technicalStatus: boolean;
    operationalStatus: boolean;
    archive: boolean;
    downloadOperatingCard: boolean;
    activity: boolean;
  };
  onEdit: (vehicle: FleetVehicle) => void;
  onCondition: (vehicle: FleetVehicle) => void;
  onActivity: (vehicle: FleetVehicle) => void;
}) {
  const remaining = getRemainingDays(vehicle.authorizationExpiryDate, today);
  const rowClassName = getRowClassName(vehicle, remaining);
  const owner = getOwnershipDisplayName(vehicle, dictionary);

  return (
    <tr className={`align-middle transition hover:bg-primary-soft/35 ${rowClassName}`}>
      <td className="px-4 py-4 font-bold text-navy"><span className="block truncate" title={vehicle.vehicleType}>{vehicle.vehicleType}</span></td>
      <td className="whitespace-nowrap px-4 py-4 font-medium text-muted" dir="ltr">{vehicle.plateNumber}</td>
      <td className="whitespace-nowrap px-4 py-4 font-medium text-muted">{getOwnershipTypeLabel(vehicle.ownershipType)}</td>
      <td className="px-4 py-4 font-medium text-muted"><span className="block truncate" title={owner || dictionary.notAvailable}>{owner || dictionary.notAvailable}</span></td>
      <td className="px-4 py-4 font-bold text-navy">
        <span className="block truncate" title={vehicle.assignedOrganizationId ? organizationsMap[vehicle.assignedOrganizationId] ?? "-" : "-"}>
          {vehicle.assignedOrganizationId ? organizationsMap[vehicle.assignedOrganizationId] ?? "-" : "-"}
        </span>
      </td>
      <td className="px-4 py-4 font-medium text-muted">
        <LinkedDriversCell
          drivers={vehicle.linkedDrivers}
          emptyLabel={dictionary.notAssigned}
        />
      </td>
      <td className="px-4 py-4 font-medium text-muted">
        <div className="truncate" title={vehicle.authorizedPersonName ?? dictionary.notAssigned}>{vehicle.authorizedPersonName ?? dictionary.notAssigned}</div>
        <div className="whitespace-nowrap text-xs text-muted" dir="ltr">
          {vehicle.authorizedPersonIqama ?? ""}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-4 font-medium text-muted" dir="ltr">{vehicle.operatingCardNumber}</td>
      <td className="whitespace-nowrap px-4 py-4 font-medium text-muted">{formatDate(vehicle.operatingCardExpiryDate)}</td>
      <td className="whitespace-nowrap px-4 py-4">
        <span className={remainingBadgeClassName(remaining)}>
          {formatRemainingDays(remaining, dictionary)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <StatusBadge label={dictionary.operationalStatuses[vehicle.operationalStatus]} tone={vehicle.operationalStatus === "active" ? "success" : "warning"} />
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <StatusBadge label={dictionary.technicalStatuses[vehicle.technicalStatus]} tone={vehicle.technicalStatus === "healthy" ? "success" : vehicle.technicalStatus === "fault" ? "warning" : "danger"} />
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <div className="inline-flex items-center justify-center gap-1">
          {permissions.activity ? (
            <RowActionButton label={dictionary.activity} onClick={() => onActivity(vehicle)}>
              <ActivityIcon />
            </RowActionButton>
          ) : null}
          {permissions.update ||
          permissions.technicalStatus ||
          permissions.operationalStatus ||
          permissions.archive ? (
            <>
              {permissions.update ? (
                <RowActionButton label={dictionary.edit} onClick={() => onEdit(vehicle)}>
                  <EditIcon />
                </RowActionButton>
              ) : null}
              {permissions.technicalStatus ? (
                <RowActionButton label={dictionary.condition} onClick={() => onCondition(vehicle)}>
                  <ConditionIcon />
                </RowActionButton>
              ) : null}
              <LifecycleForm locale={locale} vehicle={vehicle} dictionary={dictionary} permissions={permissions} />
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function LinkedDriversCell({
  drivers,
  emptyLabel,
}: {
  drivers: FleetVehicle["linkedDrivers"];
  emptyLabel: string;
}) {
  if (drivers.length === 0) {
    return <DriverCell name={emptyLabel} />;
  }

  return (
    <div className="min-w-0 space-y-2">
      {drivers.map((driver) => (
        <DriverCell
          key={driver.id}
          name={driver.fullName}
          iqama={driver.iqamaNumber}
        />
      ))}
    </div>
  );
}

function DriverCell({ name, iqama }: { name: string; iqama?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate" title={name}>{name}</div>
      {iqama ? (
        <div className="whitespace-nowrap text-xs text-muted" dir="ltr">
          {iqama}
        </div>
      ) : null}
    </div>
  );
}

function VehicleDialog({
  locale,
  dictionary,
  organizationsMap,
  category,
  drivers,
  vehicle,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: FleetDictionary;
  organizationsMap: Record<string, string>;
  category: FleetVehicleCategory;
  drivers: FleetDriverOption[];
  vehicle: FleetVehicle | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const action = vehicle ? updateGlobalFleetVehicleAction : createGlobalFleetVehicleAction;
  const [state, formAction] = useActionState(action, initialFleetActionState);
  const router = useRouter();
  const [ownershipType, setOwnershipType] = useState<FleetOwnershipType | "">(
    vehicle?.ownershipType ?? "",
  );
  const [assignedOrganizationId, setAssignedOrganizationId] = useState(
    vehicle?.assignedOrganizationId ?? "",
  );
  const [authorizedPersonSource, setAuthorizedPersonSource] = useState(vehicle?.authorizedPersonSource ?? "none");
  const [baselinePhotoUrls, setBaselinePhotoUrls] = useState<FleetBaselinePhotoUrls>({
    front: null,
    rear: null,
    right: null,
    left: null,
  });
  const [isBaselinePhotosPending, startBaselinePhotosTransition] = useTransition();
  const title = getVehicleDialogTitle(dictionary, category, Boolean(vehicle));
  const submitLabel = vehicle ? dictionary.saveChanges : dictionary.saveVehicle;

  useEffect(() => {
    if (!vehicle) return;

    const formData = new FormData();
    formData.set("vehicleId", vehicle.id);
    startBaselinePhotosTransition(async () => {
      setBaselinePhotoUrls(await getGlobalFleetBaselinePhotoUrlsAction(formData));
    });
  }, [vehicle]);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(dictionary.success);
    } else if (state.status === "error" && state.code === "unauthorized") {
      router.refresh();
    }
  }, [router, state.code, state.status, onSuccess, dictionary.success]);

  return (
    <EntityFormDialog
      title={title}
      subtitle={dictionary.formSubtitle}
      closeLabel={dictionary.close}
      labelledBy="fleet-vehicle-dialog-title"
      onClose={onClose}
    >
      <form
        action={formAction}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="vehicleCategory" value={category} />
        <input type="hidden" name="vehicleId" value={vehicle?.id ?? ""} />
        <input type="hidden" name="technicalStatus" value={vehicle?.technicalStatus ?? "healthy"} />
        <input type="hidden" name="faultLocation" value={vehicle?.faultLocation ?? ""} />
        <input type="hidden" name="technicalStatusNote" value={vehicle?.technicalStatusNote ?? ""} />
        <input type="hidden" name="assignedDriverSource" value={vehicle?.assignedDriverSource ?? "none"} />
        <input type="hidden" name="assignedDriverId" value={vehicle?.assignedDriverId ?? ""} />
        <input type="hidden" name="assignedDriverManualName" value={vehicle?.assignedDriverManualName ?? ""} />
        <input type="hidden" name="assignedDriverManualIqama" value={vehicle?.assignedDriverManualIqama ?? ""} />

        <EntityFormBody>
          {state.status === "validation_error" || state.status === "error" ? (
            <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {getErrorMessage(dictionary, state.code)}
            </p>
          ) : null}

          <div className="space-y-6">
            <FormSection
              title={`${dictionary.vehicleInformationSection} · ${dictionary.categoryLabels[category]}`}
            >
              <FormField
                id="fleetVehicleType"
                label={dictionary.vehicleType}
                name="vehicleType"
                defaultValue={vehicle?.vehicleType ?? ""}
                error={state.fieldErrors?.vehicleType}
                required
                autoComplete="off"
              />
              <FormField
                id="fleetPlateNumber"
                label={dictionary.plateNumber}
                name="plateNumber"
                defaultValue={vehicle?.plateNumber ?? ""}
                error={state.fieldErrors?.plateNumber}
                required
                dir="ltr"
                autoComplete="off"
              />
              <FormField
                id="fleetSerialNumber"
                label={dictionary.vehicleSerialNumber ?? "الرقم التسلسلي"}
                name="serialNumber"
                defaultValue={vehicle?.serialNumber ?? ""}
                error={state.fieldErrors?.serialNumber}
                dir="ltr"
                autoComplete="off"
              />
              <FormField
                id="fleetBrand"
                label={dictionary.vehicleBrand ?? "العلامة التجارية"}
                name="brand"
                defaultValue={vehicle?.brand ?? ""}
                error={state.fieldErrors?.brand}
                autoComplete="off"
              />
            </FormSection>

            <FormSection title={dictionary.ownerSection}>
              <SelectField
                id="fleetAssignedOrganizationId"
                label={dictionary.assignedOrganization}
                name="assignedOrganizationId"
                value={assignedOrganizationId}
                onChange={setAssignedOrganizationId}
                error={state.fieldErrors?.assignedOrganizationId}
                required
              >
                <option value="">{dictionary.selectOrganization}</option>
                {Object.entries(organizationsMap).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="fleetOwnershipType"
                label={ownershipTypeLabel}
                name="ownershipType"
                value={ownershipType}
                onChange={(value) =>
                  setOwnershipType(
                    ownershipTypeOptions.some((option) => option.value === value)
                      ? (value as FleetOwnershipType)
                      : "",
                  )
                }
              >
                <option value="">{unclassifiedOwnershipLabel}</option>
                {ownershipTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>

              {ownershipType === "driver_owned" ? (
                <DriverPicker
                  dictionary={dictionary}
                  drivers={drivers}
                  name="ownerDriverId"
                  defaultValue={vehicle?.ownerDriverId ?? ""}
                  label={ownerLabel}
                />
              ) : null}

              {ownershipType && ownershipType !== "driver_owned" ? (
                <FormField
                  id="fleetOwnerName"
                  label={ownerLabel}
                  name="ownerName"
                  defaultValue={vehicle?.currentOwnerName ?? ""}
                  error={state.fieldErrors?.ownerName}
                  autoComplete="off"
                />
              ) : null}

              {ownershipType && ownershipType !== "company_owned" && ownershipType !== "driver_owned" ? (
                <FormField
                  id="fleetOwnerIdentifier"
                  label={dictionary.vehicleOwnerIdentifier ?? "معرف المالك"}
                  name="ownerIdentifier"
                  defaultValue={vehicle?.ownerIdentifier ?? ""}
                  error={state.fieldErrors?.ownerIdentifier}
                  dir="ltr"
                  autoComplete="off"
                />
              ) : null}

              {ownershipType && ownershipType !== "company_owned" && ownershipType !== "driver_owned" ? (
                <FormField
                  id="fleetOwnerContactPhone"
                  label={"\u0631\u0642\u0645 \u0627\u0644\u062a\u0648\u0627\u0635\u0644"}
                  name="ownerContactPhone"
                  defaultValue={vehicle?.ownerContactPhone ?? ""}
                  error={state.fieldErrors?.ownerContactPhone}
                  dir="ltr"
                  autoComplete="off"
                />
              ) : null}

              {ownershipType === "rental" ? (
                <>
                  <FormField
                    id="fleetRentalStartDate"
                    label={"\u062a\u0627\u0631\u064a\u062e \u0628\u062f\u0627\u064a\u0629 \u0627\u0644\u0625\u064a\u062c\u0627\u0631"}
                    name="rentalStartDate"
                    type="date"
                    defaultValue={vehicle?.rentalStartDate ?? ""}
                    error={state.fieldErrors?.rentalStartDate}
                  />
                  <FormField
                    id="fleetRentalEndDate"
                    label={"\u062a\u0627\u0631\u064a\u062e \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u0625\u064a\u062c\u0627\u0631"}
                    name="rentalEndDate"
                    type="date"
                    defaultValue={vehicle?.rentalEndDate ?? ""}
                    error={state.fieldErrors?.rentalEndDate}
                  />
                  <FormField
                    id="fleetRentalMonthlyCost"
                    label={"\u0627\u0644\u062a\u0643\u0644\u0641\u0629 \u0627\u0644\u0634\u0647\u0631\u064a\u0629"}
                    name="rentalMonthlyCost"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={vehicle?.rentalMonthlyCost?.toString() ?? ""}
                    error={state.fieldErrors?.rentalMonthlyCost}
                  />
                </>
              ) : null}

              {ownershipType === "rental" || ownershipType === "external_office" || ownershipType === "individual" ? (
                <FormField
                  id="fleetOwnershipContractNumber"
                  label={"\u0631\u0642\u0645 \u0627\u0644\u0639\u0642\u062f / \u0627\u0644\u0645\u0631\u062c\u0639"}
                  name="ownershipContractNumber"
                  defaultValue={vehicle?.ownershipContractNumber ?? ""}
                  error={state.fieldErrors?.ownershipContractNumber}
                  autoComplete="off"
                />
              ) : null}

              {ownershipType === "rental" || ownershipType === "external_office" || ownershipType === "individual" || ownershipType === "other" ? (
                <div className="md:col-span-2">
                  <TextAreaField
                    id="fleetOwnershipNotes"
                    label={"\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0645\u0644\u0643\u064a\u0629"}
                    name="ownershipNotes"
                    defaultValue={vehicle?.ownershipNotes ?? ""}
                    error={state.fieldErrors?.ownershipNotes}
                  />
                </div>
              ) : null}
            </FormSection>

            <FormSection title={dictionary.operatingCardSection}>
              <FormField
                id="fleetOperatingCardNumber"
                label={dictionary.operatingCardNumber}
                name="operatingCardNumber"
                defaultValue={vehicle?.operatingCardNumber ?? ""}
                error={state.fieldErrors?.operatingCardNumber}
                required
                dir="ltr"
                autoComplete="off"
              />
              <FormField
                id="fleetOperatingCardExpiryDate"
                label={dictionary.operatingCardExpiryDate}
                name="operatingCardExpiryDate"
                type="date"
                defaultValue={vehicle?.operatingCardExpiryDate ?? ""}
                error={state.fieldErrors?.operatingCardExpiryDate}
                required
              />
              <div className="md:col-span-2">
                <FileField dictionary={dictionary} vehicle={vehicle} error={state.fieldErrors?.operatingCardFile} />
              </div>
              <div className="md:col-span-2 mt-4 border-t border-border pt-4">
                <RegistrationFileField dictionary={dictionary} vehicle={vehicle} error={state.fieldErrors?.registrationFile} />
              </div>
            </FormSection>

            <FormSection title={baselinePhotoSectionTitle}>
              {baselinePhotoSlots.map((photo) => (
                <BaselinePhotoField
                  key={photo.slot}
                  id={`fleetBaseline${photo.slot}Photo`}
                  name={photo.name}
                  label={photo.label}
                  currentUrl={baselinePhotoUrls[photo.slot]}
                  loading={isBaselinePhotosPending}
                />
              ))}
            </FormSection>

            <FormSection title={dictionary.assignedDriverSection}>
              <div className="md:col-span-2">
                <MultiDriverPicker
                  key={vehicle?.id ?? "new"}
                  dictionary={dictionary}
                  locale={locale}
                  initialDrivers={vehicle?.linkedDrivers ?? []}
                />
              </div>
            </FormSection>

            <FormSection title={dictionary.authorizedPersonSection}>
              <SelectField
                id="fleetAuthorizedPersonSource"
                label={dictionary.authorizedPersonSource}
                name="authorizedPersonSource"
                value={authorizedPersonSource}
                onChange={(value) =>
                  setAuthorizedPersonSource(
                    value === "organization_driver" || value === "manual"
                      ? value
                      : "none",
                  )
                }
              >
                {renderOptions(dictionary.authorizedPersonSources)}
              </SelectField>
              {authorizedPersonSource === "organization_driver" ? (
                <DriverPicker dictionary={dictionary} drivers={drivers} name="authorizedDriverId" defaultValue={vehicle?.authorizedDriverId ?? ""} label={dictionary.authorizedOrganizationDriver} />
              ) : null}
              {authorizedPersonSource === "manual" ? (
                <>
                  <FormField id="fleetAuthorizedManualName" label={dictionary.authorizedManualName} name="authorizedManualName" defaultValue={vehicle?.authorizedManualName ?? ""} error={state.fieldErrors?.authorizedManualName} required autoComplete="off" />
                  <FormField id="fleetAuthorizedManualIqama" label={dictionary.authorizedManualIqama} name="authorizedManualIqama" defaultValue={vehicle?.authorizedManualIqama ?? ""} error={state.fieldErrors?.authorizedManualIqama} required dir="ltr" autoComplete="off" />
                </>
              ) : null}
              {authorizedPersonSource !== "none" ? (
                <>
                  <FormField
                    id="fleetAuthorizationNumber"
                    label={dictionary.vehicleAuthorizationNumber ?? "رقم التفويض"}
                    name="authorizationNumber"
                    defaultValue={vehicle?.authorizationNumber ?? ""}
                    error={state.fieldErrors?.authorizationNumber}
                    dir="ltr"
                    autoComplete="off"
                  />
                  <FormField id="fleetAuthorizationExpiryDate" label={dictionary.authorizationExpiryDate} name="authorizationExpiryDate" type="date" defaultValue={vehicle?.authorizationExpiryDate ?? ""} error={state.fieldErrors?.authorizationExpiryDate} />
                </>
              ) : null}
            </FormSection>

            <FormSection title={dictionary.notesSection}>
              <TextAreaField
                id="fleetNotes"
                name="notes"
                label={dictionary.generalNotes}
                defaultValue={vehicle?.notes ?? ""}
              />
            </FormSection>
          </div>
        </EntityFormBody>

        <DialogActions
          cancel={dictionary.cancel}
          submit={submitLabel}
          submitting={dictionary.saving}
          onCancel={onClose}
        />
      </form>
    </EntityFormDialog>
  );
}

function ConditionDialog({
  locale,
  dictionary,
  vehicle,
  onClose,
  onSuccess,
}: {
  locale: Locale;
  dictionary: FleetDictionary;
  vehicle: FleetVehicle;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, formAction] = useActionState(updateGlobalFleetTechnicalStatusAction, initialFleetActionState);
  const router = useRouter();
  const [technicalStatus, setTechnicalStatus] = useState<FleetTechnicalStatus>(vehicle.technicalStatus);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(dictionary.success);
    } else if (state.status === "error" && state.code === "unauthorized") {
      router.refresh();
    }
  }, [router, state.code, state.status, onSuccess, dictionary.success]);

  return (
    <EntityFormDialog
      title={dictionary.condition}
      subtitle={vehicle.plateNumber}
      closeLabel={dictionary.close}
      labelledBy="fleet-condition-dialog-title"
      onClose={onClose}
    >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="vehicleId" value={vehicle.id} />
        <EntityFormBody>
          {state.status === "validation_error" || state.status === "error" ? (
            <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {getErrorMessage(dictionary, state.code)}
            </p>
          ) : null}
          <FormSection title={dictionary.technicalStatus}>
            <SelectField
              id="fleetTechnicalStatus"
              label={dictionary.technicalStatus}
              name="technicalStatus"
              value={technicalStatus}
              onChange={(val) => setTechnicalStatus(val as FleetTechnicalStatus)}
            >
              {renderOptions(dictionary.technicalStatuses)}
            </SelectField>
            {technicalStatus === "fault" || technicalStatus === "accident" ? (
              <SelectField
                id="fleetFaultLocation"
                label={dictionary.faultLocation}
                name="faultLocation"
                defaultValue={vehicle.faultLocation ?? ""}
                error={state.fieldErrors?.faultLocation}
              >
                {renderOptions({ "": dictionary.selectPlaceholder, ...dictionary.faultLocations })}
              </SelectField>
            ) : null}
            <TextAreaField
              id="fleetTechnicalStatusNote"
              name="technicalStatusNote"
              label={dictionary.notes}
              defaultValue={vehicle.technicalStatusNote ?? ""}
            />
          </FormSection>
        </EntityFormBody>
        <DialogActions
          cancel={dictionary.cancel}
          submit={dictionary.save}
          submitting={dictionary.saving}
          onCancel={onClose}
        />
      </form>
    </EntityFormDialog>
  );
}

function ActivityDialog({
  dictionary,
  vehicle,
  logs,
  loading,
  onClose,
}: {
  dictionary: FleetDictionary;
  vehicle: FleetVehicle;
  logs: FleetActivityLog[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <EntityFormDialog
      title={dictionary.activity}
      subtitle={vehicle.plateNumber}
      closeLabel={dictionary.close}
      labelledBy="fleet-activity-dialog-title"
      onClose={onClose}
    >
      <EntityFormBody>
        <div className="space-y-3">
          {loading ? <p className="text-sm text-muted">{dictionary.loading}</p> : null}
          {!loading && logs.length === 0 ? <p className="text-sm text-muted">{dictionary.emptyActivity}</p> : null}
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold text-navy">{dictionary.activityActions[log.action]}</p>
                <time className="text-xs text-muted" dir="ltr">{formatDateTime(log.createdAt)}</time>
              </div>
              <p className="mt-1 text-xs text-muted">{log.actorName}</p>
              {log.note ? <p className="mt-2 text-sm text-muted">{log.note}</p> : null}
            </div>
          ))}
        </div>
      </EntityFormBody>
      <div className="flex shrink-0 justify-end border-t border-border bg-surface px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {dictionary.close}
        </button>
      </div>
    </EntityFormDialog>
  );
}

function LifecycleForm({
  locale,
  vehicle,
  dictionary,
  permissions,
}: {
  locale: Locale;
  vehicle: FleetVehicle;
  dictionary: FleetDictionary;
  permissions: {
    operationalStatus: boolean;
    archive: boolean;
  };
}) {
  return (
    <>
      {permissions.operationalStatus ? (
        <form action={setGlobalFleetOperationalStatusAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="vehicleId" value={vehicle.id} />
        <input type="hidden" name="status" value={vehicle.operationalStatus === "active" ? "suspended" : "active"} />
        <RowActionButton
          type="submit"
          label={vehicle.operationalStatus === "active" ? dictionary.suspend : dictionary.reactivate}
        >
          {vehicle.operationalStatus === "active" ? <SuspendIcon /> : <ReactivateIcon />}
        </RowActionButton>
      </form>
      ) : null}

      {permissions.archive ? (
        <form action={setGlobalFleetArchiveStatusAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="vehicleId" value={vehicle.id} />
          <input type="hidden" name="archived" value={vehicle.archivedAt ? "false" : "true"} />
          <RowActionButton
            type="submit"
            label={vehicle.archivedAt ? dictionary.restore : dictionary.archive}
            destructive={!vehicle.archivedAt}
          >
            {vehicle.archivedAt ? <ReactivateIcon /> : <ArchiveIcon />}
          </RowActionButton>
        </form>
      ) : null}
    </>
  );
}

function DriverPicker({
  dictionary,
  drivers: initialDrivers,
  name,
  defaultValue,
  label,
}: {
  dictionary: FleetDictionary;
  drivers: FleetDriverOption[];
  name: string;
  defaultValue: string;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FleetDriverOption[]>(initialDrivers);
  const [selectedDriver, setSelectedDriver] = useState<FleetDriverOption | null>(
    initialDrivers.find((d) => d.id === defaultValue) ?? null
  );
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedLabel = selectedDriver ? getDriverOptionLabel(selectedDriver) : "";
  const showSearchResults = query.trim().length >= 2;
  const visibleOptions =
    showSearchResults || selectedDriver === null ? options : [selectedDriver];

  useEffect(() => {
    if (selectedDriver && query !== selectedLabel) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(selectedLabel);
    }
  }, [query, selectedDriver, selectedLabel]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        if (selectedDriver) {
          setQuery(selectedLabel);
        } else {
          setQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedDriver, selectedLabel]);

  useEffect(() => {
    if (selectedDriver && query === selectedLabel) {
      return;
    }

    if (query.trim().length < 2) {
      return;
    }

    const handler = setTimeout(() => {
      startTransition(async () => {
        const results = await searchGlobalDriversAction(query);
        if (selectedDriver && !results.some((result) => result.id === selectedDriver.id)) {
          results.unshift(selectedDriver);
        }
        setOptions(results);
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [query, selectedDriver, selectedLabel]);

  return (
    <div className="relative" ref={wrapperRef}>
      <input type="hidden" name={name} value={selectedDriver?.id ?? ""} />

      <div className="relative">
        <FormField
          id={`${name}Query`}
          value={query}
          onChange={(e) => {
            const nextQuery = e.target.value;
            setQuery(nextQuery);
            if (selectedDriver && nextQuery !== selectedLabel) {
              setSelectedDriver(null);
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          label={label}
          placeholder={dictionary.searchDriverPlaceholder}
          required={!selectedDriver}
          autoComplete="off"
        />
        {isPending && (
          <div className="absolute top-9.5 left-4 flex h-3 w-3">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-navy/40 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-3 w-3 bg-navy"></span>
          </div>
        )}
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-surface py-1 text-sm shadow-[0_16px_45px_rgba(16,35,63,0.06)] focus:outline-none">
          {visibleOptions.length === 0 && !isPending ? (
            <li className="relative cursor-default select-none px-4 py-2 text-muted">
              {dictionary.notAvailable}
            </li>
          ) : (
            visibleOptions.map((driver) => (
              <li
                key={driver.id}
                className="relative cursor-pointer select-none px-4 py-2 hover:bg-slate-50 text-navy data-[selected=true]:bg-slate-100"
                data-selected={selectedDriver?.id === driver.id}
                onClick={() => {
                  setSelectedDriver(driver);
                  setQuery(getDriverOptionLabel(driver));
                  setOpen(false);
                }}
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{driver.fullName}</span>
                  <span className="text-xs text-muted mt-0.5 font-medium leading-relaxed">
                    {driver.iqamaNumber}
                    {driver.mobileNumber ? ` • ${driver.mobileNumber}` : ""}
                    {driver.organizationName ? ` • ${driver.organizationName}` : ""}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function BaselinePhotoField({
  id,
  name,
  label,
  currentUrl,
  loading,
}: {
  id: string;
  name: string;
  label: string;
  currentUrl: string | null;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const activeUrl = previewUrl ?? currentUrl;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return file ? URL.createObjectURL(file) : null;
    });
  }

  function clearSelection() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return null;
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex aspect-4/3 items-center justify-center bg-background">
          {activeUrl ? (
            // Private signed URL or local object preview; keep native img to avoid Next image proxy/auth issues.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="px-4 text-center text-sm font-medium text-muted">
              {loading ? baselinePhotoLoadingLabel : baselinePhotoEmptyLabel}
            </span>
          )}
        </div>
        <div className="space-y-2 border-t border-border p-3">
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleChange}
            className="block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy file:me-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          {previewUrl ? (
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm font-semibold text-danger transition hover:text-danger/80"
            >
              {baselinePhotoRemoveSelectionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FileField({
  dictionary,
  vehicle,
  error,
}: {
  dictionary: FleetDictionary;
  vehicle: FleetVehicle | null;
  error?: string;
}) {
  return (
    <DocumentFileField
      id="operatingCardFile"
      name="operatingCardFile"
      label={dictionary.operatingCardFile}
      help={dictionary.fileHelp}
      currentFile={
        vehicle?.operatingCardFileName
          ? {
              fileName: vehicle.operatingCardFileName,
              path: vehicle.operatingCardFilePath,
              mimeType: vehicle.operatingCardMimeType,
            }
          : null
      }
      currentLabel={dictionary.currentFile}
      selectedLabel={dictionary.chooseFile}
      noFileSelectedLabel={dictionary.chooseFile}
      removeSelectedLabel={dictionary.removeSelectedFile}
      downloadLabel={dictionary.download}
      error={error}
    />
  );
}

function MultiDriverPicker({
  dictionary,
  locale,
  initialDrivers,
}: {
  dictionary: FleetDictionary;
  locale: Locale;
  initialDrivers: FleetDriverOption[];
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<FleetDriverOption[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState(initialDrivers);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedIds = new Set(selectedDrivers.map((driver) => driver.id));
  const availableOptions = options.filter((driver) => !selectedIds.has(driver.id));
  const label = locale === "ar" ? "المندوبون المعينون" : "Assigned drivers";
  const removeLabel = locale === "ar" ? "إزالة المندوب" : "Remove driver";
  const keetaLabel = locale === "ar" ? "كيتا" : "Keeta";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }

    const handler = setTimeout(() => {
      startTransition(async () => {
        setOptions(await searchGlobalDriversAction(query));
      });
    }, 300);

    return () => clearTimeout(handler);
  }, [query]);

  return (
    <div ref={wrapperRef} className="relative space-y-3">
      {selectedDrivers.map((driver) => (
        <input key={driver.id} type="hidden" name="assignedDriverIds" value={driver.id} />
      ))}

      <label htmlFor="fleetAssignedDriversQuery" className="block text-sm font-semibold text-navy">
        {label}
      </label>

      {selectedDrivers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedDrivers.map((driver) => (
            <span
              key={driver.id}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-navy"
            >
              <span className="min-w-0">
                <span className="block truncate">{driver.fullName}</span>
                {driver.organizationName ? (
                  <span className="block truncate text-xs font-medium text-muted">
                    {driver.organizationName}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                title={`${removeLabel}: ${driver.fullName}`}
                aria-label={`${removeLabel}: ${driver.fullName}`}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  setSelectedDrivers((current) => current.filter((item) => item.id !== driver.id));
                }}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          id="fleetAssignedDriversQuery"
          type="search"
          value={query}
          placeholder={dictionary.searchDriverPlaceholder}
          autoComplete="off"
          className="min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-sm text-navy outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:bg-background disabled:text-muted"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {isPending ? (
          <span className="absolute start-3 top-1/2 size-3 -translate-y-1/2 animate-pulse rounded-full bg-primary" />
        ) : null}
      </div>

      {open && query.trim().length >= 2 ? (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-[0_16px_45px_rgba(16,35,63,0.06)]">
          {availableOptions.length === 0 && !isPending ? (
            <li className="px-4 py-2 text-muted">{dictionary.notAvailable}</li>
          ) : (
            availableOptions.map((driver) => (
              <li key={driver.id}>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-start text-navy hover:bg-slate-50"
                  onClick={() => {
                    setSelectedDrivers((current) =>
                      current.some((item) => item.id === driver.id) ? current : [...current, driver],
                    );
                    setQuery("");
                    setOptions([]);
                    setOpen(false);
                  }}
                >
                  <span className="block font-semibold">{driver.fullName}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {driver.organizationName ?? driver.organizationCode ?? dictionary.notAvailable}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted" dir="ltr">
                    {keetaLabel}: {driver.keetaDriverId ?? dictionary.notAvailable}
                    {driver.mobileNumber ? ` • ${driver.mobileNumber}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function RegistrationFileField({
  dictionary,
  vehicle,
  error,
}: {
  dictionary: FleetDictionary;
  vehicle: FleetVehicle | null;
  error?: string;
}) {
  return (
    <DocumentFileField
      id="registrationFile"
      name="registrationFile"
      label={dictionary.registrationFile ?? "رخصة السير"}
      help={dictionary.fileHelp}
      currentFile={
        vehicle?.registrationFileName
          ? {
              fileName: vehicle.registrationFileName,
              path: vehicle.registrationFilePath,
              mimeType: vehicle.registrationMimeType,
            }
          : null
      }
      currentLabel={dictionary.currentFile}
      selectedLabel={dictionary.chooseFile}
      noFileSelectedLabel={dictionary.chooseFile}
      removeSelectedLabel={dictionary.removeSelectedFile}
      downloadLabel={dictionary.download}
      error={error}
    />
  );
}

function DocumentFileField({
  id,
  name,
  label,
  help,
  currentFile,
  currentLabel,
  selectedLabel,
  noFileSelectedLabel,
  removeSelectedLabel,
  downloadLabel,
  error,
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  currentFile: {
    fileName: string;
    path: string | null;
    mimeType: string | null;
  } | null;
  currentLabel: string;
  selectedLabel: string;
  noFileSelectedLabel: string;
  removeSelectedLabel: string;
  downloadLabel: string;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<{
    fileName: string;
    previewUrl: string | null;
  } | null>(null);
  const [preview, setPreview] = useState<{ fileName: string; url: string } | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailPending, setThumbnailPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [signingAction, setSigningAction] = useState<"preview" | "download" | null>(null);
  const errorId = error ? `${id}-error` : undefined;
  const currentFileIsImage = isPreviewableImageMimeType(currentFile?.mimeType);

  useEffect(() => {
    return () => {
      if (selectedFile?.previewUrl) {
        URL.revokeObjectURL(selectedFile.previewUrl);
      }
    };
  }, [selectedFile]);

  useEffect(() => {
    let active = true;

    async function loadThumbnail() {
      if (!currentFileIsImage || !currentFile?.path) {
        setThumbnailUrl(null);
        setThumbnailPending(false);
        return;
      }

      setThumbnailPending(true);
      const formData = new FormData();
      formData.set("path", currentFile.path);
      const url = await getGlobalFleetDocumentPreviewUrlAction(formData);

      if (!active) return;
      setThumbnailUrl(url);
      setThumbnailPending(false);
    }

    loadThumbnail();

    return () => {
      active = false;
    };
  }, [currentFile?.path, currentFileIsImage]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile((previousFile) => {
      if (previousFile?.previewUrl) {
        URL.revokeObjectURL(previousFile.previewUrl);
      }

      if (!file) return null;

      return {
        fileName: file.name,
        previewUrl: isPreviewableImageMimeType(file.type) ? URL.createObjectURL(file) : null,
      };
    });
  }

  function clearSelectedFile() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    setSelectedFile((previousFile) => {
      if (previousFile?.previewUrl) {
        URL.revokeObjectURL(previousFile.previewUrl);
      }

      return null;
    });
  }

  async function signPreviewUrl(path: string | null | undefined) {
    if (!path) return null;
    const formData = new FormData();
    formData.set("path", path);
    return getGlobalFleetDocumentPreviewUrlAction(formData);
  }

  async function openSavedPreview() {
    if (!currentFile?.path) return;

    setPreviewError(null);
    setSigningAction("preview");
    const url = await signPreviewUrl(currentFile.path);
    setSigningAction(null);

    if (!url) {
      setPreviewError(documentPreviewErrorLabel);
      return;
    }

    if (currentFileIsImage) {
      setPreview({ fileName: currentFile.fileName, url });
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function downloadSavedFile() {
    if (!currentFile?.path) return;

    setPreviewError(null);
    setSigningAction("download");
    const formData = new FormData();
    formData.set("path", currentFile.path);
    formData.set("fileName", currentFile.fileName);
    const url = await getFleetDownloadUrlAction(formData);
    setSigningAction(null);

    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    setPreviewError(documentPreviewErrorLabel);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>

      {currentFile ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-muted">{currentLabel}</p>
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-white p-3">
            {currentFileIsImage && currentFile.path ? (
              <button
                type="button"
                onClick={openSavedPreview}
                className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background text-xs font-bold text-muted transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
              >
                {thumbnailUrl ? (
                  // Signed image thumbnail for the document field currently open in the edit dialog.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrl}
                    alt={currentFile.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : thumbnailPending || signingAction === "preview" ? (
                  documentPreviewLoadingLabel
                ) : (
                  documentPreviewLabel
                )}
              </button>
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-bold text-muted">
                {pdfFileLabel}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy" dir="auto" title={currentFile.fileName}>
                {currentFile.fileName}
              </p>
              {previewError ? (
                <p className="mt-1 text-xs font-semibold text-danger">{previewError}</p>
              ) : null}
            </div>
            {currentFile.path ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openSavedPreview}
                  disabled={signingAction !== null}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {signingAction === "preview" ? documentPreviewLoadingLabel : documentPreviewLabel}
                </button>
                <button
                  type="button"
                  onClick={downloadSavedFile}
                  disabled={signingAction !== null}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <DownloadIcon />
                  {signingAction === "download" ? documentPreviewLoadingLabel : downloadLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedFile ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase text-muted">{selectedLabel}</p>
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-white p-3">
            {selectedFile.previewUrl ? (
              // Local object URL for an unsaved user-selected image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedFile.previewUrl}
                alt={selectedFile.fileName}
                className="size-16 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-sm font-bold text-muted">
                {pdfFileLabel}
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-navy" dir="auto" title={selectedFile.fileName}>
              {selectedFile.fileName}
            </p>
            <button
              type="button"
              onClick={clearSelectedFile}
              className="shrink-0 text-sm font-semibold text-danger transition hover:text-danger/80"
            >
              {removeSelectedLabel}
            </button>
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={acceptedFleetDocumentTypes}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        onChange={handleFileChange}
        className={`block w-full rounded-xl border bg-white px-4 py-3 text-sm text-navy file:me-4 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary focus:outline-none focus:ring-4 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/10"
            : "border-border focus:border-primary focus:ring-primary/10"
        }`}
      />
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted">
        {selectedFile?.fileName || noFileSelectedLabel} · {help}
      </p>

      {preview ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <p className="min-w-0 truncate text-sm font-bold text-navy" dir="auto" title={preview.fileName}>
                {preview.fileName}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
              >
                {documentPreviewCloseLabel}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-4">
              {/* Signed image preview; avoid Next image optimization for private expiring URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.fileName}
                className="max-h-[75vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isPreviewableImageMimeType(mimeType: string | null | undefined) {
  return mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp";
}

function getVehicleDialogTitle(
  dictionary: FleetDictionary,
  category: FleetVehicleCategory,
  editing: boolean,
) {
  if (category === "car") {
    return editing ? dictionary.editCarTitle : dictionary.addCarTitle;
  }

  return editing ? dictionary.editMotorcycleTitle : dictionary.addMotorcycleTitle;
}

function getDriverOptionLabel(driver: FleetDriverOption) {
  let label = `${driver.fullName} - ${driver.iqamaNumber}`;
  if (driver.organizationName) label += ` (${driver.organizationName})`;
  return label;
}

function getOwnershipTypeLabel(type: FleetOwnershipType | null) {
  if (!type) return unclassifiedOwnershipLabel;
  return ownershipTypeOptions.find((option) => option.value === type)?.label ?? unclassifiedOwnershipLabel;
}

function getOwnershipDisplayName(vehicle: FleetVehicle, dictionary: FleetDictionary) {
  if (vehicle.ownershipType === "driver_owned") {
    return vehicle.ownerDriverName ?? dictionary.notAvailable;
  }

  return vehicle.currentOwnerName ?? vehicle.ownerName ?? dictionary.notAvailable;
}

function renderOptions(options: Record<string, string>) {
  return Object.entries(options).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function VehicleSectionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M4 14h16l-1.6-4.6A2 2 0 0 0 16.5 8h-9a2 2 0 0 0-1.9 1.4L4 14Zm2 0v3m12-3v3M7 17h.1M17 17h.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h4l2-6 3 12 2-6h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ConditionIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v4m0 10v4M4.8 6.8l2.8 2.8m8.8 8.8 2.8 2.8M3 12h4m10 0h4M4.8 17.2l2.8-2.8m8.8-8.8 2.8-2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function SuspendIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M8 6v12M16 6v12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function ReactivateIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M8 5v14l11-7L8 5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M6 7v12h12V7M9 11h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 20h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-700";
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function getErrorMessage(dictionary: FleetDictionary, code: string | undefined) {
  if (!code || !(code in dictionary.errors)) {
    return dictionary.errors.save_failed;
  }

  return dictionary.errors[code as keyof FleetDictionary["errors"]];
}

function getRowClassName(vehicle: FleetVehicle, remaining: number | null) {
  if (vehicle.archivedAt) return "bg-slate-50 text-muted";
  if (vehicle.technicalStatus === "accident") return "bg-red-50/70";
  if (vehicle.technicalStatus === "fault") return "bg-amber-50/70";
  if (remaining !== null && remaining < 0) return "bg-red-50/70";
  if (remaining !== null && remaining <= 10) return "bg-amber-50/70";
  return "bg-surface";
}

function getRemainingDays(expiryDate: string | null, today: string) {
  if (!expiryDate) return null;
  const expiry = new Date(`${expiryDate}T00:00:00Z`).getTime();
  const current = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(expiry) || !Number.isFinite(current)) return null;
  return Math.ceil((expiry - current) / 86_400_000);
}

function formatRemainingDays(days: number | null, dictionary: FleetDictionary) {
  if (days === null) return dictionary.notAvailable;
  if (days === 0) return dictionary.expiresToday;
  if (days < 0) return dictionary.daysExpired.replace("{days}", String(Math.abs(days)));
  return dictionary.daysRemaining.replace("{days}", String(days));
}

function remainingBadgeClassName(days: number | null) {
  if (days === null) return "whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted";
  if (days < 0) return "whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700";
  if (days <= 10) return "whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800";
  return "whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700";
}

function formatDate(value: string | null) {
  return value || "-";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function PaginationControls({
  pagination,
}: {
  pagination?: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  if (!pagination) return null;

  const from = pagination.totalRows === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.page * pagination.pageSize, pagination.totalRows);

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className={`mt-4 flex flex-col gap-3 text-sm font-semibold text-muted transition-opacity sm:flex-row sm:items-center sm:justify-between ${isPending ? "opacity-70" : ""}`}>
      <div className="space-y-1">
        <p>إجمالي {pagination.totalRows.toLocaleString("ar-SA")} مركبة</p>
        <p>
          عرض {from.toLocaleString("ar-SA")} إلى {to.toLocaleString("ar-SA")} من أصل {pagination.totalRows.toLocaleString("ar-SA")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {pagination.page > 1 ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => goToPage(pagination.page - 1)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-navy transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
          >
            السابق
          </button>
        ) : (
          <span className="rounded-lg border border-border bg-surface px-3 py-2 opacity-45">
            السابق
          </span>
        )}
        <span className="whitespace-nowrap px-2">
          الصفحة {pagination.page.toLocaleString("ar-SA")} من {pagination.totalPages.toLocaleString("ar-SA")}
        </span>
        {pagination.page < pagination.totalPages ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => goToPage(pagination.page + 1)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-navy transition hover:border-primary/40 hover:text-primary disabled:opacity-60"
          >
            التالي
          </button>
        ) : (
          <span className="rounded-lg border border-border bg-surface px-3 py-2 opacity-45">
            التالي
          </span>
        )}
      </div>
    </div>
  );
}
