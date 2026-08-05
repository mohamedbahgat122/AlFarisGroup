import "server-only";

import { randomUUID } from "crypto";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import {
  deleteFleetFiles,
  uploadFleetOperatingCard,
} from "@/features/fleet/storage";
import { normalizeAndValidateFleetInput } from "@/features/fleet/validation";
import type {
  FleetActivityAction,
  FleetFaultLocation,
  FleetMutationCode,
  FleetMutationInput,
  FleetOperationalStatus,
  FleetTechnicalStatus,
  FleetVehicleRow,
} from "@/features/fleet/types";
import type { Database } from "@/types/database";

type FleetMutationResult =
  | { success: true; vehicleId: string }
  | { success: false; code: FleetMutationCode; fields?: string[] };

type Json = Database["public"]["Tables"]["fleet_vehicle_activity_logs"]["Row"]["new_values"];

export async function createFleetVehicle({
  organizationCode,
  input,
  operatingCardFile,
}: {
  organizationCode: string;
  input: FleetMutationInput;
  operatingCardFile: File | null;
}): Promise<FleetMutationResult> {
  const access = await getManageAccess(organizationCode, "fleet.create");
  if (!access.success) return access;

  const vehicleId = randomUUID();
  const validation = normalizeAndValidateFleetInput({ ...input, vehicleId });
  if (!validation.valid) {
    return { success: false, code: "validation_error", fields: validation.fields };
  }
  const categoryPermission: OrganizationPermissionKey =
    validation.input.vehicleCategory === "car"
      ? "fleet.cars.view"
      : "fleet.motorcycles.view";
  if (!access.organization.permissionKeys.includes(categoryPermission)) {
    return { success: false, code: "unauthorized" };
  }

  const upload = operatingCardFile
    ? await uploadFleetOperatingCard({
        file: operatingCardFile,
        organizationId: access.organization.id,
        vehicleId,
      })
    : null;

  if (upload && !upload.success) return { success: false, code: upload.code };

  const admin = getAdminClientOrNull();
  if (!admin) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    return { success: false, code: "configuration_error" };
  }

  const record = buildRecord({
    input: validation.input,
    organizationId: access.organization.id,
    actorUserId: access.actorUserId,
    vehicleId,
    existing: null,
    uploadedFile: upload?.success ? upload : null,
  });
  const { error } = await admin.from("fleet_vehicles").insert(record);

  if (error) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    return {
      success: false,
      code: error.message.includes("fleet_vehicles_active_normalized_plate_key")
        ? "duplicate_plate"
        : "save_failed",
    };
  }

  await insertActivityLog({
    organizationId: access.organization.id,
    vehicleId,
    actorUserId: access.actorUserId,
    action: "vehicle_created",
    newValues: safeFleetSnapshot(record),
  });

  return { success: true, vehicleId };
}

