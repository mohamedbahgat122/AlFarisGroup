import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getGlobalPermissions } from "@/features/permissions/server";
import type {
  FleetActivityLog,
  FleetActivityRow,
  FleetDriverOption,
  FleetLinkedDriver,
  FleetListFilters,
  FleetPageData,
  FleetSummaryCounts,
  FleetVehicle,
  FleetVehicleCategory,
  FleetVehicleRow,
} from "@/features/fleet/types";
import { normalizePlateForFleet } from "@/features/fleet/validation";
import type { Database } from "@/types/database";

type DriverOptionRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "full_name" | "iqama_number" | "mobile_number"
> & { organizations?: { name: string } | { name: string }[] | null };
type ProfileNameRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name"
>;
type LinkedDriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "full_name" | "iqama_number" | "mobile_number" | "vehicle_id"
>;
const emptyFleetSummary: FleetSummaryCounts = {
  total: 0,
  healthy: 0,
  accident: 0,
  maintenance: 0,
  operationalActive: 0,
  operationalSuspended: 0,
  archived: 0,
};

export async function getFleetPageData({
  organizationId,
  category,
  includeArchived,
}: {
  organizationId: string;
  category: FleetVehicleCategory;
  includeArchived: boolean;
}): Promise<FleetPageData> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", vehicles: [], drivers: [], summary: emptyFleetSummary };
  }

  let vehicleQuery = admin.supabase
    .from("fleet_vehicles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("vehicle_category", category)
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    vehicleQuery = vehicleQuery.is("archived_at", null);
  }

  const [{ data: vehicles, error: vehiclesError }, drivers] = await Promise.all([
    vehicleQuery,
    getFleetDriverOptions(organizationId),
  ]);

  if (vehiclesError || drivers.status !== "success") {
    return { status: "load_error", vehicles: [], drivers: [], summary: emptyFleetSummary };
  }

  const vehicleRows = (vehicles ?? []) as FleetVehicleRow[];
  const driverNames = new Map(drivers.drivers.map((driver) => [driver.id, driver]));
  const linkedDriversByVehicleId = await getLinkedDriversByVehicleId(
    vehicleRows.map((vehicle) => vehicle.id),
  );

  return {
    status: "success",
    vehicles: vehicleRows.map((vehicle) =>
      mapFleetVehicle(vehicle, driverNames, linkedDriversByVehicleId),
    ),
    drivers: drivers.drivers,
    summary: emptyFleetSummary,
  };
}

export async function getGlobalFleetPageData({
  category,
  filters,
}: {
  category: FleetVehicleCategory;
  filters: FleetListFilters;
}): Promise<FleetPageData> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "unauthorized", vehicles: [], drivers: [], summary: emptyFleetSummary };
  }

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  if (admin.profile.role !== "system_owner" && !globalPermissions.has("fleet.view")) {
    return { status: "unauthorized", vehicles: [], drivers: [], summary: emptyFleetSummary };
  }

  let vehicleQuery = admin.supabase
    .from("fleet_vehicles")
    .select("id, vehicle_category, vehicle_type, plate_number, normalized_plate_number, owner_source, owner_organization_id, manual_owner_name, ownership_type, owner_name, owner_driver_id, owner_contact_phone, rental_start_date, rental_end_date, rental_monthly_cost, ownership_contract_number, ownership_notes, operating_card_number, operating_card_expiry_date, operating_card_file_name, operating_card_file_path, operating_card_mime_type, assigned_driver_source, assigned_driver_id, assigned_driver_manual_name, assigned_driver_manual_iqama, authorized_person_source, authorized_driver_id, authorized_manual_name, authorized_manual_iqama, authorization_expiry_date, operational_status, technical_status, fault_location, technical_status_note, notes, archived_at, assigned_organization_id")
    .eq("vehicle_category", category)
    .order("created_at", { ascending: false });

  if (filters.archive === "active") {
    vehicleQuery = vehicleQuery.is("archived_at", null);
  } else if (filters.archive === "archived") {
    vehicleQuery = vehicleQuery.not("archived_at", "is", null);
  }

  if (filters.technicalStatus !== "all") {
    vehicleQuery = vehicleQuery.eq("technical_status", filters.technicalStatus);
  }

  if (filters.operationalStatus !== "all") {
    vehicleQuery = vehicleQuery.eq("operational_status", filters.operationalStatus);
  }

  if (filters.assignedOrganizationId) {
    vehicleQuery = vehicleQuery.eq("assigned_organization_id", filters.assignedOrganizationId);
  }

  if (filters.vehicleType) {
    vehicleQuery = vehicleQuery.ilike("vehicle_type", `%${sanitizeLike(filters.vehicleType)}%`);
  }

  if (filters.ownershipType !== "all") {
    vehicleQuery = vehicleQuery.eq("ownership_type", filters.ownershipType);
  }

  const searchFilter = await buildGlobalFleetSearchFilter(filters.search);
  if (searchFilter) {
    vehicleQuery = vehicleQuery.or(searchFilter);
  }

  const [{ data: vehicles, error: vehiclesError }, summary] = await Promise.all([
    vehicleQuery,
    getGlobalFleetSummaryCounts(category),
  ]);

  if (vehiclesError) {
    return { status: "load_error", vehicles: [], drivers: [], summary: emptyFleetSummary };
  }

  const vehicleRows = (vehicles ?? []) as FleetVehicleRow[];
  const driverIds = new Set<string>();
  vehicleRows.forEach((vehicle) => {
    if (vehicle.assigned_driver_id) driverIds.add(vehicle.assigned_driver_id);
    if (vehicle.authorized_driver_id) driverIds.add(vehicle.authorized_driver_id);
    if (vehicle.owner_driver_id) driverIds.add(vehicle.owner_driver_id);
  });

  const drivers = await getDriverOptionsByIds(Array.from(driverIds));
  const driverNames = new Map(drivers.map((driver) => [driver.id, driver]));
  const linkedDriversByVehicleId = await getLinkedDriversByVehicleId(
    vehicleRows.map((vehicle) => vehicle.id),
  );

  return {
    status: "success",
    vehicles: vehicleRows.map((vehicle) =>
      mapFleetVehicle(vehicle, driverNames, linkedDriversByVehicleId),
    ),
    drivers,
    summary,
  };
}

