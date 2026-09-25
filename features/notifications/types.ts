import type { DriverStatus } from "@/features/drivers/types";
import type { Json } from "@/types/database";

export type MaintenanceJobType = "maintenance" | "oil_change";
export type NotificationMetadata = {
  maintenanceJobType: MaintenanceJobType;
} | null;

export function parseNotificationMetadata(value: Json | null): NotificationMetadata {
  if (!isJsonRecord(value)) return null;

  const jobType = value.maintenanceJobType;
  return jobType === "maintenance" || jobType === "oil_change"
    ? { maintenanceJobType: jobType }
    : null;
}

function isJsonRecord(value: Json | null): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  metadata: NotificationMetadata;
  entityType: string | null;
  entityId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationCode: string | null;
  requestId: string | null;
  requestType: string | null;
  requestStatus: string | null;
  maintenanceJobType: MaintenanceJobType | null;
  driverName: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};
