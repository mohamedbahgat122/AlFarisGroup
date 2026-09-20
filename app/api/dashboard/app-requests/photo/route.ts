import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";
import { canViewRequestType } from "@/features/app-requests/authorization";
import type { DriverAppRequestType } from "@/features/app-requests/types";
import type { Database } from "@/types/database";

type PhotoType =
  | "request-driver"
  | "odometer-driver"
  | "odometer-start"
  | "odometer-end"
  | "maintenance-invoice";

const validPhotoTypes = new Set<string>([
  "request-driver",
  "odometer-driver",
  "odometer-start",
  "odometer-end",
  "maintenance-invoice",
]);
const signedUrlExpiresInSeconds = 300;

type PhotoRouteDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      maintenance_jobs: {
        Row: {
          id: string;
          organization_id: string;
          invoice_file_path: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
};

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
      : type === "maintenance-invoice"
        ? await resolveMaintenanceInvoicePath(request, admin)
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

async function resolveMaintenanceInvoicePath(
  request: NextRequest,
  admin: Extract<Awaited<ReturnType<typeof getAuthenticatedAdmin>>, { status: "authorized" }>,
) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return failure(400, "Missing job id");

  const supabase = admin.supabase as SupabaseClient<PhotoRouteDatabase>;
  const { data: job, error: jobError } = await supabase
    .from("maintenance_jobs")
    .select("id, organization_id, invoice_file_path")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job?.invoice_file_path) {
    return failure(404, "Photo not found");
  }

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    job.organization_id,
  );
  if (
    !permissions.has("app_requests.view") &&
    !permissions.has("maintenance_jobs.view") &&
    !permissions.has("maintenance_jobs.assign")
  ) {
    return failure(403, "Forbidden");
  }

  return success("maintenance-invoices", job.invoice_file_path);
}

async function resolveRequestDriverPhotoPath(
  request: NextRequest,
  admin: Extract<Awaited<ReturnType<typeof getAuthenticatedAdmin>>, { status: "authorized" }>,
) {
  const requestId = request.nextUrl.searchParams.get("requestId");
  if (!requestId) return failure(400, "Missing request id");

  const { data: appRequest, error: requestError } = await admin.supabase
    .from("driver_app_requests")
    .select("id, organization_id, driver_id, request_type")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !appRequest) return failure(404, "Photo not found");

  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    appRequest.organization_id,
  );
  if (!canViewRequestType(permissions, appRequest.request_type as DriverAppRequestType)) {
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
  if (!permissions.has("odometer.manage") && !permissions.has("odometer.view")) {
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

function success(bucket: "driver-documents" | "driver-odometer" | "maintenance-invoices", path: string) {
  return { success: true as const, bucket, path };
}

function failure(status: 400 | 401 | 403 | 404 | 500, message: string) {
  return { success: false as const, status, message };
}
