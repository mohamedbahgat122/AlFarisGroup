import { NextResponse } from "next/server";
import { getAuthorizationRevision } from "@/features/permissions/revision";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAuthenticatedAdmin({ resolveAvatar: false });

  if (admin.status !== "authorized") {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const revision = await getAuthorizationRevision(
    admin.supabase,
    admin.profile.id,
  );

  if (!revision) {
    return NextResponse.json({ status: "load_error" }, { status: 500 });
  }

  return NextResponse.json(
    { revision },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
