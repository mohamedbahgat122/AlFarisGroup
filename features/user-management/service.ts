import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSystemOwner } from "@/lib/auth/authorization";
import {
  normalizeAndValidateCreateManagedUserInput,
  normalizeAndValidatePermissionsInput,
  normalizeAndValidateUpdateManagedUserInput,
  isUuid,
} from "@/features/user-management/validation";
import type {
  CreateManagedUserInput,
  CreateManagedUserResult,
  ManagedUserStatusInput,
  ManagedUserTargetInput,
  UpdateManagedUserInput,
  UpdateManagedUserPermissionsInput,
} from "@/features/user-management/types";
import type { Database } from "@/types/database";

const longBanDuration = "876000h";

export async function createManagedUser(
  input: CreateManagedUserInput,
): Promise<CreateManagedUserResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return {
      success: false,
      code: "unauthorized",
    };
  }

  const validation = normalizeAndValidateCreateManagedUserInput(input);

  if (!validation.valid) {
    return {
      success: false,
      code: "validation_error",
    };
  }

  const normalizedInput = validation.input;
  const organizationIds = [
    normalizedInput.homeOrganizationId,
    ...normalizedInput.additionalAccess.map((access) => access.organizationId),
  ];

  const { data: organizations, error: organizationsError } =
    await currentUser.supabase
      .from("organizations")
      .select("id, is_active")
      .in("id", organizationIds);

  if (organizationsError) {
    return {
      success: false,
      code: "organization_not_found",
    };
  }

  const organizationMap = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );

  for (const organizationId of organizationIds) {
    const organization = organizationMap.get(organizationId);

    if (!organization) {
      return {
        success: false,
        code: "organization_not_found",
      };
    }

    if (!organization.is_active) {
      return {
        success: false,
        code: "organization_inactive",
      };
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      success: false,
      code: "configuration_error",
    };
  }

  const { data: createdUser, error: createUserError } =
    await admin.auth.admin.createUser({
      email: normalizedInput.email,
      password: normalizedInput.password,
      email_confirm: true,
    });

  if (createUserError || !createdUser.user) {
    return {
      success: false,
      code: createUserError?.status === 422 ? "email_already_exists" : "creation_failed",
    };
  }

  const newUserId = createdUser.user.id;
  const { error: profileError } = await admin.rpc("create_managed_user_profile", {
    p_actor_user_id: currentUser.user.id,
    p_user_id: newUserId,
    p_full_name: normalizedInput.fullName,
    p_role: normalizedInput.role,
    p_job_title: normalizedInput.jobTitle,
    p_home_organization_id: normalizedInput.homeOrganizationId,
    p_additional_access: normalizedInput.additionalAccess.map((access) => ({
      organizationId: access.organizationId,
      permissionKeys: access.permissionKeys,
    })),
  });

  if (profileError) {
    logManagedUserProfileCreationFailure(profileError, normalizedInput);

    const { error: deleteAuthUserError } =
      await admin.auth.admin.deleteUser(newUserId);

    if (deleteAuthUserError) {
      console.error("[MANAGED_USER_AUTH_DELETE_CLEANUP_FAILED]", {
        userIdSuffix: safeSuffix(newUserId),
        error: getSupabaseErrorDiagnostic(deleteAuthUserError),
      });

      const { error: banAuthUserError } = await admin.auth.admin.updateUserById(
        newUserId,
        {
          ban_duration: longBanDuration,
        },
      );

      if (banAuthUserError) {
        console.error("[MANAGED_USER_AUTH_BAN_CLEANUP_FAILED]", {
          userIdSuffix: safeSuffix(newUserId),
          error: getSupabaseErrorDiagnostic(banAuthUserError),
        });
      }
    }

    return {
      success: false,
      code: isAdditionalOrganizationUnavailableError(profileError)
        ? "additional_organization_invalid"
        : "creation_failed",
    };
  }

  return {
    success: true,
    userId: newUserId,
  };
}

