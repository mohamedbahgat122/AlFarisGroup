"use server";

import { revalidatePath } from "next/cache";
import { getDictionary } from "@/i18n/dictionaries";
import {
  archiveDriverForOrganization,
  createDriverAppAccountForOrganization,
  createDriverForOrganization,
  getDriverActivityForOrganization,
  getEligibleDriverAppAccountsForOrganization,
  linkExistingDriverAppAccountForOrganization,
  resetDriverAppPasswordForOrganization,
  setDriverStatusForOrganization,
  updateDriverAppLoginIdentifierForOrganization,
  updateDriverForOrganization,
} from "@/features/drivers/service";
import {
  isValidDriverFile,
  isValidDriverImageFile,
} from "@/features/drivers/storage";
import {
  buildFieldErrors,
  isDriverSettlementType,
  isDriverVehicleType,
  isUuid,
  normalizeAndValidateDriverInput,
} from "@/features/drivers/validation";
import { normalizeIqamaLoginIdentifier } from "@/features/drivers/login-identifiers";
import type {
  DriverActionState,
  DriverLifecycleActionState,
} from "@/features/drivers/action-state";
import type {
  DriverActivityLog,
  DriverAccountActionState,
  DriverAppAccountOption,
  DriverFieldErrors,
  DriverFormFieldName,
  DriverFormValues,
  DriverMutationInput,
  DriverStatus,
} from "@/features/drivers/types";
import { isLocale } from "@/types/locale";

const maximumCombinedUploadSizeBytes = 50 * 1024 * 1024;

