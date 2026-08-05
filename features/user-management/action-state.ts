import type { ManagedUserMutationErrorCode } from "@/features/user-management/types";

export type CreateManagedUserActionState = {
  status: "idle" | "success" | "error";
  code?: ManagedUserMutationErrorCode | "success";
};

export const initialCreateManagedUserActionState: CreateManagedUserActionState = {
  status: "idle",
};
