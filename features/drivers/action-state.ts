import type {
  DriverFieldErrors,
  DriverFormValues,
  DriverAccountActionState,
  DriverMutationErrorCode,
} from "@/features/drivers/types";

export type DriverActionState = {
  status: "idle" | "validation_error" | "success" | "error";
  code?: DriverMutationErrorCode | "success";
  message?: string;
  fieldErrors?: DriverFieldErrors;
  values?: DriverFormValues;
};

export const initialDriverActionState: DriverActionState = {
  status: "idle",
};

export type DriverLifecycleActionState = {
  status: "idle" | "success" | "error";
  code?: DriverMutationErrorCode | "success";
};

export const initialDriverLifecycleActionState: DriverLifecycleActionState = {
  status: "idle",
};

export const initialDriverAccountActionState: DriverAccountActionState = {
  status: "idle",
};
