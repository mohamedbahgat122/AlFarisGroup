"use server";

import { revalidatePath } from "next/cache";
import { getAccessibleOrganizationByCode } from "@/features/organizations/queries";
import { getOrganizationPermissions } from "@/features/permissions/server";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import { isLocale } from "@/types/locale";
import type { OrderPeriodActionResult } from "@/features/order-periods/types";

export async function saveOrderPeriodTemplateAction(
  _previous: OrderPeriodActionResult,
  formData: FormData,
): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.manage");
  if (context.status !== "success") return context.result;
  const id = value(formData, "templateId");
  const name = value(formData, "name");
  const startTime = value(formData, "startTime");
  const endTime = value(formData, "endTime");
  const crossesMidnight = formData.get("crossesMidnight") === "on";

  if (!name || !validTime(startTime) || !validTime(endTime) || startTime === endTime) {
    return error("invalid_template", context.locale === "ar" ? "تحقق من اسم الشيفت والأوقات." : "Check the shift name and times.");
  }
  const startMinutes = minutes(startTime);
  const endMinutes = minutes(endTime);
  if ((!crossesMidnight && endMinutes <= startMinutes) || (crossesMidnight && endMinutes > startMinutes)) {
    return error("invalid_template", context.locale === "ar" ? "اختر خيار امتداد اليوم المناسب للأوقات." : "Choose the correct overnight option for these times.");
  }

  const rpc = id ? "update_order_period_template" : "create_order_period_template";
  const args = id
    ? { p_organization_id: context.organization.id, p_template_id: id, p_name: name, p_start_time: startTime, p_end_time: endTime, p_crosses_midnight: crossesMidnight }
    : { p_organization_id: context.organization.id, p_name: name, p_start_time: startTime, p_end_time: endTime, p_crosses_midnight: crossesMidnight };
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc(rpc, args);
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "save_failed");

  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "تم حفظ شيفت الطلبات." : "Order work shift saved." };
}

export async function saveOrderPeriodOperationalPolicyAction(_previous: OrderPeriodActionResult, formData: FormData): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.manage");
  if (context.status !== "success") return context.result;
  const templateId = value(formData, "templateId");
  const openBefore = nullableMinutes(formData, "openBeforeMinutes");
  const closeAfter = nullableMinutes(formData, "closeAfterMinutes");
  const minimumWork = minimumMinutes(formData, "minimumWorkMinutes");
  if (minimumWork === "invalid") return error("invalid_policy", "The operational times are invalid.");
  if (!templateId || openBefore === "invalid" || closeAfter === "invalid") return error("invalid_policy", context.locale === "ar" ? "أوقات الشيفت غير صالحة." : "The operational times are invalid.");
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("set_order_period_operational_policy", {
    p_organization_id: context.organization.id, p_order_period_template_id: templateId,
    p_open_before_minutes: openBefore, p_close_after_minutes: closeAfter, p_minimum_work_minutes: minimumWork,
  });
  if (rpcError || rpcFailure(data) || !data?.success || !data.id) {
    return mapError(rpcError?.message ?? (rpcFailure(data) ? data.error : "ORDER_PERIOD_OPERATIONAL_POLICY_SAVE_FAILED"), context.locale, "save_failed");
  }
  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "تم حفظ إعدادات فتح وإغلاق الشيفت." : "Shift opening and closing settings saved." };
}

export async function openDriverOrderPeriodAction(formData: FormData): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.assign");
  if (context.status !== "success") return context.result;
  const templateId = value(formData, "templateId");
  const driverId = value(formData, "driverId");
  if (!templateId || !driverId) return error("invalid_open", context.locale === "ar" ? "بيانات الفتح غير صالحة." : "The open request is invalid.");
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("open_driver_order_period_now", {
    p_organization_id: context.organization.id, p_order_period_template_id: templateId, p_driver_id: driverId,
  });
  if (rpcError || rpcFailure(data)) {
    console.error("[order-periods] open driver order period failed", {
      code: rpcError?.code,
      message: rpcError?.message,
      details: rpcError?.details,
      hint: rpcError?.hint,
      returnedError: rpcFailure(data) ? data.error : undefined,
      organizationId: context.organization.id,
      orderPeriodTemplateId: templateId,
      driverId,
    });
    return mapError(rpcError?.message ?? data.error, context.locale, "action_failed");
  }
  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "سيُسمح لهذا المندوب ببدء الدوام الآن بغض النظر عن وقت الفتح التلقائي للشيفت." : "This driver can start duty now regardless of the shift's automatic opening time." };
}

