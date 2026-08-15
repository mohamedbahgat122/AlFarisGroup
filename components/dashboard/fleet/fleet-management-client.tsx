"use client";

import { useActionState, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createFleetVehicleAction,
  getFleetActivityLogsAction,
  getFleetDownloadUrlAction,
  setFleetArchiveStatusAction,
  setFleetOperationalStatusAction,
  updateFleetTechnicalStatusAction,
  updateFleetVehicleAction,
} from "@/features/fleet/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  DialogActions,
  EntityContent,
  EntityEmptyState,
  EntityFormBody,
  EntityFormDialog,
  EntityPageHeader,
  FormSection,
  ReadOnlyField,
  RowActionButton,
  SecureFileField,
  SelectField,
  TextAreaField,
} from "@/components/dashboard/entity-management-ui";
import { initialFleetActionState } from "@/features/fleet/types";
import type {
  FleetActivityLog,
  FleetDriverOption,
  FleetVehicle,
  FleetVehicleCategory,
} from "@/features/fleet/types";
import type { AccessibleOrganization } from "@/features/organizations/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type FleetDictionary = Dictionary["dashboard"]["fleet"];

type FleetCardFilters = {
  plate: string;
  driver: string;
  authorization: "all" | "authorized" | "missing";
  linkedDriver: "all" | "linked" | "missing";
  vehicleType: string;
};

type FleetManagementClientProps = {
  locale: Locale;
  dictionary: FleetDictionary;
  organization: AccessibleOrganization;
  category: FleetVehicleCategory;
  vehicles: FleetVehicle[];
  drivers: FleetDriverOption[];
  today: string;
  includeArchived: boolean;
};

