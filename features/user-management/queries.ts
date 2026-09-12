import "server-only";

import type { User } from "@supabase/supabase-js";
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
import { normalizeGlobalPermissionKeys, globalPermissionKeys } from "@/features/permissions/global-registry";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import type { Database } from "@/types/database";

type OrganizationAccessRow =
  Database["public"]["Tables"]["organization_access"]["Row"];
type OrganizationPermissionRow = {
  user_id: string;
  organization_id: string;
  permission_key: string;
};
type ManagedUserProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "full_name"
  | "role"
  | "job_title"
  | "status"
  | "created_at"
  | "updated_at"
  | "home_organization_id"
  | "deleted_at"
  | "avatar_path"
>;

const managedUsersPageSize = 50;
const authUsersPageSize = 100;

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

export async function getManagedUsersForUserManagement({
  page = 1,
  search = "",
}: {
  page?: number;
  search?: string;
} = {}): Promise<ManagedUsersQueryResult> {
  const currentUser = await requireSystemOwner();

  if (!currentUser.authorized) {
    return {
      status: "unauthorized",
      users: [],
    };
  }

  const normalizedPage = Math.max(Math.floor(page), 1);
  const normalizedSearch = normalizeUserSearch(search);
  const authUsers = await getAllAuthUsers();
  const emailByUserId = new Map(authUsers.map((user) => [user.id, user.email ?? ""]));
  const profileIdsForDiagnostics = await getAllLiveProfileIds(currentUser.supabase);
  const matchingEmailUserIds = normalizedSearch
    ? authUsers
        .filter((user) => user.email?.toLowerCase().includes(normalizedSearch.toLowerCase()))
        .map((user) => user.id)
    : [];

  let profileQuery = currentUser.supabase
    .from("profiles")
    .select(
      "id, full_name, role, job_title, status, created_at, updated_at, home_organization_id, deleted_at, avatar_path",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (normalizedSearch) {
    profileQuery = profileQuery.or(buildManagedUserSearchFilter(normalizedSearch, matchingEmailUserIds));
  }

  const from = (normalizedPage - 1) * managedUsersPageSize;
  const to = from + managedUsersPageSize - 1;
  const { data: profiles, error: profilesError, count } = await profileQuery.range(from, to);

  if (profilesError) {
    return {
      status: "load_error",
      users: [],
    };
  }

  const profileRows = (profiles ?? []) as ManagedUserProfileRow[];
  const profileIds = profileRows.map((profile) => profile.id);
  const organizationIds = new Set<string>();

  for (const profile of profileRows) {
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

  const { data: globalPermissionRows, error: globalPermissionError } = profileIds.length
    ? await currentUser.supabase
        .from("user_global_permissions")
        .select("user_id, permission_key")
        .in("user_id", profileIds)
    : { data: [], error: null };

  if (globalPermissionError) {
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

  const globalPermissionsByUserId = new Map<string, GlobalPermissionKey[]>();
  for (const row of globalPermissionRows) {
    const keys = globalPermissionsByUserId.get(row.user_id) ?? [];
    keys.push(row.permission_key as GlobalPermissionKey);
    globalPermissionsByUserId.set(row.user_id, keys);
  }

  const avatarPaths = profileRows
    .map((p) => p.avatar_path)
    .filter((path): path is string => Boolean(path));

  let signedUrlsMap = new Map<string, string>();
  if (avatarPaths.length > 0) {
    const { data: urlData } = await currentUser.supabase.storage
      .from("profile-avatars")
      .createSignedUrls(avatarPaths, 3600);

    if (urlData) {
      for (const item of urlData) {
        if (!item.error && item.signedUrl && item.path) {
          signedUrlsMap.set(item.path, item.signedUrl);
        }
      }
    }
  }

  const totalRows = count ?? profileRows.length;
  const totalPages = Math.max(Math.ceil(totalRows / managedUsersPageSize), 1);

  return {
    status: "success",
    users: profileRows.map((profile) => ({
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
      globalPermissions: profile.role === "system_owner"
        ? normalizeGlobalPermissionKeys(globalPermissionKeys)
        : normalizeGlobalPermissionKeys(globalPermissionsByUserId.get(profile.id) ?? []),
      createdAt: profile.created_at,
      isSystemOwner: profile.role === "system_owner",
      avatarUrl: profile.avatar_path ? signedUrlsMap.get(profile.avatar_path) ?? null : null,
    })),
    pagination: {
      page: Math.min(normalizedPage, totalPages),
      pageSize: managedUsersPageSize,
      totalRows,
      totalPages,
      search: normalizedSearch,
    },
    diagnostics: {
      authUsersLoaded: authUsers.length,
      profilesWithoutAuthEmail: profileRows.filter((profile) => !emailByUserId.has(profile.id)).length,
      authUsersWithoutProfile: profileIdsForDiagnostics
        ? authUsers.filter((user) => !profileIdsForDiagnostics.has(user.id)).length
        : 0,
    },
  };
}

function normalizeUserSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

function buildManagedUserSearchFilter(search: string, matchingEmailUserIds: string[]) {
  const escaped = escapePostgrestFilterValue(search);
  const filters = [
    `full_name.ilike.%${escaped}%`,
    `job_title.ilike.%${escaped}%`,
  ];

  if (matchingEmailUserIds.length > 0) {
    filters.push(`id.in.(${matchingEmailUserIds.map(escapePostgrestFilterValue).join(",")})`);
  }

  return filters.join(",");
}

function escapePostgrestFilterValue(value: string) {
  return value.replace(/[,%()]/g, "");
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

async function getAllAuthUsers() {
  try {
    const admin = createAdminClient();
    const users: User[] = [];

    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: authUsersPageSize,
      });

      if (error) {
        return [];
      }

      users.push(...data.users);
      if (data.users.length < authUsersPageSize) {
        return users;
      }
    }
  } catch {
    return [];
  }
}

async function getAllLiveProfileIds(
  supabase: Awaited<ReturnType<typeof requireSystemOwner>>["supabase"],
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .is("deleted_at", null);

  if (error) return null;

  return new Set((data ?? []).map((profile) => profile.id));
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
