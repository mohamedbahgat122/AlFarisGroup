import "server-only";

import { randomUUID } from "crypto";
import type { User } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  driverAppProfileRole,
  isDriverAppProfileRole,
} from "@/features/drivers/driver-app-role";
import {
  maskLoginIdentifier,
  normalizeIqamaLoginIdentifier,
} from "@/features/drivers/login-identifiers";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import {
  deleteDriverDocuments,
  uploadDriverAsset,
  uploadDriverDocument,
} from "@/features/drivers/storage";
import { normalizeAndValidateDriverInput } from "@/features/drivers/validation";
import type {
  DriverActivityLog,
  DriverAccountErrorCode,
  DriverAccountDiagnosticCode,
  DriverAccountStage,
  DriverAppAccountOption,
  DriverDocumentUploadMetadata,
  DriverMutationErrorCode,
  DriverMutationInput,
  DriverMutationResult,
  DriverStatus,
} from "@/features/drivers/types";
import type { Database } from "@/types/database";

type CreateDriverRecordArgs =
  Database["public"]["Functions"]["create_driver_record_v2"]["Args"];
type UpdateDriverRecordArgs =
  Database["public"]["Functions"]["update_driver_record_v2"]["Args"];
type SetDriverStatusArgs =
  Database["public"]["Functions"]["set_driver_status"]["Args"];
type ArchiveDriverRecordArgs =
  Database["public"]["Functions"]["archive_driver_record"]["Args"];
type Json = Database["public"]["Tables"]["activity_logs"]["Row"]["metadata"];
type NullableJson = Database["public"]["Tables"]["activity_logs"]["Row"]["after_data"];
type DriverUpdateStage =
  | "validate_form_data"
  | "resolve_organization"
  | "load_target_driver"
  | "validate_permissions"
  | "validate_profile_photo"
  | "upload_profile_photo"
  | "update_driver_database"
  | "remove_replaced_profile_photo"
  | "revalidate_routes";
type DriverAccountMutationResult =
  | { success: true }
  | {
      success: false;
      code: DriverAccountErrorCode;
      diagnosticCode?: DriverAccountDiagnosticCode;
      failedStage?: DriverAccountStage;
      compensationAttempted?: boolean;
      compensationSucceeded?: boolean;
    };
type DriverAccountOptionsResult =
  | { success: true; accounts: DriverAppAccountOption[] }
  | { success: false; code: DriverAccountErrorCode; accounts: [] };

type DriverAccountTarget = {
  id: string;
  organization_id: string;
  full_name: string;
  keeta_driver_id: string | null;
  iqama_number: string;
  auth_user_id: string | null;
  deleted_at: string | null;
};

type DriverFleetVehicleResolution =
  | {
      success: true;
      vehicleId: string | null;
      vehicleNumber: string;
    }
  | {
      success: false;
      code: DriverMutationErrorCode;
    };

export async function createDriverForOrganization({
  organizationCode,
  input,
  iqamaFile,
  drivingLicenseFile,
  driverCardFile,
  profilePhotoFile,
}: {
  organizationCode: string;
  input: Omit<DriverMutationInput, "organizationId">;
  iqamaFile: File | null;
  drivingLicenseFile: File | null;
  driverCardFile: File | null;
  profilePhotoFile: File | null;
}): Promise<DriverMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.create");

  if (!access.success) {
    logDriverUpdateStageFailure("resolve_organization", {
      driverIdExists: Boolean(input.driverId),
      organizationResolved: false,
      code: access.code,
      message: "Unable to resolve manageable organization access.",
    });
    return access;
  }

  if (!iqamaFile || !drivingLicenseFile || !driverCardFile) {
    return { success: false, code: "document_invalid" };
  }

  const driverId = randomUUID();
  const validation = normalizeAndValidateDriverInput({
    ...input,
    driverId,
    organizationId: access.organization.id,
  });

  if (!validation.valid) {
    return { success: false, code: "validation_error" };
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const vehicleResolution = await resolveDriverFleetVehicle({
    admin,
    organizationId: access.organization.id,
    vehicleId: undefined,
  });

  if (!vehicleResolution.success) {
    return { success: false, code: vehicleResolution.code };
  }

  const uploaded: DriverDocumentUploadMetadata[] = [];
  const uploadedAssetPaths: string[] = [];
  const iqamaUpload = await uploadDriverDocument({
    file: iqamaFile,
    organizationId: access.organization.id,
    driverId,
    documentType: "iqama",
  });

  if (!iqamaUpload.success) {
    return { success: false, code: iqamaUpload.code };
  }

  uploaded.push(iqamaUpload.metadata);

  const drivingLicenseUpload = await uploadDriverDocument({
    file: drivingLicenseFile,
    organizationId: access.organization.id,
    driverId,
    documentType: "driving_license",
  });

  if (!drivingLicenseUpload.success) {
    await deleteDriverDocuments(uploaded.map((document) => document.storage_path));
    return { success: false, code: drivingLicenseUpload.code };
  }

  uploaded.push(drivingLicenseUpload.metadata);

  const driverCardUpload = await uploadDriverDocument({
    file: driverCardFile,
    organizationId: access.organization.id,
    driverId,
    documentType: "driver_card",
  });

  if (!driverCardUpload.success) {
    await deleteDriverDocuments(uploaded.map((document) => document.storage_path));
    return { success: false, code: driverCardUpload.code };
  }

  uploaded.push(driverCardUpload.metadata);

  const profilePhotoUpload = profilePhotoFile
    ? await uploadDriverAsset({
        file: profilePhotoFile,
        organizationId: access.organization.id,
        driverId,
        category: "profile-photo",
      })
    : null;

  if (profilePhotoUpload && !profilePhotoUpload.success) {
    await deleteDriverDocuments([
      ...uploaded.map((document) => document.storage_path),
      ...uploadedAssetPaths,
    ]);
    return { success: false, code: profilePhotoUpload.code };
  }

  if (profilePhotoUpload?.success) {
    uploadedAssetPaths.push(profilePhotoUpload.path);
  }

  const createPayload = {
    p_actor_user_id: access.actorUserId,
    p_driver_id: driverId,
    p_organization_id: access.organization.id,
    p_full_name: validation.input.fullName,
    p_nationality: validation.input.nationality,
    p_mobile_number: validation.input.mobileNumber,
    p_vehicle_type: validation.input.vehicleType,
    p_vehicle_number: vehicleResolution.vehicleNumber,
    p_keeta_username: validation.input.keetaUsername,
    p_keeta_driver_id: validation.input.keetaDriverId,
    p_is_company_sponsored: validation.input.isCompanySponsored,
    p_is_vehicle_owner: validation.input.isVehicleOwner,
    p_settlement_type: validation.input.settlementType,
    p_iqama_number: validation.input.iqamaNumber,
    p_iqama_expiry_date: validation.input.iqamaExpiryDate,
    p_driving_license_number: validation.input.drivingLicenseNumber,
    p_driving_license_expiry_date:
      validation.input.drivingLicenseExpiryDate,
    p_driver_card_number: validation.input.driverCardNumber,
    p_driver_card_expiry_date: validation.input.driverCardExpiryDate,
    p_iban: validation.input.iban ?? "",
    p_bank_name: validation.input.bankName ?? "",
    p_account_number: validation.input.accountNumber ?? "",
    p_documents: uploaded,
    p_vehicle_id: vehicleResolution.vehicleId ?? undefined,
    p_nfc_number: validation.input.nfcNumber,
  } satisfies CreateDriverRecordArgs;

  const { error } = await admin.rpc("create_driver_record_v2", createPayload);

  if (error) {
    logDriverRpcError("create_driver_record_v2", error, createPayload, {
      iqama: Boolean(iqamaFile),
      drivingLicense: Boolean(drivingLicenseFile),
      driverCard: Boolean(driverCardFile),
      profilePhoto: Boolean(profilePhotoFile),
    });
    await deleteDriverDocuments([
      ...uploaded.map((document) => document.storage_path),
      ...uploadedAssetPaths,
    ]);
    return {
      success: false,
      code: getDuplicateCode(error.message) ?? "create_failed",
    };
  }

  const extensionUpdate = await updateDriverExtensionFields(admin, {
    driverId,
    organizationId: access.organization.id,
    keetaVehiclePlateNumber: validation.input.keetaVehiclePlateNumber,
    profilePhotoPath: profilePhotoUpload?.success ? profilePhotoUpload.path : null,
  });

  if (!extensionUpdate.success) {
    await deleteDriverDocuments(uploadedAssetPaths);
    return { success: false, code: "create_failed" };
  }

  return { success: true, driverId };
}

