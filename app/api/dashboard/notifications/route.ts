import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import { getAppNotificationsForCurrentUser } from "@/features/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAuthenticatedAdmin({ resolveAvatar: false });

  if (admin.status !== "authorized") {
    return NextResponse.json(
      {
        status: "unauthorized",
        notifications: [],
        unreadCount: 0,
        canViewNotifications: false,
      },
      { status: 401 },
    );
  }

  const organizationsResult = await getAccessibleOrganizationsForProfile(
    admin.supabase,
    admin.profile,
  );
  const organizations =
    organizationsResult.status === "success"
      ? organizationsResult.organizations
      : [];

  const appNotifications = await getAppNotificationsForCurrentUser({
    supabase: admin.supabase,
    organizations,
    recipientUserId: admin.profile.id,
  });

  return NextResponse.json(appNotifications);
}

export async function POST(request: Request) {
  const admin = await getAuthenticatedAdmin({ resolveAvatar: false });

  if (admin.status !== "authorized") {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  let notificationId = "";

  try {
    const body = (await request.json()) as { notificationId?: unknown };
    notificationId =
      typeof body.notificationId === "string" ? body.notificationId.trim() : "";
  } catch {
    return NextResponse.json({ status: "validation_error" }, { status: 400 });
  }

  if (!isUuid(notificationId)) {
    return NextResponse.json({ status: "validation_error" }, { status: 400 });
  }

  const { data: notification, error: notificationError } = await admin.supabase
    .from("app_notifications")
    .select("id, type, entity_type, entity_id, organization_id, read_at")
    .eq("id", notificationId)
    .eq("recipient_user_id", admin.profile.id)
    .maybeSingle();

  if (notificationError) {
    console.error("[notifications:mark-read] Failed to load notification", {
      code: notificationError.code,
      message: notificationError.message,
      details: notificationError.details,
      hint: notificationError.hint,
      notificationId,
    });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  if (!notification) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (notification.read_at) {
    return NextResponse.json({ status: "already_read" });
  }

  if (
    notification.type === "driver_app_request_submitted" &&
    notification.entity_type === "driver_app_request" &&
    notification.entity_id &&
    notification.organization_id
  ) {
    const { error } = await admin.supabase.rpc(
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
      return NextResponse.json({ status: "error" }, { status: 500 });
    }

    return NextResponse.json({ status: "success" });
  }

  const { data: updatedNotification, error } = await admin.supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .select("id, read_at")
    .eq("id", notificationId)
    .eq("recipient_user_id", admin.profile.id)
    .is("read_at", null)
    .maybeSingle();

  if (error) {
    console.error("[notifications:mark-read] Failed to mark notification read", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  if (!updatedNotification?.read_at) {
    return NextResponse.json({ status: "already_read" });
  }

  return NextResponse.json({ status: "success" });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
