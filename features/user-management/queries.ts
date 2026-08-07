import "server-only";

import { requireSystemOwner } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ActiveOrganizationOption,
  ManagedUserActivityResult,
  ManagedUsersQueryResult,
} from "@/features/user-management/types";
import {
  normalizePermissionKeys,
  viewOnlyOrganizationPermissionKeys,
} from "@/features/permissions/registry";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { Database } from "@/types/database";

type OrganizationAccessRow =
  Database["public"]["Tables"]["organization_access"]["Row"];
type OrganizationPermissionRow = {
  user_id: string;
  organization_id: string;
  permission_key: string;
};

export async function getActiveOrganizationsForUserManagement(): Promise<
  ActiveOrganizationOption[]
> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return [];
  }

  const { data, error } = await currentUser.supabase
    .from("organizations")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return [];
  }

  return data;
}

export async function getManagedUsersForUserManagement(): Promise<ManagedUsersQueryResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return {
      status: "unauthorized",
      users: [],
    };
  }

  const { data: profiles, error: profilesError } = await currentUser.supabase
    .from("profiles")
    .select(
      "id, full_name, role, job_title, status, created_at, updated_at, home_organization_id, deleted_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (profilesError) {
    return {
      status: "load_error",
      users: [],
    };
  }

  const profileIds = profiles.map((profile) => profile.id);
  const organizationIds = new Set<string>();

  for (const profile of profiles) {
    if (profile.home_organization_id) {
      organizationIds.add(profile.home_organization_id);
    }
  }

  const { data: accessRows, error: accessError } = profileIds.length
    ? await currentUser.supabase
        .from("organization_access")
        .select("user_id, organization_id, access_level, created_at, updated_at")
        .in("user_id", profileIds)
    : { data: [] satisfies OrganizationAccessRow[], error: null };

  if (accessError) {
    return {
      status: "load_error",
      users: [],
    };
  }

  const { data: permissionRows, error: permissionError } = profileIds.length
    ? await currentUser.supabase
        .from("organization_user_permissions")
        .select("user_id, organization_id, permission_key")
        .in("user_id", profileIds)
    : { data: [] satisfies OrganizationPermissionRow[], error: null };

  if (permissionError) {
    return {
      status: "load_error",
      users: [],
    };
  }

  for (const access of accessRows) {
    organizationIds.add(access.organization_id);
  }

  for (const permission of permissionRows) {
    organizationIds.add(permission.organization_id);
  }

  const { data: organizations, error: organizationsError } = organizationIds.size
    ? await currentUser.supabase
        .from("organizations")
        .select("id, name, code")
        .in("id", Array.from(organizationIds))
    : { data: [] satisfies ActiveOrganizationOption[], error: null };

  if (organizationsError) {
    return {
      status: "load_error",
      users: [],
    };
  }

  const emailByUserId = await getAuthEmailMap();
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );
  const accessByUserId = groupAccessByUserId(accessRows);
  const accessByUserAndOrganization = new Map(
    accessRows.map((access) => [
      `${access.user_id}:${access.organization_id}`,
      access,
    ]),
  );
  const permissionsByUserAndOrganization =
    groupPermissionKeysByUserAndOrganization(permissionRows);

  return {
    status: "success",
    users: profiles.map((profile) => ({
      id: profile.id,
      email: emailByUserId.get(profile.id) ?? "",
      fullName: profile.full_name,
      role: profile.role,
      jobTitle: profile.job_title,
      status: profile.status,
      homeOrganization: profile.home_organization_id
        ? organizationsById.get(profile.home_organization_id) ?? null
        : null,
      additionalAccess: Array.from(
        new Set([
          ...(accessByUserId.get(profile.id) ?? []).map(
            (access) => access.organization_id,
          ),
          ...Array.from(permissionsByUserAndOrganization.keys())
            .filter((key) => key.startsWith(`${profile.id}:`))
            .map((key) => key.slice(profile.id.length + 1)),
        ]),
      ).flatMap((organizationId) => {
        const organization = organizationsById.get(organizationId);

        if (!organization) {
          return [];
        }

        const permissionKeys = normalizePermissionKeys(
          permissionsByUserAndOrganization.get(
            `${profile.id}:${organizationId}`,
          ) ?? [],
        );
        const access = accessByUserAndOrganization.get(
          `${profile.id}:${organizationId}`,
        );

        return {
          organizationId: organization.id,
          organizationName: organization.name,
          organizationCode: organization.code,
          accessLevel:
            access?.access_level ?? getAccessLevelFromPermissions(permissionKeys),
          permissionKeys,
        };
      }),
      createdAt: profile.created_at,
      isSystemOwner: profile.role === "system_owner",
    })),
  };
}