async function getLinkedDriversByVehicleId(vehicleIds: string[]) {
  const linkedDrivers = new Map<string, FleetLinkedDriver[]>();
  const ids = Array.from(new Set(vehicleIds.filter(Boolean)));

  if (ids.length === 0) {
    return linkedDrivers;
  }

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return linkedDrivers;
  }

  const { data, error } = await admin.supabase
    .from("drivers")
    .select("id, full_name, iqama_number, mobile_number, vehicle_id")
    .in("vehicle_id", ids)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return linkedDrivers;
  }

  for (const driver of (data ?? []) as LinkedDriverRow[]) {
    if (!driver.vehicle_id) {
      continue;
    }

    const current = linkedDrivers.get(driver.vehicle_id) ?? [];
    current.push({
      id: driver.id,
      fullName: driver.full_name,
      iqamaNumber: driver.iqama_number,
      mobileNumber: driver.mobile_number,
    });
    linkedDrivers.set(driver.vehicle_id, current);
  }

  return linkedDrivers;
}

async function getGlobalFleetSummaryCounts(
  category: FleetVehicleCategory,
): Promise<FleetSummaryCounts> {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return emptyFleetSummary;
  }

  const base = () =>
    admin.supabase
      .from("fleet_vehicles")
      .select("id", { count: "exact", head: true })
      .eq("vehicle_category", category);

  const [
    totalResult,
    healthyResult,
    accidentResult,
    maintenanceResult,
    operationalActiveResult,
    operationalSuspendedResult,
    archivedResult,
  ] = await Promise.all([
    base(),
    base().is("archived_at", null).eq("technical_status", "healthy"),
    base().is("archived_at", null).eq("technical_status", "accident"),
    base().is("archived_at", null).eq("fault_location", "in_maintenance"),
    base().is("archived_at", null).eq("operational_status", "active"),
    base().is("archived_at", null).eq("operational_status", "suspended"),
    base().not("archived_at", "is", null),
  ]);

  return {
    total: totalResult.error ? 0 : totalResult.count ?? 0,
    healthy: healthyResult.error ? 0 : healthyResult.count ?? 0,
    accident: accidentResult.error ? 0 : accidentResult.count ?? 0,
    maintenance: maintenanceResult.error ? 0 : maintenanceResult.count ?? 0,
    operationalActive: operationalActiveResult.error ? 0 : operationalActiveResult.count ?? 0,
    operationalSuspended: operationalSuspendedResult.error ? 0 : operationalSuspendedResult.count ?? 0,
    archived: archivedResult.error ? 0 : archivedResult.count ?? 0,
  };
}

