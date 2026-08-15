import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AccessibleOrganization,
  AccessibleOrganizationsResult,
  OrganizationAccessLevel,
} from "@/features/organizations/types";
import {
  getAccessibleOrganizationNavigation,
  getOrganizationPermissions,
} from "@/features/permissions/server";
import {
  organizationPermissionKeys,
  viewOnlyOrganizationPermissionKeys,
} from "@/features/permissions/registry";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { Database } from "@/types/database";
import type { Profile } from "@/types/profile";

type OrganizationRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "code"
>;

type OrganizationAccessRow = Pick<
  Database["public"]["Tables"]["organization_access"]["Row"],
  "organization_id" | "access_level"
>;

type OrganizationPermissionRow = Pick<
  Database["public"]["Tables"]["organization_user_permissions"]["Row"],
  "organization_id" | "permission_key"
>;

const ORGANIZATION_CODE_PATTERN = /^[a-z0-9_]{1,80}$/;

export async function getAccessibleOrganizationsForCurrentUser(): Promise<AccessibleOrganizationsResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return {
      status: "unauthorized",
      organizations: [],
    };
  }

  return getAccessibleOrganizationsForProfile(admin.supabase, admin.profile);
}

export const getAccessibleOrganizationsForProfile = cache(
  async (
    supabase: SupabaseClient<Database>,
    profile: Profile,
  ): Promise<AccessibleOrganizationsResult> => {
    if (profile.role === "system_owner") {
      return getSystemOwnerOrganizations(supabase, profile.home_organization_id);
    }

    if (profile.role !== "manager" && profile.role !== "supervisor") {
      return {
        status: "unauthorized",
        organizations: [],
      };
    }

    return getScopedOrganizations(supabase, profile);
  },
);

export async function getAccessibleOrganizationByCode(
  organizationCode: string,
): Promise<AccessibleOrganization | null> {
  const normalizedCode = organizationCode.trim();

  if (!ORGANIZATION_CODE_PATTERN.test(normalizedCode)) {
    return null;
  }

  const result = await getAccessibleOrganizationsForCurrentUser();

  if (result.status !== "success") {
    return null;
  }

  return (
    result.organizations.find(
      (organization) => organization.code === normalizedCode,
    ) ?? null
  );
}

export async function getOrganizationPageAccessByCode(
  organizationCode: string,
): Promise<
  | { status: "success"; organization: AccessibleOrganization }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "unauthenticated" }
  | { status: "load_error" }
> {
  const normalizedCode = organizationCode.trim();

  if (!ORGANIZATION_CODE_PATTERN.test(normalizedCode)) {
    return { status: "not_found" };
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return admin.status === "unauthenticated"
      ? { status: "unauthenticated" }
      : { status: "forbidden" };
  }

  const result = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );

  if (result.status !== "success") {
    return { status: "load_error" };
  }

  const organization = result.organizations.find(
    (item) => item.code === normalizedCode,
  );

  if (organization) {
    return { status: "success", organization };
  }

  let serviceClient: SupabaseClient<Database>;
  try {
    serviceClient = createAdminClient();
  } catch {
    return { status: "load_error" };
  }

  const { data: existingOrganization, error: existingError } =
    await serviceClient
      .from("organizations")
      .select("id")
      .eq("code", normalizedCode)
      .eq("is_active", true)
      .maybeSingle();

  if (existingError) {
    return { status: "load_error" };
  }

  return existingOrganization ? { status: "forbidden" } : { status: "not_found" };
}

async function getSystemOwnerOrganizations(
  supabase: SupabaseClient<Database>,
  homeOrganizationId: string | null,
): Promise<AccessibleOrganizationsResult> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    return {
      status: "load_error",
      organizations: [],
    };
  }

  return {
    status: "success",
    organizations: sortOrganizations(
      data.map((organization) => ({
        ...organization,
        accessLevel: "manage",
        isHomeOrganization: organization.id === homeOrganizationId,
        isSystemOwnerAccess: true,
        permissionKeys: [...organizationPermissionKeys],
        navigation: {
          organizationHome: true,
          drivers: true,
          driverReports: true,
          fleetCars: true,
          fleetMotorcycles: true,
          fuelManagement: true,
          fuelReports: true,
          appRequests: true,
          notifications: true,
          odometerManagement: true,
          driverWarnings: true,
          entitlements: true,
          shifts: true,
        },
      })),
    ),
  };
}

