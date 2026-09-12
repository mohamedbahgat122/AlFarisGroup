import "server-only";

import { randomUUID } from "crypto";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getGlobalPermissions } from "@/features/permissions/server";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import {
  deleteFleetFiles,
  fleetBaselinePhotoSlots,
  uploadFleetBaselinePhoto,
  uploadFleetOperatingCard,
  uploadFleetRegistrationFile,
  type FleetBaselinePhotoSlot,
} from "@/features/fleet/storage";
import { normalizeAndValidateFleetInput } from "@/features/fleet/validation";
import type {
  FleetFaultLocation,
  FleetMutationCode,
  FleetMutationInput,
  FleetOperationalStatus,
  FleetTechnicalStatus,
} from "@/features/fleet/types";
import {
  buildRecord,
  getAdminClientOrNull,
  insertActivityLog,
  isDuplicateFleetPlateError,
  safeAssignedDriverSnapshot,
  safeAuthorizedPersonSnapshot,
  safeFleetSnapshot,
} from "@/features/fleet/service";

type FleetMutationResult =
  | { success: true; vehicleId: string }
  | { success: false; code: FleetMutationCode; fields?: string[] };

type BaselinePhotoFiles = Partial<Record<FleetBaselinePhotoSlot, File>>;
type BaselinePhotoPathPatch = Partial<Record<`${FleetBaselinePhotoSlot}_photo_path`, string | null>>;
type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function createFleetCreateDiagnostics() {
  const startedAt = performance.now();
  let previousAt = startedAt;

  return {
    mark(stage: string, metadata: Record<string, unknown> = {}) {
      if (process.env.NODE_ENV === "production") return;

      const now = performance.now();
      console.info("[global-fleet:create]", {
        stage,
        durationMs: Math.round(now - previousAt),
        totalMs: Math.round(now - startedAt),
        ...metadata,
      });
      previousAt = now;
    },
    error(stage: string, error: SupabaseLikeError | null | undefined) {
      const now = performance.now();
      console.error("[global-fleet:create:error]", {
        stage,
        durationMs: Math.round(now - previousAt),
        totalMs: Math.round(now - startedAt),
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
      previousAt = now;
    },
  };
}

export async function getGlobalManageAccess(permissionKey: GlobalPermissionKey) {
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") {
    return { success: false as const, code: "unauthorized" as const };
  }
  
  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  
  if (!globalPermissions.has(permissionKey)) {
    return { success: false as const, code: "unauthorized" as const };
  }
  
  return {
    success: true as const,
    actorUserId: admin.user.id,
  };
}

export async function createGlobalFleetVehicle({
  input,
  operatingCardFile,
  registrationFile,
  baselinePhotoFiles = {},
}: {
  input: FleetMutationInput;
  operatingCardFile: File | null;
  registrationFile?: File | null;
  baselinePhotoFiles?: BaselinePhotoFiles;
}): Promise<FleetMutationResult> {
  const diagnostics = createFleetCreateDiagnostics();
  diagnostics.mark("input_received", {
    hasOperatingCardFile: Boolean(operatingCardFile),
    baselinePhotoSlots: Object.keys(baselinePhotoFiles),
  });

  const access = await getGlobalManageAccess("fleet.create");
  diagnostics.mark("global_permission_check", { success: access.success });
  if (!access.success) return access;

  // Phase 4 temporary compatibility rule: organization_id must be selected.
  if (!input.assignedOrganizationId) {
    diagnostics.mark("organization_lookup", {
      success: false,
      reason: "assigned organization missing",
    });
    return { success: false, code: "validation_error", fields: ["assignedOrganizationId"] };
  }
  diagnostics.mark("organization_lookup", {
    success: true,
    assignedOrganizationId: input.assignedOrganizationId,
  });
  diagnostics.mark("assigned_driver_lookup", {
    source: input.assignedDriverSource,
    hasDriverId: Boolean(input.assignedDriverId),
  });
  diagnostics.mark("authorized_driver_lookup", {
    source: input.authorizedPersonSource,
    hasDriverId: Boolean(input.authorizedDriverId),
  });

  const vehicleId = randomUUID();
  const validation = normalizeAndValidateFleetInput({ ...input, vehicleId });
  diagnostics.mark("input_parsing_validation", { success: validation.valid });
  if (!validation.valid) {
    return { success: false, code: "validation_error", fields: validation.fields };
  }

  const upload = operatingCardFile
    ? await uploadFleetOperatingCard({
        file: operatingCardFile,
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
      })
    : null;

  const regUpload = registrationFile
    ? await uploadFleetRegistrationFile({
        file: registrationFile,
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
      })
    : null;

  diagnostics.mark("operating_card_upload", {
    attempted: Boolean(operatingCardFile),
    success: upload ? upload.success : true,
  });

  if (upload && !upload.success) return { success: false, code: upload.code };
  if (regUpload && !regUpload.success) return { success: false, code: regUpload.code };

  const admin = getAdminClientOrNull();
  if (!admin) {
    diagnostics.mark("admin_client", { success: false });
    if (upload?.success) await deleteFleetFiles([upload.path]);
    return { success: false, code: "configuration_error" };
  }
  diagnostics.mark("admin_client", { success: true });

  const record = buildRecord({
    input: validation.input,
    organizationId: validation.input.assignedOrganizationId!, // Fallback legacy organization_id
    actorUserId: access.actorUserId,
    vehicleId,
    existing: null,
    uploadedFile: upload?.success ? upload : null,
    uploadedRegistration: regUpload?.success ? regUpload : null,
  });

  const { error } = await admin.from("fleet_vehicles").insert(record);
  diagnostics.mark("fleet_vehicles_insert", { success: !error });

  if (error) {
    diagnostics.error("fleet_vehicles_insert", error);
    if (upload?.success) await deleteFleetFiles([upload.path]);
    if (regUpload?.success) await deleteFleetFiles([regUpload.path]);
    return {
      success: false,
      code: isDuplicateFleetPlateError(error) ? "duplicate_plate" : "save_failed",
    };
  }

  const activityResult = await insertActivityLog({
    organizationId: validation.input.assignedOrganizationId!, 
    vehicleId,
    actorUserId: access.actorUserId,
    action: "vehicle_created",
    newValues: safeFleetSnapshot(record),
  });
  diagnostics.mark("activity_log_insert", { success: activityResult.success });
  if (!activityResult.success) {
    diagnostics.error("activity_log_insert", activityResult.error);
  }

  const baselinePhotoPatch = await uploadGlobalBaselinePhotos({
    vehicleId,
    files: baselinePhotoFiles,
  });
  diagnostics.mark("baseline_vehicle_photo_uploads", {
    attemptedSlots: Object.keys(baselinePhotoFiles),
    success: baselinePhotoPatch.success,
  });
  if (!baselinePhotoPatch.success) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    if (regUpload?.success) await deleteFleetFiles([regUpload.path]);
    await deleteCreatedGlobalVehicle(vehicleId);
    return { success: false, code: baselinePhotoPatch.code };
  }

  if (Object.keys(baselinePhotoPatch.patch).length > 0) {
    const { error: photosError } = await admin
      .from("fleet_vehicles")
      .update(baselinePhotoPatch.patch)
      .eq("id", vehicleId);
    diagnostics.mark("vehicle_path_updates", { success: !photosError });

    if (photosError) {
      diagnostics.error("vehicle_path_updates", photosError);
      await deleteFleetFiles(Object.values(baselinePhotoPatch.patch).filter(Boolean) as string[]);
      if (upload?.success) await deleteFleetFiles([upload.path]);
      if (regUpload?.success) await deleteFleetFiles([regUpload.path]);
      await deleteCreatedGlobalVehicle(vehicleId);
      return { success: false, code: "save_failed" };
    }
  } else {
    diagnostics.mark("vehicle_path_updates", { skipped: true });
  }

  diagnostics.mark("create_complete", { vehicleId });
  return { success: true, vehicleId };
}

