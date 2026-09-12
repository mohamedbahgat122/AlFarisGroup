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
  publishedAt: string | null;
  publishedBy: string | null;
  archivedAt: string | null;
  assignedDriverCount: number;
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  createdAt: string;
  updatedAt: string;
  attendancePolicy: {
    startOpenBeforeMinutes: number | null;
    minimumWorkMinutes: number | null;
  };
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

export type ShiftWeekKey = "current" | "next";

export type ShiftWeekRange = {
  key: ShiftWeekKey;
  startDate: string;
  endDate: string;
};

export type WeeklyShiftDriver = {
  assignmentId: string;
  driverId: string;
  fullName: string;
  identifier: string | null;
  vehicleLabel: string | null;
  assignmentStartDate: string | null;
  assignmentEndDate: string | null;
};

export type WeeklyShiftRow = {
  shift: ShiftTemplateRow;
  assignedDrivers: WeeklyShiftDriver[];
};

export type ShiftWeekData = {
  range: ShiftWeekRange;
  shifts: WeeklyShiftRow[];
};

export type ScheduledShiftChangeRow = {
  id: string;
  driverName: string;
  fromShiftName: string;
  toShiftName: string;
  executionDate: string;
  status: "upcoming" | "completed" | "review_needed";
  statusLabel: string;
};

export type ShiftManagementQueryResult =
  | {
      status: "success";
      shifts: ShiftTemplateRow[];
      drivers: ShiftDriverOption[];
      scheduledChanges: ScheduledShiftChangeRow[];
      shiftChangeRequestDays: number[];
      weeks: {
        current: ShiftWeekData;
        next: ShiftWeekData;
      };
    }
  | {
      status: "unauthorized" | "load_error";
      shifts: [];
      drivers: [];
      scheduledChanges: [];
      shiftChangeRequestDays: number[];
      weeks: {
        current: ShiftWeekData;
        next: ShiftWeekData;
      };
    };

export type ShiftActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; code: string; message: string };
