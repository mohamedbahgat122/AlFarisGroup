import "server-only";

import { getOrganizationPermissions } from "@/features/permissions/server";
import type { OrganizationPermissionKey } from "@/features/permissions/registry";
import type { DriverAppRequestType } from "@/features/app-requests/types";

export function requestViewPermission(type: DriverAppRequestType): OrganizationPermissionKey {
  return `app_requests.${type}.view` as OrganizationPermissionKey;
}

export function requestReviewPermission(type: DriverAppRequestType): OrganizationPermissionKey {
  return `app_requests.${type}.review` as OrganizationPermissionKey;
}

export function canViewRequestType(
  permissions: ReadonlySet<string> | readonly string[],
  type: DriverAppRequestType,
) {
  const keys = permissions instanceof Set ? permissions : new Set(permissions);
  return keys.has("app_requests.view") || keys.has(requestViewPermission(type));
}

export function canReviewRequestType(
  permissions: ReadonlySet<string> | readonly string[],
  type: DriverAppRequestType,
) {
  const keys = permissions instanceof Set ? permissions : new Set(permissions);
  return keys.has("app_requests.review") || keys.has(requestReviewPermission(type));
}

export async function loadRequestPermissions(
  supabase: Parameters<typeof getOrganizationPermissions>[0],
  profile: Parameters<typeof getOrganizationPermissions>[1],
  organizationId: string,
) {
  return getOrganizationPermissions(supabase, profile, organizationId);
}
