import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { getOrganizationPermissions } from "@/features/permissions/server";
import type {
  DriverActor,
  DriverFilePreview,
  DriverListItem,
  DriversQueryResult,
} from "@/features/drivers/types";
import type { Database } from "@/types/database";

type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];
type BankRow = Database["public"]["Tables"]["driver_bank_details"]["Row"];
type DocumentRow = Database["public"]["Tables"]["driver_documents"]["Row"];
type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "status" | "must_change_password"
>;

type DriverQueryRow = DriverRow & {
  driver_bank_details: BankRow | null;
  driver_documents: DocumentRow[];
};

export async function getDriversForOrganization(
  organizationId: string,
  organizationName: string,
): Promise<DriversQueryResult> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return {
      status: "unauthorized",
      drivers: [],
    };
  }

  const { data, error } = await admin.supabase
    .from("drivers")
    .select(
      `
      id,
      auth_user_id,
      organization_id,
      full_name,
      nationality,
      mobile_number,
      vehicle_type,
      vehicle_number,
      keeta_vehicle_plate_number,
      vehicle_serial_number,
      vehicle_owner_identifier,
      vehicle_brand,
      keeta_username,
      keeta_driver_id,
      is_company_sponsored,
      is_vehicle_owner,
      settlement_type,
      iqama_number,
      iqama_expiry_date,
      driving_license_number,
      driving_license_expiry_date,
      driver_card_number,
      driver_card_expiry_date,
      vehicle_authorization_number,
      vehicle_authorization_expiry_date,
      profile_photo_path,
      operating_card_number,
      operating_card_expiry_date,
      operating_card_file_path,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at,
      driver_bank_details (
        driver_id,
        iban,
        bank_name,
        account_number,
        created_at,
        updated_at
      ),
      driver_documents (
        id,
        driver_id,
        document_type,
        storage_path,
        original_filename,
        mime_type,
        size_bytes,
        created_at,
        updated_at
      )
    `,
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return {
      status: "load_error",
      drivers: [],
    };
  }

  const rows = (data ?? []) as DriverQueryRow[];
  const permissions = await getOrganizationPermissions(
    admin.supabase,
    admin.profile,
    organizationId,
  );
  const canViewDocuments = permissions.has("drivers.documents.view");
  const canDownloadDocuments = permissions.has("drivers.documents.download");
  const actors = await getDriverActors(
    admin.supabase,
    rows.flatMap((driver) => [
      driver.created_by_user_id,
      driver.updated_by_user_id,
    ]),
  );
  const appAccounts = await getDriverAppAccounts(
    admin.supabase,
    rows.map((driver) => driver.auth_user_id),
  );

  const drivers = rows.map((driver) =>
    mapDriver(driver, organizationName, actors, appAccounts, {
      canViewDocuments,
      canDownloadDocuments,
    }),
  );

  return {
    status: "success",
    drivers,
  };
}

function mapDriver(
  driver: DriverQueryRow,
  organizationName: string,
  actors: Map<string, DriverActor>,
  appAccounts: Map<string, ProfileRow>,
  documentPermissions: {
    canViewDocuments: boolean;
    canDownloadDocuments: boolean;
  },
): DriverListItem {
  const documents = documentPermissions.canViewDocuments
    ? driver.driver_documents.map((document) => {
        const preview = createDriverFilePreview({
          driverId: driver.id,
          type: document.document_type,
          fileName: document.original_filename,
          mimeType: document.mime_type,
          canDownload: documentPermissions.canDownloadDocuments,
        });

        return {
          documentType: document.document_type,
          originalFilename: document.original_filename,
          mimeType: document.mime_type,
          sizeBytes: document.size_bytes,
          signedUrl: preview?.previewUrl ?? null,
          preview,
        };
      })
    : [];

  const profilePhotoPreview = driver.profile_photo_path
    ? createDriverFilePreview({
        driverId: driver.id,
        type: "profile-photo",
        fileName: getFileNameFromStoragePath(driver.profile_photo_path),
        mimeType: getMimeTypeFromStoragePath(driver.profile_photo_path),
        canDownload: documentPermissions.canDownloadDocuments,
      })
    : null;

  const operatingCardFilePreview = driver.operating_card_file_path
    ? createDriverFilePreview({
        driverId: driver.id,
        type: "operating-card",
        fileName: getFileNameFromStoragePath(driver.operating_card_file_path),
        mimeType: getMimeTypeFromStoragePath(driver.operating_card_file_path),
        canDownload: documentPermissions.canDownloadDocuments,
      })
    : null;

  return {
    id: driver.id,
    fullName: driver.full_name,
    nationality: driver.nationality,
    mobileNumber: driver.mobile_number,
    vehicleType: driver.vehicle_type,
    vehicleNumber: driver.vehicle_number,
    keetaVehiclePlateNumber: driver.keeta_vehicle_plate_number ?? null,
    vehicleSerialNumber: driver.vehicle_serial_number,
    vehicleOwnerIdentifier: driver.vehicle_owner_identifier,
    vehicleBrand: driver.vehicle_brand,
    organizationName,
    status: driver.status,
    keetaUsername: driver.keeta_username,
    keetaDriverId: driver.keeta_driver_id,
    appAccount: getDriverAppAccount(driver.auth_user_id, appAccounts),
    isCompanySponsored: driver.is_company_sponsored,
    isVehicleOwner: driver.is_vehicle_owner,
    settlementType: driver.settlement_type,
    iqamaNumber: driver.iqama_number,
    iqamaExpiryDate: driver.iqama_expiry_date,
    drivingLicenseNumber: driver.driving_license_number,
    drivingLicenseExpiryDate: driver.driving_license_expiry_date,
    driverCardNumber: driver.driver_card_number,
    driverCardExpiryDate: driver.driver_card_expiry_date,
    vehicleAuthorizationNumber: driver.vehicle_authorization_number,
    vehicleAuthorizationExpiryDate: driver.vehicle_authorization_expiry_date,
    iban: driver.driver_bank_details?.iban ?? null,
    bankName: driver.driver_bank_details?.bank_name ?? null,
    accountNumber: driver.driver_bank_details?.account_number ?? null,
    profilePhotoUrl: profilePhotoPreview?.previewUrl ?? null,
    profilePhotoPreview,
    operatingCardNumber: driver.operating_card_number ?? null,
    operatingCardExpiryDate: driver.operating_card_expiry_date ?? null,
    operatingCardFileUrl: operatingCardFilePreview?.previewUrl ?? null,
    operatingCardFilePreview,
    documents,
    createdBy: getActor(actors, driver.created_by_user_id),
    updatedBy: getActor(actors, driver.updated_by_user_id),
    createdAt: driver.created_at,
    updatedAt: driver.updated_at,
  };
}

