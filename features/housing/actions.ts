"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getGlobalPermissions } from "@/features/permissions/server";
import { normalizeHousingInput, normalizeHousingRoomInput, isUuid } from "@/features/housing/validation";
import type { HousingActionCode, HousingActionState } from "@/features/housing/types";
import { searchHousingDrivers } from "@/features/housing/queries";
import type { HousingDriverOption } from "@/features/housing/types";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import { isLocale } from "@/types/locale";
import type { Json } from "@/types/database";

export async function searchHousingDriversAction(query: string): Promise<HousingDriverOption[]> {
  return searchHousingDrivers(query);
}

export async function createHousingAction(
  _previousState: HousingActionState,
  formData: FormData,
): Promise<HousingActionState> {
  return saveHousing(formData, "create");
}

export async function updateHousingAction(
  _previousState: HousingActionState,
  formData: FormData,
): Promise<HousingActionState> {
  return saveHousing(formData, "update");
}

export async function archiveHousingAction(formData: FormData) {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const archived = getString(formData, "archived") === "true";

  if (!isLocale(locale) || !isUuid(housingId)) return;

  const access = await getHousingActionAccess("housing.archive");
  if (!access.success) return;

  const service = getServiceClientOrNull();
  if (!service) return;

  const { data: existing } = await service
    .from("housing_units")
    .select("id, name, archived_at")
    .eq("id", housingId)
    .maybeSingle();

  if (!existing) return;

  const now = new Date().toISOString();
  await service
    .from("housing_units")
    .update({
      archived_at: archived ? now : null,
      archived_by: archived ? access.actorUserId : null,
      updated_at: now,
      updated_by: access.actorUserId,
    })
    .eq("id", housingId);

  await insertHousingActivity({
    service,
    actorUserId: access.actorUserId,
    housingId,
    action: archived ? "housing_archived" : "housing_restored",
    beforeData: { archived_at: existing.archived_at },
    afterData: { archived_at: archived ? now : null },
  });

  revalidateHousingPaths(locale, housingId);
}

export async function assignHousingOrganizationAction(formData: FormData): Promise<HousingActionState> {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const organizationId = getString(formData, "organizationId");

  if (!isLocale(locale) || !isUuid(housingId) || !isUuid(organizationId)) {
    return { status: "validation_error", code: "validation_error" };
  }

  const result = await callHousingRpc("set_housing_organization_assignment", {
    p_housing_id: housingId,
    p_organization_id: organizationId,
    p_active: true,
  });
  if (!result.success) return { status: "error", code: result.code };

  revalidateHousingPaths(locale, housingId);
  return { status: "success", code: "success" };
}

export async function assignHousingOrganizationsByIdsAction({
  locale,
  housingId,
  organizationIds,
}: {
  locale: string;
  housingId: string;
  organizationIds: string[];
}): Promise<HousingActionState> {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds));

  if (
    !isLocale(locale)
    || !isUuid(housingId)
    || uniqueOrganizationIds.length === 0
    || uniqueOrganizationIds.some((organizationId) => !isUuid(organizationId))
  ) {
    return { status: "validation_error", code: "validation_error" };
  }

  for (const organizationId of uniqueOrganizationIds) {
    const result = await callHousingRpc("set_housing_organization_assignment", {
      p_housing_id: housingId,
      p_organization_id: organizationId,
      p_active: true,
    });
    if (!result.success) return { status: "error", code: result.code };
  }

  revalidateHousingPaths(locale, housingId);
  return { status: "success", code: "success" };
}

export async function unassignHousingOrganizationAction(formData: FormData): Promise<void> {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const organizationId = getString(formData, "organizationId");

  if (!isLocale(locale) || !isUuid(housingId) || !isUuid(organizationId)) {
    return;
  }

  const result = await callHousingRpc("set_housing_organization_assignment", {
    p_housing_id: housingId,
    p_organization_id: organizationId,
    p_active: false,
  });
  if (!result.success) return;

  revalidateHousingPaths(locale, housingId);
}

export async function assignHousingDriverAction(
  _previousState: HousingActionState,
  formData: FormData,
): Promise<HousingActionState> {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const driverId = getString(formData, "driverId");
  const notes = getString(formData, "notes") || null;

  if (!isLocale(locale) || !isUuid(housingId) || !isUuid(driverId)) {
    return { status: "validation_error", code: "validation_error" };
  }

  const result = await callHousingRpc("assign_driver_to_housing", {
    p_housing_id: housingId,
    p_driver_id: driverId,
    p_notes: notes,
  });
  if (!result.success) return { status: "error", code: result.code };

  revalidateHousingPaths(locale, housingId);
  return { status: "success", code: "success" };
}

