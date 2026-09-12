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
    .eq("recipient_user_id", admin.profile.id)
    .is("read_at", null);

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
  await markDriverAppRequestSubmittedNotificationsRead({
    requestId,
    organizationId,
  });
}

export async function markDriverAppRequestSubmittedNotificationsRead({
  requestId,
  organizationId,
}: {
  requestId: string | null | undefined;
  organizationId: string;
}) {
  if (!requestId || !isUuid(requestId)) return;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return;

  const { error } = await admin.supabase.rpc(
    "mark_driver_app_request_submitted_notifications_read",
    {
      p_organization_id: organizationId,
      p_request_id: requestId,
    },
  );

  if (error) {
    console.error("[notifications:shared-request-read] Failed to mark request notifications read", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      organizationId,
      requestId,
    });
  }
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const pathname = formData.get("pathname")?.toString() ?? "/dashboard";
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return;

  const { error } = await admin.supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", admin.profile.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications:mark-all-read] Failed to mark notifications read", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return;
  }

  revalidatePath(pathname);
}

async function markNotificationRead(
  supabase: SupabaseClient<Database>,
  notificationId: string,
  recipientUserId: string,
) {
  const { data: notification, error: notificationError } = await supabase
    .from("app_notifications")
    .select("id, type, entity_type, entity_id, organization_id")
    .eq("id", notificationId)
    .eq("recipient_user_id", recipientUserId)
    .maybeSingle();

  if (notificationError) {
    console.error("[notifications:mark-read] Failed to load notification", {
      code: notificationError.code,
      message: notificationError.message,
      details: notificationError.details,
      hint: notificationError.hint,
      notificationId,
    });
  }

  if (
    notification?.type === "driver_app_request_submitted" &&
    notification.entity_type === "driver_app_request" &&
    notification.entity_id &&
    notification.organization_id
  ) {
    const { error } = await supabase.rpc(
      "mark_driver_app_request_submitted_notifications_read",
      {
        p_organization_id: notification.organization_id,
        p_request_id: notification.entity_id,
      },
    );

    if (error) {
      console.error("[notifications:shared-request-read] Failed to mark request notifications read", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        notificationId,
        requestId: notification.entity_id,
      });
    }

    return;
  }

  await supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", recipientUserId)
    .is("read_at", null);
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
