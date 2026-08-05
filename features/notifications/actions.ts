"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { Database } from "@/types/database";

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = formData.get("notificationId")?.toString();
  const pathname = formData.get("pathname")?.toString() ?? "/dashboard";

  if (!notificationId) return;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return;

  await admin.supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", admin.profile.id);

  revalidatePath(pathname);
}

export async function openNotificationAction(formData: FormData) {
  const notificationId = formData.get("notificationId")?.toString();
  const href = getSafeDashboardHref(formData.get("href")?.toString());

  if (!notificationId) {
    redirect(href);
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status === "authorized") {
    await markNotificationRead(admin.supabase, notificationId, admin.profile.id);
    revalidatePath(getPathWithoutSearch(href));
  }

  redirect(href);
}

export async function markRequestNotificationsReadForCurrentUser({
  requestId,
  organizationId,
}: {
  requestId: string | null | undefined;
  organizationId: string;
}) {
  if (!requestId || !isUuid(requestId)) return;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return;

  await admin.supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", admin.profile.id)
    .eq("organization_id", organizationId)
    .eq("entity_type", "driver_app_request")
    .eq("entity_id", requestId)
    .eq("is_read", false);
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const pathname = formData.get("pathname")?.toString() ?? "/dashboard";
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return;

  await admin.supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", admin.profile.id)
    .eq("is_read", false);

  revalidatePath(pathname);
}

async function markNotificationRead(
  supabase: SupabaseClient<Database>,
  notificationId: string,
  recipientUserId: string,
) {
  await supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", recipientUserId)
    .eq("is_read", false);
}

function getSafeDashboardHref(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function getPathWithoutSearch(value: string) {
  return value.split("?")[0] || value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