export async function updateGlobalFleetVehicle({
  vehicleId,
  input,
  operatingCardFile,
  registrationFile,
  baselinePhotoFiles = {},
}: {
  vehicleId: string;
  input: FleetMutationInput;
  operatingCardFile: File | null;
  registrationFile?: File | null;
  baselinePhotoFiles?: BaselinePhotoFiles;
}): Promise<FleetMutationResult> {
  const access = await getGlobalManageAccess("fleet.update");
  if (!access.success) return access;

  if (!input.assignedOrganizationId) {
     return { success: false, code: "validation_error", fields: ["assignedOrganizationId"] };
  }

  const validation = normalizeAndValidateFleetInput({ ...input, vehicleId });
  if (!validation.valid) {
    return { success: false, code: "validation_error", fields: validation.fields };
  }

  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };

  const { data: existing, error: existingError } = await admin
    .from("fleet_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .single();

  if (existingError || !existing) {
    return { success: false, code: "invalid_vehicle" };
  }

  const upload = operatingCardFile
    ? await uploadFleetOperatingCard({
        file: operatingCardFile,
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
      })
    : null;

  const regUpload = registrationFile
    ? await uploadFleetRegistrationFile({
        file: registrationFile,
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
      })
    : null;

  if (upload && !upload.success) return { success: false, code: upload.code };
  if (regUpload && !regUpload.success) return { success: false, code: regUpload.code };

  const baselinePhotoPatch = await uploadGlobalBaselinePhotos({
    vehicleId,
    files: baselinePhotoFiles,
  });
  if (!baselinePhotoPatch.success) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    if (regUpload?.success) await deleteFleetFiles([regUpload.path]);
    return { success: false, code: baselinePhotoPatch.code };
  }

  const record = buildRecord({
    input: validation.input,
    organizationId: validation.input.assignedOrganizationId!,
    actorUserId: access.actorUserId,
    vehicleId,
    existing,
    uploadedFile: upload?.success ? upload : null,
    uploadedRegistration: regUpload?.success ? regUpload : null,
  });

  const { error } = await admin
    .from("fleet_vehicles")
    .update({ ...record, ...baselinePhotoPatch.patch })
    .eq("id", vehicleId);

  if (error) {
    if (upload?.success) await deleteFleetFiles([upload.path]);
    if (regUpload?.success) await deleteFleetFiles([regUpload.path]);
    await deleteFleetFiles(Object.values(baselinePhotoPatch.patch).filter(Boolean) as string[]);
    return {
      success: false,
      code: isDuplicateFleetPlateError(error) ? "duplicate_plate" : "save_failed",
    };
  }

  if (upload?.success && existing.operating_card_file_path) {
    await deleteFleetFiles([existing.operating_card_file_path]);
  }
  if (regUpload?.success && existing.registration_file_path) {
    await deleteFleetFiles([existing.registration_file_path]);
  }
  await deleteFleetFiles(getReplacedBaselinePhotoPaths(existing, baselinePhotoPatch.patch));

  const activities: Array<ReturnType<typeof insertActivityLog>> = [];
  const snapshotOld = safeFleetSnapshot(existing);
  const snapshotNew = safeFleetSnapshot(record);
  if (JSON.stringify(snapshotOld) !== JSON.stringify(snapshotNew)) {
    activities.push(
      insertActivityLog({
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
        actorUserId: access.actorUserId,
        action: "vehicle_updated",
        oldValues: snapshotOld,
        newValues: snapshotNew,
      }),
    );
  }

  const driverOld = safeAssignedDriverSnapshot(existing);
  const driverNew = safeAssignedDriverSnapshot(record);
  if (JSON.stringify(driverOld) !== JSON.stringify(driverNew)) {
    activities.push(
      insertActivityLog({
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
        actorUserId: access.actorUserId,
        action: "assigned_driver_changed",
        oldValues: driverOld,
        newValues: driverNew,
      }),
    );
  }

  const authOld = safeAuthorizedPersonSnapshot(existing);
  const authNew = safeAuthorizedPersonSnapshot(record);
  if (JSON.stringify(authOld) !== JSON.stringify(authNew)) {
    activities.push(
      insertActivityLog({
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
        actorUserId: access.actorUserId,
        action: "authorized_person_changed",
        oldValues: authOld,
        newValues: authNew,
      }),
    );
  }

  if (
    upload?.success ||
    existing.operating_card_number !== record.operating_card_number ||
    existing.operating_card_expiry_date !== record.operating_card_expiry_date
  ) {
    activities.push(
      insertActivityLog({
        organizationId: validation.input.assignedOrganizationId!,
        vehicleId,
        actorUserId: access.actorUserId,
        action: "operating_card_changed",
        oldValues: {
          number: existing.operating_card_number,
          expiry: existing.operating_card_expiry_date,
        },
        newValues: {
          number: record.operating_card_number,
          expiry: record.operating_card_expiry_date,
        },
      }),
    );
  }

  await Promise.all(activities);

  return { success: true, vehicleId };
}