export function FleetManagementClient({
  locale,
  dictionary,
  organization,
  category,
  vehicles,
  drivers,
  today,
  includeArchived,
}: FleetManagementClientProps) {
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [conditionVehicle, setConditionVehicle] = useState<FleetVehicle | null>(null);
  const [activityVehicle, setActivityVehicle] = useState<FleetVehicle | null>(null);
  const [activityLogs, setActivityLogs] = useState<FleetActivityLog[]>([]);
  const [isActivityPending, startActivityTransition] = useTransition();
  const permissions = new Set(organization.permissionKeys);
  const actionPermissions = {
    create:
      permissions.has("fleet.create") &&
      permissions.has(category === "car" ? "fleet.cars.view" : "fleet.motorcycles.view"),
    update: permissions.has("fleet.update"),
    technicalStatus: permissions.has("fleet.technical_status"),
    operationalStatus: permissions.has("fleet.operational_status"),
    archive: permissions.has("fleet.archive"),
    downloadOperatingCard: permissions.has("fleet.operating_card.download"),
    activity: permissions.has("fleet.activity.view"),
  };
  const title = category === "car" ? dictionary.carsTitle : dictionary.motorcyclesTitle;
  const uiText = getFleetCardUiText(locale);
  const [filters, setFilters] = useState<FleetCardFilters>({
    plate: "",
    driver: "",
    authorization: "all",
    linkedDriver: "all",
    vehicleType: "",
  });
  const vehicleTypeOptions = useMemo(
    () => Array.from(new Set(vehicles.map((vehicle) => vehicle.vehicleType).filter(Boolean))).sort(),
    [vehicles],
  );
  const filteredVehicles = useMemo(
    () => vehicles.filter((vehicle) => matchesFleetCardFilters(vehicle, filters)),
    [filters, vehicles],
  );
  const summary = useMemo(() => getFleetCardSummary(filteredVehicles), [filteredVehicles]);

  function openCreate() {
    setEditingVehicle(null);
    setShowForm(true);
  }

  function openEdit(vehicle: FleetVehicle) {
    setEditingVehicle(vehicle);
    setShowForm(true);
  }

  function openActivity(vehicle: FleetVehicle) {
    setActivityVehicle(vehicle);
    setActivityLogs([]);
    const formData = new FormData();
    formData.set("organizationId", organization.id);
    formData.set("vehicleId", vehicle.id);
    startActivityTransition(async () => {
      setActivityLogs(await getFleetActivityLogsAction(formData));
    });
  }

  return (
    <>
      <EntityPageHeader
        eyebrow={organization.name}
        title={title}
        description={dictionary.description}
        viewOnlyLabel={actionPermissions.create ? undefined : dictionary.viewOnly}
        secondaryAction={
          <a
            href={`?archived=${includeArchived ? "false" : "true"}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {includeArchived ? dictionary.hideArchived : dictionary.showArchived}
          </a>
        }
        primaryAction={
          actionPermissions.create ? (
            <Button
              type="button"
              onClick={openCreate}
              className="w-full gap-2 sm:w-auto"
            >
              <PlusIcon />
              {dictionary.addVehicle}
            </Button>
          ) : null
        }
      />

      <EntityContent>
        <FleetCardsSummary
          dictionary={dictionary}
          summary={summary}
          total={filteredVehicles.length}
          uiText={uiText}
        />

        <FleetCardsFilterBar
          dictionary={dictionary}
          filters={filters}
          vehicleTypeOptions={vehicleTypeOptions}
          uiText={uiText}
          onChange={setFilters}
          onReset={() =>
            setFilters({
              plate: "",
              driver: "",
              authorization: "all",
              linkedDriver: "all",
              vehicleType: "",
            })
          }
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
        ) : filteredVehicles.length === 0 ? (
          <EntityEmptyState
            icon={<VehicleSectionIcon />}
            title={uiText.noResultsTitle}
            description={uiText.noResultsDescription}
            action={
              <Button
                type="button"
                className="border border-border bg-surface text-navy shadow-none hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
                onClick={() =>
                  setFilters({
                    plate: "",
                    driver: "",
                    authorization: "all",
                    linkedDriver: "all",
                    vehicleType: "",
                  })
                }
              >
                {dictionary.resetFilters}
              </Button>
            }
          />
        ) : (
          <>
            <p className="mb-3 text-sm font-medium text-muted">
              {uiText.resultsCount
                .replace("{shown}", filteredVehicles.length.toLocaleString())
                .replace("{total}", vehicles.length.toLocaleString())}
            </p>
            <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2">
              {filteredVehicles.map((vehicle) => (
                <FleetVehicleCard
                  key={vehicle.id}
                  locale={locale}
                  dictionary={dictionary}
                  uiText={uiText}
                  organization={organization}
                  vehicle={vehicle}
                  today={today}
                  permissions={actionPermissions}
                  onEdit={openEdit}
                  onCondition={setConditionVehicle}
                  onActivity={openActivity}
                />
              ))}
            </div>
          </>
        )}
      </EntityContent>

      {showForm ? (
        <VehicleDialog
          locale={locale}
          dictionary={dictionary}
          organizationCode={organization.code}
          organizationName={organization.name}
          category={category}
          drivers={drivers}
          vehicle={editingVehicle}
          onClose={() => setShowForm(false)}
        />
      ) : null}

      {conditionVehicle ? (
        <ConditionDialog
          locale={locale}
          dictionary={dictionary}
          organizationCode={organization.code}
          vehicle={conditionVehicle}
          onClose={() => setConditionVehicle(null)}
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

function FleetCardsSummary({
  dictionary,
  summary,
  total,
  uiText,
}: {
  dictionary: FleetDictionary;
  summary: ReturnType<typeof getFleetCardSummary>;
  total: number;
  uiText: ReturnType<typeof getFleetCardUiText>;
}) {
  const cards = [
    {
      label: dictionary.summaryTotal,
      value: total,
      description: uiText.activeResultSet,
      icon: <VehicleSectionIcon />,
      tone: "border-primary/15 bg-primary-soft text-primary",
    },
    {
      label: uiText.linkedVehicles,
      value: summary.linked,
      description: formatPercent(summary.linked, total),
      icon: <DriverLinkIcon />,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    {
      label: uiText.authorizedVehicles,
      value: summary.authorized,
      description: formatPercent(summary.authorized, total),
      icon: <AuthorizedIcon />,
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    },
    {
      label: uiText.withoutDriver,
      value: summary.withoutDriver,
      description: formatPercent(summary.withoutDriver, total),
      icon: <WarningIcon />,
      tone: "border-amber-200 bg-amber-50 text-amber-800",
    },
    {
      label: uiText.withoutAuthorized,
      value: summary.withoutAuthorized,
      description: formatPercent(summary.withoutAuthorized, total),
      icon: <AlertIcon />,
      tone: "border-red-200 bg-red-50 text-red-700",
    },
  ];

  return (
    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border bg-surface p-4 shadow-[0_14px_35px_rgba(16,35,63,0.04)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className={`flex size-12 shrink-0 items-center justify-center rounded-full border ${card.tone}`}>
              {card.icon}
            </div>
            <div className="min-w-0 text-end">
              <p className="text-sm font-medium leading-6 text-muted">{card.label}</p>
              <p className="mt-2 text-3xl font-bold leading-none text-navy" dir="ltr">
                {card.value.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs font-medium leading-5 text-muted">{card.description}</p>
        </div>
      ))}
    </div>
  );
}

function FleetCardsFilterBar({
  dictionary,
  filters,
  vehicleTypeOptions,
  uiText,
  onChange,
  onReset,
}: {
  dictionary: FleetDictionary;
  filters: FleetCardFilters;
  vehicleTypeOptions: string[];
  uiText: ReturnType<typeof getFleetCardUiText>;
  onChange: (filters: FleetCardFilters) => void;
  onReset: () => void;
}) {
  function patch(next: Partial<FleetCardFilters>) {
    onChange({ ...filters, ...next });
  }

  return (
    <section className="mb-5 rounded-xl border border-border bg-surface p-4 shadow-[0_14px_35px_rgba(16,35,63,0.04)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-navy">{uiText.searchAndFilters}</h2>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-primary transition hover:border-primary/35 hover:bg-primary-soft focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <ResetIcon />
          {dictionary.resetFilters}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(240px,1fr)_repeat(3,minmax(170px,210px))]">
        <FormField
          id="fleetCardPlateSearch"
          label={uiText.plateSearch}
          name="fleetCardPlateSearch"
          value={filters.plate}
          onChange={(event) => patch({ plate: event.target.value })}
          placeholder={uiText.plateSearchPlaceholder}
          dir="ltr"
          autoComplete="off"
        />
        <FormField
          id="fleetCardDriverSearch"
          label={uiText.driverSearch}
          name="fleetCardDriverSearch"
          value={filters.driver}
          onChange={(event) => patch({ driver: event.target.value })}
          placeholder={uiText.driverSearchPlaceholder}
          autoComplete="off"
        />
        <FilterSelect
          id="fleetCardAuthorizationFilter"
          label={uiText.authorizationFilter}
          value={filters.authorization}
          onChange={(value) => patch({ authorization: value as FleetCardFilters["authorization"] })}
        >
          <option value="all">{dictionary.all}</option>
          <option value="authorized">{uiText.hasAuthorized}</option>
          <option value="missing">{uiText.noAuthorized}</option>
        </FilterSelect>
        <FilterSelect
          id="fleetCardLinkedDriverFilter"
          label={uiText.linkedDriverFilter}
          value={filters.linkedDriver}
          onChange={(value) => patch({ linkedDriver: value as FleetCardFilters["linkedDriver"] })}
        >
          <option value="all">{dictionary.all}</option>
          <option value="linked">{uiText.hasLinkedDriver}</option>
          <option value="missing">{uiText.noLinkedDriver}</option>
        </FilterSelect>
        <FilterSelect
          id="fleetCardVehicleTypeFilter"
          label={dictionary.vehicleType}
          value={filters.vehicleType}
          onChange={(value) => patch({ vehicleType: value })}
        >
          <option value="">{dictionary.all}</option>
          {vehicleTypeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </FilterSelect>
      </div>
    </section>
  );
}

function FleetVehicleCard({
  locale,
  dictionary,
  uiText,
  organization,
  vehicle,
  today,
  permissions,
  onEdit,
  onCondition,
  onActivity,
}: {
  locale: Locale;
  dictionary: FleetDictionary;
  uiText: ReturnType<typeof getFleetCardUiText>;
  organization: AccessibleOrganization;
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
  const cardClassName = getCardClassName(vehicle, remaining);
  const owner = vehicle.ownerSource === "organization" ? organization.name : vehicle.ownerName;
  const authorized = hasAuthorizedPerson(vehicle);

  return (
    <article className={`min-w-0 overflow-hidden rounded-xl border bg-surface shadow-[0_18px_45px_rgba(16,35,63,0.05)] ${cardClassName}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-white px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-muted">{vehicle.vehicleType}</p>
            {vehicle.archivedAt ? (
              <StatusBadge label={dictionary.summaryArchived} tone="warning" />
            ) : (
              <StatusBadge
                label={dictionary.technicalStatuses[vehicle.technicalStatus]}
                tone={vehicle.technicalStatus === "healthy" ? "success" : vehicle.technicalStatus === "fault" ? "warning" : "danger"}
              />
            )}
          </div>
          <p className="mt-2 text-2xl font-bold leading-none text-navy" dir="ltr">
            {vehicle.plateNumber}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <FleetCardActions
            locale={locale}
            organizationCode={organization.code}
            dictionary={dictionary}
            vehicle={vehicle}
            permissions={permissions}
            onEdit={onEdit}
            onCondition={onCondition}
            onActivity={onActivity}
          />
        </div>
      </div>

      <div className="min-w-0 overflow-hidden">
        <div
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="overflow-x-auto overscroll-x-contain pb-2 [scrollbar-color:rgba(11,108,251,0.35)_rgba(226,232,240,0.75)] [scrollbar-width:thin]"
        >
          <div className="min-w-[1040px]">
            <div className="grid gap-px bg-border [grid-template-columns:minmax(190px,1.25fr)_minmax(230px,1.55fr)_minmax(210px,1.35fr)_minmax(110px,0.7fr)]">
              <CardInfoCell label={uiText.primaryAssignedDriver} spacious>
                <DriverCell
                  name={vehicle.assignedDriverName ?? dictionary.notAssigned}
                  iqama={vehicle.assignedDriverIqama}
                />
              </CardInfoCell>
              <CardInfoCell label={uiText.linkedDrivers} spacious>
                <LinkedDriversBadgeList drivers={vehicle.linkedDrivers} emptyLabel={uiText.noLinkedDriver} />
              </CardInfoCell>
              <CardInfoCell label={dictionary.authorizedPersonSection} spacious>
                {authorized ? (
                  <div className="space-y-1">
                    <DriverCell
                      name={vehicle.authorizedPersonName ?? dictionary.notAssigned}
                      iqama={vehicle.authorizedPersonIqama}
                    />
                    <span className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                      {uiText.assigned}
                    </span>
                  </div>
                ) : (
                  <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                    {dictionary.notAssigned}
                  </span>
                )}
              </CardInfoCell>
              <CardInfoCell label={dictionary.vehicleType}>
                <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <VehicleSectionIcon />
                  <span className="whitespace-nowrap">{dictionary.categoryLabels[vehicle.category]}</span>
                </div>
              </CardInfoCell>
            </div>

            <div className="grid gap-px bg-border [grid-template-columns:minmax(150px,0.9fr)_minmax(175px,1fr)_minmax(215px,1.25fr)_minmax(120px,0.75fr)_minmax(170px,0.95fr)]">
              <CardInfoCell label={dictionary.operatingCardNumber} dir="ltr">
                <span className="whitespace-nowrap">{vehicle.operatingCardNumber || dictionary.notAvailable}</span>
              </CardInfoCell>
              <CardInfoCell label={dictionary.operatingCardExpiryDate} compact>
                <DateLine value={formatDate(vehicle.operatingCardExpiryDate)} />
              </CardInfoCell>
              <CardInfoCell label={dictionary.authorizationExpiryDate} compact>
                <ExpiryValue
                  date={formatDate(vehicle.authorizationExpiryDate)}
                  remainingLabel={formatRemainingDays(remaining, dictionary)}
                  remaining={remaining}
                />
              </CardInfoCell>
              <CardInfoCell label={dictionary.operationalStatusFilter}>
                <StatusBadge
                  label={dictionary.operationalStatuses[vehicle.operationalStatus]}
                  tone={vehicle.operationalStatus === "active" ? "success" : "warning"}
                />
              </CardInfoCell>
              <CardInfoCell label={dictionary.ownerSection}>
                <span className="whitespace-nowrap" title={owner || dictionary.notAvailable}>{owner || dictionary.notAvailable}</span>
              </CardInfoCell>
            </div>
          </div>
        </div>
      </div>
    </article>
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

function FleetCardActions({
  locale,
  organizationCode,
  dictionary,
  vehicle,
  permissions,
  onEdit,
  onCondition,
  onActivity,
}: {
  locale: Locale;
  organizationCode: string;
  dictionary: FleetDictionary;
  vehicle: FleetVehicle;
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
  return (
    <>
      {vehicle.operatingCardFilePath && permissions.downloadOperatingCard ? (
        <DownloadButton
          dictionary={dictionary}
          path={vehicle.operatingCardFilePath}
          fileName={vehicle.operatingCardFileName ?? "operating-card"}
        />
      ) : null}
      {permissions.activity ? (
        <RowActionButton label={dictionary.activity} onClick={() => onActivity(vehicle)}>
          <ActivityIcon />
        </RowActionButton>
      ) : null}
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
      {permissions.operationalStatus || permissions.archive ? (
        <LifecycleForm
          locale={locale}
          organizationCode={organizationCode}
          vehicle={vehicle}
          dictionary={dictionary}
          permissions={permissions}
        />
      ) : null}
    </>
  );
}

function CardInfoCell({
  label,
  children,
  dir,
  compact = false,
  spacious = false,
}: {
  label: string;
  children: ReactNode;
  dir?: "ltr" | "rtl";
  compact?: boolean;
  spacious?: boolean;
}) {
  return (
    <div
      className={`min-w-0 bg-surface px-4 py-3.5 ${spacious ? "min-h-[112px]" : "min-h-[92px]"} ${compact ? "py-3" : ""}`}
      dir={dir}
    >
      <p className="mb-2 truncate text-[11px] font-semibold leading-5 text-muted" title={label}>
        {label}
      </p>
      <div className="min-w-0 text-sm font-semibold leading-6 text-navy">{children}</div>
    </div>
  );
}

function DateLine({ value }: { value: string }) {
  return (
    <span className="block whitespace-nowrap text-sm font-semibold leading-5 text-navy" dir="ltr">
      {value}
    </span>
  );
}

function ExpiryValue({
  date,
  remainingLabel,
  remaining,
}: {
  date: string;
  remainingLabel: string;
  remaining: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <DateLine value={date} />
      <span className={remainingBadgeClassName(remaining)}>
        {remainingLabel}
      </span>
    </div>
  );
}

function LinkedDriversBadgeList({
  drivers,
  emptyLabel,
}: {
  drivers: FleetVehicle["linkedDrivers"];
  emptyLabel: string;
}) {
  if (drivers.length === 0) {
    return (
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
        {emptyLabel}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {drivers.slice(0, 1).map((driver) => (
        <span
          key={driver.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold leading-5 text-emerald-700"
          title={`${driver.fullName}${driver.iqamaNumber ? ` - ${driver.iqamaNumber}` : ""}`}
        >
          <span className="whitespace-normal break-words">{driver.fullName}</span>
          {driver.iqamaNumber ? (
            <span className="whitespace-nowrap text-emerald-700/75" dir="ltr">
              {driver.iqamaNumber}
            </span>
          ) : null}
        </span>
      ))}
      {drivers.length > 1 ? (
        <span
          className="inline-flex shrink-0 items-center rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-bold leading-5 text-primary"
          title={drivers.slice(1).map((driver) => driver.fullName).join(", ")}
        >
          +{drivers.length - 1}
        </span>
      ) : null}
    </div>
  );
}

function DriverCell({ name, iqama }: { name: string; iqama?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-normal break-words text-sm font-semibold leading-6 text-navy" title={name}>
        {name}
      </div>
      {iqama ? (
        <div className="whitespace-nowrap text-xs text-muted" dir="ltr">
          {iqama}
        </div>
      ) : null}
    </div>
  );
}

function LinkedDriversSection({
  locale,
  drivers,
  emptyLabel,
}: {
  locale: Locale;
  drivers: FleetVehicle["linkedDrivers"];
  emptyLabel: string;
}) {
  const title =
    locale === "ar" ? "المناديب المرتبطون بالمركبة" : "Drivers linked to this vehicle";

  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      {drivers.length > 0 ? (
        <div className="mt-3 space-y-2">
          {drivers.map((driver) => (
            <DriverCell
              key={driver.id}
              name={driver.fullName}
              iqama={driver.iqamaNumber}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium text-muted">{emptyLabel}</p>
      )}
    </section>
  );
}

function VehicleDialog({
  locale,
  dictionary,
  organizationCode,
  organizationName,
  category,
  drivers,
  vehicle,
  onClose,
}: {
  locale: Locale;
  dictionary: FleetDictionary;
  organizationCode: string;
  organizationName: string;
  category: FleetVehicleCategory;
  drivers: FleetDriverOption[];
  vehicle: FleetVehicle | null;
  onClose: () => void;
}) {
  const action = vehicle ? updateFleetVehicleAction : createFleetVehicleAction;
  const [state, formAction] = useActionState(action, initialFleetActionState);
  const [ownerSource, setOwnerSource] = useState(vehicle?.ownerSource ?? "organization");
  const [assignedDriverSource, setAssignedDriverSource] = useState(vehicle?.assignedDriverSource ?? "none");
  const [authorizedPersonSource, setAuthorizedPersonSource] = useState(vehicle?.authorizedPersonSource ?? "none");
  const title = getVehicleDialogTitle(dictionary, category, Boolean(vehicle));
  const submitLabel = vehicle ? dictionary.saveChanges : dictionary.saveVehicle;

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
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="vehicleCategory" value={category} />
        <input type="hidden" name="vehicleId" value={vehicle?.id ?? ""} />
        <input type="hidden" name="technicalStatus" value={vehicle?.technicalStatus ?? "healthy"} />
        <input type="hidden" name="faultLocation" value={vehicle?.faultLocation ?? ""} />
        <input type="hidden" name="technicalStatusNote" value={vehicle?.technicalStatusNote ?? ""} />

        <EntityFormBody>
          {state.status === "success" ? (
            <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {dictionary.success}
            </p>
          ) : null}
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
            </FormSection>

            <FormSection title={dictionary.ownerSection}>
              <SelectField
                id="fleetOwnerSource"
                label={dictionary.ownerSource}
                name="ownerSource"
                value={ownerSource}
                onChange={(value) =>
                  setOwnerSource(value === "manual" ? "manual" : "organization")
                }
              >
                {renderOptions(dictionary.ownerSources)}
              </SelectField>
              {ownerSource === "organization" ? (
                <ReadOnlyField label={dictionary.currentOrganizationOwner} value={organizationName} />
              ) : (
                <FormField
                  id="fleetManualOwnerName"
                  label={dictionary.manualOwnerName}
                  name="manualOwnerName"
                  defaultValue={vehicle?.manualOwnerName ?? ""}
                  error={state.fieldErrors?.manualOwnerName}
                  required
                  autoComplete="off"
                />
              )}
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
            </FormSection>

            <FormSection title={dictionary.assignedDriverSection}>
              <SelectField
                id="fleetAssignedDriverSource"
                label={dictionary.assignedDriverSource}
                name="assignedDriverSource"
                value={assignedDriverSource}
                onChange={(value) =>
                  setAssignedDriverSource(
                    value === "organization_driver" || value === "manual"
                      ? value
                      : "none",
                  )
                }
              >
                {renderOptions(dictionary.personSources)}
              </SelectField>
              {assignedDriverSource === "organization_driver" ? (
                <DriverPicker dictionary={dictionary} drivers={drivers} name="assignedDriverId" defaultValue={vehicle?.assignedDriverId ?? ""} label={dictionary.organizationDriver} />
              ) : null}
              {assignedDriverSource === "manual" ? (
                <>
                  <FormField id="fleetAssignedDriverManualName" label={dictionary.assignedDriverManualName} name="assignedDriverManualName" defaultValue={vehicle?.assignedDriverManualName ?? ""} error={state.fieldErrors?.assignedDriverManualName} required autoComplete="off" />
                  <FormField id="fleetAssignedDriverManualIqama" label={dictionary.assignedDriverManualIqama} name="assignedDriverManualIqama" defaultValue={vehicle?.assignedDriverManualIqama ?? ""} error={state.fieldErrors?.assignedDriverManualIqama} required dir="ltr" autoComplete="off" />
                </>
              ) : null}
            </FormSection>

            {vehicle ? (
              <LinkedDriversSection
                locale={locale}
                drivers={vehicle.linkedDrivers}
                emptyLabel={dictionary.notAssigned}
              />
            ) : null}

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
                <FormField id="fleetAuthorizationExpiryDate" label={dictionary.authorizationExpiryDate} name="authorizationExpiryDate" type="date" defaultValue={vehicle?.authorizationExpiryDate ?? ""} error={state.fieldErrors?.authorizationExpiryDate} />
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
  organizationCode,
  vehicle,
  onClose,
}: {
  locale: Locale;
  dictionary: FleetDictionary;
  organizationCode: string;
  vehicle: FleetVehicle;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(updateFleetTechnicalStatusAction, initialFleetActionState);

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
        <input type="hidden" name="organizationCode" value={organizationCode} />
        <input type="hidden" name="vehicleId" value={vehicle.id} />
        <EntityFormBody>
          {state.status === "success" ? (
            <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {dictionary.success}
            </p>
          ) : null}
          <FormSection title={dictionary.technicalStatus}>
            <SelectField
              id="fleetTechnicalStatus"
              label={dictionary.technicalStatus}
              name="technicalStatus"
              defaultValue={vehicle.technicalStatus}
            >
              {renderOptions(dictionary.technicalStatuses)}
            </SelectField>
            <SelectField
              id="fleetFaultLocation"
              label={dictionary.faultLocation}
              name="faultLocation"
              defaultValue={vehicle.faultLocation ?? ""}
              error={state.fieldErrors?.faultLocation}
            >
              {renderOptions({ "": dictionary.selectPlaceholder, ...dictionary.faultLocations })}
            </SelectField>
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
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {dictionary.close}
        </button>
      </div>
    </EntityFormDialog>
  );
}

function LifecycleForm({
  locale,
  organizationCode,
  vehicle,
  dictionary,
  permissions,
}: {
  locale: Locale;
  organizationCode: string;
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
        <form action={setFleetOperationalStatusAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
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
        <form action={setFleetArchiveStatusAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="organizationCode" value={organizationCode} />
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

function DownloadButton({
  dictionary,
  path,
  fileName,
}: {
  dictionary: FleetDictionary;
  path: string;
  fileName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <RowActionButton
      disabled={pending}
      label={dictionary.download}
      onClick={() => {
        const formData = new FormData();
        formData.set("path", path);
        formData.set("fileName", fileName);
        startTransition(async () => {
          const url = await getFleetDownloadUrlAction(formData);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        });
      }}
    >
      <DownloadIcon />
    </RowActionButton>
  );
}

function DriverPicker({
  dictionary,
  drivers,
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
  const initialDriver = drivers.find((driver) => driver.id === defaultValue);
  const [query, setQuery] = useState(
    initialDriver ? getDriverOptionLabel(initialDriver) : "",
  );
  const selectedDriver = useMemo(
    () => drivers.find((driver) => getDriverOptionLabel(driver) === query),
    [drivers, query],
  );

  return (
    <div>
      <input type="hidden" name={name} value={selectedDriver?.id ?? ""} />
      <FormField
        id={`${name}Query`}
        list={`${name}-fleet-drivers`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        label={label}
        placeholder={dictionary.searchDriverPlaceholder}
        required
        autoComplete="off"
      />
      <datalist id={`${name}-fleet-drivers`}>
        {drivers.map((driver) => (
          <option key={driver.id} value={getDriverOptionLabel(driver)} />
        ))}
      </datalist>
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
  const [selectedFileName, setSelectedFileName] = useState("");
  const [pending, startTransition] = useTransition();

  const currentFile =
    vehicle?.operatingCardFileName && vehicle.operatingCardFilePath
      ? {
          fileName: vehicle.operatingCardFileName,
          onDownload: () => {
            const formData = new FormData();
            formData.set("path", vehicle.operatingCardFilePath ?? "");
            formData.set("fileName", vehicle.operatingCardFileName ?? "operating-card");
            startTransition(async () => {
              const url = await getFleetDownloadUrlAction(formData);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            });
          },
        }
      : vehicle?.operatingCardFileName
        ? { fileName: vehicle.operatingCardFileName }
        : null;

  return (
    <SecureFileField
      id="operatingCardFile"
      name="operatingCardFile"
      label={dictionary.operatingCardFile}
      required={false}
      help={dictionary.fileHelp}
      selectedFileName={selectedFileName}
      currentFile={currentFile}
      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
      currentLabel={dictionary.currentFile}
      selectedLabel={dictionary.chooseFile}
      noFileSelectedLabel={pending ? dictionary.loading : dictionary.chooseFile}
      removeSelectedLabel={dictionary.removeSelectedFile}
      downloadLabel={dictionary.download}
      error={error}
      onChange={setSelectedFileName}
    />
  );
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
  return `${driver.fullName} - ${driver.iqamaNumber}`;
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

function DriverLinkIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M7.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a5 5 0 0 1 9 0m1.5-.5a4 4 0 0 1 7.5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function AuthorizedIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 9.8 4.1-1.4 7-5.4 7-9.8V6l-7-3Zm-3 9 2 2 4-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 9v4m0 4h.01M10.3 4.7 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 8v5m0 4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
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
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function getErrorMessage(dictionary: FleetDictionary, code: string | undefined) {
  if (!code || !(code in dictionary.errors)) {
    return dictionary.errors.save_failed;
  }

  return dictionary.errors[code as keyof FleetDictionary["errors"]];
}

function getCardClassName(vehicle: FleetVehicle, remaining: number | null) {
  if (vehicle.archivedAt) return "border-slate-200";
  if (vehicle.technicalStatus === "accident") return "border-red-200";
  if (vehicle.technicalStatus === "fault") return "border-amber-200";
  if (remaining !== null && remaining < 0) return "border-red-200";
  if (remaining !== null && remaining <= 10) return "border-amber-200";
  return "border-border";
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
  if (days === null) return "w-fit whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11px] font-bold leading-5 text-muted";
  if (days < 0) return "w-fit whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold leading-5 text-red-700";
  if (days <= 10) return "w-fit whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold leading-5 text-amber-800";
  return "w-fit whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold leading-5 text-emerald-700";
}

function formatDate(value: string | null) {
  return value || "-";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function getFleetCardSummary(vehicles: FleetVehicle[]) {
  return vehicles.reduce(
    (totals, vehicle) => {
      if (vehicle.linkedDrivers.length > 0) totals.linked += 1;
      if (hasAuthorizedPerson(vehicle)) totals.authorized += 1;
      if (vehicle.linkedDrivers.length === 0) totals.withoutDriver += 1;
      if (!hasAuthorizedPerson(vehicle)) totals.withoutAuthorized += 1;
      return totals;
    },
    { linked: 0, authorized: 0, withoutDriver: 0, withoutAuthorized: 0 },
  );
}

function matchesFleetCardFilters(vehicle: FleetVehicle, filters: FleetCardFilters) {
  const plateQuery = normalizeSearch(filters.plate);
  const driverQuery = normalizeSearch(filters.driver);
  const plateMatches =
    !plateQuery || normalizeSearch(vehicle.plateNumber).includes(plateQuery);
  const driverMatches =
    !driverQuery ||
    vehicle.linkedDrivers.some((driver) =>
      [driver.fullName, driver.iqamaNumber, driver.mobileNumber]
        .filter(Boolean)
        .some((value) => normalizeSearch(value).includes(driverQuery)),
    );
  const authorized = hasAuthorizedPerson(vehicle);
  const authorizationMatches =
    filters.authorization === "all" ||
    (filters.authorization === "authorized" && authorized) ||
    (filters.authorization === "missing" && !authorized);
  const linked = vehicle.linkedDrivers.length > 0;
  const linkedMatches =
    filters.linkedDriver === "all" ||
    (filters.linkedDriver === "linked" && linked) ||
    (filters.linkedDriver === "missing" && !linked);
  const typeMatches = !filters.vehicleType || vehicle.vehicleType === filters.vehicleType;

  return plateMatches && driverMatches && authorizationMatches && linkedMatches && typeMatches;
}

function hasAuthorizedPerson(vehicle: FleetVehicle) {
  return Boolean(vehicle.authorizedDriverId || vehicle.authorizedPersonName || vehicle.authorizedManualName);
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toLocaleLowerCase();
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function getFleetCardUiText(locale: Locale) {
  if (locale === "ar") {
    return {
      activeResultSet: "ضمن النتائج الحالية",
      linkedVehicles: "مركبات مرتبطة بمناديب",
      authorizedVehicles: "مركبات لها مفوض فعلي",
      withoutDriver: "مركبات بدون مندوب",
      withoutAuthorized: "مركبات بدون مفوض",
      searchAndFilters: "البحث والفلاتر",
      plateSearch: "البحث برقم اللوحة",
      plateSearchPlaceholder: "ابحث برقم اللوحة",
      driverSearch: "البحث باسم المندوب",
      driverSearchPlaceholder: "ابحث داخل المناديب المرتبطين",
      authorizationFilter: "حالة التفويض",
      linkedDriverFilter: "حالة المندوب المرتبط",
      hasAuthorized: "يوجد مفوض",
      noAuthorized: "بدون مفوض",
      hasLinkedDriver: "مرتبط بمندوب",
      noLinkedDriver: "بدون مندوب",
      primaryAssignedDriver: "المندوب المعين / الرئيسي",
      linkedDrivers: "المناديب المرتبطون",
      assigned: "معين",
      resultsCount: "عرض {shown} من {total} مركبة",
      noResultsTitle: "لا توجد مركبات مطابقة",
      noResultsDescription: "عدّل البحث أو امسح الفلاتر لعرض المركبات مرة أخرى.",
    };
  }

  return {
    activeResultSet: "In the current results",
    linkedVehicles: "Vehicles linked to drivers",
    authorizedVehicles: "Vehicles with authorized person",
    withoutDriver: "Vehicles without driver",
    withoutAuthorized: "Vehicles without authorization",
    searchAndFilters: "Search and filters",
    plateSearch: "Search by plate",
    plateSearchPlaceholder: "Search plate number",
    driverSearch: "Search by driver",
    driverSearchPlaceholder: "Search linked drivers",
    authorizationFilter: "Authorization status",
    linkedDriverFilter: "Linked driver status",
    hasAuthorized: "Has authorized person",
    noAuthorized: "No authorized person",
    hasLinkedDriver: "Linked to driver",
    noLinkedDriver: "No driver",
    primaryAssignedDriver: "Assigned / primary driver",
    linkedDrivers: "Linked drivers",
    assigned: "Assigned",
    resultsCount: "Showing {shown} of {total} vehicles",
    noResultsTitle: "No matching vehicles",
    noResultsDescription: "Adjust search or reset filters to show vehicles again.",
  };
}
