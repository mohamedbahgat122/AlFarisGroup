"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type UpdateAvatarResponse =
  | { success: true }
  | { success: false; error: "unauthenticated" | "unexpected" };

export async function updateAvatarPathAction(): Promise<UpdateAvatarResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "unauthenticated" };
  }

  const avatarPath = `${user.id}/avatar`;

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({ avatar_path: avatarPath })
    .eq("id", user.id);

  if (updateError) {
    console.error("Failed to update avatar path:", updateError);
    return { success: false, error: "unexpected" };
  }

  // Force Next.js to clear the router cache so the layout is re-rendered
  // with the new signed URL.
  revalidatePath("/", "layout");

  return { success: true };
}

export async function updateProfileNameAction(newName: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "unauthenticated" };
  }

  // Double check that the user is actually a system_owner
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "system_owner") {
    return { success: false, error: "unauthorized" };
  }
  
  if (!newName || newName.trim().length < 2) {
    return { success: false, error: "invalid_name" };
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("profiles")
    .update({ 
      full_name: newName.trim(), 
      updated_at: new Date().toISOString() 
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Failed to update profile name:", updateError);
    return { success: false, error: "update_failed" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