async function uploadGlobalBaselinePhotos({
  vehicleId,
  files,
}: {
  vehicleId: string;
  files: BaselinePhotoFiles;
}): Promise<
  | { success: true; patch: BaselinePhotoPathPatch }
  | { success: false; code: FleetMutationCode }
> {
  const patch: BaselinePhotoPathPatch = {};
  const uploadedPaths: string[] = [];

  for (const slot of fleetBaselinePhotoSlots) {
    const file = files[slot];
    if (!file) continue;

    const upload = await uploadFleetBaselinePhoto({ file, vehicleId, slot });
    if (!upload.success) {
      await deleteFleetFiles(uploadedPaths);
      return { success: false, code: upload.code };
    }

    uploadedPaths.push(upload.path);
    patch[getBaselinePhotoColumn(slot)] = upload.path;
  }

  return { success: true, patch };
}

function getBaselinePhotoColumn(slot: FleetBaselinePhotoSlot) {
  return `${slot}_photo_path` as const;
}

function getReplacedBaselinePhotoPaths(
  existing: { front_photo_path?: string | null; rear_photo_path?: string | null; right_photo_path?: string | null; left_photo_path?: string | null },
  patch: BaselinePhotoPathPatch,
) {
  const paths: string[] = [];

  for (const slot of fleetBaselinePhotoSlots) {
    const column = getBaselinePhotoColumn(slot);
    const existingPath = existing[column];
    if (patch[column] && existingPath) {
      paths.push(existingPath);
    }
  }

  return paths;
}

