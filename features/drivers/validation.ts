import type {
  DriverDocumentType,
  DriverFieldErrors,
  DriverFormFieldName,
  DriverMutationInput,
  DriverSettlementType,
  DriverVehicleType,
} from "@/features/drivers/types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const mobilePattern = /^\+?[0-9]{7,15}$/;
const ibanPattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

const allowedVehicleTypes = new Set<DriverVehicleType>(["motorcycle", "car"]);
const allowedSettlementTypes = new Set<DriverSettlementType>([
  "tiers",
  "per_order",
]);
const allowedDocumentTypes = new Set<DriverDocumentType>([
  "iqama",
  "driving_license",
  "driver_card",
]);

export type DriverValidationResult =
  | {
      valid: true;
      input: DriverMutationInput;
    }
  | {
      valid: false;
      fields: DriverFormFieldName[];
    };

export function normalizeAndValidateDriverInput(
  input: DriverMutationInput,
): DriverValidationResult {
  const normalized: DriverMutationInput = {
    ...input,
    driverId: input.driverId?.trim(),
    organizationId: input.organizationId.trim(),
    fullName: input.fullName.trim(),
    nationality: input.nationality.trim(),
    mobileNumber: normalizeMobile(input.mobileNumber),
    vehicleNumber: input.vehicleNumber.trim(),
    keetaVehiclePlateNumber: input.keetaVehiclePlateNumber.trim(),
    vehicleSerialNumber: input.vehicleSerialNumber.trim(),
    vehicleOwnerIdentifier: input.vehicleOwnerIdentifier.trim(),
    vehicleBrand: input.vehicleBrand.trim(),
    keetaUsername: input.keetaUsername.trim(),
    keetaDriverId: input.keetaDriverId.trim(),
    iqamaNumber: input.iqamaNumber.trim(),
    iqamaExpiryDate: input.iqamaExpiryDate.trim(),
    drivingLicenseNumber: input.drivingLicenseNumber.trim(),
    drivingLicenseExpiryDate: input.drivingLicenseExpiryDate.trim(),
    driverCardNumber: input.driverCardNumber.trim(),
    driverCardExpiryDate: input.driverCardExpiryDate.trim(),
    vehicleAuthorizationNumber: input.vehicleAuthorizationNumber.trim(),
    vehicleAuthorizationExpiryDate:
      input.vehicleAuthorizationExpiryDate.trim(),
    operatingCardNumber: input.operatingCardNumber.trim(),
    operatingCardExpiryDate: input.operatingCardExpiryDate.trim(),
    iban: normalizeOptionalIban(input.iban),
    bankName: normalizeOptionalText(input.bankName),
    accountNumber: normalizeOptionalText(input.accountNumber),
  };

  const fields: DriverFormFieldName[] = [];

  if (!isUuid(normalized.organizationId)) {
    return { valid: false, fields: [] };
  }

  if (normalized.driverId && !isUuid(normalized.driverId)) {
    return { valid: false, fields: [] };
  }

  if (!isLength(normalized.fullName, 1, 160)) {
    fields.push("fullName");
  }
  if (!isLength(normalized.nationality, 1, 80)) {
    fields.push("nationality");
  }
  if (!mobilePattern.test(normalized.mobileNumber)) {
    fields.push("mobileNumber");
  }
  if (!allowedVehicleTypes.has(normalized.vehicleType)) {
    fields.push("vehicleType");
  }
  if (!isLength(normalized.vehicleNumber, 1, 80)) {
    fields.push("vehicleNumber");
  }
  if (
    normalized.keetaVehiclePlateNumber &&
    normalized.keetaVehiclePlateNumber.length > 80
  ) {
    fields.push("keetaVehiclePlateNumber");
  }
  if (!isLength(normalized.vehicleSerialNumber, 1, 80)) {
    fields.push("vehicleSerialNumber");
  }
  if (!isLength(normalized.vehicleOwnerIdentifier, 1, 80)) {
    fields.push("vehicleOwnerIdentifier");
  }
  if (!isLength(normalized.vehicleBrand, 1, 120)) {
    fields.push("vehicleBrand");
  }
  if (!allowedSettlementTypes.has(normalized.settlementType)) {
    fields.push("settlementType");
  }
  if (!isLength(normalized.keetaUsername, 1, 120)) {
    fields.push("keetaUsername");
  }
  if (normalized.keetaDriverId && normalized.keetaDriverId.length > 120) {
    fields.push("keetaDriverId");
  }
  if (!isLength(normalized.iqamaNumber, 1, 40)) {
    fields.push("iqamaNumber");
  }
  if (!isValidDate(normalized.iqamaExpiryDate)) {
    fields.push("iqamaExpiryDate");
  }
  if (!isLength(normalized.drivingLicenseNumber, 1, 60)) {
    fields.push("drivingLicenseNumber");
  }
  if (!isValidDate(normalized.drivingLicenseExpiryDate)) {
    fields.push("drivingLicenseExpiryDate");
  }
  if (!isLength(normalized.driverCardNumber, 1, 60)) {
    fields.push("driverCardNumber");
  }
  if (!isValidDate(normalized.driverCardExpiryDate)) {
    fields.push("driverCardExpiryDate");
  }
  if (!isLength(normalized.vehicleAuthorizationNumber, 1, 80)) {
    fields.push("vehicleAuthorizationNumber");
  }
  if (!isValidDate(normalized.vehicleAuthorizationExpiryDate)) {
    fields.push("vehicleAuthorizationExpiryDate");
  }
  if (
    normalized.operatingCardNumber &&
    normalized.operatingCardNumber.length > 80
  ) {
    fields.push("operatingCardNumber");
  }
  if (
    normalized.operatingCardExpiryDate &&
    !isValidDate(normalized.operatingCardExpiryDate)
  ) {
    fields.push("operatingCardExpiryDate");
  }
  if (normalized.iban && !ibanPattern.test(normalized.iban)) {
    fields.push("iban");
  }
  if (normalized.bankName && normalized.bankName.length > 120) {
    fields.push("bankName");
  }
  if (normalized.accountNumber && normalized.accountNumber.length > 60) {
    fields.push("accountNumber");
  }

  if (fields.length > 0) {
    return { valid: false, fields };
  }

  return {
    valid: true,
    input: normalized,
  };
}

export function buildFieldErrors(
  fields: DriverFormFieldName[],
  getMessage: (field: DriverFormFieldName) => string,
): DriverFieldErrors {
  return Object.fromEntries(
    fields.map((field) => [field, getMessage(field)]),
  ) as DriverFieldErrors;
}

export function isDriverVehicleType(value: string): value is DriverVehicleType {
  return allowedVehicleTypes.has(value as DriverVehicleType);
}

export function isDriverSettlementType(
  value: string,
): value is DriverSettlementType {
  return allowedSettlementTypes.has(value as DriverSettlementType);
}

export function isDriverDocumentType(value: string): value is DriverDocumentType {
  return allowedDocumentTypes.has(value as DriverDocumentType);
}

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function normalizeIban(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeOptionalIban(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return normalizeIban(value);
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function normalizeMobile(value: string) {
  return value.trim().replace(/[()\-\s]/g, "");
}

function isValidDate(value: string) {
  const match = datePattern.exec(value);

  if (!match) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12
  ) {
    return false;
  }

  return day >= 1 && day <= getDaysInMonth(year, month);
}

function isLength(value: string, min: number, max: number) {
  return value.length >= min && value.length <= max;
}

function getDaysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}