function getAccessLevelFromPermissions(
  permissionKeys: OrganizationPermissionKey[],
): Database["public"]["Enums"]["organization_access_level"] {
  return permissionKeys.every((permissionKey) =>
    (viewOnlyOrganizationPermissionKeys as readonly string[]).includes(permissionKey),
  )
    ? "view"
    : "manage";
}

function groupPermissionKeysByUserAndOrganization(
  permissionRows: OrganizationPermissionRow[],
) {
  const grouped = new Map<string, string[]>();

  for (const row of permissionRows) {
    const key = `${row.user_id}:${row.organization_id}`;
    const permissions = grouped.get(key) ?? [];
    permissions.push(row.permission_key);
    grouped.set(key, permissions);
  }

  return grouped;
}

async function getAuthEmailMap() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });

    if (error) {
      return new Map<string, string>();
    }

    return new Map(data.users.map((user) => [user.id, user.email ?? ""]));
  } catch {
    return new Map<string, string>();
  }
}

export async function getUserActivityLogs(
  userId: string,
): Promise<ManagedUserActivityResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return {
      status: "unauthorized",
      userActivity: [],
      accountHistory: [],
    };
  }

  const [userActivity, accountHistory] = await Promise.all([
    loadActivityLogs(currentUser.supabase, "actor_user_id", userId),
    loadActivityLogs(currentUser.supabase, "target_user_id", userId),
  ]);

  if (!userActivity.success || !accountHistory.success) {
    return {
      status: "load_error",
      userActivity: [],
      accountHistory: [],
    };
  }

  return {
    status: "success",
    userActivity: userActivity.logs,
    accountHistory: accountHistory.logs,
  };
}

function groupAccessByUserId(accessRows: OrganizationAccessRow[]) {
  const grouped = new Map<string, OrganizationAccessRow[]>();

  for (const access of accessRows) {
    const userAccess = grouped.get(access.user_id) ?? [];
    userAccess.push(access);
    grouped.set(access.user_id, userAccess);
  }

  return grouped;
}

async function loadActivityLogs(
  supabase: Awaited<ReturnType<typeof requireSystemOwner>>["supabase"],
  column: "actor_user_id" | "target_user_id",
  userId: string,
) {
  const { data, error } = await supabase
    .from("activity_logs")
    .select(
      "id, action, before_data, after_data, created_at, actor_user_id, target_user_id, organization_id",
    )
    .eq(column, userId)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return { success: false as const };
  }

  const userIds = new Set<string>();
  const organizationIds = new Set<string>();

  for (const log of data) {
    if (log.actor_user_id) {
      userIds.add(log.actor_user_id);
    }
    if (log.target_user_id) {
      userIds.add(log.target_user_id);
    }
    if (log.organization_id) {
      organizationIds.add(log.organization_id);
    }
  }

  const { data: profiles, error: profilesError } = userIds.size
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(userIds))
    : { data: [] satisfies { id: string; full_name: string }[], error: null };

  if (profilesError) {
    return { success: false as const };
  }

  const { data: organizations, error: organizationsError } = organizationIds.size
    ? await supabase
        .from("organizations")
        .select("id, name")
        .in("id", Array.from(organizationIds))
    : { data: [] satisfies { id: string; name: string }[], error: null };

  if (organizationsError) {
    return { success: false as const };
  }

  const profileNames = new Map(
    profiles.map((profile) => [profile.id, profile.full_name]),
  );
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );

  return {
    success: true as const,
    logs: data.map((log) => ({
      id: log.id,
      action: log.action,
      actorName: log.actor_user_id
        ? profileNames.get(log.actor_user_id) ?? null
        : null,
      targetName: log.target_user_id
        ? profileNames.get(log.target_user_id) ?? null
        : null,
      organizationName: log.organization_id
        ? organizationNames.get(log.organization_id) ?? null
        : null,
      beforeData: log.before_data,
      afterData: log.after_data,
      createdAt: log.created_at,
    })),
  };
}
