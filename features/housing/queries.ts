import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getGlobalPermissions } from "@/features/permissions/server";
import type {
  HousingDetailsResult,
  HousingDriverOption,
  HousingListResult,
  HousingMoveTarget,
  HousingPermissionFlags,
  HousingRoomSummary,
  HousingStatus,
} from "@/features/housing/types";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import type { Database } from "@/types/database";

type HousingRow = Database["public"]["Tables"]["housing_units"]["Row"];
type HousingRoomRow = Database["public"]["Tables"]["housing_rooms"]["Row"];
type HousingOrgAssignmentRow = Database["public"]["Tables"]["housing_organization_assignments"]["Row"];
type HousingDriverAssignmentRow = Database["public"]["Tables"]["housing_driver_assignments"]["Row"];

type OrganizationRow = {
  id: string;
  name: string;
  code: string | null;
};

type DriverRow = {
  id: string;
  full_name: string;
  iqama_number: string | null;
  mobile_number: string | null;
  organization_id: string;
  organizations?: { name: string } | { name: string }[] | null;
};

type ActivityRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

export async function getGlobalHousingPageData({
  includeArchived,
}: {
  includeArchived: boolean;
}): Promise<HousingListResult> {
  const access = await getHousingAccess("housing.view");
  if (!access.success) return { status: "unauthorized", housing: [] };

  const service = getServiceClientOrNull();
  if (!service) return { status: "load_error", housing: [] };

  let housingQuery = service
    .from("housing_units")
    .select("id, name, code, address, city, location_notes, latitude, longitude, capacity, status, notes, archived_at, created_at, updated_at, created_by, updated_by, archived_by")
    .order("created_at", { ascending: false });

  if (!includeArchived) {
    housingQuery = housingQuery.is("archived_at", null);
  }

  const { data: housingRows, error: housingError } = await housingQuery;
  if (housingError) return { status: "load_error", housing: [] };

  const housing = (housingRows ?? []) as HousingRow[];
  const housingIds = housing.map((unit) => unit.id);
  const [{ occupancyByHousingId, occupancyByRoomId }, activeOrganizations, roomsByHousingId] = await Promise.all([
    loadOccupancy(service, housingIds),
    loadActiveOrganizationAssignments(service, housingIds),
    loadRooms(service, housingIds),
  ]);

  return {
    status: "success",
    housing: housing.map((unit) =>
      mapHousingSummary(
        unit,
        occupancyByHousingId.get(unit.id) ?? 0,
        activeOrganizations.get(unit.id) ?? [],
        mapRoomSummaries(roomsByHousingId.get(unit.id) ?? [], occupancyByRoomId),
      ),
    ),
    permissions: access.permissions,
  };
}

export async function getHousingDetails(housingId: string): Promise<HousingDetailsResult> {
  const access = await getHousingAccess("housing.view");
  if (!access.success) return { status: "unauthorized", housing: null };

  const service = getServiceClientOrNull();
  if (!service) return { status: "load_error", housing: null };

  const { data: unit, error: unitError } = await service
    .from("housing_units")
    .select("id, name, code, address, city, location_notes, latitude, longitude, capacity, status, notes, archived_at, created_at, updated_at, created_by, updated_by, archived_by")
    .eq("id", housingId)
    .maybeSingle();

  if (unitError) return { status: "load_error", housing: null };
  if (!unit) return { status: "not_found", housing: null };

  const [
    { occupancyByHousingId, occupancyByRoomId },
    activeOrganizations,
    roomsByHousingId,
    allOrganizations,
    moveTargets,
    residents,
    assignmentHistory,
    activities,
  ] = await Promise.all([
    loadOccupancy(service, [housingId]),
    loadActiveOrganizationAssignments(service, [housingId]),
    loadRooms(service, [housingId]),
    loadOrganizations(service),
    loadHousingMoveTargets(service, housingId),
    loadResidents(service, housingId),
    loadAssignmentHistory(service, housingId),
    access.permissions.activity ? loadActivities(service, housingId) : Promise.resolve([]),
  ]);

  const summary = mapHousingSummary(
    unit as HousingRow,
    occupancyByHousingId.get(housingId) ?? 0,
    activeOrganizations.get(housingId) ?? [],
    mapRoomSummaries(roomsByHousingId.get(housingId) ?? [], occupancyByRoomId),
  );

  return {
    status: "success",
    housing: {
      ...summary,
      rooms: mapRoomSummaries(roomsByHousingId.get(housingId) ?? [], occupancyByRoomId),
      residents,
      organizationAssignments: activeOrganizations.get(housingId) ?? [],
      assignmentHistory,
      activities,
    },
    organizations: allOrganizations,
    moveTargets,
    permissions: access.permissions,
  };
}

