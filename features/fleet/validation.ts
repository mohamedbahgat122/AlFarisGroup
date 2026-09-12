import type {
  FleetFaultLocation,
  FleetMutationInput,
  FleetOwnerSource,
  FleetOwnershipType,
  FleetPersonSource,
  FleetTechnicalStatus,
  FleetVehicleCategory,
} from "@/features/fleet/types";

const vehicleCategories = new Set(["car", "motorcycle"]);
const ownerSources = new Set(["organization", "manual"]);
const ownershipTypes = new Set([
  "company_owned",
  "rental",
  "external_office",
  "individual",
  "driver_owned",
  "other",
]);
const personSources = new Set(["none", "organization_driver", "manual"]);
const technicalStatuses = new Set(["healthy", "fault", "accident"]);
const faultLocations = new Set(["parked", "in_maintenance"]);

export function normalizePlateForFleet(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value)
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function normalizeAndValidateFleetInput(input: FleetMutationInput) {
  const normalized: FleetMutationInput & { normalizedPlateNumber: string } = {
    ...input,
    vehicleType: input.vehicleType.trim(),
    plateNumber: input.plateNumber.trim(),
    serialNumber: nullableTrimmed(input.serialNumber),
    brand: nullableTrimmed(input.brand),
    manualOwnerName: nullableTrimmed(input.manualOwnerName),
    ownerIdentifier: nullableTrimmed(input.ownerIdentifier),
    ownershipType: nullableTrimmed(input.ownershipType) as FleetOwnershipType | null,
    ownerName: nullableTrimmed(input.ownerName),
    ownerDriverId: nullableTrimmed(input.ownerDriverId),
    ownerContactPhone: nullableTrimmed(input.ownerContactPhone),
    rentalStartDate: nullableDate(input.rentalStartDate),
    rentalEndDate: nullableDate(input.rentalEndDate),
    rentalMonthlyCost: nullableNumber(input.rentalMonthlyCost),
    ownershipContractNumber: nullableTrimmed(input.ownershipContractNumber),
    ownershipNotes: nullableTrimmed(input.ownershipNotes),
    operatingCardNumber: nullableTrimmed(input.operatingCardNumber),
    operatingCardExpiryDate: nullableDate(input.operatingCardExpiryDate),
    assignedDriverId: nullableTrimmed(input.assignedDriverId),
    assignedDriverManualName: nullableTrimmed(input.assignedDriverManualName),
    assignedDriverManualIqama: nullableTrimmed(input.assignedDriverManualIqama),
    authorizedDriverId: nullableTrimmed(input.authorizedDriverId),
    authorizedManualName: nullableTrimmed(input.authorizedManualName),
    authorizedManualIqama: nullableTrimmed(input.authorizedManualIqama),
    authorizationNumber: nullableTrimmed(input.authorizationNumber),
    authorizationExpiryDate: nullableDate(input.authorizationExpiryDate),
    faultLocation: (input.technicalStatus === "fault" || input.technicalStatus === "accident") ? input.faultLocation : null,
    technicalStatusNote: nullableTrimmed(input.technicalStatusNote),
    notes: nullableTrimmed(input.notes),
    normalizedPlateNumber: normalizePlateForFleet(input.plateNumber),
  };
  const fields: string[] = [];

  if (!isFleetVehicleCategory(normalized.vehicleCategory)) fields.push("vehicleCategory");
  if (!isLength(normalized.vehicleType, 1, 120)) fields.push("vehicleType");
  if (!isLength(normalized.plateNumber, 1, 80) || !normalized.normalizedPlateNumber) {
    fields.push("plateNumber");
  }
  if (!isFleetOwnerSource(normalized.ownerSource)) fields.push("ownerSource");
  if (normalized.ownerSource === "manual" && !isLength(normalized.manualOwnerName, 1, 160)) {
    fields.push("manualOwnerName");
  }
  if (normalized.ownershipType && !isFleetOwnershipType(normalized.ownershipType)) {
    fields.push("ownershipType");
  }
  if (normalized.ownershipType === "driver_owned" && !normalized.ownerDriverId) {
    fields.push("ownerDriverId");
  }
  if (
    normalized.rentalStartDate &&
    normalized.rentalEndDate &&
    normalized.rentalEndDate < normalized.rentalStartDate
  ) {
    fields.push("rentalEndDate");
  }
  if (
    normalized.rentalMonthlyCost !== null &&
    (!Number.isFinite(normalized.rentalMonthlyCost) || normalized.rentalMonthlyCost < 0)
  ) {
    fields.push("rentalMonthlyCost");
  }
  if (normalized.operatingCardNumber && normalized.operatingCardNumber.length > 120) {
    fields.push("operatingCardNumber");
  }
  if (!isFleetPersonSource(normalized.assignedDriverSource)) fields.push("assignedDriverSource");
  if (normalized.assignedDriverSource === "organization_driver" && !normalized.assignedDriverId) {
    fields.push("assignedDriverId");
  }
  if (
    normalized.assignedDriverSource === "manual" &&
    (!isLength(normalized.assignedDriverManualName, 1, 160) ||
      !isLength(normalized.assignedDriverManualIqama, 1, 40))
  ) {
    fields.push("assignedDriverManualName", "assignedDriverManualIqama");
  }
  if (!isFleetPersonSource(normalized.authorizedPersonSource)) fields.push("authorizedPersonSource");
  if (normalized.authorizedPersonSource === "organization_driver" && !normalized.authorizedDriverId) {
    fields.push("authorizedDriverId");
  }
  if (
    normalized.authorizedPersonSource === "manual" &&
    (!isLength(normalized.authorizedManualName, 1, 160) ||
      !isLength(normalized.authorizedManualIqama, 1, 40))
  ) {
    fields.push("authorizedManualName", "authorizedManualIqama");
  }
  if (!isFleetTechnicalStatus(normalized.technicalStatus)) fields.push("technicalStatus");
  if (
    (normalized.technicalStatus === "fault" || normalized.technicalStatus === "accident") &&
    !isFleetFaultLocation(normalized.faultLocation)
  ) {
    fields.push("faultLocation");
  }

  return fields.length === 0
    ? { valid: true as const, input: normalized }
    : { valid: false as const, fields: Array.from(new Set(fields)) };
}

export function isFleetVehicleCategory(value: string): value is FleetVehicleCategory {
  return vehicleCategories.has(value);
}

export function isFleetOwnerSource(value: string): value is FleetOwnerSource {
  return ownerSources.has(value);
}

export function isFleetOwnershipType(value: string | null): value is FleetOwnershipType {
  return typeof value === "string" && ownershipTypes.has(value);
}

export function isFleetPersonSource(value: string): value is FleetPersonSource {
  return personSources.has(value);
}

export function isFleetTechnicalStatus(value: string): value is FleetTechnicalStatus {
  return technicalStatuses.has(value);
}

export function isFleetFaultLocation(value: string | null): value is FleetFaultLocation {
  return typeof value === "string" && faultLocations.has(value);
}

function nullableTrimmed(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function nullableDate(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function nullableNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isLength(value: string | null, min: number, max: number) {
  return typeof value === "string" && value.length >= min && value.length <= max;
}