export async function updateFleetVehicle({
  organizationCode,
  input,
  operatingCardFile,
}: {
  organizationCode: string;
  input: FleetMutationInput;
  operatingCardFile: File | null;
}): Promise<FleetMutationResult> {
  const access = await getManageAccess(organizationCode, "fleet.update");
  if (!access.success) return access;
  if (!input.vehicleId) return { success: false, code: "invalid_vehicle" };

  const existing = await getFleetVehicleForMutation({
    organizationId: access.organization.id,
    vehicleId: input.vehicleId,
  });
  if (!existing) return { success: false, code: "invalid_vehicle" };
  if (existing.vehicle_category !== input.vehicleCategory) {
    return { success: false, code: "invalid_vehicle" };
  }

  const validation = normalizeAndValidateFleetInput(input);
  if (!validation.valid) {
    return { success: false, code: "validation_error", fields: validation.fields };
  }

  const upload = operatingCardFile
    ? await uploadFleetOperatingCard({
        file: operatingCardFile,
        organizationId: access.organization.id,
        vehicleId: input.vehicleId,
      })
    : null;
  if (upload && !upload.success) return { success: false, code: upload.code };

  const admin = getAdminClientOrNull();
  if (!admin) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    return { success: false, code: "configuration_error" };
  }

  const next = buildRecord({
    input: validation.input,
    organizationId: access.organization.id,
    actorUserId: access.actorUserId,
    vehicleId: input.vehicleId,
    existing,
    uploadedFile: upload?.success ? upload : null,
  });
  const { error } = await admin
    .from("fleet_vehicles")
    .update(next)
    .eq("id", input.vehicleId)
    .eq("organization_id", access.organization.id);

  if (error) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    return {
      success: false,
      code: error.message.includes("fleet_vehicles_active_normalized_plate_key")
        ? "duplicate_plate"
        : "save_failed",
    };
  }

  if (upload?.success && existing.operating_card_file_path) {
    await deleteFleetFiles([existing.operating_card_file_path]);
  }

  await insertActivityLog({
    organizationId: access.organization.id,
    vehicleId: input.vehicleId,
    actorUserId: access.actorUserId,
    action: "vehicle_updated",
    oldValues: safeFleetSnapshot(existing),
    newValues: safeFleetSnapshot(next),
  });

  if (changedAssignedDriver(existing, next)) {
    await insertActivityLog({
      organizationId: access.organization.id,
      vehicleId: input.vehicleId,
      actorUserId: access.actorUserId,
      action: "assigned_driver_changed",
      oldValues: safeAssignedDriverSnapshot(existing),
      newValues: safeAssignedDriverSnapshot(next),
    });
  }

  if (changedAuthorizedPerson(existing, next)) {
    await insertActivityLog({
      organizationId: access.organization.id,
      vehicleId: input.vehicleId,
      actorUserId: access.actorUserId,
      action: "authorized_person_changed",
      oldValues: safeAuthorizedPersonSnapshot(existing),
      newValues: safeAuthorizedPersonSnapshot(next),
    });
  }

  if (upload?.success || existing.operating_card_number !== next.operating_card_number) {
    await insertActivityLog({
      organizationId: access.organization.id,
      vehicleId: input.vehicleId,
      actorUserId: access.actorUserId,
      action: "operating_card_changed",
      oldValues: safeOperatingCardSnapshot(existing),
      newValues: safeOperatingCardSnapshot(next),
    });
  }

  return { success: true, vehicleId: input.vehicleId };
}

export async function setFleetOperationalStatus({
  organizationCode,
  vehicleId,
  status,
}: {
  organizationCode: string;
  vehicleId: string;
  status: FleetOperationalStatus;
}): Promise<FleetMutationResult> {
  const access = await getManageAccess(organizationCode, "fleet.operational_status");
  if (!access.success) return access;
  const existing = await getFleetVehicleForMutation({
    organizationId: access.organization.id,
    vehicleId,
  });
  if (!existing) return { success: false, code: "invalid_vehicle" };
  const now = new Date().toISOString();
  const patch =
    status === "suspended"
      ? { operational_status: status, suspended_at: now, suspended_by: access.actorUserId, updated_at: now, updated_by: access.actorUserId }
      : { operational_status: status, suspended_at: null, suspended_by: null, updated_at: now, updated_by: access.actorUserId };

  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };
  const { error } = await admin
    .from("fleet_vehicles")
    .update(patch)
    .eq("id", vehicleId)
    .eq("organization_id", access.organization.id);
  if (error) return { success: false, code: "save_failed" };

  await insertActivityLog({
    organizationId: access.organization.id,
    vehicleId,
    actorUserId: access.actorUserId,
    action: status === "suspended" ? "vehicle_suspended" : "vehicle_reactivated",
    oldValues: { operational_status: existing.operational_status },
    newValues: { operational_status: status },
  });
  return { success: true, vehicleId };
}

export async function setFleetArchiveStatus({
  organizationCode,
  vehicleId,
  archived,
}: {
  organizationCode: string;
  vehicleId: string;
  archived: boolean;
}): Promise<FleetMutationResult> {
  const access = await getManageAccess(organizationCode, "fleet.archive");
  if (!access.success) return access;
  const existing = await getFleetVehicleForMutation({
    organizationId: access.organization.id,
    vehicleId,
  });
  if (!existing) return { success: false, code: "invalid_vehicle" };
  const now = new Date().toISOString();
  const patch = archived
    ? { archived_at: now, archived_by: access.actorUserId, updated_at: now, updated_by: access.actorUserId }
    : { archived_at: null, archived_by: null, updated_at: now, updated_by: access.actorUserId };

  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };
  const { error } = await admin
    .from("fleet_vehicles")
    .update(patch)
    .eq("id", vehicleId)
    .eq("organization_id", access.organization.id);
  if (error) return { success: false, code: "save_failed" };
  await insertActivityLog({
    organizationId: access.organization.id,
    vehicleId,
    actorUserId: access.actorUserId,
    action: archived ? "vehicle_archived" : "vehicle_restored",
    oldValues: { archived_at: existing.archived_at },
    newValues: { archived_at: archived ? now : null },
  });
  return { success: true, vehicleId };
}

