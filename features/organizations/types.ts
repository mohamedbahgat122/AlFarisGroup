import type { Database } from "@/types/database";
import type {
  OrganizationNavigationPermissions,
} from "@/features/permissions/server";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";

export type OrganizationAccessLevel =
  Database["public"]["Enums"]["organization_access_level"];

export type AccessibleOrganization = {
  id: string;
  name: string;
  code: string;
  accessLevel: OrganizationAccessLevel;
  isHomeOrganization: boolean;
  isSystemOwnerAccess: boolean;
  permissionKeys: OrganizationPermissionKey[];
  navigation: OrganizationNavigationPermissions;
};

export type AccessibleOrganizationsResult =
  | {
      status: "success";
      organizations: AccessibleOrganization[];
    }
  | {
      status: "unauthorized" | "load_error";
      organizations: [];
    };