export async function updateManagedUser(
  input: UpdateManagedUserInput,
): Promise<CreateManagedUserResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return { success: false, code: "unauthorized" };
  }

  const validation = normalizeAndValidateUpdateManagedUserInput(input);

  if (!validation.valid) {
    return { success: false, code: "validation_error" };
  }

  const normalizedInput = validation.input;

  if (normalizedInput.targetUserId === currentUser.user.id) {
    return { success: false, code: "self_operation" };
  }

  const target = await loadEditableTarget(
    currentUser.supabase,
    normalizedInput.targetUserId,
  );

  if (!target.success) {
    return target;
  }

  if (target.profile.role === "system_owner") {
    return { success: false, code: "protected_user" };
  }

  const organization = await verifyActiveOrganization(
    currentUser.supabase,
    normalizedInput.homeOrganizationId,
  );

  if (!organization.success) {
    return organization;
  }

  const oldEmail = target.email;
  const emailChanged = Boolean(oldEmail) && oldEmail !== normalizedInput.email;
  let admin;

  try {
    admin = createAdminClient();
  } catch {
    return { success: false, code: "configuration_error" };
  }

  if (emailChanged) {
    const { error: emailError } = await admin.auth.admin.updateUserById(
      normalizedInput.targetUserId,
      {
        email: normalizedInput.email,
      },
    );

    if (emailError) {
      return {
        success: false,
        code: emailError.status === 422 ? "email_already_exists" : "update_failed",
      };
    }
  }

  const { error: rpcError } = await admin.rpc("update_managed_user_profile", {
    p_actor_user_id: currentUser.user.id,
    p_target_user_id: normalizedInput.targetUserId,
    p_full_name: normalizedInput.fullName,
    p_role: normalizedInput.role,
    p_job_title: normalizedInput.jobTitle,
    p_home_organization_id: normalizedInput.homeOrganizationId,
    p_email_changed: emailChanged,
  });

  if (rpcError) {
    if (emailChanged && oldEmail) {
      await admin.auth.admin.updateUserById(normalizedInput.targetUserId, {
        email: oldEmail,
      });
    }

    return { success: false, code: "update_failed" };
  }

  return { success: true, userId: normalizedInput.targetUserId };
}