export async function searchHousingDrivers(query: string, limit = 50): Promise<HousingDriverOption[]> {
  const access = await getHousingAccess("housing.assign_drivers");
  if (!access.success) return [];

  const normalized = query.normalize("NFKC").trim();
  if (normalized.length < 2) return [];

  const service = getServiceClientOrNull();
  if (!service) return [];

  const search = normalized.replace(/[%,*()"]/g, " ").replace(/\s+/g, "%");
  const { data: matchingOrganizations } = await service
    .from("organizations")
    .select("id")
    .ilike("name", `%${search}%`)
    .limit(50);
  const organizationIds = ((matchingOrganizations ?? []) as Pick<OrganizationRow, "id">[]).map((organization) => organization.id);
  const orFilters = [
    `full_name.ilike.%${search}%`,
    `iqama_number.ilike.%${search}%`,
    `mobile_number.ilike.%${search}%`,
  ];
  if (organizationIds.length > 0) {
    orFilters.push(`organization_id.in.(${organizationIds.join(",")})`);
  }

  const { data, error } = await service
    .from("drivers")
    .select("id, full_name, iqama_number, mobile_number, organization_id, organizations(name)")
    .eq("status", "active")
    .is("deleted_at", null)
    .or(orFilters.join(","))
    .order("full_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) return [];

  const driverRows = (data ?? []) as DriverRow[];
  const currentHousingByDriverId = await loadCurrentHousingForDrivers(
    service,
    driverRows.map((driver) => driver.id),
  );

  return driverRows.map((driver) => ({
    id: driver.id,
    fullName: driver.full_name,
    iqamaNumber: driver.iqama_number,
    mobileNumber: driver.mobile_number,
    organizationName: getJoinedOrganizationName(driver.organizations),
    currentHousingName: currentHousingByDriverId.get(driver.id) ?? null,
  }));
}

async function getHousingAccess(permissionKey: GlobalPermissionKey) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return { success: false as const };

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  const permissions = getPermissionFlags(globalPermissions);
  if (!globalPermissions.has(permissionKey)) {
    return { success: false as const };
  }

  return {
    success: true as const,
    actorUserId: admin.profile.id,
    permissions,
  };
}

function getPermissionFlags(globalPermissions: Set<string>): HousingPermissionFlags {
  return {
    view: globalPermissions.has("housing.view"),
    create: globalPermissions.has("housing.create"),
    update: globalPermissions.has("housing.update"),
    archive: globalPermissions.has("housing.archive"),
    assignOrganizations: globalPermissions.has("housing.assign_organizations"),
    assignDrivers: globalPermissions.has("housing.assign_drivers"),
    activity: globalPermissions.has("housing.activity.view"),
  };
}

async function loadOccupancy(service: ReturnType<typeof createAdminClient>, housingIds: string[]) {
  const occupancyByHousingId = new Map<string, number>();
  const occupancyByRoomId = new Map<string, number>();
  if (housingIds.length === 0) return { occupancyByHousingId, occupancyByRoomId };

  const { data } = await service
    .from("housing_driver_assignments")
    .select("housing_id, room_id")
    .in("housing_id", housingIds)
    .is("unassigned_at", null);

  for (const row of (data ?? []) as Pick<HousingDriverAssignmentRow, "housing_id" | "room_id">[]) {
    occupancyByHousingId.set(row.housing_id, (occupancyByHousingId.get(row.housing_id) ?? 0) + 1);
    if (row.room_id) {
      occupancyByRoomId.set(row.room_id, (occupancyByRoomId.get(row.room_id) ?? 0) + 1);
    }
  }

  return { occupancyByHousingId, occupancyByRoomId };
}

async function loadRooms(service: ReturnType<typeof createAdminClient>, housingIds: string[]) {
  const roomsByHousingId = new Map<string, HousingRoomRow[]>();
  if (housingIds.length === 0) return roomsByHousingId;

  const { data } = await service
    .from("housing_rooms")
    .select("id, housing_id, name, code, capacity, status, notes, created_at, updated_at, archived_at, created_by, updated_by, archived_by")
    .in("housing_id", housingIds)
    .is("archived_at", null)
    .order("name", { ascending: true });

  for (const room of (data ?? []) as HousingRoomRow[]) {
    const existing = roomsByHousingId.get(room.housing_id) ?? [];
    existing.push(room);
    roomsByHousingId.set(room.housing_id, existing);
  }

  return roomsByHousingId;
}

async function loadActiveOrganizationAssignments(service: ReturnType<typeof createAdminClient>, housingIds: string[]) {
  const assignmentsByHousingId = new Map<string, ReturnType<typeof mapOrganizationAssignment>[]>();
  if (housingIds.length === 0) return assignmentsByHousingId;

  const { data } = await service
    .from("housing_organization_assignments")
    .select("id, housing_id, organization_id, active, assigned_at, unassigned_at, organizations(id, name, code)")
    .in("housing_id", housingIds)
    .eq("active", true)
    .order("assigned_at", { ascending: false });

  for (const row of (data ?? []) as Array<HousingOrgAssignmentRow & { organizations?: OrganizationRow | OrganizationRow[] | null }>) {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!organization) continue;
    const mapped = mapOrganizationAssignment(row, organization);
    const existing = assignmentsByHousingId.get(row.housing_id) ?? [];
    existing.push(mapped);
    assignmentsByHousingId.set(row.housing_id, existing);
  }

  return assignmentsByHousingId;
}

async function loadOrganizations(service: ReturnType<typeof createAdminClient>) {
  const { data } = await service
    .from("organizations")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return ((data ?? []) as OrganizationRow[]).map((organization) => ({
    id: organization.id,
    name: organization.name,
    code: organization.code,
  }));
}

async function loadHousingMoveTargets(
  service: ReturnType<typeof createAdminClient>,
  currentHousingId: string,
): Promise<HousingMoveTarget[]> {
  const { data } = await service
    .from("housing_units")
    .select("id, name, code, city, capacity, status")
    .neq("id", currentHousingId)
    .is("archived_at", null)
    .in("status", ["active", "full"])
    .order("name", { ascending: true });

  const rows = (data ?? []) as Pick<HousingRow, "id" | "name" | "code" | "city" | "capacity" | "status">[];
  const [{ occupancyByHousingId, occupancyByRoomId }, roomsByHousingId] = await Promise.all([
    loadOccupancy(service, rows.map((row) => row.id)),
    loadRooms(service, rows.map((row) => row.id)),
  ]);

  return rows.map((row) => {
    const occupied = occupancyByHousingId.get(row.id) ?? 0;
    const rooms = mapRoomSummaries(roomsByHousingId.get(row.id) ?? [], occupancyByRoomId);
    const capacityRooms = rooms.filter((room) => room.status === "active" || room.status === "full");
    const capacity = rooms.length > 0 ? capacityRooms.reduce((sum, room) => sum + room.capacity, 0) : row.capacity;
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      city: row.city,
      capacity,
      occupied,
      available: Math.max(capacity - occupied, 0),
      status: row.status as HousingStatus,
    };
  });
}