export async function assignHousingDriverByIdAction({
  locale,
  housingId,
  roomId,
  driverId,
  notes,
}: {
  locale: string;
  housingId: string;
  roomId?: string | null;
  driverId: string;
  notes?: string | null;
}): Promise<HousingActionState> {
  if (!isLocale(locale) || !isUuid(housingId) || !isUuid(driverId) || (roomId && !isUuid(roomId))) {
    return { status: "validation_error", code: "validation_error" };
  }

  const result = roomId
    ? await callHousingRpc("assign_driver_to_housing_room", {
        p_housing_id: housingId,
        p_room_id: roomId,
        p_driver_id: driverId,
        p_notes: notes || null,
      })
    : await callHousingRpc("assign_driver_to_housing", {
        p_housing_id: housingId,
        p_driver_id: driverId,
        p_notes: notes || null,
      });
  if (!result.success) return { status: "error", code: result.code };

  revalidateHousingPaths(locale, housingId);
  return { status: "success", code: "success" };
}

export async function saveHousingRoomAction(
  _previousState: HousingActionState,
  formData: FormData,
): Promise<HousingActionState> {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const roomId = getString(formData, "roomId");
  const mode = roomId ? "update" : "create";

  if (!isLocale(locale) || !isUuid(housingId) || (roomId && !isUuid(roomId))) {
    return { status: "validation_error", code: "validation_error" };
  }

  const normalized = normalizeHousingRoomInput({
    name: getString(formData, "name"),
    code: getString(formData, "code"),
    capacity: getString(formData, "capacity"),
    status: getString(formData, "status"),
    notes: getString(formData, "notes"),
  });

  if (!normalized.valid) {
    return { status: "validation_error", code: "validation_error" };
  }

  const access = await getHousingActionAccess("housing.update");
  if (!access.success) return { status: "error", code: "unauthorized" };

  const service = getServiceClientOrNull();
  if (!service) return { status: "error", code: "configuration_error" };

  if (mode === "update") {
    const occupancy = await getActiveRoomOccupancy(service, roomId);
    if (normalized.input.capacity < occupancy) {
      return { status: "validation_error", code: "room_capacity_below_occupancy" };
    }
  }

  const now = new Date().toISOString();
  const patch = {
    housing_id: housingId,
    name: normalized.input.name,
    code: normalized.input.code,
    capacity: normalized.input.capacity,
    status: normalized.input.status,
    notes: normalized.input.notes,
    updated_at: now,
    updated_by: access.actorUserId,
  };

  if (mode === "create") {
    const { data, error } = await service
      .from("housing_rooms")
      .insert({ ...patch, created_by: access.actorUserId })
      .select("id")
      .maybeSingle();

    if (error || !data) return { status: "error", code: mapHousingError(error?.message, error?.code) };

    await insertHousingActivity({
      service,
      actorUserId: access.actorUserId,
      housingId,
      action: "housing_room_created",
      entityId: data.id,
      afterData: patch,
    });
    revalidateHousingPaths(locale, housingId);
    return { status: "success", code: "success" };
  }

  const { data: existing } = await service
    .from("housing_rooms")
    .select("id, housing_id, name, code, capacity, status, notes")
    .eq("id", roomId)
    .eq("housing_id", housingId)
    .maybeSingle();

  if (!existing) return { status: "error", code: "room_unavailable" };

  const { error } = await service
    .from("housing_rooms")
    .update(patch)
    .eq("id", roomId)
    .eq("housing_id", housingId);

  if (error) return { status: "error", code: mapHousingError(error.message, error.code) };

  await insertHousingActivity({
    service,
    actorUserId: access.actorUserId,
    housingId,
    action: "housing_room_updated",
    entityId: roomId,
    beforeData: existing as unknown as Json,
    afterData: patch,
  });
  revalidateHousingPaths(locale, housingId);
  return { status: "success", code: "success" };
}

export async function archiveHousingRoomAction(formData: FormData): Promise<void> {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const roomId = getString(formData, "roomId");

  if (!isLocale(locale) || !isUuid(housingId) || !isUuid(roomId)) return;

  const access = await getHousingActionAccess("housing.update");
  if (!access.success) return;

  const service = getServiceClientOrNull();
  if (!service) return;

  const occupancy = await getActiveRoomOccupancy(service, roomId);
  if (occupancy > 0) return;

  const now = new Date().toISOString();
  const { data: existing } = await service
    .from("housing_rooms")
    .select("id, archived_at")
    .eq("id", roomId)
    .eq("housing_id", housingId)
    .maybeSingle();
  if (!existing) return;

  await service
    .from("housing_rooms")
    .update({
      archived_at: now,
      archived_by: access.actorUserId,
      updated_at: now,
      updated_by: access.actorUserId,
    })
    .eq("id", roomId)
    .eq("housing_id", housingId);

  await insertHousingActivity({
    service,
    actorUserId: access.actorUserId,
    housingId,
    action: "housing_room_archived",
    entityId: roomId,
    beforeData: existing as unknown as Json,
    afterData: { archived_at: now },
  });
  revalidateHousingPaths(locale, housingId);
}

