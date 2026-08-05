import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  AccessibleOrganization,
  AccessibleOrganizationsResult,
  OrganizationAccessLevel,
} from "@/features/organizations/types";
import {
  getAccessibleOrganizationNavigation,
  getOrganizationPermissions,
} from "@/features/permissions/server";
import { organizationPermissionKeys } from "@/features/permissions/registry";
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

export async function getAccessibleOrganizationsForProfile(
  supabase: SupabaseClient<Database>,
  profile: Profile,
): Promise<AccessibleOrganizationsResult> {
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
}

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
  const { data: accessRows, error: accessError } = await supabase
    .from("organization_access")
    .select("organization_id, access_level")
    .eq("user_id", profile.id);

  if (accessError) {
    return {
      status: "load_error",
      organizations: [],
    };
  }

  const organizationIds = new Set<string>();

  if (profile.home_organization_id) {
    organizationIds.add(profile.home_organization_id);
  }

  for (const access of accessRows) {
    organizationIds.add(access.organization_id);
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

  const mapped: AccessibleOrganization[] = [];

  for (const organization of organizations) {
    const isHomeOrganization = organization.id === homeOrganizationId;
    const permissions = isHomeOrganization
      ? new Set(organizationPermissionKeys)
      : await getOrganizationPermissions(supabase, profile, organization.id);

    mapped.push({
      ...organization,
      accessLevel: isHomeOrganization
        ? "manage"
        : additionalAccessByOrganizationId.get(organization.id) ?? "view",
      isHomeOrganization,
      isSystemOwnerAccess: false,
      permissionKeys: Array.from(permissions),
      navigation: getAccessibleOrganizationNavigation(permissions),
    });
  }

  return mapped;
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
