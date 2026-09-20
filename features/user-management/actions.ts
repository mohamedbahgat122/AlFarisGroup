"use server";

import { revalidatePath } from "next/cache";
import type { CreateManagedUserActionState } from "@/features/user-management/action-state";
import {
  archiveManagedUser,
  createManagedUser,
  setManagedUserStatus,
  updateManagedUser,
  updateManagedUserPermissions,
} from "@/features/user-management/service";
import { getUserActivityLogs } from "@/features/user-management/queries";
import {
  isManagedUserRole,
  isUuid,
  parseAdditionalAccess,
  parseGranularAdditionalAccess,
  parseGranularGlobalAccess,
  parseGranularHomePermissions,
} from "@/features/user-management/validation";
import { organizationPermissionSet } from "@/features/permissions/registry";
import { isLocale } from "@/types/locale";

export async function getUserActivityLogsAction(userId: string) {
  return getUserActivityLogs(userId);
}

export async function createManagedUserAction(
  _previousState: CreateManagedUserActionState,
  formData: FormData,
): Promise<CreateManagedUserActionState> {
  const role = formData.get("role");
  const locale = getStringValue(formData, "locale");
  const additionalAccess = parseAdditionalAccess(formData.get("additionalAccess"));

  if (
    typeof role !== "string" ||
    !isManagedUserRole(role) ||
    !additionalAccess ||
    !isLocale(locale)
  ) {
    return {
      status: "error",
      code: "validation_error",
    };
  }

  const result = await createManagedUser({
    email: getStringValue(formData, "email"),
    password: getStringValue(formData, "password"),
    fullName: getStringValue(formData, "fullName"),
    role,
    jobTitle: getStringValue(formData, "jobTitle"),
    homeOrganizationId: getStringValue(formData, "homeOrganizationId"),
    additionalAccess,
  });

  if (!result.success) {
    return {
      status: "error",
      code: result.code,
    };
  }

  revalidatePath(`/${locale}/dashboard/users`);
  revalidatePath(`/${locale}/dashboard`, "layout");

  return {
    status: "success",
    code: "success",
  };
}

