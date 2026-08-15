import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function getAuthorizationRevision(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const [profileResult, accessResult, permissionResult, globalPermissionResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("status, role, home_organization_id, deleted_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("organization_access")
        .select("organization_id, access_level")
        .eq("user_id", userId),
      supabase
        .from("organization_user_permissions")
        .select("organization_id, permission_key")
        .eq("user_id", userId),
      supabase
        .from("user_global_permissions")
        .select("permission_key")
        .eq("user_id", userId),
    ]);

  if (
    profileResult.error ||
    accessResult.error ||
    permissionResult.error ||
    globalPermissionResult.error
  ) {
    return null;
  }

  const canonicalState = {
    profile: profileResult.data
      ? {
          status: profileResult.data.status,
          role: profileResult.data.role,
          homeOrganizationId: profileResult.data.home_organization_id,
          deletedAt: profileResult.data.deleted_at,
        }
      : null,
    organizationAccess: accessResult.data
      .map((row) => ({
        organizationId: row.organization_id,
        accessLevel: row.access_level,
      }))
      .sort(compareAuthorizationEntries),
    organizationPermissions: permissionResult.data
      .map((row) => ({
        organizationId: row.organization_id,
        permissionKey: row.permission_key,
      }))
      .sort(compareAuthorizationEntries),
    globalPermissions: globalPermissionResult.data
      .map((row) => row.permission_key)
      .sort(),
  };

  return createHash("sha256")
    .update(stableStringify(canonicalState))
    .digest("hex");
}

function compareAuthorizationEntries(
  first: Record<string, string | null>,
  second: Record<string, string | null>,
) {
  return stableStringify(first).localeCompare(stableStringify(second));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([firstKey], [secondKey]) =>
      firstKey.localeCompare(secondKey),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
