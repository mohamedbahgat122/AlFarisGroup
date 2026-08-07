import type {
  CreateManagedUserAccessInput,
  CreateManagedUserInput,
  ManagedUserRole,
  UpdateManagedUserInput,
  UpdateManagedUserPermissionsInput,
} from "@/features/user-management/types";
import {
  applyPermissionDependencies,
  isOrganizationPermissionKey,
  normalizePermissionKeys,
} from "@/features/permissions/registry";

const allowedRoles = new Set<ManagedUserRole>([
  "manager",
  "supervisor",
  "driver",
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ValidationResult =
  | {
      valid: true;
      input: CreateManagedUserInput;
    }
  | {
      valid: false;
    };

export type UpdateManagedUserValidationResult =
  | {
      valid: true;
      input: UpdateManagedUserInput;
    }
  | {
      valid: false;
    };

export type PermissionsValidationResult =
  | {
      valid: true;
      input: UpdateManagedUserPermissionsInput;
    }
  | {
      valid: false;
    };

export function normalizeAndValidateCreateManagedUserInput(
  input: CreateManagedUserInput,
): ValidationResult {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const jobTitle = input.jobTitle.trim();
  const homeOrganizationId = input.homeOrganizationId.trim();
  const additionalAccess = input.additionalAccess.map((entry) => ({
    organizationId: entry.organizationId.trim(),
    permissionKeys: applyPermissionDependencies(entry.permissionKeys),
  }));

  if (!isValidEmail(email) || input.password.length < 8) {
    return { valid: false };
  }

  if (fullName.length === 0 || fullName.length > 160) {
    return { valid: false };
  }

  if (!allowedRoles.has(input.role)) {
    return { valid: false };
  }

  if (jobTitle.length === 0 || jobTitle.length > 160) {
    return { valid: false };
  }

  if (!uuidPattern.test(homeOrganizationId)) {
    return { valid: false };
  }

  if (input.role === "driver" && additionalAccess.length > 0) {
    return { valid: false };
  }

  const seenOrganizationIds = new Set<string>();

  for (const entry of additionalAccess) {
    if (!uuidPattern.test(entry.organizationId)) {
      return { valid: false };
    }

    if (
      entry.permissionKeys.some(
        (permissionKey) => !isOrganizationPermissionKey(permissionKey),
      )
    ) {
      return { valid: false };
    }

    if (seenOrganizationIds.has(entry.organizationId)) {
      return { valid: false };
    }

    seenOrganizationIds.add(entry.organizationId);
  }

  return {
    valid: true,
    input: {
      email,
      password: input.password,
      fullName,
      role: input.role,
      jobTitle,
      homeOrganizationId,
      additionalAccess,
    },
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeAndValidateUpdateManagedUserInput(
  input: UpdateManagedUserInput,
): UpdateManagedUserValidationResult {
  const targetUserId = input.targetUserId.trim();
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const jobTitle = input.jobTitle.trim();
  const homeOrganizationId = input.homeOrganizationId.trim();

  if (!uuidPattern.test(targetUserId) || !isValidEmail(email)) {
    return { valid: false };
  }

  if (fullName.length === 0 || fullName.length > 160) {
    return { valid: false };
  }

  if (!allowedRoles.has(input.role)) {
    return { valid: false };
  }

  if (jobTitle.length === 0 || jobTitle.length > 160) {
    return { valid: false };
  }

  if (!uuidPattern.test(homeOrganizationId)) {
    return { valid: false };
  }

  return {
    valid: true,
    input: {
      targetUserId,
      email,
      fullName,
      role: input.role,
      jobTitle,
      homeOrganizationId,
    },
  };
}

export function normalizeAndValidatePermissionsInput(
  input: UpdateManagedUserPermissionsInput,
): PermissionsValidationResult {
  const targetUserId = input.targetUserId.trim();

  if (!uuidPattern.test(targetUserId)) {
    return { valid: false };
  }

  const additionalAccess = input.additionalAccess.map((entry) => ({
    organizationId: entry.organizationId.trim(),
    permissionKeys: applyPermissionDependencies(entry.permissionKeys),
  }));
  const seenOrganizationIds = new Set<string>();

  for (const entry of additionalAccess) {
    if (!uuidPattern.test(entry.organizationId)) {
      return { valid: false };
    }

    if (
      entry.permissionKeys.some(
        (permissionKey) => !isOrganizationPermissionKey(permissionKey),
      )
    ) {
      return { valid: false };
    }

    if (seenOrganizationIds.has(entry.organizationId)) {
      return { valid: false };
    }

    seenOrganizationIds.add(entry.organizationId);
  }

  return {
    valid: true,
    input: {
      targetUserId,
      additionalAccess,
    },
  };
}

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function isManagedUserRole(value: string): value is ManagedUserRole {
  return allowedRoles.has(value as ManagedUserRole);
}

export function parseAdditionalAccess(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return [] satisfies CreateManagedUserAccessInput[];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const access: CreateManagedUserAccessInput[] = [];

  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("organizationId" in item) ||
      !("permissionKeys" in item)
    ) {
      return null;
    }

    const organizationId = item.organizationId;
    const permissionKeys = item.permissionKeys;

    if (
      typeof organizationId !== "string" ||
      !Array.isArray(permissionKeys) ||
      !permissionKeys.every(
        (permissionKey) =>
          typeof permissionKey === "string" &&
          isOrganizationPermissionKey(permissionKey),
      )
    ) {
      return null;
    }

    const normalizedPermissionKeys = applyPermissionDependencies(
      normalizePermissionKeys(permissionKeys),
    );

    if (normalizedPermissionKeys.length > 0) {
      access.push({ organizationId, permissionKeys: normalizedPermissionKeys });
    }
  }

  return access;
}

export function parseGranularAdditionalAccess(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return [] satisfies UpdateManagedUserPermissionsInput["additionalAccess"];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const access: UpdateManagedUserPermissionsInput["additionalAccess"] = [];

  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("organizationId" in item) ||
      !("permissionKeys" in item)
    ) {
      return null;
    }

    const organizationId = item.organizationId;
    const permissionKeys = item.permissionKeys;

    if (
      typeof organizationId !== "string" ||
      !Array.isArray(permissionKeys) ||
      !permissionKeys.every(
        (permissionKey) =>
          typeof permissionKey === "string" &&
          isOrganizationPermissionKey(permissionKey),
      )
    ) {
      return null;
    }

    const normalizedPermissionKeys = applyPermissionDependencies(
      normalizePermissionKeys(permissionKeys),
    );

    if (normalizedPermissionKeys.length > 0) {
      access.push({ organizationId, permissionKeys: normalizedPermissionKeys });
    }
  }

  return access;
}
