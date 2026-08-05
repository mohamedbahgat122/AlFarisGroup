import type {
  DriverReportFieldErrors,
  DriverReportImportErrorCode,
} from "@/features/driver-reports/types";

export type DriverReportImportActionState =
  | {
      status: "idle";
      code?: undefined;
      message?: undefined;
      fieldErrors?: undefined;
      reportDate?: undefined;
      submissionId?: undefined;
      requiresReplacement?: undefined;
    }
  | {
      status: "validation_error";
      code: DriverReportImportErrorCode;
      message?: string;
      fieldErrors: DriverReportFieldErrors;
      reportDate?: string;
      submissionId: string;
      requiresReplacement?: boolean;
    }
  | {
      status: "error";
      code: DriverReportImportErrorCode;
      message?: string;
      fieldErrors?: DriverReportFieldErrors;
      reportDate?: undefined;
      submissionId: string;
      requiresReplacement?: undefined;
    }
  | {
      status: "success";
      code: "success";
      message?: string;
      fieldErrors?: undefined;
      reportDate: string;
      submissionId: string;
      requiresReplacement?: undefined;
    };

export const initialDriverReportImportActionState: DriverReportImportActionState =
  {
    status: "idle",
  };