async function deleteCreatedGlobalVehicle(vehicleId: string) {
  const admin = getAdminClientOrNull();
  if (!admin) return;

  await admin.from("fleet_vehicles").delete().eq("id", vehicleId);
}

export async function setGlobalFleetOperationalStatus({
  vehicleId,
  status,
}: {
  vehicleId: string;
  status: FleetOperationalStatus;
}) {
  const access = await getGlobalManageAccess("fleet.operational_status");
  if (!access.success) return access;

  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };

  const { data: existing, error: existingError } = await admin
    .from("fleet_vehicles")
    .select("operational_status, assigned_organization_id")
    .eq("id", vehicleId)
    .single();

  if (existingError || !existing || existing.operational_status === status) {
    return { success: false, code: "invalid_vehicle" };
  }

  const { error } = await admin
    .from("fleet_vehicles")
    .update({
      operational_status: status,
      suspended_by: status === "suspended" ? access.actorUserId : null,
    })
    .eq("id", vehicleId);

  if (error) {
    return {
      success: false,
      code: isDuplicateFleetPlateError(error) ? "duplicate_plate" : "save_failed",
    };
  }

  await insertActivityLog({
    organizationId: existing.assigned_organization_id ?? "",
    vehicleId,
    actorUserId: access.actorUserId,
    action: status === "suspended" ? "vehicle_suspended" : "vehicle_reactivated",
  });

  return { success: true };
}

export async function setGlobalFleetArchiveStatus({
  vehicleId,
  archived,
}: {
  vehicleId: string;
  archived: boolean;
}) {
  const access = await getGlobalManageAccess("fleet.archive");
  if (!access.success) return access;

  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };

  const { data: existing, error: existingError } = await admin
    .from("fleet_vehicles")
    .select("archived_at, assigned_organization_id")
    .eq("id", vehicleId)
    .single();

  if (existingError || !existing || (archived && existing.archived_at) || (!archived && !existing.archived_at)) {
    return { success: false, code: "invalid_vehicle" };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("fleet_vehicles")
    .update({
      archived_at: archived ? now : null,
      archived_by: archived ? access.actorUserId : null,
    })
    .eq("id", vehicleId);

  if (error) {
    return {
      success: false,
      code: isDuplicateFleetPlateError(error) ? "duplicate_plate" : "save_failed",
    };
  }

  await insertActivityLog({
    organizationId: existing.assigned_organization_id ?? "",
    vehicleId,
    actorUserId: access.actorUserId,
    action: archived ? "vehicle_archived" : "vehicle_restored",
  });

  return { success: true };
}

export async function updateGlobalFleetTechnicalStatus({
  vehicleId,
  technicalStatus,
  faultLocation,
  note,
}: {
  vehicleId: string;
  technicalStatus: FleetTechnicalStatus;
  faultLocation: FleetFaultLocation | null;
  note: string | null;
}) {
  const access = await getGlobalManageAccess("fleet.technical_status");
  if (!access.success) return access;

  const admin = getAdminClientOrNull();
  if (!admin) return { success: false, code: "configuration_error" };

  const { data: existing, error: existingError } = await admin
    .from("fleet_vehicles")
    .select("technical_status, fault_location, assigned_organization_id")
    .eq("id", vehicleId)
    .single();

  if (existingError || !existing) {
    return { success: false, code: "invalid_vehicle" };
  }

  if (existing.technical_status === technicalStatus && existing.fault_location === faultLocation) {
    return { success: true };
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("fleet_vehicles")
    .update({
      technical_status: technicalStatus,
      fault_location: faultLocation,
      technical_status_changed_at: now,
      technical_status_changed_by: access.actorUserId,
      technical_status_note: note,
    })
    .eq("id", vehicleId);

  if (error) {
    return { success: false, code: "save_failed" };
  }

  await insertActivityLog({
    organizationId: existing.assigned_organization_id ?? "",
    vehicleId,
    actorUserId: access.actorUserId,
    action: "technical_status_changed",
    oldValues: { status: existing.technical_status, location: existing.fault_location },
    newValues: { status: technicalStatus, location: faultLocation },
    note,
  });

  return { success: true };
}
