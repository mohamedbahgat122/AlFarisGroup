import type { Database } from "@/types/database";

export type ReportAttendanceStatus =
  Database["public"]["Enums"]["driver_report_attendance_status"];
export type ReportEligibilityStatus =
  Database["public"]["Enums"]["driver_report_eligibility_status"];

export type DriverReportImportErrorCode =
  | "missing_performance_file"
  | "missing_ranking_file"
  | "invalid_excel_file"
  | "performance_worksheet_not_found"
  | "ranking_worksheet_not_found"
  | "missing_performance_headers"
  | "missing_ranking_headers"
  | "required_worksheet_not_found"
  | "missing_required_headers"
  | "multiple_report_dates"
  | "invalid_report_date"
  | "duplicate_performance_keeta_id"
  | "duplicate_ranking_keeta_id"
  | "invalid_duration"
  | "invalid_counts"
  | "invalid_ratio"
  | "same_file"
  | "organization_unavailable"
  | "unauthorized"
  | "duplicate_saved_report"
  | "configuration_error"
  | "import_failed";

export type DriverReportFieldErrors = Partial<
  Record<"performanceFile" | "rankingFile", string>
>;

export type DriverReportSummary = {
  reportDate: string;
  registeredActiveDrivers: number;
  presentDrivers: number;
  absentDrivers: number;
  matchedRankingRows: number;
  unmatchedPerformanceIds: string[];
  unmatchedRankingIds: string[];
  driversMissingKeetaId: number;
};

export type DriverReportRow = {
  id: string;
  driverId: string;
  driverFullName: string;
  keetaDriverId: string | null;
  isCompanySponsored: boolean | null;
  nfcNumber: string | null;
  actualVehiclePlateNumber: string | null;
  keetaDashboardPlateNumber: string | null;
  driverExpiries: DriverReportDriverExpiries;
  attendanceStatus: ReportAttendanceStatus;
  acceptedTasks: number;
  deliveredTasks: number;
  rejectedTasks: number;
  validOnlineSeconds: number;
  deliveryRate: number | null;
  level: string | null;
  cityRanking: number | null;
  rankingPercentage: number | null;
  mandatoryAssignmentScore: number | null;
  estimatedRewardAmount: number | null;
  evaluationOnTimeRate: number | null;
  evaluationCompletionRate: number | null;
  notEarlyDeliveryConfirmationRate: number | null;
  evaluationTotalOrders: number | null;
  onTimeRate: number | null;
  incompleteOrders: number;
  eligibilityStatus: ReportEligibilityStatus | null;
  dailyFuelQuantityLitres: number;
  dailyFuelAmountSar: number;
  dailyDistanceKm: number | null;
  monthlyMetrics: DriverMonthlyReportMetrics;
};

export type DriverMonthlyReportMetrics = {
  monthlyOrders: number;
  monthlyAbsenceDays: number;
  monthlyAttendanceDays: number;
  monthlyFuelAmountSar: number;
  averageDailyFuelAmountSar: number | null;
  monthlyWorkingSeconds: number;
  averageDailyWorkingSeconds: number | null;
  monthlyFuelRateSar: number | null;
  monthlyDistanceKm: number | null;
};

export type DriverReportDriverExpiries = {
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

export type DriverReport = DriverReportSummary & {
  id: string;
  organizationId: string;
  importedAt: string;
  importedByFullName: string | null;
  fuelMetricsAvailable: boolean;
  distanceMetricsAvailable: boolean;
  rows: DriverReportRow[];
};

export type DriverReportDateOption = {
  reportDate: string;
  importedAt: string;
  importedByName: string | null;
};

export type DriverReportsQueryResult =
  | {
      status: "success";
      report: DriverReport | null;
      dates: DriverReportDateOption[];
      selectedDateUnavailable: boolean;
    }
  | {
      status: "unauthorized" | "load_error";
      report: null;
      dates: [];
    };

export type DriverReportImportRowPayload = {
  driver_id: string;
  driver_full_name: string;
  keeta_driver_id: string | null;
  attendance_status: ReportAttendanceStatus;
  accepted_tasks: number;
  delivered_tasks: number;
  rejected_tasks: number;
  valid_online_seconds: number;
  delivery_rate: number | null;
  level: string | null;
  city_ranking: number | null;
  ranking_percentage: number | null;
  mandatory_assignment_score: number | null;
  estimated_reward_amount: number | null;
  evaluation_on_time_rate: number | null;
  evaluation_completion_rate: number | null;
  not_early_delivery_confirmation_rate: number | null;
  evaluation_total_orders: number | null;
  on_time_rate: number | null;
  incomplete_orders: number;
  eligibility_status: ReportEligibilityStatus | null;
};

export type DriverReportImportPayload = {
  summary: DriverReportSummary;
  rows: DriverReportImportRowPayload[];
};

export type DriverReportImportResult =
  | {
      success: true;
      reportDate: string;
    }
  | {
      success: false;
      code: DriverReportImportErrorCode;
      field?: keyof DriverReportFieldErrors;
      reportDate?: string;
      details?: DriverReportImportErrorDetails;
    };

export type DriverReportImportErrorDetails = {
  missingFields?: string[];
  ambiguousFields?: string[];
  durationErrors?: DriverReportDurationErrorDetail[];
  additionalDurationErrorCount?: number;
};

export type DriverReportDurationErrorDetail = {
  rowNumber: number;
  column: string;
  columnHeader: string;
  rawValue: string;
};
