import type { Dictionary } from "@/i18n/dictionaries";

export type DriverWarningCategory =
  | "attendance"
  | "behavior"
  | "compliance"
  | "documentation"
  | "performance"
  | "safety"
  | "vehicle_care"
  | "other";

export type DriverWarningSeverity = "low" | "medium" | "high";
export type DriverWarningStatus = "active" | "revoked";

export type DriverWarningRow = {
  id: string;
  driverId: string;
  driverName: string;
  driverIdentifier: string | null;
  driverMobileNumber: string;
  category: DriverWarningCategory;
  severity: DriverWarningSeverity;
  title: string;
  description: string;
  incidentAt: string;
  status: DriverWarningStatus;
  issuedAt: string;
  issuedByName: string | null;
  driverSeenAt: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  revokeReason: string | null;
  createdAt: string;
};

export type DriverWarningDriverOption = {
  id: string;
  fullName: string;
  identifier: string | null;
  mobileNumber: string;
};

export type DriverWarningsQueryResult =
  | {
      status: "success";
      warnings: DriverWarningRow[];
      drivers: DriverWarningDriverOption[];
    }
  | {
      status: "unauthorized" | "load_error";
      warnings: [];
      drivers: [];
    };

export type DriverWarningsDictionary = Dictionary["dashboard"]["driverWarnings"];