export async function removeHousingDriverAction(formData: FormData) {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");
  const driverId = getString(formData, "driverId");

  if (!isLocale(locale) || !isUuid(housingId) || !isUuid(driverId)) return;

  const result = await callHousingRpc("remove_driver_from_housing", {
    p_housing_id: housingId,
    p_driver_id: driverId,
  });

  if (result.success) {
    revalidateHousingPaths(locale, housingId);
  }
}

export async function moveHousingDriverAction(
  _previousState: HousingActionState,
  formData: FormData,
): Promise<HousingActionState> {
  const locale = getString(formData, "locale");
  const currentHousingId = getString(formData, "currentHousingId");
  const targetHousingId = getString(formData, "targetHousingId");
  const driverId = getString(formData, "driverId");
  const notes = getString(formData, "notes") || null;

  if (!isLocale(locale) || !isUuid(currentHousingId) || !isUuid(targetHousingId) || !isUuid(driverId)) {
    return { status: "validation_error", code: "validation_error" };
  }

  const result = await callHousingRpc("assign_driver_to_housing", {
    p_housing_id: targetHousingId,
    p_driver_id: driverId,
    p_notes: notes,
  });
  if (!result.success) return { status: "error", code: result.code };

  revalidateHousingPaths(locale, currentHousingId);
  revalidateHousingPaths(locale, targetHousingId);
  return { status: "success", code: "success" };
}

async function saveHousing(
  formData: FormData,
  mode: "create" | "update",
): Promise<HousingActionState> {
  const locale = getString(formData, "locale");
  const housingId = getString(formData, "housingId");

  if (!isLocale(locale) || (mode === "update" && !isUuid(housingId))) {
    return { status: "validation_error", code: "validation_error" };
  }

  const normalized = normalizeHousingInput({
    name: getString(formData, "name"),
    code: getString(formData, "code"),
    address: getString(formData, "address"),
    city: getString(formData, "city"),
    locationNotes: getString(formData, "locationNotes"),
    latitude: getString(formData, "latitude"),
    longitude: getString(formData, "longitude"),
    capacity: getString(formData, "capacity"),
    status: getString(formData, "status"),
    notes: getString(formData, "notes"),
  });

  if (!normalized.valid) {
    return {
      status: "validation_error",
      code: "validation_error",
      fieldErrors: Object.fromEntries(normalized.fields.map((field) => [field, "validation_error"])),
    };
  }

  const access = await getHousingActionAccess(
    mode === "create" ? "housing.create" : "housing.update",
  );
  if (!access.success) return { status: "error", code: "unauthorized" };

  const service = getServiceClientOrNull();
  if (!service) return { status: "error", code: "configuration_error" };

  const now = new Date().toISOString();
  const patch = {
    name: normalized.input.name,
    code: normalized.input.code,
    address: normalized.input.address,
    city: normalized.input.city,
    location_notes: normalized.input.locationNotes,
    latitude: normalized.input.latitude,
    longitude: normalized.input.longitude,
    capacity: normalized.input.capacity,
    status: normalized.input.status,
    notes: normalized.input.notes,
    updated_at: now,
    updated_by: access.actorUserId,
  };

  if (mode === "create") {
    const { data, error } = await service
      .from("housing_units")
      .insert({
        ...patch,
        created_by: access.actorUserId,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { status: "error", code: mapHousingError(error?.message, error?.code) };
    }

    await insertHousingActivity({
      service,
      actorUserId: access.actorUserId,
      housingId: data.id,
      action: "housing_created",
      afterData: patch,
    });
    revalidateHousingPaths(locale, data.id);
    return { status: "success", code: "success" };
  }

  const occupancy = await getActiveOccupancy(service, housingId);
  if (normalized.input.capacity < occupancy) {
    return { status: "validation_error", code: "capacity_below_occupancy" };
  }

  const { data: existing } = await service
    .from("housing_units")
    .select("id, name, code, address, city, location_notes, latitude, longitude, capacity, status, notes")
    .eq("id", housingId)
    .maybeSingle();

  if (!existing) return { status: "error", code: "not_found" };

  const { error } = await service
    .from("housing_units")
    .update(patch)
    .eq("id", housingId);

  if (error) {
    return { status: "error", code: mapHousingError(error.message, error.code) };
  }

  await insertHousingActivity({
    service,
    actorUserId: access.actorUserId,
    housingId,
    action: "housing_updated",
    beforeData: existing as unknown as Json,
    afterData: patch,
  });
  revalidateHousingPaths(locale, housingId);
  return { status: "success", code: "success" };
}

async function callHousingRpc(
  rpcName: "assign_driver_to_housing",
  args: { p_housing_id: string; p_driver_id: string; p_notes?: string | null },
): Promise<{ success: true } | { success: false; code: HousingActionCode }>;
async function callHousingRpc(
  rpcName: "assign_driver_to_housing_room",
  args: { p_housing_id: string; p_room_id: string; p_driver_id: string; p_notes?: string | null },
): Promise<{ success: true } | { success: false; code: HousingActionCode }>;
async function callHousingRpc(
  rpcName: "remove_driver_from_housing",
  args: { p_housing_id: string; p_driver_id: string },
): Promise<{ success: true } | { success: false; code: HousingActionCode }>;
async function callHousingRpc(
  rpcName: "set_housing_organization_assignment",
  args: { p_housing_id: string; p_organization_id: string; p_active: boolean },
): Promise<{ success: true } | { success: false; code: HousingActionCode }>;
async function callHousingRpc(
  rpcName: "assign_driver_to_housing" | "assign_driver_to_housing_room" | "remove_driver_from_housing" | "set_housing_organization_assignment",
  args: Record<string, string | boolean | null | undefined>,
): Promise<{ success: true } | { success: false; code: HousingActionCode }> {
  const access = await getHousingActionAccess(
    rpcName === "set_housing_organization_assignment"
      ? "housing.assign_organizations"
      : "housing.assign_drivers",
  );
  if (!access.success) return { success: false, code: "unauthorized" };

  const service = getServiceClientOrNull();
  if (!service) return { success: false, code: "configuration_error" };

  const { error } = await service.rpc(rpcName, {
    ...args,
    p_actor_user_id: access.actorUserId,
  } as never);

  if (error) {
    return { success: false, code: mapHousingError(error.message, error.code) };
  }

  return { success: true };
}

async function getHousingActionAccess(permissionKey: GlobalPermissionKey) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return { success: false as const };

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  if (!globalPermissions.has(permissionKey)) return { success: false as const };

  return {
    success: true as const,
    actorUserId: admin.profile.id,
  };
}