async function loadResidents(service: ReturnType<typeof createAdminClient>, housingId: string) {
  const { data } = await service
    .from("housing_driver_assignments")
    .select("id, housing_id, room_id, driver_id, assigned_at, unassigned_at, notes, drivers(id, full_name, iqama_number, mobile_number, organizations(name)), housing_rooms(id, name)")
    .eq("housing_id", housingId)
    .is("unassigned_at", null)
    .order("assigned_at", { ascending: false });

  type ResidentAssignmentRow = Pick<HousingDriverAssignmentRow, "id" | "housing_id" | "room_id" | "driver_id" | "assigned_at" | "unassigned_at" | "notes"> & {
    drivers?: DriverRow | DriverRow[] | null;
    housing_rooms?: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  return ((data ?? []) as unknown as ResidentAssignmentRow[]).flatMap((row) => {
    const driver = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
    if (!driver) return [];
    return [{
      assignmentId: row.id,
      driverId: driver.id,
      fullName: driver.full_name,
      iqamaNumber: driver.iqama_number,
      mobileNumber: driver.mobile_number,
      organizationName: getJoinedOrganizationName(driver.organizations),
      roomId: row.room_id,
      roomName: getJoinedRoomName(row.housing_rooms),
      assignedAt: row.assigned_at,
      notes: row.notes,
    }];
  });
}

async function loadAssignmentHistory(service: ReturnType<typeof createAdminClient>, housingId: string) {
  const [driverResult, organizationResult] = await Promise.all([
    service
      .from("housing_driver_assignments")
      .select("id, housing_id, room_id, driver_id, assigned_at, unassigned_at, notes, drivers(full_name), housing_rooms(name)")
      .eq("housing_id", housingId)
      .order("assigned_at", { ascending: false })
      .limit(100),
    service
      .from("housing_organization_assignments")
      .select("id, housing_id, organization_id, active, assigned_at, unassigned_at, organizations(name)")
      .eq("housing_id", housingId)
      .order("assigned_at", { ascending: false })
      .limit(100),
  ]);

  const drivers = ((driverResult.data ?? []) as Array<HousingDriverAssignmentRow & { drivers?: { full_name: string } | { full_name: string }[] | null; housing_rooms?: { name: string } | { name: string }[] | null }>).map((row) => {
    const driver = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
    const room = Array.isArray(row.housing_rooms) ? row.housing_rooms[0] : row.housing_rooms;
    return {
      id: row.id,
      type: "driver" as const,
      subject: [driver?.full_name ?? row.driver_id, room?.name].filter(Boolean).join(" - "),
      assignedAt: row.assigned_at,
      unassignedAt: row.unassigned_at,
      notes: row.notes,
    };
  });

  const organizations = ((organizationResult.data ?? []) as Array<HousingOrgAssignmentRow & { organizations?: { name: string } | { name: string }[] | null }>).map((row) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    return {
      id: row.id,
      type: "organization" as const,
      subject: organization?.name ?? row.organization_id,
      assignedAt: row.assigned_at,
      unassignedAt: row.unassigned_at,
      notes: null,
    };
  });

  return [...drivers, ...organizations].sort((first, second) =>
    second.assignedAt.localeCompare(first.assignedAt),
  );
}