export async function updateFleetTechnicalStatus({
  organizationCode,
  vehicleId,
  technicalStatus,
  faultLocation,
  note,
}: {
  organizationCode: string;
  vehicleId: string;
  technicalStatus: FleetTechnicalStatus;
  faultLocation: FleetFaultLocation | null;
  note: string | null;
}): Promise<FleetMutationResult> {
  const access = await getManageAccess(organizationCode, "fleet.technical_status");
  if (!access.success) return access;
  const existing = await getFleetVehicleForMutation({
    organizationId: access.organization.id,
    vehicleId,
  });
  if (!existing) return { success: false, code: "invalid_vehicle" };
  if (technicalStatus === "fault" && !faultLocation) {
    return { success: false, code: "validation_error", fields: ["faultLocation"] };
  }
  const now = new Date().toISOString();
  const patch = {
    technical_status: technicalStatus,
    fault_location: technicalStatus === "fault" ? faultLocation : null,
    technical_status_note: note?.trim() || null,
    technical_status_changed_at: now,
    technical_status_changed_by: access.actorUserId,
    updated_at: now,
    updated_by: access.actorUserId,
  };
  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };
  const { error } = await admin
    .from("fleet_vehicles")
    .update(patch)
    .eq("id", vehicleId)
    .eq("organization_id", access.organization.id);
  if (error) return { success: false, code: "save_failed" };
  await insertActivityLog({
    organizationId: access.organization.id,
    vehicleId,
    actorUserId: access.actorUserId,
    action: "technical_status_changed",
    oldValues: safeTechnicalSnapshot(existing),
    newValues: patch,
    note: patch.technical_status_note,
  });
  return { success: true, vehicleId };
}

function buildRecord({
  input,
  organizationId,
  actorUserId,
  vehicleId,
  existing,
  uploadedFile,
}: {
  input: FleetMutationInput & { normalizedPlateNumber: string };
  organizationId: string;
  actorUserId: string;
  vehicleId: string;
  existing: FleetVehicleRow | null;
  uploadedFile: { path: string; fileName: string; mimeType: string } | null;
}): Database["public"]["Tables"]["fleet_vehicles"]["Insert"] {
  const now = new Date().toISOString();
  return {
    id: vehicleId,
    organization_id: organizationId,
    vehicle_category: input.vehicleCategory,
    vehicle_type: input.vehicleType,
    plate_number: input.plateNumber,
    normalized_plate_number: input.normalizedPlateNumber,
    owner_source: input.ownerSource,
    owner_organization_id: input.ownerSource === "organization" ? organizationId : null,
    manual_owner_name: input.ownerSource === "manual" ? input.manualOwnerName : null,
    operating_card_number: input.operatingCardNumber,
    operating_card_expiry_date: input.operatingCardExpiryDate,
    operating_card_file_path: uploadedFile?.path ?? existing?.operating_card_file_path ?? null,
    operating_card_file_name: uploadedFile?.fileName ?? existing?.operating_card_file_name ?? null,
    operating_card_mime_type: uploadedFile?.mimeType ?? existing?.operating_card_mime_type ?? null,
    assigned_driver_source: input.assignedDriverSource,
    assigned_driver_id: input.assignedDriverSource === "organization_driver" ? input.assignedDriverId : null,
    assigned_driver_manual_name: input.assignedDriverSource === "manual" ? input.assignedDriverManualName : null,
    assigned_driver_manual_iqama: input.assignedDriverSource === "manual" ? input.assignedDriverManualIqama : null,
    authorized_person_source: input.authorizedPersonSource,
    authorized_driver_id: input.authorizedPersonSource === "organization_driver" ? input.authorizedDriverId : null,
    authorized_manual_name: input.authorizedPersonSource === "manual" ? input.authorizedManualName : null,
    authorized_manual_iqama: input.authorizedPersonSource === "manual" ? input.authorizedManualIqama : null,
    authorization_expiry_date: input.authorizationExpiryDate,
    operational_status: existing?.operational_status ?? "active",
    technical_status: input.technicalStatus,
    fault_location: input.technicalStatus === "fault" ? input.faultLocation : null,
    technical_status_note: input.technicalStatusNote,
    technical_status_changed_at:
      existing?.technical_status !== input.technicalStatus ||
      existing?.fault_location !== input.faultLocation
        ? now
        : existing?.technical_status_changed_at ?? null,
    technical_status_changed_by:
      existing?.technical_status !== input.technicalStatus ||
      existing?.fault_location !== input.faultLocation
        ? actorUserId
        : existing?.technical_status_changed_by ?? null,
    notes: input.notes,
    created_by: existing?.created_by ?? actorUserId,
    updated_by: actorUserId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    suspended_at: existing?.suspended_at ?? null,
    suspended_by: existing?.suspended_by ?? null,
    archived_at: existing?.archived_at ?? null,
    archived_by: existing?.archived_by ?? null,
  };
}