export async function updateDriverForOrganization({
  organizationCode,
  input,
  iqamaFile,
  drivingLicenseFile,
  driverCardFile,
  profilePhotoFile,
  removeProfilePhoto,
}: {
  organizationCode: string;
  input: DriverMutationInput;
  iqamaFile: File | null;
  drivingLicenseFile: File | null;
  driverCardFile: File | null;
  profilePhotoFile: File | null;
  removeProfilePhoto: boolean;
}): Promise<DriverMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.update");

  if (!access.success) {
    return access;
  }

  const validation = normalizeAndValidateDriverInput({
    ...input,
    organizationId: access.organization.id,
  });

  if (!validation.valid || !validation.input.driverId) {
    return { success: false, code: "validation_error" };
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    logDriverUpdateStageFailure("update_driver_database", {
      driverIdExists: Boolean(validation.input.driverId),
      organizationResolved: true,
      code: "configuration_error",
      message: "Admin client configuration is unavailable.",
    });
    return { success: false, code: "configuration_error" };
  }

  const { data: existingDriver, error: driverError } = await admin
    .from("drivers")
    .select("id, organization_id, vehicle_id, deleted_at, profile_photo_path")
    .eq("id", validation.input.driverId)
    .maybeSingle();

  if (driverError) {
    logDriverUpdateStageError("load_target_driver", driverError, {
      driverIdExists: Boolean(validation.input.driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  if (!existingDriver) {
    logDriverUpdateStageFailure("load_target_driver", {
      driverIdExists: Boolean(validation.input.driverId),
      organizationResolved: true,
      code: "invalid_driver",
      message: "Target driver was not found.",
    });
    return { success: false, code: "invalid_driver" };
  }

  if (existingDriver.organization_id !== access.organization.id) {
    logDriverUpdateStageFailure("validate_permissions", {
      driverIdExists: true,
      organizationResolved: true,
      code: "driver_wrong_organization",
      message: "Target driver belongs to a different organization.",
    });
    return { success: false, code: "driver_wrong_organization" };
  }

  if (existingDriver.deleted_at) {
    logDriverUpdateStageFailure("validate_permissions", {
      driverIdExists: true,
      organizationResolved: true,
      code: "already_archived",
      message: "Archived driver cannot be updated.",
    });
    return { success: false, code: "already_archived" };
  }

  const vehicleResolution = await resolveDriverFleetVehicle({
    admin,
    organizationId: access.organization.id,
    vehicleId: existingDriver.vehicle_id ?? undefined,
  });

  if (!vehicleResolution.success) {
    return { success: false, code: vehicleResolution.code };
  }

  const { data: existingDocuments, error: documentsError } = await admin
    .from("driver_documents")
    .select("document_type, storage_path")
    .eq("driver_id", validation.input.driverId);

  if (documentsError) {
    logDriverUpdateStageError("load_existing_documents", documentsError, {
      driverIdExists: Boolean(validation.input.driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  const oldPathsByType = new Map(
    existingDocuments.map((document) => [
      document.document_type,
      document.storage_path,
    ]),
  );

  if (!oldPathsByType.has("driving_license") && !drivingLicenseFile) {
    return { success: false, code: "document_invalid" };
  }

  const replacementDocuments: DriverDocumentUploadMetadata[] = [];
  const replacementAssetPaths: string[] = [];

  for (const replacement of [
    { file: iqamaFile, documentType: "iqama" as const },
    { file: drivingLicenseFile, documentType: "driving_license" as const },
    { file: driverCardFile, documentType: "driver_card" as const },
  ]) {
    if (!replacement.file) {
      continue;
    }

    const upload = await uploadDriverDocument({
      file: replacement.file,
      organizationId: access.organization.id,
      driverId: validation.input.driverId,
      documentType: replacement.documentType,
    });

    if (!upload.success) {
      await deleteDriverDocuments(
        replacementDocuments.map((document) => document.storage_path),
      );
      return { success: false, code: upload.code };
    }

    replacementDocuments.push(upload.metadata);
  }

  const profilePhotoUpload = profilePhotoFile
    ? await uploadDriverAsset({
        file: profilePhotoFile,
        organizationId: access.organization.id,
        driverId: validation.input.driverId,
        category: "profile-photo",
      })
    : null;

  if (profilePhotoUpload && !profilePhotoUpload.success) {
    logDriverUpdateStageFailure("upload_profile_photo", {
      driverIdExists: true,
      organizationResolved: true,
      code: profilePhotoUpload.code,
      message: profilePhotoUpload.message,
      details: profilePhotoUpload.details,
      hint: profilePhotoUpload.hint,
    });
    await deleteDriverDocuments([
      ...replacementDocuments.map((document) => document.storage_path),
      ...replacementAssetPaths,
    ]);
    return { success: false, code: profilePhotoUpload.code };
  }

  if (profilePhotoUpload?.success) {
    replacementAssetPaths.push(profilePhotoUpload.path);
  }

  const updatePayload = {
    p_actor_user_id: access.actorUserId,
    p_driver_id: validation.input.driverId,
    p_organization_id: access.organization.id,
    p_full_name: validation.input.fullName,
    p_nationality: validation.input.nationality,
    p_mobile_number: validation.input.mobileNumber,
    p_vehicle_type: validation.input.vehicleType,
    p_vehicle_number: vehicleResolution.vehicleNumber,
    p_keeta_username: validation.input.keetaUsername,
    p_keeta_driver_id: validation.input.keetaDriverId,
    p_is_company_sponsored: validation.input.isCompanySponsored,
    p_is_vehicle_owner: validation.input.isVehicleOwner,
    p_settlement_type: validation.input.settlementType,
    p_iqama_number: validation.input.iqamaNumber,
    p_iqama_expiry_date: validation.input.iqamaExpiryDate,
    p_driving_license_number: validation.input.drivingLicenseNumber,
    p_driving_license_expiry_date:
      validation.input.drivingLicenseExpiryDate,
    p_driver_card_number: validation.input.driverCardNumber,
    p_driver_card_expiry_date: validation.input.driverCardExpiryDate,
    p_iban: validation.input.iban ?? "",
    p_bank_name: validation.input.bankName ?? "",
    p_account_number: validation.input.accountNumber ?? "",
    p_documents: replacementDocuments,
    p_vehicle_id: vehicleResolution.vehicleId ?? undefined,
    p_nfc_number: validation.input.nfcNumber,
  } satisfies UpdateDriverRecordArgs;

  const { error } = await admin.rpc("update_driver_record_v2", updatePayload);

  if (error) {
    logDriverUpdateStageFailure("update_driver_database", {
      driverIdExists: Boolean(updatePayload.p_driver_id),
      organizationResolved: Boolean(updatePayload.p_organization_id),
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    logDriverRpcError("update_driver_record_v2", error, updatePayload, {
      iqama: Boolean(iqamaFile),
      drivingLicense: Boolean(drivingLicenseFile),
      driverCard: Boolean(driverCardFile),
      profilePhoto: Boolean(profilePhotoFile),
    });
    await deleteDriverDocuments(
      [
        ...replacementDocuments.map((document) => document.storage_path),
        ...replacementAssetPaths,
      ],
    );
    return {
      success: false,
      code: getDuplicateCode(error.message) ?? "update_failed",
    };
  }

  const existingExtension = existingDriver as typeof existingDriver & {
    profile_photo_path: string | null;
  };
  const nextProfilePhotoPath = removeProfilePhoto
    ? null
    : profilePhotoUpload?.success
      ? profilePhotoUpload.path
      : existingExtension.profile_photo_path;
  const extensionUpdate = await updateDriverExtensionFields(admin, {
    driverId: validation.input.driverId,
    organizationId: access.organization.id,
    keetaVehiclePlateNumber: validation.input.keetaVehiclePlateNumber,
    profilePhotoPath: nextProfilePhotoPath,
  });

  if (!extensionUpdate.success) {
    logDriverUpdateStageFailure("update_driver_database", {
      driverIdExists: true,
      organizationResolved: true,
      code: extensionUpdate.error?.code,
      message: extensionUpdate.error?.message,
      details: extensionUpdate.error?.details,
      hint: extensionUpdate.error?.hint,
    });
    await deleteDriverDocuments(replacementAssetPaths);
    return { success: false, code: "update_failed" };
  }

  await deleteDriverDocuments(
    [
      ...replacementDocuments.flatMap((document) => {
        const oldPath = oldPathsByType.get(document.document_type);
        return oldPath ? [oldPath] : [];
      }),
      ...(profilePhotoUpload?.success || removeProfilePhoto
        ? [existingExtension.profile_photo_path].filter(
            (path): path is string => Boolean(path),
          )
        : []),
    ],
  );

  return { success: true, driverId: validation.input.driverId };
}

export async function setDriverStatusForOrganization({
  organizationCode,
  driverId,
  status,
}: {
  organizationCode: string;
  driverId: string;
  status: DriverStatus;
}): Promise<DriverMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.status");

  if (!access.success) {
    return access;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const target = await loadTargetDriver(admin, driverId);

  if (target.error) {
    logDriverUpdateStageError("load_target_driver", target.error, {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  if (!target.driver) {
    return { success: false, code: "invalid_driver" };
  }

  if (target.driver.organization_id !== access.organization.id) {
    return { success: false, code: "driver_wrong_organization" };
  }

  if (target.driver.deleted_at) {
    return { success: false, code: "already_archived" };
  }

  const payload = {
    p_actor_user_id: access.actorUserId,
    p_driver_id: driverId,
    p_organization_id: access.organization.id,
    p_status: status,
  } satisfies SetDriverStatusArgs;

  const { error } = await admin.rpc("set_driver_status", payload);

  if (error) {
    logDriverLifecycleError("set_driver_status", error, {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
      status,
    });
    return { success: false, code: "update_failed" };
  }

  return { success: true, driverId };
}

export async function archiveDriverForOrganization({
  organizationCode,
  driverId,
}: {
  organizationCode: string;
  driverId: string;
}): Promise<DriverMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.archive");

  if (!access.success) {
    return access;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const target = await loadTargetDriver(admin, driverId);

  if (target.error) {
    logDriverUpdateStageError("load_target_driver", target.error, {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  if (!target.driver) {
    return { success: false, code: "invalid_driver" };
  }

  if (target.driver.organization_id !== access.organization.id) {
    return { success: false, code: "driver_wrong_organization" };
  }

  if (target.driver.deleted_at) {
    return { success: false, code: "already_archived" };
  }

  const payload = {
    p_actor_user_id: access.actorUserId,
    p_driver_id: driverId,
    p_organization_id: access.organization.id,
  } satisfies ArchiveDriverRecordArgs;

  const { error } = await admin.rpc("archive_driver_record", payload);

  if (error) {
    logDriverLifecycleError("archive_driver_record", error, {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  return { success: true, driverId };
}

export async function restoreDriverForOrganization({
  organizationCode,
  driverId,
}: {
  organizationCode: string;
  driverId: string;
}): Promise<DriverMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.archive");

  if (!access.success) {
    return access;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const target = await loadTargetDriver(admin, driverId);

  if (target.error) {
    logDriverUpdateStageError("load_target_driver", target.error, {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  if (!target.driver) {
    return { success: false, code: "invalid_driver" };
  }

  if (target.driver.organization_id !== access.organization.id) {
    return { success: false, code: "driver_wrong_organization" };
  }

  if (!target.driver.deleted_at) {
    return { success: false, code: "not_archived" };
  }

  const payload = {
    p_actor_user_id: access.actorUserId,
    p_driver_id: driverId,
    p_organization_id: access.organization.id,
  } as ArchiveDriverRecordArgs;

  // Bypass TS since RPC is newly added in migration
  const { error } = await (admin.rpc as any)("restore_driver_record", payload);

  if (error) {
    logDriverLifecycleError("restore_driver_record", error, {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
    });
    return { success: false, code: "update_failed" };
  }

  return { success: true, driverId };
}

export async function getDriverActivityForOrganization({
  organizationCode,
  driverId,
}: {
  organizationCode: string;
  driverId: string;
}): Promise<
  | { success: true; logs: DriverActivityLog[] }
  | { success: false; code: DriverMutationErrorCode }
> {
  const access = await getActivityAccess(organizationCode);

  if (!access.success) {
    return access;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const target = await loadTargetDriver(admin, driverId);

  if (target.error) {
    return { success: false, code: "update_failed" };
  }

  if (!target.driver) {
    return { success: false, code: "invalid_driver" };
  }

  if (target.driver.organization_id !== access.organization.id) {
    return { success: false, code: "driver_wrong_organization" };
  }

  const { data, error } = await admin
    .from("activity_logs")
    .select("id, action, actor_user_id, metadata, after_data, created_at")
    .eq("entity_type", "driver")
    .eq("entity_id", driverId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return { success: false, code: "update_failed" };
  }

  const actorIds = Array.from(
    new Set(
      (data ?? [])
        .map((log) => log.actor_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const actors = new Map<string, { id: string; fullName: string }>();

  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);

    for (const profile of profiles ?? []) {
      actors.set(profile.id, { id: profile.id, fullName: profile.full_name });
    }
  }

  return {
    success: true,
    logs: (data ?? []).map((log) => ({
      id: log.id,
      action: log.action,
      actor: log.actor_user_id ? actors.get(log.actor_user_id) ?? null : null,
      createdAt: log.created_at,
      summary: getActivitySummary(log.metadata, log.after_data),
    })),
  };
}

export async function createDriverAppAccountForOrganization({
  organizationCode,
  driverId,
  iqamaNumber,
  temporaryPassword,
  confirmTemporaryPassword,
  requirePasswordChange,
}: {
  organizationCode: string;
  driverId: string;
  iqamaNumber?: string;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
  requirePasswordChange: boolean;
}): Promise<DriverAccountMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.account.manage");

  if (!access.success) {
    logDriverAccountFailure({
      stage: "validate-input",
      diagnosticCode: "PERMISSION_DENIED",
      error: access.code,
    });
    return {
      ...access,
      diagnosticCode: "PERMISSION_DENIED",
      failedStage: "validate-input",
    };
  }

  const passwordValidation = validateTemporaryPassword({
    temporaryPassword,
    confirmTemporaryPassword,
  });

  if (!passwordValidation.success) {
    return passwordValidation;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    const result = {
      success: false as const,
      code: "configuration_error" as const,
      diagnosticCode: "MIGRATION_NOT_APPLIED" as const,
      failedStage: "validate-input" as const,
    };
    logDriverAccountFailure(result);
    return result;
  }

  const driver = await loadDriverAccountTarget(admin, driverId);

  if (!driver || driver.organization_id !== access.organization.id || driver.deleted_at) {
    const result = {
      success: false as const,
      code: "driver_wrong_organization" as const,
      failedStage: "load-driver" as const,
    };
    logDriverAccountFailure(result);
    return result;
  }

  if (driver.auth_user_id) {
    const result = {
      success: false as const,
      code: "driver_account_already_linked" as const,
      diagnosticCode: "ACCOUNT_ALREADY_EXISTS" as const,
      failedStage: "check-existing-link" as const,
    };
    logDriverAccountFailure(result);
    return result;
  }

  const normalizedIqama = normalizeIqamaLoginIdentifier(
    iqamaNumber || driver.iqama_number,
  );

  if (!normalizedIqama) {
    const result = {
      success: false as const,
      code: "missing_driver_login_id" as const,
      failedStage: "validate-driver-id" as const,
    };
    logDriverAccountFailure(result);
    return result;
  }

  if (!(await isIqamaIdentifierAvailable(admin, normalizedIqama, driver.id))) {
    const result = {
      success: false as const,
      code: "duplicate_driver_login_id" as const,
      diagnosticCode: "DUPLICATE_DRIVER_ID" as const,
      failedStage: "validate-driver-id" as const,
    };
    logDriverAccountFailure(result);
    return result;
  }

  const normalizedDriverLoginId = normalizeDriverLoginId(driver.keeta_driver_id);
  const internalEmail = createInternalDriverAuthEmail(
    normalizedDriverLoginId || driver.id,
  );
  const existingAuthUser = await findAuthUserByEmail(admin, internalEmail);

  if (existingAuthUser) {
    const result = {
      success: false as const,
      code: "orphan_auth_account" as const,
      diagnosticCode: "ORPHAN_AUTH_ACCOUNT" as const,
      failedStage: "build-internal-email" as const,
    };
    logDriverAccountFailure(result);
    return result;
  }

  const { data: createdUser, error: createUserError } =
    await admin.auth.admin.createUser({
      email: internalEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        driver_id: driver.id,
        account_type: "driver_app",
      },
    });

  const authUserId = createdUser.user?.id;

  if (createUserError || !authUserId) {
    const result = {
      success: false as const,
      code: "create_failed" as const,
      diagnosticCode: "AUTH_CREATE_FAILED" as const,
      failedStage: "create-auth-user" as const,
    };
    logDriverAccountFailure({
      ...result,
      error: createUserError,
    });
    return result;
  }

  const linked = await linkDriverAuthUser({
    admin,
    actorUserId: access.actorUserId,
    driver,
    authUserId,
    requirePasswordChange,
  });

  if (!linked.success) {
    const { error: compensationError } = await admin.auth.admin.deleteUser(authUserId);
    const result = {
      ...linked,
      compensationAttempted: true,
      compensationSucceeded: !compensationError,
    };
    logDriverAccountFailure({
      ...result,
      stage: "compensate-auth-user",
      error: compensationError,
    });
    return result;
  }

  const identifier = await upsertDriverLoginIdentifier({
    admin,
    actorUserId: access.actorUserId,
    driver: {
      ...driver,
      auth_user_id: authUserId,
    },
    normalizedIqama,
  });

  if (!identifier.success) {
    return identifier;
  }

  return { success: true };
}

export async function resetDriverAppPasswordForOrganization({
  organizationCode,
  driverId,
  iqamaNumber,
  temporaryPassword,
  confirmTemporaryPassword,
  requirePasswordChange,
}: {
  organizationCode: string;
  driverId: string;
  iqamaNumber?: string;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
  requirePasswordChange: boolean;
}): Promise<DriverAccountMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.account.manage");

  if (!access.success) {
    return access;
  }

  const passwordValidation = validateTemporaryPassword({
    temporaryPassword,
    confirmTemporaryPassword,
  });

  if (!passwordValidation.success) {
    return passwordValidation;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const driver = await loadDriverAccountTarget(admin, driverId);

  if (!driver || driver.organization_id !== access.organization.id || driver.deleted_at) {
    return { success: false, code: "driver_wrong_organization" };
  }

  if (!driver.auth_user_id) {
    return { success: false, code: "driver_account_not_linked" };
  }

  const normalizedIqama = normalizeIqamaLoginIdentifier(
    iqamaNumber || driver.iqama_number,
  );

  if (!normalizedIqama) {
    return { success: false, code: "missing_driver_login_id" };
  }

  if (!(await isIqamaIdentifierAvailable(admin, normalizedIqama, driver.id))) {
    return {
      success: false,
      code: "duplicate_driver_login_id",
      diagnosticCode: "DUPLICATE_DRIVER_ID",
      failedStage: "validate-driver-id",
    };
  }

  const { error: updateAuthError } = await admin.auth.admin.updateUserById(
    driver.auth_user_id,
    {
      password: temporaryPassword,
      email_confirm: true,
    },
  );

  if (updateAuthError) {
    return { success: false, code: "reset_failed" };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      must_change_password: requirePasswordChange,
      updated_at: new Date().toISOString(),
    })
    .eq("id", driver.auth_user_id);

  if (profileError) {
    return { success: false, code: "reset_failed" };
  }

  await recordDriverAccountActivity({
    admin,
    actorUserId: access.actorUserId,
    driver,
    action: "driver_app_password_reset",
    authUserId: driver.auth_user_id,
    metadata: {
      require_password_change: requirePasswordChange,
    },
  });

  const identifier = await upsertDriverLoginIdentifier({
    admin,
    actorUserId: access.actorUserId,
    driver,
    normalizedIqama,
  });

  if (!identifier.success) {
    return identifier;
  }

  return { success: true };
}

export async function updateDriverAppLoginIdentifierForOrganization({
  organizationCode,
  driverId,
  iqamaNumber,
}: {
  organizationCode: string;
  driverId: string;
  iqamaNumber: string;
}): Promise<DriverAccountMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.account.manage");

  if (!access.success) {
    return access;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const driver = await loadDriverAccountTarget(admin, driverId);

  if (!driver || driver.organization_id !== access.organization.id || driver.deleted_at) {
    return { success: false, code: "driver_wrong_organization" };
  }

  if (!driver.auth_user_id) {
    return { success: false, code: "driver_account_not_linked" };
  }

  const normalizedIqama = normalizeIqamaLoginIdentifier(iqamaNumber);

  if (!normalizedIqama) {
    return { success: false, code: "missing_driver_login_id" };
  }

  if (!(await isIqamaIdentifierAvailable(admin, normalizedIqama, driver.id))) {
    return {
      success: false,
      code: "duplicate_driver_login_id",
      diagnosticCode: "DUPLICATE_DRIVER_ID",
      failedStage: "validate-driver-id",
    };
  }

  return upsertDriverLoginIdentifier({
    admin,
    actorUserId: access.actorUserId,
    driver,
    normalizedIqama,
  });
}

export async function getEligibleDriverAppAccountsForOrganization({
  organizationCode,
  search = "",
}: {
  organizationCode: string;
  search?: string;
}): Promise<DriverAccountOptionsResult> {
  const access = await getManageAccess(organizationCode, "drivers.account.manage");

  if (!access.success) {
    return { ...access, accounts: [] };
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error", accounts: [] };
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, status, must_change_password")
    .eq("role", driverAppProfileRole)
    .eq("home_organization_id", access.organization.id)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (profilesError) {
    return { success: false, code: "create_failed", accounts: [] };
  }

  const profileIds = (profiles ?? []).map((profile) => profile.id);

  if (profileIds.length === 0) {
    return { success: true, accounts: [] };
  }

  const { data: linkedDrivers, error: linkedDriversError } = await admin
    .from("drivers")
    .select("auth_user_id")
    .not("auth_user_id", "is", null);

  if (linkedDriversError) {
    return { success: false, code: "create_failed", accounts: [] };
  }

  const linkedAuthUserIds = new Set(
    (linkedDrivers ?? [])
      .map((driver) => driver.auth_user_id)
      .filter((authUserId): authUserId is string => Boolean(authUserId)),
  );
  const authUsers = await listAllAuthUsers(admin);

  if (!authUsers) {
    return { success: false, code: "create_failed", accounts: [] };
  }

  const authEmailById = new Map(
    authUsers.map((user) => [user.id, user.email?.trim() ?? ""]),
  );
  const normalizedSearch = search.trim().toLowerCase();

  const accounts: DriverAppAccountOption[] = (profiles ?? [])
    .filter((profile) => !linkedAuthUserIds.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      email: authEmailById.get(profile.id) ?? "",
      status: (profile.status === "suspended"
        ? "suspended"
        : "active") as DriverAppAccountOption["status"],
      mustChangePassword: Boolean(profile.must_change_password),
    }))
    .filter((account) => account.email)
    .filter((account) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        account.fullName.toLowerCase().includes(normalizedSearch) ||
        account.email.toLowerCase().includes(normalizedSearch)
      );
    });

  return { success: true, accounts };
}

export async function linkExistingDriverAppAccountForOrganization({
  organizationCode,
  driverId,
  authUserId,
  iqamaNumber,
}: {
  organizationCode: string;
  driverId: string;
  authUserId: string;
  iqamaNumber?: string;
}): Promise<DriverAccountMutationResult> {
  const access = await getManageAccess(organizationCode, "drivers.account.manage");

  if (!access.success) {
    return access;
  }

  const admin = getAdminClientOrNull();

  if (!admin) {
    return { success: false, code: "configuration_error" };
  }

  const driver = await loadDriverAccountTarget(admin, driverId);

  if (!driver || driver.organization_id !== access.organization.id || driver.deleted_at) {
    return { success: false, code: "driver_wrong_organization" };
  }

  if (driver.auth_user_id) {
    return { success: false, code: "driver_account_already_linked" };
  }

  const normalizedIqama = normalizeIqamaLoginIdentifier(
    iqamaNumber || driver.iqama_number,
  );

  if (!normalizedIqama) {
    return { success: false, code: "missing_driver_login_id" };
  }

  if (!(await isIqamaIdentifierAvailable(admin, normalizedIqama, driver.id))) {
    return {
      success: false,
      code: "duplicate_driver_login_id",
      diagnosticCode: "DUPLICATE_DRIVER_ID",
      failedStage: "validate-driver-id",
    };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, home_organization_id, deleted_at")
    .eq("id", authUserId)
    .maybeSingle();

  if (profileError || !profile || profile.deleted_at || !isDriverAppProfileRole(profile.role)) {
    return { success: false, code: "existing_account_unavailable" };
  }

  if (await isAuthUserLinkedToAnotherDriver(admin, authUserId, driver.id)) {
    return { success: false, code: "existing_account_already_linked" };
  }

  const now = new Date().toISOString();
  const previousProfileOrganizationId = profile.home_organization_id;
  const { data: syncedProfile, error: profileSyncError } = await admin
    .from("profiles")
    .update({
      home_organization_id: driver.organization_id,
      updated_at: now,
    })
    .eq("id", authUserId)
    .eq("role", driverAppProfileRole)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (profileSyncError || !syncedProfile) {
    const result = {
      success: false as const,
      code: "profile_link_failed" as const,
      diagnosticCode: isMissingMigrationError(profileSyncError)
        ? ("MIGRATION_NOT_APPLIED" as const)
        : ("PROFILE_LINK_FAILED" as const),
      failedStage: "sync-profile-organization" as const,
    };
    logDriverAccountFailure({ ...result, error: profileSyncError });
    return result;
  }

  const { data: linkedDriver, error: linkError } = await admin
    .from("drivers")
    .update({
      auth_user_id: authUserId,
      updated_by_user_id: access.actorUserId,
      updated_at: now,
    })
    .eq("id", driver.id)
    .is("auth_user_id", null)
    .select("id")
    .maybeSingle();

  if (linkError || !linkedDriver) {
    const { error: compensationError } = await admin
      .from("profiles")
      .update({
        home_organization_id: previousProfileOrganizationId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authUserId)
      .eq("role", driverAppProfileRole)
      .is("deleted_at", null);

    const result = {
      success: false as const,
      code: "link_failed" as const,
      failedStage: "link-driver" as const,
      compensationAttempted: true,
      compensationSucceeded: !compensationError,
    };
    logDriverAccountFailure({ ...result, error: linkError });
    return result;
  }

  const audit = await recordDriverAccountActivity({
    admin,
    actorUserId: access.actorUserId,
    driver,
    action: "driver_app_existing_account_linked",
    authUserId,
    metadata: {
      linked_existing_account: true,
    },
  });

  if (!audit.success) {
    return { success: false, code: "audit_log_failed" };
  }

  const identifier = await upsertDriverLoginIdentifier({
    admin,
    actorUserId: access.actorUserId,
    driver: {
      ...driver,
      auth_user_id: authUserId,
    },
    normalizedIqama,
  });

  if (!identifier.success) {
    return identifier;
  }

  return { success: true };
}

async function linkDriverAuthUser({
  admin,
  actorUserId,
  driver,
  authUserId,
  requirePasswordChange,
}: {
  admin: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  driver: DriverAccountTarget;
  authUserId: string;
  requirePasswordChange: boolean;
}): Promise<DriverAccountMutationResult> {
  const now = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: authUserId,
      full_name: driver.full_name,
      role: driverAppProfileRole,
      job_title: "Driver App User",
      status: "active",
      home_organization_id: driver.organization_id,
      must_change_password: requirePasswordChange,
      deleted_at: null,
      updated_at: now,
    })
    .select("id")
    .single();

  if (profileError) {
    const result = {
      success: false as const,
      code: "profile_link_failed" as const,
      diagnosticCode: isMissingMigrationError(profileError)
        ? ("MIGRATION_NOT_APPLIED" as const)
        : ("PROFILE_LINK_FAILED" as const),
      failedStage: "upsert-profile" as const,
    };
    logDriverAccountFailure({ ...result, error: profileError });
    return result;
  }

  const { data: linkedDriver, error: linkError } = await admin
    .from("drivers")
    .update({
      auth_user_id: authUserId,
      updated_by_user_id: actorUserId,
      updated_at: now,
    })
    .eq("id", driver.id)
    .is("auth_user_id", null)
    .select("id")
    .maybeSingle();

  if (linkError || !linkedDriver) {
    const result = {
      success: false as const,
      code: "driver_link_failed" as const,
      diagnosticCode: isMissingMigrationError(linkError)
        ? ("MIGRATION_NOT_APPLIED" as const)
        : ("DRIVER_LINK_FAILED" as const),
      failedStage: "link-driver" as const,
    };
    logDriverAccountFailure({ ...result, error: linkError });
    return result;
  }

  const audit = await recordDriverAccountActivity({
    admin,
    actorUserId,
    driver,
    action: "driver_app_account_created",
    authUserId,
    metadata: {
      require_password_change: requirePasswordChange,
    },
  });

  if (!audit.success) {
    const result = {
      success: false as const,
      code: "audit_log_failed" as const,
      diagnosticCode: "AUDIT_LOG_FAILED" as const,
      failedStage: "create-audit-log" as const,
    };
    logDriverAccountFailure({ ...result, error: audit.error });
    return result;
  }

  return { success: true };
}

async function loadDriverAccountTarget(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
) {
  const { data, error } = await admin
    .from("drivers")
    .select("id, organization_id, full_name, keeta_driver_id, iqama_number, auth_user_id, deleted_at")
    .eq("id", driverId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as DriverAccountTarget | null;
}

async function upsertDriverLoginIdentifier({
  admin,
  actorUserId,
  driver,
  normalizedIqama,
}: {
  admin: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  driver: DriverAccountTarget;
  normalizedIqama: string;
}): Promise<DriverAccountMutationResult> {
  const maskedIdentifier = maskLoginIdentifier(normalizedIqama);
  const { error } = await admin
    .from("driver_login_identifiers")
    .upsert(
      {
        driver_id: driver.id,
        identifier_type: "iqama",
        identifier_normalized: normalizedIqama,
      },
      { onConflict: "driver_id" },
    );

  if (error) {
    return {
      success: false,
      code: error.code === "23505" ? "duplicate_driver_login_id" : "create_failed",
      diagnosticCode:
        error.code === "23505" ? "DUPLICATE_DRIVER_ID" : "AUTH_CREATE_FAILED",
      failedStage: "validate-driver-id",
    };
  }

  const audit = await recordDriverAccountActivity({
    admin,
    actorUserId,
    driver,
    action: "driver_iqama_login_identifier_updated",
    authUserId: driver.auth_user_id ?? actorUserId,
    metadata: {
      identifier_type: "iqama",
      identifier_masked: maskedIdentifier,
    },
  });

  if (!audit.success) {
    return { success: false, code: "audit_log_failed" };
  }

  return { success: true };
}

async function isIqamaIdentifierAvailable(
  admin: ReturnType<typeof createAdminClient>,
  normalizedIqama: string,
  driverId: string,
) {
  const { data, error } = await admin
    .from("driver_login_identifiers")
    .select("driver_id")
    .eq("identifier_type", "iqama")
    .eq("identifier_normalized", normalizedIqama)
    .maybeSingle();

  if (error) {
    return false;
  }

  return !data || data.driver_id === driverId;
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const users = await listAllAuthUsers(admin);

  if (!users) {
    return null;
  }

  return users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
}

async function listAllAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const users: User[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      return null;
    }

    users.push(...data.users);

    if (data.users.length < 1000) {
      break;
    }
  }

  return users;
}

async function isAuthUserLinkedToAnotherDriver(
  admin: ReturnType<typeof createAdminClient>,
  authUserId: string,
  currentDriverId: string,
) {
  const { data, error } = await admin
    .from("drivers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .neq("id", currentDriverId)
    .limit(1);

  if (error) {
    return true;
  }

  return (data ?? []).length > 0;
}

async function recordDriverAccountActivity({
  admin,
  actorUserId,
  driver,
  action,
  authUserId,
  metadata,
}: {
  admin: ReturnType<typeof createAdminClient>;
  actorUserId: string;
  driver: DriverAccountTarget;
  action: string;
  authUserId: string;
  metadata: Json;
}) {
  const { error } = await admin.from("activity_logs").insert({
    actor_user_id: actorUserId,
    target_user_id: authUserId,
    organization_id: driver.organization_id,
    action,
    entity_type: "driver",
    entity_id: driver.id,
    after_data: {
      driver_id: driver.id,
      auth_user_id: authUserId,
    },
    metadata,
  });

  return { success: !error, error };
}

function logDriverAccountFailure({
  failedStage,
  stage,
  diagnosticCode,
  code,
  error,
  compensationAttempted,
  compensationSucceeded,
}: {
  failedStage?: DriverAccountStage;
  stage?: DriverAccountStage;
  diagnosticCode?: DriverAccountDiagnosticCode;
  code?: string;
  error?: unknown;
  compensationAttempted?: boolean;
  compensationSucceeded?: boolean;
}) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const safeError = getSafeErrorDetails(error);

  console.error("[drivers:app-account]", {
    stage: stage ?? failedStage,
    diagnosticCode,
    code,
    errorName: safeError.name,
    errorMessage: safeError.message,
    supabaseCode: safeError.supabaseCode,
    httpStatus: safeError.httpStatus,
    databaseCode: safeError.databaseCode,
    details: safeError.details,
    hint: safeError.hint,
    compensationAttempted,
    compensationSucceeded,
  });
}

function getSafeErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return {};
  }

  const record = error as Record<string, unknown>;

  return {
    name: typeof record.name === "string" ? record.name : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
    supabaseCode:
      typeof record.code === "string" ? record.code : undefined,
    httpStatus:
      typeof record.status === "number" || typeof record.status === "string"
        ? record.status
        : undefined,
    databaseCode:
      typeof record.code === "string" ? record.code : undefined,
    details: typeof record.details === "string" ? record.details : undefined,
    hint: typeof record.hint === "string" ? record.hint : undefined,
  };
}

function isMissingMigrationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "";
  const code = typeof record.code === "string" ? record.code : "";

  return code === "42703" || message.includes("must_change_password") || message.includes("auth_user_id");
}

function validateTemporaryPassword({
  temporaryPassword,
  confirmTemporaryPassword,
}: {
  temporaryPassword: string;
  confirmTemporaryPassword: string;
}): DriverAccountMutationResult {
  if (temporaryPassword.length < 8 || temporaryPassword.length > 128) {
    return { success: false, code: "validation_error" };
  }

  if (temporaryPassword !== confirmTemporaryPassword) {
    return { success: false, code: "validation_error" };
  }

  return { success: true };
}

function normalizeDriverLoginId(value: string | null) {
  return value?.trim() ?? "";
}

function createInternalDriverAuthEmail(normalizedDriverLoginId: string) {
  const localPart = normalizedDriverLoginId
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `driver.${localPart || "account"}@auth.alfaris.internal`;
}

async function getManageAccess(
  organizationCode: string,
  permissionKey: OrganizationPermissionKey,
) {
  return getOrganizationAccess(organizationCode, permissionKey);
}

async function getActivityAccess(organizationCode: string) {
  return getOrganizationAccess(organizationCode, "drivers.activity.view");
}

async function getOrganizationAccess(
  organizationCode: string,
  permissionKey: OrganizationPermissionKey,
) {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { success: false as const, code: "unauthorized" as const };
  }

  const organizations = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );

  if (organizations.status !== "success") {
    return {
      success: false as const,
      code: "organization_unavailable" as const,
    };
  }

  const organization = organizations.organizations.find(
    (item) => item.code === organizationCode,
  );

  if (!organization) {
    return {
      success: false as const,
      code: "organization_unavailable" as const,
    };
  }

  if (!organization.permissionKeys.includes(permissionKey)) {
    return { success: false as const, code: "unauthorized" as const };
  }

  return {
    success: true as const,
    actorUserId: admin.user.id,
    organization,
  };
}

async function loadTargetDriver(
  admin: ReturnType<typeof createAdminClient>,
  driverId: string,
) {
  const { data, error } = await admin
    .from("drivers")
    .select("id, organization_id, deleted_at, status")
    .eq("id", driverId)
    .maybeSingle();

  return { driver: data, error };
}

function getAdminClientOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

async function updateDriverExtensionFields(
  admin: ReturnType<typeof createAdminClient>,
  {
    driverId,
    organizationId,
    keetaVehiclePlateNumber,
    profilePhotoPath,
  }: {
    driverId: string;
    organizationId: string;
    keetaVehiclePlateNumber: string;
    profilePhotoPath: string | null;
  },
) {
  const extensionColumns = {
    keeta_vehicle_plate_number: nullableTrimmed(keetaVehiclePlateNumber),
    profile_photo_path: profilePhotoPath,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("drivers")
    .update(extensionColumns)
    .eq("id", driverId)
    .eq("organization_id", organizationId);

  return { success: !error, error };
}

async function resolveDriverFleetVehicle({
  admin,
  organizationId,
  vehicleId,
}: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  vehicleId?: string;
}): Promise<DriverFleetVehicleResolution> {
  const normalizedVehicleId = vehicleId?.trim() ?? "";

  if (!normalizedVehicleId) {
    return {
      success: true,
      vehicleId: null,
      vehicleNumber: "",
    };
  }

  const { data, error } = await admin
    .from("fleet_vehicles")
    .select("id, plate_number")
    .eq("id", normalizedVehicleId)
    .eq("assigned_organization_id", organizationId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    logDriverUpdateStageFailure("validate_form_data", {
      driverIdExists: false,
      organizationResolved: true,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { success: false, code: "validation_error" };
  }

  if (!data) {
    return { success: false, code: "validation_error" };
  }

  return {
    success: true,
    vehicleId: data.id,
    vehicleNumber: data.plate_number,
  };
}

function nullableTrimmed(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getDuplicateCode(message: string) {
  if (!message.includes("duplicate key value")) {
    return null;
  }

  if (message.includes("drivers_organization_keeta_driver_id_key")) {
    return "duplicate_keeta_driver_id" as const;
  }

  return "duplicate_iqama" as const;
}

function logDriverRpcError(
  functionName: "create_driver_record_v2" | "update_driver_record_v2",
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
  payload: CreateDriverRecordArgs | UpdateDriverRecordArgs,
  replacementFiles: {
    iqama: boolean;
    drivingLicense: boolean;
    driverCard: boolean;
    profilePhoto: boolean;
  },
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[drivers:update:rpc_failed]", {
    stage: "call_update_rpc",
    rpcFunction: functionName,
    driverIdExists: Boolean(payload.p_driver_id),
    organizationResolved: Boolean(payload.p_organization_id),
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    argumentNames: Object.keys(payload).sort(),
    replacementFiles,
  });
}

function logDriverUpdateStageFailure(
  stage: DriverUpdateStage,
  {
    driverIdExists,
    organizationResolved,
    code,
    message,
    details,
    hint,
  }: {
    driverIdExists: boolean;
    organizationResolved: boolean;
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[drivers:update:stage_failed]", {
    stage,
    driverIdExists,
    organizationResolved,
    code,
    message,
    details,
    hint,
  });
}

function logDriverLifecycleError(
  rpcFunction: "set_driver_status" | "archive_driver_record" | "restore_driver_record",
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
  context: {
    driverIdExists: boolean;
    organizationResolved: boolean;
    status?: DriverStatus;
  },
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[drivers:lifecycle:rpc_failed]", {
    rpcFunction,
    driverIdExists: context.driverIdExists,
    organizationResolved: context.organizationResolved,
    targetStatus: context.status,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function logDriverUpdateStageError(
  stage: "load_target_driver" | "load_existing_documents",
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
  context: {
    driverIdExists: boolean;
    organizationResolved: boolean;
  },
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[drivers:update:stage_failed]", {
    stage,
    driverIdExists: context.driverIdExists,
    organizationResolved: context.organizationResolved,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

function getActivitySummary(metadata: Json, afterData: NullableJson) {
  const summary: DriverActivityLog["summary"] = {};

  if (isJsonRecord(metadata)) {
    const previousStatus = metadata.previous_status;
    const newStatus = metadata.new_status;

    if (isDriverStatus(previousStatus)) {
      summary.previousStatus = previousStatus;
    }

    if (isDriverStatus(newStatus)) {
      summary.newStatus = newStatus;
    }
  }

  if (isJsonRecord(afterData)) {
    const replacedDocuments = afterData.replaced_documents;
    
    if (Array.isArray(replacedDocuments)) {
      summary.replacedDocumentCount = replacedDocuments.length;
    }
  }

  return summary;
}

function isJsonRecord(
  value: Json | NullableJson,
): value is Record<string, Json> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDriverStatus(value: Json): value is DriverStatus {
  return value === "active" || value === "suspended";
}