export async function orderPeriodLifecycleAction(kind: "publish" | "unpublish" | "disable" | "enable", formData: FormData): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.manage");
  if (context.status !== "success") return context.result;
  const templateId = value(formData, "templateId");
  if (!templateId) return error("template_required", context.locale === "ar" ? "اختر شيفت أولاً." : "Choose a shift first.");
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc(`${kind}_order_period_template`, {
    p_organization_id: context.organization.id, p_template_id: templateId,
  });
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "action_failed");
  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "تم تحديث حالة الشيفت." : "Shift status updated." };
}

export async function archiveOrderPeriodTemplateAction(
  _previous: OrderPeriodActionResult,
  formData: FormData,
): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.manage");
  if (context.status !== "success") return context.result;
  const templateId = value(formData, "templateId");
  if (!templateId) return error("template_required", context.locale === "ar" ? "اختر شيفتاً أولاً." : "Choose a shift first.");
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("archive_order_period_template", {
    p_organization_id: context.organization.id,
    p_template_id: templateId,
  });
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "archive_failed");
  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "تمت أرشفة الشيفت." : "Order work shift archived." };
}

export async function replaceOrderPeriodWeekMembersAction(
  _previous: OrderPeriodActionResult,
  formData: FormData,
): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.assign");
  if (context.status !== "success") return context.result;
  const templateId = value(formData, "templateId");
  const startDate = value(formData, "weekStartDate");
  const endDate = value(formData, "weekEndDate");
  const driverIds = formData.getAll("driverIds").map(String).filter(Boolean);
  if (!templateId || !startDate || !endDate) return error("invalid_week", context.locale === "ar" ? "بيانات الأسبوع غير صالحة." : "The week range is invalid.");
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("replace_order_period_week_members", {
    p_organization_id: context.organization.id,
    p_order_period_template_id: templateId,
    p_week_start: startDate,
    p_week_end: endDate,
    p_driver_ids: driverIds,
  });
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "assign_failed");
  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "تم حفظ ربط المناديب." : "Driver assignments saved." };
}

export async function moveOrderPeriodDriverAction(
  _previous: OrderPeriodActionResult,
  formData: FormData,
): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.assign");
  if (context.status !== "success") return context.result;
  const templateId = value(formData, "sourceTemplateId");
  const targetTemplateId = value(formData, "targetTemplateId");
  const driverId = value(formData, "driverId");
  const startDate = value(formData, "weekStartDate");
  const endDate = value(formData, "weekEndDate");
  if (!templateId || !targetTemplateId || !driverId || !startDate || !endDate) return error("invalid_move", context.locale === "ar" ? "بيانات النقل غير صالحة." : "The move details are invalid.");
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("move_order_period_driver", {
    p_organization_id: context.organization.id,
    p_source_order_period_id: templateId,
    p_target_order_period_id: targetTemplateId,
    p_driver_id: driverId,
    p_week_start: startDate,
    p_week_end: endDate,
  });
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "move_failed");
  revalidatePath(context.path);
  return { status: "success", message: context.locale === "ar" ? "تم نقل المندوب." : "Driver moved successfully." };
}

