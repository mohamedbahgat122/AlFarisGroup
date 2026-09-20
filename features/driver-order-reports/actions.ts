"use server";
import { revalidatePath } from "next/cache";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/types/locale";
import { importDriverOrderReportForOrganization, updateDriverOrderReportRowForOrganization } from "@/features/driver-order-reports/service";
import type { DriverOrderReportActionState, DriverOrderReportUpdateActionState } from "@/features/driver-order-reports/action-state";
import type { DriverOrderReportEditableValues } from "@/features/driver-order-reports/types";

export async function importDriverOrderReportAction(_previous: DriverOrderReportActionState, formData: FormData): Promise<DriverOrderReportActionState> {
  const locale = formData.get("locale");
  const organizationCode = String(formData.get("organizationCode") ?? "").trim();
  const replaceExisting = formData.getAll("replaceExisting").includes("true");
  const file = formData.get("file");
  if (typeof locale !== "string" || !isLocale(locale) || !(file instanceof File) || file.size === 0) return { status: "error", code: "missing_file", submissionId: crypto.randomUUID() };
  const result = await importDriverOrderReportForOrganization({ organizationCode, file, replaceExisting });
  if (!result.success) return { status: "error", code: result.code, details: result.details, reportDate: result.reportDate, submissionId: crypto.randomUUID() };
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/drivers/order-reports`);
  return { status: "success", code: "success", reportDate: result.reportDate, message: getDictionary(locale).dashboard.drivers.orderReportImportSuccess, submissionId: crypto.randomUUID() };
}

export async function updateDriverOrderReportRowAction(_previous: DriverOrderReportUpdateActionState, formData: FormData): Promise<DriverOrderReportUpdateActionState> {
  const locale = formData.get("locale");
  const organizationCode = String(formData.get("organizationCode") ?? "").trim();
  const reportId = String(formData.get("reportId") ?? "").trim();
  const rowId = String(formData.get("rowId") ?? "").trim();
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "").trim();
  const editNote = String(formData.get("editNote") ?? "").trim();
  const values = parseEditableValues(formData);
  if (editNote.length < 3) {
    return { status: "error", code: "edit_note_required", submissionId: crypto.randomUUID() };
  }
  if (editNote.length > 500) return { status: "error", code: "edit_note_too_long", submissionId: crypto.randomUUID() };
  if (typeof locale !== "string" || !isLocale(locale) || !organizationCode || !isUuid(reportId) || !isUuid(rowId) || !Number.isFinite(Date.parse(expectedUpdatedAt)) || !values) {
    return { status: "error", code: "invalid_input", submissionId: crypto.randomUUID() };
  }
  const result = await updateDriverOrderReportRowForOrganization({ organizationCode, reportId, rowId, expectedUpdatedAt, editNote, values });
  if (!result.success) return { status: "error", code: result.code, submissionId: crypto.randomUUID() };
  revalidatePath(`/${locale}/dashboard/organizations/${organizationCode}/drivers/order-reports`);
  return { status: "success", code: "success", message: getDictionary(locale).dashboard.drivers.orderReportEditSuccess, submissionId: crypto.randomUUID() };
}

function parseEditableValues(formData: FormData): DriverOrderReportEditableValues | null {
  const requiredNumbers = ["acceptedTasks", "restaurantTasks", "deliveredTasks", "largeCompletedTasks", "rejectedTasks", "driverRejectedTasks", "automaticRejectedTasks", "lateTasks", "veryLateTasks"] as const;
  const nullableNumbers = ["deliveryCancellationRate", "nonDeliveryCompletionRate", "onTimeDeliveryRate", "largeOrderOnTimeRate", "averageDeliveryDuration", "over55MinutesRate"] as const;
  const parsedRequired = Object.fromEntries(requiredNumbers.map((field) => [field, parseNumberField(formData.get(field), false)]));
  const parsedNullable = Object.fromEntries(nullableNumbers.map((field) => [field, parseNumberField(formData.get(field), true)]));
  if (Object.values(parsedRequired).some((value) => value == null) || Object.values(parsedNullable).some((value) => value === undefined)) return null;
  const validOnlineDuration = nullableText(formData.get("validOnlineDuration"));
  const peakOnlineDuration = nullableText(formData.get("peakOnlineDuration"));
  if (validOnlineDuration === undefined || peakOnlineDuration === undefined) return null;
  return { validOnlineDuration, peakOnlineDuration, ...parsedRequired, ...parsedNullable } as DriverOrderReportEditableValues;
}

function parseNumberField(value: FormDataEntryValue | null, nullable: boolean): number | null | undefined {
  if (typeof value !== "string" || value.trim() === "") return nullable ? null : undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function nullableText(value: FormDataEntryValue | null): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 200 ? undefined : normalized || null;
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
