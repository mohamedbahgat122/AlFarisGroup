import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";
import type { Database } from "@/types/database";
import type { Profile } from "@/types/profile";

export type OrganizationNavigationPermissions = {
  organizationHome: boolean;
  drivers: boolean;
  driverReports: boolean;
  fleetCars: boolean;
  fleetMotorcycles: boolean;
  fuelManagement: boolean;
  fuelReports: boolean;
  appRequests: boolean;
  notifications: boolean;
  odometerManagement: boolean;
  driverWarnings: boolean;
  entitlements: boolean;
  shifts: boolean;
};

export async function getOrganizationPermissionsForCurrentUser(
  organizationId: string,
): Promise<Set<OrganizationPermissionKey>> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return new Set();
  }

  return getOrganizationPermissions(admin.supabase, admin.profile, organizationId);
}

export const getOrganizationPermissions = cache(
  async (
    supabase: SupabaseClient<Database>,
    profile: Profile,
    organizationId: string,
  ): Promise<Set<OrganizationPermissionKey>> => {
  if (profile.role === "system_owner") {
    const { organizationPermissionKeys } = await import("@/features/permissions/registry");
    return new Set(organizationPermissionKeys);
  }

  const { data, error } = await supabase
    .from("organization_user_permissions")
    .select("permission_key")
    .eq("user_id", profile.id)
    .eq("organization_id", organizationId);

  if (error) {
    return new Set();
  }

  return new Set(
    (data ?? []).map((row) => row.permission_key as OrganizationPermissionKey),
  );
});

export const getGlobalPermissions = cache(
  async (
    supabase: SupabaseClient<Database>,
    profile: Profile,
  ): Promise<Set<GlobalPermissionKey>> => {
    if (profile.role === "system_owner") {
      const { globalPermissionKeys } = await import(
        "@/features/permissions/global-registry"
      );
      return new Set(globalPermissionKeys);
    }

    const { data, error } = await supabase
      .from("user_global_permissions")
      .select("permission_key")
      .eq("user_id", profile.id);

    if (error) {
      console.error("[getGlobalPermissions] Error loading global permissions for user:", profile.id.slice(-6), error);
      return new Set();
    }

    return new Set(
      (data ?? []).map((row) => row.permission_key as GlobalPermissionKey),
    );
  },
);

export async function hasOrganizationPermission({
  organizationId,
  permissionKey,
}: {
  organizationId: string;
  permissionKey: OrganizationPermissionKey;
}) {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return false;
  }

  if (admin.profile.role === "system_owner") {
    return true;
  }

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organizationId,
  );

  return permissions.has(permissionKey);
}

export async function requireOrganizationPermission({
  organizationId,
  permissionKey,
}: {
  organizationId: string;
  permissionKey: OrganizationPermissionKey;
}) {
  return hasOrganizationPermission({ organizationId, permissionKey });
}

export function getAccessibleOrganizationNavigation(
  permissions: Set<OrganizationPermissionKey>,
): OrganizationNavigationPermissions {
  return {
    organizationHome: permissions.has("organization.dashboard.view"),
    drivers: permissions.has("drivers.view"),
    driverReports: permissions.has("driver_reports.view"),
    fleetCars: permissions.has("fleet.cars.view"),
    fleetMotorcycles: permissions.has("fleet.motorcycles.view"),
    fuelManagement: permissions.has("fuel.manage"),
    fuelReports: permissions.has("fuel.reports.view"),
    appRequests: permissions.has("app_requests.view"),
    notifications: permissions.has("notifications.view"),
    odometerManagement: permissions.has("odometer.manage"),
    driverWarnings: permissions.has("driver_warnings.view"),
    entitlements: permissions.has("entitlements.view"),
    shifts: permissions.has("shifts.view"),
  };
}
