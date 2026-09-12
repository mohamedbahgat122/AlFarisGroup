"use server";

import { revalidatePath } from "next/cache";
import { getGlobalPermissions } from "@/features/permissions/server";
import { getDictionary } from "@/i18n/dictionaries";
import {
  createGlobalFleetVehicle,
  updateGlobalFleetVehicle,
  setGlobalFleetOperationalStatus,
  setGlobalFleetArchiveStatus,
  updateGlobalFleetTechnicalStatus,
} from "@/features/fleet/global-service";
import {
  isFleetFaultLocation,
  isFleetOwnerSource,
  isFleetOwnershipType,
  isFleetPersonSource,
  isFleetTechnicalStatus,
  isFleetVehicleCategory,
} from "@/features/fleet/validation";
import type {
  FleetActionState,
  FleetFaultLocation,
  FleetMutationInput,
  FleetOperationalStatus,
} from "@/features/fleet/types";
import { isLocale } from "@/types/locale";
import type { Locale } from "@/types/locale";
import type { FleetDriverOption } from "@/features/fleet/types";
import { searchGlobalFleetDrivers } from "@/features/fleet/queries";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import {
  createFleetFilePreviewSignedUrl,
  fleetBaselinePhotoSlots,
  type FleetBaselinePhotoSlot,
} from "@/features/fleet/storage";
import type { FleetBaselinePhotoUrls } from "@/features/fleet/types";

export async function searchGlobalDriversAction(query: string): Promise<FleetDriverOption[]> {
  return searchGlobalFleetDrivers(query);
}

function getStringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value === "string") return value.trim();
  return "";
}

function getOptionalFile(formData: FormData, key: string) {
  const entry = formData.get(key);
  return entry instanceof File && entry.size > 0 ? entry : null;
}