export async function updateManagedUserAction(
  _previousState: CreateManagedUserActionState,
  formData: FormData,
): Promise<CreateManagedUserActionState> {
  const role = formData.get("role");
  const locale = getStringValue(formData, "locale");

  if (typeof role !== "string" || !isManagedUserRole(role) || !isLocale(locale)) {
    return { status: "error", code: "validation_error" };
  }

  const targetUserId = getStringValue(formData, "targetUserId");

  if (!isUuid(targetUserId)) {
    return { status: "error", code: "validation_error" };
  }

  const result = await updateManagedUser({
    targetUserId,
    email: getStringValue(formData, "email"),
    fullName: getStringValue(formData, "fullName"),
    role,
    jobTitle: getStringValue(formData, "jobTitle"),
    homeOrganizationId: getStringValue(formData, "homeOrganizationId"),
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidatePath(`/${locale}/dashboard/users`);
  revalidatePath(`/${locale}/dashboard`, "layout");

  return { status: "success", code: "success" };
}

export async function updateManagedUserPermissionsAction(
  _previousState: CreateManagedUserActionState,
  formData: FormData,
): Promise<CreateManagedUserActionState> {
  const locale = getStringValue(formData, "locale");
  const targetUserId = getStringValue(formData, "targetUserId");
  const accessInspection = inspectGranularAccessPayload(
    formData.get("additionalAccess"),
  );

  if (!isLocale(locale) || !accessInspection.valid) {
    logManagedUserPermissionActionDiagnostic({
      stage: "form_validation",
      targetUserId,
      accessInspection,
    });
    return { status: "error", code: "validation_error" };
  }

  if (accessInspection.unknownPermissionKeys.length > 0) {
    logManagedUserPermissionActionDiagnostic({
      stage: "permission_catalog_validation",
      targetUserId,
      accessInspection,
    });
    return { status: "error", code: "unknown_permission" };
  }

  const additionalAccess = parseGranularAdditionalAccess(
    formData.get("additionalAccess"),
  );
  const homePermissions = parseGranularHomePermissions(
    formData.get("homePermissions"),
  );
  
  const globalPermissions = parseGranularGlobalAccess(
    formData.get("globalPermissions"),
  );

  if (
    !isUuid(targetUserId) ||
    !additionalAccess ||
    !homePermissions ||
    !globalPermissions
  ) {
    logManagedUserPermissionActionDiagnostic({
      stage: "target_validation",
      targetUserId,
      accessInspection,
    });
    return { status: "error", code: "validation_error" };
  }

  const result = await updateManagedUserPermissions({
    targetUserId,
    homePermissions,
    additionalAccess,
    globalPermissions,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidatePath(`/${locale}/dashboard/users`);
  revalidatePath(`/${locale}/dashboard`, "layout");

  return { status: "success", code: "success" };
}

export async function setManagedUserStatusAction(
  _previousState: CreateManagedUserActionState,
  formData: FormData,
): Promise<CreateManagedUserActionState> {
  const locale = getStringValue(formData, "locale");
  const status = getStringValue(formData, "status");

  if (!isLocale(locale) || (status !== "active" && status !== "suspended")) {
    return { status: "error", code: "validation_error" };
  }

  const targetUserId = getStringValue(formData, "targetUserId");

  if (!isUuid(targetUserId)) {
    return { status: "error", code: "validation_error" };
  }

  const result = await setManagedUserStatus({
    targetUserId,
    status,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidatePath(`/${locale}/dashboard/users`);
  revalidatePath(`/${locale}/dashboard`, "layout");

  return { status: "success", code: "success" };
}

export async function archiveManagedUserAction(
  _previousState: CreateManagedUserActionState,
  formData: FormData,
): Promise<CreateManagedUserActionState> {
  const locale = getStringValue(formData, "locale");

  if (!isLocale(locale)) {
    return { status: "error", code: "validation_error" };
  }

  const targetUserId = getStringValue(formData, "targetUserId");

  if (!isUuid(targetUserId)) {
    return { status: "error", code: "validation_error" };
  }

  const result = await archiveManagedUser({
    targetUserId,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidatePath(`/${locale}/dashboard/users`);
  revalidatePath(`/${locale}/dashboard`, "layout");

  return { status: "success", code: "success" };
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function inspectGranularAccessPayload(value: FormDataEntryValue | null) {
  const submittedPermissionKeys: string[] = [];
  const unknownPermissionKeys: string[] = [];
  const duplicatePermissionKeys: string[] = [];
  const organizationIdSuffixes: string[] = [];

  if (typeof value !== "string" || value.trim() === "") {
    return {
      valid: true as const,
      submittedPermissionKeys,
      unknownPermissionKeys,
      duplicatePermissionKeys,
      organizationIdSuffixes,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return {
      valid: false as const,
      submittedPermissionKeys,
      unknownPermissionKeys,
      duplicatePermissionKeys,
      organizationIdSuffixes,
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      valid: false as const,
      submittedPermissionKeys,
      unknownPermissionKeys,
      duplicatePermissionKeys,
      organizationIdSuffixes,
    };
  }

  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("organizationId" in item) ||
      !("permissionKeys" in item)
    ) {
      return {
        valid: false as const,
        submittedPermissionKeys,
        unknownPermissionKeys,
        duplicatePermissionKeys,
        organizationIdSuffixes,
      };
    }

    const organizationId = item.organizationId;
    const permissionKeys = item.permissionKeys;

    if (typeof organizationId !== "string" || !Array.isArray(permissionKeys)) {
      return {
        valid: false as const,
        submittedPermissionKeys,
        unknownPermissionKeys,
        duplicatePermissionKeys,
        organizationIdSuffixes,
      };
    }

    organizationIdSuffixes.push(safeSuffix(organizationId));

    const seenInOrganization = new Set<string>();

    for (const permissionKey of permissionKeys) {
      if (typeof permissionKey !== "string") {
        return {
          valid: false as const,
          submittedPermissionKeys,
          unknownPermissionKeys,
          duplicatePermissionKeys,
          organizationIdSuffixes,
        };
      }

      submittedPermissionKeys.push(permissionKey);

      if (seenInOrganization.has(permissionKey)) {
        duplicatePermissionKeys.push(permissionKey);
      }

      seenInOrganization.add(permissionKey);

      if (!organizationPermissionSet.has(permissionKey)) {
        unknownPermissionKeys.push(permissionKey);
      }
    }
  }

  return {
    valid: true as const,
    submittedPermissionKeys,
    unknownPermissionKeys: Array.from(new Set(unknownPermissionKeys)),
    duplicatePermissionKeys: Array.from(new Set(duplicatePermissionKeys)),
    organizationIdSuffixes,
  };
}

function logManagedUserPermissionActionDiagnostic({
  stage,
  targetUserId,
  accessInspection,
}: {
  stage: string;
  targetUserId: string;
  accessInspection: ReturnType<typeof inspectGranularAccessPayload>;
}) {
  if (process.env.NODE_ENV === "production") return;

  console.error("[user-management:permissions-action]", {
    stage,
    targetUserIdSuffix: safeSuffix(targetUserId),
    selectedOrganizationIdSuffixes: accessInspection.organizationIdSuffixes,
    submittedPermissionKeys: accessInspection.submittedPermissionKeys,
    unknownPermissionKeys: accessInspection.unknownPermissionKeys,
    duplicatePermissionKeys: accessInspection.duplicatePermissionKeys,
  });
}

function safeSuffix(value: string | null | undefined) {
  return value ? value.slice(-8) : "";
}
