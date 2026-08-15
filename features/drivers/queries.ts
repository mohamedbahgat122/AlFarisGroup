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
import type { DriverSummary, DriverStatus } from "@/features/drivers/types";
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
type DriverQueryColumnMode = "withVehicleIdAndNfc" | "withVehicleId" | "legacy";

export async function getDriversSummaryForOrganization(
  organizationId: string
): Promise<DriverSummary> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { total: 0, active: 0, inactive: 0, archived: 0 };
  }

  const base = () =>
    admin.supabase
      .from("drivers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);

  const [total, active, inactive, archived] = await Promise.all([
    base(),
    base().is("deleted_at", null).eq("status", "active"),
    base().is("deleted_at", null).neq("status", "active"),
    base().not("deleted_at", "is", null),
  ]);

  return {
    total: total.error ? 0 : total.count ?? 0,
    active: active.error ? 0 : active.count ?? 0,
    inactive: inactive.error ? 0 : inactive.count ?? 0,
    archived: archived.error ? 0 : archived.count ?? 0,
  };
}

export async function getDriversForOrganization(
  organizationId: string,
  organizationName: string,
  options?: {
    search?: string;
    status?: DriverStatus;
    nationality?: string;
    sponsorship?: string;
    archived?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<DriversQueryResult> {
  const admin = await getAuthenticatedAdmin();

  const emptyResult: DriversQueryResult = {
    status: "unauthorized",
    drivers: [],
  };

  if (admin.status !== "authorized") {
    return emptyResult;
  }

  const requestedPage = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  let queryColumnMode: DriverQueryColumnMode = "withVehicleIdAndNfc";
  const fetchPage = (page: number, columnMode: DriverQueryColumnMode) =>
    buildDriversPageQuery(admin.supabase, organizationId, options, columnMode)
      .order("full_name", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

  let page = requestedPage;
  let { data, error, count } = await fetchPage(page, queryColumnMode);

  if (isMissingNfcNumberColumnError(error)) {
    queryColumnMode = "withVehicleId";
    const retry = await fetchPage(page, queryColumnMode);
    data = retry.data;
    error = retry.error;
    count = retry.count;
  }

  if (isMissingVehicleIdColumnError(error)) {
    queryColumnMode = "legacy";
    const retry = await fetchPage(page, queryColumnMode);
    data = retry.data;
    error = retry.error;
    count = retry.count;
  }

  if (error) {
    return {
      status: "load_error",
      drivers: [],
    };
  }

  const summary = await getDriversSummaryForOrganization(organizationId);
  const totalRows = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  if (page > totalPages) {
    page = totalPages;
    const retry = await fetchPage(page, queryColumnMode);
    data = retry.data;
    error = retry.error;
    count = retry.count;

    if (error) {
      return {
        status: "load_error",
        drivers: [],
      };
    }
  }

  const rows = (data ?? []) as unknown as DriverQueryRow[];
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
    pagination: {
      page,
      pageSize,
      totalRows,
      totalPages,
    },
    summary,
  };
}

function buildDriversPageQuery(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  options: Parameters<typeof getDriversForOrganization>[2],
  columnMode: DriverQueryColumnMode,
) {
  let query = supabase
    .from("drivers")
    .select(
      getDriversSelectColumns(columnMode),
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  if (options?.archived === "true") {
    query = query.not("deleted_at", "is", null);
  } else if (options?.archived === "false") {
    query = query.is("deleted_at", null);
  } else {
    query = query.is("deleted_at", null);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.nationality) {
    query = query.eq("nationality", options.nationality);
  }

  if (options?.sponsorship) {
    query = query.eq("is_company_sponsored", options.sponsorship === "company");
  }

  const search = options?.search?.trim();
  if (search) {
    const searchTerm = `%${sanitizeDriverSearch(search)}%`;
    query = query.or(
      `full_name.ilike.${searchTerm},iqama_number.ilike.${searchTerm},mobile_number.ilike.${searchTerm},vehicle_number.ilike.${searchTerm},keeta_vehicle_plate_number.ilike.${searchTerm}`,
    );
  }

  return query;
}

function getDriversSelectColumns(columnMode: DriverQueryColumnMode) {
  return `
      id,
      auth_user_id,
      organization_id,
      full_name,
      nationality,
      mobile_number,
      ${columnMode === "withVehicleIdAndNfc" ? "nfc_number," : ""}
      vehicle_type,
      ${columnMode !== "legacy" ? "vehicle_id," : ""}
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
    )`;
}

function normalizePage(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function normalizePageSize(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? Math.min(value, 50) : 20;
}

function sanitizeDriverSearch(value: string) {
  return value.normalize("NFKC").trim().replace(/[%,*()"]/g, " ").replace(/\s+/g, "%");
}

function isMissingVehicleIdColumnError(
  error: { code?: string; message?: string } | null,
) {
  return (
    error?.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("vehicle_id")
  );
}

function isMissingNfcNumberColumnError(
  error: { code?: string; message?: string } | null,
) {
  return (
    error?.code === "42703" &&
    typeof error.message === "string" &&
    error.message.includes("nfc_number")
  );
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
    nfcNumber: "nfc_number" in driver ? driver.nfc_number ?? null : null,
    vehicleType: driver.vehicle_type,
    vehicleId: driver.vehicle_id || null,
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
