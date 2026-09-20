export type OrderReportRow = {
  id: string;
  updatedAt?: string;
  driverId: string;
  driverFullName: string;
  keetaDriverId: string;
  supervisor: string | null;
  vehicleType: string | null;
  courierType: string | null;
  attendanceSummary: string | null;
  onShift: string | null;
  eligiblePartner: string | null;
  driverConnectionDuration: string | null;
  validOnlineDuration: string | null;
  peakOnlineDuration: string | null;
  acceptedTasks: number;
  restaurantTasks: number;
  deliveredTasks: number;
  largeCompletedTasks: number;
  rejectedTasks: number;
  driverRejectedTasks: number;
  automaticRejectedTasks: number;
  deliveryCancellationRate: number | null;
  nonDeliveryCompletionRate: number | null;
  onTimeDeliveryRate: number | null;
  largeOrderOnTimeRate: number | null;
  averageDeliveryDuration: number | null;
  over55MinutesRate: number | null;
  lateTasks: number;
  veryLateTasks: number;
  sourceData: Record<string, unknown>;
  driverExpiries: DriverOrderReportExpiries;
  dailyFuelQuantityLitres: number;
  dailyFuelAmountSar: number;
  dailyDistanceKm: number | null;
  monthlyDeliveredOrders: number | null;
  monthlyFuelAmountSar: number | null;
  monthlyDistanceKm: number | null;
};

export type DriverOrderReportExpiries = {
  isCompanySponsored: boolean | null;
  nfcNumber: string | null;
  actualVehiclePlateNumber: string | null;
  keetaDashboardPlateNumber: string | null;
  iqamaExpiryDate: string | null;
  drivingLicenseExpiryDate: string | null;
  driverCardExpiryDate: string | null;
  vehicleAuthorizationExpiryDate: string | null;
  operatingCardExpiryDate: string | null;
};

export type DriverOrderReport = {
  id: string;
  organizationId: string;
  reportDate: string;
  importedAt: string;
  importedByFullName: string | null;
  unmatchedDriverIds: string[];
  invalidRowCount: number;
  fuelMetricsAvailable: boolean;
  distanceMetricsAvailable: boolean;
  monthlyOrderMetricsAvailable: boolean;
  rows: OrderReportRow[];
};

export type DriverOrderReportsQueryResult =
  | { status: "success"; report: DriverOrderReport | null; dates: string[]; selectedDateUnavailable: boolean }
  | { status: "unauthorized" | "load_error"; report: null; dates: [] };

export type DriverOrderReportImportResult =
  | { success: true; reportDate: string }
  | { success: false; code: string; reportDate?: string; details?: string[] };

export type DriverOrderReportEditableValues = Pick<
  OrderReportRow,
  | "validOnlineDuration"
  | "peakOnlineDuration"
  | "acceptedTasks"
  | "restaurantTasks"
  | "deliveredTasks"
  | "largeCompletedTasks"
  | "rejectedTasks"
  | "driverRejectedTasks"
  | "automaticRejectedTasks"
  | "deliveryCancellationRate"
  | "nonDeliveryCompletionRate"
  | "onTimeDeliveryRate"
  | "largeOrderOnTimeRate"
  | "averageDeliveryDuration"
  | "over55MinutesRate"
  | "lateTasks"
  | "veryLateTasks"
>;

export type DriverOrderReportUpdateResult =
  | { success: true }
  | { success: false; code: "invalid_input" | "edit_note_required" | "edit_note_too_long" | "unauthorized" | "row_not_found" | "stale_row" | "update_failed" };
