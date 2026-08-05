"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { FuelActionState } from "@/features/fuel/types";
import { isLocale } from "@/types/locale";

const initialError = { status: "validation_error" as const, code: "FUEL_INVALID_AMOUNT" };

export async function openDriverFuelAction(
  _previousState: FuelActionState,
  formData: FormData,
): Promise<FuelActionState> {
  return runFuelRpc(formData, "open_driver_fuel", {
    p_driver_id: getString(formData, "driverId"),
    p_amount_sar: getAmount(formData, "amountSar"),
    p_note: getString(formData, "note"),
    p_fuel_date: getString(formData, "fuelDate"),
  });
}

export async function addManualFuelIncreaseAction(
  _previousState: FuelActionState,
  formData: FormData,
): Promise<FuelActionState> {
  const note = getString(formData, "note");

  if (!note.trim()) {
    return { status: "validation_error", code: "FUEL_NOTE_REQUIRED" };
  }

  return runFuelRpc(formData, "add_manual_fuel_increase", {
    p_driver_id: getString(formData, "driverId"),
    p_amount_sar: getAmount(formData, "amountSar"),
    p_note: note,
    p_fuel_date: getString(formData, "fuelDate"),
  });
}

export async function reviewFuelIncreaseRequestAction(
  _previousState: FuelActionState,
  formData: FormData,
): Promise<FuelActionState> {
  const decision = getString(formData, "decision");
  const approvedAmount =
    decision === "approved" ? getAmount(formData, "approvedAmountSar") : null;

  if (decision !== "approved" && decision !== "rejected") {
    return { status: "validation_error", code: "FUEL_INVALID_DECISION" };
  }

  return runFuelRpc(formData, "review_fuel_increase_request", {
    p_request_id: getString(formData, "requestId"),
    p_decision: decision,
    p_approved_amount_sar: approvedAmount,
    p_review_note: getString(formData, "reviewNote"),
  });
}

async function runFuelRpc(
  formData: FormData,
  rpcName:
    | "open_driver_fuel"
    | "add_manual_fuel_increase"
    | "review_fuel_increase_request",
  args: Record<string, string | number | null>,
): Promise<FuelActionState> {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");

  if (!isLocale(locale) || !organizationCode) {
    return { status: "error", code: "FUEL_SESSION_EXPIRED" };
  }

  if (
    Object.values(args).some(
      (value) => typeof value === "number" && Number.isNaN(value),
    )
  ) {
    return initialError;
  }

  const admin = await getAuthenticatedAdmin();

  if (admin.status !== "authorized") {
    return { status: "error", code: "FUEL_SESSION_EXPIRED" };
  }

  const { error } =
    rpcName === "open_driver_fuel"
      ? await admin.supabase.rpc("open_driver_fuel", {
          p_amount_sar: requireNumber(args.p_amount_sar),
          p_driver_id: requireString(args.p_driver_id),
          p_fuel_date: requireString(args.p_fuel_date),
          p_note: requireString(args.p_note),
        })
      : rpcName === "add_manual_fuel_increase"
        ? await admin.supabase.rpc("add_manual_fuel_increase", {
            p_amount_sar: requireNumber(args.p_amount_sar),
            p_driver_id: requireString(args.p_driver_id),
            p_fuel_date: requireString(args.p_fuel_date),
            p_note: requireString(args.p_note),
          })
        : await admin.supabase.rpc("review_fuel_increase_request", {
            p_approved_amount_sar:
              typeof args.p_approved_amount_sar === "number"
                ? args.p_approved_amount_sar
                : undefined,
            p_decision: requireString(args.p_decision),
            p_request_id: requireString(args.p_request_id),
            p_review_note: requireString(args.p_review_note),
          });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[fuel:action]", {
        rpcName,
        code: error.code,
        message: error.message,
      });
    }

    return { status: "error", code: getFuelErrorCode(error.message) };
  }

  revalidatePath(
    `/${locale}/dashboard/organizations/${organizationCode}/fuel/manage`,
  );
  revalidatePath(
    `/${locale}/dashboard/organizations/${organizationCode}/fuel/reports`,
  );

  return { status: "success", code: "success" };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getAmount(formData: FormData, key: string) {
  const value = Number(getString(formData, key));
  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

function requireString(value: string | number | null | undefined) {
  return typeof value === "string" ? value : "";
}

function requireNumber(value: string | number | null | undefined) {
  return typeof value === "number" ? value : Number.NaN;
}

function getFuelErrorCode(message: string) {
  const match = message.match(/FUEL_[A-Z_]+/);
  return match?.[0] ?? "action_failed";
}