export async function updateManagedUserPermissions(
  input: UpdateManagedUserPermissionsInput,
): Promise<CreateManagedUserResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return { success: false, code: "unauthorized" };
  }

  const validation = normalizeAndValidatePermissionsInput(input);

  if (!validation.valid) {
    logManagedUserPermissionsFailure({
      stage: "validation",
      targetUserId: input.targetUserId,
      additionalAccess: input.additionalAccess,
      error: null,
    });
    return { success: false, code: "validation_error" };
  }

  const normalizedInput = validation.input;

  if (normalizedInput.targetUserId === currentUser.user.id) {
    logManagedUserPermissionsFailure({
      stage: "self_operation",
      targetUserId: normalizedInput.targetUserId,
      additionalAccess: normalizedInput.additionalAccess,
      error: null,
    });
    return { success: false, code: "self_operation" };
  }

  const target = await loadEditableTarget(
    currentUser.supabase,
    normalizedInput.targetUserId,
  );

  if (!target.success) {
    logManagedUserPermissionsFailure({
      stage: "load_target",
      targetUserId: normalizedInput.targetUserId,
      additionalAccess: normalizedInput.additionalAccess,
      error: null,
    });
    return target;
  }

  if (target.profile.role === "system_owner") {
    logManagedUserPermissionsFailure({
      stage: "protected_target",
      targetUserId: normalizedInput.targetUserId,
      additionalAccess: normalizedInput.additionalAccess,
      error: null,
    });
    return { success: false, code: "protected_user" };
  }

  if (target.profile.role === "driver" && normalizedInput.additionalAccess.length > 0) {
    logManagedUserPermissionsFailure({
      stage: "driver_target",
      targetUserId: normalizedInput.targetUserId,
      additionalAccess: normalizedInput.additionalAccess,
      error: null,
    });
    return { success: false, code: "validation_error" };
  }



  const organizationIds = normalizedInput.additionalAccess.map(
    (access) => access.organizationId,
  );

  if (organizationIds.length > 0) {
    const organizations = await verifyActiveOrganizations(
      currentUser.supabase,
      organizationIds,
    );

    if (!organizations.success) {
      logManagedUserPermissionsFailure({
        stage: "verify_organizations",
        targetUserId: normalizedInput.targetUserId,
        additionalAccess: normalizedInput.additionalAccess,
        error: null,
      });
      return organizations;
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    logManagedUserPermissionsFailure({
      stage: "create_admin_client",
      targetUserId: normalizedInput.targetUserId,
      additionalAccess: normalizedInput.additionalAccess,
      error: null,
    });
    return { success: false, code: "configuration_error" };
  }

  const { error } = await admin.rpc("replace_managed_user_organization_permissions", {
    p_actor_user_id: currentUser.user.id,
    p_target_user_id: normalizedInput.targetUserId,
    p_access: normalizedInput.additionalAccess.map((access) => ({
      organizationId: access.organizationId,
      permissionKeys: access.permissionKeys,
    })),
  });

  if (error) {
    logManagedUserPermissionsFailure({
      stage: "replace_permissions_rpc",
      targetUserId: normalizedInput.targetUserId,
      additionalAccess: normalizedInput.additionalAccess,
      error,
    });
    return { success: false, code: "update_failed" };
  }

  const { error: deleteError } = await admin.from("user_global_permissions").delete().eq("user_id", normalizedInput.targetUserId);
  if (!deleteError && normalizedInput.globalPermissions.length > 0) {
    await admin.from("user_global_permissions").insert(
      normalizedInput.globalPermissions.map(key => ({
        user_id: normalizedInput.targetUserId,
        permission_key: key,
        created_by: currentUser.user.id
      }))
    );
  }

  return { success: true, userId: normalizedInput.targetUserId };
}

export async function setManagedUserStatus(
  input: ManagedUserStatusInput,
): Promise<CreateManagedUserResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return { success: false, code: "unauthorized" };
  }

  const targetUserId = input.targetUserId.trim();

  if (!isUuid(targetUserId) || !["active", "suspended"].includes(input.status)) {
    return { success: false, code: "validation_error" };
  }

  if (targetUserId === currentUser.user.id) {
    return { success: false, code: "self_operation" };
  }

  const target = await loadEditableTarget(currentUser.supabase, targetUserId);

  if (!target.success) {
    return target;
  }

  if (target.profile.role === "system_owner") {
    return { success: false, code: "protected_user" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false, code: "configuration_error" };
  }

  const banDuration = input.status === "suspended" ? longBanDuration : "none";
  const rollbackBanDuration =
    target.profile.status === "suspended" ? longBanDuration : "none";

  const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: banDuration,
  });

  if (authError) {
    return { success: false, code: "update_failed" };
  }

  const { error: rpcError } = await admin.rpc("set_managed_user_status", {
    p_actor_user_id: currentUser.user.id,
    p_target_user_id: targetUserId,
    p_status: input.status,
  });

  if (rpcError) {
    await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: rollbackBanDuration,
    });

    return { success: false, code: "update_failed" };
  }

  return { success: true, userId: targetUserId };
}

export async function archiveManagedUser(
  input: ManagedUserTargetInput,
): Promise<CreateManagedUserResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return { success: false, code: "unauthorized" };
  }

  const targetUserId = input.targetUserId.trim();

  if (!isUuid(targetUserId)) {
    return { success: false, code: "validation_error" };
  }

  if (targetUserId === currentUser.user.id) {
    return { success: false, code: "self_operation" };
  }

  const target = await loadEditableTarget(currentUser.supabase, targetUserId);

  if (!target.success) {
    return target;
  }

  if (target.profile.role === "system_owner") {
    return { success: false, code: "protected_user" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false, code: "configuration_error" };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: longBanDuration,
  });

  if (authError) {
    return { success: false, code: "update_failed" };
  }

  const { error: rpcError } = await admin.rpc("archive_managed_user", {
    p_actor_user_id: currentUser.user.id,
    p_target_user_id: targetUserId,
  });

  if (rpcError) {
    await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: target.profile.status === "suspended" ? longBanDuration : "none",
    });

    return { success: false, code: "update_failed" };
  }

  return { success: true, userId: targetUserId };
}

