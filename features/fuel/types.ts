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

export type KafaratplusIntegrationStatus =
  | "success"
  | "not_configured"
  | "missing_credentials"
  | "unauthorized"
  | "bad_request"
  | "timeout"
  | "network_error"
  | "malformed_response"
  | "api_error"
  | "load_error";

export type KafaratplusFuelManagementRow = {
  key: string;
  localDriver: string | null;
  localDriverId: string | null;
  localDriverIqama: string | null;
  kafaratplusDriver: string | null;
  vehicle: string | null;
  licencePlate: string | null;
  branch: string | null;
  brandModel: string | null;
  operationCount: number;
  totalQuantity: number;
  total: number;
  fuelProducts: string[];
  latestOdometer: string | null;
  latestProvider: string | null;
  nfcIdentifier: string | null;
  operations: KafaratplusFuelOperationRow[];
};

export type KafaratplusFuelManagementResult =
  | {
      status: "success";
      source: "kafaratplus";
      diagnostics: KafaratplusMatchDiagnostics;
      rows: KafaratplusFuelManagementRow[];
    }
  | {
      status: Exclude<KafaratplusIntegrationStatus, "success">;
      source: "kafaratplus";
      diagnostics?: KafaratplusMatchDiagnostics;
      rows: [];
      message: string;
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

export type KafaratplusFuelOperationRow = {
  key: string;
  operationNumber: string | null;
  date: string | null;
  driver: string | null;
  localDriverId: string | null;
  localDriverIqama: string | null;
  kafaratplusDriver: string | null;
  vehicle: string | null;
  nfcIdentifier: string | null;
  licencePlate: string | null;
  brandModel: string | null;
  odometer: string | null;
  branch: string | null;
  provider: string | null;
  paymentMethod: string | null;
  item: string | null;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  tax: number | null;
  invoiceAvailable: boolean | null;
};

export type KafaratplusFuelReportTotals = {
  totalQuantity: number;
  total: number;
  totalPreTax: number;
  totalTax: number;
};

export type KafaratplusVehicleFuelSummary = {
  key: string;
  driver: string | null;
  driverId: string | null;
  driverIqama: string | null;
  plate: string;
  vehicle: string | null;
  operationCount: number;
  totalQuantity: number;
  total: number;
  averageCostPerOperation: number | null;
};

export type KafaratplusMatchDiagnostics = {
  localPlates: string[];
  kafaratplusPlates: string[];
  matchedPlates: string[];
  unmatchedLocalPlates: string[];
  unmatchedKafaratplusPlates: string[];
  fuelDescriptors: string[];
  driversFound?: Array<{
    driver: string;
    actualPlate: string | null;
    dashPlate: string | null;
  }>;
  actualPlatesUsed?: string[];
  matchedDrivers?: Array<{
    driver: string;
    actualPlate: string;
    kafaratplusPlate: string;
  }>;
  unmatchedDrivers?: Array<{
    driver: string;
    actualPlate: string | null;
    reason: string;
  }>;
};

export type KafaratplusFuelReportResult =
  | {
      status: "success";
      source: "kafaratplus";
      rows: KafaratplusFuelOperationRow[];
      vehicleSummaries: KafaratplusVehicleFuelSummary[];
      totals: KafaratplusFuelReportTotals;
      operationsCount: number;
      diagnostics: KafaratplusMatchDiagnostics;
      pagination: {
        page: number;
        pageSize: number;
        totalRows: number;
        totalPages: number;
      };
      fuelClassification: {
        strategy: string;
        excludedNonFuelCount: number;
        unverifiedCount: number;
        totalsAreMatchedOperationsOnly: boolean;
      };
    }
  | {
      status: Exclude<KafaratplusIntegrationStatus, "success">;
      source: "kafaratplus";
      diagnostics?: KafaratplusMatchDiagnostics;
      rows: [];
      message: string;
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
