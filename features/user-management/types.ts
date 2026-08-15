import type { Database } from "@/types/database";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { GlobalPermissionKey } from "@/features/permissions/global-registry";

export type ManagedUserRole = Exclude<
  Database["public"]["Enums"]["app_role"],
  "system_owner"
>;

export type OrganizationAccessLevel =
  Database["public"]["Enums"]["organization_access_level"];

export type CreateManagedUserAccessInput = {
  organizationId: string;
  permissionKeys: OrganizationPermissionKey[];
};

export type CreateManagedUserInput = {
  email: string;
  password: string;
  fullName: string;
  role: ManagedUserRole;
  jobTitle: string;
  homeOrganizationId: string;
  additionalAccess: CreateManagedUserAccessInput[];
};

export type UpdateManagedUserInput = {
  targetUserId: string;
  email: string;
  fullName: string;
  role: ManagedUserRole;
  jobTitle: string;
  homeOrganizationId: string;
};

export type UpdateManagedUserPermissionsInput = {
  targetUserId: string;
  additionalAccess: {
    organizationId: string;
    permissionKeys: OrganizationPermissionKey[];
  }[];
  globalPermissions: GlobalPermissionKey[];
};

export type ManagedUserStatusInput = {
  targetUserId: string;
  status: Database["public"]["Enums"]["account_status"];
};

export type ManagedUserTargetInput = {
  targetUserId: string;
};

export type ActiveOrganizationOption = {
  id: string;
  name: string;
  code: string;
};

export type ManagedUserListItem = {
  id: string;
  email: string;
  fullName: string | null;
  role: Database["public"]["Enums"]["app_role"];
  jobTitle: string | null;
  status: Database["public"]["Enums"]["account_status"];
  homeOrganization: ActiveOrganizationOption | null;
  additionalAccess: {
    organizationId: string;
    organizationName: string;
    organizationCode: string;
    accessLevel: OrganizationAccessLevel;
    permissionKeys: OrganizationPermissionKey[];
  }[];
  globalPermissions: GlobalPermissionKey[];
  createdAt: string;
  isSystemOwner: boolean;
};

export type ManagedUserActivityLog = {
  id: string;
  action: string;
  actorName: string | null;
  targetName: string | null;
  organizationName: string | null;
  beforeData: Database["public"]["Tables"]["activity_logs"]["Row"]["before_data"];
  afterData: Database["public"]["Tables"]["activity_logs"]["Row"]["after_data"];
  createdAt: string;
};

export type ManagedUserActivityResult =
  | {
      status: "success";
      userActivity: ManagedUserActivityLog[];
      accountHistory: ManagedUserActivityLog[];
    }
  | {
      status: "unauthorized" | "load_error";
      userActivity: [];
      accountHistory: [];
    };

export type ManagedUsersQueryResult =
  | {
      status: "success";
      users: ManagedUserListItem[];
      pagination: {
        page: number;
        pageSize: number;
        totalRows: number;
        totalPages: number;
        search: string;
      };
      diagnostics: {
        authUsersLoaded: number;
        profilesWithoutAuthEmail: number;
        authUsersWithoutProfile: number;
      };
    }
  | {
      status: "unauthorized" | "configuration_error" | "load_error";
      users: [];
    };

export type CreateManagedUserErrorCode =
  | "validation_error"
  | "email_already_exists"
  | "organization_not_found"
  | "organization_inactive"
  | "additional_organization_invalid"
  | "unauthorized"
  | "configuration_error"
  | "protected_user"
  | "self_operation"
  | "creation_failed";

export type ManagedUserMutationErrorCode =
  | CreateManagedUserErrorCode
  | "not_found"
  | "update_failed"
  | "unknown_permission";

export type CreateManagedUserResult =
  | {
      success: true;
      userId: string;
    }
  | {
      success: false;
      code: ManagedUserMutationErrorCode;
    };
