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
  detail: Record<string, string | number | null>;
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
};

export type OdometerShiftRow = {
  id: string;
  driverName: string;
  driverIdentifier: string | null;
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
  endedAt: string | null;
  endReading: number | null;
  endPhotoUrl: string | null;
  endPhotoPathPresent: boolean;
  endPhotoCapturedAt: string | null;
  endReviewStatus: OdometerReviewStatus | null;
  endReviewerName: string | null;
  endReviewedAt: string | null;
  endReviewNote: string | null;
  distance: number | null;
};

export type AppRequestActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: string;
};
