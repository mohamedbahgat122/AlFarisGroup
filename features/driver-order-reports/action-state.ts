export type DriverOrderReportActionState =
  | { status: "idle" }
  | { status: "error"; code: string; message?: string; details?: string[]; reportDate?: string; submissionId: string }
  | { status: "success"; code: "success"; reportDate: string; message?: string; submissionId: string };

export const initialDriverOrderReportActionState: DriverOrderReportActionState = { status: "idle" };

export type DriverOrderReportUpdateActionState =
  | { status: "idle" }
  | { status: "error"; code: "invalid_input" | "edit_note_required" | "edit_note_too_long" | "unauthorized" | "row_not_found" | "stale_row" | "update_failed"; submissionId: string }
  | { status: "success"; code: "success"; message: string; submissionId: string };

export const initialDriverOrderReportUpdateActionState: DriverOrderReportUpdateActionState = { status: "idle" };
