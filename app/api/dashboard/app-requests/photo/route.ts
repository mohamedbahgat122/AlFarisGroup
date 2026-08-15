import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";

type PhotoType =
  | "request-driver"
  | "odometer-driver"
  | "odometer-start"
  | "odometer-end";

const validPhotoTypes = new Set<string>([
  "request-driver",
  "odometer-driver",
  "odometer-start",
  "odometer-end",
]);
const signedUrlExpiresInSeconds = 300;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!type || !validPhotoTypes.has(type)) {
    return new NextResponse("Invalid photo type", { status: 400 });
  }

  const resolved =
    type === "request-driver"
      ? await resolveRequestDriverPhotoPath(request, admin)
      : await resolveOdometerPhotoPath(request, type as PhotoType, admin);

  if (!resolved.success) {
    return new NextResponse(resolved.message, { status: resolved.status });
  }

  const { data, error } = await admin.supabase.storage
    .from(resolved.bucket)
    .createSignedUrl(resolved.path, signedUrlExpiresInSeconds);

  if (error || !data?.signedUrl) {
    return new NextResponse("Photo unavailable", { status: 500 });
  }

  const response = NextResponse.redirect(data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function resolveRequestDriverPhotoPath(
  request: NextRequest,
  admin: Extract<Awaited<ReturnType<typeof getAuthenticatedAdmin>>, { status: "authorized" }>,
) {
  const requestId = request.nextUrl.searchParams.get("requestId");
  if (!requestId) return failure(400, "Missing request id");

  const { data: appRequest, error: requestError } = await admin.supabase
    .from("driver_app_requests")
    .select("id, organization_id, driver_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !appRequest) return failure(404, "Photo not found");

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    appRequest.organization_id,
  );
  if (!permissions.has("app_requests.view")) {
    return failure(403, "Forbidden");
  }

  const { data: driver, error: driverError } = await admin.supabase
    .from("drivers")
    .select("id, organization_id, profile_photo_path")
    .eq("id", appRequest.driver_id)
    .eq("organization_id", appRequest.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (driverError || !driver?.profile_photo_path) {
    return failure(404, "Photo not found");
  }

  return success("driver-documents", driver.profile_photo_path);
}

async function resolveOdometerPhotoPath(
  request: NextRequest,
  type: PhotoType,
  admin: Extract<Awaited<ReturnType<typeof getAuthenticatedAdmin>>, { status: "authorized" }>,
) {
  const shiftId = request.nextUrl.searchParams.get("shiftId");
  if (!shiftId) return failure(400, "Missing shift id");

  const { data: shift, error: shiftError } = await admin.supabase
    .from("driver_shifts")
    .select("id, organization_id, driver_id, start_photo_path, end_photo_path")
    .eq("id", shiftId)
    .maybeSingle();

  if (shiftError || !shift) return failure(404, "Photo not found");

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    shift.organization_id,
  );
  if (!permissions.has("odometer.manage")) {
    return failure(403, "Forbidden");
  }

  if (type === "odometer-start") {
    return shift.start_photo_path
      ? success("driver-odometer", shift.start_photo_path)
      : failure(404, "Photo not found");
  }

  if (type === "odometer-end") {
    return shift.end_photo_path
      ? success("driver-odometer", shift.end_photo_path)
      : failure(404, "Photo not found");
  }

  const { data: driver, error: driverError } = await admin.supabase
    .from("drivers")
    .select("id, organization_id, profile_photo_path")
    .eq("id", shift.driver_id)
    .eq("organization_id", shift.organization_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (driverError || !driver?.profile_photo_path) {
    return failure(404, "Photo not found");
  }

  return success("driver-documents", driver.profile_photo_path);
}

function success(bucket: "driver-documents" | "driver-odometer", path: string) {
  return { success: true as const, bucket, path };
}

function failure(status: 400 | 401 | 403 | 404 | 500, message: string) {
  return { success: false as const, status, message };
}
