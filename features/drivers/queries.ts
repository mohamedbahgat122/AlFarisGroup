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
import { getBusinessDateString } from "@/features/drivers/expiry";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDriverDocumentSignedUrls } from "@/features/drivers/storage";
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
    return { total: 0, active: 0, inactive: 0, archived: 0, expiringSoon: 0, expired: 0 };
  }

  const { data, error } = await admin.supabase.rpc('get_drivers_summary' as any, {
    p_organization_id: organizationId
  });

  if (error || !data) {
    return { total: 0, active: 0, inactive: 0, archived: 0, expiringSoon: 0, expired: 0 };
  }

  // The RPC returns a JSONB object with the counts
  return data as unknown as DriverSummary;
}

export async function getDriversForOrganization(
  organizationId: string,
  organizationName: string,
  options?: {
    search?: string;
    status?: DriverStatus;
    nationality?: string;
    sponsorship?: string;
    documentStatus?: "valid" | "expiring" | "expired";
    vehicleType?: string;
    appAccountStatus?: string;
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
  const vehicleDocumentDriverIds = options?.documentStatus
    ? await getVehicleDocumentDriverIds(admin.supabase, organizationId)
    : null;
  let queryColumnMode: DriverQueryColumnMode = "withVehicleIdAndNfc";
  let matchingAppAccountIds: string[] | null | "not_linked" | "empty" = null;
  if (options?.appAccountStatus) {
    if (options.appAccountStatus === "not_linked") {
      matchingAppAccountIds = "not_linked";
    } else {
      const { data: driversData } = await admin.supabase
        .from("drivers")
        .select("auth_user_id")
        .eq("organization_id", organizationId)
        .not("auth_user_id", "is", null);
        
      if (driversData && driversData.length > 0) {
        const authUserIds = driversData.map(d => d.auth_user_id);
        const appAccounts = await getDriverAppAccounts(admin.supabase, authUserIds);
        
        const matchingIds = authUserIds.filter(id => {
          const account = getDriverAppAccount(id, appAccounts);
          return account.status === options.appAccountStatus;
        }).filter(Boolean) as string[];

        matchingAppAccountIds = matchingIds.length > 0 ? matchingIds : "empty";
      } else {
        matchingAppAccountIds = "empty";
      }
    }
  }

  const fetchPage = (page: number, columnMode: DriverQueryColumnMode) =>
    buildDriversPageQuery(
      admin.supabase,
      organizationId,
      options,
      columnMode,
      matchingAppAccountIds,
      vehicleDocumentDriverIds,
    )
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

  const avatarPaths = Array.from(
    new Set(
      rows
        .map((row) => row.profile_photo_path)
        .filter((path): path is string => Boolean(path)),
    ),
  );
  const avatarUrls = await createDriverDocumentSignedUrls(avatarPaths);
  const vehiclePlateNumbers = await getVehicleDetails(
    rows.map((driver) => driver.vehicle_id),
  );

  const drivers = rows.map((driver) =>
    mapDriver(driver, organizationName, actors, appAccounts, avatarUrls, vehiclePlateNumbers, {
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

async function getVehicleDetails(
  vehicleIds: Array<string | null>,
) {
  const ids = Array.from(new Set(vehicleIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map<string, { plateNumber: string; authorizationExpiryDate: string | null; operatingCardExpiryDate: string | null }>();

  let serviceClient;
  try {
    serviceClient = createAdminClient();
  } catch {
    return new Map<string, { plateNumber: string; authorizationExpiryDate: string | null; operatingCardExpiryDate: string | null }>();
  }

  const { data, error } = await serviceClient
    .from("fleet_vehicles")
    .select("id, plate_number, authorization_expiry_date, operating_card_expiry_date")
    .in("id", ids);

  if (error) return new Map<string, { plateNumber: string; authorizationExpiryDate: string | null; operatingCardExpiryDate: string | null }>();
  return new Map((data ?? []).map((vehicle) => [vehicle.id, {
    plateNumber: vehicle.plate_number,
    authorizationExpiryDate: vehicle.authorization_expiry_date,
    operatingCardExpiryDate: vehicle.operating_card_expiry_date,
  }]));
}

function buildDriversPageQuery(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  options: Parameters<typeof getDriversForOrganization>[2],
  columnMode: DriverQueryColumnMode,
  matchingAppAccountIds?: string[] | null | "not_linked" | "empty",
  vehicleDocumentDriverIds?: {
    expired: string[];
    threshold: string[];
  } | null,
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

  if (options?.documentStatus) {
    const today = getBusinessDateString();
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const thresholdDate = getBusinessDateString(new Date(Date.now() + tenDaysMs));

    const personalExpiredCondition = `iqama_expiry_date.lte.${today},driving_license_expiry_date.lte.${today},driver_card_expiry_date.lte.${today}`;
    const personalThresholdCondition = `iqama_expiry_date.lte.${thresholdDate},driving_license_expiry_date.lte.${thresholdDate},driver_card_expiry_date.lte.${thresholdDate}`;
    const vehicleExpiredIds = vehicleDocumentDriverIds?.expired ?? [];
    const vehicleThresholdIds = vehicleDocumentDriverIds?.threshold ?? [];
    const vehicleExpiredCondition = vehicleExpiredIds.length > 0
      ? `id.in.(${vehicleExpiredIds.join(",")})`
      : null;
    const vehicleThresholdCondition = vehicleThresholdIds.length > 0
      ? `id.in.(${vehicleThresholdIds.join(",")})`
      : null;

    if (options.documentStatus === "expired") {
      query = query.or([personalExpiredCondition, vehicleExpiredCondition].filter(Boolean).join(","));
    } else if (options.documentStatus === "expiring") {
      query = query
        .or([personalThresholdCondition, vehicleThresholdCondition].filter(Boolean).join(","))
        .not("iqama_expiry_date", "lte", today)
        .not("driving_license_expiry_date", "lte", today)
        .not("driver_card_expiry_date", "lte", today);
      if (vehicleExpiredIds.length > 0) {
        query = query.not("id", "in", `(${vehicleExpiredIds.join(",")})`);
      }
    } else if (options.documentStatus === "valid") {
      query = query
        .not("iqama_expiry_date", "lte", thresholdDate)
        .not("driving_license_expiry_date", "lte", thresholdDate)
        .not("driver_card_expiry_date", "lte", thresholdDate);
      if (vehicleThresholdIds.length > 0) {
        query = query.not("id", "in", `(${vehicleThresholdIds.join(",")})`);
      }
    }
  }

  if (options?.vehicleType && (options.vehicleType === "car" || options.vehicleType === "motorcycle")) {
    query = query.eq("vehicle_type", options.vehicleType);
  }

  if (matchingAppAccountIds === "not_linked") {
    query = query.is("auth_user_id", null);
  } else if (matchingAppAccountIds === "empty") {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // force empty
  } else if (Array.isArray(matchingAppAccountIds) && matchingAppAccountIds.length > 0) {
    query = query.in("auth_user_id", matchingAppAccountIds);
  }

  return query;
}

async function getVehicleDocumentDriverIds(
  supabase: SupabaseClient<Database>,
  organizationId: string,
) {
  const empty = { expired: [] as string[], threshold: [] as string[] };
  const { data: drivers, error: driversError } = await supabase
    .from("drivers")
    .select("id, vehicle_id")
    .eq("organization_id", organizationId);

  if (driversError) return empty;

  const driverVehicleRows = (drivers ?? []) as Array<{ id: string; vehicle_id: string | null }>;
  const vehicleIds = Array.from(
    new Set(driverVehicleRows.map((driver) => driver.vehicle_id).filter((id): id is string => Boolean(id))),
  );
  if (vehicleIds.length === 0) return empty;

  let fleetClient;
  try {
    fleetClient = createAdminClient();
  } catch {
    return empty;
  }

  const { data: vehicles, error: vehiclesError } = await fleetClient
    .from("fleet_vehicles")
    .select("id, authorization_expiry_date, operating_card_expiry_date")
    .in("id", vehicleIds);

  if (vehiclesError) return empty;

  const today = getBusinessDateString();
  const thresholdDate = getBusinessDateString(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
  const expiredVehicleIds = new Set(
    (vehicles ?? [])
      .filter((vehicle) =>
        [vehicle.authorization_expiry_date, vehicle.operating_card_expiry_date].some(
          (date) => date && date <= today,
        ),
      )
      .map((vehicle) => vehicle.id),
  );
  const thresholdVehicleIds = new Set(
    (vehicles ?? [])
      .filter((vehicle) =>
        [vehicle.authorization_expiry_date, vehicle.operating_card_expiry_date].some(
          (date) => date && date <= thresholdDate,
        ),
      )
      .map((vehicle) => vehicle.id),
  );

  return {
    expired: driverVehicleRows
      .filter((driver) => driver.vehicle_id && expiredVehicleIds.has(driver.vehicle_id))
      .map((driver) => driver.id),
    threshold: driverVehicleRows
      .filter((driver) => driver.vehicle_id && thresholdVehicleIds.has(driver.vehicle_id))
      .map((driver) => driver.id),
  };
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
      deleted_at,
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
  avatarUrls: Map<string, string>,
  vehiclePlateNumbers: Map<string, { plateNumber: string; authorizationExpiryDate: string | null; operatingCardExpiryDate: string | null }>,
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

  let profilePhotoPreview = null;
  if (driver.profile_photo_path) {
    profilePhotoPreview = createDriverFilePreview({
      driverId: driver.id,
      type: "profile-photo",
      fileName: getFileNameFromStoragePath(driver.profile_photo_path),
      mimeType: getMimeTypeFromStoragePath(driver.profile_photo_path),
      canDownload: documentPermissions.canDownloadDocuments,
    });
    
    // Override the API route previewUrl with the batched signed URL if available
    const batchedUrl = avatarUrls.get(driver.profile_photo_path);
    if (batchedUrl && profilePhotoPreview) {
      profilePhotoPreview.previewUrl = batchedUrl;
    }
  }

  return {
    id: driver.id,
    fullName: driver.full_name,
    nationality: driver.nationality,
    mobileNumber: driver.mobile_number,
    nfcNumber: "nfc_number" in driver ? driver.nfc_number ?? null : null,
    vehicleType: driver.vehicle_type,
    vehicleId: driver.vehicle_id || null,
    vehicleNumber: driver.vehicle_id
      ? vehiclePlateNumbers.get(driver.vehicle_id)?.plateNumber ?? ""
      : "",
    keetaVehiclePlateNumber: driver.keeta_vehicle_plate_number ?? null,
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
    vehicleAuthorizationExpiryDate: driver.vehicle_id
      ? vehiclePlateNumbers.get(driver.vehicle_id)?.authorizationExpiryDate ?? ""
      : "",
    operatingCardExpiryDate: driver.vehicle_id
      ? vehiclePlateNumbers.get(driver.vehicle_id)?.operatingCardExpiryDate ?? null
      : null,
    iban: driver.driver_bank_details?.iban ?? null,
    bankName: driver.driver_bank_details?.bank_name ?? null,
    accountNumber: driver.driver_bank_details?.account_number ?? null,
    profilePhotoUrl: profilePhotoPreview?.previewUrl ?? null,
    profilePhotoPreview,
    documents,
    createdBy: getActor(actors, driver.created_by_user_id),
    updatedBy: getActor(actors, driver.updated_by_user_id),
    createdAt: driver.created_at,
    updatedAt: driver.updated_at,
    deletedAt: driver.deleted_at,
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

export async function getDriversExportData(
  organizationId: string,
  organizationName: string,
  options?: Parameters<typeof getDriversForOrganization>[2]
): Promise<DriverListItem[]> {
  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return [];
  }

  let matchingAppAccountIds: string[] | null | "not_linked" | "empty" = null;
  if (options?.appAccountStatus) {
    if (options.appAccountStatus === "not_linked") {
      matchingAppAccountIds = "not_linked";
    } else {
      const { data: driversData } = await admin.supabase
        .from("drivers")
        .select("auth_user_id")
        .eq("organization_id", organizationId)
        .not("auth_user_id", "is", null);
        
      if (driversData && driversData.length > 0) {
        const authUserIds = driversData.map(d => d.auth_user_id);
        const appAccounts = await getDriverAppAccounts(admin.supabase, authUserIds);
        
        const matchingIds = authUserIds.filter(id => {
          const account = getDriverAppAccount(id, appAccounts);
          return account.status === options.appAccountStatus;
        }).filter(Boolean) as string[];

        matchingAppAccountIds = matchingIds.length > 0 ? matchingIds : "empty";
      } else {
        matchingAppAccountIds = "empty";
      }
    }
  }

  const query = buildDriversPageQuery(admin.supabase, organizationId, options, "withVehicleIdAndNfc", matchingAppAccountIds)
    .order("full_name", { ascending: true });

  let { data, error } = await query;
  
  if (isMissingNfcNumberColumnError(error)) {
    const retry = await buildDriversPageQuery(admin.supabase, organizationId, options, "withVehicleId", matchingAppAccountIds)
      .order("full_name", { ascending: true });
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    console.error("Failed to fetch drivers for export", error);
    return [];
  }
  
  const rows = data as unknown as DriverQueryRow[];

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
  const vehiclePlateNumbers = await getVehicleDetails(
    rows.map((driver) => driver.vehicle_id),
  );

  return rows.map((driver) =>
    mapDriver(driver, organizationName, actors, appAccounts, new Map(), vehiclePlateNumbers, {
      canViewDocuments,
      canDownloadDocuments,
    }),
  );
}