async function getScopedOrganizations(
  supabase: SupabaseClient<Database>,
  profile: Profile,
): Promise<AccessibleOrganizationsResult> {
  const [accessResult, permissionResult] = await Promise.all([
    supabase
      .from("organization_access")
      .select("organization_id, access_level")
      .eq("user_id", profile.id),
    supabase
      .from("organization_user_permissions")
      .select("organization_id, permission_key")
      .eq("user_id", profile.id),
  ]);

  if (accessResult.error || permissionResult.error) {
    return {
      status: "load_error",
      organizations: [],
    };
  }

  const accessRows = accessResult.data;
  const permissionRows = permissionResult.data;

  const organizationIds = new Set<string>();

  for (const access of accessRows) {
    organizationIds.add(access.organization_id);
  }

  for (const permission of permissionRows) {
    organizationIds.add(permission.organization_id);
  }

  if (organizationIds.size === 0) {
    return {
      status: "success",
      organizations: [],
    };
  }

  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id, name, code")
    .eq("is_active", true)
    .in("id", Array.from(organizationIds));

  if (organizationsError) {
    return {
      status: "load_error",
      organizations: [],
    };
  }

  return {
    status: "success",
    organizations: sortOrganizations(
      await mergeOrganizationAccess(
        supabase,
        profile,
        organizations,
        accessRows,
        permissionRows,
        profile.home_organization_id,
      ),
    ),
  };
}

async function mergeOrganizationAccess(
  supabase: SupabaseClient<Database>,
  profile: Profile,
  organizations: OrganizationRow[],
  accessRows: OrganizationAccessRow[],
  permissionRows: OrganizationPermissionRow[],
  homeOrganizationId: string | null,
) {
  const additionalAccessByOrganizationId = new Map<
    string,
    OrganizationAccessLevel
  >(
    accessRows.map((access) => [
      access.organization_id,
      access.access_level,
    ]),
  );
  const permissionsByOrganizationId = groupPermissionKeysByOrganization(permissionRows);

  const mapped: AccessibleOrganization[] = [];

  for (const organization of organizations) {
    const isHomeOrganization = organization.id === homeOrganizationId;
    const permissionKeys =
      permissionsByOrganizationId.get(organization.id) ??
      Array.from(await getOrganizationPermissions(supabase, profile, organization.id));
    const permissions = new Set(permissionKeys);
    const accessLevel =
      additionalAccessByOrganizationId.get(organization.id) ??
      getAccessLevelFromPermissions(permissionKeys);

    mapped.push({
      ...organization,
      accessLevel,
      isHomeOrganization,
      isSystemOwnerAccess: false,
      permissionKeys: Array.from(permissions),
      navigation: getAccessibleOrganizationNavigation(permissions),
    });
  }

  return mapped;
}

function groupPermissionKeysByOrganization(permissionRows: OrganizationPermissionRow[]) {
  const grouped = new Map<string, OrganizationPermissionKey[]>();

  for (const row of permissionRows) {
    const permissions = grouped.get(row.organization_id) ?? [];
    permissions.push(row.permission_key as OrganizationPermissionKey);
    grouped.set(row.organization_id, permissions);
  }

  return grouped;
}

function getAccessLevelFromPermissions(
  permissionKeys: OrganizationPermissionKey[],
): OrganizationAccessLevel {
  return permissionKeys.every((permissionKey) =>
    (viewOnlyOrganizationPermissionKeys as readonly string[]).includes(permissionKey),
  )
    ? "view"
    : "manage";
}

function sortOrganizations(organizations: AccessibleOrganization[]) {
  return [...organizations].sort((first, second) => {
    if (first.isHomeOrganization !== second.isHomeOrganization) {
      return first.isHomeOrganization ? -1 : 1;
    }

    return first.name.localeCompare(second.name, ["ar", "en"], {
      sensitivity: "base",
    });
  });
}
