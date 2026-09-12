import type { Database } from "@/types/database";

export type DriverVehicleType =
  Database["public"]["Enums"]["driver_vehicle_type"];
export type DriverDocumentType =
  Database["public"]["Enums"]["driver_document_type"];
export type DriverSettlementType =
  Database["public"]["Enums"]["driver_settlement_type"];
export type DriverStatus = Database["public"]["Enums"]["driver_status"];

export type DriverDocumentMetadata = {
  documentType: DriverDocumentType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  signedUrl: string | null;
  preview: DriverFilePreview | null;
};

export type DriverFilePreview = {
  fileName: string;
  mimeType: string | null;
  previewUrl: string;
  downloadUrl: string;
  isImage: boolean;
  isPdf: boolean;
};

export type DriverListItem = {
  id: string;
  fullName: string;
  nationality: string;
  mobileNumber: string;
  nfcNumber: string | null;
  vehicleType: DriverVehicleType;
  vehicleId: string | null;
  vehicleNumber: string;
  keetaVehiclePlateNumber: string | null;
  organizationName: string;
  status: DriverStatus;
  keetaUsername: string;
  keetaDriverId: string | null;
  appAccount: DriverAppAccount;
  isCompanySponsored: boolean;
  isVehicleOwner: boolean | null;
  settlementType: DriverSettlementType | null;
  iqamaNumber: string;
  iqamaExpiryDate: string;
  drivingLicenseNumber: string | null;
  drivingLicenseExpiryDate: string | null;
  driverCardNumber: string;
  driverCardExpiryDate: string;
  vehicleAuthorizationExpiryDate: string;
  operatingCardExpiryDate: string | null;
  iban: string | null;
  bankName: string | null;
  accountNumber: string | null;
  profilePhotoUrl: string | null;
  profilePhotoPreview: DriverFilePreview | null;
  documents: DriverDocumentMetadata[];
  createdBy: DriverActor | null;
  updatedBy: DriverActor | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DriverAppAccountStatus =
  | "not_linked"
  | "active"
  | "suspended"
  | "password_change_required";

export type DriverAppAccount = {
  authUserId: string | null;
  status: DriverAppAccountStatus;
};

export type DriverAppAccountOption = {
  id: string;
  fullName: string;
  email: string;
  status: "active" | "suspended";
  mustChangePassword: boolean;
};

export type DriverActor = {
  id: string;
  fullName: string;
};

export type DriverActivityLog = {
  id: string;
  action:
    | "driver_created"
    | "driver_updated"
    | "driver_suspended"
    | "driver_reactivated"
    | "driver_archived"
    | "driver_restored"
    | string;
  actor: DriverActor | null;
  createdAt: string;
  summary: {
    previousStatus?: DriverStatus;
    newStatus?: DriverStatus;
    replacedDocumentCount?: number;
  };
};

export type DriverSummary = {
  total: number;
  active: number;
  inactive: number;
  archived: number;
  expiringSoon: number;
  expired: number;
};

export type DriversQueryResult =
  | {
      status: "success";
      drivers: DriverListItem[];
      pagination: {
        page: number;
        pageSize: number;
        totalRows: number;
        totalPages: number;
      };
      summary: DriverSummary;
    }
  | {
      status: "unauthorized" | "load_error";
      drivers: [];
    };

export type DriverDocumentUploadMetadata = {
  document_type: DriverDocumentType;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
};

export type DriverMutationInput = {
  driverId?: string;
  organizationId: string;
  fullName: string;
  nationality: string;
  mobileNumber: string;
  nfcNumber: string;
  vehicleType: DriverVehicleType;
  vehicleId?: string;
  vehicleNumber: string;
  keetaVehiclePlateNumber: string;
  keetaUsername: string;
  keetaDriverId: string;
  isCompanySponsored: boolean;
  isVehicleOwner: boolean;
  settlementType: DriverSettlementType;
  iqamaNumber: string;
  iqamaExpiryDate: string;
  drivingLicenseNumber: string;
  drivingLicenseExpiryDate: string;
  driverCardNumber: string;
  driverCardExpiryDate: string;
  iban: string | null;
  bankName: string | null;
  accountNumber: string | null;
};

export type DriverFormFieldName =
  | "fullName"
  | "nationality"
  | "mobileNumber"
  | "nfcNumber"
  | "vehicleType"
  | "vehicleId"
  | "vehicleNumber"
  | "keetaVehiclePlateNumber"
  | "keetaUsername"
  | "keetaDriverId"
  | "isCompanySponsored"
  | "isVehicleOwner"
  | "settlementType"
  | "iqamaNumber"
  | "iqamaExpiryDate"
  | "iqamaDocument"
  | "drivingLicenseNumber"
  | "drivingLicenseExpiryDate"
  | "drivingLicenseDocument"
  | "driverCardNumber"
  | "driverCardExpiryDate"
  | "driverCardDocument"
  | "profilePhoto"
  | "iban"
  | "bankName"
  | "accountNumber";

export type DriverFormValues = Partial<Record<DriverFormFieldName, string>>;

export type DriverFieldErrors = Partial<Record<DriverFormFieldName, string>>;

export type DriverMutationErrorCode =
  | "validation_error"
  | "unauthorized"
  | "organization_unavailable"
  | "invalid_driver"
  | "driver_wrong_organization"
  | "already_archived"
  | "not_archived"
  | "duplicate_iqama"
  | "duplicate_keeta_driver_id"
  | "upload_failed"
  | "document_invalid"
  | "create_failed"
  | "update_failed"
  | "configuration_error";

export type DriverAccountActionState = {
  status: "idle" | "validation_error" | "success" | "error";
  code?: DriverAccountErrorCode | "success";
  diagnosticCode?: DriverAccountDiagnosticCode;
  failedStage?: DriverAccountStage;
  fieldErrors?: {
    password?: string;
    confirmPassword?: string;
    authUserId?: string;
    confirmation?: string;
    iqamaNumber?: string;
  };
};

export type DriverAccountStage =
  | "validate-input"
  | "load-driver"
  | "validate-driver-id"
  | "check-existing-link"
  | "build-internal-email"
  | "create-auth-user"
  | "upsert-profile"
  | "link-driver"
  | "sync-profile-organization"
  | "create-audit-log"
  | "compensate-auth-user";

export type DriverAccountDiagnosticCode =
  | "AUTH_CREATE_FAILED"
  | "PROFILE_LINK_FAILED"
  | "DRIVER_LINK_FAILED"
  | "AUDIT_LOG_FAILED"
  | "DUPLICATE_DRIVER_ID"
  | "ACCOUNT_ALREADY_EXISTS"
  | "ORPHAN_AUTH_ACCOUNT"
  | "MIGRATION_NOT_APPLIED"
  | "PERMISSION_DENIED";

export type DriverAccountErrorCode =
  | "validation_error"
  | "unauthorized"
  | "organization_unavailable"
  | "invalid_driver"
  | "driver_wrong_organization"
  | "missing_driver_login_id"
  | "duplicate_driver_login_id"
  | "driver_account_already_linked"
  | "driver_account_not_linked"
  | "existing_account_unavailable"
  | "existing_account_wrong_organization"
  | "existing_account_already_linked"
  | "link_failed"
  | "orphan_auth_account"
  | "internal_identity_collision"
  | "profile_link_failed"
  | "driver_link_failed"
  | "audit_log_failed"
  | "create_failed"
  | "reset_failed"
  | "status_update_failed"
  | "configuration_error";

export type DriverMutationResult =
  | {
      success: true;
      driverId: string;
    }
  | {
      success: false;
      code: DriverMutationErrorCode;
    };