async function getActiveOccupancy(service: ReturnType<typeof createAdminClient>, housingId: string) {
  const { count, error } = await service
    .from("housing_driver_assignments")
    .select("id", { count: "exact", head: true })
    .eq("housing_id", housingId)
    .is("unassigned_at", null);

  if (error) return 0;
  return count ?? 0;
}

async function getActiveRoomOccupancy(service: ReturnType<typeof createAdminClient>, roomId: string) {
  const { count, error } = await service
    .from("housing_driver_assignments")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .is("unassigned_at", null);

  if (error) return 0;
  return count ?? 0;
}

async function insertHousingActivity({
  service,
  actorUserId,
  housingId,
  action,
  entityId,
  beforeData = null,
  afterData = null,
}: {
  service: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  housingId: string;
  action: string;
  entityId?: string | null;
  beforeData?: Json | null;
  afterData?: Json | null;
}) {
  await service.from("activity_logs").insert({
    actor_user_id: actorUserId,
    organization_id: null,
    action,
    entity_type: "housing",
    entity_id: entityId ?? housingId,
    before_data: beforeData,
    after_data: afterData,
    metadata: { housing_id: housingId },
  });
}

function mapHousingError(message?: string, code?: string): HousingActionCode {
  if (code === "23505" || message?.includes("duplicate")) return "duplicate_code";
  if (message?.includes("HOUSING_PERMISSION_DENIED")) return "unauthorized";
  if (message?.includes("HOUSING_FULL")) return "housing_full";
  if (message?.includes("HOUSING_NOT_ASSIGNABLE")) return "housing_not_assignable";
  if (message?.includes("HOUSING_ROOM_FULL")) return "room_full";
  if (message?.includes("HOUSING_ROOM_NOT_ASSIGNABLE")) return "room_not_assignable";
  if (message?.includes("HOUSING_ROOM_UNAVAILABLE")) return "room_unavailable";
  if (message?.includes("HOUSING_DRIVER_UNAVAILABLE")) return "driver_unavailable";
  if (message?.includes("HOUSING_ORGANIZATION_UNAVAILABLE")) return "organization_unavailable";
  if (message?.includes("HOUSING_ASSIGNMENT_UNAVAILABLE")) return "assignment_unavailable";
  if (message?.includes("HOUSING_UNAVAILABLE")) return "not_found";
  return "save_failed";
}

function getServiceClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function revalidateHousingPaths(locale: "ar" | "en", housingId: string) {
  revalidatePath(`/${locale}/dashboard/housing`);
  revalidatePath(`/${locale}/dashboard/housing/${housingId}`);
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
