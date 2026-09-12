"use server";

import { revalidatePath } from "next/cache";
import { getDictionary } from "@/i18n/dictionaries";
import {
  createFleetVehicle,
  setFleetArchiveStatus,
  setFleetOperationalStatus,
  updateFleetTechnicalStatus,
  updateFleetVehicle,
} from "@/features/fleet/service";
import { getFleetActivityLogs } from "@/features/fleet/queries";
import { requireOrganizationPermission } from "@/features/permissions/server";
import { createFleetFileDownloadSignedUrl, isValidFleetFile } from "@/features/fleet/storage";
import {
  isFleetFaultLocation,
  isFleetOwnerSource,
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

export async function createFleetVehicleAction(
  _previousState: FleetActionState,
  formData: FormData,
): Promise<FleetActionState> {
  return saveFleetVehicle(formData, "create");
}

export async function updateFleetVehicleAction(
  _previousState: FleetActionState,
  formData: FormData,
): Promise<FleetActionState> {
  return saveFleetVehicle(formData, "update");
}

export async function setFleetOperationalStatusAction(formData: FormData) {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const vehicleId = getStringValue(formData, "vehicleId");
  const status = getStringValue(formData, "status");
  if (!isLocale(locale) || !organizationCode || !vehicleId || !isOperationalStatus(status)) {
    return;
  }
  await setFleetOperationalStatus({
    organizationCode,
    vehicleId,
    status,
  });
  revalidateFleetPaths(locale, organizationCode);
}

export async function setFleetArchiveStatusAction(formData: FormData) {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const vehicleId = getStringValue(formData, "vehicleId");
  const archived = getStringValue(formData, "archived") === "true";
  if (!isLocale(locale) || !organizationCode || !vehicleId) {
    return;
  }
  await setFleetArchiveStatus({ organizationCode, vehicleId, archived });
  revalidateFleetPaths(locale, organizationCode);
}

export async function updateFleetTechnicalStatusAction(
  _previousState: FleetActionState,
  formData: FormData,
): Promise<FleetActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const vehicleId = getStringValue(formData, "vehicleId");
  const technicalStatus = getStringValue(formData, "technicalStatus");
  const faultLocation = getStringValue(formData, "faultLocation");
  if (!isLocale(locale) || !organizationCode || !vehicleId || !isFleetTechnicalStatus(technicalStatus)) {
    return { status: "error", code: "validation_error" };
  }
  const normalizedFaultLocation: FleetFaultLocation | null =
    (technicalStatus === "fault" || technicalStatus === "accident") && isFleetFaultLocation(faultLocation)
      ? faultLocation
      : null;
  const result = await updateFleetTechnicalStatus({
    organizationCode,
    vehicleId,
    technicalStatus,
    faultLocation: normalizedFaultLocation,
    note: getStringValue(formData, "technicalStatusNote"),
  });
  if (!result.success) {
    return {
      status: result.code === "validation_error" ? "validation_error" : "error",
      code: result.code,
      fieldErrors: buildFieldErrors(locale, result.fields ?? []),
    };
  }
  revalidateFleetPaths(locale, organizationCode);
  return { status: "success", code: "success" };
}

export async function getFleetDownloadUrlAction(formData: FormData) {
  const path = getStringValue(formData, "path");
  const fileName = getStringValue(formData, "fileName") || "fleet-file";
  if (!path.startsWith("fleet/")) return null;
  const organizationId = path.split("/")[1];
  const isOperatingCard = path.includes("/operating-card/");
  const isRegistration = path.includes("/registration/");
  const permissionKey = isRegistration ? "fleet.update" : "fleet.operating_card.download";

  if (
    !organizationId ||
    !(await requireOrganizationPermission({
      organizationId,
      permissionKey: permissionKey as any, // Using 'any' as I don't know the exact permission enum
    }))
  ) {
    return null;
  }
  return createFleetFileDownloadSignedUrl(path, fileName);
}

export async function getFleetActivityLogsAction(formData: FormData) {
  const organizationId = getStringValue(formData, "organizationId");
  const vehicleId = getStringValue(formData, "vehicleId");
  if (!organizationId || !vehicleId) return [];
  if (
    !(await requireOrganizationPermission({
      organizationId,
      permissionKey: "fleet.activity.view",
    }))
  ) {
    return [];
  }
  return getFleetActivityLogs({ organizationId, vehicleId });
}