export async function createDriverAction(
  _previousState: DriverActionState,
  formData: FormData,
): Promise<DriverActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const vehicleType = getStringValue(formData, "vehicleType");
  const sponsorship = getStringValue(formData, "isCompanySponsored");
  const vehicleOwnership = getStringValue(formData, "isVehicleOwner");
  const settlementType = getStringValue(formData, "settlementType");
  const values = getDriverFormValues(formData);
  const selectedFiles = getSelectedDriverFiles(formData);

  if (!isLocale(locale)) {
    return getValidationErrorState("ar", values, {});
  }

  if (
    !organizationCode ||
    !isDriverVehicleType(vehicleType) ||
    !isBooleanString(sponsorship) ||
    !isBooleanString(vehicleOwnership) ||
    !isDriverSettlementType(settlementType)
  ) {
    return getValidationErrorState(locale, values, {
      vehicleType: getFieldErrorMessage(locale, "vehicleType"),
      isCompanySponsored: getFieldErrorMessage(locale, "isCompanySponsored"),
      isVehicleOwner: getFieldErrorMessage(locale, "isVehicleOwner"),
      settlementType: getFieldErrorMessage(locale, "settlementType"),
    });
  }

  const input = buildDriverInput({
    values,
    vehicleType,
    isCompanySponsored: sponsorship === "true",
    isVehicleOwner: vehicleOwnership === "true",
    settlementType,
  });
  const validation = normalizeAndValidateDriverInput({
    ...input,
    organizationId: "00000000-0000-4000-8000-000000000000",
  });

  if (!validation.valid) {
    return getValidationErrorState(
      locale,
      values,
      buildFieldErrors(validation.fields, (field) =>
        getFieldErrorMessage(locale, field),
      ),
    );
  }

  if (exceedsMaximumCombinedUploadSize(selectedFiles)) {
    return getCombinedUploadSizeErrorState(locale, values);
  }

  const fileErrors = getFileErrors({
    locale,
    iqamaFile: selectedFiles.iqamaFile,
    drivingLicenseFile: selectedFiles.drivingLicenseFile,
    driverCardFile: selectedFiles.driverCardFile,
    profilePhotoFile: selectedFiles.profilePhotoFile,
    operatingCardFile: selectedFiles.operatingCardFile,
    requireFiles: true,
    requireDrivingLicenseFile: true,
  });

  if (Object.keys(fileErrors).length > 0) {
    return getValidationErrorState(locale, values, fileErrors);
  }

  const result = await createDriverForOrganization({
    organizationCode,
    input,
    profilePhotoFile: selectedFiles.profilePhotoFile,
    iqamaFile: selectedFiles.iqamaFile,
    drivingLicenseFile: selectedFiles.drivingLicenseFile,
    driverCardFile: selectedFiles.driverCardFile,
    operatingCardFile: selectedFiles.operatingCardFile,
  });

  if (!result.success) {
    if (result.code === "duplicate_iqama") {
      return getValidationErrorState(locale, values, {
        iqamaNumber: getDuplicateIqamaMessage(locale),
      });
    }

    if (result.code === "duplicate_keeta_driver_id") {
      return getValidationErrorState(locale, values, {
        keetaDriverId: getDuplicateKeetaDriverIdMessage(locale),
      });
    }

    return { status: "error", code: result.code, values };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function updateDriverAction(
  _previousState: DriverActionState,
  formData: FormData,
): Promise<DriverActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");
  const vehicleType = getStringValue(formData, "vehicleType");
  const sponsorship = getStringValue(formData, "isCompanySponsored");
  const vehicleOwnership = getStringValue(formData, "isVehicleOwner");
  const settlementType = getStringValue(formData, "settlementType");
  const hasDrivingLicenseDocument =
    getStringValue(formData, "hasDrivingLicenseDocument") === "true";
  const values = getDriverFormValues(formData);
  const selectedFiles = getSelectedDriverFiles(formData);

  if (!isLocale(locale)) {
    logDriverUpdateActionStageFailure("validate_form_data", {
      driverIdExists: Boolean(driverId),
      organizationResolved: Boolean(organizationCode),
      code: "validation_error",
      message: "Invalid locale submitted.",
    });
    return getValidationErrorState("ar", values, {});
  }

  if (!organizationCode) {
    logDriverUpdateActionStageFailure("resolve_organization", {
      driverIdExists: Boolean(driverId),
      organizationResolved: false,
      code: "organization_unavailable",
      message: "Organization code was not submitted.",
    });
    return { status: "error", code: "organization_unavailable", values };
  }

  if (!isUuid(driverId)) {
    logDriverUpdateActionStageFailure("validate_form_data", {
      driverIdExists: Boolean(driverId),
      organizationResolved: true,
      code: "invalid_driver",
      message: "Invalid driver id submitted.",
    });
    return { status: "error", code: "invalid_driver", values };
  }

  if (
    !isDriverVehicleType(vehicleType) ||
    !isBooleanString(sponsorship) ||
    !isBooleanString(vehicleOwnership) ||
    !isDriverSettlementType(settlementType)
  ) {
    logDriverUpdateActionStageFailure("validate_form_data", {
      driverIdExists: true,
      organizationResolved: true,
      code: "validation_error",
      message: "Invalid select field submitted.",
    });
    return getValidationErrorState(locale, values, {
      vehicleType: getFieldErrorMessage(locale, "vehicleType"),
      isCompanySponsored: getFieldErrorMessage(locale, "isCompanySponsored"),
      isVehicleOwner: getFieldErrorMessage(locale, "isVehicleOwner"),
      settlementType: getFieldErrorMessage(locale, "settlementType"),
    });
  }

  const input = {
    ...buildDriverInput({
      values,
      vehicleType,
      isCompanySponsored: sponsorship === "true",
      isVehicleOwner: vehicleOwnership === "true",
      settlementType,
    }),
    driverId,
    organizationId: "00000000-0000-4000-8000-000000000000",
  };
  const validation = normalizeAndValidateDriverInput(input);

  if (!validation.valid) {
    logDriverUpdateActionStageFailure("validate_form_data", {
      driverIdExists: true,
      organizationResolved: true,
      code: "validation_error",
      message: "Driver update form validation failed.",
    });
    return getValidationErrorState(
      locale,
      values,
      buildFieldErrors(validation.fields, (field) =>
        getFieldErrorMessage(locale, field),
      ),
    );
  }

  if (exceedsMaximumCombinedUploadSize(selectedFiles)) {
    logDriverUpdateActionStageFailure("validate_form_data", {
      driverIdExists: true,
      organizationResolved: true,
      code: "document_invalid",
      message: "Combined selected upload size exceeded 50 MB.",
    });
    return getCombinedUploadSizeErrorState(locale, values);
  }

  const fileErrors = getFileErrors({
    locale,
    iqamaFile: selectedFiles.iqamaFile,
    drivingLicenseFile: selectedFiles.drivingLicenseFile,
    driverCardFile: selectedFiles.driverCardFile,
    profilePhotoFile: selectedFiles.profilePhotoFile,
    operatingCardFile: selectedFiles.operatingCardFile,
    requireFiles: false,
    requireDrivingLicenseFile: !hasDrivingLicenseDocument,
  });

  if (Object.keys(fileErrors).length > 0) {
    logDriverUpdateActionStageFailure(getFileValidationStage(fileErrors), {
      driverIdExists: true,
      organizationResolved: true,
      code: "document_invalid",
      message: "Driver update file validation failed.",
    });
    return getValidationErrorState(locale, values, fileErrors);
  }

  const result = await updateDriverForOrganization({
    organizationCode,
    input: validation.input,
    profilePhotoFile: selectedFiles.profilePhotoFile,
    removeProfilePhoto: getStringValue(formData, "removeProfilePhoto") === "true",
    iqamaFile: selectedFiles.iqamaFile,
    drivingLicenseFile: selectedFiles.drivingLicenseFile,
    driverCardFile: selectedFiles.driverCardFile,
    operatingCardFile: selectedFiles.operatingCardFile,
    removeOperatingCardFile:
      getStringValue(formData, "removeOperatingCardFile") === "true",
  });

  if (!result.success) {
    if (result.code === "duplicate_iqama") {
      return getValidationErrorState(locale, values, {
        iqamaNumber: getDuplicateIqamaMessage(locale),
      });
    }

    if (result.code === "duplicate_keeta_driver_id") {
      return getValidationErrorState(locale, values, {
        keetaDriverId: getDuplicateKeetaDriverIdMessage(locale),
      });
    }

    return { status: "error", code: result.code, values };
  }

  try {
    revalidateDriverDashboardPaths(locale, organizationCode);
  } catch (error) {
    logDriverUpdateActionStageFailure("revalidate_routes", {
      driverIdExists: true,
      organizationResolved: true,
      code: "revalidate_failed",
      message: error instanceof Error ? error.message : "Route revalidation failed.",
    });
  }

  return { status: "success", code: "success" };
}

