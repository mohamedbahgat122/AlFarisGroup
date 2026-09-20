import type { Database } from "@/types/database";

export type FleetVehicleCategory = "car" | "motorcycle";
export type FleetOwnerSource = "organization" | "manual";
export type FleetOwnershipType =
  | "company_owned"
  | "rental"
  | "external_office"
  | "individual"
  | "driver_owned"
  | "other";
export type FleetPersonSource = "none" | "organization_driver" | "manual";
export type FleetOperationalStatus = "active" | "suspended";
export type FleetTechnicalStatus = "healthy" | "fault" | "accident";
export type FleetFaultLocation = "parked" | "in_maintenance";
export type FleetBaselinePhotoSlot = "front" | "rear" | "right" | "left";
export type FleetArchiveFilter = "active" | "archived" | "all";
export type FleetActivityAction =
  | "vehicle_created"
  | "vehicle_updated"
  | "vehicle_suspended"
  | "vehicle_reactivated"
  | "vehicle_archived"
  | "vehicle_restored"
  | "assigned_driver_changed"
  | "authorized_person_changed"
  | "technical_status_changed"
  | "operating_card_changed"
  | "registration_file_changed";

export type FleetVehicleRow =
  Database["public"]["Tables"]["fleet_vehicles"]["Row"];
export type FleetActivityRow =
  Database["public"]["Tables"]["fleet_vehicle_activity_logs"]["Row"];

export type FleetDriverOption = {
  id: string;
  fullName: string;
  keetaDriverId?: string | null;
  iqamaNumber: string;
  mobileNumber?: string;
  organizationId?: string;
  organizationName?: string;
  organizationCode?: string;
};

export type FleetLinkedDriver = FleetDriverOption;

export type FleetBaselinePhotoUrls = Record<FleetBaselinePhotoSlot, string | null>;

export type FleetVehicle = {
  id: string;
  category: FleetVehicleCategory;
  vehicleType: string;
  plateNumber: string;
  normalizedPlateNumber: string;
  serialNumber: string | null;
  brand: string | null;
  ownerSource: FleetOwnerSource;
  ownerName: string;
  manualOwnerName: string | null;
  ownershipType: FleetOwnershipType | null;
  currentOwnerName: string | null;
  ownerDriverId: string | null;
  ownerDriverName: string | null;
  ownerDriverIqama: string | null;
  ownerDriverMobile: string | null;
  ownerContactPhone: string | null;
  ownerIdentifier: string | null;
  rentalStartDate: string | null;
  rentalEndDate: string | null;
  rentalMonthlyCost: number | null;
  ownershipContractNumber: string | null;
  ownershipNotes: string | null;
  operatingCardNumber: string | null;
  operatingCardExpiryDate: string | null;
  operatingCardFileName: string | null;
  operatingCardFilePath: string | null;
  operatingCardMimeType: string | null;
  registrationFileName: string | null;
  registrationFilePath: string | null;
  registrationMimeType: string | null;
  assignedDriverSource: FleetPersonSource;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  assignedDriverIqama: string | null;
  linkedDrivers: FleetLinkedDriver[];
  assignedDriverManualName: string | null;
  assignedDriverManualIqama: string | null;
  authorizedPersonSource: FleetPersonSource;
  authorizedDriverId: string | null;
  authorizedPersonName: string | null;
  authorizedPersonIqama: string | null;
  authorizedManualName: string | null;
  authorizedManualIqama: string | null;
  authorizationNumber: string | null;
  authorizationExpiryDate: string | null;
  operationalStatus: FleetOperationalStatus;
  technicalStatus: FleetTechnicalStatus;
  faultLocation: FleetFaultLocation | null;
  technicalStatusNote: string | null;
  notes: string | null;
  archivedAt: string | null;
  assignedOrganizationId: string | null;
};

export type FleetListFilters = {
  page: number;
  pageSize: number;
  search: string;
  driver: string;
  authorization: "all" | "authorized" | "missing";
  linkedDriver: "all" | "linked" | "missing";
  technicalStatus: FleetTechnicalStatus | "all";
  operationalStatus: FleetOperationalStatus | "all";
  assignedOrganizationId: string;
  vehicleType: string;
  ownershipType: FleetOwnershipType | "all";
  archive: FleetArchiveFilter;
};

export type FleetSummaryCounts = {
  total: number;
  healthy: number;
  accident: number;
  maintenance: number;
  operationalActive: number;
  operationalSuspended: number;
  archived: number;
};

export type FleetActivityLog = {
  id: string;
  action: FleetActivityAction;
  actorName: string;
  oldValues: unknown;
  newValues: unknown;
  note: string | null;
  createdAt: string;
};

export type FleetPageData =
  | {
      status: "success";
      vehicles: FleetVehicle[];
      drivers: FleetDriverOption[];
      summary: FleetSummaryCounts;
      pagination: {
        page: number;
        pageSize: number;
        totalRows: number;
        totalPages: number;
      };
    }
  | {
      status: "unauthorized" | "load_error";
      vehicles: [];
      drivers: [];
      summary: FleetSummaryCounts;
      pagination?: undefined;
    };

export type FleetMutationInput = {
  vehicleId?: string;
  vehicleCategory: FleetVehicleCategory;
  vehicleType: string;
  plateNumber: string;
  serialNumber: string | null;
  brand: string | null;
  ownerSource: FleetOwnerSource;
  manualOwnerName: string | null;
  ownershipType: FleetOwnershipType | null;
  ownerName: string | null;
  ownerDriverId: string | null;
  ownerContactPhone: string | null;
  ownerIdentifier: string | null;
  rentalStartDate: string | null;
  rentalEndDate: string | null;
  rentalMonthlyCost: number | null;
  ownershipContractNumber: string | null;
  ownershipNotes: string | null;
  operatingCardNumber: string | null;
  operatingCardExpiryDate: string | null;
  assignedDriverSource: FleetPersonSource;
  assignedDriverIds?: string[];
  assignedDriverId: string | null;
  assignedDriverManualName: string | null;
  assignedDriverManualIqama: string | null;
  authorizedPersonSource: FleetPersonSource;
  authorizedDriverId: string | null;
  authorizedManualName: string | null;
  authorizedManualIqama: string | null;
  authorizationNumber: string | null;
  authorizationExpiryDate: string | null;
  technicalStatus: FleetTechnicalStatus;
  faultLocation: FleetFaultLocation | null;
  technicalStatusNote: string | null;
  notes: string | null;
  assignedOrganizationId?: string | null;
};

export type FleetMutationCode =
  | "success"
  | "validation_error"
  | "organization_unavailable"
  | "unauthorized"
  | "invalid_vehicle"
  | "duplicate_plate"
  | "document_invalid"
  | "upload_failed"
  | "save_failed"
  | "configuration_error";

export type FleetFieldErrors = Partial<Record<string, string>>;

export type FleetActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: FleetMutationCode;
  message?: string;
  fieldErrors?: FleetFieldErrors;
};

export const initialFleetActionState: FleetActionState = {
  status: "idle",
};