async function buildGlobalFleetSearchFilter(search: string) {
  const value = sanitizeSearch(search);
  if (value.length < 2) {
    return "";
  }

  const driverIds = await findFleetSearchDriverIds(value);
  const organizationIds = await findFleetSearchOrganizationIds(value);
  const normalizedPlate = normalizePlateForFleet(value);
  const likeValue = sanitizeLike(value);
  const filters = [
    `plate_number.ilike.%${likeValue}%`,
    `normalized_plate_number.ilike.%${sanitizeLike(normalizedPlate)}%`,
    `vehicle_type.ilike.%${likeValue}%`,
    `owner_name.ilike.%${likeValue}%`,
    `manual_owner_name.ilike.%${likeValue}%`,
    `assigned_driver_manual_name.ilike.%${likeValue}%`,
    `assigned_driver_manual_iqama.ilike.%${likeValue}%`,
    `authorized_manual_name.ilike.%${likeValue}%`,
    `authorized_manual_iqama.ilike.%${likeValue}%`,
    `operating_card_number.ilike.%${likeValue}%`,
    `ownership_type.ilike.%${likeValue}%`,
  ];

  if (driverIds.length > 0) {
    const ids = driverIds.join(",");
    filters.push(`assigned_driver_id.in.(${ids})`);
    filters.push(`authorized_driver_id.in.(${ids})`);
    filters.push(`owner_driver_id.in.(${ids})`);
  }

  if (organizationIds.length > 0) {
    filters.push(`assigned_organization_id.in.(${organizationIds.join(",")})`);
  }

  return filters.join(",");
}

async function findFleetSearchDriverIds(search: string) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return [];
  }

  const searchQuery = normalizeDriverSearchQuery(search);
  if (searchQuery.length < 2) {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("drivers")
    .select("id")
    .or(
      [
        `full_name.ilike.%${searchQuery}%`,
        `iqama_number.ilike.%${searchQuery}%`,
        `mobile_number.ilike.%${searchQuery}%`,
      ].join(","),
    )
    .limit(200);

  if (error) {
    return [];
  }

  return (data ?? []).map((driver) => driver.id);
}

async function findFleetSearchOrganizationIds(search: string) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("organizations")
    .select("id")
    .ilike("name", `%${sanitizeLike(search)}%`)
    .limit(100);

  if (error) {
    return [];
  }

  return (data ?? []).map((organization) => organization.id);
}

export async function searchGlobalFleetDrivers(
  query: string,
  limit = 20,
): Promise<FleetDriverOption[]> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return [];
  }

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  if (admin.profile.role !== "system_owner" && !globalPermissions.has("fleet.view")) {
    return [];
  }

  const searchQuery = normalizeDriverSearchQuery(query);
  if (searchQuery.length < 2) {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("drivers")
    .select("id, full_name, iqama_number, mobile_number, organizations(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .or(
      [
        `full_name.ilike.%${searchQuery}%`,
        `iqama_number.ilike.%${searchQuery}%`,
        `mobile_number.ilike.%${searchQuery}%`,
      ].join(","),
    )
    .order("full_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) {
    return [];
  }

  return ((data ?? []) as DriverOptionRow[]).map(mapDriverOption);
}

export async function getFleetDriverOptions(
  organizationId: string,
): Promise<
  | { status: "success"; drivers: FleetDriverOption[] }
  | { status: "load_error"; drivers: [] }
> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "load_error", drivers: [] };
  }

  const { data, error } = await admin.supabase
    .from("drivers")
    .select("id, full_name, iqama_number, mobile_number, organizations(name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return { status: "load_error", drivers: [] };
  }

  return {
    status: "success",
    drivers: ((data ?? []) as DriverOptionRow[]).map(mapDriverOption),
  };
}

async function getDriverOptionsByIds(driverIds: string[]) {
  if (driverIds.length === 0) {
    return [];
  }

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("drivers")
    .select("id, full_name, iqama_number, mobile_number, organizations(name)")
    .in("id", driverIds);

  if (error) {
    return [];
  }

  return ((data ?? []) as DriverOptionRow[]).map(mapDriverOption);
}

function mapDriverOption(driver: DriverOptionRow): FleetDriverOption {
  const organization = Array.isArray(driver.organizations)
    ? driver.organizations[0]
    : driver.organizations;

  return {
    id: driver.id,
    fullName: driver.full_name,
    iqamaNumber: driver.iqama_number,
    mobileNumber: driver.mobile_number,
    organizationName: organization?.name,
  };
}