export async function setDriverStatusAction(
  _previousState: DriverLifecycleActionState,
  formData: FormData,
): Promise<DriverLifecycleActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");
  const status = getStringValue(formData, "status");

  if (!isLocale(locale) || !organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  if (!isDriverStatus(status)) {
    return { status: "error", code: "validation_error" };
  }

  const result = await setDriverStatusForOrganization({
    organizationCode,
    driverId,
    status,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function archiveDriverAction(
  _previousState: DriverLifecycleActionState,
  formData: FormData,
): Promise<DriverLifecycleActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");

  if (!isLocale(locale) || !organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  const result = await archiveDriverForOrganization({
    organizationCode,
    driverId,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function createDriverAppAccountAction(
  _previousState: DriverAccountActionState,
  formData: FormData,
): Promise<DriverAccountActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");
  const iqamaNumber = getStringValue(formData, "iqamaNumber");
  const temporaryPassword = getStringValue(formData, "temporaryPassword");
  const confirmTemporaryPassword = getStringValue(formData, "confirmTemporaryPassword");
  const requirePasswordChange =
    getStringValue(formData, "requirePasswordChange") === "true";

  if (!isLocale(locale) || !organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  const fieldErrors = getPasswordFieldErrors(
    locale,
    temporaryPassword,
    confirmTemporaryPassword,
    iqamaNumber,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "validation_error",
      code: "validation_error",
      fieldErrors,
    };
  }

  const result = await createDriverAppAccountForOrganization({
    organizationCode,
    driverId,
    iqamaNumber,
    temporaryPassword,
    confirmTemporaryPassword,
    requirePasswordChange,
  });

  if (!result.success) {
    return {
      status: "error",
      code: result.code,
      diagnosticCode: result.diagnosticCode,
      failedStage: result.failedStage,
    };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function resetDriverAppPasswordAction(
  _previousState: DriverAccountActionState,
  formData: FormData,
): Promise<DriverAccountActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");
  const iqamaNumber = getStringValue(formData, "iqamaNumber");
  const temporaryPassword = getStringValue(formData, "temporaryPassword");
  const confirmTemporaryPassword = getStringValue(formData, "confirmTemporaryPassword");
  const requirePasswordChange =
    getStringValue(formData, "requirePasswordChange") === "true";

  if (!isLocale(locale) || !organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  const fieldErrors = getPasswordFieldErrors(
    locale,
    temporaryPassword,
    confirmTemporaryPassword,
    iqamaNumber,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "validation_error",
      code: "validation_error",
      fieldErrors,
    };
  }

  const result = await resetDriverAppPasswordForOrganization({
    organizationCode,
    driverId,
    iqamaNumber,
    temporaryPassword,
    confirmTemporaryPassword,
    requirePasswordChange,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function updateDriverAppLoginIdentifierAction(
  _previousState: DriverAccountActionState,
  formData: FormData,
): Promise<DriverAccountActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");
  const iqamaNumber = getStringValue(formData, "iqamaNumber");

  if (!isLocale(locale) || !organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  if (!normalizeIqamaLoginIdentifier(iqamaNumber)) {
    const dictionary = getDictionary(locale).dashboard.drivers;

    return {
      status: "validation_error",
      code: "validation_error",
      fieldErrors: {
        iqamaNumber: dictionary.appAccount.iqamaNumberError,
      },
    };
  }

  const result = await updateDriverAppLoginIdentifierForOrganization({
    organizationCode,
    driverId,
    iqamaNumber,
  });

  if (!result.success) {
    return {
      status: "error",
      code: result.code,
      diagnosticCode: result.diagnosticCode,
      failedStage: result.failedStage,
    };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function getEligibleDriverAppAccountsAction({
  organizationCode,
  search,
}: {
  organizationCode: string;
  search?: string;
}): Promise<
  | { status: "success"; accounts: DriverAppAccountOption[] }
  | { status: "error"; code: DriverAccountActionState["code"]; accounts: [] }
> {
  if (!organizationCode) {
    return { status: "error", code: "organization_unavailable", accounts: [] };
  }

  const result = await getEligibleDriverAppAccountsForOrganization({
    organizationCode,
    search,
  });

  if (!result.success) {
    return { status: "error", code: result.code, accounts: [] };
  }

  return { status: "success", accounts: result.accounts };
}

export async function linkExistingDriverAppAccountAction(
  _previousState: DriverAccountActionState,
  formData: FormData,
): Promise<DriverAccountActionState> {
  const locale = getStringValue(formData, "locale");
  const organizationCode = getStringValue(formData, "organizationCode");
  const driverId = getStringValue(formData, "driverId");
  const authUserId = getStringValue(formData, "authUserId");
  const iqamaNumber = getStringValue(formData, "iqamaNumber");
  const confirmed = getStringValue(formData, "confirmLink") === "true";

  if (!isLocale(locale) || !organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  if (iqamaNumber && !normalizeIqamaLoginIdentifier(iqamaNumber)) {
    const dictionary = getDictionary(locale).dashboard.drivers;

    return {
      status: "validation_error",
      code: "validation_error",
      fieldErrors: {
        iqamaNumber: dictionary.appAccount.iqamaNumberError,
      },
    };
  }

  if (!isUuid(authUserId) || !confirmed) {
    const dictionary = getDictionary(locale).dashboard.drivers;

    return {
      status: "validation_error",
      code: "validation_error",
      fieldErrors: {
        authUserId: !isUuid(authUserId)
          ? dictionary.appAccount.selectExistingAccountError
          : undefined,
        confirmation: !confirmed
          ? dictionary.appAccount.confirmLinkError
          : undefined,
      },
    };
  }

  const result = await linkExistingDriverAppAccountForOrganization({
    organizationCode,
    driverId,
    authUserId,
    iqamaNumber,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  revalidateDriverDashboardPaths(locale, organizationCode);

  return { status: "success", code: "success" };
}

export async function getDriverActivityLogsAction({
  organizationCode,
  driverId,
}: {
  organizationCode: string;
  driverId: string;
}): Promise<
  | { status: "success"; logs: DriverActivityLog[] }
  | { status: "error"; code: DriverLifecycleActionState["code"] }
> {
  if (!organizationCode || !isUuid(driverId)) {
    return { status: "error", code: "invalid_driver" };
  }

  const result = await getDriverActivityForOrganization({
    organizationCode,
    driverId,
  });

  if (!result.success) {
    return { status: "error", code: result.code };
  }

  return { status: "success", logs: result.logs };
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function revalidateDriverDashboardPaths(locale: string, organizationCode: string) {
  revalidatePath(`/${locale}/dashboard`, "layout");
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/drivers`);
  revalidatePath(`/${locale}/dashboard/fleet/cars`);
  revalidatePath(`/${locale}/dashboard/fleet/motorcycles`);
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/fleet/cars`);
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/fleet/motorcycles`);
}

function getFileValidationStage(
  fileErrors: DriverFieldErrors,
):
  | "validate_profile_photo"
  | "validate_operating_card_file"
  | "validate_form_data" {
  if (fileErrors.profilePhoto) {
    return "validate_profile_photo";
  }

  if (fileErrors.operatingCardFile) {
    return "validate_operating_card_file";
  }

  return "validate_form_data";
}

function logDriverUpdateActionStageFailure(
  stage:
    | "validate_form_data"
    | "resolve_organization"
    | "validate_profile_photo"
    | "validate_operating_card_file"
    | "revalidate_routes",
  {
    driverIdExists,
    organizationResolved,
    code,
    message,
    details,
    hint,
  }: {
    driverIdExists: boolean;
    organizationResolved: boolean;
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error("[drivers:update:stage_failed]", {
    stage,
    driverIdExists,
    organizationResolved,
    code,
    message,
    details,
    hint,
  });
}

function getFileValue(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

function getSelectedDriverFiles(formData: FormData) {
  return {
    profilePhotoFile: getFileValue(formData, "profilePhoto"),
    iqamaFile: getFileValue(formData, "iqamaDocument"),
    drivingLicenseFile: getFileValue(formData, "drivingLicenseDocument"),
    driverCardFile: getFileValue(formData, "driverCardDocument"),
    operatingCardFile: getFileValue(formData, "operatingCardFile"),
  };
}

function exceedsMaximumCombinedUploadSize(
  files: ReturnType<typeof getSelectedDriverFiles>,
) {
  const totalSize = Object.values(files).reduce(
    (total, file) => total + (file?.size ?? 0),
    0,
  );

  return totalSize > maximumCombinedUploadSizeBytes;
}

function isBooleanString(value: string) {
  return value === "true" || value === "false";
}

function isDriverStatus(value: string): value is DriverStatus {
  return value === "active" || value === "suspended";
}

function getDriverFormValues(formData: FormData): DriverFormValues {
  return {
    fullName: getStringValue(formData, "fullName"),
    nationality: getStringValue(formData, "nationality"),
    mobileNumber: getStringValue(formData, "mobileNumber"),
    nfcNumber: getStringValue(formData, "nfcNumber"),
    vehicleType: getStringValue(formData, "vehicleType"),
    vehicleId: getStringValue(formData, "vehicleId"),
    vehicleNumber: getStringValue(formData, "vehicleNumber"),
    keetaVehiclePlateNumber: getStringValue(
      formData,
      "keetaVehiclePlateNumber",
    ),
    vehicleSerialNumber: getStringValue(formData, "vehicleSerialNumber"),
    vehicleOwnerIdentifier: getStringValue(
      formData,
      "vehicleOwnerIdentifier",
    ),
    vehicleBrand: getStringValue(formData, "vehicleBrand"),
    keetaUsername: getStringValue(formData, "keetaUsername"),
    keetaDriverId: getStringValue(formData, "keetaDriverId"),
    isCompanySponsored: getStringValue(formData, "isCompanySponsored"),
    isVehicleOwner: getStringValue(formData, "isVehicleOwner"),
    settlementType: getStringValue(formData, "settlementType"),
    iqamaNumber: getStringValue(formData, "iqamaNumber"),
    iqamaExpiryDate: getStringValue(formData, "iqamaExpiryDate"),
    drivingLicenseNumber: getStringValue(formData, "drivingLicenseNumber"),
    drivingLicenseExpiryDate: getStringValue(
      formData,
      "drivingLicenseExpiryDate",
    ),
    driverCardNumber: getStringValue(formData, "driverCardNumber"),
    driverCardExpiryDate: getStringValue(formData, "driverCardExpiryDate"),
    vehicleAuthorizationNumber: getStringValue(
      formData,
      "vehicleAuthorizationNumber",
    ),
    vehicleAuthorizationExpiryDate: getStringValue(
      formData,
      "vehicleAuthorizationExpiryDate",
    ),
    operatingCardNumber: getStringValue(formData, "operatingCardNumber"),
    operatingCardExpiryDate: getStringValue(
      formData,
      "operatingCardExpiryDate",
    ),
    iban: getStringValue(formData, "iban"),
    bankName: getStringValue(formData, "bankName"),
    accountNumber: getStringValue(formData, "accountNumber"),
  };
}

function buildDriverInput({
  values,
  vehicleType,
  isCompanySponsored,
  isVehicleOwner,
  settlementType,
}: {
  values: DriverFormValues;
  vehicleType: DriverMutationInput["vehicleType"];
  isCompanySponsored: boolean;
  isVehicleOwner: boolean;
  settlementType: DriverMutationInput["settlementType"];
}): Omit<DriverMutationInput, "organizationId"> {
  return {
    fullName: values.fullName ?? "",
    nationality: values.nationality ?? "",
    mobileNumber: values.mobileNumber ?? "",
    nfcNumber: values.nfcNumber ?? "",
    vehicleType,
    vehicleId: values.vehicleId,
    vehicleNumber: values.vehicleNumber ?? "",
    keetaVehiclePlateNumber: values.keetaVehiclePlateNumber ?? "",
    vehicleSerialNumber: values.vehicleSerialNumber ?? "",
    vehicleOwnerIdentifier: values.vehicleOwnerIdentifier ?? "",
    vehicleBrand: values.vehicleBrand ?? "",
    keetaUsername: values.keetaUsername ?? "",
    keetaDriverId: values.keetaDriverId ?? "",
    isCompanySponsored,
    isVehicleOwner,
    settlementType,
    iqamaNumber: values.iqamaNumber ?? "",
    iqamaExpiryDate: values.iqamaExpiryDate ?? "",
    drivingLicenseNumber: values.drivingLicenseNumber ?? "",
    drivingLicenseExpiryDate: values.drivingLicenseExpiryDate ?? "",
    driverCardNumber: values.driverCardNumber ?? "",
    driverCardExpiryDate: values.driverCardExpiryDate ?? "",
    vehicleAuthorizationNumber: values.vehicleAuthorizationNumber ?? "",
    vehicleAuthorizationExpiryDate: values.vehicleAuthorizationExpiryDate ?? "",
    operatingCardNumber: values.operatingCardNumber ?? "",
    operatingCardExpiryDate: values.operatingCardExpiryDate ?? "",
    iban: values.iban ?? "",
    bankName: values.bankName ?? "",
    accountNumber: values.accountNumber ?? "",
  };
}

function getFileErrors({
  locale,
  iqamaFile,
  drivingLicenseFile,
  driverCardFile,
  profilePhotoFile,
  operatingCardFile,
  requireFiles,
  requireDrivingLicenseFile,
}: {
  locale: Parameters<typeof getFieldErrorMessage>[0];
  iqamaFile: File | null;
  drivingLicenseFile: File | null;
  driverCardFile: File | null;
  profilePhotoFile: File | null;
  operatingCardFile: File | null;
  requireFiles: boolean;
  requireDrivingLicenseFile: boolean;
}): DriverFieldErrors {
  const errors: DriverFieldErrors = {};

  if (requireFiles && !iqamaFile) {
    errors.iqamaDocument = getFieldErrorMessage(locale, "iqamaDocument");
  } else if (iqamaFile && !isValidDriverFile(iqamaFile)) {
    errors.iqamaDocument = getFileInvalidMessage(locale);
  }

  if (requireDrivingLicenseFile && !drivingLicenseFile) {
    errors.drivingLicenseDocument = getFieldErrorMessage(
      locale,
      "drivingLicenseDocument",
    );
  } else if (drivingLicenseFile && !isValidDriverFile(drivingLicenseFile)) {
    errors.drivingLicenseDocument = getFileInvalidMessage(locale);
  }

  if (requireFiles && !driverCardFile) {
    errors.driverCardDocument = getFieldErrorMessage(
      locale,
      "driverCardDocument",
    );
  } else if (driverCardFile && !isValidDriverFile(driverCardFile)) {
    errors.driverCardDocument = getFileInvalidMessage(locale);
  }

  if (profilePhotoFile && !isValidDriverImageFile(profilePhotoFile)) {
    errors.profilePhoto = getFileInvalidMessage(locale);
  }

  if (operatingCardFile && !isValidDriverFile(operatingCardFile)) {
    errors.operatingCardFile = getFileInvalidMessage(locale);
  }

  return errors;
}

function getValidationErrorState(
  locale: Parameters<typeof getDictionary>[0],
  values: DriverFormValues,
  fieldErrors: DriverFieldErrors,
): DriverActionState {
  const dictionary = getDictionary(locale).dashboard.drivers;

  return {
    status: "validation_error",
    code: "validation_error",
    message: dictionary.validationSummary,
    fieldErrors,
    values,
  };
}

function getCombinedUploadSizeErrorState(
  locale: Parameters<typeof getDictionary>[0],
  values: DriverFormValues,
): DriverActionState {
  const dictionary = getDictionary(locale).dashboard.drivers;

  return {
    status: "validation_error",
    code: "validation_error",
    message: dictionary.combinedUploadTooLarge,
    fieldErrors: {},
    values,
  };
}

function getPasswordFieldErrors(
  locale: Parameters<typeof getDictionary>[0],
  temporaryPassword: string,
  confirmTemporaryPassword: string,
  iqamaNumber?: string,
): NonNullable<DriverAccountActionState["fieldErrors"]> {
  const dictionary = getDictionary(locale).dashboard.drivers;
  const errors: NonNullable<DriverAccountActionState["fieldErrors"]> = {};

  if (temporaryPassword.length < 8 || temporaryPassword.length > 128) {
    errors.password = dictionary.appAccount.passwordLengthError;
  }

  if (temporaryPassword !== confirmTemporaryPassword) {
    errors.confirmPassword = dictionary.appAccount.passwordMismatchError;
  }

  if (iqamaNumber && !normalizeIqamaLoginIdentifier(iqamaNumber)) {
    errors.iqamaNumber = dictionary.appAccount.iqamaNumberError;
  }

  return errors;
}

function getFieldErrorMessage(
  locale: Parameters<typeof getDictionary>[0],
  field: DriverFormFieldName,
) {
  const dictionary = getDictionary(locale).dashboard.drivers;

  switch (field) {
    case "iban":
      return dictionary.fieldErrors.iban;
    case "mobileNumber":
      return dictionary.fieldErrors.mobileNumber;
    case "vehicleNumber":
      return dictionary.fieldErrors.vehicleNumber;
    case "keetaVehiclePlateNumber":
      return dictionary.fieldErrors.keetaVehiclePlateNumber;
    case "vehicleSerialNumber":
      return dictionary.fieldErrors.vehicleSerialNumber;
    case "vehicleOwnerIdentifier":
      return dictionary.fieldErrors.vehicleOwnerIdentifier;
    case "vehicleBrand":
      return dictionary.fieldErrors.vehicleBrand;
    case "iqamaExpiryDate":
      return dictionary.fieldErrors.iqamaExpiryDate;
    case "drivingLicenseExpiryDate":
      return dictionary.fieldErrors.drivingLicenseExpiryDate;
    case "drivingLicenseDocument":
      return dictionary.fieldErrors.drivingLicenseDocument;
    case "driverCardExpiryDate":
      return dictionary.fieldErrors.driverCardExpiryDate;
    case "vehicleAuthorizationExpiryDate":
      return dictionary.fieldErrors.vehicleAuthorizationExpiryDate;
    case "operatingCardNumber":
      return dictionary.fieldErrors.operatingCardNumber;
    case "operatingCardExpiryDate":
      return dictionary.fieldErrors.operatingCardExpiryDate;
    case "iqamaDocument":
      return dictionary.fieldErrors.iqamaDocument;
    case "driverCardDocument":
      return dictionary.fieldErrors.driverCardDocument;
    case "profilePhoto":
      return dictionary.fieldErrors.profilePhoto;
    case "operatingCardFile":
      return dictionary.fieldErrors.operatingCardFile;
    case "vehicleType":
      return dictionary.fieldErrors.vehicleType;
    case "isCompanySponsored":
      return dictionary.fieldErrors.isCompanySponsored;
    case "isVehicleOwner":
      return dictionary.fieldErrors.isVehicleOwner;
    case "settlementType":
      return dictionary.fieldErrors.settlementType;
    default:
      return dictionary.fieldErrors.required;
  }
}

function getFileInvalidMessage(locale: Parameters<typeof getDictionary>[0]) {
  return getDictionary(locale).dashboard.drivers.fieldErrors.documentInvalid;
}

function getDuplicateIqamaMessage(locale: Parameters<typeof getDictionary>[0]) {
  return getDictionary(locale).dashboard.drivers.duplicateIqama;
}

function getDuplicateKeetaDriverIdMessage(
  locale: Parameters<typeof getDictionary>[0],
) {
  return getDictionary(locale).dashboard.drivers.duplicateKeetaDriverId;
}
