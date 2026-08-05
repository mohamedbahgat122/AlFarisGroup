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
