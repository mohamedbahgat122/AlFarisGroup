import type { DriverStatus } from "@/features/drivers/types";

export type DriverExpiryDocumentType =
  | "iqama"
  | "driving_license"
  | "driver_card"
  | "vehicle_authorization"
  | "operating_card";

export type DriverExpiryAlertSeverity =
  | "warning"
  | "urgent"
  | "expires_today"
  | "expired";

export type DriverExpiryAlert = {
  key: string;
  organizationCode: string;
  organizationName: string;
  driverId: string;
  driverName: string;
  driverStatus: DriverStatus;
  documentType: DriverExpiryDocumentType;
  expiryDate: string;
  daysRemaining: number;
  severity: DriverExpiryAlertSeverity;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationCode: string | null;
  requestId: string | null;
  requestType: string | null;
  requestStatus: string | null;
  maintenanceJobType: "maintenance" | "oil_change" | null;
  driverName: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};
