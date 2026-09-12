"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedAdmin } from "@/lib/auth/authorization";
import type { MaintenanceMaterialActionState } from "@/features/maintenance-materials/types";
import type { Database, Json } from "@/types/database";
import { isLocale } from "@/types/locale";

type MaintenanceMaterialsActionDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      create_maintenance_job_material: {
        Args: {
          p_maintenance_job_id: string;
          p_item_name: string;
          p_category: string;
          p_unit: string;
          p_issued_quantity: number;
        };
        Returns: Json;
      };
      update_maintenance_job_material: {
        Args: {
          p_material_id: string;
          p_item_name: string;
          p_category: string;
          p_unit: string;
          p_issued_quantity: number;
        };
        Returns: Json;
      };
      delete_maintenance_job_material: {
        Args: {
          p_material_id: string;
        };
        Returns: Json;
      };
    };
  };
};

const initialError: MaintenanceMaterialActionState = {
  status: "error",
  code: "action_failed",
};

export async function createMaintenanceJobMaterialAction(
  _previousState: MaintenanceMaterialActionState,
  formData: FormData,
): Promise<MaintenanceMaterialActionState> {
  const context = await parseContext(formData);
  if (!context) return { status: "error", code: "unauthorized" };

  const material = parseMaterialPayload(formData);
  if (!material) return { status: "validation_error", code: "invalid_payload" };

  const supabase =
    context.supabase as SupabaseClient<MaintenanceMaterialsActionDatabase>;
  const { error } = await supabase.rpc("create_maintenance_job_material", {
    p_maintenance_job_id: context.maintenanceJobId,
    p_item_name: material.itemName,
    p_category: material.category,
    p_unit: material.unit,
    p_issued_quantity: material.issuedQuantity,
  });

  if (error) return mapMaterialError(error.message);

  revalidateMaterialPaths(context.locale, context.organizationCode);
  return { status: "success", code: "created" };
}

export async function updateMaintenanceJobMaterialAction(
  _previousState: MaintenanceMaterialActionState,
  formData: FormData,
): Promise<MaintenanceMaterialActionState> {
  const context = await parseContext(formData);
  const materialId = getString(formData, "materialId");
  if (!context || !materialId) return { ...initialError };

  const material = parseMaterialPayload(formData);
  if (!material) return { status: "validation_error", code: "invalid_payload" };

  const supabase =
    context.supabase as SupabaseClient<MaintenanceMaterialsActionDatabase>;
  const { error } = await supabase.rpc("update_maintenance_job_material", {
    p_material_id: materialId,
    p_item_name: material.itemName,
    p_category: material.category,
    p_unit: material.unit,
    p_issued_quantity: material.issuedQuantity,
  });

  if (error) return mapMaterialError(error.message);

  revalidateMaterialPaths(context.locale, context.organizationCode);
  return { status: "success", code: "updated" };
}

export async function deleteMaintenanceJobMaterialAction(
  _previousState: MaintenanceMaterialActionState,
  formData: FormData,
): Promise<MaintenanceMaterialActionState> {
  const context = await parseContext(formData);
  const materialId = getString(formData, "materialId");
  if (!context || !materialId) return { ...initialError };

  const supabase =
    context.supabase as SupabaseClient<MaintenanceMaterialsActionDatabase>;
  const { error } = await supabase.rpc("delete_maintenance_job_material", {
    p_material_id: materialId,
  });

  if (error) return mapMaterialError(error.message);

  revalidateMaterialPaths(context.locale, context.organizationCode);
  return { status: "success", code: "deleted" };
}

async function parseContext(formData: FormData) {
  const locale = getString(formData, "locale");
  const organizationCode = getString(formData, "organizationCode");
  const maintenanceJobId = getString(formData, "maintenanceJobId");

  if (!isLocale(locale) || !organizationCode || !maintenanceJobId) {
    return null;
  }

  const admin = await getAuthenticatedAdmin();
  if (admin.status !== "authorized") return null;

  return {
    locale,
    organizationCode,
    maintenanceJobId,
    supabase: admin.supabase,
  };
}

function parseMaterialPayload(formData: FormData) {
  const itemName = getString(formData, "itemName").trim();
  const category = getString(formData, "category");
  const unit = getString(formData, "unit");
  const issuedQuantity = Number(getString(formData, "issuedQuantity"));

  if (
    !itemName ||
    itemName.length > 160 ||
    (category !== "oil" &&
      category !== "spare_part" &&
      category !== "material") ||
    (unit !== "liter" &&
      unit !== "piece" &&
      unit !== "set" &&
      unit !== "kg" &&
      unit !== "meter" &&
      unit !== "other") ||
    !Number.isFinite(issuedQuantity) ||
    issuedQuantity <= 0
  ) {
    return null;
  }

  return { itemName, category, unit, issuedQuantity };
}

function mapMaterialError(message: string): MaintenanceMaterialActionState {
  if (
    message.includes("INVALID") ||
    message.includes("LOCKED") ||
    message.includes("USED_EXCEEDS") ||
    message.includes("USAGE_ALREADY")
  ) {
    return { status: "validation_error", code: message };
  }

  if (message.includes("FORBIDDEN") || message.includes("AUTH_REQUIRED")) {
    return { status: "error", code: "unauthorized" };
  }

  return { ...initialError };
}

function revalidateMaterialPaths(locale: string, organizationCode: string) {
  revalidatePath(`/${locale}/dashboard/fleet/materials`);
  revalidatePath(
    `/${locale}/dashboard/organizations/${organizationCode}/app-requests/maintenance`,
  );
  revalidatePath(
    `/${locale}/dashboard/organizations/${organizationCode}/app-requests/oil-change`,
  );
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
