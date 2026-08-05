import "server-only";

import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  FleetActivityLog,
  FleetActivityRow,
  FleetDriverOption,
  FleetPageData,
  FleetVehicle,
  FleetVehicleCategory,
  FleetVehicleRow,
} from "@/features/fleet/types";
import type { Database } from "@/types/database";

type DriverOptionRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  "id" | "full_name" | "iqama_number"
>;
type ProfileNameRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name"
>;

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
    return { status: "unauthorized", vehicles: [], drivers: [] };
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
    return { status: "load_error", vehicles: [], drivers: [] };
  }

  const driverNames = new Map(drivers.drivers.map((driver) => [driver.id, driver]));

  return {
    status: "success",
    vehicles: ((vehicles ?? []) as FleetVehicleRow[]).map((vehicle) =>
      mapFleetVehicle(vehicle, driverNames),
    ),
    drivers: drivers.drivers,
  };
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
    .select("id, full_name, iqama_number")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return { status: "load_error", drivers: [] };
  }

  return {
    status: "success",
    drivers: ((data ?? []) as DriverOptionRow[]).map((driver) => ({
      id: driver.id,
      fullName: driver.full_name,
      iqamaNumber: driver.iqama_number,
    })),
  };
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

function mapFleetVehicle(
  row: FleetVehicleRow,
  drivers: Map<string, FleetDriverOption>,
): FleetVehicle {
  const assignedDriver = row.assigned_driver_id
    ? drivers.get(row.assigned_driver_id)
    : undefined;
  const authorizedDriver = row.authorized_driver_id
    ? drivers.get(row.authorized_driver_id)
    : undefined;

  return {
    id: row.id,
    category: row.vehicle_category as FleetVehicleCategory,
    vehicleType: row.vehicle_type,
    plateNumber: row.plate_number,
    normalizedPlateNumber: row.normalized_plate_number,
    ownerSource: row.owner_source as FleetVehicle["ownerSource"],
    ownerName:
      row.owner_source === "organization"
        ? ""
        : (row.manual_owner_name ?? "-"),
    manualOwnerName: row.manual_owner_name,
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