async function getManageAccess(
  organizationCode: string,
  permissionKey: OrganizationPermissionKey,
) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false as const, code: "unauthorized" as const };
  }
  const organization = await getAccessibleOrganizationByCode(organizationCode);
  if (!organization) {
    return { success: false as const, code: "organization_unavailable" as const };
  }
  if (!organization.permissionKeys.includes(permissionKey)) {
    return { success: false as const, code: "unauthorized" as const };
  }
  return {
    success: true as const,
    organization,
    actorUserId: admin.user.id,
  };
}

async function getFleetVehicleForMutation({
  organizationId,
  vehicleId,
}: {
  organizationId: string;
  vehicleId: string;
}) {
  const admin = getAdminClientOrNull();
  if (!admin) return null;
  const { data, error } = await admin
    .from("fleet_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return data as FleetVehicleRow;
}

async function insertActivityLog({
  organizationId,
  vehicleId,
  actorUserId,
  action,
  oldValues = null,
  newValues = null,
  note = null,
}: {
  organizationId: string;
  vehicleId: string;
  actorUserId: string;
  action: FleetActivityAction;
  oldValues?: Json | null;
  newValues?: Json | null;
  note?: string | null;
}) {
  const admin = getAdminClientOrNull();
  if (!admin) return;
  await admin.from("fleet_vehicle_activity_logs").insert({
    id: randomUUID(),
    organization_id: organizationId,
    vehicle_id: vehicleId,
    actor_user_id: actorUserId,
    action,
    old_values: oldValues,
    new_values: newValues,
    note,
  });
}

function getAdminClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function safeFleetSnapshot(value: Partial<FleetVehicleRow>) {
  return {
    vehicle_type: value.vehicle_type,
    plate_number: value.plate_number,
    owner_source: value.owner_source,
    operational_status: value.operational_status,
    technical_status: value.technical_status,
    fault_location: value.fault_location,
    operating_card_number: value.operating_card_number,
  } satisfies Record<string, unknown>;
}

function safeAssignedDriverSnapshot(value: Partial<FleetVehicleRow>) {
  return {
    assigned_driver_source: value.assigned_driver_source,
    assigned_driver_id: value.assigned_driver_id,
    assigned_driver_manual_name: value.assigned_driver_manual_name,
    assigned_driver_manual_iqama: value.assigned_driver_manual_iqama,
  } satisfies Record<string, unknown>;
}

function safeAuthorizedPersonSnapshot(value: Partial<FleetVehicleRow>) {
  return {
    authorized_person_source: value.authorized_person_source,
    authorized_driver_id: value.authorized_driver_id,
    authorized_manual_name: value.authorized_manual_name,
    authorized_manual_iqama: value.authorized_manual_iqama,
  } satisfies Record<string, unknown>;
}

function safeOperatingCardSnapshot(value: Partial<FleetVehicleRow>) {
  return {
    operating_card_number: value.operating_card_number,
    operating_card_expiry_date: value.operating_card_expiry_date,
    operating_card_file_name: value.operating_card_file_name,
    operating_card_mime_type: value.operating_card_mime_type,
  } satisfies Record<string, unknown>;
}

function safeTechnicalSnapshot(value: Partial<FleetVehicleRow>) {
  return {
    technical_status: value.technical_status,
    fault_location: value.fault_location,
    technical_status_note: value.technical_status_note,
  } satisfies Record<string, unknown>;
}

function changedAssignedDriver(first: FleetVehicleRow, second: Partial<FleetVehicleRow>) {
  return JSON.stringify(safeAssignedDriverSnapshot(first)) !== JSON.stringify(safeAssignedDriverSnapshot(second));
}

function changedAuthorizedPerson(first: FleetVehicleRow, second: Partial<FleetVehicleRow>) {
  return JSON.stringify(safeAuthorizedPersonSnapshot(first)) !== JSON.stringify(safeAuthorizedPersonSnapshot(second));
}
