import type { MaintenanceJobMaterial } from "@/features/maintenance-materials/types";
import type { Dictionary } from "@/i18n/dictionaries";

export type DriverAppRequestType =
  | "leave"
  | "maintenance"
  | "meeting"
  | "oil_change";

export type DriverAppRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type AppRequestsDictionary = Dictionary["dashboard"]["appRequests"];

export type OdometerReviewStatus = "pending_review" | "approved" | "rejected";
export type OdometerReviewPhase = "start" | "end";

export type AppRequestRow = {
  id: string;
  requestType: DriverAppRequestType;
  status: DriverAppRequestStatus;
  submittedAt: string;
  submittedNote: string | null;
  driverName: string;
  driverIdentifier: string | null;
  organizationName: string | null;
  vehicleLabel: string | null;
  vehiclePlate: string | null;
  reviewerName: string | null;
  requestedManagerName: string | null;
  requestedManagerJobTitle: string | null;
  requestedManagerStatus: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  maintenanceJob: MaintenanceJobExecution | null;
  detail: Record<string, string | number | null>;
};

export type MaintenanceJobExecution = {
  id: string;
  jobType: "maintenance" | "oil_change";
  status: "ready" | "in_progress" | "completed" | "cancelled";
  providerId: string;
  providerName: string | null;
  providerCode: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  invoiceFileName: string | null;
  invoiceFilePath: string | null;
  invoiceMimeType: string | null;
  invoiceUploadedAt: string | null;
  materials: MaintenanceJobMaterial[];
};

export type MaintenanceProviderOption = {
  id: string;
  name: string;
  code: string;
};

export type AppRequestSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  today: number;
  activeToday: number;
};

export type OdometerSummary = {
  total: number;
  notStarted: number;
  startedOnly: number;
  completed: number;
  selectedDateDistanceKm: number;
  alertRows: number;
};

export type OdometerAlert = {
  code: string;
  message: string;
  severity: "critical" | "warning";
  meta?: any;
};

export type OilMaintenanceStatus =
  | "ok"
  | "due_soon"
  | "due"
  | "incomplete"
  | "no_vehicle";

export type OilMaintenanceTrackingRow = {
  driverId: string;
  driverName: string;
  driverIdentifier: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  vehiclePlate: string | null;
  lastOilChangeOdometer: number | null;
  oilIntervalKm: number | null;
  nextOilChangeAt: number | null;
  latestOdometer: number | null;
  drivenSinceOilChange: number | null;
  remainingKm: number | null;
  totalDistanceKm: number | null;
  oilStatus: OilMaintenanceStatus;
  latestRequest: AppRequestRow | null;
};

export type OilMaintenanceAlertStatus = "due_soon" | "due";

export type OilMaintenanceAlert = {
  id: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  driverId: string;
  driverName: string;
  driverIdentifier: string | null;
  vehicleId: string;
  vehicleLabel: string | null;
  vehiclePlate: string | null;
  remainingKm: number;
  oilStatus: OilMaintenanceAlertStatus;
  href: string;
};

export type OilMaintenanceAlertsResult =
  | {
      status: "success";
      alerts: OilMaintenanceAlert[];
      totalCount: number;
      dueCount: number;
      dueSoonCount: number;
      hasDue: boolean;
      hasDueSoon: boolean;
    }
  | {
      status: "unauthorized" | "load_error";
      alerts: [];
      totalCount: 0;
      dueCount: 0;
      dueSoonCount: 0;
      hasDue: false;
      hasDueSoon: false;
    };

export type OdometerShiftRow = {
  id: string;
  driverId: string;
  driverName: string;
  driverIdentifier: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  vehiclePlate: string | null;
  status: "not_started" | "open" | "completed" | "cancelled";
  shiftDate: string;
  startedAt: string | null;
  startReading: number | null;
  startPhotoUrl: string | null;
  startPhotoPathPresent: boolean;
  startPhotoCapturedAt: string | null;
  organizationName: string | null;
  startReviewStatus: OdometerReviewStatus | null;
  startReviewerName: string | null;
  startReviewedAt: string | null;
  startReviewNote: string | null;
  startOcrReading: string | null;
  startOcrStatus: string | null;
  endedAt: string | null;
  endReading: number | null;
  endPhotoUrl: string | null;
  endPhotoPathPresent: boolean;
  endPhotoCapturedAt: string | null;
  endReviewStatus: OdometerReviewStatus | null;
  endReviewerName: string | null;
  endReviewedAt: string | null;
  endReviewNote: string | null;
  endOcrReading: string | null;
  endOcrStatus: string | null;
  distance: number | null;
  totalDistanceKm: number | null;
  dailyDistanceKm: number | null;
  expectedPreviousReading: number | null;
  vehicleBaselineReading: number | null;
  vehicleBaselineResetAt: string | null;
  vehicleBaselineReason: string | null;
  alerts: OdometerAlert[];
};

export type AppRequestActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: string;
};
