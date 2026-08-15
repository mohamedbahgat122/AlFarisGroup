"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
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
import {
  archiveHousingAction,
  archiveHousingRoomAction,
  assignHousingDriverByIdAction,
  assignHousingOrganizationsByIdsAction,
  createHousingAction,
  removeHousingDriverAction,
  saveHousingRoomAction,
  searchHousingDriversAction,
  unassignHousingOrganizationAction,
  updateHousingAction,
} from "@/features/housing/actions";
import { initialHousingActionState } from "@/features/housing/types";
import type {
  HousingDetails,
  HousingDriverOption,
  HousingOrganizationSummary,
  HousingPermissionFlags,
  HousingRoomSummary,
  HousingStatus,
  HousingUnitSummary,
} from "@/features/housing/types";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/types/locale";

type HousingDictionary = Dictionary["dashboard"]["housing"];

export function GlobalHousingListClient({
  locale,
  dictionary,
  housing,
  permissions,
  includeArchived,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  housing: HousingUnitSummary[];
  permissions: HousingPermissionFlags;
  includeArchived: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingHousing, setEditingHousing] = useState<HousingUnitSummary | null>(null);

  function openCreate() {
    setEditingHousing(null);
    setShowForm(true);
  }

  function openEdit(unit: HousingUnitSummary) {
    setEditingHousing(unit);
    setShowForm(true);
  }

  return (
    <>
      <EntityPageHeader
        title={dictionary.title}
        description={dictionary.description}
        viewOnlyLabel={permissions.create ? undefined : dictionary.viewOnly}
        secondaryAction={
          <Link
            href={`?archived=${includeArchived ? "false" : "true"}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
          >
            {includeArchived ? dictionary.hideArchived : dictionary.showArchived}
          </Link>
        }
        primaryAction={
          permissions.create ? (
            <Button type="button" onClick={openCreate} className="gap-2">
              <PlusIcon />
              {dictionary.addHousing}
            </Button>
          ) : null
        }
      />

      <EntityContent>
        {housing.length === 0 ? (
          <EntityEmptyState
            icon={<HousingIcon />}
            title={dictionary.emptyTitle}
            description={dictionary.emptyDescription}
            action={
              permissions.create ? (
                <Button type="button" onClick={openCreate} className="gap-2">
                  <PlusIcon />
                  {dictionary.addHousing}
                </Button>
              ) : null
            }
          />
        ) : (
          <EntityTableContainer>
            <table className="w-full min-w-[1200px] border-collapse text-start">
              <thead className="bg-background text-xs font-bold uppercase text-muted">
                <tr>
                  <TableHeader>{dictionary.name}</TableHeader>
                  <TableHeader>{dictionary.code}</TableHeader>
                  <TableHeader>{dictionary.city}</TableHeader>
                  <TableHeader>{dictionary.rooms}</TableHeader>
                  <TableHeader>{dictionary.capacity}</TableHeader>
                  <TableHeader>{dictionary.occupied}</TableHeader>
                  <TableHeader>{dictionary.available}</TableHeader>
                  <TableHeader>{dictionary.utilization}</TableHeader>
                  <TableHeader>{dictionary.status}</TableHeader>
                  <TableHeader>{dictionary.organizations}</TableHeader>
                  <TableHeader>{dictionary.actions}</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {housing.map((unit) => (
                  <tr key={unit.id}>
                    <Cell strong>
                      <Link href={`/${locale}/dashboard/housing/${unit.id}`} className="text-primary hover:underline">
                        {unit.name}
                      </Link>
                    </Cell>
                    <Cell>{unit.code ?? dictionary.notAvailable}</Cell>
                    <Cell>
                      <span className="inline-flex items-center gap-2">
                        {unit.latitude !== null && unit.longitude !== null ? <LocationIcon /> : null}
                        {unit.city ?? unit.address ?? dictionary.notAvailable}
                      </span>
                    </Cell>
                    <Cell>{unit.roomCount}</Cell>
                    <Cell>{unit.capacity}</Cell>
                    <Cell>{unit.occupied}</Cell>
                    <Cell>{unit.available}</Cell>
                    <Cell>{unit.utilization}%</Cell>
                    <Cell>
                      <StatusBadge status={unit.displayStatus} dictionary={dictionary} />
                    </Cell>
                    <Cell>{formatOrganizations(unit.organizations, dictionary)}</Cell>
                    <Cell>
                      <div className="inline-flex gap-1">
                        {permissions.update ? (
                          <RowActionButton label={dictionary.editHousing} onClick={() => openEdit(unit)}>
                            <EditIcon />
                          </RowActionButton>
                        ) : null}
                        {permissions.archive ? (
                          <ArchiveForm locale={locale} housing={unit} dictionary={dictionary} />
                        ) : null}
                      </div>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </EntityTableContainer>
        )}
      </EntityContent>

      {showForm ? (
        <HousingFormDialog
          locale={locale}
          dictionary={dictionary}
          housing={editingHousing}
          onClose={() => setShowForm(false)}
        />
      ) : null}
    </>
  );
}

export function HousingDetailsClient({
  locale,
  dictionary,
  housing,
  organizations,
  permissions,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  housing: HousingDetails;
  organizations: HousingOrganizationSummary[];
  permissions: HousingPermissionFlags;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showOrganizationDialog, setShowOrganizationDialog] = useState(false);
  const [showDriverDialog, setShowDriverDialog] = useState(false);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<HousingRoomSummary | null>(null);
  const [movingResident, setMovingResident] = useState<HousingDetails["residents"][number] | null>(null);
  const canReceiveResidents = !housing.archivedAt && housing.status === "active" && housing.available > 0;

  return (
    <>
      <EntityPageHeader
        title={housing.name}
        description={dictionary.detailsTitle}
        viewOnlyLabel={permissions.update ? undefined : dictionary.viewOnly}
        secondaryAction={
          <Link
            href={`/${locale}/dashboard/housing`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
          >
            {dictionary.title}
          </Link>
        }
        primaryAction={
          permissions.update ? (
            <Button type="button" onClick={() => setShowForm(true)} className="gap-2">
              <EditIcon />
              {dictionary.editHousing}
            </Button>
          ) : null
        }
      />

      <EntityContent>
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label={dictionary.capacity} value={housing.capacity} />
          <Metric label={dictionary.occupied} value={housing.occupied} />
          <Metric label={dictionary.available} value={housing.available} />
          <Metric label={dictionary.utilization} value={`${housing.utilization}%`} />
          <Metric label={dictionary.organizations} value={housing.organizationAssignments.length} />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Panel
              title={dictionary.rooms}
              action={
                permissions.update ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingRoom(null);
                      setShowRoomDialog(true);
                    }}
                  >
                    {dictionary.addRoom}
                  </Button>
                ) : null
              }
            >
              {housing.rooms.length === 0 ? (
                <EmptyLine>{dictionary.noRooms}</EmptyLine>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <SmallHeader>{dictionary.room}</SmallHeader>
                      <SmallHeader>{dictionary.capacity}</SmallHeader>
                      <SmallHeader>{dictionary.occupied}</SmallHeader>
                      <SmallHeader>{dictionary.available}</SmallHeader>
                      <SmallHeader>{dictionary.utilization}</SmallHeader>
                      <SmallHeader>{dictionary.status}</SmallHeader>
                      <SmallHeader>{dictionary.actions}</SmallHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {housing.rooms.map((room) => (
                      <tr key={room.id}>
                        <Cell strong>
                          <span className="block">{room.name}</span>
                          <span className="text-xs font-medium text-muted">{room.code ?? dictionary.notAvailable}</span>
                        </Cell>
                        <Cell>{room.capacity}</Cell>
                        <Cell>{room.occupied}</Cell>
                        <Cell>{room.available}</Cell>
                        <Cell>{room.utilization}%</Cell>
                        <Cell><StatusBadge status={room.displayStatus} dictionary={dictionary} /></Cell>
                        <Cell>
                          {permissions.update ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="text-sm font-bold text-primary hover:underline"
                                onClick={() => {
                                  setEditingRoom(room);
                                  setShowRoomDialog(true);
                                }}
                              >
                                {dictionary.editRoom}
                              </button>
                              <ArchiveRoomForm locale={locale} housingId={housing.id} room={room} dictionary={dictionary} />
                            </div>
                          ) : null}
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>

            <Panel
              title={dictionary.currentResidents}
              action={
                permissions.assignDrivers ? (
                  <Button type="button" onClick={() => setShowDriverDialog(true)} disabled={!canReceiveResidents}>
                    {dictionary.addDriver}
                  </Button>
                ) : null
              }
            >
              {permissions.assignDrivers ? (
                !canReceiveResidents ? (
                  <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                    {housing.available <= 0 ? dictionary.errors.housing_full : dictionary.errors.housing_not_assignable}
                  </p>
                ) : null
              ) : null}
              {housing.residents.length === 0 ? (
                <EmptyLine>{dictionary.noResidents}</EmptyLine>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <SmallHeader>{dictionary.driver}</SmallHeader>
                      <SmallHeader>{dictionary.iqama}</SmallHeader>
                      <SmallHeader>{dictionary.mobile}</SmallHeader>
                      <SmallHeader>{dictionary.organization}</SmallHeader>
                      <SmallHeader>{dictionary.room}</SmallHeader>
                      <SmallHeader>{dictionary.assignedAt}</SmallHeader>
                      <SmallHeader>{dictionary.actions}</SmallHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {housing.residents.map((resident) => (
                      <tr key={resident.assignmentId}>
                        <Cell strong>{resident.fullName}</Cell>
                        <Cell>{resident.iqamaNumber ?? dictionary.notAvailable}</Cell>
                        <Cell>{resident.mobileNumber ?? dictionary.notAvailable}</Cell>
                        <Cell>{resident.organizationName ?? dictionary.notAvailable}</Cell>
                        <Cell>{resident.roomName ?? dictionary.unallocated}</Cell>
                        <Cell>{formatDate(resident.assignedAt, locale)}</Cell>
                        <Cell>
                          {permissions.assignDrivers ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="text-sm font-bold text-primary hover:underline"
                                onClick={() => setMovingResident(resident)}
                              >
                                {dictionary.moveDriver}
                              </button>
                              <RemoveDriverForm
                                locale={locale}
                                housingId={housing.id}
                                driverId={resident.driverId}
                                dictionary={dictionary}
                              />
                            </div>
                          ) : null}
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>

            <Panel title={dictionary.assignmentHistory}>
              {housing.assignmentHistory.length === 0 ? (
                <EmptyLine>{dictionary.noHistory}</EmptyLine>
              ) : (
                <div className="divide-y divide-border">
                  {housing.assignmentHistory.map((entry) => (
                    <div key={`${entry.type}-${entry.id}`} className="grid gap-2 py-3 text-sm sm:grid-cols-4">
                      <p className="font-bold text-navy">{entry.subject}</p>
                      <p className="font-medium text-muted">{entry.type === "driver" ? dictionary.driver : dictionary.organization}</p>
                      <p className="font-medium text-muted">{formatDate(entry.assignedAt, locale)}</p>
                      <p className="font-medium text-muted">
                        {entry.unassignedAt ? formatDate(entry.unassignedAt, locale) : dictionary.current}
                      </p>
                      {entry.notes ? <p className="font-medium text-muted sm:col-span-4">{entry.notes}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {permissions.activity ? (
              <Panel title={dictionary.activity}>
                {housing.activities.length === 0 ? (
                  <EmptyLine>{dictionary.noActivity}</EmptyLine>
                ) : (
                  <div className="divide-y divide-border">
                    {housing.activities.map((activity) => (
                      <div key={activity.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                        <p className="font-bold text-navy">{activity.action}</p>
                        <p className="font-medium text-muted">{activity.actorName ?? dictionary.notAvailable}</p>
                        <p className="font-medium text-muted">{formatDate(activity.createdAt, locale)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ) : null}
          </div>

          <div className="space-y-6">
            <Panel
              title={dictionary.assignedOrganizations}
              action={
                permissions.assignOrganizations ? (
                  <Button type="button" onClick={() => setShowOrganizationDialog(true)}>
                    {dictionary.assignOrganization}
                  </Button>
                ) : null
              }
            >
              {housing.organizationAssignments.length === 0 ? (
                <EmptyLine>{dictionary.noOrganizations}</EmptyLine>
              ) : (
                <div className="divide-y divide-border">
                  {housing.organizationAssignments.map((organization) => (
                    <div key={organization.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-bold text-navy">{organization.name}</p>
                        <p className="text-xs font-medium text-muted">
                          {[organization.code, organization.assignedAt ? formatDate(organization.assignedAt, locale) : null]
                            .filter(Boolean)
                            .join(" | ")}
                        </p>
                      </div>
                      {permissions.assignOrganizations ? (
                        <form action={unassignHousingOrganizationAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="housingId" value={housing.id} />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <button className="text-sm font-bold text-danger hover:underline">
                            {dictionary.unassignOrganization}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={dictionary.housingInformation}>
              <Info label={dictionary.code} value={housing.code} />
              <Info label={dictionary.status} value={dictionary.statuses[housing.displayStatus]} />
              <Info label={dictionary.notes} value={housing.notes} />
            </Panel>

            <Panel title={dictionary.housingLocation}>
              <Info label={dictionary.address} value={housing.address} />
              <Info label={dictionary.city} value={housing.city} />
              <Info label={dictionary.locationNotes} value={housing.locationNotes} />
              {housing.latitude !== null && housing.longitude !== null ? (
                <>
                  <a
                    href={getGoogleMapsUrl(housing.latitude, housing.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-primary transition hover:bg-primary-soft"
                  >
                    {dictionary.openGoogleMaps}
                  </a>
                </>
              ) : (
                <EmptyLine>{dictionary.noGeolocation}</EmptyLine>
              )}
            </Panel>
          </div>
        </div>
      </EntityContent>

      {showForm ? (
        <HousingFormDialog
          locale={locale}
          dictionary={dictionary}
          housing={housing}
          onClose={() => setShowForm(false)}
        />
      ) : null}
      {showOrganizationDialog ? (
        <AssignOrganizationDialog
          locale={locale}
          dictionary={dictionary}
          housingId={housing.id}
          organizations={organizations.filter(
            (organization) => !housing.organizationAssignments.some((assigned) => assigned.id === organization.id),
          )}
          onClose={() => setShowOrganizationDialog(false)}
        />
      ) : null}
      {showDriverDialog ? (
        <AssignDriverDialog
          locale={locale}
          dictionary={dictionary}
          housing={housing}
          rooms={housing.rooms}
          onClose={() => setShowDriverDialog(false)}
        />
      ) : null}
      {showRoomDialog ? (
        <HousingRoomDialog
          locale={locale}
          dictionary={dictionary}
          housingId={housing.id}
          room={editingRoom}
          onClose={() => setShowRoomDialog(false)}
        />
      ) : null}
      {movingResident ? (
        <MoveResidentDialog
          locale={locale}
          dictionary={dictionary}
          currentHousingId={housing.id}
          resident={movingResident}
          rooms={housing.rooms}
          onClose={() => setMovingResident(null)}
        />
      ) : null}
    </>
  );
}

function HousingFormDialog({
  locale,
  dictionary,
  housing,
  onClose,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  housing: HousingUnitSummary | null;
  onClose: () => void;
}) {
  const action = housing ? updateHousingAction : createHousingAction;
  const [state, formAction] = useActionState(action, initialHousingActionState);
  const [latitude, setLatitude] = useState(housing?.latitude === null || housing?.latitude === undefined ? "" : String(housing.latitude));
  const [longitude, setLongitude] = useState(housing?.longitude === null || housing?.longitude === undefined ? "" : String(housing.longitude));
  const [mapsLink, setMapsLink] = useState("");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoPending, setGeoPending] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);
  const hasSelectedLocation = isValidCoordinatePair(latitudeNumber, longitudeNumber);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  const errorMessage = state.code ? dictionary.errors[state.code as keyof typeof dictionary.errors] : null;

  return (
    <EntityFormDialog
      title={housing ? dictionary.editHousing : dictionary.addHousing}
      subtitle={dictionary.description}
      closeLabel={dictionary.close}
      labelledBy="housing-form-title"
      onClose={onClose}
    >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="locale" value={locale} />
        {housing ? <input type="hidden" name="housingId" value={housing.id} /> : null}
        <input type="hidden" name="latitude" value={hasSelectedLocation ? String(latitudeNumber) : ""} />
        <input type="hidden" name="longitude" value={hasSelectedLocation ? String(longitudeNumber) : ""} />
        <EntityFormBody>
          <div className="space-y-5">
            {errorMessage ? (
              <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger">
                {errorMessage}
              </div>
            ) : null}
            <FormSection title={dictionary.housingInformation}>
              <FormField id="housingName" name="name" label={dictionary.name} defaultValue={housing?.name ?? ""} required />
              <FormField id="housingCode" name="code" label={dictionary.code} defaultValue={housing?.code ?? ""} required={false} />
              <FormField id="housingCity" name="city" label={dictionary.city} defaultValue={housing?.city ?? ""} required={false} />
              <FormField id="housingAddress" name="address" label={dictionary.address} defaultValue={housing?.address ?? ""} required={false} />
              <FormField id="housingCapacity" name="capacity" type="number" min={1} label={dictionary.capacity} defaultValue={String(housing?.capacity ?? 1)} required />
              <SelectField id="housingStatus" name="status" label={dictionary.status} defaultValue={housing?.status ?? "active"}>
                {(["active", "full", "maintenance", "inactive"] as HousingStatus[]).map((status) => (
                  <option key={status} value={status}>{dictionary.statuses[status]}</option>
                ))}
              </SelectField>
              <TextAreaField id="housingLocationNotes" name="locationNotes" label={dictionary.locationNotes} defaultValue={housing?.locationNotes ?? ""} />
              <TextAreaField id="housingNotes" name="notes" label={dictionary.notes} defaultValue={housing?.notes ?? ""} />
            </FormSection>
            <FormSection title={dictionary.housingLocation}>
              <FormField
                id="housingMapsLink"
                name="mapsLink"
                label={dictionary.locationLink}
                placeholder={dictionary.locationLinkPlaceholder}
                value={mapsLink}
                onChange={(event) => {
                  setMapsLink(event.target.value);
                  setGeoError(null);
                }}
                onBlur={() => {
                  const trimmed = mapsLink.trim();
                  if (!trimmed) return;
                  const parsed = parseGoogleMapsCoordinates(trimmed);
                  if (!parsed) {
                    setGeoError(dictionary.locationLinkParseError);
                    return;
                  }
                  setLatitude(String(parsed.latitude));
                  setLongitude(String(parsed.longitude));
                  setGeoError(null);
                }}
                required={false}
              />
              <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row sm:flex-wrap">
                <Button type="button" onClick={() => setShowMapPicker(true)}>
                  {hasSelectedLocation ? dictionary.changeLocation : dictionary.chooseFromMap}
                </Button>
                <Button
                  type="button"
                  disabled={geoPending}
                  onClick={() => {
                    setGeoError(null);
                    if (!navigator.geolocation) {
                      setGeoError(dictionary.geolocationUnavailable);
                      return;
                    }
                    setGeoPending(true);
                    navigator.geolocation.getCurrentPosition(
                      (position) => {
                        setLatitude(String(Number(position.coords.latitude.toFixed(7))));
                        setLongitude(String(Number(position.coords.longitude.toFixed(7))));
                        setMapsLink("");
                        setGeoPending(false);
                      },
                      (error) => {
                        if (error.code === error.PERMISSION_DENIED) setGeoError(dictionary.geolocationDenied);
                        else if (error.code === error.POSITION_UNAVAILABLE) setGeoError(dictionary.geolocationUnavailable);
                        else setGeoError(dictionary.geolocationTimeout);
                        setGeoPending(false);
                      },
                      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
                    );
                  }}
                >
                  {geoPending ? dictionary.geolocationLoading : dictionary.useCurrentLocation}
                </Button>
                {hasSelectedLocation ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLatitude("");
                      setLongitude("");
                      setMapsLink("");
                      setGeoError(null);
                    }}
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-danger/20 bg-surface px-5 text-sm font-semibold text-danger transition hover:bg-danger/10"
                  >
                    {dictionary.removeLocation}
                  </button>
                ) : null}
              </div>
              <div className="md:col-span-2">
                {geoError ? <p className="text-sm font-bold text-danger">{geoError}</p> : null}
                {hasSelectedLocation ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-sm font-bold text-emerald-800">{dictionary.locationSelected}</p>
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      {latitudeNumber.toFixed(6)}, {longitudeNumber.toFixed(6)}
                    </p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-muted">
                    {dictionary.noGeolocation}
                  </p>
                )}
                {hasSelectedLocation ? (
                  <a
                    href={getGoogleMapsUrl(latitudeNumber, longitudeNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-primary transition hover:bg-primary-soft"
                  >
                    {dictionary.openGoogleMaps}
                  </a>
                ) : null}
              </div>
            </FormSection>
          </div>
        </EntityFormBody>
        <DialogActions
          cancel={dictionary.cancel}
          submit={housing ? dictionary.saveChanges : dictionary.saveHousing}
          submitting={dictionary.saving}
          onCancel={onClose}
        />
      </form>
      {showMapPicker ? (
        <MapPickerDialog
          dictionary={dictionary}
          initialLatitude={hasSelectedLocation ? latitudeNumber : null}
          initialLongitude={hasSelectedLocation ? longitudeNumber : null}
          onClose={() => setShowMapPicker(false)}
          onConfirm={(nextLatitude, nextLongitude) => {
            setLatitude(String(nextLatitude));
            setLongitude(String(nextLongitude));
            setMapsLink("");
            setGeoError(null);
            setShowMapPicker(false);
          }}
        />
      ) : null}
    </EntityFormDialog>
  );
}

function MapPickerDialog({
  dictionary,
  initialLatitude,
  initialLongitude,
  onClose,
  onConfirm,
}: {
  dictionary: HousingDictionary;
  initialLatitude: number | null;
  initialLongitude: number | null;
  onClose: () => void;
  onConfirm: (latitude: number, longitude: number) => void;
}) {
  const zoom = 13;
  const defaultLocation = { latitude: 24.7136, longitude: 46.6753 };
  const initialLocation = initialLatitude !== null && initialLongitude !== null
    ? { latitude: initialLatitude, longitude: initialLongitude }
    : defaultLocation;
  const [marker, setMarker] = useState(initialLocation);
  const [center, setCenter] = useState(initialLocation);
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 640, height: 360 });
  const centerPixel = latLngToWorldPixel(center.latitude, center.longitude, zoom);
  const markerPixel = latLngToWorldPixel(marker.latitude, marker.longitude, zoom);
  const markerLeft = markerPixel.x - centerPixel.x + mapSize.width / 2;
  const markerTop = markerPixel.y - centerPixel.y + mapSize.height / 2;
  const tiles = getVisibleMapTiles(centerPixel, mapSize, zoom);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setMapSize({ width: rect.width, height: rect.height });
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <EntityFormDialog
      title={dictionary.chooseFromMap}
      subtitle={dictionary.mapPickerDescription}
      closeLabel={dictionary.close}
      labelledBy="housing-map-picker-title"
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <EntityFormBody>
          <div
            ref={mapRef}
            className="relative h-[360px] overflow-hidden rounded-xl border border-border bg-slate-100"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const clickPixel = {
                x: centerPixel.x - rect.width / 2 + event.clientX - rect.left,
                y: centerPixel.y - rect.height / 2 + event.clientY - rect.top,
              };
              const next = worldPixelToLatLng(clickPixel.x, clickPixel.y, zoom);
              setMarker(next);
              setCenter(next);
            }}
          >
            {tiles.map((tile) => (
              <div
                key={`${tile.x}-${tile.y}`}
                aria-hidden="true"
                className="absolute size-[256px] bg-cover"
                style={{
                  left: tile.left,
                  top: tile.top,
                  backgroundImage: `url(${getOpenStreetMapTileUrl(tile.x, tile.y, zoom)})`,
                }}
              />
            ))}
            <div
              aria-hidden="true"
              className="absolute z-10 -ms-3 -mt-8 text-danger drop-shadow"
              style={{ left: markerLeft, top: markerTop }}
            >
              <LocationMarkerIcon />
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold text-muted">
            {dictionary.mapPickerHint}
          </p>
          <p className="mt-1 text-xs font-medium text-muted">
            {marker.latitude.toFixed(6)}, {marker.longitude.toFixed(6)}
          </p>
        </EntityFormBody>
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
          >
            {dictionary.cancel}
          </button>
          <Button
            type="button"
            onClick={() => onConfirm(Number(marker.latitude.toFixed(7)), Number(marker.longitude.toFixed(7)))}
          >
            {dictionary.confirmLocation}
          </Button>
        </div>
      </div>
    </EntityFormDialog>
  );
}

function HousingRoomDialog({
  locale,
  dictionary,
  housingId,
  room,
  onClose,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  housingId: string;
  room: HousingRoomSummary | null;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(saveHousingRoomAction, initialHousingActionState);
  const errorMessage = state.code ? dictionary.errors[state.code as keyof typeof dictionary.errors] : null;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  return (
    <EntityFormDialog
      title={room ? dictionary.editRoom : dictionary.addRoom}
      subtitle={dictionary.roomsDescription}
      closeLabel={dictionary.close}
      labelledBy="housing-room-dialog-title"
      onClose={onClose}
    >
      <form action={formAction} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="housingId" value={housingId} />
        {room ? <input type="hidden" name="roomId" value={room.id} /> : null}
        <EntityFormBody>
          <div className="space-y-5">
            {errorMessage ? (
              <div className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger">
                {errorMessage}
              </div>
            ) : null}
            <FormSection title={dictionary.room}>
              <FormField id="housingRoomName" name="name" label={dictionary.roomName} defaultValue={room?.name ?? ""} required />
              <FormField id="housingRoomCode" name="code" label={dictionary.code} defaultValue={room?.code ?? ""} required={false} />
              <FormField id="housingRoomCapacity" name="capacity" type="number" min={1} label={dictionary.capacity} defaultValue={String(room?.capacity ?? 1)} required />
              <SelectField id="housingRoomStatus" name="status" label={dictionary.status} defaultValue={room?.status ?? "active"}>
                {(["active", "full", "maintenance", "inactive"] as HousingStatus[]).map((status) => (
                  <option key={status} value={status}>{dictionary.statuses[status]}</option>
                ))}
              </SelectField>
              <TextAreaField id="housingRoomNotes" name="notes" label={dictionary.notes} defaultValue={room?.notes ?? ""} />
            </FormSection>
          </div>
        </EntityFormBody>
        <DialogActions
          cancel={dictionary.cancel}
          submit={room ? dictionary.saveChanges : dictionary.addRoom}
          submitting={dictionary.saving}
          onCancel={onClose}
        />
      </form>
    </EntityFormDialog>
  );
}

function AssignOrganizationDialog({
  locale,
  dictionary,
  housingId,
  organizations,
  onClose,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  housingId: string;
  organizations: HousingOrganizationSummary[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const visibleOrganizations = organizations.filter((organization) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [organization.name, organization.code].some((value) => value?.toLowerCase().includes(normalizedQuery));
  });

  return (
    <EntityFormDialog
      title={dictionary.assignOrganization}
      subtitle={dictionary.assignOrganizationDescription}
      closeLabel={dictionary.close}
      labelledBy="housing-organization-dialog-title"
      onClose={onClose}
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          const organizationIds = Array.from(selectedIds);
          startTransition(async () => {
            const result = await assignHousingOrganizationsByIdsAction({
              locale,
              housingId,
              organizationIds,
            });
            if (result.status !== "success") {
              setMessage(dictionary.errors[result.code as keyof typeof dictionary.errors] ?? dictionary.errors.save_failed);
              return;
            }
            router.refresh();
            onClose();
          });
        }}
      >
        <EntityFormBody>
          <div className="space-y-4">
            {message ? <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger">{message}</p> : null}
            <FormField
              id="housingOrganizationSearch"
              name="organizationSearch"
              label={dictionary.searchOrganizations}
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              required={false}
            />
            <div className="max-h-80 overflow-auto rounded-xl border border-border bg-background">
              {visibleOrganizations.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm font-semibold text-muted">{dictionary.noOrganizationsAvailable}</p>
              ) : (
                visibleOrganizations.map((organization) => (
                  <label key={organization.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(organization.id)}
                      onChange={(event) => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(organization.id);
                          else next.delete(organization.id);
                          return next;
                        });
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-navy">{organization.name}</span>
                      <span className="block text-xs font-medium text-muted">{organization.code ?? dictionary.notAvailable}</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </EntityFormBody>
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary">
            {dictionary.cancel}
          </button>
          <Button type="submit" disabled={pending || selectedIds.size === 0}>
            {pending ? dictionary.saving : dictionary.assignOrganization}
          </Button>
        </div>
      </form>
    </EntityFormDialog>
  );
}

function AssignDriverDialog({
  locale,
  dictionary,
  housing,
  rooms,
  onClose,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  housing: HousingDetails;
  rooms: HousingRoomSummary[];
  onClose: () => void;
}) {
  const [state, setState] = useState(initialHousingActionState);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [driver, setDriver] = useState<HousingDriverOption | null>(null);
  const [confirmedMove, setConfirmedMove] = useState(false);
  const [notes, setNotes] = useState("");
  const [roomId, setRoomId] = useState("");
  const errorMessage = state.code ? dictionary.errors[state.code as keyof typeof dictionary.errors] : null;
  const assignableRooms = rooms.filter((room) => room.status === "active" && !room.archivedAt && room.available > 0);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  const requiresMoveConfirmation = Boolean(driver?.currentHousingName && driver.currentHousingName !== housing.name);

  return (
    <EntityFormDialog
      title={dictionary.addDriver}
      subtitle={dictionary.assignDriverDescription}
      closeLabel={dictionary.close}
      labelledBy="housing-driver-dialog-title"
      onClose={onClose}
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!driver) {
            setState({ status: "validation_error", code: "validation_error" });
            return;
          }
          if (rooms.length > 0 && !roomId) {
            setState({ status: "validation_error", code: "validation_error" });
            return;
          }
          if (requiresMoveConfirmation && !confirmedMove) {
            setState({ status: "validation_error", code: "validation_error" });
            return;
          }
          startTransition(async () => {
            const result = await assignHousingDriverByIdAction({
              locale,
              housingId: housing.id,
              roomId: roomId || null,
              driverId: driver.id,
              notes,
            });
            setState(result);
            if (result.status === "success") {
              router.refresh();
              onClose();
            }
          });
        }}
      >
        <EntityFormBody>
          <div className="space-y-4">
            {errorMessage ? <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger">{errorMessage}</p> : null}
            <DriverPicker dictionary={dictionary} selected={driver} onChange={(value) => {
              setDriver(value);
              setConfirmedMove(false);
            }} />
            {requiresMoveConfirmation ? (
              <label className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                <span className="block">{dictionary.moveConfirmation}</span>
                <span className="mt-1 block">{dictionary.previousHousing}: {driver?.currentHousingName}</span>
                <span className="mt-3 flex items-center gap-2">
                  <input type="checkbox" checked={confirmedMove} onChange={(event) => setConfirmedMove(event.target.checked)} />
                  {dictionary.confirmMove}
                </span>
              </label>
            ) : null}
            {rooms.length > 0 ? (
              <SelectField
                id="housingAssignmentRoom"
                name="roomId"
                label={dictionary.room}
                value={roomId}
                onChange={setRoomId}
              >
                <option value="">{dictionary.selectRoom}</option>
                {assignableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} - {dictionary.available}: {room.available} {dictionary.fromCapacity} {room.capacity}
                  </option>
                ))}
              </SelectField>
            ) : (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                {dictionary.noRooms}
              </p>
            )}
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="housingAssignmentNotes" className="block text-sm font-semibold text-navy">
                {dictionary.notes}
              </label>
              <textarea
                id="housingAssignmentNotes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-border bg-white px-4 py-3 text-base leading-6 text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>
        </EntityFormBody>
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
          >
            {dictionary.cancel}
          </button>
          <Button type="submit" disabled={pending || !driver || (rooms.length > 0 && !roomId) || (requiresMoveConfirmation && !confirmedMove)}>
            {pending ? dictionary.saving : dictionary.assignDriver}
          </Button>
        </div>
      </form>
    </EntityFormDialog>
  );
}

function MoveResidentDialog({
  locale,
  dictionary,
  currentHousingId,
  resident,
  rooms,
  onClose,
}: {
  locale: Locale;
  dictionary: HousingDictionary;
  currentHousingId: string;
  resident: HousingDetails["residents"][number];
  rooms: HousingRoomSummary[];
  onClose: () => void;
}) {
  const [state, setState] = useState(initialHousingActionState);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [targetRoomId, setTargetRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const errorMessage = state.code ? dictionary.errors[state.code as keyof typeof dictionary.errors] : null;
  const availableRooms = rooms.filter((room) => room.status === "active" && room.available > 0 && room.id !== resident.roomId);
  const selectedRoom = availableRooms.find((room) => room.id === targetRoomId) ?? null;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [onClose, state.status]);

  return (
    <EntityFormDialog
      title={dictionary.moveDriver}
      subtitle={resident.fullName}
      closeLabel={dictionary.close}
      labelledBy="housing-move-driver-dialog-title"
      onClose={onClose}
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          if (!targetRoomId) {
            setState({ status: "validation_error", code: "validation_error" });
            return;
          }
          startTransition(async () => {
            const result = await assignHousingDriverByIdAction({
              locale,
              housingId: currentHousingId,
              roomId: targetRoomId,
              driverId: resident.driverId,
              notes,
            });
            setState(result);
            if (result.status === "success") {
              router.refresh();
              onClose();
            }
          });
        }}
      >
        <EntityFormBody>
          <div className="space-y-4">
            {errorMessage ? <p className="rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger">{errorMessage}</p> : null}
            <SelectField
              id="targetRoomId"
              name="targetRoomSelect"
              label={dictionary.targetRoom}
              value={targetRoomId}
              onChange={setTargetRoomId}
            >
              <option value="">{dictionary.selectRoom}</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} - {dictionary.available}: {room.available} {dictionary.fromCapacity} {room.capacity}
                </option>
              ))}
            </SelectField>
            {selectedRoom ? (
              <div className="grid gap-3 rounded-xl border border-border bg-background p-4 text-sm sm:grid-cols-3">
                <Info label={dictionary.capacity} value={String(selectedRoom.capacity)} />
                <Info label={dictionary.occupied} value={String(selectedRoom.occupied)} />
                <Info label={dictionary.available} value={String(selectedRoom.available)} />
              </div>
            ) : availableRooms.length === 0 ? (
              <EmptyLine>{dictionary.noMoveTargets}</EmptyLine>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="housingMoveNotes" className="block text-sm font-semibold text-navy">
                {dictionary.notes}
              </label>
              <textarea
                id="housingMoveNotes"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-border bg-white px-4 py-3 text-base leading-6 text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>
        </EntityFormBody>
        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold text-navy transition hover:border-primary/35 hover:bg-primary-soft hover:text-primary"
          >
            {dictionary.cancel}
          </button>
          <Button type="submit" disabled={pending || !targetRoomId}>
            {pending ? dictionary.saving : dictionary.moveDriver}
          </Button>
        </div>
      </form>
    </EntityFormDialog>
  );
}

function RemoveDriverForm({
  locale,
  housingId,
  driverId,
  dictionary,
}: {
  locale: Locale;
  housingId: string;
  driverId: string;
  dictionary: HousingDictionary;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          await removeHousingDriverAction(formData);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="housingId" value={housingId} />
      <input type="hidden" name="driverId" value={driverId} />
      <button type="submit" disabled={pending} className="text-sm font-bold text-danger hover:underline disabled:opacity-60">
        {pending ? dictionary.saving : dictionary.removeDriver}
      </button>
    </form>
  );
}

function DriverPicker({
  dictionary,
  selected,
  onChange,
}: {
  dictionary: HousingDictionary;
  selected: HousingDriverOption | null;
  onChange: (driver: HousingDriverOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<HousingDriverOption[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const visibleOptions = query.trim().length < 2 ? (selected ? [selected] : []) : options;

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        const results = await searchHousingDriversAction(query);
        setOptions(selected && !results.some((item) => item.id === selected.id) ? [selected, ...results] : results);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selected]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <FormField
        id="housingDriverSearch"
        label={dictionary.driver}
        value={query}
        placeholder={dictionary.searchDriverPlaceholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selected) onChange(null);
          setOpen(true);
        }}
      />
      {pending ? <span className="absolute end-3 top-10 size-3 animate-pulse rounded-full bg-primary" /> : null}
      {open ? (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-surface py-1 text-sm shadow-xl">
          {visibleOptions.length === 0 ? (
            <li className="px-4 py-3 font-medium text-muted">{dictionary.notAvailable}</li>
          ) : (
            visibleOptions.map((driver) => (
              <li
                key={driver.id}
                className="cursor-pointer px-4 py-3 hover:bg-primary-soft"
                onClick={() => {
                  onChange(driver);
                  setQuery(driver.fullName);
                  setOpen(false);
                }}
              >
                <p className="font-bold text-navy">{driver.fullName}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {[driver.iqamaNumber, driver.mobileNumber, driver.organizationName, driver.currentHousingName].filter(Boolean).join(" | ")}
                </p>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function ArchiveForm({
  locale,
  housing,
  dictionary,
}: {
  locale: Locale;
  housing: HousingUnitSummary;
  dictionary: HousingDictionary;
}) {
  return (
    <form action={archiveHousingAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="housingId" value={housing.id} />
      <input type="hidden" name="archived" value={housing.archivedAt ? "false" : "true"} />
      <RowActionButton type="submit" label={housing.archivedAt ? dictionary.restore : dictionary.archive}>
        <ArchiveIcon />
      </RowActionButton>
    </form>
  );
}

function ArchiveRoomForm({
  locale,
  housingId,
  room,
  dictionary,
}: {
  locale: Locale;
  housingId: string;
  room: HousingRoomSummary;
  dictionary: HousingDictionary;
}) {
  return (
    <form action={archiveHousingRoomAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="housingId" value={housingId} />
      <input type="hidden" name="roomId" value={room.id} />
      <button
        type="submit"
        disabled={room.occupied > 0}
        className="text-sm font-bold text-danger hover:underline disabled:text-muted disabled:no-underline"
        title={room.occupied > 0 ? dictionary.errors.room_has_residents : dictionary.archiveRoom}
      >
        {dictionary.archiveRoom}
      </button>
    </form>
  );
}

function StatusBadge({ status, dictionary }: { status: HousingStatus; dictionary: HousingDictionary }) {
  const tone =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "full"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : status === "maintenance"
          ? "bg-sky-50 text-sky-700 border-sky-200"
          : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>
      {dictionary.statuses[status]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-border bg-surface px-4 py-4">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold text-navy">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <p className="text-xs font-bold uppercase text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-navy">{value || "-"}</p>
    </div>
  );
}

function Table({ children }: { children: ReactNode }) {
  return <table className="w-full min-w-[820px] border-collapse text-start">{children}</table>;
}

function SmallHeader({ children }: { children: ReactNode }) {
  return <th className="bg-background px-4 py-3 text-start text-xs font-bold uppercase text-muted">{children}</th>;
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`px-4 py-4 text-sm ${strong ? "font-bold text-navy" : "font-medium text-muted"}`}>{children}</td>;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-border bg-background px-4 py-6 text-center text-sm font-semibold text-muted">{children}</p>;
}

function formatOrganizations(organizations: HousingOrganizationSummary[], dictionary: HousingDictionary) {
  if (organizations.length === 0) return dictionary.notAvailable;
  return organizations.map((organization) => organization.name).join("، ");
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}

function getGoogleMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

function parseGoogleMapsCoordinates(value: string): { latitude: number; longitude: number } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = new Set([
    "google.com",
    "www.google.com",
    "maps.google.com",
    "maps.app.goo.gl",
    "goo.gl",
  ]);
  if (!allowedHosts.has(hostname)) return null;

  const queryCoordinates = parseCoordinatePair(url.searchParams.get("q"))
    ?? parseCoordinatePair(url.searchParams.get("ll"))
    ?? parseCoordinatePair(url.searchParams.get("query"));
  if (queryCoordinates) return queryCoordinates;

  const pathMatch = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$)/);
  if (pathMatch) {
    return normalizeCoordinatePair(Number(pathMatch[1]), Number(pathMatch[2]));
  }

  return null;
}

function parseCoordinatePair(value: string | null) {
  if (!value) return null;
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return normalizeCoordinatePair(Number(match[1]), Number(match[2]));
}

function normalizeCoordinatePair(latitude: number, longitude: number) {
  return isValidCoordinatePair(latitude, longitude)
    ? { latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) }
    : null;
}

function isValidCoordinatePair(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function latLngToWorldPixel(latitude: number, longitude: number, zoom: number) {
  const sinLatitude = Math.sin((Math.max(Math.min(latitude, 85.05112878), -85.05112878) * Math.PI) / 180);
  const scale = 256 * 2 ** zoom;
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function worldPixelToLatLng(x: number, y: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    latitude: Math.max(Math.min(latitude, 85.05112878), -85.05112878),
    longitude: ((longitude + 540) % 360) - 180,
  };
}

function getVisibleMapTiles(centerPixel: { x: number; y: number }, size: { width: number; height: number }, zoom: number) {
  const tileSize = 256;
  const worldTiles = 2 ** zoom;
  const startX = Math.floor((centerPixel.x - size.width / 2) / tileSize) - 1;
  const endX = Math.floor((centerPixel.x + size.width / 2) / tileSize) + 1;
  const startY = Math.floor((centerPixel.y - size.height / 2) / tileSize) - 1;
  const endY = Math.floor((centerPixel.y + size.height / 2) / tileSize) + 1;
  const tiles: Array<{ x: number; y: number; left: number; top: number }> = [];

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= worldTiles) continue;
      tiles.push({
        x: ((x % worldTiles) + worldTiles) % worldTiles,
        y,
        left: x * tileSize - centerPixel.x + size.width / 2,
        top: y * tileSize - centerPixel.y + size.height / 2,
      });
    }
  }

  return tiles;
}

function getOpenStreetMapTileUrl(x: number, y: number, zoom: number) {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function HousingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="M4 20V8.5L12 4l8 4.5V20M8 20v-7h8v7M7 10h.01M17 10h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 text-primary" fill="none">
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LocationMarkerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8" fill="currentColor">
      <path d="M12 2.75a7.25 7.25 0 0 0-7.25 7.25c0 5.25 6.22 10.66 6.48 10.89a1.16 1.16 0 0 0 1.54 0c.26-.23 6.48-5.64 6.48-10.89A7.25 7.25 0 0 0 12 2.75Zm0 9.75a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path d="m4 16.5-.5 4 4-.5L19 8.5 15.5 5 4 16.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none">
      <path d="M4 7h16M6 7v13h12V7M9 11h6M8 4h8l1 3H7l1-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