async function loadEditableTarget(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false as const, code: "configuration_error" as const };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, job_title, status, created_at, updated_at, home_organization_id, deleted_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { success: false as const, code: "update_failed" as const };
  }

  if (!profile || profile.deleted_at) {
    return { success: false as const, code: "not_found" as const };
  }

  const { data: authUser, error: authError } =
    await admin.auth.admin.getUserById(userId);

  if (authError || !authUser.user) {
    return { success: false as const, code: "update_failed" as const };
  }

  return {
    success: true as const,
    profile,
    email: authUser.user.email ?? "",
  };
}

async function verifyActiveOrganization(
  supabase: Awaited<ReturnType<typeof requireSystemOwner>>["supabase"],
  organizationId: string,
) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, is_active")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return { success: false as const, code: "organization_not_found" as const };
  }

  if (!data.is_active) {
    return { success: false as const, code: "organization_inactive" as const };
  }

  return { success: true as const };
}

async function verifyActiveOrganizations(
  supabase: Awaited<ReturnType<typeof requireSystemOwner>>["supabase"],
  organizationIds: string[],
) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, is_active")
    .in("id", organizationIds);

  if (error || data.length !== organizationIds.length) {
    return { success: false as const, code: "organization_not_found" as const };
  }

  if (data.some((organization) => !organization.is_active)) {
    return { success: false as const, code: "organization_inactive" as const };
  }

  return { success: true as const };
}

function logManagedUserPermissionsFailure({
  stage,
  targetUserId,
  additionalAccess,
  error,
}: {
  stage: string;
  targetUserId: string;
  additionalAccess: UpdateManagedUserPermissionsInput["additionalAccess"];
  error: {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  } | null;
}) {
  if (process.env.NODE_ENV === "production") return;

  console.error("[user-management:permissions-update]", {
    stage,
    targetUserIdSuffix: safeSuffix(targetUserId),
    selectedOrganizationIdSuffixes: additionalAccess.map((access) =>
      safeSuffix(access.organizationId),
    ),
    submittedPermissionKeysByOrganization: additionalAccess.map((access) => ({
      organizationIdSuffix: safeSuffix(access.organizationId),
      permissionKeys: access.permissionKeys,
    })),
    duplicatePermissionKeysByOrganization: additionalAccess
      .map((access) => ({
        organizationIdSuffix: safeSuffix(access.organizationId),
        permissionKeys: findDuplicates(access.permissionKeys),
      }))
      .filter((entry) => entry.permissionKeys.length > 0),
    error: error
      ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        }
      : null,
  });
}

function logManagedUserProfileCreationFailure(
  error: {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
  },
  input: CreateManagedUserInput,
) {
  if (process.env.NODE_ENV === "production") {
    console.error("[MANAGED_USER_PROFILE_CREATION_FAILED]");
    return;
  }

  console.error("[MANAGED_USER_PROFILE_CREATION_FAILED]", {
    homeOrganizationId: input.homeOrganizationId,
    additionalOrganizationIds: input.additionalAccess.map(
      (access) => access.organizationId,
    ),
    error: getSupabaseErrorDiagnostic(error),
  });
}

function isAdditionalOrganizationUnavailableError(error: { message?: string }) {
  return (
    error.message ===
    "Managed user profile creation failed: organization is inactive or missing."
  );
}

function getSupabaseErrorDiagnostic(error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}) {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return Array.from(duplicates);
}

function safeSuffix(value: string | null | undefined) {
  return value ? value.slice(-8) : "";
}
