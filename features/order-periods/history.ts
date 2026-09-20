import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderShiftHistoryChange,
  OrderShiftHistoryDriverSnapshot,
  OrderShiftHistoryFilters,
  OrderShiftHistoryItem,
  OrderShiftHistoryResult,
} from "@/features/order-periods/types";

type HistoryQueryFilters = Omit<OrderShiftHistoryFilters, "organizationCode"> & { organizationId: string };

const PAGE_SIZE = 25 as const;
const RIYADH_OFFSET = "+03:00";

export const ORDER_SHIFT_HISTORY_ACTIONS = [
  "order_period_template_created",
  "order_period_template_updated",
  "order_shift_operational_policy_updated",
  "order_shift_change_settings_updated",
  "order_shift_published",
  "order_shift_unpublished",
  "order_shift_enabled",
  "order_shift_disabled",
  "order_shift_archived",
  "order_period_week_membership_replaced",
  "order_period_driver_moved",
  "order_shift_driver_opened_now",
  "order_shift_driver_open_now_cancelled",
  "order_shift_change_request_approved",
  "order_shift_change_request_rejected",
] as const;

type JsonRecord = Record<string, unknown>;
type RawLog = {
  id: string;
  action: string;
  actor_user_id: string | null;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  created_at: string;
};

export async function getOrderShiftHistoryPage(
  supabase: SupabaseClient,
  filters: HistoryQueryFilters,
): Promise<OrderShiftHistoryResult> {
  const page = Math.max(1, Math.floor(filters.page || 1));
  const action = ORDER_SHIFT_HISTORY_ACTIONS.includes(filters.action as (typeof ORDER_SHIFT_HISTORY_ACTIONS)[number])
    ? filters.action
    : "";
  const dateFrom = parseDateBoundary(filters.dateFrom, false);
  const dateTo = parseDateBoundary(filters.dateTo, true);

  let query = (supabase as any)
    .from("activity_logs")
    .select("id, action, actor_user_id, entity_id, before_data, after_data, metadata, created_at", { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .in("action", ORDER_SHIFT_HISTORY_ACTIONS)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // organizationCode is replaced by the caller with the resolved organization id.
  if (action) query = query.eq("action", action);
  if (filters.actorId) query = query.eq("actor_user_id", filters.actorId);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lt("created_at", dateTo);

  const [logsResult, actorIdsResult] = await Promise.all([
    query,
    (supabase as any)
      .from("activity_logs")
      .select("actor_user_id")
      .eq("organization_id", filters.organizationId)
      .in("action", ORDER_SHIFT_HISTORY_ACTIONS)
      .not("actor_user_id", "is", null)
      .limit(1000),
  ]);

  if (logsResult.error || actorIdsResult.error) {
    return failure("History could not be loaded.");
  }

  const logs = (logsResult.data ?? []) as RawLog[];
  const actorIds = unique([
    ...((actorIdsResult.data ?? []) as Array<{ actor_user_id: string | null }>)
      .map((row) => row.actor_user_id)
      .filter((id): id is string => Boolean(id)),
    ...logs.map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)),
  ]);
  const driverIds = unique(logs.flatMap((row) => {
    const metadata = record(row.metadata);
    const before = record(row.before_data);
    const after = record(row.after_data);
    return [stringValue(metadata?.driver_id), stringValue(before?.driver_id), stringValue(after?.driver_id)].filter(
      (id): id is string => Boolean(id),
    );
  }));
  const templateIds = unique(logs.flatMap((row) => {
    const metadata = record(row.metadata);
    const before = record(row.before_data);
    const after = record(row.after_data);
    return [
      row.entity_id,
      stringValue(metadata?.order_period_template_id),
      stringValue(metadata?.source_order_period_template_id),
      stringValue(metadata?.target_order_period_template_id),
      stringValue(before?.order_period_template_id),
      stringValue(after?.order_period_template_id),
    ].filter((id): id is string => Boolean(id));
  }));

  const [profilesResult, driversResult, templatesResult] = await Promise.all([
    actorIds.length ? (supabase as any).from("profiles").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
    driverIds.length ? (supabase as any).from("drivers").select("id, full_name, keeta_driver_id").in("id", driverIds) : Promise.resolve({ data: [], error: null }),
    templateIds.length ? (supabase as any).from("organization_order_period_templates").select("id, name").in("id", templateIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error || driversResult.error || templatesResult.error) {
    return failure("History could not be loaded.");
  }

  const profiles = new Map<string, string>(
    ((profilesResult.data ?? []) as Array<{ id: string; full_name: string | null }>)
      .filter((row) => Boolean(row.full_name))
      .map((row) => [row.id, row.full_name as string]),
  );
  const drivers = new Map<string, { name: string; identifier: string | null }>(
    ((driversResult.data ?? []) as Array<{ id: string; full_name: string; keeta_driver_id: string | null }>)
      .map((row) => [row.id, { name: row.full_name, identifier: row.keeta_driver_id }]),
  );
  const templates = new Map<string, string>(
    ((templatesResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );

  const items = logs.map((row) => normalizeLog(row, profiles, drivers, templates));
  const total = Number(logsResult.count ?? 0);
  const actorOptions = unique(actorIds).map((id) => ({ id, name: profiles.get(id) ?? id }));

  return {
    status: "success",
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    actorOptions,
  };
}

function normalizeLog(
  row: RawLog,
  profiles: Map<string, string>,
  drivers: Map<string, { name: string; identifier: string | null }>,
  templates: Map<string, string>,
): OrderShiftHistoryItem {
  const metadata = record(row.metadata);
  const before = record(row.before_data);
  const after = record(row.after_data);
  const driverId = stringValue(metadata?.driver_id) ?? stringValue(before?.driver_id) ?? stringValue(after?.driver_id);
  const sourceTemplateId = stringValue(metadata?.source_order_period_template_id) ?? stringValue(before?.order_period_template_id);
  const targetTemplateId = stringValue(metadata?.target_order_period_template_id) ?? stringValue(after?.order_period_template_id);
  const templateId = stringValue(metadata?.order_period_template_id) ?? row.entity_id;
  const addedDrivers = driverSnapshots(metadata?.added_drivers);
  const removedDrivers = driverSnapshots(metadata?.removed_drivers);
  const addedCount = numberValue(after?.added_count);
  const removedCount = numberValue(after?.removed_count);
  return {
    id: row.id,
    action: row.action,
    actorName: row.actor_user_id ? profiles.get(row.actor_user_id) ?? null : null,
    driverName: driverId ? drivers.get(driverId)?.name ?? null : null,
    driverIdentifier: driverId ? drivers.get(driverId)?.identifier ?? null : null,
    templateName: templateId ? templates.get(templateId) ?? null : null,
    sourceTemplateName: sourceTemplateId ? templates.get(sourceTemplateId) ?? null : null,
    targetTemplateName: targetTemplateId ? templates.get(targetTemplateId) ?? null : null,
    requestStatus: stringValue(after?.status) ?? stringValue(before?.status),
    requestNote: stringValue(after?.review_note) ?? stringValue(metadata?.review_note),
    addedDrivers,
    removedDrivers,
    addedCount,
    removedCount,
    changes: buildChanges(before, after, row.action),
    createdAt: row.created_at,
  };
}

function buildChanges(before: JsonRecord | null, after: JsonRecord | null, action: string): OrderShiftHistoryChange[] {
  const fields = [
    "name", "start_time", "end_time", "open_before_minutes", "end_before_minutes",
    "minimum_work_minutes", "close_after_minutes", "crosses_midnight", "has_break",
    "break_start_time", "break_end_time", "is_published", "published_at", "is_active",
    "archived_at", "allowed_weekdays", "status", "review_note", "week_start", "week_end",
    "added_count", "removed_count",
  ];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return fields
    .filter((field) => keys.has(field))
    .filter((field) => !(action === "order_period_week_membership_replaced" && (field === "added_count" || field === "removed_count")))
    .filter((field) => action === "order_period_week_membership_replaced" || !sameValue(before?.[field], after?.[field]))
    .map((field) => ({ field, before: displayValue(before?.[field]), after: displayValue(after?.[field]) }));
}

function driverSnapshots(value: unknown): OrderShiftHistoryDriverSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const snapshot = entry as Record<string, unknown>;
    const id = stringValue(snapshot.id);
    const name = stringValue(snapshot.name)?.trim();
    return id && name ? [{ id, name }] : [];
  });
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDateBoundary(value: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00${RIYADH_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function sameValue(before: unknown, after: unknown) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function failure(message: string): OrderShiftHistoryResult {
  return { status: "error", items: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1, actorOptions: [], message };
}
