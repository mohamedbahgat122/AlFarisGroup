"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  AdminMaintenanceStockMovementType,
  MaintenanceStockActionState,
  MaintenanceStockCategory,
  MaintenanceStockUnit,
} from "@/features/maintenance-stock/types";
import type { Database, Json } from "@/types/database";
import { isLocale } from "@/types/locale";

type MaintenanceStockActionDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      create_maintenance_stock_item: {
        Args: {
          p_organization_id: string;
          p_provider_id: string;
          p_item_name: string;
          p_category: string;
          p_unit: string;
          p_sku?: string | null;
          p_minimum_quantity?: number | null;
        };
        Returns: Json;
      };
      update_maintenance_stock_item: {
        Args: {
          p_item_id: string;
          p_item_name: string;
          p_category: string;
          p_unit: string;
          p_sku?: string | null;
          p_minimum_quantity?: number | null;
        };
        Returns: Json;
      };
      create_maintenance_stock_movement: {
        Args: {
          p_stock_item_id: string;
          p_movement_type: string;
          p_quantity: number;
          p_note?: string | null;
          p_client_submission_id: string;
        };
        Returns: Json;
      };
      archive_maintenance_stock_item: {
        Args: {
          p_item_id: string;
        };
        Returns: Json;
      };
      allocate_maintenance_stock_to_organization: {
        Args: {
          p_stock_item_id: string;
          p_organization_id: string;
          p_quantity: number;
          p_note?: string | null;
          p_client_submission_id: string;
        };
        Returns: Json;
      };
      release_maintenance_stock_from_organization: {
        Args: {
          p_stock_item_id: string;
          p_organization_id: string;
          p_quantity: number;
          p_note?: string | null;
          p_client_submission_id: string;
        };
        Returns: Json;
      };
    };
  };
};

const errorState: MaintenanceStockActionState = {
  status: "error",
  code: "action_failed",
};

export async function createMaintenanceStockItemAction(
  _previousState: MaintenanceStockActionState,
  formData: FormData,
): Promise<MaintenanceStockActionState> {
  const context = await parseContext(formData);
  const payload = parseItemPayload(formData);

  if (!context) return { status: "error", code: "unauthorized" };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase = context.supabase as SupabaseClient<MaintenanceStockActionDatabase>;
  const { error } = await supabase.rpc("create_maintenance_stock_item", {
    p_organization_id: payload.organizationId,
    p_provider_id: payload.providerId,
    p_item_name: payload.itemName,
    p_category: payload.category,
    p_unit: payload.unit,
    p_sku: payload.sku,
    p_minimum_quantity: payload.minimumQuantity,
  });

  if (error) return mapStockError(error.message);

  revalidateStockPath(context.locale);
  return { status: "success", code: "created" };
}

export async function updateMaintenanceStockItemAction(
  _previousState: MaintenanceStockActionState,
  formData: FormData,
): Promise<MaintenanceStockActionState> {
  const context = await parseContext(formData);
  const itemId = getString(formData, "itemId");
  const payload = parseItemPayload(formData, { includeScope: false });

  if (!context || !itemId) return { ...errorState };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase = context.supabase as SupabaseClient<MaintenanceStockActionDatabase>;
  const { error } = await supabase.rpc("update_maintenance_stock_item", {
    p_item_id: itemId,
    p_item_name: payload.itemName,
    p_category: payload.category,
    p_unit: payload.unit,
    p_sku: payload.sku,
    p_minimum_quantity: payload.minimumQuantity,
  });

  if (error) return mapStockError(error.message);

  revalidateStockPath(context.locale);
  return { status: "success", code: "updated" };
}

export async function createMaintenanceStockMovementAction(
  _previousState: MaintenanceStockActionState,
  formData: FormData,
): Promise<MaintenanceStockActionState> {
  const context = await parseContext(formData);
  const payload = parseMovementPayload(formData);

  if (!context) return { status: "error", code: "unauthorized" };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase = context.supabase as SupabaseClient<MaintenanceStockActionDatabase>;
  const { error } = await supabase.rpc("create_maintenance_stock_movement", {
    p_stock_item_id: payload.stockItemId,
    p_movement_type: payload.movementType,
    p_quantity: payload.quantity,
    p_note: payload.note,
    p_client_submission_id: payload.clientSubmissionId,
  });

  if (error) return mapStockError(error.message);

  revalidateStockPath(context.locale);
  return { status: "success", code: "movement_created" };
}

export async function archiveMaintenanceStockItemAction(
  _previousState: MaintenanceStockActionState,
  formData: FormData,
): Promise<MaintenanceStockActionState> {
  const context = await parseContext(formData);
  const itemId = getString(formData, "itemId");

  if (!context || !itemId) return { ...errorState };

  const supabase = context.supabase as SupabaseClient<MaintenanceStockActionDatabase>;
  const { error } = await supabase.rpc("archive_maintenance_stock_item", {
    p_item_id: itemId,
  });

  if (error) return mapStockError(error.message);

  revalidateStockPath(context.locale);
  return { status: "success", code: "archived" };
}

