import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { Profile, ProfileRole } from "@/types/profile";

const adminRoles = new Set<ProfileRole>([
  "system_owner",
  "manager",
  "supervisor",
]);

export type AdminAuthorizationResult =
  | {
      status: "authorized";
      user: User;
      profile: Profile;
      supabase: SupabaseClient<Database>;
    }
  | {
      status:
        | "unauthenticated"
        | "missing_profile"
        | "suspended"
        | "driver"
        | "unexpected";
      supabase: SupabaseClient<Database>;
    };

export type AccessDeniedReason = Exclude<
  AdminAuthorizationResult["status"],
  "authorized" | "unauthenticated"
>;

type ProfileAccessResult =
  | {
      allowed: true;
      profile: Profile;
    }
  | {
      allowed: false;
      reason: AccessDeniedReason;
    };

export async function getProfileForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, job_title, status, created_at, updated_at, home_organization_id, deleted_at, must_change_password",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

export function validateAdminProfile(profile: Profile | null): ProfileAccessResult {
  if (!profile) {
    return {
      allowed: false,
      reason: "missing_profile",
    };
  }

  if (profile.status !== "active" || profile.deleted_at) {
    return {
      allowed: false,
      reason: "suspended",
    };
  }

  if (profile.role === "driver") {
    return {
      allowed: false,
      reason: "driver",
    };
  }

  if (!adminRoles.has(profile.role)) {
    return {
      allowed: false,
      reason: "unexpected",
    };
  }

  return {
    allowed: true,
    profile,
  };
}

export async function getAuthenticatedAdmin(): Promise<AdminAuthorizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      status: "unauthenticated",
      supabase,
    };
  }

  const profile = await getProfileForUser(supabase, user.id);
  const access = validateAdminProfile(profile);

  if (!access.allowed) {
    return {
      status: access.reason,
      supabase,
    };
  }

  return {
    status: "authorized",
    user,
    profile: access.profile,
    supabase,
  };
}

export async function requireSystemOwner() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      authorized: false as const,
      supabase,
    };
  }

  const profile = await getProfileForUser(supabase, user.id);

  if (
    !profile ||
    profile.status !== "active" ||
    profile.deleted_at ||
    profile.role !== "system_owner"
  ) {
    return {
      authorized: false as const,
      supabase,
    };
  }

  return {
    authorized: true as const,
    user,
    profile,
    supabase,
  };
}
