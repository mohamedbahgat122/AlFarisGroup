import type { Database } from "@/types/database";

export type FleetVehicleCategory = "car" | "motorcycle";
export type FleetOwnerSource = "organization" | "manual";
export type FleetPersonSource = "none" | "organization_driver" | "manual";
export type FleetOperationalStatus = "active" | "suspended";
export type FleetTechnicalStatus = "healthy" | "fault" | "accident";
export type FleetFaultLocation = "parked" | "in_maintenance";
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
  | "operating_card_changed";

export type FleetVehicleRow =
  Database["public"]["Tables"]["fleet_vehicles"]["Row"];
export type FleetActivityRow =
  Database["public"]["Tables"]["fleet_vehicle_activity_logs"]["Row"];

export type FleetDriverOption = {
  id: string;
  fullName: string;
  iqamaNumber: string;
};

export type FleetVehicle = {
  id: string;
  category: FleetVehicleCategory;
  vehicleType: string;
  plateNumber: string;
  normalizedPlateNumber: string;
  ownerSource: FleetOwnerSource;
  ownerName: string;
  manualOwnerName: string | null;
  operatingCardNumber: string | null;
  operatingCardExpiryDate: string | null;
  operatingCardFileName: string | null;
  operatingCardFilePath: string | null;
  operatingCardMimeType: string | null;
  assignedDriverSource: FleetPersonSource;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  assignedDriverIqama: string | null;
  assignedDriverManualName: string | null;
  assignedDriverManualIqama: string | null;
  authorizedPersonSource: FleetPersonSource;
  authorizedDriverId: string | null;
  authorizedPersonName: string | null;
  authorizedPersonIqama: string | null;
  authorizedManualName: string | null;
  authorizedManualIqama: string | null;
  authorizationExpiryDate: string | null;
  operationalStatus: FleetOperationalStatus;
  technicalStatus: FleetTechnicalStatus;
  faultLocation: FleetFaultLocation | null;
  technicalStatusNote: string | null;
  notes: string | null;
  archivedAt: string | null;
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
    }
  | {
      status: "unauthorized" | "load_error";
      vehicles: [];
      drivers: [];
    };

export type FleetMutationInput = {
  vehicleId?: string;
  vehicleCategory: FleetVehicleCategory;
  vehicleType: string;
  plateNumber: string;
  ownerSource: FleetOwnerSource;
  manualOwnerName: string | null;
  operatingCardNumber: string | null;
  operatingCardExpiryDate: string | null;
  assignedDriverSource: FleetPersonSource;
  assignedDriverId: string | null;
  assignedDriverManualName: string | null;
  assignedDriverManualIqama: string | null;
  authorizedPersonSource: FleetPersonSource;
  authorizedDriverId: string | null;
  authorizedManualName: string | null;
  authorizedManualIqama: string | null;
  authorizationExpiryDate: string | null;
  technicalStatus: FleetTechnicalStatus;
  faultLocation: FleetFaultLocation | null;
  technicalStatusNote: string | null;
  notes: string | null;
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