export async function allocateMaintenanceStockToOrganizationAction(
  _previousState: MaintenanceStockActionState,
  formData: FormData,
): Promise<MaintenanceStockActionState> {
  const context = await parseContext(formData);
  const payload = parseAllocationPayload(formData);

  if (!context) return { status: "error", code: "unauthorized" };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase = context.supabase as SupabaseClient<MaintenanceStockActionDatabase>;
  const { error } = await supabase.rpc("allocate_maintenance_stock_to_organization", {
    p_stock_item_id: payload.stockItemId,
    p_organization_id: payload.organizationId,
    p_quantity: payload.quantity,
    p_note: payload.note,
    p_client_submission_id: payload.clientSubmissionId,
  });

  if (error) return mapStockError(error.message);

  revalidateStockPath(context.locale);
  return { status: "success", code: "allocation_created" };
}

export async function releaseMaintenanceStockFromOrganizationAction(
  _previousState: MaintenanceStockActionState,
  formData: FormData,
): Promise<MaintenanceStockActionState> {
  const context = await parseContext(formData);
  const payload = parseAllocationPayload(formData);

  if (!context) return { status: "error", code: "unauthorized" };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase = context.supabase as SupabaseClient<MaintenanceStockActionDatabase>;
  const { error } = await supabase.rpc("release_maintenance_stock_from_organization", {
    p_stock_item_id: payload.stockItemId,
    p_organization_id: payload.organizationId,
    p_quantity: payload.quantity,
    p_note: payload.note,
    p_client_submission_id: payload.clientSubmissionId,
  });

  if (error) return mapStockError(error.message);

  revalidateStockPath(context.locale);
  return { status: "success", code: "allocation_released" };
}

async function parseContext(formData: FormData) {
  const locale = getString(formData, "locale");
  if (!isLocale(locale)) return null;

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return null;

  return {
    locale,
    supabase: admin.supabase,
  };
}

function parseItemPayload(
  formData: FormData,
  options: { includeScope?: boolean } = {},
) {
  const includeScope = options.includeScope ?? true;
  const organizationId = getString(formData, "organizationId");
  const providerId = getString(formData, "providerId");
  const itemName = getString(formData, "itemName").trim();
  const category = getString(formData, "category");
  const unit = getString(formData, "unit");
  const sku = nullableString(formData, "sku");
  const minimumQuantity = nullableNumber(formData, "minimumQuantity");

  if (
    (includeScope && (!organizationId || !providerId)) ||
    !itemName ||
    itemName.length > 160 ||
    !isCategory(category) ||
    !isUnit(unit) ||
    minimumQuantity === false
  ) {
    return null;
  }

  return {
    organizationId,
    providerId,
    itemName,
    category,
    unit,
    sku,
    minimumQuantity,
  };
}

function parseMovementPayload(formData: FormData) {
  const stockItemId = getString(formData, "stockItemId");
  const movementType = getString(formData, "movementType");
  const quantity = Number(getString(formData, "quantity"));
  const note = nullableString(formData, "note");
  const clientSubmissionId = getString(formData, "clientSubmissionId");

  if (
    !stockItemId ||
    !clientSubmissionId ||
    !isAdminMovementType(movementType) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return {
    stockItemId,
    movementType,
    quantity,
    note,
    clientSubmissionId,
  };
}

function parseAllocationPayload(formData: FormData) {
  const stockItemId = getString(formData, "stockItemId");
  const organizationId = getString(formData, "organizationId");
  const quantity = Number(getString(formData, "quantity"));
  const note = nullableString(formData, "note");
  const clientSubmissionId = getString(formData, "clientSubmissionId");

  if (
    !stockItemId ||
    !organizationId ||
    !clientSubmissionId ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return {
    stockItemId,
    organizationId,
    quantity,
    note,
    clientSubmissionId,
  };
}

function mapStockError(message: string): MaintenanceStockActionState {
  if (
    message.includes("INVALID") ||
    message.includes("NOT_FOUND") ||
    message.includes("NOT_AVAILABLE") ||
    message.includes("DUPLICATE") ||
    message.includes("LOCKED") ||
    message.includes("INSUFFICIENT") ||
    message.includes("CONFLICT") ||
    message.includes("ARCHIVE_NON_ZERO") ||
    message.includes("ARCHIVED")
  ) {
    return { status: "validation_error", code: message };
  }

  if (message.includes("FORBIDDEN") || message.includes("AUTH_REQUIRED")) {
    return { status: "error", code: "unauthorized" };
  }

  return { ...errorState };
}

function revalidateStockPath(locale: string) {
  revalidatePath(`/${locale}/dashboard/fleet/materials`);
}

function isCategory(value: string): value is MaintenanceStockCategory {
  return value === "oil" || value === "spare_part" || value === "material";
}

function isUnit(value: string): value is MaintenanceStockUnit {
  return (
    value === "liter" ||
    value === "piece" ||
    value === "set" ||
    value === "kg" ||
    value === "meter" ||
    value === "other"
  );
}

function isAdminMovementType(
  value: string,
): value is AdminMaintenanceStockMovementType {
  return (
    value === "opening_balance" ||
    value === "stock_in" ||
    value === "adjustment_in" ||
    value === "adjustment_out"
  );
}

function nullableString(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  return value.length > 0 ? value : null;
}

function nullableNumber(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return false;

  return parsed;
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
