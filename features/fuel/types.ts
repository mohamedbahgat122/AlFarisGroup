export type FuelManagementRow = {
  driverId: string;
  driverName: string;
  driverIdentifier: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  vehiclePlate: string | null;
  fuelDate: string;
  openingAmountSar: number;
  openingCreatedAt: string | null;
  approvedIncreaseAmountSar: number;
  increaseCount: number;
  dailyTotalSar: number;
  pendingRequest: FuelPendingRequest | null;
};

export type FuelPendingRequest = {
  id: string;
  requestedAmountSar: number;
  reason: string;
  createdAt: string;
};

export type FuelReportRow = {
  key: string;
  driverId: string;
  driverName: string;
  driverIdentifier: string | null;
  vehicleLabel: string | null;
  vehiclePlate: string | null;
  hasMultipleVehicles: boolean;
  activeFuelDays: number;
  totalOpeningAmountSar: number;
  totalApprovedIncreaseAmountSar: number;
  increaseCount: number;
  pendingRequestCount: number;
  rejectedRequestCount: number;
  periodTotalSar: number;
};

export type FuelReportDetailActor = {
  displayName: string | null;
  role: string | null;
  jobTitle: string | null;
};

export type FuelReportDetailItem = {
  id: string;
  type:
    | "opening"
    | "manual_increase"
    | "requested_increase_submitted"
    | "requested_increase_approved"
    | "requested_increase_rejected"
    | "requested_increase_pending";
  amountSar: number | null;
  requestedAmountSar: number | null;
  approvedAmountSar: number | null;
  reason: string | null;
  note: string | null;
  source: "transaction" | "request";
  occurredAt: string;
  actor: FuelReportDetailActor | null;
};

export type FuelReportDetails = {
  organizationId: string;
  driverId: string;
  fromDate: string;
  toDate: string;
  days: FuelReportDetailDay[];
};

export type FuelReportDetailDay = {
  fuelDate: string;
  vehiclePlate: string | null;
  openingAmountSar: number;
  approvedIncreaseAmountSar: number;
  dailyTotalSar: number;
  items: FuelReportDetailItem[];
};

export type FuelActionState = {
  status: "idle" | "success" | "error" | "validation_error";
  code?: string;
  message?: string;
};