function normalizeDriverSearchQuery(query: string) {
  return query
    .normalize("NFKC")
    .trim()
    .replace(/[%,*()"]/g, " ")
    .replace(/\s+/g, "%");
}

function sanitizeSearch(query: string) {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function sanitizeLike(value: string) {
  return value.normalize("NFKC").trim().replace(/[%,*()"]/g, " ").replace(/\s+/g, "%");
}

export async function getFleetActivityLogs({
  organizationId,
  vehicleId,
}: {
  organizationId: string;
  vehicleId: string;
}): Promise<FleetActivityLog[]> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("fleet_vehicle_activity_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (error) return [];

  const rows = (data ?? []) as FleetActivityRow[];
  const actorNames = await getProfileNames(
    Array.from(new Set(rows.map((row) => row.actor_user_id))),
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action as FleetActivityLog["action"],
    actorName: actorNames.get(row.actor_user_id) ?? "-",
    oldValues: row.old_values,
    newValues: row.new_values,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function getGlobalFleetActivityLogs({
  vehicleId,
}: {
  vehicleId: string;
}): Promise<FleetActivityLog[]> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return [];
  }

  const { data, error } = await admin.supabase
    .from("fleet_vehicle_activity_logs")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (error) return [];

  const rows = (data ?? []) as FleetActivityRow[];
  const actorNames = await getProfileNames(
    Array.from(new Set(rows.map((row) => row.actor_user_id))),
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action as FleetActivityLog["action"],
    actorName: actorNames.get(row.actor_user_id) ?? "-",
    oldValues: row.old_values,
    newValues: row.new_values,
    note: row.note,
    createdAt: row.created_at,
  }));
}

function mapFleetVehicle(
  row: FleetVehicleRow,
  drivers: Map<string, FleetDriverOption>,
  linkedDriversByVehicleId: Map<string, FleetLinkedDriver[]> = new Map(),
): FleetVehicle {
  const assignedDriver = row.assigned_driver_id
    ? drivers.get(row.assigned_driver_id)
    : undefined;
  const authorizedDriver = row.authorized_driver_id
    ? drivers.get(row.authorized_driver_id)
    : undefined;
  const ownerDriver = row.owner_driver_id
    ? drivers.get(row.owner_driver_id)
    : undefined;
  const fallbackOwnerName =
    row.owner_source === "organization" ? "" : (row.manual_owner_name ?? "-");

  return {
    id: row.id,
    category: row.vehicle_category as FleetVehicleCategory,
    vehicleType: row.vehicle_type,
    plateNumber: row.plate_number,
    normalizedPlateNumber: row.normalized_plate_number,
    ownerSource: row.owner_source as FleetVehicle["ownerSource"],
    ownerName: row.owner_name ?? fallbackOwnerName,
    manualOwnerName: row.manual_owner_name,
    ownershipType: row.ownership_type as FleetVehicle["ownershipType"],
    currentOwnerName: row.owner_name,
    ownerDriverId: row.owner_driver_id,
    ownerDriverName: ownerDriver?.fullName ?? null,
    ownerDriverIqama: ownerDriver?.iqamaNumber ?? null,
    ownerDriverMobile: ownerDriver?.mobileNumber ?? null,
    ownerContactPhone: row.owner_contact_phone,
    rentalStartDate: row.rental_start_date,
    rentalEndDate: row.rental_end_date,
    rentalMonthlyCost: row.rental_monthly_cost,
    ownershipContractNumber: row.ownership_contract_number,
    ownershipNotes: row.ownership_notes,
    operatingCardNumber: row.operating_card_number,
    operatingCardExpiryDate: row.operating_card_expiry_date,
    operatingCardFileName: row.operating_card_file_name,
    operatingCardFilePath: row.operating_card_file_path,
    operatingCardMimeType: row.operating_card_mime_type,
    assignedDriverSource: row.assigned_driver_source as FleetVehicle["assignedDriverSource"],
    assignedDriverId: row.assigned_driver_id,
    assignedDriverName:
      assignedDriver?.fullName ?? row.assigned_driver_manual_name ?? null,
    assignedDriverIqama:
      assignedDriver?.iqamaNumber ?? row.assigned_driver_manual_iqama ?? null,
    linkedDrivers: linkedDriversByVehicleId.get(row.id) ?? [],
    assignedDriverManualName: row.assigned_driver_manual_name,
    assignedDriverManualIqama: row.assigned_driver_manual_iqama,
    authorizedPersonSource: row.authorized_person_source as FleetVehicle["authorizedPersonSource"],
    authorizedDriverId: row.authorized_driver_id,
    authorizedPersonName:
      authorizedDriver?.fullName ?? row.authorized_manual_name ?? null,
    authorizedPersonIqama:
      authorizedDriver?.iqamaNumber ?? row.authorized_manual_iqama ?? null,
    authorizedManualName: row.authorized_manual_name,
    authorizedManualIqama: row.authorized_manual_iqama,
    authorizationExpiryDate: row.authorization_expiry_date,
    operationalStatus: row.operational_status as FleetVehicle["operationalStatus"],
    technicalStatus: row.technical_status as FleetVehicle["technicalStatus"],
    faultLocation: row.fault_location as FleetVehicle["faultLocation"],
    technicalStatusNote: row.technical_status_note,
    notes: row.notes,
    archivedAt: row.archived_at,
    assignedOrganizationId: row.assigned_organization_id ?? null,
  };
}

async function getProfileNames(profileIds: string[]) {
  const names = new Map<string, string>();
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized" || profileIds.length === 0) {
    return names;
  }

  const { data, error } = await admin.supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds);

  if (error) return names;

  for (const profile of (data ?? []) as ProfileNameRow[]) {
    names.set(profile.id, profile.full_name);
  }

  return names;
}