async function getDriverAppAccounts(
  supabase: SupabaseClient<Database>,
  authUserIds: Array<string | null>,
) {
  const uniqueIds = Array.from(
    new Set(authUserIds.filter((id): id is string => Boolean(id))),
  );

  if (uniqueIds.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, status, must_change_password")
    .in("id", uniqueIds);

  if (error) {
    return new Map<string, ProfileRow>();
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile]));
}

function getDriverAppAccount(
  authUserId: string | null,
  appAccounts: Map<string, ProfileRow>,
) {
  if (!authUserId) {
    return {
      authUserId: null,
      status: "not_linked" as const,
    };
  }

  const profile = appAccounts.get(authUserId);

  if (!profile || profile.status !== "active") {
    return {
      authUserId,
      status: "suspended" as const,
    };
  }

  if (profile.must_change_password) {
    return {
      authUserId,
      status: "password_change_required" as const,
    };
  }

  return {
    authUserId,
    status: "active" as const,
  };
}

async function getDriverActors(
  supabase: SupabaseClient<Database>,
  actorIds: Array<string | null>,
) {
  const uniqueIds = Array.from(
    new Set(actorIds.filter((id): id is string => Boolean(id))),
  );

  if (uniqueIds.length === 0) {
    return new Map<string, DriverActor>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", uniqueIds);

  if (error) {
    return new Map<string, DriverActor>();
  }

  return new Map(
    (data ?? []).map((profile) => [
      profile.id,
      { id: profile.id, fullName: profile.full_name },
    ]),
  );
}

function getActor(actors: Map<string, DriverActor>, id: string | null) {
  return id ? actors.get(id) ?? null : null;
}

function createDriverFilePreview({
  driverId,
  type,
  fileName,
  mimeType,
  canDownload,
}: {
  driverId: string;
  type: string;
  fileName: string;
  mimeType: string | null;
  canDownload: boolean;
}): DriverFilePreview | null {
  if (!driverId || !type) {
    return null;
  }

  const previewUrl = `/api/drivers/document?driverId=${encodeURIComponent(driverId)}&type=${encodeURIComponent(type)}`;
  const downloadUrl = canDownload
    ? `/api/drivers/document?driverId=${encodeURIComponent(driverId)}&type=${encodeURIComponent(type)}&download=true`
    : "";

  return {
    fileName,
    mimeType,
    previewUrl,
    downloadUrl,
    isImage: isImageMimeType(mimeType),
    isPdf: mimeType === "application/pdf" || /\.pdf$/i.test(fileName),
  };
}

function isImageMimeType(mimeType: string | null) {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}

function getFileNameFromStoragePath(path: string) {
  return path.split("/").pop() ?? "driver-file";
}

function getMimeTypeFromStoragePath(path: string) {
  if (/\.(?:jpe?g)$/i.test(path)) {
    return "image/jpeg";
  }

  if (/\.png$/i.test(path)) {
    return "image/png";
  }

  if (/\.webp$/i.test(path)) {
    return "image/webp";
  }

  if (/\.pdf$/i.test(path)) {
    return "application/pdf";
  }

  return null;
}
