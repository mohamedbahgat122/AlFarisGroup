import type { Database } from "@/types/database";

export type SupervisorShift = Database["public"]["Tables"]["supervisor_shifts"]["Row"];
export type SupervisorShiftAssignment = Database["public"]["Tables"]["supervisor_shift_assignments"]["Row"];
export type SupervisorOrganizationAssignment = Database["public"]["Tables"]["supervisor_organization_assignments"]["Row"];
export type SupervisorLeave = Database["public"]["Tables"]["supervisor_leaves"]["Row"];

export type SupervisorWeeklyOffAssignment = Database["public"]["Tables"]["supervisor_weekly_off_assignments"]["Row"];
export type SupervisorWorkSession = Database["public"]["Tables"]["supervisor_work_sessions"]["Row"];

export type ShiftTransferFormData = {
  supervisor_id: string;
  new_shift_id: string;
  start_date: string;
  notes: string | null;
};

export type ShiftTransferResult =
  | { success: true }
  | {
      success: false;
      code:
        | "unauthorized"
        | "validation_error"
        | "before_current_start"
        | "save_failed";
      message: string;
    };
