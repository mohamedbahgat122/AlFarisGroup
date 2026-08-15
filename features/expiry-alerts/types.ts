export type SystemExpiryAlertSeverity = "expired" | "critical" | "warning";

export type SystemExpiryAlertSourceType = "driver" | "fleet_vehicle";

export type SystemExpiryAlertDocumentType =
  | "iqama"
  | "driving_license"
  | "driver_card"
  | "vehicle_authorization"
  | "driver_operating_card"
  | "fleet_operating_card"
  | "fleet_authorization";

export type SystemExpiryAlert = {
  id: string;
  sourceType: SystemExpiryAlertSourceType;
  documentType: SystemExpiryAlertDocumentType;
  entityId: string;
  organizationId: string | null;
  organizationName: string | null;
  title: string;
  subtitle: string;
  expiryDate: string;
  daysRemaining: number;
  severity: SystemExpiryAlertSeverity;
  href: string;
};

export type SystemExpiryAlertSummary = {
  expired: number;
  critical: number;
  warning: number;
};

export type SystemExpiryAlertsResult =
  | {
      status: "success";
      alerts: SystemExpiryAlert[];
      summary: SystemExpiryAlertSummary;
      totalCount: number;
      hasExpired: boolean;
    }
  | {
      status: "unauthorized" | "load_error";
      alerts: [];
      summary: SystemExpiryAlertSummary;
      totalCount: 0;
      hasExpired: false;
    };
