import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getAccessibleOrganizationsForProfile } from "@/features/organizations/queries";
import { getAppNotificationsForCurrentUser } from "@/features/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAuthenticatedAdmin();

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
  const admin = await getAuthenticatedAdmin();

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

  const { error } = await admin.supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", admin.profile.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications:mark-read] Failed to mark notification read", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  return NextResponse.json({ status: "success" });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}