export async function saveOrderShiftChangeDaysAction(formData: FormData): Promise<OrderPeriodActionResult> {
  const context = await getContext(formData, "order_periods.manage");
  if (context.status !== "success") return context.result;
  const isArabic = String(formData.get("locale")) === "ar";
  const allowedWeekdays = formData.getAll("allowedWeekdays").map(Number);
  if (allowedWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    if (isArabic) return error("invalid_days", "\u0623\u064a\u0627\u0645 \u0637\u0644\u0628\u0627\u062a \u062a\u063a\u064a\u064a\u0631 \u0634\u064a\u0641\u062a\u0627\u062a \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u063a\u064a\u0631 \u0635\u0627\u0644\u062d\u0629.");
    return error("invalid_days", context.locale === "ar" ? "ط£ظٹط§ظ… ط·ظ„ط¨ط§طھ طھط؛ظٹظٹط± ط§ظ„ط´ظٹظپطھ ط؛طڑظٹط± طµط§ظ„ط­ط©." : "The selected weekdays are invalid.");
  }
  const normalizedWeekdays = Array.from(new Set(allowedWeekdays)).sort((a, b) => a - b);
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("set_organization_order_shift_change_settings", {
    p_organization_id: context.organization.id,
    p_allowed_weekdays: normalizedWeekdays,
  });
  if (rpcError || rpcFailure(data)) {
    console.error("[order-periods] settings RPC failed", {
      operation: "save_order_shift_change_days",
      code: rpcError?.code,
      message: rpcError?.message,
      details: rpcError?.details,
      hint: rpcError?.hint,
      returnedDataShape: describeRpcData(data),
      organizationId: context.organization.id,
      allowedWeekdays: normalizedWeekdays,
    });
    return mapError(rpcError?.message ?? data.error, context.locale, "settings_failed");
  }
  revalidatePath(context.path);
  if (isArabic) return { status: "success", message: "\u062a\u0645 \u062d\u0641\u0638 \u0623\u064a\u0627\u0645 \u0637\u0644\u0628 \u062a\u063a\u064a\u064a\u0631 \u0634\u064a\u0641\u062a\u0627\u062a \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0628\u0646\u062c\u0627\u062d." };
  return { status: "success", message: context.locale === "ar" ? "طھظ… ط­ظپط¸ ط£ظٹط§ظ… ط·ظ„ط¨ طھط؛ظٹظٹط± ط§ظ„ط´ظٹظپطھ." : "Shift change request days saved." };
}

export async function approveOrderShiftChangeRequestAction(requestId: string, reviewNote: string | null, locale: string, organizationCode: string): Promise<OrderPeriodActionResult> {
  const formData = new FormData();
  formData.set("locale", locale);
  formData.set("organizationCode", organizationCode);
  const context = await getContext(formData, "order_periods.assign");
  if (context.status !== "success") return context.result;
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("approve_order_shift_change_request", { p_request_id: requestId, p_review_note: reviewNote || null });
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "approve_failed");
  revalidatePath(context.path);
  if (String(locale) === "ar") return { status: "success", message: "\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0637\u0644\u0628 \u062a\u063a\u064a\u064a\u0631 \u0634\u064a\u0641 \u0627\u0644\u0637\u0644\u0628\u0627\u062a." };
  return { status: "success", message: context.locale === "ar" ? "طھظ… ط§ط¹طھظ…ط§ط¯ ط·ظ„ط¨ طھط؛ظٹظٹط± ط§ظ„ط´ظٹظپطھ." : "Order shift change request approved." };
}

export async function rejectOrderShiftChangeRequestAction(requestId: string, reviewNote: string | null, locale: string, organizationCode: string): Promise<OrderPeriodActionResult> {
  const formData = new FormData();
  formData.set("locale", locale);
  formData.set("organizationCode", organizationCode);
  const context = await getContext(formData, "order_periods.assign");
  if (context.status !== "success") return context.result;
  const { data, error: rpcError } = await (context.admin.supabase as any).rpc("reject_order_shift_change_request", { p_request_id: requestId, p_review_note: reviewNote || null });
  if (rpcError || rpcFailure(data)) return mapError(rpcError?.message ?? data.error, context.locale, "reject_failed");
  revalidatePath(context.path);
  if (String(locale) === "ar") return { status: "success", message: "\u062a\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u062a\u063a\u064a\u064a\u0631 \u0634\u064a\u0641\u0627\u062a \u0627\u0644\u0637\u0644\u0628\u0627\u062a." };
  return { status: "success", message: context.locale === "ar" ? "طھظ… ط±ظپط¶ ط·ظ„ط¨ طھط؛ظٹظٹط± ط§ظ„ط´ظٹظپطھ." : "Order shift change request rejected." };
}

