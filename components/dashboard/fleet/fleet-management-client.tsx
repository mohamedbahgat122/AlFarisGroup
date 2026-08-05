"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
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
  EntityTableContainer,
  FormSection,
  ReadOnlyField,
  RowActionButton,
  SecureFileField,
  SelectField,
  TableHeader,
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
            <table className="w-full min-w-[1180px] border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  {dictionary.columns.map((column) => (
                    <TableHeader key={column}>{column}</TableHeader>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehicles.map((vehicle) => (
                  <FleetRow
                    key={vehicle.id}
                    locale={locale}
                    dictionary={dictionary}
                    organization={organization}
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

function FleetRow({
  locale,
  dictionary,
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
  const rowClassName = getRowClassName(vehicle, remaining);
  const owner = vehicle.ownerSource === "organization" ? organization.name : vehicle.ownerName;

  return (
    <tr className={`align-middle transition hover:bg-primary-soft/35 ${rowClassName}`}>
      <td className="px-4 py-4 font-bold text-navy">{vehicle.vehicleType}</td>
      <td className="px-4 py-4 font-medium text-muted" dir="ltr">{vehicle.plateNumber}</td>
      <td className="px-4 py-4 font-medium text-muted">{owner || dictionary.notAvailable}</td>
      <td className="px-4 py-4 font-medium text-muted">{vehicle.assignedDriverName ?? dictionary.notAssigned}</td>
      <td className="px-4 py-4 font-medium text-muted">
        <div>{vehicle.authorizedPersonName ?? dictionary.notAssigned}</div>
        <div className="text-xs text-muted" dir="ltr">
          {vehicle.authorizedPersonIqama ?? ""}
        </div>
      </td>
      <td className="px-4 py-4 font-medium text-muted" dir="ltr">{vehicle.operatingCardNumber}</td>
      <td className="px-4 py-4 font-medium text-muted">{formatDate(vehicle.operatingCardExpiryDate)}</td>
      <td className="px-4 py-4">
        <span className={remainingBadgeClassName(remaining)}>
          {formatRemainingDays(remaining, dictionary)}
        </span>
      </td>
      <td className="px-4 py-4">
        <StatusBadge label={dictionary.operationalStatuses[vehicle.operationalStatus]} tone={vehicle.operationalStatus === "active" ? "success" : "warning"} />
      </td>
      <td className="px-4 py-4">
        <StatusBadge label={dictionary.technicalStatuses[vehicle.technicalStatus]} tone={vehicle.technicalStatus === "healthy" ? "success" : vehicle.technicalStatus === "fault" ? "warning" : "danger"} />
      </td>
      <td className="px-4 py-4">
        <div className="inline-flex items-center justify-center gap-1">
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
              <LifecycleForm locale={locale} organizationCode={organization.code} vehicle={vehicle} dictionary={dictionary} permissions={permissions} />
            </>
          ) : null}
        </div>
      </td>
    </tr>
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
  if (days === null) return "rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted";
  if (days < 0) return "rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700";
  if (days <= 10) return "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800";
  return "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700";
}

function formatDate(value: string | null) {
  return value || "-";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