async function saveFleetVehicle(
  formData: FormData,
  mode: "create" | "update",
): Promise<FleetActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  if (!isLocale(locale) || !organizationCode) {
    return { status: "error", code: "validation_error" };
  }
  const input = getFleetInput(formData);
  if (!input) {
    return { status: "validation_error", code: "validation_error" };
  }
  const file = getOptionalFile(formData, "operatingCardFile");
  if (file && !isValidFleetFile(file)) {
    return {
      status: "validation_error",
      code: "document_invalid",
      fieldErrors: { operatingCardFile: getDictionary(locale).dashboard.fleet.errors.document_invalid },
    };
  }
  
  const registrationFile = getOptionalFile(formData, "registrationFile");
  if (registrationFile && !isValidFleetFile(registrationFile)) {
    return {
      status: "validation_error",
      code: "document_invalid",
      fieldErrors: { registrationFile: getDictionary(locale).dashboard.fleet.errors.document_invalid },
    };
  }

  const result =
    mode === "create"
      ? await createFleetVehicle({ organizationCode, input, operatingCardFile: file, registrationFile })
      : await updateFleetVehicle({ organizationCode, input, operatingCardFile: file, registrationFile });

  if (!result.success) {
    return {
      status: result.code === "validation_error" ? "validation_error" : "error",
      code: result.code,
      fieldErrors: buildFieldErrors(locale, result.fields ?? []),
    };
  }

  revalidateFleetPaths(locale, organizationCode);
  return { status: "success", code: "success" };
}

function getFleetInput(formData: FormData): FleetMutationInput | null {
  const vehicleCategory = getStringValue(formData, "vehicleCategory");
  const ownerSource = getStringValue(formData, "ownerSource");
  const assignedDriverSource = getStringValue(formData, "assignedDriverSource");
  const authorizedPersonSource = getStringValue(formData, "authorizedPersonSource");
  const technicalStatus = getStringValue(formData, "technicalStatus");
  const faultLocation = getStringValue(formData, "faultLocation");
  if (
    !isFleetVehicleCategory(vehicleCategory) ||
    !isFleetOwnerSource(ownerSource) ||
    !isFleetPersonSource(assignedDriverSource) ||
    !isFleetPersonSource(authorizedPersonSource) ||
    !isFleetTechnicalStatus(technicalStatus)
  ) {
    return null;
  }
  return {
    vehicleId: getStringValue(formData, "vehicleId") || undefined,
    vehicleCategory,
    vehicleType: getStringValue(formData, "vehicleType"),
    plateNumber: getStringValue(formData, "plateNumber"),
    serialNumber: getStringValue(formData, "serialNumber") || null,
    brand: getStringValue(formData, "brand") || null,
    ownerSource,
    manualOwnerName: getStringValue(formData, "manualOwnerName"),
    ownershipType: null,
    ownerName: null,
    ownerDriverId: null,
    ownerContactPhone: null,
    ownerIdentifier: getStringValue(formData, "ownerIdentifier") || null,
    rentalStartDate: null,
    rentalEndDate: null,
    rentalMonthlyCost: null,
    ownershipContractNumber: null,
    ownershipNotes: null,
    operatingCardNumber: getStringValue(formData, "operatingCardNumber"),
    operatingCardExpiryDate: getStringValue(formData, "operatingCardExpiryDate"),
    assignedDriverSource,
    assignedDriverId: getStringValue(formData, "assignedDriverId"),
    assignedDriverManualName: getStringValue(formData, "assignedDriverManualName"),
    assignedDriverManualIqama: getStringValue(formData, "assignedDriverManualIqama"),
    authorizedPersonSource,
    authorizedDriverId: getStringValue(formData, "authorizedDriverId"),
    authorizedManualName: getStringValue(formData, "authorizedManualName"),
    authorizedManualIqama: getStringValue(formData, "authorizedManualIqama"),
    authorizationNumber: getStringValue(formData, "authorizationNumber") || null,
    authorizationExpiryDate: getStringValue(formData, "authorizationExpiryDate"),
    technicalStatus,
    faultLocation: isFleetFaultLocation(faultLocation) ? faultLocation : null,
    technicalStatusNote: getStringValue(formData, "technicalStatusNote"),
    notes: getStringValue(formData, "notes"),
  };
}

function buildFieldErrors(locale: "ar" | "en", fields: string[]) {
  const dictionary = getDictionary(locale).dashboard.fleet;
  return Object.fromEntries(
    fields.map((field) => [
      field,
      dictionary.errors.validation_error,
    ]),
  );
}

function getOptionalFile(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isOperationalStatus(value: string): value is FleetOperationalStatus {
  return value === "active" || value === "suspended";
}

function revalidateFleetPaths(locale: "ar" | "en", organizationCode: string) {
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/fleet/cars`);
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/fleet/motorcycles`);
}
