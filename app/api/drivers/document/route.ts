import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";
import {
  createDriverDocumentSignedUrl,
  createDriverDocumentDownloadSignedUrl,
} from "@/features/drivers/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DriverDocumentType } from "@/features/drivers/types";

const VALID_DOCUMENT_TYPES = new Set<string>(["iqama", "driver_card", "driving_license"]);

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const driverId = searchParams.get("driverId");
  const type = searchParams.get("type");
  const download = searchParams.get("download") === "true";

  if (!driverId || !type) {
    return new NextResponse("Missing parameters", { status: 400 });
  }

  const isDocumentType = VALID_DOCUMENT_TYPES.has(type);
  if (!isDocumentType && type !== "profile-photo" && type !== "operating-card") {
    return new NextResponse("Invalid document type", { status: 400 });
  }

  // 1. Fetch driver via user client to enforce RLS and check driver existence
  const { data: driver, error: driverError } = await admin.supabase
    .from("drivers")
    .select("id, organization_id, vehicle_id, profile_photo_path")
    .eq("id", driverId)
    .is("deleted_at", null)
    .maybeSingle();

  if (driverError || !driver) {
    return new NextResponse("Driver not found or access denied", { status: 404 });
  }

  // 2. Fetch user permissions for the driver's organization
  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    driver.organization_id,
  );

  // Check view permissions
  if (isDocumentType) {
    if (!permissions.has("drivers.documents.view")) {
      return new NextResponse("Forbidden: Cannot view documents", { status: 403 });
    }
  } else {
    // profile-photo or operating-card requires at least drivers.view or drivers.update permission
    if (!permissions.has("drivers.view") && !permissions.has("drivers.update")) {
      return new NextResponse("Forbidden: Access denied", { status: 403 });
    }
  }

  // Check download permissions if download is requested
  if (download && !permissions.has("drivers.documents.download")) {
    return new NextResponse("Forbidden: Cannot download documents", { status: 403 });
  }

  // 3. Resolve path and filename from database
  let storagePath: string | null = null;
  let originalFilename = "driver-file";

  if (type === "profile-photo") {
    storagePath = driver.profile_photo_path;
    originalFilename = storagePath ? storagePath.split("/").pop() ?? "profile-photo" : "profile-photo";
  } else if (type === "operating-card") {
    const { data: vehicle } = driver.vehicle_id
      ? await createAdminClient()
          .from("fleet_vehicles")
          .select("operating_card_file_path")
          .eq("id", driver.vehicle_id)
          .maybeSingle()
      : { data: null };
    storagePath = vehicle?.operating_card_file_path ?? null;
    originalFilename = storagePath ? storagePath.split("/").pop() ?? "operating-card" : "operating-card";
  } else {
    // Retrieve document path from driver_documents table
    const { data: doc, error: docError } = await admin.supabase
      .from("driver_documents")
      .select("storage_path, original_filename")
      .eq("driver_id", driverId)
      .eq("document_type", type as DriverDocumentType)
      .maybeSingle();

    if (docError || !doc) {
      return new NextResponse("Document not found", { status: 404 });
    }

    storagePath = doc.storage_path;
    originalFilename = doc.original_filename;
  }

  if (!storagePath) {
    return new NextResponse("File path not found", { status: 404 });
  }

  // 4. Generate signed URL
  let signedUrl: string | null = null;

  if (download) {
    signedUrl = await createDriverDocumentDownloadSignedUrl(
      storagePath,
      originalFilename,
    );
  } else {
    signedUrl = await createDriverDocumentSignedUrl(storagePath);
  }

  if (!signedUrl) {
    return new NextResponse("Failed to generate access URL", { status: 500 });
  }

  // 5. Redirect browser to private signed storage url
  return NextResponse.redirect(signedUrl, 307);
}
