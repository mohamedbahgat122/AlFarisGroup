import type { Dictionary } from "@/i18n/dictionaries";

export type ShiftManagementDictionary =
  Dictionary["dashboard"]["shifts"]["management"];

export type ShiftTemplateRow = {
  id: string;
  organizationId: string;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  hasBreak: boolean;
  breakStartTime: string | null;
  breakEndTime: string | null;
  isActive: boolean;
  driverNote: string | null;
  archivedAt: string | null;
  assignedDriverCount: number;
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type ShiftDriverOption = {
  id: string;
  fullName: string;
  identifier: string | null;
  mobileNumber: string;
  status: string;
  currentShiftId: string | null;
  currentShiftName: string | null;
  vehicleLabel: string | null;
};

export type ShiftManagementQueryResult =
  | {
      status: "success";
      shifts: ShiftTemplateRow[];
      drivers: ShiftDriverOption[];
    }
  | {
      status: "unauthorized" | "load_error";
      shifts: [];
      drivers: [];
    };

export type ShiftActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; code: string; message: string };