async function getContext(formData: FormData, permission: "order_periods.manage" | "order_periods.assign") {
  const localeValue = value(formData, "locale");
  const organizationCode = value(formData, "organizationCode");
  const locale = isLocale(localeValue) ? localeValue : "en";
  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return { status: "error" as const, result: error("unauthorized", locale === "ar" ? "ليست لديك صلاحية تنفيذ هذا الإجراء." : "You are not authorized for this action.") };
  const organization = await getAccessibleOrganizationByCode(organizationCode);
  if (!organization) return { status: "error" as const, result: error("organization_not_found", locale === "ar" ? "المؤسسة غير موجودة." : "The organization could not be found.") };
  const permissions = await getOrganizationPermissions(admin.supabase, admin.profile, organization.id);
  if (!permissions.has(permission)) return { status: "error" as const, result: error("unauthorized", locale === "ar" ? "ليست لديك صلاحية تنفيذ هذا الإجراء." : "You are not authorized for this action.") };
  return {
    status: "success" as const,
    admin,
    organization,
    locale,
    path: `/${locale}/dashboard/organizations/${organization.code}/orders/manage`,
  };
}

function mapError(message: string, locale: "ar" | "en", fallback: string): OrderPeriodActionResult {
  const arabic = locale === "ar";
  if (message.includes("ORDER_PERIOD_HAS_CURRENT_OR_FUTURE_ASSIGNMENTS")) return error("has_assignments", arabic ? "لا يمكن أرشفة شيفت له ربط حالي أو قادم." : "A shift with current or future assignments cannot be archived.");
  if (message.includes("DRIVER_ALREADY_ASSIGNED_THIS_WEEK")) return error("driver_assigned", arabic ? "هذا المندوب مرتبط بشيفت آخر في الأسبوع." : "This driver is assigned to another shift this week.");
  if (message.includes("DRIVER_NOT_ELIGIBLE_FOR_ORDER_PERIOD")) return error("driver_ineligible", arabic ? "المندوب غير مؤهل لشيفتات الطلبات." : "This driver is not eligible for order work shifts.");
  if (message.includes("ORDER_PERIOD_UNAUTHORIZED")) return error("unauthorized", arabic ? "ليست لديك صلاحية تنفيذ هذا الإجراء." : "You are not authorized for this action.");
  if (message.includes("ORDER_PERIOD_NOT_FOUND")) return error("template_not_found", arabic ? "الشيفت غير موجود." : "The shift could not be found.");
  return error(fallback, arabic ? "تعذر تنفيذ التغيير. حاول مرة أخرى." : "The change could not be saved. Try again.");
}

function error(code: string, message: string): OrderPeriodActionResult {
  return { status: "error", code, message };
}
function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
function validTime(valueToCheck: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valueToCheck);
}
function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}
function nullableMinutes(formData: FormData, key: string): number | null | "invalid" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1440 ? parsed : "invalid";
}
function minimumMinutes(formData: FormData, key: string): number | null | "invalid" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440 ? parsed : "invalid";
}

function rpcFailure(data: unknown): data is { error: string } {
  return Boolean(data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string");
}

function describeRpcData(data: unknown) {
  if (data === null) return { type: "null" };
  if (Array.isArray(data)) return { type: "array", length: data.length };
  if (typeof data !== "object") return { type: typeof data };
  const record = data as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(record),
    success: typeof record.success === "boolean" ? record.success : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}