async function loadActivities(service: ReturnType<typeof createAdminClient>, housingId: string) {
  const { data } = await service
    .from("activity_logs")
    .select("id, action, actor_user_id, created_at")
    .eq("entity_type", "housing")
    .contains("metadata", { housing_id: housingId })
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as ActivityRow[];
  const actorIds = Array.from(new Set(rows.map((row) => row.actor_user_id).filter(Boolean))) as string[];
  const names = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const profile of (profiles ?? []) as ProfileRow[]) {
      names.set(profile.id, profile.full_name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor_user_id ? names.get(row.actor_user_id) ?? null : null,
    createdAt: row.created_at,
  }));
}

async function loadCurrentHousingForDrivers(service: ReturnType<typeof createAdminClient>, driverIds: string[]) {
  const names = new Map<string, string>();
  if (driverIds.length === 0) return names;

  const { data } = await service
    .from("housing_driver_assignments")
    .select("driver_id, housing_units(name)")
    .in("driver_id", driverIds)
    .is("unassigned_at", null);

  for (const row of (data ?? []) as Array<{ driver_id: string; housing_units?: { name: string } | { name: string }[] | null }>) {
    const housing = Array.isArray(row.housing_units) ? row.housing_units[0] : row.housing_units;
    if (housing?.name) names.set(row.driver_id, housing.name);
  }

  return names;
}

function mapHousingSummary(unit: HousingRow, occupied: number, organizations: ReturnType<typeof mapOrganizationAssignment>[], rooms: HousingRoomSummary[] = []) {
  const capacityRooms = rooms.filter((room) => room.status === "active" || room.status === "full");
  const capacity = rooms.length > 0 ? capacityRooms.reduce((sum, room) => sum + room.capacity, 0) : unit.capacity;
  const available = Math.max(capacity - occupied, 0);
  const utilization = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;
  const displayStatus = occupied >= capacity ? "full" : unit.status as HousingStatus;

  return {
    id: unit.id,
    name: unit.name,
    code: unit.code,
    address: unit.address,
    city: unit.city,
    locationNotes: unit.location_notes,
    latitude: unit.latitude,
    longitude: unit.longitude,
    capacity,
    status: unit.status as HousingStatus,
    notes: unit.notes,
    archivedAt: unit.archived_at,
    roomCount: rooms.length,
    occupied,
    available,
    utilization,
    displayStatus,
    organizations,
  };
}

function mapRoomSummaries(rooms: HousingRoomRow[], occupancyByRoomId: Map<string, number>): HousingRoomSummary[] {
  return rooms.map((room) => {
    const occupied = occupancyByRoomId.get(room.id) ?? 0;
    const available = Math.max(room.capacity - occupied, 0);
    const utilization = room.capacity > 0 ? Math.round((occupied / room.capacity) * 100) : 0;
    const displayStatus = occupied >= room.capacity ? "full" : room.status as HousingStatus;
    return {
      id: room.id,
      housingId: room.housing_id,
      name: room.name,
      code: room.code,
      capacity: room.capacity,
      status: room.status as HousingStatus,
      notes: room.notes,
      archivedAt: room.archived_at,
      occupied,
      available,
      utilization,
      displayStatus,
    };
  });
}

function mapOrganizationAssignment(row: HousingOrgAssignmentRow, organization: OrganizationRow) {
  return {
    id: organization.id,
    name: organization.name,
    code: organization.code,
    assignmentId: row.id,
    active: row.active,
    assignedAt: row.assigned_at,
    unassignedAt: row.unassigned_at,
  };
}

function getJoinedOrganizationName(value: DriverRow["organizations"]) {
  const organization = Array.isArray(value) ? value[0] : value;
  return organization?.name ?? null;
}

function getJoinedRoomName(value: { id: string; name: string } | { id: string; name: string }[] | null | undefined) {
  const room = Array.isArray(value) ? value[0] : value;
  return room?.name ?? null;
}

function getServiceClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
