"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type {
  MaintenanceInventoryActionState,
  MaintenanceInventoryCategory,
  MaintenanceInventoryRecordType,
  MaintenanceInventoryUnit,
} from "@/features/maintenance-inventory/types";
import type { Database, Json } from "@/types/database";
import { isLocale } from "@/types/locale";

type MaintenanceInventoryActionDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      create_maintenance_inventory_record: {
        Args: {
          p_organization_id: string;
          p_provider_id: string;
          p_item_name: string;
          p_category: string;
          p_record_type: string;
          p_quantity: number;
          p_unit: string;
          p_maintenance_job_id?: string | null;
          p_note?: string | null;
        };
        Returns: Json;
      };
      update_maintenance_inventory_record: {
        Args: {
          p_record_id: string;
          p_item_name: string;
          p_category: string;
          p_record_type: string;
          p_quantity: number;
          p_unit: string;
          p_maintenance_job_id?: string | null;
          p_note?: string | null;
        };
        Returns: Json;
      };
      archive_maintenance_inventory_record: {
        Args: {
          p_record_id: string;
        };
        Returns: Json;
      };
    };
  };
};

const errorState: MaintenanceInventoryActionState = {
  status: "error",
  code: "action_failed",
};

export async function createMaintenanceInventoryRecordAction(
  _previousState: MaintenanceInventoryActionState,
  formData: FormData,
): Promise<MaintenanceInventoryActionState> {
  const context = await parseContext(formData);
  const payload = parseInventoryPayload(formData);

  if (!context) return { status: "error", code: "unauthorized" };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase =
    context.supabase as SupabaseClient<MaintenanceInventoryActionDatabase>;
  const { error } = await supabase.rpc("create_maintenance_inventory_record", {
    p_organization_id: payload.organizationId,
    p_provider_id: payload.providerId,
    p_item_name: payload.itemName,
    p_category: payload.category,
    p_record_type: payload.recordType,
    p_quantity: payload.quantity,
    p_unit: payload.unit,
    p_maintenance_job_id: payload.maintenanceJobId,
    p_note: payload.note,
  });

  if (error) return mapInventoryError(error.message);

  revalidatePath(`/${context.locale}/dashboard/fleet/materials`);
  return { status: "success", code: "created" };
}

export async function updateMaintenanceInventoryRecordAction(
  _previousState: MaintenanceInventoryActionState,
  formData: FormData,
): Promise<MaintenanceInventoryActionState> {
  const context = await parseContext(formData);
  const recordId = getString(formData, "recordId");
  const payload = parseInventoryPayload(formData);

  if (!context || !recordId) return { ...errorState };
  if (!payload) return { status: "validation_error", code: "invalid_payload" };

  const supabase =
    context.supabase as SupabaseClient<MaintenanceInventoryActionDatabase>;
  const { error } = await supabase.rpc("update_maintenance_inventory_record", {
    p_record_id: recordId,
    p_item_name: payload.itemName,
    p_category: payload.category,
    p_record_type: payload.recordType,
    p_quantity: payload.quantity,
    p_unit: payload.unit,
    p_maintenance_job_id: payload.maintenanceJobId,
    p_note: payload.note,
  });

  if (error) return mapInventoryError(error.message);

  revalidatePath(`/${context.locale}/dashboard/fleet/materials`);
  return { status: "success", code: "updated" };
}

export async function archiveMaintenanceInventoryRecordAction(
  _previousState: MaintenanceInventoryActionState,
  formData: FormData,
): Promise<MaintenanceInventoryActionState> {
  const context = await parseContext(formData);
  const recordId = getString(formData, "recordId");

  if (!context || !recordId) return { ...errorState };

  const supabase =
    context.supabase as SupabaseClient<MaintenanceInventoryActionDatabase>;
  const { error } = await supabase.rpc("archive_maintenance_inventory_record", {
    p_record_id: recordId,
  });

  if (error) return mapInventoryError(error.message);

  revalidatePath(`/${context.locale}/dashboard/fleet/materials`);
  return { status: "success", code: "archived" };
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

function parseInventoryPayload(formData: FormData) {
  const organizationId = getString(formData, "organizationId");
  const providerId = getString(formData, "providerId");
  const itemName = getString(formData, "itemName").trim();
  const category = getString(formData, "category");
  const recordType = getString(formData, "recordType");
  const quantity = Number(getString(formData, "quantity"));
  const unit = getString(formData, "unit");
  const maintenanceJobId = nullableString(formData, "maintenanceJobId");
  const note = nullableString(formData, "note");

  if (
    !organizationId ||
    !providerId ||
    !itemName ||
    itemName.length > 160 ||
    !isCategory(category) ||
    !isRecordType(recordType) ||
    !isUnit(unit) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return {
    organizationId,
    providerId,
    itemName,
    category,
    recordType,
    quantity,
    unit,
    maintenanceJobId,
    note,
  };
}

function mapInventoryError(message: string): MaintenanceInventoryActionState {
  if (
    message.includes("INVALID") ||
    message.includes("NOT_FOUND") ||
    message.includes("NOT_AVAILABLE") ||
    message.includes("INVALID_SCOPE")
  ) {
    return { status: "validation_error", code: message };
  }

  if (message.includes("FORBIDDEN") || message.includes("AUTH_REQUIRED")) {
    return { status: "error", code: "unauthorized" };
  }

  return { ...errorState };
}

function isCategory(value: string): value is MaintenanceInventoryCategory {
  return value === "oil" || value === "spare_part" || value === "material";
}

function isRecordType(value: string): value is MaintenanceInventoryRecordType {
  return value === "leftover" || value === "returned";
}

function isUnit(value: string): value is MaintenanceInventoryUnit {
  return (
    value === "liter" ||
    value === "piece" ||
    value === "set" ||
    value === "kg" ||
    value === "meter" ||
    value === "other"
  );
}

function nullableString(formData: FormData, key: string) {
  const value = getString(formData, key).trim();
  return value.length > 0 ? value : null;
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