function getOptionalNumberValue(formData: FormData, key: string): number | null {
  const value = getStringValue(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getLegacyOwnerFields({
  assignedOrganizationId,
  ownerName,
  ownershipType,
}: {
  assignedOrganizationId: string | null;
  ownerName: string | null;
  ownershipType: string | null;
}) {
  if (!ownershipType || ownershipType === "company_owned") {
    return {
      ownerSource: "organization" as const,
      manualOwnerName: null,
    };
  }

  return {
    ownerSource: "manual" as const,
    manualOwnerName: ownerName || ownershipType || assignedOrganizationId || "ownership",
  };
}

function getBaselinePhotoFiles(formData: FormData) {
  const fields: Record<FleetBaselinePhotoSlot, string> = {
    front: "baselineFrontPhoto",
    rear: "baselineRearPhoto",
    right: "baselineRightPhoto",
    left: "baselineLeftPhoto",
  };
  const files: Partial<Record<FleetBaselinePhotoSlot, File>> = {};

  for (const slot of fleetBaselinePhotoSlots) {
    const file = getOptionalFile(formData, fields[slot]);
    if (file) {
      files[slot] = file;
    }
  }

  return files;
}

function isOperationalStatus(value: string): value is FleetOperationalStatus {
  return value === "active" || value === "suspended";
}

function buildFieldErrors(locale: string, fields: string[]) {
  const dictionary = getDictionary(locale as Locale).dashboard.fleet;
  return Object.fromEntries(
    fields.map((field) => [
      field,
      dictionary.errors.validation_error,
    ])
  );
}

function revalidateGlobalFleetPaths(locale: string) {
  revalidatePath(`/${locale}/dashboard/fleet`);
  revalidatePath(`/${locale}/dashboard/fleet/cars`);
  revalidatePath(`/${locale}/dashboard/fleet/motorcycles`);
}

function createGlobalFleetActionDiagnostics(action: "create" | "update") {
  const startedAt = performance.now();
  let previousAt = startedAt;

  return {
    mark(stage: string, metadata: Record<string, unknown> = {}) {
      if (process.env.NODE_ENV === "production") return;

      const now = performance.now();
      console.info("[global-fleet:action]", {
        action,
        stage,
        durationMs: Math.round(now - previousAt),
        totalMs: Math.round(now - startedAt),
        ...metadata,
      });
      previousAt = now;
    },
  };
}

async function saveGlobalFleetVehicle(
  formData: FormData,
  action: "create" | "update",
): Promise<FleetActionState> {
  const diagnostics = createGlobalFleetActionDiagnostics(action);
  const locale = getStringValue(formData, "locale");
  diagnostics.mark("input_parsing", { hasLocale: Boolean(locale) });
  if (!isLocale(locale)) {
    return { status: "error", code: "validation_error" };
  }

  const category = getStringValue(formData, "vehicleCategory");
  const type = getStringValue(formData, "vehicleType");
  const plate = getStringValue(formData, "plateNumber");
  const rawOwnershipType = getStringValue(formData, "ownershipType");
  const ownershipType = isFleetOwnershipType(rawOwnershipType) ? rawOwnershipType : null;
  const ownerName = getStringValue(formData, "ownerName") || null;
  const assignedOrganizationId = getStringValue(formData, "assignedOrganizationId") || null;
  const legacyOwner = getLegacyOwnerFields({
    assignedOrganizationId,
    ownerName,
    ownershipType,
  });
  const assignedDriverSource = getStringValue(formData, "assignedDriverSource");
  const authorizedPersonSource = getStringValue(formData, "authorizedPersonSource");
  
  if (
    !isFleetVehicleCategory(category) ||
    !type ||
    !plate ||
    !isFleetOwnerSource(legacyOwner.ownerSource) ||
    !isFleetPersonSource(assignedDriverSource) ||
    !isFleetPersonSource(authorizedPersonSource)
  ) {
    diagnostics.mark("input_validation", { success: false });
    return { status: "error", code: "validation_error" };
  }
  diagnostics.mark("input_validation", { success: true });

  const input: FleetMutationInput = {
    vehicleCategory: category,
    vehicleType: type,
    plateNumber: plate,
    serialNumber: getStringValue(formData, "serialNumber") || null,
    brand: getStringValue(formData, "brand") || null,
    ownerSource: legacyOwner.ownerSource,
    assignedOrganizationId,
    manualOwnerName: legacyOwner.manualOwnerName,
    ownershipType,
    ownerName,
    ownerDriverId: getStringValue(formData, "ownerDriverId") || null,
    ownerContactPhone: getStringValue(formData, "ownerContactPhone") || null,
    ownerIdentifier: getStringValue(formData, "ownerIdentifier") || null,
    rentalStartDate: getStringValue(formData, "rentalStartDate") || null,
    rentalEndDate: getStringValue(formData, "rentalEndDate") || null,
    rentalMonthlyCost: getOptionalNumberValue(formData, "rentalMonthlyCost"),
    ownershipContractNumber: getStringValue(formData, "ownershipContractNumber") || null,
    ownershipNotes: getStringValue(formData, "ownershipNotes") || null,
    operatingCardNumber: getStringValue(formData, "operatingCardNumber"),
    operatingCardExpiryDate: getStringValue(formData, "operatingCardExpiryDate") || null,
    assignedDriverSource,
    assignedDriverId: getStringValue(formData, "assignedDriverId") || null,
    assignedDriverManualName: getStringValue(formData, "assignedDriverManualName"),
    assignedDriverManualIqama: getStringValue(formData, "assignedDriverManualIqama"),
    authorizedPersonSource,
    authorizedDriverId: getStringValue(formData, "authorizedDriverId") || null,
    authorizedManualName: getStringValue(formData, "authorizedManualName"),
    authorizedManualIqama: getStringValue(formData, "authorizedManualIqama"),
    authorizationNumber: getStringValue(formData, "authorizationNumber") || null,
    authorizationExpiryDate: getStringValue(formData, "authorizationExpiryDate") || null,
    technicalStatus: "healthy",
    faultLocation: null,
    technicalStatusNote: null,
    notes: getStringValue(formData, "notes"),
  };

  const operatingCardFile = getOptionalFile(formData, "operatingCardFile");
  const registrationFile = getOptionalFile(formData, "registrationFile");
  const baselinePhotoFiles = getBaselinePhotoFiles(formData);

  let result;
  if (action === "create") {
    result = await createGlobalFleetVehicle({
      input,
      operatingCardFile,
      registrationFile,
      baselinePhotoFiles,
    });
  } else {
    const vehicleId = getStringValue(formData, "vehicleId");
    if (!vehicleId) return { status: "error", code: "validation_error" };
    
    // Technical status is preserved on edit by the service, but input requires it
    const existingTechnicalStatus = getStringValue(formData, "technicalStatus");
    if (isFleetTechnicalStatus(existingTechnicalStatus)) {
        input.technicalStatus = existingTechnicalStatus;
    }
    const existingFaultLocation = getStringValue(formData, "faultLocation");
    if (isFleetFaultLocation(existingFaultLocation)) {
        input.faultLocation = existingFaultLocation;
    }

    result = await updateGlobalFleetVehicle({
      vehicleId,
      input,
      operatingCardFile,
      registrationFile,
      baselinePhotoFiles,
    });
  }
  diagnostics.mark("service_mutation", { success: result.success, code: result.success ? null : result.code });

  if (result.success) {
    revalidateGlobalFleetPaths(locale);
    diagnostics.mark("revalidation", { success: true });
    return { status: "success" };
  }

  const state: FleetActionState = {
    status: result.code === "validation_error" ? "validation_error" : "error",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code: result.code as any,
  };

  if (result.fields && result.fields.length > 0) {
    state.fieldErrors = buildFieldErrors(locale, result.fields);
  }

  return state;
}

export async function createGlobalFleetVehicleAction(
  _previousState: FleetActionState,
  formData: FormData,
): Promise<FleetActionState> {
  return saveGlobalFleetVehicle(formData, "create");
}

export async function updateGlobalFleetVehicleAction(
  _previousState: FleetActionState,
  formData: FormData,
): Promise<FleetActionState> {
  return saveGlobalFleetVehicle(formData, "update");
}

export async function setGlobalFleetOperationalStatusAction(formData: FormData) {
  const locale = getStringValue(formData, "locale");
  const vehicleId = getStringValue(formData, "vehicleId");
  const status = getStringValue(formData, "status");
  if (!isLocale(locale) || !vehicleId || !isOperationalStatus(status)) {
    return;
  }
  await setGlobalFleetOperationalStatus({
    vehicleId,
    status,
  });
  revalidateGlobalFleetPaths(locale);
}

export async function setGlobalFleetArchiveStatusAction(formData: FormData) {
  const locale = getStringValue(formData, "locale");
  const vehicleId = getStringValue(formData, "vehicleId");
  const archived = getStringValue(formData, "archived") === "true";
  if (!isLocale(locale) || !vehicleId) {
    return;
  }
  await setGlobalFleetArchiveStatus({ vehicleId, archived });
  revalidateGlobalFleetPaths(locale);
}

export async function updateGlobalFleetTechnicalStatusAction(
  _previousState: FleetActionState,
  formData: FormData,
): Promise<FleetActionState> {
  const locale = getStringValue(formData, "locale");
  const vehicleId = getStringValue(formData, "vehicleId");
  const technicalStatus = getStringValue(formData, "technicalStatus");
  const faultLocation = getStringValue(formData, "faultLocation");
  if (!isLocale(locale) || !vehicleId || !isFleetTechnicalStatus(technicalStatus)) {
    return { status: "error", code: "validation_error" };
  }
  const normalizedFaultLocation: FleetFaultLocation | null =
    (technicalStatus === "fault" || technicalStatus === "accident") && isFleetFaultLocation(faultLocation)
      ? faultLocation
      : null;
  const result = await updateGlobalFleetTechnicalStatus({
    vehicleId,
    technicalStatus,
    faultLocation: normalizedFaultLocation,
    note: getStringValue(formData, "technicalStatusNote"),
  });
  if (!result.success) {
    return {
      status: "error",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      code: result.code as any,
    };
  }
  revalidateGlobalFleetPaths(locale);
  return { status: "success" };
}

export async function getGlobalFleetActivityLogsAction(formData: FormData) {
  const vehicleId = formData.get("vehicleId") as string;
  if (!vehicleId) return [];

  const { getGlobalFleetActivityLogs } = await import("@/features/fleet/queries");
  return getGlobalFleetActivityLogs({ vehicleId });
}

export async function getGlobalFleetBaselinePhotoUrlsAction(
  formData: FormData,
): Promise<FleetBaselinePhotoUrls> {
  const empty: FleetBaselinePhotoUrls = {
    front: null,
    rear: null,
    right: null,
    left: null,
  };
  const vehicleId = getStringValue(formData, "vehicleId");
  if (!vehicleId) return empty;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return empty;

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  if (admin.profile.role !== "system_owner" && !globalPermissions.has("fleet.view")) {
    return empty;
  }

  const { data, error } = await admin.supabase
    .from("fleet_vehicles")
    .select("front_photo_path, rear_photo_path, right_photo_path, left_photo_path")
    .eq("id", vehicleId)
    .maybeSingle();

  if (error || !data) return empty;

  const paths: FleetBaselinePhotoUrls = {
    front: data.front_photo_path,
    rear: data.rear_photo_path,
    right: data.right_photo_path,
    left: data.left_photo_path,
  };
  const entries = await Promise.all(
    fleetBaselinePhotoSlots.map(async (slot) => [
      slot,
      paths[slot] ? await createFleetFilePreviewSignedUrl(paths[slot]) : null,
    ] as const),
  );

  return Object.fromEntries(entries) as FleetBaselinePhotoUrls;
}

export async function getGlobalFleetDocumentPreviewUrlAction(formData: FormData) {
  const path = getStringValue(formData, "path");
  if (!path.startsWith("fleet/")) return null;
  const isOperatingCard = path.includes("/operating-card/");
  const isRegistration = path.includes("/registration/");
  if (!isOperatingCard && !isRegistration) {
    return null;
  }

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return null;

  const globalPermissions = await getGlobalPermissions(admin.supabase, admin.profile);
  const permissionKey = isRegistration ? "fleet.update" : "fleet.operating_card.download";
  if (admin.profile.role !== "system_owner" && !globalPermissions.has(permissionKey)) {
    return null;
  }

  const { data, error } = await admin.supabase
    .from("fleet_vehicles")
    .select("id")
    .or(`operating_card_file_path.eq.${path},registration_file_path.eq.${path}`)
    .maybeSingle();

  if (error || !data) return null;

  return createFleetFilePreviewSignedUrl(path);
}
